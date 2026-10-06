using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.EntityFrameworkCore;
using ProductApi.Services.CrewManagement;
using ProductApi.Data;

namespace ProductApi.Security;

public sealed class SyncRequestVerificationMiddleware : IMiddleware
{
    private const string NodeIdHeader = "X-Sync-Node-Id";
    private const string TimestampHeader = "X-Sync-Timestamp";
    private const string NonceHeader = "X-Sync-Nonce";
    private const string KeyVersionHeader = "X-Sync-Key-Version";
    private const string SignatureHeader = "X-Sync-Signature";
    private const string ContentHashHeader = "X-Sync-Content-SHA256";
    private const string ProtocolHeader = "X-Sync-Protocol";
    private const string VerifiedNodeIdItemKey = "VerifiedSyncNodeId";
    private const string VerifiedKeyVersionItemKey = "VerifiedSyncKeyVersion";

    private readonly IConfiguration _configuration;
    private readonly IMemoryCache _memoryCache;
    private readonly AppDbContext _dbContext;
    private readonly IAuditService _auditService;
    private readonly IDataEncryptionService _dataEncryptionService;
    private readonly ILogger<SyncRequestVerificationMiddleware> _logger;

    public SyncRequestVerificationMiddleware(
        IConfiguration configuration,
        IMemoryCache memoryCache,
        AppDbContext dbContext,
        IAuditService auditService,
        IDataEncryptionService dataEncryptionService,
        ILogger<SyncRequestVerificationMiddleware> logger,
        ProductApi.Services.Sync.ISyncNonceRegistryService nonceRegistry)
    {
        _configuration = configuration;
        _memoryCache = memoryCache;
        _dbContext = dbContext;
        _auditService = auditService;
        _dataEncryptionService = dataEncryptionService;
        _logger = logger;
        _nonceRegistry = nonceRegistry;
    }

    private readonly ProductApi.Services.Sync.ISyncNonceRegistryService _nonceRegistry;

    public static bool IsProtectedSyncRequest(HttpRequest request)
    {
        if (!request.Path.StartsWithSegments("/api/sync", out var remaining))
            return false;

        if (request.Method.Equals(HttpMethods.Post, StringComparison.OrdinalIgnoreCase) && remaining == PathString.Empty)
            return true;

        if (request.Method.Equals(HttpMethods.Post, StringComparison.OrdinalIgnoreCase) && remaining.Equals("/heartbeat", StringComparison.OrdinalIgnoreCase))
            return true;

        if (request.Method.Equals(HttpMethods.Get, StringComparison.OrdinalIgnoreCase) && remaining.Equals("/pull", StringComparison.OrdinalIgnoreCase))
            return true;

        if (request.Method.Equals(HttpMethods.Post, StringComparison.OrdinalIgnoreCase) && remaining.Equals("/acknowledge", StringComparison.OrdinalIgnoreCase))
            return true;

        if (request.Method.Equals(HttpMethods.Get, StringComparison.OrdinalIgnoreCase) && remaining.Equals("/file-requests", StringComparison.OrdinalIgnoreCase))
            return true;

        if (request.Method.Equals(HttpMethods.Post, StringComparison.OrdinalIgnoreCase) && remaining.Equals("/file-request", StringComparison.OrdinalIgnoreCase))
            return true;

        if (request.Method.Equals(HttpMethods.Get, StringComparison.OrdinalIgnoreCase) && remaining.Equals("/file-download", StringComparison.OrdinalIgnoreCase))
            return true;

        if (request.Method.Equals(HttpMethods.Post, StringComparison.OrdinalIgnoreCase) && remaining.Equals("/file-upload", StringComparison.OrdinalIgnoreCase))
            return true;

        if (request.Method.Equals(HttpMethods.Post, StringComparison.OrdinalIgnoreCase) && remaining.Equals("/file-upload-bundle", StringComparison.OrdinalIgnoreCase))
            return true;

        if (request.Method.Equals(HttpMethods.Post, StringComparison.OrdinalIgnoreCase) && remaining.Equals("/file-upload-session", StringComparison.OrdinalIgnoreCase))
            return true;

        if (request.Method.Equals(HttpMethods.Post, StringComparison.OrdinalIgnoreCase) && remaining.Equals("/file-upload-chunk", StringComparison.OrdinalIgnoreCase))
            return true;

        if (request.Method.Equals(HttpMethods.Get, StringComparison.OrdinalIgnoreCase) && remaining.Equals("/file-download-session", StringComparison.OrdinalIgnoreCase))
            return true;

        if (request.Method.Equals(HttpMethods.Get, StringComparison.OrdinalIgnoreCase) && remaining.Equals("/file-download-chunk", StringComparison.OrdinalIgnoreCase))
            return true;

        if (request.Method.Equals(HttpMethods.Post, StringComparison.OrdinalIgnoreCase) && remaining.Equals("/file-ack", StringComparison.OrdinalIgnoreCase))
            return true;

        return false;
    }

    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        if (!_configuration.GetValue("SyncSecurity:RequireSignedRequests", false))
        {
            await next(context);
            return;
        }

        var request = context.Request;
        var nodeId = request.Headers[NodeIdHeader].FirstOrDefault();
        var timestamp = request.Headers[TimestampHeader].FirstOrDefault();
        var nonce = request.Headers[NonceHeader].FirstOrDefault();
        var keyVersionValue = request.Headers[KeyVersionHeader].FirstOrDefault();
        var signature = request.Headers[SignatureHeader].FirstOrDefault();
        var contentHash = request.Headers[ContentHashHeader].FirstOrDefault();
        var protocol = request.Headers[ProtocolHeader].FirstOrDefault();

        if (string.IsNullOrWhiteSpace(nodeId) ||
            string.IsNullOrWhiteSpace(timestamp) ||
            string.IsNullOrWhiteSpace(nonce) ||
            string.IsNullOrWhiteSpace(keyVersionValue) ||
            string.IsNullOrWhiteSpace(signature) ||
            string.IsNullOrWhiteSpace(contentHash) ||
            string.IsNullOrWhiteSpace(protocol))
        {
            await RejectAndAuditAsync(context, StatusCodes.Status401Unauthorized, "Missing sync security headers.", "missing_headers", nodeId, nonce, protocol);
            return;
        }

        var expectedProtocol = _configuration["SyncSecurity:ProtocolVersion"] ?? "2";
        if (!string.Equals(protocol, expectedProtocol, StringComparison.Ordinal))
        {
            await RejectAndAuditAsync(context, StatusCodes.Status401Unauthorized, "Unsupported sync protocol version.", "unsupported_protocol", nodeId, nonce, protocol,
                $"expected={expectedProtocol}; actual={protocol}");
            return;
        }

        if (!DateTimeOffset.TryParse(timestamp, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsedTimestamp))
        {
            await RejectAndAuditAsync(context, StatusCodes.Status401Unauthorized, "Invalid sync timestamp.", "invalid_timestamp", nodeId, nonce, protocol,
                $"timestamp={timestamp}");
            return;
        }

        var allowedSkewSeconds = _configuration.GetValue("SyncSecurity:AllowedClockSkewSeconds", 300);
        if (Math.Abs((DateTimeOffset.UtcNow - parsedTimestamp).TotalSeconds) > allowedSkewSeconds)
        {
            await RejectAndAuditAsync(context, StatusCodes.Status401Unauthorized, "Sync timestamp is outside the allowed clock skew.", "clock_skew", nodeId, nonce, protocol,
                $"timestamp={timestamp}; allowedSkewSeconds={allowedSkewSeconds}");
            return;
        }

        if (!int.TryParse(keyVersionValue, out var keyVersion) || keyVersion <= 0)
        {
            await RejectAndAuditAsync(context, StatusCodes.Status401Unauthorized, "Invalid sync key version.", "invalid_key_version", nodeId, nonce, protocol,
                $"keyVersion={keyVersionValue}");
            return;
        }

        var tokenNodeId = context.Items[NodeApiTokenMiddleware.VerifiedNodeIdItemKey] as string;
        if (!string.IsNullOrWhiteSpace(tokenNodeId) &&
            !string.Equals(tokenNodeId, nodeId, StringComparison.Ordinal))
        {
            await RejectAndAuditAsync(
                context,
                StatusCodes.Status401Unauthorized,
                "Node API token and signed node identity do not match.",
                "credential_identity_mismatch",
                nodeId,
                nonce,
                protocol);
            return;
        }

        var replayCacheKey = $"sync-nonce:{nodeId}:{nonce}";
        if (_memoryCache.TryGetValue(replayCacheKey, out _))
        {
            await RejectAndAuditAsync(context, StatusCodes.Status409Conflict, "Replay detected for sync request.", "replay_detected", nodeId, nonce, protocol);
            return;
        }

        var node = await _dbContext.SyncNodeTrackers
            .AsTracking()
            .FirstOrDefaultAsync(n => n.NodeId == nodeId);

        if (node == null ||
            !node.IsRegistered ||
            !node.VesselId.HasValue ||
            string.IsNullOrWhiteSpace(node.ImoNumber))
        {
            _logger.LogWarning("Denied signed sync request because node {NodeId} is not provisioned in Shore registry", nodeId);
            await RejectAndAuditAsync(context, StatusCodes.Status401Unauthorized, "Unknown sync node.", "unknown_node", nodeId, nonce, protocol);
            return;
        }

        if (node.IsRevoked)
        {
            await RejectAndAuditAsync(context, StatusCodes.Status403Forbidden, "Sync node has been revoked.", "revoked_node", nodeId, nonce, protocol);
            return;
        }

        var (sharedKey, matchedKeyVersion, matchedKeySlot) = ResolveAcceptedSigningKey(node, keyVersion, _dataEncryptionService);
        if (string.IsNullOrWhiteSpace(sharedKey))
        {
            _logger.LogWarning("Denied signed sync request because node {NodeId} has no accepted signing key for version {KeyVersion}", nodeId, keyVersion);
            await RejectAndAuditAsync(context, StatusCodes.Status401Unauthorized, "Sync node key is not configured for this key version.", "missing_node_key", nodeId, nonce, protocol,
                $"requestedKeyVersion={keyVersion}");
            return;
        }

        var bodyBytes = await ReadBodyBytesAsync(request);
        var actualContentHash = ComputeSha256Hex(bodyBytes);
        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(actualContentHash),
                Encoding.UTF8.GetBytes(contentHash)))
        {
            await RejectAndAuditAsync(context, StatusCodes.Status401Unauthorized, "Sync payload hash mismatch.", "payload_hash_mismatch", nodeId, nonce, protocol,
                $"expected={contentHash}; actual={actualContentHash}");
            return;
        }

        var canonical = BuildCanonicalString(
            request.Method,
            request.Path + request.QueryString,
            nodeId,
            timestamp,
            nonce,
            matchedKeyVersion.ToString(),
            contentHash,
            protocol);

        var expectedSignature = ComputeHmacBase64(sharedKey, canonical);
        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expectedSignature),
                Encoding.UTF8.GetBytes(signature)))
        {
            await RejectAndAuditAsync(context, StatusCodes.Status401Unauthorized, "Invalid sync signature.", "invalid_signature", nodeId, nonce, protocol);
            return;
        }

        var nonceTtlMinutes = _configuration.GetValue("SyncSecurity:NonceTtlMinutes", 15);
        var ttl = Math.Max(Math.Max(1, nonceTtlMinutes) * 60, allowedSkewSeconds * 2 + 60);
        if (!await _nonceRegistry.RegisterNonceAsync(nonce, nodeId, parsedTimestamp.UtcDateTime, ttl,
            context.Connection.RemoteIpAddress?.ToString(), request.Path))
        {
            await RejectAndAuditAsync(context, StatusCodes.Status409Conflict, "Replay detected for sync request.", "replay_detected", nodeId, nonce, protocol);
            return;
        }
        _memoryCache.Set(replayCacheKey, true, TimeSpan.FromSeconds(ttl));
        if (matchedKeySlot == "current")
        {
            node.LastAcknowledgedKeyVersion = matchedKeyVersion;
            node.LastKeyVersionAcknowledgedAt = DateTime.UtcNow;
        }
        node.LastSignedRequestAt = DateTime.UtcNow;
        node.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();
        context.Items[VerifiedNodeIdItemKey] = nodeId;
        context.Items[VerifiedKeyVersionItemKey] = matchedKeyVersion;

        await next(context);
    }

    private static async Task<byte[]> ReadBodyBytesAsync(HttpRequest request)
    {
        if (HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method))
            return Array.Empty<byte>();

        request.EnableBuffering();
        request.Body.Position = 0;

        using var memoryStream = new MemoryStream();
        await request.Body.CopyToAsync(memoryStream);
        request.Body.Position = 0;
        return memoryStream.ToArray();
    }

    private static string ComputeSha256Hex(byte[] content)
    {
        var hash = SHA256.HashData(content);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static string ComputeHmacBase64(string sharedKey, string canonical)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(sharedKey));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(canonical));
        return Convert.ToBase64String(hash);
    }

    private static string BuildCanonicalString(
        string method,
        string pathAndQuery,
        string nodeId,
        string timestamp,
        string nonce,
        string keyVersion,
        string contentHash,
        string protocol)
    {
        return string.Join('\n', new[]
        {
            method.ToUpperInvariant(),
            pathAndQuery,
            nodeId,
            timestamp,
            nonce,
            keyVersion,
            contentHash,
            protocol
        });
    }

    private static (string? SharedKey, int MatchedKeyVersion, string MatchedKeySlot) ResolveAcceptedSigningKey(
        ProductApi.Models.SyncNodeTracker node,
        int requestedKeyVersion,
        IDataEncryptionService dataEncryptionService)
    {
        if (requestedKeyVersion == node.KeyVersion && !string.IsNullOrWhiteSpace(node.SigningKey))
            return (dataEncryptionService.Decrypt(node.SigningKey), node.KeyVersion, "current");

        var previousKeyVersion = node.PreviousKeyVersion;
        var previousStillValid = node.PreviousKeyVersion.HasValue
            && node.PreviousKeyGraceUntil.HasValue
            && node.PreviousKeyGraceUntil.Value >= DateTime.UtcNow;

        if (previousStillValid &&
            previousKeyVersion.HasValue &&
            requestedKeyVersion == previousKeyVersion.Value &&
            !string.IsNullOrWhiteSpace(node.PreviousSigningKey))
        {
            return (dataEncryptionService.Decrypt(node.PreviousSigningKey), previousKeyVersion.Value, "previous");
        }

        return (null, requestedKeyVersion, "missing");
    }

    private async Task RejectAndAuditAsync(
        HttpContext context,
        int statusCode,
        string error,
        string reasonCode,
        string? nodeId,
        string? nonce,
        string? protocol,
        string? detail = null)
    {
        _logger.LogWarning("Rejected signed sync request: {ReasonCode} for node {NodeId} on {Path}",
            reasonCode, nodeId ?? "unknown", context.Request.Path);

        try
        {
            var details = BuildAuditDetails(context, reasonCode, nodeId, nonce, protocol, detail);
            var entityId = string.IsNullOrWhiteSpace(nodeId) ? "unknown" : Truncate(nodeId, 100) ?? "unknown";
            await _auditService.LogAsync(
                action: "Reject",
                entityType: "SyncSecurity",
                entityId: entityId,
                actor: "sync-verifier",
                sourceChannel: "EdgeSync",
                details: details,
                correlationId: Truncate(string.IsNullOrWhiteSpace(nonce) ? context.TraceIdentifier : nonce, 100),
                ipAddress: Truncate(context.Connection.RemoteIpAddress?.ToString(), 50));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist sync security audit event for reason {ReasonCode}", reasonCode);
        }

        await RejectAsync(context, statusCode, error);
    }

    private static string BuildAuditDetails(
        HttpContext context,
        string reasonCode,
        string? nodeId,
        string? nonce,
        string? protocol,
        string? detail)
    {
        var request = context.Request;
        var combined = string.Join("; ", new[]
        {
            $"reason={reasonCode}",
            $"method={request.Method}",
            $"path={request.Path}{request.QueryString}",
            $"node={nodeId ?? "unknown"}",
            $"nonce={nonce ?? "missing"}",
            $"protocol={protocol ?? "missing"}",
            $"trace={context.TraceIdentifier}",
            detail
        }.Where(value => !string.IsNullOrWhiteSpace(value)));

        return Truncate(combined, 1000) ?? string.Empty;
    }

    private static string? Truncate(string? value, int maxLength)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxLength)
            return value;

        return value[..maxLength];
    }

    private static async Task RejectAsync(HttpContext context, int statusCode, string error)
    {
        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync($"{{\"error\":\"{error}\"}}");
    }
}
