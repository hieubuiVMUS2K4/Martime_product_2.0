using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using ProductApi.Services.AI;
using Xunit;

public class GroqEvaluationTests
{
    private sealed class Handler(HttpStatusCode status, string body) : HttpMessageHandler
    {
        public JsonElement Request { get; private set; }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            Assert.Equal("api.groq.com", request.RequestUri!.Host);
            Request = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(token)).RootElement.Clone();
            return new HttpResponseMessage(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        }
    }

    private static GeminiEvaluationService Service(Handler handler, string? model = null)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        { ["Groq:ApiKey"] = "test-key", ["Groq:Model"] = model }).Build();
        return new(new HttpClient(handler), config, NullLogger<GeminiEvaluationService>.Instance);
    }

    [Fact]
    public async Task ChatUsesAvailableDefaultAndReturnsOnlyAnswer()
    {
        var handler = new Handler(HttpStatusCode.OK, """{"choices":[{"message":{"content":"Đã phân tích","reasoning":"private"}}]}""");
        var result = await Service(handler).ChatWithReportsAsync("Kiểm tra", "{}", default);
        Assert.True(result.Success);
        Assert.Equal("Đã phân tích", result.Content);
        Assert.Equal("openai/gpt-oss-120b", handler.Request.GetProperty("model").GetString());
        Assert.Equal("low", handler.Request.GetProperty("reasoning_effort").GetString());
    }

    [Fact]
    public async Task EvaluationUsesConfiguredModelAndJsonFormat()
    {
        var handler = new Handler(HttpStatusCode.OK, """{"choices":[{"message":{"content":"{\"status\":\"Normal\",\"contentVi\":\"Ổn định\"}"}}]}""");
        var result = await Service(handler, "custom-model").EvaluateReportAsync("{}", default);
        Assert.Equal("Ổn định", result.ContentVi);
        Assert.Equal("custom-model", handler.Request.GetProperty("model").GetString());
        Assert.Equal("json_object", handler.Request.GetProperty("response_format").GetProperty("type").GetString());
        Assert.False(handler.Request.TryGetProperty("reasoning_effort", out _));
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound, "Model AI")]
    [InlineData(HttpStatusCode.Unauthorized, "xác thực")]
    public async Task ErrorsIdentifyProviderAndCause(HttpStatusCode status, string expected)
    {
        var result = await Service(new Handler(status, "{}" )).ChatWithReportsAsync("test", "{}", default);
        Assert.False(result.Success);
        Assert.Contains(expected, result.Content);
        Assert.Contains("Groq", result.Content);
        Assert.DoesNotContain("Gemini", result.Content);
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound, "{}")]
    [InlineData(HttpStatusCode.ServiceUnavailable, "{}")]
    [InlineData(HttpStatusCode.OK, "{\"choices\":[{\"message\":{\"content\":\"invalid JSON\"}}]}")]
    public async Task EvaluationFailureNeverReturnsHealthyStatus(HttpStatusCode status, string body)
    {
        var result = await Service(new Handler(status, body)).EvaluateReportAsync("{}", default);
        Assert.Equal("Unavailable", result.Status);
        Assert.False(string.IsNullOrWhiteSpace(result.ContentVi));
    }
}
