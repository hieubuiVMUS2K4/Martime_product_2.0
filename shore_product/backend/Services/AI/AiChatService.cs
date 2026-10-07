using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.DTOs;
using ProductApi.Models;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ProductApi.Services.AI
{
    public class AiChatService : IAiChatService
    {
        private readonly AppDbContext _context;
        private readonly IGeminiEvaluationService _geminiService;
        private readonly ILogger<AiChatService> _logger;

        // System prompt template - cấu trúc Container Framework với Chain of Thought và Prompt Constraints
        private const string SYSTEM_PROMPT_TEMPLATE = @"[ROLE]
You are a Senior Systems Analyst and Chief Engineer. You possess deep expertise in telemetry data analysis, anomaly detection, and operational performance evaluation.

[CONTEXT]
You are operating as the core analytical engine within a Shore-Edge synchronization system. You will receive raw JSON data containing today's operational metrics and the historical data from the past several days. Your primary consumer is the shore-based management team who needs actionable insights.
- Today data: {TODAY_DATA}
- Historical summary: {LAST_7DAYS_SUMMARY}
- User Question: {QUESTION}

[TASK]
1. Parse the provided historical JSON data to establish a baseline (e.g., calculate averages, identify min/max thresholds).
2. Compare today's metrics against this established baseline.
3. Identify strictly anomalous behaviors (e.g., efficiency drops, unexpected spikes in consumption or temperature).
4. Provide a clear, actionable evaluation answering the user's question.
KHÔNG đưa ra các lời khuyên chung chung như 'Cần theo dõi thêm' hoặc 'Kiểm tra lại hệ thống'. Lời khuyên phải đi thẳng vào linh kiện hoặc quy trình cụ thể.

[CHAIN OF THOUGHT]
Before generating the final JSON output, you MUST process the data using the following logical steps:
- Step 1: Calculate the average for all numerical metrics in the historical summary.
- Step 2: Compare today's data against the averages. Calculate the percentage difference.
- Step 3: Determine if the difference exceeds normal operational variance (e.g., > 5% deviation).
- Step 4: Formulate the final conclusion based on the most critical deviations.
(You will output this thought process in the ""reasoning_log"" field).

[OUTPUT FORMAT]
You must respond ONLY with a valid, well-formed JSON object. No Markdown blocks, no conversational text.
{
  ""reasoning_log"": ""String: Explain your step-by-step mathematical comparison and logic here."",
  ""severity_level"": ""Normal"" | ""Warning"" | ""Critical"",
  ""identified_anomalies"": [
    ""String: Detailed description of anomaly 1 with exact numbers."",
    ""String: Detailed description of anomaly 2 with exact numbers.""
  ],
  ""actionable_recommendation_vi"": ""String: A precise, highly technical recommendation in Vietnamese for the management team, directly addressing the user question.""
}";

        private class AiAnalysisResult
        {
            [JsonPropertyName("reasoning_log")]
            public string ReasoningLog { get; set; } = string.Empty;

            [JsonPropertyName("severity_level")]
            public string SeverityLevel { get; set; } = string.Empty;

            [JsonPropertyName("identified_anomalies")]
            public List<string> IdentifiedAnomalies { get; set; } = new();

            [JsonPropertyName("actionable_recommendation_vi")]
            public string ActionableRecommendationVi { get; set; } = string.Empty;
        }

        public AiChatService(AppDbContext context, IGeminiEvaluationService geminiService, ILogger<AiChatService> logger)
        {
            _context = context;
            _geminiService = geminiService;
            _logger = logger;
        }

        public async Task<AiChatResponse> ChatAsync(AiChatRequest request, CancellationToken token)
        {
            try
            {
                // Xác định khoảng thời gian: dùng từ request hoặc mặc định 30 ngày gần nhất
                var toDate = request.ToDate ?? DateTime.UtcNow;
                var maxDaysBack = 30;
                var defaultFromDate = toDate.AddDays(-maxDaysBack);
                var fromDate = request.FromDate ?? defaultFromDate;

                // Nếu FromDate quá xa (>30 ngày), giới hạn lại
                if ((toDate - fromDate).TotalDays > maxDaysBack)
                {
                    fromDate = toDate.AddDays(-maxDaysBack);
                    _logger.LogWarning($"Date range exceeded {maxDaysBack} days, limiting to {maxDaysBack} days");
                }

                var reportsQuery = _context.NoonReports.AsQueryable();

                // Nếu có VesselId, join với MaritimeReport để filter
                if (request.VesselId.HasValue)
                {
                    reportsQuery = from nr in _context.NoonReports
                                   join mr in _context.Set<MaritimeReport>() on nr.MaritimeReportId equals mr.Id
                                   where mr.VoyageId != null
                                   select nr;
                }

                var reports = await reportsQuery
                    .Where(r => r.ReportDate >= fromDate && r.ReportDate <= toDate)
                    .OrderByDescending(r => r.ReportDate)
                    .Select(r => new
                    {
                        r.ReportDate,
                        r.MainEngineRPM,
                        r.SpeedOverGround,
                        r.FuelOilConsumed,
                        r.DieselOilConsumed,
                        r.FuelOilROB,
                        r.DieselOilROB,
                        r.WeatherConditions,
                        r.SeaState,
                        r.OperationalRemarks,
                        r.MachineryRemarks
                    })
                    .ToListAsync(token);

                if (reports.Count == 0)
                {
                    return new AiChatResponse
                    {
                        Success = false,
                        Answer = $"Không tìm thấy dữ liệu báo cáo từ {fromDate:dd/MM/yyyy} đến {toDate:dd/MM/yyyy}."
                    };
                }

                // Rút gọn ngữ cảnh và format dữ liệu
                var todayData = reports.FirstOrDefault();
                var compressedContext = CompressContext(reports.Cast<dynamic>().ToList());

                var todayJson = todayData != null 
                    ? JsonSerializer.Serialize(todayData, new JsonSerializerOptions { WriteIndented = false })
                    : "Chưa có";

                // Xây dựng prompt từ template
                string finalPrompt = BuildOptimizedPrompt(
                    request.Question,
                    todayJson,
                    compressedContext);

                _logger.LogInformation($"AI Chat - Period: {fromDate:dd/MM/yyyy} to {toDate:dd/MM/yyyy}, Reports: {reports.Count}, Prompt size: {finalPrompt.Length}");

                // Gọi API
                var geminiResult = await _geminiService.ChatWithReportsAsync(request.Question, finalPrompt, token);

                if (!geminiResult.Success)
                {
                    return new AiChatResponse
                    {
                        Success = false,
                        Answer = geminiResult.Content,
                        ErrorSource = geminiResult.ErrorSource,
                        RetryAfterSeconds = geminiResult.RetryAfterSeconds,
                        Sources = "Gemini API"
                    };
                }

                // Lưu kết quả vào DB
                SaveAiEvaluation(request.VesselId, request.Question, geminiResult.Content);

                string finalAnswer = geminiResult.Content;
                try
                {
                    var resultContent = geminiResult.Content.Trim();
                    if (resultContent.StartsWith("```json"))
                    {
                        resultContent = resultContent.Substring(7);
                        if (resultContent.EndsWith("```")) resultContent = resultContent.Substring(0, resultContent.Length - 3);
                        resultContent = resultContent.Trim();
                    }
                    
                    var analysis = JsonSerializer.Deserialize<AiAnalysisResult>(resultContent, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    
                    if (analysis != null)
                    {
                        var answerLines = new List<string>
                        {
                            $"**Mức độ nghiêm trọng:** {analysis.SeverityLevel}\n"
                        };

                        if (analysis.IdentifiedAnomalies != null && analysis.IdentifiedAnomalies.Count > 0)
                        {
                            answerLines.Add("**Các bất thường phát hiện:**");
                            foreach(var anomaly in analysis.IdentifiedAnomalies)
                            {
                                answerLines.Add($"- {anomaly}");
                            }
                            answerLines.Add("\n");
                        }

                        answerLines.Add("**Khuyến nghị hành động:**");
                        answerLines.Add(analysis.ActionableRecommendationVi);
                        
                        finalAnswer = string.Join("\n", answerLines);
                    }
                }
                catch (Exception parseEx)
                {
                    _logger.LogWarning(parseEx, "Failed to parse AI JSON response, returning raw content.");
                }

                return new AiChatResponse
                {
                    Answer = finalAnswer,
                    Sources = $"Phân tích dựa trên {reports.Count} báo cáo từ {reports.Last().ReportDate:dd/MM/yyyy} đến {reports.First().ReportDate:dd/MM/yyyy}",
                    Success = true
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in AI chat service");
                return new AiChatResponse
                {
                    Success = false,
                    Answer = "Có lỗi xảy ra trong quá trình xử lý yêu cầu. Vui lòng thử lại sau."
                };
            }
        }

        /// <summary>
        /// Rút gọn ngữ cảnh bằng cách so sánh dữ liệu 7 ngày
        /// Chỉ giữ lại những thông số có sự thay đổi đáng chú ý
        /// </summary>
        private string CompressContext(List<dynamic> reports)
        {
            if (reports.Count < 1) return "Dữ liệu không đủ để phân tích";

            dynamic latest = reports[0];
            dynamic oldest = reports.Count > 1 ? reports[reports.Count - 1] : latest;

            var metrics = new
            {
                engineRPM = new
                {
                    current = latest.MainEngineRPM,
                    previous = oldest.MainEngineRPM
                },
                speed = new
                {
                    current = latest.SpeedOverGround,
                    previous = oldest.SpeedOverGround
                },
                fuel = new
                {
                    totalConsumed = reports.Sum(r => (double?)(r.FuelOilConsumed ?? 0) ?? 0),
                    remaining = latest.FuelOilROB
                },
                weather = latest.WeatherConditions,
                sea_state = latest.SeaState
            };

            return JsonSerializer.Serialize(metrics, new JsonSerializerOptions { WriteIndented = true });
        }

        /// <summary>
        /// Xây dựng prompt tối ưu từ template cố định + dữ liệu
        /// </summary>
        private string BuildOptimizedPrompt(string question, string todayData, string compressedContext)
        {
            return SYSTEM_PROMPT_TEMPLATE
                .Replace("{TODAY_DATA}", todayData)
                .Replace("{LAST_7DAYS_SUMMARY}", compressedContext)
                .Replace("{QUESTION}", question);
        }

        /// <summary>
        /// Lưu kết quả AI evaluation vào DB
        /// </summary>
        private void SaveAiEvaluation(Guid? vesselId, string question, string answer)
        {
            try
            {
                // Nếu bạn có bảng AiEvaluation, hãy lưu kết quả tại đây
                // Ví dụ:
                // var evaluation = new AiEvaluation
                // {
                //     VesselId = vesselId,
                //     Question = question,
                //     Answer = answer,
                //     CreatedAt = DateTime.UtcNow
                // };
                // _context.AiEvaluations.Add(evaluation);
                // _context.SaveChanges();

                _logger.LogInformation($"AI evaluation completed for vessel {vesselId}");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to save AI evaluation");
            }
        }
    }
}
