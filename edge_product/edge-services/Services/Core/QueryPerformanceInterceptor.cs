using System.Data.Common;
using System.Diagnostics;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging;

namespace MaritimeEdge.Services.Core;

/// <summary>
/// EF Core command interceptor to capture and log query execution performance.
/// Integrates with QueryDiagnosticLogger for detailed analysis.
/// 
/// Phase 3.4: Query Monitoring & Analysis
/// </summary>
public class QueryPerformanceInterceptor : DbCommandInterceptor
{
    private readonly ILogger<QueryPerformanceInterceptor> _logger;
    private readonly QueryDiagnosticLogger? _diagnosticLogger;
    private readonly int _slowQueryThresholdMs;
    private readonly AsyncLocal<Stopwatch?> _stopwatch = new();

    public QueryPerformanceInterceptor(
        ILogger<QueryPerformanceInterceptor> logger,
        QueryDiagnosticLogger? diagnosticLogger = null,
        int slowQueryThresholdMs = 500)
    {
        _logger = logger;
        _diagnosticLogger = diagnosticLogger;
        _slowQueryThresholdMs = slowQueryThresholdMs;
    }

    public override InterceptionResult<DbDataReader> ReaderExecuting(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<DbDataReader> result)
    {
        _stopwatch.Value = Stopwatch.StartNew();
        return base.ReaderExecuting(command, eventData, result);
    }

    public override InterceptionResult<int> NonQueryExecuting(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<int> result)
    {
        _stopwatch.Value = Stopwatch.StartNew();
        return base.NonQueryExecuting(command, eventData, result);
    }

    public override InterceptionResult<object> ScalarExecuting(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<object> result)
    {
        _stopwatch.Value = Stopwatch.StartNew();
        return base.ScalarExecuting(command, eventData, result);
    }

    public override DbDataReader ReaderExecuted(
        DbCommand command,
        CommandExecutedEventData eventData,
        DbDataReader result)
    {
        LogQueryExecuted(command, eventData.Duration);
        return base.ReaderExecuted(command, eventData, result);
    }

    public override int NonQueryExecuted(
        DbCommand command,
        CommandExecutedEventData eventData,
        int result)
    {
        LogQueryExecuted(command, eventData.Duration, result);
        return base.NonQueryExecuted(command, eventData, result);
    }

    public override object? ScalarExecuted(
        DbCommand command,
        CommandExecutedEventData eventData,
        object? result)
    {
        LogQueryExecuted(command, eventData.Duration);
        return base.ScalarExecuted(command, eventData, result);
    }

    public override void CommandFailed(DbCommand command, CommandErrorEventData eventData)
    {
        if (_stopwatch.Value != null)
        {
            var elapsedMs = _stopwatch.Value.Elapsed.TotalMilliseconds;
            _logger.LogError(
                "Query failed after {ElapsedMs}ms: {CommandText}. Exception: {Exception}",
                Math.Round(elapsedMs, 2),
                command.CommandText,
                eventData.Exception.Message);

            _stopwatch.Value.Stop();
            _stopwatch.Value = null;
        }

        base.CommandFailed(command, eventData);
    }

    private void LogQueryExecuted(DbCommand command, TimeSpan duration, int? rowsAffected = null)
    {
        var elapsedMs = duration.TotalMilliseconds;
        var commandText = command.CommandText;

        // Record in diagnostic logger
        _diagnosticLogger?.RecordQuery(commandText, elapsedMs, rowsAffected);

        // Log slow queries
        if (elapsedMs > _slowQueryThresholdMs)
        {
            _logger.LogWarning(
                "Slow query detected ({ElapsedMs}ms): {Query}",
                Math.Round(elapsedMs, 2),
                TruncateQuery(commandText, 300));
        }

        // Stop and reset stopwatch
        if (_stopwatch.Value != null)
        {
            _stopwatch.Value.Stop();
            _stopwatch.Value = null;
        }
    }

    private string TruncateQuery(string query, int maxLength)
    {
        if (query.Length <= maxLength) return query;
        return query.Substring(0, maxLength) + "...";
    }
}
