using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using ProductApi.Data;
using ProductApi.Services.Crew;
using ProductApi.Services.Sync;
using Maritime.Shared.DTOs.Crew;

var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("SEED_CONNECTION"));
connection.Host = "127.0.0.1";
connection.Port = int.Parse(Environment.GetEnvironmentVariable("SEED_PORT")!);
await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection.ConnectionString).Options);
var vessel = await db.Vessels.SingleAsync(v => v.IMO == "9278367");
var crew = await db.CrewMembers.AsNoTracking().Where(c => c.VesselId == vessel.Id && c.IsOnboard)
    .Select(c => new { c.Id, c.CrewId, c.RankId, c.CountryId }).ToListAsync();
if (crew.Count != 19) throw new InvalidOperationException($"Expected 19 onboard crew, found {crew.Count}; nothing written.");
var ranks = await db.Ranks.AsNoTracking().ToDictionaryAsync(r => r.Id, r => r.RankCode);
var catalog = await db.CrewCertificateTypes.AsNoTracking().Where(c => c.IsActive).ToDictionaryAsync(c => c.CertificateCode);
var existing = await db.CrewCertificates.AsNoTracking().Where(c => crew.Select(m => m.Id).Contains(c.CrewMemberId))
    .Select(c => new { c.CrewMemberId, c.CertificateId }).ToListAsync();
var pairs = existing.Select(c => (c.CrewMemberId,c.CertificateId)).ToHashSet();
var assignments = await db.RankCertificates.AsNoTracking().ToListAsync();
// EnqueueAsync only serializes metadata; no attachment files are created by this tool.
var storage = new LocalSyncFileStorageService(null!);
var outbox = new SyncOutboxService(db, NullLogger<SyncOutboxService>.Instance, storage);
var service = new CertificateService(db, NullLogger<CertificateService>.Instance, outbox);
var apply = args.Contains("--apply"); int created=0, skipped=0;
await using var transaction = apply ? await db.Database.BeginTransactionAsync() : null;
if (apply) await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(927836719)");
foreach (var member in crew)
{
    var rank = member.RankId.HasValue ? ranks.GetValueOrDefault(member.RankId.Value, "") : "";
    var codes = new HashSet<string>(new[] { "BST", "SA", "MEDICAL" });
    if (new[] { "CAPT", "C/O", "2/O", "3/O", "4/O" }.Contains(rank))
        codes.UnionWith(new[] { "COC-DECK", "GMDSS-GOC", "PSC", "AFF", "MFA", "ECDIS", "BRM" });
    if (new[] { "C/E", "2/E", "3/E", "4/E" }.Contains(rank))
        codes.UnionWith(new[] { "COC-ENGINE", "PSC", "AFF", "MFA", "ERM" });
    if (rank == "ETO") codes.UnionWith(new[] { "COC-ETO", "AFF", "MFA" });
    if (rank is "CAPT" or "C/O") codes.UnionWith(new[] { "SSO", "MC" });
    if (rank is "BOSN" or "AB" or "OS" or "OILR" or "FITR" or "WIPR") codes.Add("PSC");
    foreach (var required in assignments.Where(a => a.RankId == member.RankId))
        foreach (var cert in catalog.Values.Where(c => c.Id == required.CertificateId)) codes.Add(cert.CertificateCode);
    foreach (var code in codes.Order())
    {
        if (!catalog.TryGetValue(code, out var certificate)) throw new InvalidOperationException($"Missing catalog code {code}");
        if (!pairs.Add((member.Id,certificate.Id))) { skipped++; continue; }
        created++;
        if (!apply) continue;
        var issue = new DateTime(2026,7,1,0,0,0,DateTimeKind.Utc);
        var months = certificate.ValidityPeriodMonths is > 0 ? certificate.ValidityPeriodMonths.Value : code == "MEDICAL" ? 24 : 60;
        await service.AddCrewCertificateAsync(new CrewCertificateRequest {
            CrewMemberId=member.Id, CertificateId=certificate.Id,
            CertificateNumber=$"TH-9278367-{member.Id.ToString("N")[..8].ToUpperInvariant()}-{code}",
            IssueDate=issue, ExpiryDate=issue.AddMonths(months), CountryId=member.CountryId,
            IssuingAuthority="Hồ sơ thực hành hàng hải",
            Notes="Hồ sơ phục vụ thực hành quản lý chứng chỉ, chưa xác minh với bản gốc; không thay thế chứng chỉ được cấp."
        });
    }
}
if (transaction != null) await transaction.CommitAsync();
Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new { vessel=vessel.IMO, onboardCrew=crew.Count, apply, created, skipped }));
