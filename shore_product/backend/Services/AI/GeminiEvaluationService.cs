using System.Text;
using System.Text.Json;
using System.Net;
using ProductApi.DTOs;

namespace ProductApi.Services.AI
{
    public class GeminiEvaluationService : IGeminiEvaluationService
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _config;
        private readonly ILogger<GeminiEvaluationService> _logger;
        private const int MAX_RETRIES = 2; // Reduced from 3
        private const int INITIAL_DELAY_MS = 500; // Reduced from 1000
        private const int EVALUATION_TIMEOUT_MS = 25000; // 25 seconds (reduced from 120)
        private const int CHAT_TIMEOUT_MS = 20000; // 20 seconds (reduced from 45)
        
        private static int _currentKeyIndex = 0;
        private static readonly object _keyLock = new object();

        private string[] GetApiKeys()
        {
            var apiKeyString = _config["Groq:ApiKey"] ?? _config["Gemini:ApiKey"];
            if (string.IsNullOrEmpty(apiKeyString)) return Array.Empty<string>();

            return apiKeyString.Split(',', StringSplitOptions.RemoveEmptyEntries)
                               .Select(k => k.Trim())
                               .ToArray();
        }

        private string GetNextApiKey(string[] keys)
        {
            lock (_keyLock)
            {
                var key = keys[_currentKeyIndex % keys.Length];
                _currentKeyIndex = (_currentKeyIndex + 1) % keys.Length;
                return key;
            }
        }

        public GeminiEvaluationService(HttpClient httpClient, IConfiguration config, ILogger<GeminiEvaluationService> logger)
        {
            _httpClient = httpClient;
            _config = config;
            _logger = logger;
        }

        public async Task<AiEvaluationResponse> EvaluateReportAsync(string jsonData, CancellationToken token)
        {
            var keys = GetApiKeys();
            if (keys.Length == 0)
            {
                _logger.LogWarning("AI API Key is missing.");
                return new AiEvaluationResponse { Status = "Normal", ContentVi = "API Key chưa được cấu hình." };
            }

            var prompt = $@"Bạn là chuyên gia máy trưởng hàng hải. 
Nhiệm vụ của bạn là đánh giá BÁO CÁO CỦA NGÀY HIỆN TẠI (CurrentReport) bằng cách so sánh thông số của nó với trung bình 7 ngày qua (Past7DaysAverage) được cung cấp trong dữ liệu JSON sau:
{jsonData}

YÊU CẦU BẮT BUỘC: 
- Nhận xét phải tập trung trực tiếp vào số liệu của báo cáo hiện tại (CurrentReport).
- Đánh giá xem số liệu của ngày hôm nay có bất thường hay tốt/xấu hơn như thế nào so với xu hướng 7 ngày qua (Past7DaysAverage). 
- Tuyệt đối KHÔNG trả lời theo kiểu tổng kết cả tuần.
Trả lại CHỈ nguyên định dạng JSON: {{""status"": ""Normal/Warning/Critical"", ""contentVi"": ""Nhận xét tiếng Việt khoảng 100 chữ""}}";

            Exception? lastException = null;

            for (int attempt = 0; attempt < keys.Length; attempt++)
            {
                var apiKey = GetNextApiKey(keys);
                try
                {
                    _logger.LogInformation($"Calling Groq API... (Attempt {attempt + 1}/{keys.Length})");
                    
                    var requestBody = new
                    {
                        model = "llama-3.3-70b-versatile",
                        messages = new[] { new { role = "user", content = prompt } }
                    };

                    var requestJson = JsonSerializer.Serialize(requestBody);
                    var requestContent = new StringContent(requestJson, Encoding.UTF8, "application/json");
                    
                    using var cts = CancellationTokenSource.CreateLinkedTokenSource(token);
                    cts.CancelAfter(TimeSpan.FromMilliseconds(EVALUATION_TIMEOUT_MS));

                    var reqMsg = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions") { Content = requestContent };
                    reqMsg.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
                    var response = await _httpClient.SendAsync(reqMsg, cts.Token);

                    var responseBody = await response.Content.ReadAsStringAsync(cts.Token);
                    _logger.LogInformation($"Groq API Status: {response.StatusCode}");

                    if (!response.IsSuccessStatusCode)
                    {
                        if (response.StatusCode == HttpStatusCode.TooManyRequests)
                        {
                            _logger.LogWarning($"Rate limit hit (429) for key {apiKey.Substring(0, 5)}... Switching key.");
                            continue; // Try next key
                        }

                        _logger.LogError($"API Error: {response.StatusCode} - {responseBody}");
                        if (response.StatusCode == HttpStatusCode.ServiceUnavailable)
                            return new AiEvaluationResponse { Status = "Normal", ContentVi = "Dịch vụ AI tạm thời không khả dụng." };
                        
                        return new AiEvaluationResponse { Status = "Normal", ContentVi = "Lỗi gọi API Gemini." };
                    }

                    using var jsonDoc = JsonDocument.Parse(responseBody);
                    var root = jsonDoc.RootElement;
                    
                    if (root.TryGetProperty("choices", out var choices) && choices.GetArrayLength() > 0)
                    {
                        var choice = choices[0];
                        if (choice.TryGetProperty("message", out var message) &&
                            message.TryGetProperty("content", out var contentProp))
                        {
                            var text = contentProp.GetString() ?? "";
                            text = text.Replace("```json", "").Replace("```", "").Trim();
                            
                            try
                            {
                                var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                                var result = JsonSerializer.Deserialize<AiEvaluationResponse>(text, opts);
                                if (result != null)
                                    return result;
                            }
                            catch { }
                            
                            return new AiEvaluationResponse { Status = "Normal", ContentVi = text };
                        }
                    }
                    return new AiEvaluationResponse { Status = "Normal", ContentVi = "Không thể phân tích." };
                }
                catch (OperationCanceledException ex)
                {
                    _logger.LogError("API timeout fallback triggered");
                    lastException = ex;
                    continue; // You can also switch key on timeout
                }
                catch (Exception ex)
                {
                    lastException = ex;
                    _logger.LogError(ex, "Network or system error on API");
                    break; // Stop immediately on unhandled crashes
                }
            }

            if (lastException is OperationCanceledException)
                 return new AiEvaluationResponse { Status = "Warning", ContentVi = "Yêu cầu AI vượt thời gian chờ." };

            return new AiEvaluationResponse { Status = "Warning", ContentVi = "Toàn bộ API Key đã bị Rate Limit hoặc có lỗi xảy ra." };
        }

        public async Task<GeminiChatResult> ChatWithReportsAsync(string message, string reportsJson, CancellationToken token)
        {
            var keys = GetApiKeys();
            if (keys.Length == 0)
            {
                _logger.LogWarning("API Key missing");
                return new GeminiChatResult
                {
                    Success = false,
                    Content = "API Key chưa được cấu hình.",
                    ErrorSource = "gemini_config"
                };
            }
            var apiKey = GetNextApiKey(keys);

            // Use upstream prompt as single source of truth when depth is already configured.
            var prompt = reportsJson.Contains("[DEPTH_CONFIGURED]", StringComparison.Ordinal)
                ? reportsJson
                : (reportsJson.Contains("HƯỚNG DẪN") || reportsJson.Contains("YÊU CẦU CÔNG VIỆC")
                    ? reportsJson + "\n\n[GHI CHÚ HỆ THỐNG]: Trả lời đủ sâu, có số liệu và khuyến nghị hành động rõ ràng."
                    : $@"Bạn là chuyên gia vận hành tàu biển. Dựa vào dữ liệu báo cáo: {reportsJson}
Câu hỏi: {message}
Trình bày phân tích chi tiết, đánh giá rủi ro, và khuyến nghị rõ ràng.");

            try
            {
                _logger.LogInformation("Calling Groq Chat API...");
                
                var requestBody = new
                {
                    model = "llama-3.3-70b-versatile",
                    messages = new[] { new { role = "user", content = prompt } }
                };

                var requestJson = JsonSerializer.Serialize(requestBody);
                var requestContent = new StringContent(requestJson, Encoding.UTF8, "application/json");
                
                var cts = CancellationTokenSource.CreateLinkedTokenSource(token);
                cts.CancelAfter(TimeSpan.FromMilliseconds(CHAT_TIMEOUT_MS));

                _logger.LogInformation($"Sending request to Groq API with prompt length: {requestJson.Length}");
                
                var reqMsg = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions") { Content = requestContent };
                reqMsg.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
                var response = await _httpClient.SendAsync(reqMsg, cts.Token);

                var responseBody = await response.Content.ReadAsStringAsync(cts.Token);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogError($"Chat API Error: {response.StatusCode} - {responseBody}");
                    
                    if (response.StatusCode == HttpStatusCode.ServiceUnavailable)
                    {
                        return new GeminiChatResult
                        {
                            Success = false,
                            Content = "Dịch vụ AI (Gemini) tạm thời không khả dụng. Vui lòng thử lại trong vài giây.",
                            ErrorSource = "gemini_service_unavailable"
                        };
                    }
                    else if (response.StatusCode == HttpStatusCode.TooManyRequests)
                    {
                        var (retryFromBodySeconds, quotaExceeded) = TryGetRetryAfterFromErrorBody(responseBody);
                        var retryAfterSeconds = TryGetRetryAfterSeconds(response) ?? retryFromBodySeconds;
                        var messageText = quotaExceeded
                            ? (retryAfterSeconds.HasValue
                                ? $"Gemini đã vượt quota hiện tại. Vui lòng thử lại sau {retryAfterSeconds.Value}s hoặc nâng gói/quota."
                                : "Gemini đã vượt quota hiện tại. Vui lòng chờ reset quota hoặc nâng gói/quota.")
                            : (retryAfterSeconds.HasValue
                                ? $"Gemini đang giới hạn tần suất yêu cầu. Vui lòng thử lại sau {retryAfterSeconds.Value}s."
                                : "Gemini đang giới hạn tần suất yêu cầu. Vui lòng chờ một chút rồi thử lại.");

                        return new GeminiChatResult
                        {
                            Success = false,
                            Content = messageText,
                            ErrorSource = quotaExceeded ? "gemini_quota_exceeded" : "gemini_rate_limit",
                            RetryAfterSeconds = retryAfterSeconds
                        };
                    }
                    else
                    {
                        return new GeminiChatResult
                        {
                            Success = false,
                            Content = "Lỗi gọi Gemini API: " + response.StatusCode,
                            ErrorSource = "gemini_api"
                        };
                    }
                }

                using var jsonDoc = JsonDocument.Parse(responseBody);
                var root = jsonDoc.RootElement;

                // Groq OpenAI-compatible format: choices[0].message.content
                if (root.TryGetProperty("choices", out var choices) && choices.GetArrayLength() > 0)
                {
                    var choice = choices[0];
                    if (choice.TryGetProperty("message", out var messageEl)
                        && messageEl.TryGetProperty("content", out var contentEl))
                    {
                        var text = contentEl.GetString() ?? "Không thể trả lời.";

                        _logger.LogInformation($"Chat Response (Groq): {text}");
                        return new GeminiChatResult
                        {
                            Success = true,
                            Content = text.Trim()
                        };
                    }
                }

                // Backward-compatible fallback for old Gemini response format.
                if (root.TryGetProperty("candidates", out var candidates) && candidates.GetArrayLength() > 0)
                {
                    var candidate = candidates[0];
                    if (candidate.TryGetProperty("content", out var content)
                        && content.TryGetProperty("parts", out var parts) && parts.GetArrayLength() > 0)
                    {
                        var text = parts[0].TryGetProperty("text", out var textProp)
                            ? textProp.GetString() ?? "Không thể trả lời."
                            : "Không thể trả lời.";

                        _logger.LogInformation($"Chat Response (Gemini): {text}");
                        return new GeminiChatResult
                        {
                            Success = true,
                            Content = text.Trim()
                        };
                    }
                }

                return new GeminiChatResult
                {
                    Success = false,
                    Content = "Không thể phân tích.",
                    ErrorSource = "gemini_parse"
                };
            }
            catch (OperationCanceledException)
            {
                _logger.LogError("Chat API timeout");
                return new GeminiChatResult
                {
                    Success = false,
                    Content = "Yêu cầu tới Gemini vượt thời gian chờ.",
                    ErrorSource = "gemini_timeout"
                };
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "Chat API network error");
                return new GeminiChatResult
                {
                    Success = false,
                    Content = "Lỗi kết nối mạng khi gọi Gemini.",
                    ErrorSource = "gemini_network"
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Chat API error");
                return new GeminiChatResult
                {
                    Success = false,
                    Content = "Lỗi hệ thống khi gọi Gemini.",
                    ErrorSource = "gemini_internal"
                };
            }
        }

        private static int? TryGetRetryAfterSeconds(HttpResponseMessage response)
        {
            if (response.Headers.RetryAfter?.Delta is TimeSpan delta)
            {
                return Math.Max(1, (int)Math.Ceiling(delta.TotalSeconds));
            }

            if (response.Headers.RetryAfter?.Date is DateTimeOffset retryAt)
            {
                var seconds = retryAt - DateTimeOffset.UtcNow;
                if (seconds.TotalSeconds > 0)
                {
                    return Math.Max(1, (int)Math.Ceiling(seconds.TotalSeconds));
                }
            }

            if (response.Headers.TryGetValues("Retry-After", out var values))
            {
                var retryRaw = values.FirstOrDefault();
                if (int.TryParse(retryRaw, out var retrySeconds) && retrySeconds > 0)
                {
                    return retrySeconds;
                }
            }

            return null;
        }

        private static (int? RetryAfterSeconds, bool QuotaExceeded) TryGetRetryAfterFromErrorBody(string responseBody)
        {
            if (string.IsNullOrWhiteSpace(responseBody))
            {
                return (null, false);
            }

            try
            {
                using var doc = JsonDocument.Parse(responseBody);
                var root = doc.RootElement;

                if (!root.TryGetProperty("error", out var error))
                {
                    return (null, false);
                }

                var message = error.TryGetProperty("message", out var msgEl)
                    ? msgEl.GetString() ?? string.Empty
                    : string.Empty;

                var quotaExceeded = message.Contains("quota", StringComparison.OrdinalIgnoreCase)
                    || message.Contains("RESOURCE_EXHAUSTED", StringComparison.OrdinalIgnoreCase);

                int? retryAfterSeconds = null;

                if (error.TryGetProperty("details", out var details) && details.ValueKind == JsonValueKind.Array)
                {
                    foreach (var detail in details.EnumerateArray())
                    {
                        if (!detail.TryGetProperty("@type", out var typeEl))
                        {
                            continue;
                        }

                        var detailType = typeEl.GetString() ?? string.Empty;
                        if (detailType.Contains("RetryInfo", StringComparison.OrdinalIgnoreCase)
                            && detail.TryGetProperty("retryDelay", out var retryDelayEl))
                        {
                            var retryDelay = retryDelayEl.GetString() ?? string.Empty;
                            retryAfterSeconds = ParseDurationSeconds(retryDelay);
                            if (retryAfterSeconds.HasValue)
                            {
                                break;
                            }
                        }
                    }
                }

                if (!retryAfterSeconds.HasValue)
                {
                    var match = System.Text.RegularExpressions.Regex.Match(
                        message,
                        @"Please retry in\s+(?<sec>\d+(?:\.\d+)?)s",
                        System.Text.RegularExpressions.RegexOptions.IgnoreCase);

                    if (match.Success && double.TryParse(match.Groups["sec"].Value, out var secs))
                    {
                        retryAfterSeconds = Math.Max(1, (int)Math.Ceiling(secs));
                    }
                }

                return (retryAfterSeconds, quotaExceeded);
            }
            catch
            {
                return (null, false);
            }
        }

        private static int? ParseDurationSeconds(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return null;
            }

            var match = System.Text.RegularExpressions.Regex.Match(value.Trim(), @"^(?<sec>\d+)s$");
            if (match.Success && int.TryParse(match.Groups["sec"].Value, out var secs))
            {
                return Math.Max(1, secs);
            }

            return null;
        }

        
    }
}
