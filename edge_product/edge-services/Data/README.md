# Data — EdgeDbContext: trung tâm dữ liệu & outbox tự động

## Mục đích

`Data/` chứa **`EdgeDbContext`** — DbContext EF Core duy nhất của Edge backend, ánh xạ ~132 `DbSet<>` tới toàn bộ domain (telemetry, voyage, crew, logbook, maintenance, inventory, reporting, HSQE, SMS...). Đây không chỉ là một DbContext "bình thường": nó còn tự cài đặt sẵn **outbox pattern** để tự động đẩy thay đổi dữ liệu vào hàng đợi đồng bộ (`SyncQueue`) — đây là chi tiết quan trọng nhất của cả thư mục, và là mảnh ghép còn thiếu nếu chỉ đọc `Services/Core/SyncService.cs`.

## Cấu trúc & vai trò

| File / thư mục | Vai trò |
|---|---|
| `EdgeDbContext.cs` | DbContext trung tâm (~3163 dòng): khai báo toàn bộ `DbSet<>`, cấu hình `OnModelCreating` (naming convention, index, quan hệ, seed tĩnh), và **override `SaveChanges`/`SaveChangesAsync`** để tự động chuẩn hoá UTC + tự động enqueue `SyncQueue` (outbox pattern). Có thêm `CleanupOldDataAsync()` (dùng bởi `DataCleanupService`) và `GetUnsyncedCountsAsync()`. |
| `SmsSeedData.cs` | `static class` — seed dữ liệu khởi tạo cho module SMS/ISM: 16 `IsmElement` (đủ 16 chương ISM Code), 7 `SmsProcedure` mẫu kèm `SmsFormTemplate` con (giấy phép vào không gian kín, báo cáo drill, NCR, defect report...). Idempotent — kiểm tra `AnyAsync()` trước khi seed, được gọi từ `Program.cs` mỗi lần khởi động. |
| `Scripts/` | Thư mục script `.sql` độc lập, chạy tay hoặc qua Docker init — **đã có `README.md` riêng** (xem bên dưới), không tạo mới ở đây. |
| `Migrations/` | *(bỏ qua theo phạm vi tài liệu này — do EF Core CLI tự sinh, không nên sửa tay).* |

### `Scripts/` — tóm tắt (chi tiết đầy đủ xem `Scripts/README.md` có sẵn, chỉ mô tả `SeedReportTypes.sql`)

| Script | Mục đích |
|---|---|
| `SeedReportTypes.sql` | Seed 5 `report_types` chuẩn IMO/SOLAS/MARPOL (NOON/DEPARTURE/ARRIVAL/BUNKER/POSITION) — **script duy nhất được mô tả trong `Scripts/README.md`**. |
| `AddSoftDelete.sql` | Thêm cột soft-delete cho `maritime_reports` (lưu trữ tối thiểu 3 năm theo IMO) + view `active_maritime_reports`. |
| `CreateAuditTrail.sql` | Tạo bảng `report_workflow_history` bằng SQL thuần (song song với entity `ReportWorkflowHistory` khai báo trong EF). |
| `SeedDrillTypes.sql`, `seed-drill-schedules.sql` | Seed loại drill (SOLAS/ISPS) và lịch drill mẫu cho timeline. |
| `SeedEmploymentDocuments.sql`, `SeedHealthDocuments.sql`, `SeedSeafarerDocuments.sql`, `SeedTravelDocuments.sql` | Seed hồ sơ mẫu cho 6 thuyền viên demo (hợp đồng, khám sức khỏe, sổ thuyền viên, hộ chiếu). |
| `seed-equipment-assets.sql` | Dựng cây phân cấp thiết bị tàu (Equipment Breakdown Structure) 6 hệ thống gốc (Động lực, Điện, Boong, An toàn, Điều hướng, PCCC) + các cấp con. |

## Luồng hoạt động chính

### A. Cấu hình áp dụng cho MỌI entity trong `OnModelCreating`

1. **UTC converter toàn cục** — mọi property `DateTime`/`DateTime?` được gắn `ValueConverter` ép `Kind = Utc` (khắc phục lỗi Npgsql "Cannot write DateTime with Kind=Unspecified to timestamp with time zone").
2. **snake_case tự động toàn hệ thống** — tên bảng/cột/khoá được tự động chuyển sang `snake_case` khi duyệt `modelBuilder.Model.GetEntityTypes()`, tôn trọng `[Column]`/`[Table]` tường minh nếu có. **2 ngoại lệ PascalCase đã biết**: `MaterialReceipt`→bảng `"MaterialReceipts"`, `MaterialReceiptItem`→bảng `"MaterialReceiptItems"` (ép cứng bằng `[Table(...)]`, không theo quy ước chung).
3. `HasDefaultSchema("public")`.
4. Index dày đặc: index mô tả (`IsDescending`) trên cột `Timestamp` cho bảng time-series; **partial index** `HasFilter("is_synced = false")` trên hầu hết bảng — tối ưu trực tiếp cho câu query mà các sync-enqueuer/`SyncService` dùng để tìm bản ghi chưa đồng bộ; unique index trên business key (`VoyageNumber`, `ScheduleCode`, `DrillCode`...).
5. Quan hệ dùng đủ 3 kiểu xoá: `Cascade` (con thuộc hẳn về cha — vd bảng con của `ShipData`), `SetNull` (FK optional — vd `Port`, `Rank` tham chiếu tuỳ chọn), `Restrict` (chặn xoá khi còn tham chiếu — vd `Certificate` ← `CrewCertificate`).
6. Seed tĩnh duy nhất qua `HasData()`: 10 `Rank` cố định (MAST, C/O, 2/O, 3/O, C/E, 2/E, BOSN, AB, OILR, COOK).
7. **Không có `HasQueryFilter` toàn cục cho soft-delete** — dù nhiều entity có `IsDeleted`/`DeletedAt` (MaintenanceTask, các logbook, DrillSchedule), EF Core KHÔNG tự lọc bản ghi đã xoá mềm; mỗi service phải tự thêm `.Where(!IsDeleted)`.

### B. Outbox tự động — `SaveChanges()` override (phần quan trọng nhất)

```csharp
public override int SaveChanges() { NormalizeDateTimesToUtc(); ProcessSyncQueue(); return base.SaveChanges(); }
public override async Task<int> SaveChangesAsync(...) { NormalizeDateTimesToUtc(); ProcessSyncQueue(); return await base.SaveChangesAsync(...); }

private void ProcessSyncQueue()
{
    foreach (entry in ChangeTracker.Entries().Where(Added|Modified|Deleted))
    {
        if (entry.Entity is SyncQueue) continue;                                   // tránh đệ quy
        if (entry.Entity is NavigationData/EnvironmentalData/SystemLog) continue;  // shore không lưu các bảng này
        if (entry.Entity is <11 loại Report>) continue;                            // report chỉ sync qua Transmit tường minh
        if (entityType.GetProperty("IsSynced") == null) continue;                  // không "syncable" → bỏ qua

        var syncItem = new SyncQueue {
            TableName = ToSnakeCase(entityType.Name),
            RecordKey = <giá trị khoá chính> (CrewCertificate dùng CertificateNumber thay vì Id),
            Priority  = GetPriorityForEntity(entityType),
            ActionType = CREATE / UPDATE / DELETE  (theo entry.State),
            Payload   = CREATE: JSON toàn bộ entity
                        UPDATE: JSON CHỈ property đã đổi (bỏ UpdatedAt/CreatedAt/IsSynced/SyncVersion/
                                OriginNode/LastSyncedAt/EdgeChanges/EdgeChangesViewed để tránh vòng
                                lặp sync vô hạn) — nếu sau khi loại trừ không còn gì thay đổi thật sự
                                thì BỎ QUA, không tạo SyncQueue
        };
        SyncQueue.Add(syncItem);
    }
}
```

`GetPriorityForEntity()` map cứng theo `Type`: **Critical** cho `SafetyAlarm`/`FuelEfficiencyAlert`; **Operational** cho nhóm Voyage (Record/PlanLeg/StatusHistory/CargoPlan/BunkerPlan/CrewChangePlan/CostEstimate/RevenueEstimate/ExpenseRequest/AdvancePayment/Disbursement/ActualRevenue/Settlement), `Port`, `PortCall`, `VoyageCrewAssignment`, `VoyageLogEntry`, `CargoOperation`, `EngineData`, `PositionData`, `MaritimeReport`/`NoonReport`/`PositionReport`, nhóm SMS (`IsmElement`/`SmsProcedure`/...), và toàn bộ entity Crew dùng chung (`CrewMember`, `CrewCertificate`, `ServiceRecord`, 4 loại document); **Low** là mặc định cho mọi entity còn lại (logbook, inventory...).

### C. Dọn dẹp dữ liệu cũ

`CleanupOldDataAsync(Dictionary<string,int> retentionDays)` — được `Services/Core/DataCleanupService` gọi 1 lần/ngày: xoá `PositionData`/`AisData`/`EngineData`/`EnvironmentalData` đã cũ hơn retention cấu hình (`Database:RetentionDays` trong `appsettings.json`), `NmeaRawData` giữ 1 ngày, `SyncQueue` đã đồng bộ (`SyncedAt != null`) giữ 7 ngày — dùng `ExecuteDeleteAsync()` (xoá trực tiếp trong DB, không load entity vào memory).

## Liên kết với phần khác

- **`Services/Core/README.md`** — `SyncBackgroundWorker`/`SyncService` là bên **tiêu thụ** `SyncQueue` do `ProcessSyncQueue()` tạo ra; `AuditInterceptor` (đăng ký qua `AddInterceptors()` trong `Program.cs`) chạy song song ở cùng thời điểm `SaveChanges` nhưng độc lập, ghi vào `SystemLog` chứ không phải `SyncQueue`.
- **`Services/Voyage/README.md`** — `PositionSyncEnqueuerService`/`EngineSyncEnqueuerService`/`AlertSyncEnqueuerService` enqueue **thêm một lần thủ công nữa** cho `PositionData`/`EngineData`/`SafetyAlarm`/`EngineEvent`, khả năng trùng với outbox tự động ở đây — xem phân tích chi tiết tại `Services/Core/README.md` mục "SyncQueue được nạp từ đâu?".
- **`Models/README.md`** — mọi `DbSet<>` trong `EdgeDbContext` tương ứng 1-1 với 1 entity class mô tả ở đây.
- **`Program.cs`** — nơi đăng ký `AddDbContext<EdgeDbContext>(...).AddInterceptors(AuditInterceptor)`, gọi `dbContext.Database.MigrateAsync()` và `SmsSeedData.SeedAsync()` mỗi lần khởi động. Danh mục cảng không nạp ở tàu — bờ làm chủ và phát xuống qua đồng bộ.

## Ghi chú khi đọc/dạy

- **Đọc `ProcessSyncQueue()` TRƯỚC khi đọc `SyncService.cs`.** Rất nhiều dev mới đọc `Services/Core/SyncService.cs` trước và tự hỏi "vậy `SyncQueue` được ai thêm vào?" — câu trả lời chính nằm ở đây, không phải ở `SyncService`.
- **`ProcessSyncQueue()` chỉ kiểm tra ENTITY TYPE có property `IsSynced` hay không — không kiểm tra GIÁ TRỊ của `IsSynced`.** Nghĩa là bất kỳ thay đổi nào (kể cả khi `IsSynced` đang là `true`) trên một entity "syncable" cũng có thể sinh ra `SyncQueue` mới, trừ khi đúng là chỉ có các field bị loại trừ (`UpdatedAt`, `IsSynced`, `OriginNode`...) thay đổi.
- **Nghi vấn trùng lặp cần thảo luận với nhóm phát triển**: `PositionData`, `EngineData`, `SafetyAlarm` được xử lý bởi CẢ outbox tự động ở đây LẪN 3 enqueuer thủ công trong `Services/Voyage/`. Về lý thuyết, một bản ghi `PositionData` mới có thể tạo ra 2 `SyncQueue` entries khác định dạng payload trong vòng đời của nó. Đây là bài tập phân tích code tốt cho sinh viên: dùng debugger hoặc thêm log tạm để xác nhận có thật sự xảy ra 2 lần enqueue hay không trong môi trường chạy thật.
- **`EdgeModels.cs` là "God file"** (6254 dòng, xác nhận bằng `wc -l`, chứa phần lớn entity của mọi domain trừ HSQE/SMS/Drill/ShipData/FuelAnalytics/MaterialReceipt được tách file riêng) — khi tìm 1 entity, đừng quên kiểm tra cả các file Model chuyên biệt trước khi kết luận "không có".
- **Chỉ đúng 13 class** implement tường minh `ISyncableEntity` (`Port` + 12 class thuộc Voyage Planning/Financial: `VoyagePlanLeg`, `VoyageStatusHistory`, `VoyageCargoPlan`, `VoyageBunkerPlan`, `VoyageCrewChangePlan`, `VoyageCostEstimate`, `VoyageRevenueEstimate`, `VoyageExpenseRequest`, `VoyageAdvancePayment`, `VoyageDisbursement`, `VoyageActualRevenue`, `VoyageSettlement`) — đã xác minh bằng tìm kiếm toàn văn `: ISyncableEntity`. Phần lớn entity khác chỉ theo "quy ước" có đủ 4 field (`IsSynced`/`OriginNode`/`CreatedAt`/`UpdatedAt`) mà không khai báo interface và **không có `SyncVersion`** — nghĩa là chúng KHÔNG dùng optimistic concurrency version khi giải quyết xung đột, khác với nhóm 13 class kia.
- **`QueryPerformanceInterceptor`/`QueryDiagnosticLogger`** (định nghĩa ở `Services/Core/`) **không được `AddInterceptors()`** vào `EdgeDbContext` — chỉ `AuditInterceptor` mới thực sự chạy. Đừng dạy nhầm đây là tính năng đang hoạt động.
- **Không có global soft-delete filter** — khi viết code mới hoặc review code cũ thao tác trên `MaintenanceTask`/logbook/`DrillSchedule`, luôn tự hỏi "chỗ này đã lọc `IsDeleted` chưa?" vì EF Core sẽ không tự làm giúp.
