using Maritime.Shared.Models.Crew;
using Microsoft.EntityFrameworkCore;

namespace ProductApi.Data;

/// <summary>Company rank catalogue. Existing and inactive records remain under company control.</summary>
public static class RankSeedData
{
    public static async Task<int> SeedAsync(AppDbContext db, CancellationToken token = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(token);
        // Serialize startup seeds across multiple Shore instances.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(2026100601)", token);
        var codes = (await db.Ranks.Select(r => r.RankCode).ToListAsync(token))
            .Select(c => c.Trim()).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var definitions = new (string Code, string Name, string Department, string Level)[]
        {
            ("CAPT", "Thuyền trưởng", "DECK", "Sĩ quan quản lý"),
            ("C/O", "Đại phó", "DECK", "Sĩ quan quản lý"),
            ("2/O", "Phó hai", "DECK", "Sĩ quan vận hành"),
            ("3/O", "Phó ba", "DECK", "Sĩ quan vận hành"),
            ("4/O", "Phó tư", "DECK", "Sĩ quan vận hành"),
            ("BOSN", "Thủy thủ trưởng", "DECK", "Thuyền viên hỗ trợ"),
            ("AB", "Thủy thủ trực ca", "DECK", "Thuyền viên hỗ trợ"),
            ("OS", "Thủy thủ thường", "DECK", "Thuyền viên hỗ trợ"),
            ("DPUMP", "Thợ bơm", "DECK", "Thuyền viên hỗ trợ"),
            ("DCAD", "Thực tập sinh boong", "DECK", "Thực tập sinh"),
            ("C/E", "Máy trưởng", "ENGINE", "Sĩ quan quản lý"),
            ("2/E", "Máy hai", "ENGINE", "Sĩ quan quản lý"),
            ("3/E", "Máy ba", "ENGINE", "Sĩ quan vận hành"),
            ("4/E", "Máy tư", "ENGINE", "Sĩ quan vận hành"),
            ("ETO", "Sĩ quan kỹ thuật điện", "ENGINE", "Sĩ quan vận hành"),
            ("ELEC", "Thợ điện", "ENGINE", "Thuyền viên hỗ trợ"),
            ("FITR", "Thợ sửa chữa máy", "ENGINE", "Thuyền viên hỗ trợ"),
            ("OILR", "Thợ máy trực ca", "ENGINE", "Thuyền viên hỗ trợ"),
            ("WIPR", "Thợ máy thường", "ENGINE", "Thuyền viên hỗ trợ"),
            ("ECAD", "Thực tập sinh máy", "ENGINE", "Thực tập sinh"),
            ("COOK", "Bếp trưởng", "CATERING", "Thuyền viên hỗ trợ"),
            ("2COOK", "Phụ bếp", "CATERING", "Thuyền viên hỗ trợ"),
            ("STWD", "Phục vụ", "CATERING", "Thuyền viên hỗ trợ"),
            ("RADIO", "Sĩ quan vô tuyến điện", "OTHER", "Sĩ quan vận hành"),
            ("MEDIC", "Nhân viên y tế", "OTHER", "Chuyên môn")
        };
        var added = 0;
        for (var i = 0; i < definitions.Length; i++)
        {
            var rank = definitions[i];
            // Legacy datasets use MAST for Captain. Do not introduce a duplicate title.
            if (rank.Code == "CAPT" && codes.Contains("MAST")) continue;
            if (!codes.Add(rank.Code)) continue;
            db.Ranks.Add(new Rank
            {
                RankCode = rank.Code, RankName = rank.Name, Department = rank.Department,
                Level = rank.Level, SortOrder = (i + 1) * 10
            });
            added++;
        }
        // AppDbContext atomically writes rank snapshots to the existing broadcast outbox.
        if (added > 0) await db.SaveChangesAsync(token);
        await transaction.CommitAsync(token);
        return added;
    }
}
