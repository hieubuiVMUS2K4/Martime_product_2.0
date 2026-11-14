using System.Globalization;
using System.Text.Json;
using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Services.Core;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Reporting;

/// <summary>Opt-in demo data command. Reuses report services; never deletes or rewrites existing reports.</summary>
public static class DemoReportSeedCommand
{
    public sealed record Entry(string Key, string Type, DateTime Date, string Target, object Payload);
    private const string Actor = "Bộ phận khai thác";
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    public static List<Entry> BuildPlan(DateTime start, int days, string batch)
    {
        if (days is < 1 or > 366) throw new ArgumentException("days must be 1..366");
        if (!System.Text.RegularExpressions.Regex.IsMatch(batch, "^[a-zA-Z0-9_-]{1,40}$"))
            throw new ArgumentException("batch must contain 1..40 letters, digits, underscores or hyphens");
        start = DateTime.SpecifyKind(start.Date, DateTimeKind.Utc);
        var entries = new List<Entry>();
        double fo = 1100, diesel = 230, lub = 22000, water = 240;
        for (var day = 0; day < days; day++)
        {
            var date = start.AddDays(day);
            var phase = day % 10;
            var sea = phase is 0 or 1 or 2 or 5 or 6 or 7;
            var northbound = phase >= 5;
            // Coastal demonstration route with offshore waypoints (not navigation advice).
            var leg = northbound ? phase - 5 : phase;
            var lat = sea ? (northbound ? 17.0 + leg * 1.25 : 20.0 - leg * 1.25) : (phase < 5 ? 16.15 : 20.75);
            var lon = sea ? (northbound ? 108.8 - leg * .75 : 107.25 + leg * .75) : (phase < 5 ? 108.25 : 106.9);
            var speed = sea ? Math.Round(11.8 + .7 * Math.Sin(day * .6), 2) : 0;
            var fuel = sea ? Math.Round(18.5 + 1.2 * Math.Sin(day * .6), 2) : .4;
            var doUsed = sea ? 1.4 : 2.2;
            var loUsed = sea ? 45 : 18;
            var fwUsed = 6.5;
            string Mark(string type) => $"[SEED:{batch}:{date:yyyyMMdd}:{type}]";
            void Add(string type, int hour, object payload)
            {
                var age = days - day;
                var target = age <= 2 ? "DRAFT" : age <= 4 ? "SUBMITTED" : age == 5 ? "REJECTED" : age == 6 ? "APPROVED" : "TRANSMITTED";
                entries.Add(new Entry(Mark(type), type, date.AddHours(hour), target, payload));
            }
            if (phase is 0 or 5)
                Add("DEPARTURE", 0, new CreateDepartureReportDto {
                    DepartureDateTime = date, PortName = northbound ? "Da Nang" : "Hai Phong", PortCode = northbound ? "VNDAD" : "VNHPH",
                    DepartureLatitude = northbound ? 16.15 : 20.75, DepartureLongitude = northbound ? 108.25 : 106.9,
                    PilotOffTime = date.AddMinutes(45), LastLineLetGoTime = date.AddMinutes(-15),
                    DraftForward = 8.8, DraftAft = 9.2, DraftMidship = 9,
                    FuelOilROB = fo, DieselOilROB = diesel, LubOilROB = lub, FreshWaterROB = water,
                    CargoOnBoard = 18500, CargoDescription = "Hàng container", CrewOnBoard = 25, PassengersOnBoard = 0,
                    DestinationPort = northbound ? "Hai Phong" : "Da Nang", NextPortCode = northbound ? "VNHPH" : "VNDAD",
                    DistanceToNextPort = 850, EstimatedArrival = date.AddDays(3), Remarks = "Hoàn tất kiểm tra trước khi rời cảng.", PreparedBy = Actor });
            if (day % 20 == 9)
            {
                Add("BUNKER", 2, new CreateBunkerReportDto { BunkerDate = date.AddHours(2), PortName = "Hai Phong", PortCode = "VNHPH",
                    SupplierName = "VMU Marine Fuels", BDNNumber = $"BDN-{batch}-{day:D3}", FuelType = "VLSFO", FuelGrade = "RMG 380",
                    QuantityReceived = 300, Density = 950, SulphurContent = .45, Viscosity = 180, FlashPoint = 70,
                    ROBBefore = fo, ROBAfter = fo + 300, TanksLoaded = "FO storage tanks 1P/1S", SealNumbers = $"SEAL-{day:D3}",
                    ChiefEngineerSignature = "Xác nhận thực hành", DeliveryMethod = "BARGE", UnitPrice = 580, TotalCost = 174000,
                    Remarks = "Đã kiểm tra lượng nhận và hồ sơ cấp nhiên liệu.", PreparedBy = Actor });
                fo += 300;
            }
            fo = Math.Round(fo - fuel, 2); diesel = Math.Round(diesel - doUsed, 2); lub -= loUsed; water -= fwUsed;
            // Fresh water produced by the vessel's fresh-water generator (6 t/day underway).
            if (sea) water += 6;
            if (phase == 9) water += 35;
            Add("NOON", 5, new CreateNoonReportDto { ReportDate = date.AddHours(5), Latitude = lat, Longitude = lon,
                CourseOverGround = sea ? (northbound ? 345 : 165) : 0, SpeedOverGround = speed, DistanceTraveled = sea ? Math.Round(speed * 24, 2) : 0,
                DistanceToGo = sea ? Math.Max(0, 850 - (leg + 1) * 280) : 0, EstimatedTimeOfArrival = sea ? date.AddDays(3 - leg) : date,
                WeatherConditions = day % 7 == 0 ? "RAIN" : "FAIR", SeaState = sea ? "MODERATE" : "CALM", AirTemperature = 28 + Math.Round(Math.Sin(day), 1),
                SeaTemperature = 27, BarometricPressure = 1010 + day % 8, WindDirection = "NE", WindSpeed = sea ? 10 + day % 8 : 4, Visibility = "GOOD",
                FuelOilConsumed = fuel, DieselOilConsumed = doUsed, LubOilConsumed = loUsed, FreshWaterConsumed = fwUsed,
                FuelOilROB = fo, DieselOilROB = diesel, LubOilROB = lub, FreshWaterROB = Math.Round(water, 2),
                MainEngineRunningHours = sea ? "24" : "0", MainEngineRPM = sea ? 92 + day % 4 : 0, MainEnginePower = sea ? 4900 + day % 5 * 100 : 0,
                AuxEngineRunningHours = "24", CargoOnBoard = 18500, CargoDescription = "Hàng container", CrewOnBoard = 25, PassengersOnBoard = 0,
                OperationalRemarks = sea ? "Coastal passage; routine bridge watch." : "Alongside; cargo operations and port watch.",
                MachineryRemarks = "Ghi nhận thông số máy trong ca trực.", CargoRemarks = "Lashing and reefer checks completed.",
                MaintenanceRemarks = "Routine rounds and leak checks.", GeneralRemarks = "Ghi nhận thông số vận hành trong ngày.", PreparedBy = Actor });
            if (phase is 1 or 2 or 6 or 7)
                Add("POSITION", 11, new CreatePositionReportDto { ReportDateTime = date.AddHours(11), Latitude = lat, Longitude = lon,
                    CourseOverGround = northbound ? 345 : 165, SpeedOverGround = speed, ReportReason = "ROUTINE",
                    LastPort = northbound ? "Da Nang" : "Hai Phong", NextPort = northbound ? "Hai Phong" : "Da Nang",
                    ETA = date.AddDays(3 - leg), CargoOnBoard = 18500, CrewOnBoard = 25, Remarks = "Ghi nhận vị trí và điều kiện hành trình.", PreparedBy = Actor });
            if (phase is 3 or 8)
                Add("ARRIVAL", 0, new CreateArrivalReportDto { ArrivalDateTime = date, PortName = phase == 3 ? "Da Nang" : "Hai Phong", PortCode = phase == 3 ? "VNDAD" : "VNHPH",
                    ArrivalLatitude = lat, ArrivalLongitude = lon, PilotOnBoardTime = date.AddHours(-1), FirstLineAshoreTime = date.AddMinutes(-15),
                    VoyageDistance = 850, VoyageDuration = 72, AverageSpeed = 850.0 / 72, DraftForward = 8.8, DraftAft = 9.2, DraftMidship = 9,
                    FuelOilROB = Math.Round(fo + fuel, 2), DieselOilROB = Math.Round(diesel + doUsed, 2), LubOilROB = lub + loUsed, FreshWaterROB = water + fwUsed,
                    TotalFuelConsumed = Enumerable.Range(day - 3, 3).Sum(d => Math.Round(18.5 + 1.2 * Math.Sin(d * .6), 2)), TotalDieselConsumed = 4.2,
                    CargoOnBoard = 18500, CargoDescription = "Hàng container", CrewOnBoard = 25, PassengersOnBoard = 0, Remarks = "Hoàn tất ghi nhận thông số khi cập cảng.", PreparedBy = Actor });
        }
        return entries.OrderBy(e => e.Date).ThenBy(e => e.Type).ToList();
    }

    public static async Task<int> RunAsync(IServiceProvider services, string[] args)
    {
        string? Opt(string key) { var i = Array.IndexOf(args, key); return i < 0 ? null : i + 1 < args.Length ? args[i + 1] : throw new ArgumentException($"Missing {key}"); }
        try
        {
            var start = DateTime.ParseExact(Opt("--start") ?? "2026-08-16", "yyyy-MM-dd", CultureInfo.InvariantCulture);
            var days = int.Parse(Opt("--days") ?? "90", CultureInfo.InvariantCulture);
            var batch = Opt("--batch") ?? "reports-20261114";
            var imo = Opt("--vessel-imo") ?? throw new ArgumentException("--vessel-imo is required");
            var plan = BuildPlan(start, days, batch);
            foreach (var entry in plan)
                System.ComponentModel.DataAnnotations.Validator.ValidateObject(entry.Payload, new(entry.Payload), validateAllProperties: true);
            if (plan.Any(e => e.Date > DateTime.UtcNow)) throw new ArgumentException("Demo reports must not be in the future");
            Console.WriteLine(JsonSerializer.Serialize(new { batch, imo, start, days, counts = plan.GroupBy(e => e.Type).ToDictionary(g => g.Key, g => g.Count()), workflow = plan.GroupBy(e => e.Target).ToDictionary(g => g.Key, g => g.Count()) }));
            if (!args.Contains("--apply")) { Console.WriteLine("PREVIEW ONLY: add --apply to write demo data."); return 0; }
            using var scope = services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();
            var config = await scope.ServiceProvider.GetRequiredService<IEdgeRuntimeConfigService>().GetSyncConfigAsync();
            if (config.VesselImo != imo || !config.ShoreVesselId.HasValue) throw new InvalidOperationException("Provisioned vessel does not match --vessel-imo");
            await db.Database.OpenConnectionAsync();
            // Session lock covers multiple report transactions and prevents concurrent seed runs.
            await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_lock(927836714)");
            try
            {
                // Fresh installations may not have run the old manual SeedReportTypes.sql.
                var standardId = 0;
                foreach (var type in new[] { ("NOON", "Noon Report", "DAILY"), ("DEPARTURE", "Departure Report", "VOYAGE_BASED"),
                    ("ARRIVAL", "Arrival Report", "VOYAGE_BASED"), ("BUNKER", "Bunker Delivery Note Report", "EVENT_BASED"), ("POSITION", "Position Report", "EVENT_BASED") })
                {
                    standardId++;
                    var existing = await db.ReportTypes.SingleOrDefaultAsync(t => t.TypeCode == type.Item1);
                    if (existing != null && existing.Id != standardId || await db.ReportTypes.AnyAsync(t => t.Id == standardId && t.TypeCode != type.Item1))
                        throw new InvalidOperationException("Catalog IDs conflict; reconcile Shore and Edge first.");
                    if (existing is { IsActive: false }) throw new InvalidOperationException($"Report type {type.Item1} is disabled; seed will not reactivate it.");
                    if (existing != null) continue;
                    db.ReportTypes.Add(new Models.ReportType { Id = standardId, TypeCode = type.Item1, TypeName = type.Item2, Frequency = type.Item3,
                        Category = type.Item1 == "BUNKER" ? "COMPLIANCE" : "OPERATIONAL", RequiresMasterSignature = type.Item1 != "POSITION", IsMandatory = type.Item1 != "POSITION", IsActive = true });
                }
                await db.SaveChangesAsync();
                await db.Database.ExecuteSqlRawAsync("SELECT setval(pg_get_serial_sequence('report_types','id'), GREATEST((SELECT max(id) FROM report_types),1))");
                await db.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS report_seed_registry (seed_key text PRIMARY KEY, report_id uuid NOT NULL UNIQUE REFERENCES maritime_reports(id), created_at timestamptz NOT NULL DEFAULT now())");
                var reporting = scope.ServiceProvider.GetRequiredService<IReportingService>();
                var created = 0; var skipped = 0; var conflicts = 0;
                foreach (var entry in plan)
                {
                    var registered = await db.Database.SqlQuery<int>($"""SELECT count(*)::int AS "Value" FROM report_seed_registry WHERE seed_key={entry.Key}""").SingleAsync();
                    if (registered > 0) { skipped++; continue; }
                    var legacyKey = entry.Key.Replace("[SEED:", "[DEMO:");
                    var legacyId = await db.MaritimeReports.Where(r => r.Remarks != null && r.Remarks.Contains(legacyKey)).Select(r => (Guid?)r.Id).FirstOrDefaultAsync();
                    if (legacyId.HasValue)
                    {
                        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO report_seed_registry(seed_key,report_id) VALUES ({entry.Key},{legacyId.Value}) ON CONFLICT DO NOTHING");
                        skipped++; continue;
                    }
                    if (entry.Type == "NOON" && await db.NoonReports.AnyAsync(r => r.ReportDate.Date == entry.Date.Date && r.MaritimeReport != null && r.MaritimeReport.DeletedAt == null))
                    { conflicts++; Console.WriteLine($"SKIP occupied Noon date {entry.Date:yyyy-MM-dd}; existing data preserved"); continue; }
                    await using var tx = await db.Database.BeginTransactionAsync();
                    var result = await Create(reporting, entry);
                    if (!result.Success || !result.ReportId.HasValue) throw new InvalidOperationException($"{entry.Key}: {result.Error}");
                    var id = result.ReportId.Value;
                    if (entry.Target != "DRAFT") Ensure(await reporting.SubmitReportAsync(id, Actor));
                    if (entry.Target == "REJECTED") Ensure(await reporting.RejectReportAsync(id, "Bổ sung nhận xét trước khi gửi lại", Actor));
                    if (entry.Target is "APPROVED" or "TRANSMITTED")
                        Ensure(await reporting.ApproveReportAsync(id, new ApproveReportDto { MasterSignature = "Xác nhận thực hành", ApprovalRemarks = "Đã kiểm tra số liệu báo cáo thực hành." }, Actor));
                    if (entry.Target == "TRANSMITTED") Ensure(await reporting.TransmitReportAsync(id, new TransmitReportDto { TransmissionMethod = "API", IncludeAttachments = false }, Actor));
                    await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO report_seed_registry(seed_key,report_id) VALUES ({entry.Key},{id})");
                    await tx.CommitAsync(); created++;
                    db.ChangeTracker.Clear();
                    Console.WriteLine($"{entry.Key} {result.ReportNumber} {entry.Target}");
                    await Task.Delay(80); // Keep demo creation from monopolizing a small production server.
                }
                var aggregate = scope.ServiceProvider.GetRequiredService<IAggregateReportService>();
                var weekly = 0; var monthly = 0;
                foreach (var w in plan.Where(e => e.Type == "NOON").Select(e => (Year: ISOWeek.GetYear(e.Date), Week: ISOWeek.GetWeekOfYear(e.Date))).Distinct())
                {
                    if (await db.WeeklyPerformanceReports.AnyAsync(r => r.Year == w.Year && r.WeekNumber == w.Week && r.VoyageId == null)) continue;
                    var r = await aggregate.GenerateWeeklyReportAsync(new GenerateWeeklyReportDto { Year = w.Year, WeekNumber = w.Week, Remarks = "Tổng hợp số liệu vận hành từ các báo cáo trưa trong tuần." }, Actor);
                    if (!r.Success) throw new InvalidOperationException(r.Error); weekly++; db.ChangeTracker.Clear();
                }
                foreach (var m in plan.Where(e => e.Type == "NOON").Select(e => (e.Date.Year, e.Date.Month)).Distinct())
                {
                    if (await db.MonthlySummaryReports.AnyAsync(r => r.Year == m.Year && r.Month == m.Month)) continue;
                    var r = await aggregate.GenerateMonthlyReportAsync(new GenerateMonthlyReportDto { Year = m.Year, Month = m.Month, Remarks = "Tổng hợp số liệu vận hành và nhiên liệu trong tháng." }, Actor);
                    if (!r.Success) throw new InvalidOperationException(r.Error); monthly++; db.ChangeTracker.Clear();
                }
                Console.WriteLine(JsonSerializer.Serialize(new { created, skipped, conflicts, weekly, monthly, delivery = "Queued via reporting service; verify delivery separately", aggregates = "Weekly/monthly drafts; no automatic approval or transmission" }));
            }
            finally { await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_unlock(927836714)"); await db.Database.CloseConnectionAsync(); }
            return 0;
        }
        catch (Exception ex) { Console.Error.WriteLine($"Demo seed stopped: {ex.Message}"); return 1; }
    }

    private static void Ensure((bool Success, string? Error) result) { if (!result.Success) throw new InvalidOperationException(result.Error); }
    private static T Read<T>(object payload) => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(payload), Json)!;
    private static Task<(bool Success, string ReportNumber, Guid? ReportId, string? Error)> Create(IReportingService service, Entry e) => e.Type switch
    {
        "NOON" => service.CreateNoonReportAsync(Read<CreateNoonReportDto>(e.Payload), Actor),
        "DEPARTURE" => service.CreateDepartureReportAsync(Read<CreateDepartureReportDto>(e.Payload), Actor),
        "ARRIVAL" => service.CreateArrivalReportAsync(Read<CreateArrivalReportDto>(e.Payload), Actor),
        "BUNKER" => service.CreateBunkerReportAsync(Read<CreateBunkerReportDto>(e.Payload), Actor),
        "POSITION" => service.CreatePositionReportAsync(Read<CreatePositionReportDto>(e.Payload), Actor),
        _ => throw new ArgumentException(e.Type)
    };
}
