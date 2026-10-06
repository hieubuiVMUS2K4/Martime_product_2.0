using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.DTOs;
using ProductApi.Models;
using ProductApi.Services.AI.Caching;
using ProductApi.Services.AI.Conversation;
using ProductApi.Services.AI.Analysis;
using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace ProductApi.Services.AI
{
    /// <summary>
    /// Enhanced AI Chat Service with caching, conversation history, and semantic analysis
    /// </summary>
    public class AiChatServiceV2 : IAiChatService
    {
        private const string PromptCacheVersion = "prompt-v4";
        private const string ContextCacheVersion = "context-v1";

        private readonly AppDbContext _context;
        private readonly IGeminiEvaluationService _geminiService;
        private readonly IAiCacheService _cacheService;
        private readonly IConversationHistoryService _conversationService;
        private readonly ISemanticAnalysisService _semanticService;
        private readonly ILogger<AiChatServiceV2> _logger;

        private sealed class AnomalyDayInfo
        {
            public DateTime Date { get; set; }
            public double Speed { get; set; }
            public double Rpm { get; set; }
            public double Fuel { get; set; }
            public double Score { get; set; }
            public List<string> Reasons { get; set; } = new();
        }

        private sealed class ContextBundle
        {
            public string TrendData { get; set; } = string.Empty;
            public string AnomalyDayBrief { get; set; } = string.Empty;
        }

        // Structured prompt with anti-repetition rules and explicit anomaly-day output.
        private const string ENHANCED_SYSTEM_PROMPT = @"Bạn là chuyên gia phân tích dữ liệu vận hành tàu biển.

    NGUYÊN TẮC BẮT BUỘC & KỸ NĂNG PHÂN TÍCH CHUYÊN SÂU:
    1. QUAN TRỌNG NHẤT: Bắt buộc tận dụng dữ liệu Bảo trì (PMS), Cảnh báo (Alerts) và Chứng chỉ (Certificates) trong mọi lượt chat. KHÔNG CHỈ nhìn vào tốc độ/nhiên liệu.
    2. NẾU THÔNG SỐ HOẠT ĐỘNG = 0 (tàu đang neo/nằm bờ): Lập tức chuyển trọng tâm phân tích sang rủi ro an toàn từ Cảnh báo đang Active, số lượng công việc Bảo trì đang tồn đọng (thời gian nằm bờ là lúc lý tưởng đề xuất bảo trì).
    3. TÍNH LIÊN KẾT NHÂN QUẢ (Correlation): 
       - Nếu có cảnh báo động cơ (VD: High temperature), hãy liên hệ với mức tiêu hao nhiên liệu/RPM cao bất thường.
       - Cảnh báo hoặc bảo trì quá hạn tiềm ẩn nguy cơ chậm trễ ETA như thế nào?
    4. Tính minh bạch: Chỉ dùng số liệu có; thiếu dữ liệu hệ thống thì phải nêu rõ. Không lặp đoạn văn trước.
    5. Phát hiện ngày bất thường (nếu hỏi): Liệt kê chi tiết ngày (dd/MM), biến động số liệu và dự đoán nguyên nhân kết hợp với Cảnh báo trong ngày đó.

    NGỮ CẢNH DỮ LIỆU:
    - Hôm nay (Noon Report + Dashboard PMS, Alerts, Chứng chỉ): {TODAY_DATA}
    - Tổng quan 30 ngày: {TREND_DATA}
    - Nhóm câu hỏi người dùng hay hỏi: {COMMON_QUESTION_PATTERNS}
    - Ngữ cảnh hội thoại: {CONVERSATION_CONTEXT}

    LOẠI PHÂN TÍCH: {ANALYSIS_TYPE}
    CÂU HỎI: {QUESTION}

    ĐỊNH DẠNG TRẢ LỜI BẮT BUỘC:
    1) Tóm tắt Tình hình Hiện tại (Hải trình, Bảo trì, Cảnh báo nổi cộm)
    2) Phân tích sức khỏe Động cơ & Cảnh báo song song
    3) Đánh giá Tuân thủ (Chứng chỉ sắp hết hạn) & Kế hoạch bảo trì
    4) Rủi ro tiềm ẩn (ETA, Vật tư, Thời tiết) & Nguyên nhân nhân quả
    5) Khuyến nghị Hành động cấp bách

    DANH SÁCH NGÀY BẤT THƯỜNG ƯU TIÊN:
    {ANOMALY_DAY_BRIEF}

    ĐỘ SÂU BẮT BUỘC: {DEPTH_DIRECTIVE}

    [DEPTH_CONFIGURED]
    Viết bằng tiếng Việt, rõ ràng, có số liệu cụ thể, không lan man.";

        public AiChatServiceV2(
            AppDbContext context,
            IGeminiEvaluationService geminiService,
            IAiCacheService cacheService,
            IConversationHistoryService conversationService,
            ISemanticAnalysisService semanticService,
            ILogger<AiChatServiceV2> logger)
        {
            _context = context;
            _geminiService = geminiService;
            _cacheService = cacheService;
            _conversationService = conversationService;
            _semanticService = semanticService;
            _logger = logger;
        }

        public async Task<AiChatResponse> ChatAsync(AiChatRequest request, CancellationToken token)
        {
            var stopwatch = Stopwatch.StartNew();
            var metrics = new ResponseMetrics();

            try
            {
                // Step 1: Detect intent
                var (intent, intentConfidence) = _semanticService.DetectIntent(request.Question);
                _logger.LogInformation($"Intent detected: {intent} (confidence: {intentConfidence:P})");

                // Step 2: Check cache
                var cacheKey = _cacheService.GenerateQuestionHash(
                    $"{PromptCacheVersion}:{request.Question}",
                    request.VesselId,
                    request.FromDate,
                    request.ToDate);

                var cachedResponse = await _cacheService.GetAsync<AiChatResponse>(cacheKey);
                if (cachedResponse != null && intentConfidence > 0.7)
                {
                    cachedResponse.IsCached = true;
                    cachedResponse.Metrics = new ResponseMetrics { TotalResponseMs = stopwatch.ElapsedMilliseconds };
                    _logger.LogInformation($"Cache HIT - Returning cached response in {stopwatch.ElapsedMilliseconds}ms");
                    return cachedResponse;
                }

                // Step 3: Build conversation context
                var conversationContext = string.Empty;
                if (!string.IsNullOrEmpty(request.SessionId))
                {
                    conversationContext = await _conversationService.BuildContextFromHistoryAsync(request.SessionId);
                }

                // Step 4: Fetch data (optimized queries)
                var (normalizedFromDate, normalizedToDate) = NormalizeDateRange(request.FromDate, request.ToDate);

                var dbStopwatch = Stopwatch.StartNew();
                var (reports, todayData, extraContext) = await FetchOptimizedReportsAsync(request, token);
                dbStopwatch.Stop();
                metrics.DatabaseQueryMs = dbStopwatch.ElapsedMilliseconds;

                if (reports.Count == 0)
                {
                    var errorResponse = new AiChatResponse
                    {
                        Success = false,
                        Answer = $"Không tìm thấy dữ liệu báo cáo. Vui lòng kiểm tra lại khoảng thời gian.",
                        Confidence = 0.0,
                        Metrics = metrics
                    };

                    return errorResponse;
                }

                metrics.DataPointsAnalyzed = reports.Count;

                // Step 5: Build enhanced context
                var contextStopwatch = Stopwatch.StartNew();
                var contextCacheKey = _cacheService.GenerateQuestionHash(
                    $"{ContextCacheVersion}:{request.VesselId}:{normalizedFromDate:yyyyMMdd}:{normalizedToDate:yyyyMMdd}",
                    request.VesselId,
                    normalizedFromDate,
                    normalizedToDate);

                var contextBundle = await _cacheService.GetAsync<ContextBundle>(contextCacheKey);
                if (contextBundle == null)
                {
                    contextBundle = new ContextBundle
                    {
                        TrendData = BuildAdvancedContext(reports),
                        AnomalyDayBrief = BuildAnomalyDayBrief(reports)
                    };

                    await _cacheService.SetAsync(contextCacheKey, contextBundle, TimeSpan.FromMinutes(20));
                }

                var trendData = contextBundle.TrendData;
                var anomalyDayBrief = contextBundle.AnomalyDayBrief;
                var commonQuestionPatterns = BuildCommonQuestionPatterns();
                var depthDirective = BuildDepthDirective(request, intent);
                var todayJson = todayData != null 
                    ? JsonSerializer.Serialize(todayData, new JsonSerializerOptions { WriteIndented = false })
                    : "Chưa có dữ liệu hôm nay";
                contextStopwatch.Stop();
                metrics.ContextBuildingMs = contextStopwatch.ElapsedMilliseconds;

                // Step 6: Build optimized prompt
                var analyzisType = GetAnalysisType(intent);
                var finalPrompt = BuildAdvancedPrompt(
                    request.Question,
                    todayJson,
                    trendData,
                    commonQuestionPatterns,
                    anomalyDayBrief,
                    depthDirective,
                    conversationContext,
                    analyzisType);

                _logger.LogDebug($"Prompt built - Size: {finalPrompt.Length} chars, Context: {analyzisType}");

                // Step 7: Call Gemini API
                var apiStopwatch = Stopwatch.StartNew();
                var geminiResult = await _geminiService.ChatWithReportsAsync(request.Question, finalPrompt, token);
                apiStopwatch.Stop();
                metrics.ApiCallMs = apiStopwatch.ElapsedMilliseconds;

                if (!geminiResult.Success)
                {
                    return new AiChatResponse
                    {
                        Success = false,
                        Answer = geminiResult.Content,
                        ErrorSource = geminiResult.ErrorSource,
                        RetryAfterSeconds = geminiResult.RetryAfterSeconds,
                        Sources = "Gemini API",
                        Confidence = 0.0,
                        DetectedIntent = intent,
                        Metrics = new ResponseMetrics
                        {
                            DatabaseQueryMs = metrics.DatabaseQueryMs,
                            ContextBuildingMs = metrics.ContextBuildingMs,
                            ApiCallMs = metrics.ApiCallMs,
                            DataPointsAnalyzed = metrics.DataPointsAnalyzed,
                            TotalResponseMs = stopwatch.ElapsedMilliseconds
                        }
                    };
                }

                // Step 8: Build response with metadata
                var enhancedResponse = new AiChatResponse
                {
                    Answer = BuildFinalAnswer(geminiResult.Content, request.Question, intent, anomalyDayBrief),
                    Sources = $"Phân tích từ {reports.Count} báo cáo ({reports.Last().ReportDate:dd/MM} → {reports.First().ReportDate:dd/MM})",
                    Success = true,
                    Confidence = Math.Min(1.0, intentConfidence + 0.3), // Boost confidence if intent detected
                    DetectedIntent = intent,
                    FollowUpQuestions = GenerateFollowUpQuestions(intent, request.Question),
                    Metrics = new ResponseMetrics
                    {
                        DatabaseQueryMs = metrics.DatabaseQueryMs,
                        ContextBuildingMs = metrics.ContextBuildingMs,
                        ApiCallMs = metrics.ApiCallMs,
                        DataPointsAnalyzed = metrics.DataPointsAnalyzed,
                        TotalResponseMs = stopwatch.ElapsedMilliseconds
                    }
                };

                // Step 9: Cache result
                await _cacheService.SetAsync(cacheKey, enhancedResponse, TimeSpan.FromHours(1));

                // Step 10: Save to conversation history
                if (!string.IsNullOrEmpty(request.SessionId))
                {
                    await _conversationService.SaveMessageAsync(request.SessionId, 
                        new ConversationMessage { Role = "user", Content = request.Question });
                    await _conversationService.SaveMessageAsync(request.SessionId,
                        new ConversationMessage { Role = "assistant", Content = enhancedResponse.Answer });
                }

                _logger.LogInformation($"Chat completed in {stopwatch.ElapsedMilliseconds}ms (DB: {metrics.DatabaseQueryMs}ms, Context: {metrics.ContextBuildingMs}ms, API: {metrics.ApiCallMs}ms)");

                return enhancedResponse;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in AI chat service");
                return new AiChatResponse
                {
                    Success = false,
                    Answer = "Có lỗi xảy ra. Vui lòng thử lại sau."
                };
            }
        }

        /// <summary>
        /// Fetch reports with optimized query - only necessary fields
        /// </summary>
        private async Task<(List<dynamic> reports, dynamic? todayData, dynamic? extraContext)> FetchOptimizedReportsAsync(AiChatRequest request, CancellationToken token)
        {
            var toDate = request.ToDate ?? DateTime.UtcNow;
            var maxDaysBack = 30;
            var fromDate = request.FromDate ?? toDate.AddDays(-maxDaysBack);

            if ((toDate - fromDate).TotalDays > maxDaysBack)
            {
                fromDate = toDate.AddDays(-maxDaysBack);
            }

            var query = _context.NoonReports
                .AsNoTracking()
                .AsQueryable();

            dynamic? extraContext = null;

            if (request.VesselId.HasValue)
            {
                var vessel = await _context.Vessels
                    .AsNoTracking()
                    .Where(v => v.Id == request.VesselId.Value)
                    .Select(v => new { v.IMO })
                    .FirstOrDefaultAsync(token);

                if (vessel == null || string.IsNullOrWhiteSpace(vessel.IMO))
                {
                    return (new List<dynamic>(), null, null);
                }

                var origins = await ProductApi.Services.Sync.VesselSyncIdentity.HistoricalOriginsAsync(_context, request.VesselId.Value);
                var vesselMaritimeReportIds = _context.Set<MaritimeReport>()
                    .AsNoTracking()
                    .Where(mr =>
                        origins.Contains(mr.OriginNode)
                        || (mr.VoyageId.HasValue
                            && _context.VoyageRecords.AsNoTracking().Any(vr => vr.Id == mr.VoyageId.Value && vr.VesselIMO == vessel.IMO)))
                    .Select(mr => mr.Id);

                query = query.Where(nr => vesselMaritimeReportIds.Contains(nr.MaritimeReportId));

                // Fetch extra dashboard context
                var now = DateTime.UtcNow;
                var thirtyDaysFromNow = now.AddDays(30);
                
                var overduePms = await _context.MaintenanceTasks.CountAsync(t => t.VesselId == request.VesselId && t.Status == "OVERDUE", token);
                var inProgressPms = await _context.MaintenanceTasks.CountAsync(t => t.VesselId == request.VesselId && t.Status == "IN_PROGRESS", token);
                var criticalDuePms = await _context.MaintenanceTasks.CountAsync(t => t.VesselId == request.VesselId && t.Priority == "CRITICAL" && t.NextDueAt <= thirtyDaysFromNow && t.Status == "SCHEDULED", token);
                
                var activeAlertsCount = await _context.VesselAlerts.CountAsync(a => a.VesselId == request.VesselId && !a.IsAcknowledged, token);
                var activeAlertsDetails = await _context.VesselAlerts
                    .AsNoTracking()
                    .Where(a => a.VesselId == request.VesselId && !a.IsAcknowledged)
                    .Select(a => a.Message)
                    .Take(5)
                    .ToListAsync(token);
                
                var expiringCertificatesCount = await _context.VesselCertificates.CountAsync(c => c.VesselId == request.VesselId && c.ExpiryDate <= thirtyDaysFromNow && c.ExpiryDate > now, token);
                
                extraContext = new {
                    PmsSummary = new { Overdue = overduePms, InProgress = inProgressPms, CriticalDueSoon = criticalDuePms },
                    Alerts = new { ActiveCount = activeAlertsCount, Details = activeAlertsDetails },
                    Certificates = new { ExpiringIn30Days = expiringCertificatesCount }
                };
            }

            // Select only necessary fields to reduce memory usage
            var reports = await query
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
                    r.DistanceTraveled,
                    r.DistanceToGo,
                    r.EstimatedTimeOfArrival,
                    r.WeatherConditions,
                    r.SeaState,
                    r.SafetyIncidents,
                    r.SafetyDrillsConducted,
                    r.OperationalRemarks,
                    r.MachineryRemarks
                })
                .ToListAsync(token);

            var todayData = reports.FirstOrDefault();

            var combinedTodayData = new
            {
                NoonReport = todayData,
                DashboardAlertsAndMaintenance = extraContext
            };

            return (reports.Cast<dynamic>().ToList(), combinedTodayData, extraContext);
        }

        /// <summary>
        /// Build advanced context with trend analysis and anomaly detection
        /// </summary>
        private string BuildAdvancedContext(List<dynamic> reports)
        {
            if (reports.Count < 1) return "Dữ liệu không đủ";

            dynamic latest = reports[0];
            dynamic oldest = reports.Count > 1 ? reports[reports.Count - 1] : latest;

            // Calculate trends with 30-day priority context
            double fuelRecent = reports.Take(7).Sum(r => (double?)(r.FuelOilConsumed ?? 0) ?? 0);
            double fuelOld = reports.Skip(7).Take(7).Sum(r => (double?)(r.FuelOilConsumed ?? 0) ?? 0);
            var fuelTrend = fuelOld > 0 ? ((fuelRecent - fuelOld) / fuelOld * 100) : 0;

            double speedRecent = reports.Take(7).Average(r => (double?)(r.SpeedOverGround ?? 0) ?? 0);
            double speedOld = reports.Skip(7).Count() > 0 ? reports.Skip(7).Average(r => (double?)(r.SpeedOverGround ?? 0) ?? 0) : speedRecent;
            var speedDifference = speedRecent - speedOld;

            var windowDays = Math.Min(30, reports.Count);
            var reports30 = reports.Take(windowDays).ToList();
            var fuel30Total = reports30.Sum(r => (double?)(r.FuelOilConsumed ?? 0) ?? 0);
            var diesel30Total = reports30.Sum(r => (double?)(r.DieselOilConsumed ?? 0) ?? 0);
            var speed30Avg = reports30.Average(r => (double?)(r.SpeedOverGround ?? 0) ?? 0);
            var rpm30Avg = reports30.Average(r => (double?)(r.MainEngineRPM ?? 0) ?? 0);
            var distance30Total = reports30.Sum(r => (double?)(r.DistanceTraveled ?? 0) ?? 0);

            var fuelPerNm = distance30Total > 0 ? fuel30Total / distance30Total : 0;
            var dieselPerNm = distance30Total > 0 ? diesel30Total / distance30Total : 0;

            var latestFuelRob = (double?)(latest.FuelOilROB ?? 0) ?? 0;
            var latestDieselRob = (double?)(latest.DieselOilROB ?? 0) ?? 0;
            var fuelDailyAvg = windowDays > 0 ? fuel30Total / windowDays : 0;
            var dieselDailyAvg = windowDays > 0 ? diesel30Total / windowDays : 0;
            var fuelRobDays = fuelDailyAvg > 0 ? latestFuelRob / fuelDailyAvg : 0;
            var dieselRobDays = dieselDailyAvg > 0 ? latestDieselRob / dieselDailyAvg : 0;

            var anomalyDays = DetectAnomalyDays(reports30);

            var context = new
            {
                period = $"{oldest.ReportDate:dd/MM} → {latest.ReportDate:dd/MM}",
                window_days = windowDays,
                total_reports = reports.Count,
                summary_30days = new
                {
                    fuel_total = fuel30Total,
                    diesel_total = diesel30Total,
                    distance_total = distance30Total,
                    avg_speed = speed30Avg,
                    avg_rpm = rpm30Avg
                },
                business_kpi = new
                {
                    fuel_per_nm = fuelPerNm,
                    diesel_per_nm = dieselPerNm,
                    fuel_rob_days = fuelRobDays,
                    diesel_rob_days = dieselRobDays,
                    eta = latest.EstimatedTimeOfArrival,
                    distance_to_go = latest.DistanceToGo
                },
                engine = new
                {
                    current_rpm = latest.MainEngineRPM,
                    rpm_change = latest.MainEngineRPM - oldest.MainEngineRPM
                },
                speed = new
                {
                    current_sog = latest.SpeedOverGround,
                    avg_7days = speedRecent,
                    difference = speedDifference
                },
                fuel = new
                {
                    current_rob = latest.FuelOilROB,
                    daily_avg = fuelRecent / Math.Max(7, reports.Take(7).Count()),
                    trend_percent = fuelTrend,
                    status = fuelTrend > 10 ? "⚠️ Tăng vọt" : (fuelTrend < -10 ? "✓ Giảm tốt" : "→ Bình thường")
                },
                weather = latest.WeatherConditions,
                sea_state = latest.SeaState,
                safety = new
                {
                    incidents = latest.SafetyIncidents,
                    drills = latest.SafetyDrillsConducted
                },
                warnings = DetectAnomalies(reports),
                anomaly_days = anomalyDays
            };

            return JsonSerializer.Serialize(context, new JsonSerializerOptions { WriteIndented = true });
        }

        /// <summary>
        /// Detect anomalies in data
        /// </summary>
        private List<string> DetectAnomalies(List<dynamic> reports)
        {
            var anomalies = new List<string>();

            if (reports.Count < 2) return anomalies;

            dynamic latest = reports[0];
            dynamic prev = reports[1];

            // RPM anomaly
            var rpmChange = Math.Abs((double)(latest.MainEngineRPM ?? 0) - (double)(prev.MainEngineRPM ?? 0));
            if (rpmChange > 50)
                anomalies.Add($"RPM thay đổi {rpmChange:F0}");

            // Speed anomaly
            var speedChange = Math.Abs((double)(latest.SpeedOverGround ?? 0) - (double)(prev.SpeedOverGround ?? 0));
            if (speedChange > 2)
                anomalies.Add($"Tốc độ thay đổi {speedChange:F1} knots");

            // Fuel anomaly
            var fuelChange = (double)(latest.FuelOilConsumed ?? 0);
            if (fuelChange > 50)
                anomalies.Add("Tiêu hao dầu cao");

            return anomalies;
        }

        private List<object> DetectAnomalyDays(List<dynamic> reports)
        {
            return AnalyzeAnomalyDays(reports)
                .Select(day => (object)new
                {
                    date = day.Date.ToString("dd/MM"),
                    speed = day.Speed,
                    rpm = day.Rpm,
                    fuel = day.Fuel,
                    score = day.Score,
                    reasons = day.Reasons
                })
                .ToList();
        }

        private List<AnomalyDayInfo> AnalyzeAnomalyDays(List<dynamic> reports)
        {
            var days = new List<AnomalyDayInfo>();

            if (reports.Count < 3)
            {
                return days;
            }

            var avgSpeed = reports.Average(r => (double?)(r.SpeedOverGround ?? 0) ?? 0);
            var avgRpm = reports.Average(r => (double?)(r.MainEngineRPM ?? 0) ?? 0);
            var avgFuel = reports.Average(r => (double?)(r.FuelOilConsumed ?? 0) ?? 0);

            var stdSpeed = StandardDeviation(reports.Select(r => (double?)(r.SpeedOverGround ?? 0) ?? 0));
            var stdRpm = StandardDeviation(reports.Select(r => (double?)(r.MainEngineRPM ?? 0) ?? 0));
            var stdFuel = StandardDeviation(reports.Select(r => (double?)(r.FuelOilConsumed ?? 0) ?? 0));

            foreach (var report in reports)
            {
                var speed = (double?)(report.SpeedOverGround ?? 0) ?? 0;
                var rpm = (double?)(report.MainEngineRPM ?? 0) ?? 0;
                var fuel = (double?)(report.FuelOilConsumed ?? 0) ?? 0;

                var reasons = new List<string>();
                var score = 0d;

                if (stdSpeed > 0 && Math.Abs(speed - avgSpeed) > 2 * stdSpeed)
                {
                    reasons.Add($"Speed lệch mạnh ({speed:F2} vs avg {avgSpeed:F2})");
                    score += Math.Abs(speed - avgSpeed) / stdSpeed;
                }

                if (stdRpm > 0 && Math.Abs(rpm - avgRpm) > 2 * stdRpm)
                {
                    reasons.Add($"RPM lệch mạnh ({rpm:F0} vs avg {avgRpm:F0})");
                    score += Math.Abs(rpm - avgRpm) / stdRpm;
                }

                if (stdFuel > 0 && Math.Abs(fuel - avgFuel) > 2 * stdFuel)
                {
                    reasons.Add($"Fuel lệch mạnh ({fuel:F2} vs avg {avgFuel:F2})");
                    score += Math.Abs(fuel - avgFuel) / stdFuel;
                }

                if (fuel > avgFuel * 1.8)
                {
                    reasons.Add("Fuel tăng đột biến > 80% so với trung bình");
                    score += 1.5;
                }

                if (speed > avgSpeed * 1.6)
                {
                    reasons.Add("Tốc độ tăng đột biến > 60% so với trung bình");
                    score += 1.2;
                }

                if (reasons.Count == 0)
                {
                    continue;
                }

                days.Add(new AnomalyDayInfo
                {
                    Date = (DateTime)report.ReportDate,
                    Speed = speed,
                    Rpm = rpm,
                    Fuel = fuel,
                    Score = score,
                    Reasons = reasons
                });
            }

            return days
                .OrderByDescending(d => d.Score)
                .Take(8)
                .ToList();
        }

        private static double StandardDeviation(IEnumerable<double> values)
        {
            var data = values.ToList();
            if (data.Count <= 1)
            {
                return 0;
            }

            var mean = data.Average();
            var variance = data.Sum(v => Math.Pow(v - mean, 2)) / data.Count;

            return Math.Sqrt(variance);
        }

        /// <summary>
        /// Get analysis type based on intent
        /// </summary>
        private string GetAnalysisType(string intent) => intent switch
        {
            "fuel_analysis" => "Phân tích tiêu hao dầu chi tiết",
            "fuel_efficiency" => "Phân tích suất tiêu hao và hiệu suất nhiên liệu",
            "speed_analysis" => "Phân tích tốc độ tàu",
            "engine_status" => "Đánh giá tình trạng máy chính",
            "weather_impact" => "Ảnh hưởng thời tiết đến vận hành",
            "anomaly_detection" => "Phát hiện bất thường",
            "trend_analysis" => "Phân tích xu hướng",
            "eta_voyage_risk" => "Đánh giá rủi ro hành trình và ETA",
            "safety_compliance" => "Đánh giá an toàn và tuân thủ",
            "maintenance_material_risk" => "Đánh giá rủi ro bảo trì và vật tư",
            _ => "Phân tích chung"
        };

        /// <summary>
        /// Build advanced prompt with context and examples
        /// </summary>
        private string BuildAdvancedPrompt(string question, string todayData, string trendData, string commonQuestionPatterns, string anomalyDayBrief, string depthDirective, string conversationContext, string analysisType)
        {
            return ENHANCED_SYSTEM_PROMPT
                .Replace("{TODAY_DATA}", todayData)
                .Replace("{TREND_DATA}", trendData)
                .Replace("{COMMON_QUESTION_PATTERNS}", commonQuestionPatterns)
                .Replace("{ANOMALY_DAY_BRIEF}", anomalyDayBrief)
                .Replace("{DEPTH_DIRECTIVE}", depthDirective)
                .Replace("{CONVERSATION_CONTEXT}", conversationContext)
                .Replace("{QUESTION}", question)
                .Replace("{ANALYSIS_TYPE}", analysisType);
        }

        private static (DateTime FromDate, DateTime ToDate) NormalizeDateRange(DateTime? fromDate, DateTime? toDate)
        {
            var normalizedTo = toDate ?? DateTime.UtcNow;
            var normalizedFrom = fromDate ?? normalizedTo.AddDays(-30);

            if ((normalizedTo - normalizedFrom).TotalDays > 30)
            {
                normalizedFrom = normalizedTo.AddDays(-30);
            }

            return (normalizedFrom, normalizedTo);
        }

        private static string BuildDepthDirective(AiChatRequest request, string intent)
        {
            var wantsDeep = request.DetailLevel.Equals("deep", StringComparison.OrdinalIgnoreCase)
                || request.DetailLevel.Equals("detailed", StringComparison.OrdinalIgnoreCase)
                || request.Question.Contains("phân tích sâu", StringComparison.OrdinalIgnoreCase)
                || request.Question.Contains("root cause", StringComparison.OrdinalIgnoreCase)
                || request.Question.Contains("nguyên nhân", StringComparison.OrdinalIgnoreCase);

            if (!wantsDeep)
            {
                return "Mức nhanh: 220-320 từ, tập trung kết luận chính + 3 hành động ưu tiên.";
            }

            if (intent == "anomaly_detection" || intent == "maintenance_material_risk" || intent == "eta_voyage_risk")
            {
                return "Mức sâu: 500-700 từ, nêu chuỗi nguyên nhân-hệ quả, KPI chứng minh, mức rủi ro và kế hoạch hành động theo mốc 24h/7d/30d.";
            }

            return "Mức chi tiết: 380-550 từ, có số liệu so sánh 7 ngày vs 30 ngày, phân tích xu hướng và khuyến nghị định lượng.";
        }

        private static string BuildCommonQuestionPatterns()
        {
            return string.Join("\n", new[]
            {
                "- Tàu đang tiêu hao nhiên liệu có vượt định mức không?",
                "- Xu hướng tốc độ và RPM 7 ngày gần nhất so với 30 ngày như thế nào?",
                "- Có ngày nào số liệu bất thường cần điều tra ngay không?",
                "- ETA có rủi ro trễ do thời tiết hoặc hiệu suất máy không?",
                "- ROB hiện tại còn chạy được bao nhiêu ngày theo mức tiêu hao hiện nay?",
                "- Có dấu hiệu cần bảo trì sớm hoặc rủi ro do vận hành kéo dài ở tải cao không?",
                "- Cảnh báo an toàn nào xuất hiện trong kỳ báo cáo và mức độ ảnh hưởng ra sao?"
            });
        }

        private string BuildAnomalyDayBrief(List<dynamic> reports)
        {
            var days = AnalyzeAnomalyDays(reports).Take(5).ToList();
            if (days.Count == 0)
            {
                return "Không phát hiện ngày bất thường rõ rệt theo quy tắc thống kê hiện tại.";
            }

            var sb = new StringBuilder();
            foreach (var day in days)
            {
                sb.AppendLine($"- {day.Date:dd/MM}: speed={day.Speed:F2}, rpm={day.Rpm:F0}, fuel={day.Fuel:F2}; lý do: {string.Join("; ", day.Reasons)}");
            }

            return sb.ToString().Trim();
        }

        private static bool IsAnomalyQuestion(string question, string intent)
        {
            if (intent == "anomaly_detection")
            {
                return true;
            }

            return question.Contains("bất thường", StringComparison.OrdinalIgnoreCase)
                || question.Contains("số liệu lạ", StringComparison.OrdinalIgnoreCase)
                || question.Contains("ngày lạ", StringComparison.OrdinalIgnoreCase)
                || question.Contains("đột biến", StringComparison.OrdinalIgnoreCase);
        }

        private static bool ContainsDayReference(string answer)
        {
            return System.Text.RegularExpressions.Regex.IsMatch(answer, @"\b\d{2}/\d{2}\b");
        }

        private static string BuildFinalAnswer(string modelAnswer, string question, string intent, string anomalyDayBrief)
        {
            var trimmed = modelAnswer?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(trimmed))
            {
                trimmed = "Không có nội dung phản hồi từ mô hình.";
            }

            if (!IsAnomalyQuestion(question, intent))
            {
                return trimmed;
            }

            if (ContainsDayReference(trimmed))
            {
                return trimmed;
            }

            if (string.IsNullOrWhiteSpace(anomalyDayBrief))
            {
                return trimmed;
            }

            return $"{trimmed}\n\nNgày có số liệu lạ (rule-based):\n{anomalyDayBrief}";
        }

        /// <summary>
        /// Generate follow-up questions based on intent
        /// </summary>
        private List<string> GenerateFollowUpQuestions(string intent, string originalQuestion)
        {
            var questions = intent switch
            {
                "fuel_analysis" => new[]
                {
                    "Tiêu hao dầu dự kiến trong 3 ngày tới?",
                    "So sánh tiêu hao với các chuyến hàng trước?"
                },
                "fuel_efficiency" => new[]
                {
                    "Suất tiêu hao theo hải lý có vượt chuẩn không?",
                    "Nếu giảm 1 knot thì ước tính tiết kiệm nhiên liệu bao nhiêu?"
                },
                "speed_analysis" => new[]
                {
                    "Tốc độ có bị ảnh hưởng bởi thời tiết?",
                    "ETA sẽ thay đổi?",
                },
                "eta_voyage_risk" => new[]
                {
                    "Rủi ro trễ ETA trong 72 giờ tới là gì?",
                    "Nên điều chỉnh tốc độ thế nào để giữ ETA và tiết kiệm nhiên liệu?"
                },
                "engine_status" => new[]
                {
                    "Có cần bảo dưỡng sắp tới?",
                    "Nhiệt độ máy trong giới hạn cho phép?"
                },
                "maintenance_material_risk" => new[]
                {
                    "Có dấu hiệu chạy máy quá tải gây rủi ro bảo trì không?",
                    "Nên ưu tiên vật tư nào để phòng ngừa sự cố?"
                },
                "weather_impact" => new[]
                {
                    "Thời tiết sẽ cải thiện khi nào?",
                    "Tàu có cần thay đổi luồng đi?"
                },
                "safety_compliance" => new[]
                {
                    "Có cảnh báo an toàn nào cần escalte ngay không?",
                    "Các điểm cần lưu ý để bảo đảm tuân thủ trong kỳ tới?"
                },
                _ => new[]
                {
                    "Có thông tin nào khác bạn cần?",
                    "Báo cáo chi tiết hơn về chủ đề này?"
                }
            };

            return questions.Take(2).ToList();
        }
    }
}
