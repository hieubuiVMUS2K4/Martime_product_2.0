# edge-services — Edge Backend (API chạy trên tàu)

## Mục đích

`edge-services` là backend ASP.NET Core 8 Web API chạy **trên tàu** (Edge) trong kiến trúc Edge-Shore của hệ thống quản lý hàng hải. Đây là "bộ não" tại chỗ của con tàu: thu thập dữ liệu cảm biến, ghi các loại nhật ký/báo cáo theo chuẩn hàng hải quốc tế (SOLAS, MARPOL, ISM Code, STCW...), quản lý bảo trì thiết bị (PMS), kho vật tư, an toàn/diễn tập, và — quan trọng nhất — **đồng bộ hai chiều** với hệ thống Shore (trên bờ) ngay cả khi kết nối mạng không ổn định hoặc mất hẳn (Iridium/VSAT/4G/WiFi).

Thông tin kỹ thuật cốt lõi:

| Thuộc tính | Giá trị |
|---|---|
| Framework | ASP.NET Core 8.0 Web API (`net8.0`), namespace gốc `MaritimeEdge`, assembly `MaritimeEdgeServer` |
| Port mặc định | `http://0.0.0.0:5001` (đặt trong `Program.cs`, có thể override bằng `--urls`) |
| Database | PostgreSQL, port **5433**, database `maritime_edge` (xem `appsettings.json → Database:ConnectionString`) |
| ORM | Entity Framework Core 8 + Npgsql, auto-migrate khi khởi động (`Database:AutoMigrate`) |
| Đối tượng phục vụ | **Một tàu duy nhất mỗi instance** — cấu hình tàu (IMO, MMSI, tên, loại tàu...) nằm tĩnh trong `appsettings.json → Vessel` |
| Thư viện dùng chung | `Maritime.Shared` (project reference `../shared/Maritime.Shared.csproj`) — chứa `ISyncableEntity`, các enum Sync, model Crew dùng chung với Shore |
| Điểm khởi động | `Program.cs` (top-level minimal hosting, không có `Startup.cs` riêng) |

## Cấu trúc & vai trò

| Thư mục / File | Vai trò | README riêng |
|---|---|---|
| `Controllers/` | 30+ API controller, chia theo domain (AI, Core, Crew, Inventory, Logbooks, Maintenance, Reporting, Safety, Testing, Voyage) | [Controllers/README.md](Controllers/README.md) |
| `Services/` | Toàn bộ business logic + background workers, chia theo domain tương ứng Controllers | [Services/README.md](Services/README.md) |
| `DTOs/` | Data Transfer Objects cho request/response API (tách biệt với Models/entity DB) | [DTOs/README.md](DTOs/README.md) |
| `Models/` | Entity Framework Core entity — ánh xạ trực tiếp tới bảng PostgreSQL | [Models/README.md](Models/README.md) |
| `Data/` | `EdgeDbContext` (EF Core DbContext trung tâm, ~100 DbSet), seed data, script SQL | [Data/README.md](Data/README.md) |
| `Repositories/` | Repository pattern — chỉ dùng cho 3 domain: `ShipData`, `EquipmentAsset`, `MaintenanceSchedule` | (xem "Ghi chú" bên dưới) |
| `Constants/` | Hằng số dạng string (status, priority, department...) dùng thay cho hard-code | (xem "Ghi chú" bên dưới) |
| `Mappings/` | AutoMapper `Profile` — khai báo ánh xạ Entity ↔ DTO (Voyage, Crew, Port, Reporting, Maintenance) | (xem "Ghi chú" bên dưới) |
| `Extensions/` | Extension method đăng ký AutoMapper vào DI container | (xem "Ghi chú" bên dưới) |
| `Security/` | `IAuthorizationHandler` tùy chỉnh cho policy `InternalAccess` (bảo vệ endpoint nội bộ như `/api/sync/*`) | (xem "Ghi chú" bên dưới) |
| `Helpers/` | Tiện ích độc lập, hiện có 1 file trích xuất header/footer từ file `.docx` sang HTML | (xem "Ghi chú" bên dưới) |
| `init-scripts/` | Script SQL chạy khi khởi tạo container Postgres (seed dữ liệu mẫu, patch schema thủ công) | (xem "Ghi chú" bên dưới) |
| `Program.cs` | Toàn bộ cấu hình ứng dụng: DI, middleware pipeline, migration tự động, đăng ký background service | — |
| `appsettings.json` | Cấu hình: DB, Sync (rất chi tiết), Auth, SignalK, TelemetrySimulator, NmeaPlayback, DataCleanup, rate limit | — |
| `EdgeCollector.csproj` | File project — xem "Công nghệ" bên dưới | — |
| `package.json` | **Không phải backend Node.js** — chỉ chứa 1 npm script (`generate:nmea:vietnam`) để sinh file NMEA giả lập test | — |

**Thư mục bị bỏ qua theo yêu cầu tài liệu này**: `bin/`, `obj/`, `Data/Migrations/` (migration EF Core tự sinh), `Data/Scripts/` (đã có README riêng có sẵn), `TestData/`, `uploads/`, `Properties/`.

## Luồng hoạt động chính

### 1. Khởi động ứng dụng (`Program.cs`)

```
LoadDotEnv()                         → nạp file .env (nếu có), ưu tiên: ENV hệ thống > .env > appsettings.json
ResolveConnectionString()            → build connection string Postgres từ EDGE_POSTGRES_* nếu có
DI registration                      → AuditInterceptor, EdgeDbContext, HttpClient("SignalK"/"ShoreAPI"),
                                        AutoMapper, ~30 business services, Repositories, NmeaParser (Singleton)
Đăng ký Background Services có điều kiện (đọc cờ *:Enabled trong appsettings.json):
  - TelemetrySimulatorService        (mặc định TẮT)
  - SignalKDataCollectorService      (mặc định TẮT)
  - NmeaPlaybackService              (mặc định BẬT — dùng file NMEA giả lập thay GPS thật)
  - GpsCollectorService              (mặc định TẮT — kết nối TCP gpsd thật)
  - PositionSyncEnqueuerService      (mặc định BẬT)
  - EngineSyncEnqueuerService        (mặc định BẬT)
  - AlertSyncEnqueuerService         (mặc định BẬT)
  - DataCleanupService               (luôn BẬT)
  - SyncBackgroundWorker             (BẬT nếu Sync:Enabled, mặc định true)
app.Build()
→ Tự động chạy EF Core Migrations (nếu Database:AutoMigrate)
→ Patch thủ công: ALTER TABLE engine_data ADD COLUMN is_running (raw SQL, NGOÀI hệ thống migration)
→ SmsSeedData.SeedAsync() (danh mục cảng do bờ phát xuống, tàu không tự nạp)
Middleware pipeline (ĐÚNG THỨ TỰ):
  1. GlobalExceptionMiddleware        (bắt mọi exception, trả JSON an toàn)
  2. Swagger (chỉ Development)
  3. UseForwardedHeaders / HTTPS (tùy Security:EnforceHttps)
  4. UseStaticFiles("/uploads")        (ảnh đại diện, chứng chỉ, tài liệu thuyền viên)
  5. UseCors("AllowFrontend")
  6. UseRouting → UseRateLimiter
  7. SessionAuthMiddleware             (custom — xem Services/Core/README.md)
  8. UseAuthorization → MapControllers
```

### 2. Vòng đời một request nghiệp vụ điển hình

Ví dụ: Sĩ quan boong tạo **Noon Report** từ frontend-edge:

```
POST /api/reports/noon
  → ReportingController.CreateNoonReport()
  → IReportingService.CreateNoonReportAsync()   (Services/Reporting/ReportingService.cs)
      - Validate theo quy tắc SOLAS/hàng hải
      - Sinh mã báo cáo (RPTTYPE-YYYY-NNNNNN)
      - Ghi MaritimeReport (wrapper) + NoonReport (chi tiết) trong 1 transaction
      - IsSynced = false (mặc định — sẽ được đồng bộ sau)
  → Khi báo cáo được TRANSMIT (POST /api/reports/{id}/transmit)
      → được đưa vào nhóm "report" của POST /api/sync/snapshot, hoặc
      → tự động được các Sync Enqueuer / SyncBackgroundWorker phát hiện IsSynced=false
  → SyncBackgroundWorker (Services/Core) đẩy lên Shore qua POST {ShoreAPI}/api/sync mỗi chu kỳ cấu hình
```

### 3. Vòng lặp đồng bộ Edge ↔ Shore (xem chi tiết tại `Services/Core/README.md` và `Services/Sync/README.md`)

Đây là chức năng đặc thù và phức tạp nhất của Edge backend — không phải một CRUD API thông thường. Được giải thích đầy đủ trong 2 README con nói trên.

## Liên kết với phần khác

- **`shore_product/backend/`** — đối tác phía bờ, expose `POST /api/sync`, `GET /api/sync/pull`, `POST /api/sync/acknowledge`, `POST /api/sync/heartbeat` mà `SyncService` ở đây gọi tới (base URL cấu hình tại `ShoreAPI:BaseUrl`, mặc định `http://localhost:5000`).
- **`edge_product/frontend-edge/`** — React dashboard dùng cho thuyền trưởng/sĩ quan, gọi toàn bộ API tại đây qua Axios (xem `vite.config` proxy phía frontend).
- **`edge_product/frontend-mobile/`** — app Flutter cho thuyền viên, dùng endpoint `api/auth/login-legacy`, `api/alarms`, v.v.
- **`edge_product/shared/Maritime.Shared.csproj`** — thư viện dùng chung Edge/Shore: `ISyncableEntity`, `SyncQueueItemDto`, `SyncPullResponse`, các model Crew (`CrewMember`, `Certificate`, `Country`, `Rank`...).
- **`e:/NCKH/Martime_product_v1.1/README.md`** — tài liệu tổng quan toàn dự án, dùng để đối chiếu thuật ngữ (Edge/Shore, Sync Priority, Data Ownership...).

## Ghi chú khi đọc/dạy

1. **Đây KHÔNG phải kiến trúc auth "chuẩn" ASP.NET Core.** Không có `builder.Services.AddAuthentication().AddJwtBearer(...)`. Thay vào đó là `SessionAuthMiddleware` tự viết, đọc Bearer token, tra bảng `UserSessions` (cache 5 phút bằng `IMemoryCache`). `builder.Services.AddAuthorizationBuilder()` chỉ định nghĩa **một** policy tên `InternalAccess` (xem `Security/InternalAccessHandler.cs`), dùng cho các endpoint nội bộ như `/api/sync/*`, `/api/health/ready`. Sinh viên mới dễ tìm nhầm "nơi cấu hình JWT" — thực ra không có.

2. **Vài "trục" abstraction tồn tại trong code nhưng KHÔNG được kết nối (dead code có chủ đích tốt):**
   - `Services/Reporting/Generators/*` + `ReportGeneratorBase<TDto,TReport>` — một pattern Template Method rất sạch để tạo báo cáo, nhưng **không được đăng ký trong `Program.cs`** và không được `ReportingController` gọi tới. Logic thực tế nằm nguyên khối trong `ReportingService.cs` (~2700 dòng).
   - `Services/Sync/BaseSyncEnqueuerService<TEntity>` — abstract base class nhằm "loại bỏ trùng lặp code" giữa 3 service enqueue (Position/Engine/Alert), nhưng cả 3 service thực tế (nằm trong `Services/Voyage/`) đều **tự viết lại logic riêng**, không kế thừa lớp này.
   - `Services/Core/QueryPerformanceInterceptor` + `QueryDiagnosticLogger` — interceptor đo hiệu năng query đã viết đầy đủ nhưng **không được `AddInterceptors()` vào `EdgeDbContext`** trong `Program.cs` (chỉ có `AuditInterceptor` được đăng ký).
   
   → Đây là ví dụ thực tế tốt để dạy sinh viên: đọc `Program.cs`/DI registration luôn để xác nhận một class có thực sự chạy hay không, đừng chỉ suy luận từ sự tồn tại của file.

3. **`Controllers/Core/SystemController.cs` là file rỗng** (0 byte) — tồn tại nhưng chưa có nội dung, có thể là placeholder cho tương lai.

4. **Kiến trúc Repository không nhất quán.** Chỉ 3 entity (`ShipData`, `EquipmentAsset`, `MaintenanceSchedule`) dùng Repository pattern (`Repositories/`); phần còn lại của toàn bộ codebase (98% services/controllers) tiêm thẳng `EdgeDbContext` và query trực tiếp bằng LINQ. Khi dạy, có thể dùng đây làm ví dụ so sánh 2 phong cách data-access trong cùng một dự án.

5. **`init-scripts/`** chứa các file `.sql` chạy thủ công/khi seed Docker: `seed-ship-data.sql`, `seed-crew-certs.sql`, `seed-voyage.sql` (dữ liệu mẫu); `add-onboard-status.sql`, `add-review-workflow-columns.sql` (patch schema ngoài luồng migration chính thức — kỹ thuật nợ cần lưu ý); `check-migrations.sql`, `mark-edge-migration.sql` (công cụ vận hành khi migration bị lệch); `reseed-edge-db.sql` (TRUNCATE toàn bộ + tạo lại, dùng khi cần reset môi trường dev, kèm tài khoản `admin/Admin@2026`).

6. **`Constants/TaskStatus.cs`** không chỉ chứa `TaskStatus` — file này còn định nghĩa `TaskPriority`, `TaskCategory`, `MaintenanceConstants`, `AlarmSeverity`, và đặc biệt là **`VoyageStatus`/`VoyageFinancialStatus`/`ExpenseRequestStatus`/...** với ma trận chuyển trạng thái hợp lệ (`ValidTransitions`) — đây thực chất là nơi định nghĩa state machine cho toàn bộ vòng đời chuyến đi và tài chính chuyến đi. Ngược lại, `Constants/Department.cs` lại chứa thêm `TaskStatusExtended` (một enum trạng thái task workflow khác). Tên file không phản ánh đầy đủ nội dung — cần đọc kỹ thay vì đoán qua tên file.

7. **`Mappings/MappingProfiles.cs`** gom 4 `AutoMapper.Profile` thực sự có nội dung (`VoyageProfile`, `CrewProfile`, `PortProfile`, `ReportingProfile`) và 1 profile rỗng (`MaintenanceProfile` — "No maintenance mappings at this time"). `Extensions/AutoMapperExtensions.cs` chỉ có nhiệm vụ gọi `services.AddAutoMapper(assembly)` để quét toàn bộ profile này.

8. **Chế độ mô phỏng dữ liệu cảm biến khi không có phần cứng thật:** thứ tự ưu tiên hiện tại (theo `appsettings.json`) là `NmeaPlayback` (đọc lại file NMEA đã ghi sẵn tại `TestData/nmea/vietnam-coastal-route.nmea`, sinh bằng script Node trong `package.json`) — **KHÔNG phải** `TelemetrySimulatorService` (sinh số ngẫu nhiên, đang tắt) hay `SignalKDataCollectorService` (gọi demo server signalk.org, đang tắt). Khi lên tàu thật, các cờ `*:Enabled` này sẽ đổi để dùng `GpsCollectorService` (TCP tới gpsd) và Modbus/MQTT thật (đã có package NModbus/MQTTnet trong `.csproj` nhưng theo khảo sát hiện chưa thấy service tương ứng sử dụng — có thể là hạ tầng chuẩn bị cho tương lai).
