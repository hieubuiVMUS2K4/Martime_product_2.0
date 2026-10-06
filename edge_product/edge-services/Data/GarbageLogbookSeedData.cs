using MaritimeEdge.Models;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Data;

/// <summary>
/// Idempotent demonstration data for the MARPOL Annex V Garbage Record Book.
///
/// The scenarios follow the Part I categories A-I and Part II categories J-K
/// introduced by resolution MEPC.277(70). Sea-discharge examples are limited
/// to food waste or shipper-declared non-HME cargo residue and explicitly state
/// the MARPOL operating conditions in Remarks. All HME residue goes ashore.
/// </summary>
public static class GarbageLogbookSeedData
{
    private const string OriginNode = "DEMO_MARPOL_SEED";
    private const string Master = "Capt. Nguyen Minh Hai";

    public static async Task SeedAsync(EdgeDbContext context, ILogger logger)
    {
        var today = DateTime.SpecifyKind(DateTime.UtcNow.Date, DateTimeKind.Utc);
        var now = DateTime.UtcNow;

        var partI = BuildPartI(today, now);
        var partII = BuildPartII(today, now);

        var partIIds = partI.Select(entry => entry.Id).ToArray();
        var partIIIds = partII.Select(entry => entry.Id).ToArray();
        var existingPartIIds = (await context.GarbageRecordPartIs
            .Where(entry => partIIds.Contains(entry.Id))
            .Select(entry => entry.Id)
            .ToListAsync()).ToHashSet();
        var existingPartIIIds = (await context.GarbageRecordPartIIs
            .Where(entry => partIIIds.Contains(entry.Id))
            .Select(entry => entry.Id)
            .ToListAsync()).ToHashSet();

        var newPartI = partI.Where(entry => !existingPartIIds.Contains(entry.Id)).ToList();
        var newPartII = partII.Where(entry => !existingPartIIIds.Contains(entry.Id)).ToList();

        if (newPartI.Count > 0 || newPartII.Count > 0)
        {
            context.GarbageRecordPartIs.AddRange(newPartI);
            context.GarbageRecordPartIIs.AddRange(newPartII);
            await context.SaveChangesAsync();
        }

        // Demo records are local presentation data. The SaveChanges interceptor
        // observes every insert, so explicitly remove their generated queue items
        // to guarantee that they can never be transmitted to Shore as vessel data.
        var demoRecordKeys = partIIds.Concat(partIIIds).Select(id => id.ToString()).ToArray();
        await context.SyncQueue
            .Where(item => demoRecordKeys.Contains(item.RecordKey))
            .ExecuteDeleteAsync();

        if (newPartI.Count == 0 && newPartII.Count == 0)
            logger.LogInformation("MARPOL garbage logbook demo data already present");
        else
            logger.LogInformation(
                "Seeded MARPOL garbage logbook demo data: {PartICount} Part I and {PartIICount} Part II entries",
                newPartI.Count,
                newPartII.Count);
    }

    private static List<GarbageRecordPartI> BuildPartI(DateTime today, DateTime now)
    {
        return new List<GarbageRecordPartI>
        {
            ReceptionPartI("7a100000-0000-4000-8000-000000000001", today.AddDays(-19), new(8, 15, 0), "A",
                "Plastics - segregated packaging, bottles and wrapping", 1.240, "Singapore", "Tuas Marine Waste Reception Facility", "SG-PRF-260801",
                "Plastics retained on board and delivered ashore; no discharge to sea."),
            Signed(new GarbageRecordPartI
            {
                Id = Guid.Parse("7a100000-0000-4000-8000-000000000002"), OperationDate = today.AddDays(-17),
                OperationTime = new(11, 20, 0), OperationEndTime = new(11, 32, 0), Category = "B",
                Description = "Food wastes - comminuted to particles not greater than 25 mm",
                EstimatedAmountDischargedToSea = 0.180, DischargeLatitude = 8.2154000, DischargeLongitude = 108.6421000,
                Remarks = "Permitted discharge while en route, outside a special area and more than 12 nm from nearest land; comminuted through an approved grinder.",
                OfficerInCharge = "Chief Officer Tran Quoc Bao"
            }, today.AddDays(-17).AddHours(16)),
            ReceptionPartI("7a100000-0000-4000-8000-000000000003", today.AddDays(-15), new(9, 5, 0), "C",
                "Domestic wastes - glass, metal cans, paper and crockery", 0.860, "Port Klang", "Westports Licensed Waste Reception", "MY-PRF-260803",
                "Segregated domestic waste delivered to port reception facility."),
            ReceptionPartI("7a100000-0000-4000-8000-000000000004", today.AddDays(-13), new(14, 10, 0), "D",
                "Used cooking oil from galley", 0.095, "Port Klang", "Westports Used Cooking Oil Reception", "MY-UCO-260804",
                "Used cooking oil retained in sealed drums and delivered ashore."),
            ReceptionPartI("7a100000-0000-4000-8000-000000000005", today.AddDays(-11), new(10, 40, 0), "E",
                "Incinerator ashes from approved shipboard incinerator", 0.210, "Laem Chabang", "Terminal A Waste Reception Facility", "TH-PRF-260805",
                "Cooled ashes bagged, retained on board and delivered ashore."),
            ReceptionPartI("7a100000-0000-4000-8000-000000000006", today.AddDays(-9), new(13, 25, 0), "F",
                "Operational wastes - maintenance rags, sweepings and paint-contaminated absorbents", 0.340, "Laem Chabang", "Licensed Operational Waste Contractor", "TH-OW-260806",
                "Operational waste segregated and delivered to a licensed reception contractor."),
            ReceptionPartI("7a100000-0000-4000-8000-000000000007", today.AddDays(-7), new(7, 50, 0), "G",
                "Animal carcass from refrigerated provisions", 0.075, "Vung Tau", "Cai Mep Port Reception Facility", "VN-PRF-260807",
                "Retained in sealed cold storage and delivered ashore; no disposal at sea."),
            ReceptionPartI("7a100000-0000-4000-8000-000000000008", today.AddDays(-5), new(15, 5, 0), "H",
                "Damaged synthetic mooring messenger and fishing-line debris recovered on deck", 0.130, "Vung Tau", "Cai Mep Port Reception Facility", "VN-PRF-260808",
                "Fishing gear and synthetic line retained on board and delivered ashore."),
            ReceptionPartI("7a100000-0000-4000-8000-000000000009", today.AddDays(-3), new(9, 35, 0), "I",
                "E-waste - failed navigation display, circuit boards and LED lamps", 0.055, "Singapore", "Licensed E-waste Reception Facility", "SG-EW-260809",
                "E-waste inventoried, segregated from domestic waste and delivered to licensed recycler."),
            new GarbageRecordPartI
            {
                Id = Guid.Parse("7a100000-0000-4000-8000-000000000010"), OperationDate = today.AddDays(-1),
                OperationTime = new(18, 10, 0), OperationEndTime = new(18, 48, 0), Category = "C",
                Description = "Clean paper and untreated cardboard incinerated on board",
                EstimatedAmountIncinerated = 0.160,
                IncinerationStartTime = today.AddDays(-1).AddHours(18).AddMinutes(10),
                IncinerationEndTime = today.AddDays(-1).AddHours(18).AddMinutes(48),
                IncineratorDetails = "IMO type-approved shipboard incinerator; operating limits observed",
                Remarks = "No PVC, halogenated material, pressurized container, metal, glass or e-waste included.",
                OfficerInCharge = "Second Engineer Le Anh Tuan"
            }
        }.Select(entry => Complete(entry, now)).ToList();
    }

    private static List<GarbageRecordPartII> BuildPartII(DateTime today, DateTime now)
    {
        return new List<GarbageRecordPartII>
        {
            Signed(SeaPartII("7b200000-0000-4000-8000-000000000001", today.AddDays(-18), new(10, 5, 0),
                "Wheat residues in hold wash water - shipper declaration: non-HME", "Holds 1 and 2", 12.4421000, 110.3264000, 12.5078000, 110.4412000, 42.500), today.AddDays(-18).AddHours(15)),
            SeaPartII("7b200000-0000-4000-8000-000000000002", today.AddDays(-16), new(13, 15, 0),
                "Soybean meal residues in hold wash water - shipper declaration: non-HME", "Holds 3 and 4", 10.8115000, 109.7623000, 10.9042000, 109.8816000, 36.800),
            Signed(SeaPartII("7b200000-0000-4000-8000-000000000003", today.AddDays(-14), new(8, 40, 0),
                "Limestone residues in hold wash water - shipper declaration: non-HME", "Hold 5", 9.6248000, 108.9345000, 9.7103000, 109.0527000, 24.600), today.AddDays(-14).AddHours(14)),
            ReceptionPartII("7b200000-0000-4000-8000-000000000004", today.AddDays(-12), new(15, 20, 0), "J",
                "Wood pellet residues - shipper declaration: non-HME", "Holds 1-3", 18.200, "Singapore", "Jurong Port Cargo Residue Reception", "SG-CR-260804", 1.2644000, 103.7079000),
            ReceptionPartII("7b200000-0000-4000-8000-000000000005", today.AddDays(-10), new(9, 30, 0), "J",
                "Salt residues - shipper declaration: non-HME", "Hold 4", 11.750, "Port Klang", "Westports Cargo Waste Reception", "MY-CR-260805", 3.0008000, 101.3929000),
            Signed(ReceptionPartII("7b200000-0000-4000-8000-000000000006", today.AddDays(-8), new(10, 45, 0), "K",
                "Copper concentrate residues - shipper declaration: HME", "Holds 1 and 2", 31.400, "Laem Chabang", "HME Cargo Residue Reception Facility", "TH-HME-260806", 13.0827000, 100.8835000), today.AddDays(-8).AddHours(16)),
            Signed(ReceptionPartII("7b200000-0000-4000-8000-000000000007", today.AddDays(-6), new(14, 35, 0), "K",
                "Lead concentrate residues - shipper declaration: HME", "Hold 3", 18.750, "Vung Tau", "Cai Mep Licensed HME Reception", "VN-HME-260807", 10.5009000, 107.0404000), today.AddDays(-6).AddHours(18)),
            ReceptionPartII("7b200000-0000-4000-8000-000000000008", today.AddDays(-4), new(8, 25, 0), "K",
                "Zinc concentrate residues - shipper declaration: HME", "Holds 4 and 5", 27.300, "Vung Tau", "Cai Mep Licensed HME Reception", "VN-HME-260808", 10.5009000, 107.0404000),
            ReceptionPartII("7b200000-0000-4000-8000-000000000009", today.AddDays(-2), new(11, 10, 0), "K",
                "Nickel ore residues - shipper declaration: HME", "Holds 1-5", 44.900, "Singapore", "Jurong Port HME Reception Facility", "SG-HME-260809", 1.2644000, 103.7079000),
            ReceptionPartII("7b200000-0000-4000-8000-000000000010", today, new(7, 55, 0), "K",
                "Mineral concentrate residues - shipper declaration: HME", "Hold 2", 16.600, "Singapore", "Jurong Port HME Reception Facility", "SG-HME-260810", 1.2644000, 103.7079000)
        }.Select(entry => Complete(entry, now)).ToList();
    }

    private static GarbageRecordPartI ReceptionPartI(string id, DateTime date, TimeSpan time, string category,
        string description, double amount, string port, string facility, string receipt, string remarks) => new()
    {
        Id = Guid.Parse(id), OperationDate = date, OperationTime = time, OperationEndTime = time.Add(TimeSpan.FromMinutes(20)),
        Category = category, Description = description, EstimatedAmountToReceptionFacilities = amount,
        PortName = port, ReceptionFacilityName = facility, ReceiptNumber = receipt, Remarks = remarks,
        OfficerInCharge = "Chief Officer Tran Quoc Bao"
    };

    private static GarbageRecordPartII SeaPartII(string id, DateTime date, TimeSpan time, string cargo,
        string holds, double startLat, double startLon, double endLat, double endLon, double amount) => new()
    {
        Id = Guid.Parse(id), OperationDate = date, OperationTime = time, OperationEndTime = time.Add(TimeSpan.FromMinutes(45)),
        Category = "J", StartLatitude = startLat, StartLongitude = startLon, EndLatitude = endLat, EndLongitude = endLon,
        EstimatedAmountDischargedToSea = amount, CargoDescription = cargo, HoldNumbersWashed = holds,
        Remarks = "Permitted discharge while en route, outside a special area, more than 12 nm from nearest land; residues declared non-HME and cleaning agents/additives are not HME.",
        OfficerInCharge = "Chief Officer Tran Quoc Bao"
    };

    private static GarbageRecordPartII ReceptionPartII(string id, DateTime date, TimeSpan time, string category,
        string cargo, string holds, double amount, string port, string facility, string receipt, double lat, double lon) => new()
    {
        Id = Guid.Parse(id), OperationDate = date, OperationTime = time, OperationEndTime = time.Add(TimeSpan.FromMinutes(35)),
        Category = category, StartLatitude = lat, StartLongitude = lon, EndLatitude = lat, EndLongitude = lon,
        EstimatedAmountToReceptionFacilities = amount, PortName = port, ReceptionFacilityName = facility,
        ReceiptNumber = receipt, CargoDescription = cargo, HoldNumbersWashed = holds,
        Remarks = category == "K"
            ? "HME cargo residue retained on board and delivered to a licensed port reception facility; no discharge to sea."
            : "Cargo residue retained on board and delivered to port reception facility.",
        OfficerInCharge = "Chief Officer Tran Quoc Bao"
    };

    private static T Signed<T>(T entry, DateTime signedAt) where T : class
    {
        switch (entry)
        {
            case GarbageRecordPartI partI:
                partI.MasterSignature = Master;
                partI.SignedAt = signedAt;
                break;
            case GarbageRecordPartII partII:
                partII.MasterSignature = Master;
                partII.SignedAt = signedAt;
                break;
        }

        return entry;
    }

    private static GarbageRecordPartI Complete(GarbageRecordPartI entry, DateTime now)
    {
        entry.OriginNode = OriginNode;
        entry.IsSynced = true;
        entry.CreatedAt = now;
        entry.UpdatedAt = now;
        return entry;
    }

    private static GarbageRecordPartII Complete(GarbageRecordPartII entry, DateTime now)
    {
        entry.OriginNode = OriginNode;
        entry.IsSynced = true;
        entry.CreatedAt = now;
        entry.UpdatedAt = now;
        return entry;
    }
}
