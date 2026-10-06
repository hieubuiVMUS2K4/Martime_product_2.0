using Microsoft.EntityFrameworkCore;
using Maritime.Shared.DTOs.Crew;
using Maritime.Shared.Constants;
using Maritime.Shared.Models.Crew;
using Maritime.Shared.Models.Sync;
using ProductApi.Data;
using ProductApi.Services.Sync;

namespace ProductApi.Services.Crew;

/// <summary>
/// Certificate management service for Shore side.
/// Handles certificate type CRUD and fleet-level monitoring.
/// Broadcasts changes to SyncOutbox for edge nodes.
/// </summary>
public class CertificateService : ICertificateService
{
    private readonly AppDbContext _context;
    private readonly ILogger<CertificateService> _logger;
    private readonly ISyncOutboxService? _syncOutbox;

    public CertificateService(AppDbContext context, ILogger<CertificateService> logger, ISyncOutboxService? syncOutbox = null)
    {
        _context = context;
        _logger = logger;
        _syncOutbox = syncOutbox;
    }

    // ============================================================
    // CERTIFICATE TYPES (Master Data)
    // ============================================================

    public async Task<List<CertificateDto>> GetAllCertificateTypesAsync(string? category = null, int? rankId = null)
    {
        var query = _context.CrewCertificateTypes.AsNoTracking()
            .Where(c => c.IsActive)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(category))
            query = query.Where(c => c.Category == category.ToUpper());

        if (rankId.HasValue)
        {
            var certIdsForRank = await _context.RankCertificates
                .AsNoTracking()
                .Where(rc => rc.RankId == rankId.Value)
                .Select(rc => rc.CertificateId)
                .ToListAsync();

            var certIdsForRankSet = new HashSet<int>(certIdsForRank);

            var certs = await query
                .OrderBy(c => c.Category).ThenBy(c => c.CertificateName)
                .ToListAsync();

            return certs.Select(c => {
                var dto = MapToDto(c);
                dto.IsRequiredForRank = certIdsForRankSet.Contains(c.Id);
                return dto;
            })
            .OrderByDescending(c => c.IsRequiredForRank)
            .ThenBy(c => c.Category)
            .ThenBy(c => c.CertificateName)
            .ToList();
        }

        return await query
            .OrderBy(c => c.Category).ThenBy(c => c.CertificateName)
            .Select(c => MapToDto(c))
            .ToListAsync();
    }

    public async Task<CertificateDto?> GetCertificateTypeByIdAsync(int id)
    {
        var cert = await _context.CrewCertificateTypes.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id);
        return cert == null ? null : MapToDto(cert);
    }

    public async Task<CertificateDto> CreateCertificateTypeAsync(CreateCertificateRequest request)
    {
        var cert = new Certificate
        {
            CertificateCode = request.CertificateCode,
            CertificateName = request.CertificateName,
            Category = request.Category?.ToUpper(),
            ValidityPeriodMonths = request.ValidityPeriodMonths,
            Description = request.Description,
            IssuingAuthority = request.IssuingAuthority,
            IsMandatory = request.IsMandatory,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.CrewCertificateTypes.Add(cert);
        await _context.SaveChangesAsync();

        // Save country mappings
        if (request.CountryIds?.Count > 0)
        {
            foreach (var countryId in request.CountryIds)
                _context.CountryCertificates.Add(new CountryCertificate { CertificateId = cert.Id, CountryId = countryId, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow });
            await _context.SaveChangesAsync();
        }

        // Save rank mappings
        if (request.RankIds?.Count > 0)
        {
            foreach (var rankId in request.RankIds)
                _context.RankCertificates.Add(new RankCertificate { CertificateId = cert.Id, RankId = rankId, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow });
            await _context.SaveChangesAsync();
        }

        _logger.LogInformation("Created certificate type {Code} - {Name}", cert.CertificateCode, cert.CertificateName);

        // Danh mục loại chứng chỉ do BỜ làm chủ và phát xuống MỌI tàu — giống danh mục vật tư
        // (material_item_catalog). Không còn khái niệm gán chứng chỉ cho từng tàu.
        if (_syncOutbox != null)
        {
            await _syncOutbox.BroadcastAsync("certificate", cert.Id.ToString(), SyncActionType.CREATE, cert);
            await BroadcastCountryRankMappingsAsync(cert.Id);
        }

        return MapToDto(cert);
    }

    public async Task<CertificateDto?> UpdateCertificateTypeAsync(int id, CreateCertificateRequest request)
    {
        var cert = await _context.CrewCertificateTypes.AsTracking().FirstOrDefaultAsync(c => c.Id == id);
        if (cert == null) return null;

        cert.CertificateCode = request.CertificateCode;
        cert.CertificateName = request.CertificateName;
        cert.Category = request.Category?.ToUpper();
        cert.ValidityPeriodMonths = request.ValidityPeriodMonths;
        cert.Description = request.Description;
        cert.IssuingAuthority = request.IssuingAuthority;
        cert.IsMandatory = request.IsMandatory;
        cert.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        // Mapping quốc tịch/chức danh: CHỈ thêm–bớt phần chênh lệch, không xoá sạch rồi tạo lại.
        //
        // Cách cũ (xoá hết + insert lại) cấp Id mới cho cả những mapping không hề đổi. Bờ và tàu
        // vì thế đánh số khác nhau cho cùng một cặp giá trị — ngày 02/08/2026 đối soát thấy
        // country_certificates dòng 74/76 bị hoán đổi giữa hai phía, và vì tàu có unique index
        // (country_id, certificate_id) nên phát lại nguyên trạng là vi phạm ràng buộc theo cả hai
        // thứ tự. Nó cũng là nguồn của sequence drift (tàu: max id 106 mà dãy số ở 76).
        var removedCountryMappingIds = new List<int>();
        var addedCountryMappings = new List<CountryCertificate>();

        if (request.CountryIds != null)
        {
            var current = await _context.CountryCertificates.Where(cc => cc.CertificateId == id).ToListAsync();
            var wanted = request.CountryIds.Distinct().ToHashSet();

            var toRemove = current.Where(cc => !wanted.Contains(cc.CountryId)).ToList();
            removedCountryMappingIds = toRemove.Select(cc => cc.Id).ToList();
            _context.CountryCertificates.RemoveRange(toRemove);

            foreach (var countryId in wanted.Where(c => !current.Any(cc => cc.CountryId == c)))
            {
                var row = new CountryCertificate { CertificateId = id, CountryId = countryId, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
                _context.CountryCertificates.Add(row);
                addedCountryMappings.Add(row);
            }

            // Xoá trước rồi mới thêm, tránh đụng unique index khi một cặp vừa bị bỏ vừa được thêm lại.
            await _context.SaveChangesAsync();
        }

        var removedRankMappingIds = new List<int>();
        var addedRankMappings = new List<RankCertificate>();

        if (request.RankIds != null)
        {
            var current = await _context.RankCertificates.Where(rc => rc.CertificateId == id).ToListAsync();
            var wanted = request.RankIds.Distinct().ToHashSet();

            var toRemove = current.Where(rc => !wanted.Contains(rc.RankId)).ToList();
            removedRankMappingIds = toRemove.Select(rc => rc.Id).ToList();
            _context.RankCertificates.RemoveRange(toRemove);

            foreach (var rankId in wanted.Where(r => !current.Any(rc => rc.RankId == r)))
            {
                var row = new RankCertificate { CertificateId = id, RankId = rankId, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
                _context.RankCertificates.Add(row);
                addedRankMappings.Add(row);
            }

            await _context.SaveChangesAsync();
        }

        // Phát xuống MỌI tàu. Chỉ gửi phần thay đổi: mapping giữ nguyên thì tàu không cần biết.
        if (_syncOutbox != null)
        {
            await _syncOutbox.BroadcastAsync("certificate", cert.Id.ToString(), SyncActionType.UPDATE, cert);

            foreach (var oldId in removedCountryMappingIds)
                await _syncOutbox.BroadcastAsync("country_certificate", oldId.ToString(), SyncActionType.DELETE, new { Id = oldId });
            foreach (var oldId in removedRankMappingIds)
                await _syncOutbox.BroadcastAsync("rank_certificate", oldId.ToString(), SyncActionType.DELETE, new { Id = oldId });

            foreach (var cc in addedCountryMappings)
                await _syncOutbox.BroadcastAsync("country_certificate", cc.Id.ToString(), SyncActionType.CREATE, cc);
            foreach (var rc in addedRankMappings)
                await _syncOutbox.BroadcastAsync("rank_certificate", rc.Id.ToString(), SyncActionType.CREATE, rc);
        }

        return MapToDto(cert);
    }

    /// <summary>
    /// Phát toàn bộ mapping quốc tịch + chức danh của một loại chứng chỉ xuống MỌI tàu.
    /// Dùng khi tạo mới loại chứng chỉ và khi đồng bộ lại toàn bộ danh mục.
    /// </summary>
    private async Task BroadcastCountryRankMappingsAsync(int certificateId)
    {
        if (_syncOutbox == null) return;

        var countryCerts = await _context.CountryCertificates
            .AsNoTracking()
            .Where(cc => cc.CertificateId == certificateId)
            .ToListAsync();
        foreach (var cc in countryCerts)
            await _syncOutbox.BroadcastAsync("country_certificate", cc.Id.ToString(), SyncActionType.CREATE, cc);

        var rankCerts = await _context.RankCertificates
            .AsNoTracking()
            .Where(rc => rc.CertificateId == certificateId)
            .ToListAsync();
        foreach (var rc in rankCerts)
            await _syncOutbox.BroadcastAsync("rank_certificate", rc.Id.ToString(), SyncActionType.CREATE, rc);

        _logger.LogInformation("Broadcast {CC} country + {RC} rank mappings for certificate {Id} → tất cả tàu",
            countryCerts.Count, rankCerts.Count, certificateId);
    }

    /// <summary>
    /// Đồng bộ TOÀN BỘ danh mục loại chứng chỉ xuống mọi tàu (initial/full resync).
    /// Đối xứng với MaterialController.BroadcastAllCatalog cho danh mục vật tư.
    /// Phát loại chứng chỉ trước, rồi tới mapping vì mapping tham chiếu certificate_id.
    /// </summary>
    public async Task<(int Certificates, int CountryMappings, int RankMappings)> BroadcastAllCertificateTypesAsync()
    {
        if (_syncOutbox == null) return (0, 0, 0);

        var certs = await _context.CrewCertificateTypes.AsNoTracking().ToListAsync();
        foreach (var c in certs)
            await _syncOutbox.BroadcastAsync("certificate", c.Id.ToString(), SyncActionType.CREATE, c);

        var countryCerts = await _context.CountryCertificates.AsNoTracking().ToListAsync();
        foreach (var cc in countryCerts)
            await _syncOutbox.BroadcastAsync("country_certificate", cc.Id.ToString(), SyncActionType.CREATE, cc);

        var rankCerts = await _context.RankCertificates.AsNoTracking().ToListAsync();
        foreach (var rc in rankCerts)
            await _syncOutbox.BroadcastAsync("rank_certificate", rc.Id.ToString(), SyncActionType.CREATE, rc);

        _logger.LogInformation("Đã phát toàn bộ danh mục chứng chỉ xuống mọi tàu: {C} loại, {CC} quốc tịch, {RC} chức danh",
            certs.Count, countryCerts.Count, rankCerts.Count);

        return (certs.Count, countryCerts.Count, rankCerts.Count);
    }

    public async Task<bool> DeleteCertificateTypeAsync(int id)
    {
        var cert = await _context.CrewCertificateTypes.AsTracking().FirstOrDefaultAsync(c => c.Id == id);
        if (cert == null) return false;

        // Soft delete: mark inactive
        cert.IsActive = false;
        cert.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        _logger.LogInformation("Deactivated certificate type {Code}", cert.CertificateCode);

        // Xoá mềm: phát cờ IsActive=false xuống MỌI tàu để loại này biến khỏi danh sách chọn.
        if (_syncOutbox != null)
            await _syncOutbox.BroadcastAsync("certificate", cert.Id.ToString(), SyncActionType.UPDATE, cert);

        return true;
    }

    // ============================================================
    // CREW CERTIFICATES
    // ============================================================

    public async Task<List<CrewCertificateDto>> GetCrewCertificatesAsync(Guid crewMemberId)
    {
        return await _context.CrewCertificates
            .AsNoTracking()
            .Include(cc => cc.Certificate)
            .Include(cc => cc.CrewMember)
            .Include(cc => cc.Country)
            .Where(cc => cc.CrewMemberId == crewMemberId)
            .OrderBy(cc => cc.Certificate!.Category)
            .ThenBy(cc => cc.ExpiryDate)
            .Select(cc => MapToCrewCertDto(cc))
            .ToListAsync();
    }

    public async Task<CrewCertificateDto?> GetCrewCertificateByIdAsync(int id)
    {
        var cc = await _context.CrewCertificates
            .AsNoTracking()
            .Include(c => c.Certificate)
            .Include(c => c.CrewMember)
            .Include(c => c.Country)
            .FirstOrDefaultAsync(c => c.Id == id);

        return cc == null ? null : MapToCrewCertDto(cc);
    }

    public async Task<CrewCertificateDto> AddCrewCertificateAsync(CrewCertificateRequest request)
    {
        var cc = new CrewCertificate
        {
            CrewMemberId = request.CrewMemberId,
            CertificateId = request.CertificateId,
            CertificateNumber = request.CertificateNumber,
            IssueDate = DateTime.SpecifyKind(request.IssueDate, DateTimeKind.Utc),
            ExpiryDate = DateTime.SpecifyKind(request.ExpiryDate, DateTimeKind.Utc),
            IssuingAuthority = request.IssuingAuthority,
            CertificateOfCompetency = request.CertificateOfCompetency,
            CountryId = request.CountryId,
            Notes = request.Notes,
            Status = CertificateStatus.VALID,
            OriginNode = "SHORE",
            IsSynced = false,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.CrewCertificates.Add(cc);
        await _context.SaveChangesAsync();

        // Reload with navigation
        await _context.Entry(cc).Reference(c => c.Certificate).LoadAsync();
        await _context.Entry(cc).Reference(c => c.CrewMember).LoadAsync();
        await _context.Entry(cc).Reference(c => c.Country).LoadAsync();

        _logger.LogInformation("Added certificate {CertNum} to crew {CrewId}",
            cc.CertificateNumber, cc.CrewMemberId);

        // Broadcast to edge nodes
        if (_syncOutbox != null)
            await _syncOutbox.BroadcastAsync("crew_certificate", cc.Id.ToString(), SyncActionType.CREATE, cc);

        return MapToCrewCertDto(cc);
    }

    public async Task<CrewCertificateDto?> UpdateCrewCertificateAsync(int id, CrewCertificateRequest request)
    {
        var cc = await _context.CrewCertificates
            .AsTracking()
            .Include(c => c.Certificate)
            .Include(c => c.CrewMember)
            .Include(c => c.Country)
            .FirstOrDefaultAsync(c => c.Id == id);

        if (cc == null) return null;

        cc.CertificateNumber = request.CertificateNumber;
        cc.IssueDate = DateTime.SpecifyKind(request.IssueDate, DateTimeKind.Utc);
        cc.ExpiryDate = DateTime.SpecifyKind(request.ExpiryDate, DateTimeKind.Utc);
        cc.IssuingAuthority = request.IssuingAuthority;
        cc.CertificateOfCompetency = request.CertificateOfCompetency;
        cc.CountryId = request.CountryId;
        cc.Notes = request.Notes;
        cc.UpdatedAt = DateTime.UtcNow;
        cc.IsSynced = false;

        // Auto-update status based on expiry
        cc.Status = GetCertificateStatus(cc.ExpiryDate);

        await _context.SaveChangesAsync();

        // Broadcast update to edge nodes
        if (_syncOutbox != null)
            await _syncOutbox.BroadcastAsync("crew_certificate", cc.Id.ToString(), SyncActionType.UPDATE, cc);

        return MapToCrewCertDto(cc);
    }

    public async Task<bool> DeleteCrewCertificateAsync(int id)
    {
        var cc = await _context.CrewCertificates.FindAsync(id);
        if (cc == null) return false;

        _context.CrewCertificates.Remove(cc);
        await _context.SaveChangesAsync();

        // Broadcast deletion to edge nodes
        if (_syncOutbox != null)
            await _syncOutbox.BroadcastAsync("crew_certificate", id.ToString(), SyncActionType.DELETE, new { Id = id });

        return true;
    }

    // ============================================================
    // FLEET-LEVEL QUERIES
    // ============================================================

    public async Task<List<CrewCertificateDto>> GetExpiringCertificatesAsync(int days = 90)
    {
        var cutoff = DateTime.UtcNow.AddDays(days);

        return await _context.CrewCertificates
            .AsNoTracking()
            .Include(cc => cc.Certificate)
            .Include(cc => cc.CrewMember)
            .Include(cc => cc.Country)
            .Where(cc => cc.ExpiryDate <= cutoff && cc.Status != CertificateStatus.REVOKED)
            .OrderBy(cc => cc.ExpiryDate)
            .Select(cc => MapToCrewCertDto(cc))
            .ToListAsync();
    }

    public async Task<ComplianceStatusDto> GetCrewComplianceAsync(Guid crewMemberId)
    {
        var crew = await _context.CrewMembers
            .AsNoTracking()
            .Include(c => c.Rank)
            .FirstOrDefaultAsync(c => c.Id == crewMemberId);

        if (crew == null)
            throw new KeyNotFoundException($"Crew member {crewMemberId} not found");

        // Get required certificates for this rank
        var requiredCerts = crew.RankId.HasValue
            ? await _context.RankCertificates
                .AsNoTracking()
                .Include(rc => rc.Certificate)
                .Where(rc => rc.RankId == crew.RankId.Value)
                .Select(rc => rc.Certificate!)
                .ToListAsync()
            : new List<Certificate>();

        // Also add mandatory certificates regardless of rank
        var mandatoryCerts = await _context.CrewCertificateTypes
            .AsNoTracking()
            .Where(c => c.IsMandatory && c.IsActive)
            .ToListAsync();

        var allRequired = requiredCerts
            .Union(mandatoryCerts, new CertificateComparer())
            .ToList();

        // Get crew's actual certificates
        var crewCerts = await _context.CrewCertificates
            .AsNoTracking()
            .Where(cc => cc.CrewMemberId == crewMemberId)
            .ToListAsync();

        var items = new List<CertificateComplianceItem>();
        int valid = 0, expiring = 0, expired = 0, missing = 0;

        foreach (var required in allRequired)
        {
            var actual = crewCerts.FirstOrDefault(cc => cc.CertificateId == required.Id);
            var status = "MISSING";
            DateTime? expiryDate = null;
            int? daysUntilExpiry = null;

            if (actual != null)
            {
                expiryDate = actual.ExpiryDate;
                daysUntilExpiry = (int)(actual.ExpiryDate - DateTime.UtcNow).TotalDays;

                if (actual.ExpiryDate < DateTime.UtcNow)
                {
                    status = CertificateStatus.EXPIRED;
                    expired++;
                }
                else if (actual.ExpiryDate < DateTime.UtcNow.AddDays(90))
                {
                    status = CertificateStatus.EXPIRING_SOON;
                    expiring++;
                }
                else
                {
                    status = CertificateStatus.VALID;
                    valid++;
                }
            }
            else
            {
                missing++;
            }

            items.Add(new CertificateComplianceItem
            {
                CertificateId = required.Id,
                CertificateCode = required.CertificateCode,
                CertificateName = required.CertificateName,
                IsMandatory = required.IsMandatory,
                Status = status,
                ExpiryDate = expiryDate,
                DaysUntilExpiry = daysUntilExpiry
            });
        }

        return new ComplianceStatusDto
        {
            CrewMemberId = crewMemberId,
            CrewName = crew.FullName,
            RankName = crew.Rank?.RankName,
            TotalRequired = allRequired.Count,
            TotalValid = valid,
            TotalExpiring = expiring,
            TotalExpired = expired,
            TotalMissing = missing,
            IsCompliant = missing == 0 && expired == 0,
            Items = items
        };
    }

    public async Task<List<FleetComplianceDto>> GetFleetComplianceAsync()
    {
        var crewMembers = await _context.CrewMembers
            .AsNoTracking()
            .Include(c => c.Rank)
            .Where(c => c.IsOnboard)
            .ToListAsync();

        var result = new List<FleetComplianceDto>();

        foreach (var crew in crewMembers)
        {
            try
            {
                var compliance = await GetCrewComplianceAsync(crew.Id);
                result.Add(new FleetComplianceDto
                {
                    CrewMemberId = crew.Id,
                    CrewMemberName = crew.FullName,
                    RankName = crew.Rank?.RankName,
                    TotalRequired = compliance.TotalRequired,
                    TotalHeld = compliance.TotalValid + compliance.TotalExpiring,
                    CompliancePercentage = compliance.TotalRequired > 0
                        ? Math.Round((double)(compliance.TotalValid + compliance.TotalExpiring) / compliance.TotalRequired * 100, 1)
                        : 100,
                    MissingCertificates = compliance.Items
                        .Where(i => i.Status == "MISSING")
                        .Select(i => i.CertificateName)
                        .ToList(),
                    ExpiringCertificates = compliance.Items
                        .Where(i => i.Status == CertificateStatus.EXPIRING_SOON)
                        .Select(i => i.CertificateName)
                        .ToList()
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error getting compliance for crew {CrewId}", crew.Id);
            }
        }

        return result;
    }

    /// <summary>
    /// Ma trận tuân thủ xoay theo LOẠI chứng chỉ.
    ///
    /// Khác <see cref="GetFleetComplianceAsync"/> ở hai điểm: (1) trả lời được "loại chứng chỉ này
    /// đang thiếu ở những ai" chứ không chỉ "người này thiếu những gì", và (2) tính trong một lượt
    /// — nạp 5 tập dữ liệu rồi ghép trong bộ nhớ, thay vì gọi lặp theo từng thuyền viên.
    ///
    /// Quy tắc: chứng chỉ bắt buộc với một thuyền viên là ĐÚNG bộ khai báo cho chức danh của họ
    /// trong rank_certificates. Cờ IsMandatory chỉ là thuộc tính của loại chứng chỉ ("bắt buộc
    /// theo luật") dùng để đánh dấu khi hiển thị, KHÔNG phải yêu cầu áp cho mọi người.
    /// </summary>
    public async Task<ComplianceMatrixDto> GetComplianceMatrixAsync(bool onboardOnly = false)
    {
        var now = DateTime.UtcNow;
        var soonCutoff = now.AddDays(90);

        var crewQuery = _context.CrewMembers.AsNoTracking().Include(c => c.Rank).AsQueryable();
        if (onboardOnly) crewQuery = crewQuery.Where(c => c.IsOnboard);
        var crew = await crewQuery.ToListAsync();

        var certTypes = await _context.CrewCertificateTypes.AsNoTracking()
            .Where(c => c.IsActive)
            .OrderBy(c => c.Category).ThenBy(c => c.CertificateName)
            .ToListAsync();

        var rankCerts = await _context.RankCertificates.AsNoTracking()
            .Select(rc => new { rc.RankId, rc.CertificateId })
            .ToListAsync();

        var crewCerts = await _context.CrewCertificates.AsNoTracking()
            .Select(cc => new { cc.Id, cc.CrewMemberId, cc.CertificateId, cc.ExpiryDate })
            .ToListAsync();

        // Tên tàu để người dùng biết phải liên hệ tàu nào — nạp một lần rồi tra bằng dictionary.
        var vesselNames = await _context.Vessels.AsNoTracking()
            .Select(v => new { v.Id, v.Name })
            .ToDictionaryAsync(v => v.Id, v => v.Name);

        // Chức danh → tập loại chứng chỉ bắt buộc của chức danh đó.
        var certIdsByRank = rankCerts
            .GroupBy(rc => rc.RankId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.CertificateId).ToHashSet());

        // Thuyền viên → chứng chỉ đang giữ. Một người có thể có nhiều bản cùng loại
        // (cấp lại nhiều lần) nên lấy bản hạn xa nhất — đó mới là bản còn hiệu lực.
        // Giữ kèm Id bản ghi để giao diện bấm thẳng vào ô là sửa/gia hạn đúng chứng chỉ đó.
        var heldByCrew = new Dictionary<Guid, Dictionary<int, (int Id, DateTime Expiry)>>();
        foreach (var cc in crewCerts)
        {
            if (!heldByCrew.TryGetValue(cc.CrewMemberId, out var map))
                heldByCrew[cc.CrewMemberId] = map = new Dictionary<int, (int, DateTime)>();
            if (!map.TryGetValue(cc.CertificateId, out var existing) || cc.ExpiryDate > existing.Expiry)
                map[cc.CertificateId] = (cc.Id, cc.ExpiryDate);
        }

        // Đếm mức chức danh và mức từng người, cộng dồn trong lúc duyệt.
        var gapsPerRank = new Dictionary<int, int>();
        var crewWithGapPerRank = new Dictionary<int, HashSet<Guid>>();

        var crewSummaries = crew.ToDictionary(m => m.Id, m => new CrewSummaryDto
        {
            CrewMemberId = m.Id,
            CrewName = m.FullName,
            CrewCode = m.CrewId,
            RankId = m.RankId,
            RankName = m.Rank?.RankName,
            Department = m.Rank?.Department,
            VesselName = m.VesselId.HasValue && vesselNames.TryGetValue(m.VesselId.Value, out var vn) ? vn : null,
            IsOnboard = m.IsOnboard,
        });

        var rows = new List<CertificateComplianceRow>();
        var totalGaps = 0;

        foreach (var cert in certTypes)
        {
            var row = new CertificateComplianceRow
            {
                CertificateId = cert.Id,
                CertificateCode = cert.CertificateCode,
                CertificateName = cert.CertificateName,
                Category = cert.Category,
                IsMandatory = cert.IsMandatory,
            };

            foreach (var member in crew)
            {
                // Yêu cầu của một người = ĐÚNG bộ chứng chỉ khai báo cho chức danh của họ
                // (rank_certificates). Không cộng thêm các loại có cờ IsMandatory: cờ đó nói
                // "loại này bắt buộc theo luật", không phải "mọi thuyền viên đều phải có" —
                // cộng vào thì Chief Engineer bị đòi cả CoC-Master lẫn CoC-Officer.
                var requiredByRank = member.RankId.HasValue
                    && certIdsByRank.TryGetValue(member.RankId.Value, out var set)
                    && set.Contains(cert.Id);

                // Không bắt buộc với người này thì bỏ qua — ô tương ứng trong lưới để trống.
                if (!requiredByRank) continue;

                var summary = crewSummaries[member.Id];
                row.RequiredCount++;
                summary.RequiredCount++;

                DateTime? expiry = null;
                int? crewCertId = null;
                if (heldByCrew.TryGetValue(member.Id, out var held)
                    && held.TryGetValue(cert.Id, out var e))
                {
                    expiry = e.Expiry;
                    crewCertId = e.Id;
                }

                string status;
                if (expiry == null) { status = "MISSING"; row.MissingCount++; summary.MissingCount++; }
                else if (expiry < now) { status = CertificateStatus.EXPIRED; row.ExpiredCount++; summary.ExpiredCount++; }
                else if (expiry < soonCutoff) { status = CertificateStatus.EXPIRING_SOON; row.ExpiringCount++; summary.ExpiringCount++; }
                else { status = CertificateStatus.VALID; row.ValidCount++; summary.ValidCount++; }

                // Ghi mọi ô, kể cả người đã đạt — giao diện cần toàn cảnh để tô sáng chỗ hụt.
                row.Crew.Add(new CrewCertStatusDto
                {
                    CrewMemberId = member.Id,
                    CrewCertificateId = crewCertId,
                    Status = status,
                    ExpiryDate = expiry,
                    DaysUntilExpiry = expiry.HasValue ? (int)(expiry.Value - now).TotalDays : null,
                });

                // Chỉ "thiếu hẳn" và "hết hạn" mới tính là lỗ hổng phải xử lý;
                // sắp hết hạn vẫn còn hiệu lực nên chỉ cảnh báo.
                if (status is "MISSING" or CertificateStatus.EXPIRED)
                {
                    row.GapCount++;
                    summary.GapCount++;
                    totalGaps++;

                    if (member.RankId.HasValue)
                    {
                        var rid = member.RankId.Value;
                        gapsPerRank[rid] = gapsPerRank.GetValueOrDefault(rid) + 1;
                        if (!crewWithGapPerRank.TryGetValue(rid, out var s))
                            crewWithGapPerRank[rid] = s = new HashSet<Guid>();
                        s.Add(member.Id);
                    }
                }
            }

            rows.Add(row);
        }

        // Tổng hợp theo chức danh — chỉ những chức danh thực sự có người.
        var ranks = await _context.Ranks.AsNoTracking().ToListAsync();
        var rankRows = ranks
            .Select(r =>
            {
                var crewCount = crew.Count(c => c.RankId == r.Id);
                if (crewCount == 0) return null;

                var required = certIdsByRank.TryGetValue(r.Id, out var set) ? set.Count : 0;

                return new RankComplianceRow
                {
                    RankId = r.Id,
                    RankCode = r.RankCode,
                    RankName = r.RankName,
                    Department = r.Department,
                    CrewCount = crewCount,
                    RequiredPerCrew = required,
                    CrewWithGaps = crewWithGapPerRank.TryGetValue(r.Id, out var s) ? s.Count : 0,
                    GapCount = gapsPerRank.GetValueOrDefault(r.Id),
                };
            })
            .Where(r => r != null)
            .Select(r => r!)
            .OrderByDescending(r => r.GapCount)
            .ThenBy(r => r.RankName)
            .ToList();

        // Người hụt nhiều nhất lên đầu để nhìn phát thấy ngay, rồi nhóm theo chức danh và tên.
        var crewRows = crewSummaries.Values
            .OrderByDescending(c => c.GapCount)
            .ThenBy(c => c.RankName)
            .ThenBy(c => c.CrewName)
            .ToList();

        return new ComplianceMatrixDto
        {
            GeneratedAt = now,
            CrewTotal = crew.Count,
            TotalGaps = totalGaps,
            Crew = crewRows,
            Certificates = rows,
            Ranks = rankRows,
        };
    }

    // ============================================================
    // MAPPING HELPERS
    // ============================================================

    private static string GetCertificateStatus(DateTime expiryDate)
    {
        if (expiryDate < DateTime.UtcNow)
            return CertificateStatus.EXPIRED;
        if (expiryDate < DateTime.UtcNow.AddDays(90))
            return CertificateStatus.EXPIRING_SOON;
        return CertificateStatus.VALID;
    }

    private static CertificateDto MapToDto(Certificate cert) => new()
    {
        Id = cert.Id,
        CertificateCode = cert.CertificateCode,
        CertificateName = cert.CertificateName,
        Category = cert.Category,
        ValidityPeriodMonths = cert.ValidityPeriodMonths,
        Description = cert.Description,
        IssuingAuthority = cert.IssuingAuthority,
        IsMandatory = cert.IsMandatory,
        IsActive = cert.IsActive
    };

    private static CrewCertificateDto MapToCrewCertDto(CrewCertificate cc) => new()
    {
        Id = cc.Id,
        CrewMemberId = cc.CrewMemberId,
        CrewMemberName = cc.CrewMember?.FullName,
        VesselId = cc.CrewMember?.VesselId,
        CertificateId = cc.CertificateId,
        CertificateCode = cc.Certificate?.CertificateCode,
        CertificateName = cc.Certificate?.CertificateName,
        Category = cc.Certificate?.Category,
        CertificateNumber = cc.CertificateNumber,
        IssueDate = cc.IssueDate,
        ExpiryDate = cc.ExpiryDate,
        IssuingAuthority = cc.IssuingAuthority,
        CertificateOfCompetency = cc.CertificateOfCompetency,
        CountryId = cc.CountryId,
        CountryName = cc.Country?.CountryName,
        DocumentFilePath = cc.DocumentFilePath,
        Status = GetCertificateStatus(cc.ExpiryDate),
        Notes = cc.Notes,
        IsSynced = cc.IsSynced
    };

    /// <summary>
    /// IEqualityComparer for Certificate to union required + mandatory without duplicates
    /// </summary>
    private class CertificateComparer : IEqualityComparer<Certificate>
    {
        public bool Equals(Certificate? x, Certificate? y) => x?.Id == y?.Id;
        public int GetHashCode(Certificate obj) => obj.Id.GetHashCode();
    }
}
