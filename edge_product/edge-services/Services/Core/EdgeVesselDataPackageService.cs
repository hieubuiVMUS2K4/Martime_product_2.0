using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Npgsql;

namespace MaritimeEdge.Services.Core;

/// <summary>Thông tin một gói dữ liệu tàu (.zip).</summary>
public sealed record VesselDataPackageInfo(
    string FileName, string? VesselImo, string? VesselName, Guid? ShoreVesselId,
    DateTime CreatedAt, long SizeBytes, int Rows, int PendingUploads, int Files);

/// <summary>Kết quả nhập gói dữ liệu vào máy tàu.</summary>
public sealed record VesselDataImportResult(int Inserted, int Updated, int Requeued, int Files, int Tables);

public class VesselDataPackageException(string message) : Exception(message);

public interface IEdgeVesselDataPackageService
{
    /// <summary>Đóng gói TOÀN BỘ dữ liệu riêng của tàu đang chạy (database + tệp đính kèm) vào một file .zip.</summary>
    Task<VesselDataPackageInfo> CreateAsync(EdgeProvisioningProfile? profile, CancellationToken ct = default);

    IReadOnlyList<VesselDataPackageInfo> List();

    /// <summary>Đường dẫn file của gói theo tên; null nếu tên không hợp lệ hoặc không có.</summary>
    string? ResolvePath(string fileName);

    /// <summary>Nhập gói vào tàu ĐANG chạy (phải đúng tàu, đúng phiên bản dữ liệu).</summary>
    Task<VesselDataImportResult> ImportAsync(Stream zip, CancellationToken ct = default);
}

/// <summary>
/// Gói dữ liệu tàu: khi máy tàu đổi sang tàu khác (hoặc làm sạch để nhận lại từ bờ), TRƯỚC khi xoá thì đóng
/// gói toàn bộ dữ liệu của tàu cũ — kể cả phần chưa kịp đồng bộ lên bờ. Máy khác sau này chạy lại tàu đó:
/// nhập gói cấu hình (nhận dữ liệu từ bờ) rồi nhập thêm gói này để bù phần bờ còn thiếu.
///
/// Cấu trúc zip:
///   manifest.json        — tàu, thời điểm, phiên bản dữ liệu (migration), số dòng mỗi bảng
///   data/&lt;bảng&gt;.json     — các dòng của bảng (đúng cột trong database, xuất bằng json_agg)
///   data/users.json      — tài khoản tự tạo cho thuyền viên
///   files/...            — tệp đính kèm trong uploads/ (ảnh, scan giấy tờ, tệp SMS…)
///
/// Nhập: dòng máy chưa có thì thêm; dòng đã có (bờ vừa gửi xuống) thì giữ — trừ dòng tàu cũ CHƯA gửi lên bờ
/// (is_synced = false) thì lấy bản trong gói. Hàng chờ chưa gửi được đưa lại vào hàng chờ để gửi lên bờ.
/// </summary>
public class EdgeVesselDataPackageService(
    EdgeDbContext context,
    IHostEnvironment environment,
    ILogger<EdgeVesselDataPackageService> logger) : IEdgeVesselDataPackageService
{
    public const string Format = "edge-vessel-data";
    public const int FormatVersion = 1;
    public const string FolderName = "vessel-data-packages";

    /// <summary>Trạng thái truyền tệp/đánh dấu của riêng máy cũ — không mang sang máy khác.</summary>
    private static readonly HashSet<string> MachineLocalTables = new(StringComparer.OrdinalIgnoreCase)
    {
        "sync_state", "sync_file_manifests", "sync_file_transfer_requests", "sync_file_chunk_sessions",
    };

    /// <summary>Thư mục tạm trong uploads/ — không đóng gói.</summary>
    private static readonly string[] SkippedUploadFolders = ["sync-staging", "sync-cache"];

    private static readonly Regex SafeFileName = new(@"^[A-Za-z0-9._-]+\.zip$", RegexOptions.Compiled);

    private string Folder => Path.Combine(environment.ContentRootPath, FolderName);
    private string UploadsRoot => Path.Combine(environment.ContentRootPath, "uploads");

    private string SchemaVersion => context.Database.GetMigrations().LastOrDefault() ?? "none";

    public async Task<VesselDataPackageInfo> CreateAsync(EdgeProvisioningProfile? profile, CancellationToken ct = default)
    {
        Directory.CreateDirectory(Folder);
        var ship = await context.ShipData.AsNoTracking().FirstOrDefaultAsync(ct);
        var imo = profile?.VesselImo ?? ship?.ImoNumber;
        var createdAt = DateTime.UtcNow;
        var fileName = $"du-lieu-tau_{Slug(imo ?? "khong-ro")}_{createdAt:yyyyMMdd-HHmmss}.zip";
        var path = Path.Combine(Folder, fileName);
        var tempPath = path + ".part";

        var tables = new Dictionary<string, int>();
        var pending = await context.SyncQueue.AsNoTracking().CountAsync(q => q.SyncedAt == null, ct);
        var fileCount = 0;

        try
        {
            await using (var output = File.Create(tempPath))
            using (var zip = new ZipArchive(output, ZipArchiveMode.Create))
            {
                var connection = await OpenConnectionAsync(ct);
                foreach (var (name, schema) in EdgeVesselSwitchService.VesselTablesInDeleteOrder(context.Model))
                {
                    if (MachineLocalTables.Contains(name)) continue;
                    var count = await WriteTableAsync(zip, connection, $"data/{name}.json",
                        $"SELECT count(*)::int, coalesce(json_agg(t), '[]'::json)::text FROM {Quote(name, schema)} t", ct);
                    tables[name] = count;
                }
                // Tài khoản tự tạo cho thuyền viên (bảng users được giữ khi đổi tàu, nhưng các tài khoản này bị xoá theo thuyền viên).
                tables["users"] = await WriteTableAsync(zip, connection, "data/users.json",
                    """SELECT count(*)::int, coalesce(json_agg(t), '[]'::json)::text FROM users t WHERE crew_id IS NOT NULL""", ct);

                fileCount = AddUploads(zip);

                var manifest = new
                {
                    format = Format,
                    version = FormatVersion,
                    schemaVersion = SchemaVersion,
                    createdAt,
                    vesselImo = imo,
                    vesselName = profile?.VesselName ?? ship?.ShipName,
                    shoreVesselId = profile?.VesselId,
                    nodeId = profile?.NodeId,
                    pendingUploads = pending,
                    files = fileCount,
                    tables,
                };
                await WriteEntryAsync(zip, "manifest.json", JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true }), ct);
            }
            File.Move(tempPath, path, overwrite: true);
        }
        catch
        {
            if (File.Exists(tempPath)) File.Delete(tempPath);
            throw;
        }

        var info = new VesselDataPackageInfo(fileName, imo, profile?.VesselName ?? ship?.ShipName, profile?.VesselId,
            createdAt, new FileInfo(path).Length, tables.Values.Sum(), pending, fileCount);
        logger.LogWarning("[VESSEL-DATA] Đã đóng gói dữ liệu tàu {Imo}: {Rows} dòng, {Files} tệp, {Pending} thay đổi chưa gửi bờ → {File}",
            imo, info.Rows, fileCount, pending, fileName);
        return info;
    }

    public IReadOnlyList<VesselDataPackageInfo> List()
    {
        if (!Directory.Exists(Folder)) return [];
        var result = new List<VesselDataPackageInfo>();
        foreach (var file in new DirectoryInfo(Folder).GetFiles("*.zip").OrderByDescending(f => f.CreationTimeUtc))
        {
            try
            {
                using var zip = ZipFile.OpenRead(file.FullName);
                var m = ReadManifest(zip);
                result.Add(new VesselDataPackageInfo(file.Name, m.VesselImo, m.VesselName, m.ShoreVesselId, m.CreatedAt,
                    file.Length, m.Tables.Values.Sum(), m.PendingUploads, m.Files));
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "[VESSEL-DATA] Bỏ qua gói hỏng {File}", file.Name);
            }
        }
        return result;
    }

    public string? ResolvePath(string fileName)
    {
        if (!SafeFileName.IsMatch(fileName)) return null;
        var path = Path.Combine(Folder, fileName);
        return File.Exists(path) ? path : null;
    }

    public async Task<VesselDataImportResult> ImportAsync(Stream zipStream, CancellationToken ct = default)
    {
        using var zip = new ZipArchive(zipStream, ZipArchiveMode.Read);
        var manifest = ReadManifest(zip);

        var profile = await context.EdgeProvisioningProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.IsActive, ct)
            ?? throw new VesselDataPackageException("Máy chưa kích hoạt gói cấu hình nào. Hãy nhập và kích hoạt gói cấu hình của tàu trước.");
        if (manifest.ShoreVesselId != profile.VesselId ||
            !string.Equals(manifest.VesselImo, profile.VesselImo, StringComparison.OrdinalIgnoreCase))
            throw new VesselDataPackageException(
                $"Gói dữ liệu của tàu {manifest.VesselName} (IMO {manifest.VesselImo}), máy đang chạy {profile.VesselName} (IMO {profile.VesselImo}).");
        if (manifest.SchemaVersion != SchemaVersion)
            throw new VesselDataPackageException(
                $"Gói tạo từ phiên bản dữ liệu {manifest.SchemaVersion}, máy đang ở {SchemaVersion}. Cập nhật phần mềm cho cùng phiên bản rồi nhập lại.");

        var model = context.Model;
        var entities = EdgeVesselSwitchService.VesselEntities(model);
        var order = EdgeVesselSwitchService.VesselTablesInDeleteOrder(model);
        order.Reverse(); // bảng cha trước

        int inserted = 0, updated = 0, requeued = 0, tablesTouched = 0;
        var connection = await OpenConnectionAsync(ct);
        await using var tx = await connection.BeginTransactionAsync(ct);

        // ship_data: máy mới tạo một bản từ gói cấu hình (khác Id). Thay bằng bản của tàu cũ — đầy đủ hơn, và các
        // bảng thông số máy/chân vịt… trỏ vào Id cũ.
        if (zip.GetEntry("data/ship_data.json") is { } shipEntry && ReadJson(shipEntry) is var shipJson && shipJson != "[]")
            await ReplaceShipDataAsync(connection, tx, shipJson, entities, ct);

        foreach (var (name, schema) in order)
        {
            if (MachineLocalTables.Contains(name)) continue;
            if (zip.GetEntry($"data/{name}.json") is not { } entry) continue;
            var json = ReadJson(entry);
            if (json == "[]") continue;
            tablesTouched++;
            var table = Quote(name, schema);

            if (name.Equals("sync_queue", StringComparison.OrdinalIgnoreCase))
            {
                // Chỉ thay đổi CHƯA gửi lên bờ; Id do máy này cấp.
                var cols = await ColumnsAsync(connection, tx, name, schema, ct);
                var list = string.Join(", ", cols.Where(c => c != "id").Select(c => Quote(c)));
                requeued += await ExecAsync(connection, tx,
                    $"INSERT INTO {table} ({list}) SELECT {list} FROM json_populate_recordset(NULL::{table}, @json::json) WHERE synced_at IS NULL ON CONFLICT DO NOTHING",
                    json, ct);
                await FixSequencesAsync(connection, tx, name, schema, ct);
                continue;
            }

            var entity = entities.First(e => e.GetTableName() == name && e.GetSchema() == schema);
            var key = entity.FindPrimaryKey()!.Properties
                .Select(p => p.GetColumnName(StoreObjectIdentifier.Table(name, schema))!).ToList();
            var columns = await ColumnsAsync(connection, tx, name, schema, ct);
            var conflict = string.Join(", ", key.Select(c => Quote(c)));
            var colList = string.Join(", ", columns.Select(c => Quote(c)));

            string sql;
            if (columns.Contains("is_synced"))
            {
                // Dòng tàu cũ chưa gửi lên bờ thắng bản bờ vừa gửi xuống; còn lại giữ bản đang có.
                var nonKey = columns.Where(c => !key.Contains(c)).ToList();
                var set = string.Join(", ", nonKey.Select(c => $"{Quote(c)} = EXCLUDED.{Quote(c)}"));
                sql = $"""
                    WITH r AS (
                      INSERT INTO {table} ({colList}) SELECT {colList} FROM json_populate_recordset(NULL::{table}, @json::json)
                      ON CONFLICT ({conflict}) DO UPDATE SET {set} WHERE EXCLUDED.is_synced = false
                      RETURNING (xmax = 0) AS ins)
                    SELECT count(*) FILTER (WHERE ins)::int, count(*) FILTER (WHERE NOT ins)::int FROM r
                    """;
            }
            else
            {
                sql = $"""
                    WITH r AS (
                      INSERT INTO {table} ({colList}) SELECT {colList} FROM json_populate_recordset(NULL::{table}, @json::json)
                      ON CONFLICT ({conflict}) DO NOTHING RETURNING 1)
                    SELECT count(*)::int, 0 FROM r
                    """;
            }
            var (ins, upd) = await QueryPairAsync(connection, tx, sql, json, ct);
            inserted += ins;
            updated += upd;
            await FixSequencesAsync(connection, tx, name, schema, ct);
        }

        // Tài khoản thuyền viên: chỉ cho thuyền viên có trên máy, Id do máy này cấp, trùng tên đăng nhập thì giữ bản đang có.
        if (zip.GetEntry("data/users.json") is { } usersEntry && ReadJson(usersEntry) is var usersJson && usersJson != "[]")
        {
            var cols = await ColumnsAsync(connection, tx, "users", null, ct);
            var list = string.Join(", ", cols.Where(c => c != "id").Select(c => Quote(c)));
            inserted += await ExecAsync(connection, tx,
                $"INSERT INTO users ({list}) SELECT {list} FROM json_populate_recordset(NULL::users, @json::json) u WHERE u.crew_id IN (SELECT crew_id FROM crew_members) ON CONFLICT DO NOTHING",
                usersJson, ct);
            await FixSequencesAsync(connection, tx, "users", null, ct);
        }

        await tx.CommitAsync(ct);
        var files = ExtractUploads(zip);
        logger.LogWarning("[VESSEL-DATA] Đã nhập gói dữ liệu tàu {Imo}: thêm {Inserted}, cập nhật {Updated}, đưa lại hàng chờ {Requeued}, {Files} tệp",
            manifest.VesselImo, inserted, updated, requeued, files);
        return new VesselDataImportResult(inserted, updated, requeued, files, tablesTouched);
    }

    // ───────────────────────────── Hỗ trợ ─────────────────────────────

    private sealed record Manifest(string? VesselImo, string? VesselName, Guid? ShoreVesselId, DateTime CreatedAt,
        string SchemaVersion, int PendingUploads, int Files, Dictionary<string, int> Tables);

    private static Manifest ReadManifest(ZipArchive zip)
    {
        var entry = zip.GetEntry("manifest.json") ?? throw new VesselDataPackageException("File không phải gói dữ liệu tàu (thiếu manifest.json).");
        using var doc = JsonDocument.Parse(ReadJson(entry));
        var root = doc.RootElement;
        if (!root.TryGetProperty("format", out var f) || f.GetString() != Format)
            throw new VesselDataPackageException("File không phải gói dữ liệu tàu.");
        if (!root.TryGetProperty("version", out var v) || v.GetInt32() != FormatVersion)
            throw new VesselDataPackageException("Gói dữ liệu tạo bằng phiên bản khác, không đọc được.");
        string? Str(string name) => root.TryGetProperty(name, out var e) && e.ValueKind == JsonValueKind.String ? e.GetString() : null;
        var tables = root.TryGetProperty("tables", out var t)
            ? t.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetInt32())
            : new Dictionary<string, int>();
        return new Manifest(
            Str("vesselImo"), Str("vesselName"),
            Guid.TryParse(Str("shoreVesselId"), out var g) ? g : null,
            root.TryGetProperty("createdAt", out var c) ? c.GetDateTime() : DateTime.MinValue,
            Str("schemaVersion") ?? "none",
            root.TryGetProperty("pendingUploads", out var p) ? p.GetInt32() : 0,
            root.TryGetProperty("files", out var fl) ? fl.GetInt32() : 0,
            tables);
    }

    private async Task<NpgsqlConnection> OpenConnectionAsync(CancellationToken ct)
    {
        var connection = (NpgsqlConnection)context.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open) await connection.OpenAsync(ct);
        return connection;
    }

    private static async Task<int> WriteTableAsync(ZipArchive zip, NpgsqlConnection connection, string entryName, string sql, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(sql, connection) { CommandTimeout = 0 };
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        await reader.ReadAsync(ct);
        var count = reader.GetInt32(0);
        await WriteEntryAsync(zip, entryName, reader.GetString(1), ct);
        return count;
    }

    private static async Task WriteEntryAsync(ZipArchive zip, string name, string content, CancellationToken ct)
    {
        await using var stream = zip.CreateEntry(name, CompressionLevel.Optimal).Open();
        await stream.WriteAsync(Encoding.UTF8.GetBytes(content), ct);
    }

    private static string ReadJson(ZipArchiveEntry entry)
    {
        using var reader = new StreamReader(entry.Open(), Encoding.UTF8);
        return reader.ReadToEnd();
    }

    private static async Task<int> ExecAsync(NpgsqlConnection connection, NpgsqlTransaction tx, string sql, string json, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(sql, connection, tx) { CommandTimeout = 0 };
        cmd.Parameters.AddWithValue("json", json);
        return await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task<(int, int)> QueryPairAsync(NpgsqlConnection connection, NpgsqlTransaction tx, string sql, string json, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(sql, connection, tx) { CommandTimeout = 0 };
        cmd.Parameters.AddWithValue("json", json);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        await reader.ReadAsync(ct);
        return (reader.GetInt32(0), reader.GetInt32(1));
    }

    private static async Task<List<string>> ColumnsAsync(NpgsqlConnection connection, NpgsqlTransaction tx, string table, string? schema, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(
            "SELECT column_name FROM information_schema.columns WHERE table_schema = @s AND table_name = @t AND is_generated = 'NEVER' ORDER BY ordinal_position",
            connection, tx);
        cmd.Parameters.AddWithValue("s", schema ?? "public");
        cmd.Parameters.AddWithValue("t", table);
        var result = new List<string>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) result.Add(reader.GetString(0));
        return result;
    }

    /// <summary>Sau khi chèn dòng mang Id cũ, đẩy bộ đếm Id lên quá Id lớn nhất — nếu không lần thêm mới sau sẽ trùng.</summary>
    private static async Task FixSequencesAsync(NpgsqlConnection connection, NpgsqlTransaction tx, string table, string? schema, CancellationToken ct)
    {
        var qualified = schema == null ? Quote(table) : $"{Quote(schema)}.{Quote(table)}";
        await using var find = new NpgsqlCommand("""
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = @s AND table_name = @t AND (column_default LIKE 'nextval%' OR is_identity = 'YES')
            """, connection, tx);
        find.Parameters.AddWithValue("s", schema ?? "public");
        find.Parameters.AddWithValue("t", table);
        var columns = new List<string>();
        await using (var reader = await find.ExecuteReaderAsync(ct))
            while (await reader.ReadAsync(ct)) columns.Add(reader.GetString(0));

        foreach (var column in columns)
        {
            await using var fix = new NpgsqlCommand(
                $"SELECT setval(pg_get_serial_sequence(@q, @c), coalesce((SELECT max({Quote(column)}) FROM {qualified}), 0) + 1, false) WHERE pg_get_serial_sequence(@q, @c) IS NOT NULL",
                connection, tx);
            fix.Parameters.AddWithValue("q", qualified);
            fix.Parameters.AddWithValue("c", column);
            await fix.ExecuteNonQueryAsync(ct);
        }
    }

    /// <summary>Xoá bản ship_data máy mới tự tạo (và các dòng con trỏ vào nó) để nhận bản của tàu cũ.</summary>
    private static async Task ReplaceShipDataAsync(NpgsqlConnection connection, NpgsqlTransaction tx, string shipJson, List<IEntityType> entities, CancellationToken ct)
    {
        var ship = entities.FirstOrDefault(e => e.GetTableName() == "ship_data");
        if (ship == null) return;
        var keep = "(SELECT id FROM json_populate_recordset(NULL::ship_data, @json::json))";
        foreach (var dependent in entities)
        foreach (var fk in dependent.GetForeignKeys().Where(fk => fk.PrincipalEntityType == ship))
        {
            var table = dependent.GetTableName()!;
            var col = fk.Properties.Single().GetColumnName(StoreObjectIdentifier.Table(table, dependent.GetSchema()))!;
            await using var cmd = new NpgsqlCommand($"DELETE FROM {Quote(table, dependent.GetSchema())} WHERE {Quote(col)} NOT IN {keep}", connection, tx);
            cmd.Parameters.AddWithValue("json", shipJson);
            await cmd.ExecuteNonQueryAsync(ct);
        }
        await using var del = new NpgsqlCommand($"DELETE FROM ship_data WHERE id NOT IN {keep}", connection, tx);
        del.Parameters.AddWithValue("json", shipJson);
        await del.ExecuteNonQueryAsync(ct);
    }

    private int AddUploads(ZipArchive zip)
    {
        if (!Directory.Exists(UploadsRoot)) return 0;
        var count = 0;
        foreach (var file in Directory.EnumerateFiles(UploadsRoot, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(UploadsRoot, file).Replace('\\', '/');
            if (SkippedUploadFolders.Any(f => relative.StartsWith(f + "/", StringComparison.OrdinalIgnoreCase))) continue;
            zip.CreateEntryFromFile(file, "files/" + relative, CompressionLevel.Fastest);
            count++;
        }
        return count;
    }

    /// <summary>Chép tệp đính kèm còn thiếu (không ghi đè tệp đang có), chặn đường dẫn thoát khỏi uploads/.</summary>
    private int ExtractUploads(ZipArchive zip)
    {
        var root = Path.GetFullPath(UploadsRoot) + Path.DirectorySeparatorChar;
        var count = 0;
        foreach (var entry in zip.Entries.Where(e => e.FullName.StartsWith("files/", StringComparison.Ordinal) && e.Name.Length > 0))
        {
            var target = Path.GetFullPath(Path.Combine(UploadsRoot, entry.FullName["files/".Length..]));
            if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase) || File.Exists(target)) continue;
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            entry.ExtractToFile(target);
            count++;
        }
        return count;
    }

    private static string Slug(string value) => Regex.Replace(value, "[^A-Za-z0-9-]", "-");

    private static string Quote(string identifier) => "\"" + identifier.Replace("\"", "\"\"") + "\"";

    private static string Quote(string name, string? schema) => schema == null ? Quote(name) : $"{Quote(schema)}.{Quote(name)}";
}
