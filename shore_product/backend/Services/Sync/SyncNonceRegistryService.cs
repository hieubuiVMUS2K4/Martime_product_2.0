using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.Models;
using Microsoft.Extensions.Logging;

namespace ProductApi.Services.Sync;
public interface ISyncNonceRegistryService
{
    /// <summary>
    /// Register a new nonce (or check if already exists)
    /// Returns true if nonce is new, false if duplicate (replay attempt)
    /// </summary>
    Task<bool> RegisterNonceAsync(string nonce, string originNode, DateTime originTimestamp, int ttlSeconds = 300, string? requesterIp = null, string? endpoint = null);

    /// <summary>
    /// Check if a nonce exists (for verification)
    /// Returns null if nonce not found, the entry if found
    /// </summary>
    Task<SyncNonceRegistryEntry?> CheckNonceAsync(string nonce);

    /// <summary>
    /// Clean up expired nonces (should run periodically, e.g., daily)
    /// Returns count of deleted entries
    /// </summary>
    Task<int> CleanupExpiredNoncesAsync();

    /// <summary>
    /// Get statistics about nonce registry (for monitoring)
    /// </summary>
    Task<SyncNonceRegistryStats> GetRegistryStatsAsync();
}

/// <summary>
/// Statistics about nonce registry usage
/// </summary>
public class SyncNonceRegistryStats
{
    public int TotalRegisteredNonces { get; set; }
    public int ExpiredNonces { get; set; }
    public int ActiveNonces { get; set; }
    public DateTime StatsCalculatedUtc { get; set; }
}

/// <summary>
/// Implementation of replay protection using database-backed nonce registry
/// Replaces in-memory cache to support distributed Shore deployment
/// </summary>
public class SyncNonceRegistryService : ISyncNonceRegistryService
{
    private readonly AppDbContext _db;
    private readonly ILogger<SyncNonceRegistryService> _logger;

    public SyncNonceRegistryService(
        AppDbContext db,
        ILogger<SyncNonceRegistryService> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Register a new nonce
    /// Thread-safe using database uniqueness constraint
    /// </summary>
    public async Task<bool> RegisterNonceAsync(
        string nonce,
        string originNode,
        DateTime originTimestamp,
        int ttlSeconds = 300,
        string? requesterIp = null,
        string? endpoint = null)
    {
        if (string.IsNullOrWhiteSpace(nonce))
        {
            throw new ArgumentException("Nonce cannot be empty", nameof(nonce));
        }

        var registryEntry = new SyncNonceRegistryEntry
        {
            Nonce = nonce,
            OriginNode = originNode,
            OriginTimestampUtc = originTimestamp,
            RegisteredAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddSeconds(ttlSeconds),
            RequesterIpAddress = requesterIp,
            EndpointPath = endpoint
        };

        try
        {
            _db.SyncNonceRegistry.Add(registryEntry);
            await _db.SaveChangesAsync();

            _logger.LogDebug("[REPLAY-PROTECT] Nonce {Nonce} registered for node {Node}, expires in {Seconds}s",
                nonce.Substring(0, Math.Min(8, nonce.Length)), originNode, ttlSeconds);

            return true;  // New nonce, not a replay
        }
        catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException { SqlState: "23505" })
        {
            _db.Entry(registryEntry).State = EntityState.Detached;
            // Duplicate nonce - replay attempt detected
            _logger.LogWarning("[REPLAY-DETECTED] Duplicate nonce {Nonce} from node {Node} at {Time}",
                nonce.Substring(0, Math.Min(8, nonce.Length)), originNode, DateTime.UtcNow);

            return false;  // Duplicate, replay detected
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[REPLAY-PROTECT] Error registering nonce");
            throw;
        }
    }

    /// <summary>
    /// Check if a nonce exists in the registry
    /// </summary>
    public async Task<SyncNonceRegistryEntry?> CheckNonceAsync(string nonce)
    {
        var entry = await _db.SyncNonceRegistry
            .FirstOrDefaultAsync(n => n.Nonce == nonce);

        if (entry == null)
        {
            _logger.LogDebug("[REPLAY-PROTECT] Nonce not found in registry");
            return null;
        }

        // Check if expired
        if (entry.ExpiresAtUtc < DateTime.UtcNow)
        {
            _logger.LogDebug("[REPLAY-PROTECT] Nonce found but expired");
            return null;  // Expired, should be cleaned up
        }

        return entry;
    }

    /// <summary>
    /// Clean up expired nonces from registry
    /// Should be run periodically (e.g., daily) to prevent table growth
    /// </summary>
    public async Task<int> CleanupExpiredNoncesAsync()
    {
        var expiredNonces = await _db.SyncNonceRegistry
            .Where(n => n.ExpiresAtUtc < DateTime.UtcNow)
            .ToListAsync();

        if (expiredNonces.Count == 0)
        {
            _logger.LogDebug("[REPLAY-PROTECT] No expired nonces to clean up");
            return 0;
        }

        _db.SyncNonceRegistry.RemoveRange(expiredNonces);
        await _db.SaveChangesAsync();

        _logger.LogInformation("[REPLAY-PROTECT] Cleaned up {Count} expired nonces", expiredNonces.Count);

        return expiredNonces.Count;
    }

    /// <summary>
    /// Get registry statistics
    /// </summary>
    public async Task<SyncNonceRegistryStats> GetRegistryStatsAsync()
    {
        var utcNow = DateTime.UtcNow;

        var totalCount = await _db.SyncNonceRegistry.CountAsync();
        var expiredCount = await _db.SyncNonceRegistry
            .Where(n => n.ExpiresAtUtc < utcNow)
            .CountAsync();

        return new SyncNonceRegistryStats
        {
            TotalRegisteredNonces = totalCount,
            ExpiredNonces = expiredCount,
            ActiveNonces = totalCount - expiredCount,
            StatsCalculatedUtc = DateTime.UtcNow
        };
    }
}

/// <summary>
/// Background service for cleaning up expired nonces periodically
/// Prevents sync_nonce_registry table from growing unbounded
/// </summary>
public class SyncNonceRegistryCleanupService : Microsoft.Extensions.Hosting.BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<SyncNonceRegistryCleanupService> _logger;

    // Run cleanup once per day
    private const int CleanupIntervalHours = 24;

    public SyncNonceRegistryCleanupService(
        IServiceProvider serviceProvider,
        ILogger<SyncNonceRegistryCleanupService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("[REPLAY-PROTECT] Nonce registry cleanup service started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromHours(CleanupIntervalHours), stoppingToken);

                using var scope = _serviceProvider.CreateAsyncScope();
                var nonceService = scope.ServiceProvider.GetRequiredService<ISyncNonceRegistryService>();

                var deletedCount = await nonceService.CleanupExpiredNoncesAsync();
                _logger.LogInformation("[REPLAY-PROTECT] Cleanup completed, deleted {Count} expired nonces", deletedCount);

                var stats = await nonceService.GetRegistryStatsAsync();
                _logger.LogInformation("[REPLAY-PROTECT] Registry stats: {Active} active, {Expired} expired, {Total} total",
                    stats.ActiveNonces, stats.ExpiredNonces, stats.TotalRegisteredNonces);
            }
            catch (OperationCanceledException)
            {
                _logger.LogInformation("[REPLAY-PROTECT] Cleanup service cancelled");
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[REPLAY-PROTECT] Error during nonce cleanup");
            }
        }

        _logger.LogInformation("[REPLAY-PROTECT] Nonce registry cleanup service stopped");
    }
}
