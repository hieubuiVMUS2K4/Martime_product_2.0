using MaritimeEdge.Data;
using MaritimeEdge.DTOs.Logbooks;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Voyage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace MaritimeEdge.Services.Logbooks
{
    public class GarbagePartIService : IGarbagePartIService
    {
        private readonly EdgeDbContext _context;
        private readonly ILogger<GarbagePartIService> _logger;
        private readonly IVoyageContextService _voyageContext;

        // Categories prohibited from sea discharge (MARPOL Annex V)
        private static readonly HashSet<string> ProhibitedSeaDischargeCategories = new()
        {
            "A", // Plastics - ALWAYS PROHIBITED
            "C", // Domestic wastes - prohibited
            "D", // Cooking oil - prohibited
            "E", // Incinerator ashes - prohibited
            "F", // Operational wastes - prohibited
            "H", // Fishing gear - prohibited (except accidental loss under regulation 7)
            "I"  // E-waste - prohibited
        };

        public GarbagePartIService(EdgeDbContext context, ILogger<GarbagePartIService> logger, IVoyageContextService voyageContext)
        {
            _context = context;
            _logger = logger;
            _voyageContext = voyageContext;
        }

        public async Task<(bool Success, Guid? Id, string? Error)> CreateEntryAsync(CreateGarbagePartIDto dto, string? username = null)
        {
            try
            {
                // Validate category
                if (!IsValidPartICategory(dto.Category))
                {
                    return (false, null, "Invalid category for Part I. Must be A-I.");
                }

                // Validate amounts
                var validationError = ValidateAmounts(dto);
                if (validationError != null)
                {
                    return (false, null, validationError);
                }

                // Validate sea discharge prohibition
                if (dto.EstimatedAmountDischargedToSea > 0)
                {
                    if (ProhibitedSeaDischargeCategories.Contains(dto.Category.ToUpper()))
                    {
                        return (false, null, $"Category {dto.Category} cannot be discharged to sea per MARPOL Annex V.");
                    }

                    // Require position for sea discharge
                    if (!dto.DischargeLatitude.HasValue || !dto.DischargeLongitude.HasValue)
                    {
                        return (false, null, "Position (latitude/longitude) is required for discharge to sea.");
                    }
                }

                // Validate reception facility details
                if (dto.EstimatedAmountToReceptionFacilities > 0)
                {
                    if (string.IsNullOrEmpty(dto.PortName) && string.IsNullOrEmpty(dto.ReceptionFacilityName))
                    {
                        return (false, null, "Port name or reception facility name is required for discharge to reception facility.");
                    }
                }

                // Validate incineration details
                if (dto.EstimatedAmountIncinerated > 0)
                {
                    if (!dto.IncinerationStartTime.HasValue)
                    {
                        return (false, null, "Incineration start time is required when incineration amount is specified.");
                    }
                }

                var entry = new GarbageRecordPartI
                {
                    Id = Guid.NewGuid(),
                    OperationDate = dto.OperationDate.Date,
                    OperationTime = dto.OperationTime,
                    OperationEndTime = dto.OperationEndTime,
                    Category = dto.Category.ToUpper(),
                    Description = dto.Description,
                    EstimatedAmountDischargedToSea = dto.EstimatedAmountDischargedToSea,
                    EstimatedAmountToReceptionFacilities = dto.EstimatedAmountToReceptionFacilities,
                    EstimatedAmountIncinerated = dto.EstimatedAmountIncinerated,
                    DischargeLatitude = dto.DischargeLatitude,
                    DischargeLongitude = dto.DischargeLongitude,
                    PortName = dto.PortName,
                    ReceptionFacilityName = dto.ReceptionFacilityName,
                    ReceiptNumber = dto.ReceiptNumber,
                    IncinerationStartTime = dto.IncinerationStartTime,
                    IncinerationEndTime = dto.IncinerationEndTime,
                    IncineratorDetails = dto.IncineratorDetails,
                    ExceptionalDischargeReason = dto.ExceptionalDischargeReason,
                    WaterDepth = dto.WaterDepth,
                    Remarks = dto.Remarks,
                    OfficerInCharge = dto.OfficerInCharge,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    OriginNode = Environment.MachineName,
                    IsSynced = false
                };

                var (voyageId, legId) = await _voyageContext.ResolveActiveVoyageAsync(entry.OperationDate);
                entry.VoyageId = voyageId;
                entry.VoyagePlanLegId = legId;

                _context.GarbageRecordPartIs.Add(entry);
                await _context.SaveChangesAsync();

                _logger.LogInformation("Created Garbage Part I entry {Id} for category {Category}", entry.Id, entry.Category);
                return (true, entry.Id, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating Garbage Part I entry");
                return (false, null, "An error occurred while creating the entry.");
            }
        }

        public async Task<(bool Success, string? Error)> DeleteEntryAsync(Guid id, string? username = null)
        {
            try
            {
                var entry = await _context.GarbageRecordPartIs.FindAsync(id);
                if (entry == null)
                {
                    return (false, "Entry not found.");
                }

                if (entry.IsDeleted)
                {
                    return (false, "Entry is already deleted.");
                }

                // Soft delete
                entry.IsDeleted = true;
                entry.DeletedAt = DateTime.UtcNow;
                entry.DeletedBy = username ?? "System";
                entry.UpdatedAt = DateTime.UtcNow;
                entry.IsSynced = false;

                await _context.SaveChangesAsync();
                return (true, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting Garbage Part I entry {Id}", id);
                return (false, "An error occurred while deleting the entry.");
            }
        }

        public async Task<PaginatedLogbookResponseDto<GarbagePartIResponseDto>> GetEntriesAsync(LogbookPaginationDto pagination)
        {
            try
            {
                var query = _context.GarbageRecordPartIs.Where(x => !x.IsDeleted);

                if (pagination.FromDate.HasValue)
                {
                    query = query.Where(x => x.OperationDate >= pagination.FromDate.Value.Date);
                }

                if (pagination.ToDate.HasValue)
                {
                    query = query.Where(x => x.OperationDate <= pagination.ToDate.Value.Date);
                }

                if (!string.IsNullOrEmpty(pagination.SearchTerm))
                {
                    var term = pagination.SearchTerm.ToLower();
                    query = query.Where(x =>
                        x.OfficerInCharge.ToLower().Contains(term) ||
                        x.Description.ToLower().Contains(term) ||
                        x.Category.ToLower().Contains(term));
                }

                var totalCount = await query.CountAsync();

                var items = await query
                    .OrderByDescending(x => x.OperationDate)
                    .ThenByDescending(x => x.OperationTime)
                    .Skip((pagination.Page - 1) * pagination.PageSize)
                    .Take(pagination.PageSize)
                    .Select(x => new GarbagePartIResponseDto
                    {
                        Id = x.Id,
                        OperationDate = x.OperationDate,
                        OperationTime = x.OperationTime,
                        Category = x.Category,
                        Description = x.Description,
                        EstimatedAmountDischargedToSea = x.EstimatedAmountDischargedToSea,
                        EstimatedAmountToReceptionFacilities = x.EstimatedAmountToReceptionFacilities,
                        EstimatedAmountIncinerated = x.EstimatedAmountIncinerated,
                        DischargeLatitude = x.DischargeLatitude,
                        DischargeLongitude = x.DischargeLongitude,
                        PortName = x.PortName,
                        ReceptionFacilityName = x.ReceptionFacilityName,
                        ReceiptNumber = x.ReceiptNumber,
                        IncinerationStartTime = x.IncinerationStartTime,
                        IncinerationEndTime = x.IncinerationEndTime,
                        IncineratorDetails = x.IncineratorDetails,
                        ExceptionalDischargeReason = x.ExceptionalDischargeReason,
                        Remarks = x.Remarks,
                        OfficerInCharge = x.OfficerInCharge,
                        MasterSignature = x.MasterSignature,
                        SignedAt = x.SignedAt,
                        IsSynced = x.IsSynced,
                        CreatedAt = x.CreatedAt,
                        UpdatedAt = x.UpdatedAt,
                        OriginNode = x.OriginNode,
                        VoyageId = x.VoyageId,
                        VoyagePlanLegId = x.VoyagePlanLegId
                    })
                    .ToListAsync();

                return new PaginatedLogbookResponseDto<GarbagePartIResponseDto>
                {
                    Data = items,
                    TotalRecords = totalCount,
                    Page = pagination.Page,
                    PageSize = pagination.PageSize
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving Garbage Part I entries");
                throw;
            }
        }

        public async Task<GarbagePartIResponseDto?> GetEntryAsync(Guid id)
        {
            try
            {
                var entry = await _context.GarbageRecordPartIs
                    .Where(x => x.Id == id && !x.IsDeleted)
                    .FirstOrDefaultAsync();

                if (entry == null) return null;

                return new GarbagePartIResponseDto
                {
                    Id = entry.Id,
                    OperationDate = entry.OperationDate,
                    OperationTime = entry.OperationTime,
                    Category = entry.Category,
                    Description = entry.Description,
                    EstimatedAmountDischargedToSea = entry.EstimatedAmountDischargedToSea,
                    EstimatedAmountToReceptionFacilities = entry.EstimatedAmountToReceptionFacilities,
                    EstimatedAmountIncinerated = entry.EstimatedAmountIncinerated,
                    DischargeLatitude = entry.DischargeLatitude,
                    DischargeLongitude = entry.DischargeLongitude,
                    PortName = entry.PortName,
                    ReceptionFacilityName = entry.ReceptionFacilityName,
                    ReceiptNumber = entry.ReceiptNumber,
                    IncinerationStartTime = entry.IncinerationStartTime,
                    IncinerationEndTime = entry.IncinerationEndTime,
                    IncineratorDetails = entry.IncineratorDetails,
                    ExceptionalDischargeReason = entry.ExceptionalDischargeReason,
                    Remarks = entry.Remarks,
                    OfficerInCharge = entry.OfficerInCharge,
                    MasterSignature = entry.MasterSignature,
                    SignedAt = entry.SignedAt,
                    IsSynced = entry.IsSynced,
                    CreatedAt = entry.CreatedAt,
                    UpdatedAt = entry.UpdatedAt,
                    OriginNode = entry.OriginNode,
                    VoyageId = entry.VoyageId,
                    VoyagePlanLegId = entry.VoyagePlanLegId
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving Garbage Part I entry {Id}", id);
                throw;
            }
        }

        public async Task<(bool Success, string? Error)> SignEntryAsync(Guid id, SignGarbagePartIDto dto, string? username = null)
        {
            try
            {
                var entry = await _context.GarbageRecordPartIs.FindAsync(id);
                if (entry == null || entry.IsDeleted)
                {
                    return (false, "Entry not found.");
                }

                entry.MasterSignature = dto.MasterSignature;
                entry.SignedAt = dto.SignedAt;
                entry.UpdatedAt = DateTime.UtcNow;
                entry.IsSynced = false;

                await _context.SaveChangesAsync();
                return (true, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error signing Garbage Part I entry {Id}", id);
                return (false, "An error occurred while signing the entry.");
            }
        }

        public async Task<(bool Success, string? Error)> UpdateEntryAsync(Guid id, UpdateGarbagePartIDto dto, string? username = null)
        {
            try
            {
                var entry = await _context.GarbageRecordPartIs.FindAsync(id);
                if (entry == null || entry.IsDeleted)
                {
                    return (false, "Entry not found.");
                }

                if (!string.IsNullOrEmpty(entry.MasterSignature))
                {
                    return (false, "Cannot update a signed entry.");
                }

                // Validate
                if (!IsValidPartICategory(dto.Category))
                {
                    return (false, "Invalid category for Part I. Must be A-I.");
                }

                var validationError = ValidateAmounts(dto);
                if (validationError != null)
                {
                    return (false, validationError);
                }

                if (dto.EstimatedAmountDischargedToSea > 0)
                {
                    if (ProhibitedSeaDischargeCategories.Contains(dto.Category.ToUpper()))
                    {
                        return (false, $"Category {dto.Category} cannot be discharged to sea per MARPOL Annex V.");
                    }

                    if (!dto.DischargeLatitude.HasValue || !dto.DischargeLongitude.HasValue)
                    {
                        return (false, "Position is required for discharge to sea.");
                    }
                }

                // Required fields - always update
                entry.OperationDate = dto.OperationDate.Date;
                entry.OperationTime = dto.OperationTime;
                entry.Category = dto.Category.ToUpper();
                entry.Description = dto.Description;
                entry.OfficerInCharge = dto.OfficerInCharge;

                // Nullable fields - only update if provided
                if (dto.OperationEndTime.HasValue) entry.OperationEndTime = dto.OperationEndTime;
                if (dto.EstimatedAmountDischargedToSea.HasValue) entry.EstimatedAmountDischargedToSea = dto.EstimatedAmountDischargedToSea;
                if (dto.EstimatedAmountToReceptionFacilities.HasValue) entry.EstimatedAmountToReceptionFacilities = dto.EstimatedAmountToReceptionFacilities;
                if (dto.EstimatedAmountIncinerated.HasValue) entry.EstimatedAmountIncinerated = dto.EstimatedAmountIncinerated;
                if (dto.DischargeLatitude.HasValue) entry.DischargeLatitude = dto.DischargeLatitude;
                if (dto.DischargeLongitude.HasValue) entry.DischargeLongitude = dto.DischargeLongitude;
                if (dto.PortName != null) entry.PortName = dto.PortName;
                if (dto.ReceptionFacilityName != null) entry.ReceptionFacilityName = dto.ReceptionFacilityName;
                if (dto.ReceiptNumber != null) entry.ReceiptNumber = dto.ReceiptNumber;
                if (dto.IncinerationStartTime.HasValue) entry.IncinerationStartTime = dto.IncinerationStartTime;
                if (dto.IncinerationEndTime.HasValue) entry.IncinerationEndTime = dto.IncinerationEndTime;
                if (dto.IncineratorDetails != null) entry.IncineratorDetails = dto.IncineratorDetails;
                if (dto.ExceptionalDischargeReason != null) entry.ExceptionalDischargeReason = dto.ExceptionalDischargeReason;
                if (dto.WaterDepth.HasValue) entry.WaterDepth = dto.WaterDepth;
                if (dto.Remarks != null) entry.Remarks = dto.Remarks;
                entry.UpdatedAt = DateTime.UtcNow;
                entry.IsSynced = false;

                await _context.SaveChangesAsync();
                return (true, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating Garbage Part I entry {Id}", id);
                return (false, "An error occurred while updating the entry.");
            }
        }

        private bool IsValidPartICategory(string category)
        {
            var validCategories = new[] { "A", "B", "C", "D", "E", "F", "G", "H", "I" };
            return validCategories.Contains(category.ToUpper());
        }

        private string? ValidateAmounts(CreateGarbagePartIDto dto)
        {
            var totalAmount = (dto.EstimatedAmountDischargedToSea ?? 0) +
                            (dto.EstimatedAmountToReceptionFacilities ?? 0) +
                            (dto.EstimatedAmountIncinerated ?? 0);

            if (totalAmount <= 0)
            {
                return "At least one amount (sea/reception/incinerated) must be greater than 0.";
            }

            return null;
        }
    }
}
