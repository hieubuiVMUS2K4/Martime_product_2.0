using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Text.Json;
using System.Threading.RateLimiting;
using ProductApi.Data;
using ProductApi.Security;
using ProductApi.Services;

var builder = WebApplication.CreateBuilder(args);

// Configuration
var configuration = builder.Configuration;
var environment = builder.Environment;
var enforceHttps = configuration.GetValue("Security:EnforceHttps", false);

// Add services
builder.Services.AddControllers()
    .AddJsonOptions(opts =>
    {
        opts.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        opts.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
        opts.JsonSerializerOptions.DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddMemoryCache();

var dataProtectionKeysPath = configuration["DataProtection:KeysPath"] ?? "/root/.aspnet/DataProtection-Keys";
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(dataProtectionKeysPath))
    .SetApplicationName("MaritimeShoreProduct");

builder.Services.AddHttpsRedirection(options =>
{
    options.HttpsPort = configuration.GetValue<int?>("Security:HttpsPort") ?? 443;
});

// DbContext
var conn = configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(conn))
    throw new InvalidOperationException("ConnectionStrings:DefaultConnection must be configured.");

builder.Services.AddDbContext<AppDbContext>((sp, options) =>
    options.UseNpgsql(conn)
           .UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking));

// CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowWebMobile", policy =>
    {
        var allowedOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
        if (allowedOrigins.Length > 0)
            policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod();
        else
            policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    });
});

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor |
                               ForwardedHeaders.XForwardedProto |
                               ForwardedHeaders.XForwardedHost;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

// JWT
var jwtKey = configuration["JWT:Key"] ?? configuration["JWT__Key"];
if (string.IsNullOrWhiteSpace(jwtKey))
    throw new InvalidOperationException("JWT:Key must be configured via appsettings or environment variables.");

var key = Encoding.ASCII.GetBytes(jwtKey);
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = enforceHttps && !environment.IsDevelopment();
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(key),
        ValidateIssuer = false,
        ValidateAudience = false
    };
});

// Authorization policies â€” role-based access for Crew Management
builder.Services.AddAuthorizationBuilder()
    // HR Admin + Crew Coordinator â€” full crew management
    .AddPolicy("CrewManagement", policy =>
        policy.RequireRole("Admin", "HRAdmin", "CrewCoordinator", "SystemAdmin"))
    // Compliance Officer â€” compliance rules, waivers, document verification
    .AddPolicy("ComplianceManagement", policy =>
        policy.RequireRole("Admin", "ComplianceOfficer", "SystemAdmin"))
    // Travel Coordinator â€” travel requests and itineraries
    .AddPolicy("TravelManagement", policy =>
        policy.RequireRole("Admin", "TravelCoordinator", "CrewCoordinator", "SystemAdmin"))
    // Fleet Manager + Port Captain â€” planning, assignments, external requests
    .AddPolicy("FleetManagement", policy =>
        policy.RequireRole("Admin", "FleetManager", "PortCaptain", "CrewCoordinator", "SystemAdmin"))
    // Master (edge) â€” onboard events, sign-on/sign-off
    .AddPolicy("OnboardManagement", policy =>
        policy.RequireRole("Admin", "Master", "ChiefOfficer", "CrewCoordinator", "SystemAdmin"))
    // Read-only access for authenticated users
    .AddPolicy("CrewReadOnly", policy =>
        policy.RequireAuthenticatedUser())
    // Internal operational access for observability and admin sync endpoints.
    .AddPolicy("InternalAccess", policy =>
        policy.Requirements.Add(new InternalAccessRequirement()));

builder.Services.AddSingleton<IAuthorizationHandler, InternalAccessHandler>();
builder.Services.AddSingleton<IDataEncryptionService, DataEncryptionService>();
builder.Services.AddScoped<ProductApi.Security.SyncRequestVerificationMiddleware>();
builder.Services.AddScoped<ProductApi.Services.IVesselProvisioningService, ProductApi.Services.VesselProvisioningService>();
builder.Services.AddScoped<ProductApi.Security.NodeApiTokenMiddleware>();

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, cancellationToken) =>
    {
        int? retryAfterSeconds = null;
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            retryAfterSeconds = Math.Max(1, (int)Math.Ceiling(retryAfter.TotalSeconds));
            context.HttpContext.Response.Headers["Retry-After"] = retryAfterSeconds.Value.ToString();
        }

        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        context.HttpContext.Response.ContentType = "application/json";

        var payload = JsonSerializer.Serialize(new
        {
            success = false,
            answer = retryAfterSeconds.HasValue
                ? $"Backend Ä‘ang giá»›i háº¡n táº§n suáº¥t yÃªu cáº§u. Vui lÃ²ng thá»­ láº¡i sau {retryAfterSeconds.Value}s."
                : "Backend Ä‘ang giá»›i háº¡n táº§n suáº¥t yÃªu cáº§u. Vui lÃ²ng thá»­ láº¡i sau.",
            errorSource = "backend_rate_limiter",
            retryAfterSeconds
        });

        await context.HttpContext.Response.WriteAsync(payload, cancellationToken);
    };

    options.AddPolicy("sync", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 240,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 10,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst
            }));

    options.AddPolicy("observability", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 30,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst
            }));

    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 600,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 20,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst
            }));
});

// Add Redis cache (commented out until package is available)
// builder.Services.AddStackExchangeRedisCache(options =>
// {
//     var redisConn = configuration.GetConnectionString("Redis") ?? "redis:6379";
//     options.Configuration = redisConn;
//     options.InstanceName = "MaritimeManagement";
// });

// DI for services/repositories
builder.Services.AddScoped<IShipService, ShipService>();
builder.Services.AddScoped<IShipRepository, ShipRepository>();

// Register maritime services
builder.Services.AddScoped<IVesselService, VesselService>();
builder.Services.AddScoped<IAlertService, AlertService>();
builder.Services.AddScoped<ITelemetryService, TelemetryService>();

// Register crew management services (Phase 2)
builder.Services.AddScoped<ProductApi.Services.Crew.ICrewService, ProductApi.Services.Crew.CrewService>();
builder.Services.AddScoped<ProductApi.Services.Crew.ICertificateService, ProductApi.Services.Crew.CertificateService>();

// Register crew management workflow services (Phase 1A)
builder.Services.AddScoped<ProductApi.Services.CrewManagement.IAuditService, ProductApi.Services.CrewManagement.AuditService>();
builder.Services.AddScoped<ProductApi.Services.CrewManagement.ICrewStatusService, ProductApi.Services.CrewManagement.CrewStatusService>();
builder.Services.AddScoped<ProductApi.Services.CrewManagement.IOnboardingService, ProductApi.Services.CrewManagement.OnboardingService>();
builder.Services.AddScoped<ProductApi.Services.CrewManagement.IDocumentWorkflowService, ProductApi.Services.CrewManagement.DocumentWorkflowService>();

// Register compliance service (Phase 2)
builder.Services.AddScoped<ProductApi.Services.CrewManagement.IComplianceService, ProductApi.Services.CrewManagement.ComplianceService>();

// Register assignment service (Phase 5)
builder.Services.AddScoped<ProductApi.Services.CrewManagement.IAssignmentService, ProductApi.Services.CrewManagement.AssignmentService>();

// Register external request & travel services (Phase 6)
builder.Services.AddScoped<ProductApi.Services.CrewManagement.IExternalRequestService, ProductApi.Services.CrewManagement.ExternalRequestService>();
builder.Services.AddScoped<ProductApi.Services.CrewManagement.ITravelService, ProductApi.Services.CrewManagement.TravelService>();

// Register onboard event service (Phase 7)
builder.Services.AddScoped<ProductApi.Services.CrewManagement.IOnboardEventService, ProductApi.Services.CrewManagement.OnboardEventService>();

// Register sync services (Phase 3)
builder.Services.AddScoped<ProductApi.Services.Sync.ISyncInboxService, ProductApi.Services.Sync.SyncInboxService>();
builder.Services.AddScoped<ProductApi.Services.Sync.ISyncOutboxService, ProductApi.Services.Sync.SyncOutboxService>();
builder.Services.AddScoped<ProductApi.Services.Sync.ISyncFileStorageService, ProductApi.Services.Sync.LocalSyncFileStorageService>();
builder.Services.AddScoped<ProductApi.Services.Sync.ISyncFileTransferService, ProductApi.Services.Sync.SyncFileTransferService>();
builder.Services.AddScoped<ProductApi.Services.Sync.IConflictResolverService, ProductApi.Services.Sync.ConflictResolverService>();
builder.Services.AddScoped<ProductApi.Services.INotificationService, ProductApi.Services.NotificationService>();
builder.Services.AddScoped<ProductApi.Services.Sync.ICrewSyncOrchestrator, ProductApi.Services.Sync.CrewSyncOrchestrator>();

// Register voyage management service
builder.Services.AddScoped<ProductApi.Services.Voyage.IVoyageService, ProductApi.Services.Voyage.VoyageService>();
builder.Services.AddScoped<ProductApi.Services.Voyage.IVoyagePlanningService, ProductApi.Services.Voyage.VoyagePlanningService>();

// Register network detection service (Phase 2.2)
builder.Services.AddScoped<ProductApi.Services.Network.INetworkDetectionService, ProductApi.Services.Network.NetworkDetectionService>();

// Register replay protection service (Phase 2.3)
builder.Services.AddScoped<ProductApi.Services.Sync.ISyncNonceRegistryService, ProductApi.Services.Sync.SyncNonceRegistryService>();

// Register DLQ and retry policy services (Phase 2.4)
builder.Services.AddScoped<ProductApi.Services.Sync.ISyncDlqService, ProductApi.Services.Sync.SyncDlqService>();
builder.Services.AddScoped<ProductApi.Services.Sync.ISyncRetryPolicy, ProductApi.Services.Sync.SyncRetryPolicy>();

// Background services
builder.Services.AddHostedService<AlertBackgroundService>();
builder.Services.AddHostedService<ProductApi.Services.Sync.CertificateExpiryMonitorService>();
builder.Services.AddHostedService<ProductApi.Services.Sync.SyncHealthMonitorService>();
builder.Services.AddHostedService<ProductApi.Services.Background.NetworkAwareSyncBackgroundService>();

// AI Services
builder.Services.AddHttpClient<ProductApi.Services.AI.IGeminiEvaluationService, ProductApi.Services.AI.GeminiEvaluationService>()
    .ConfigureHttpClient(client => client.Timeout = TimeSpan.FromSeconds(30)) // 30s timeout (20s chat + buffer)
    .AddStandardResilienceHandler(options =>
    {
        options.Retry.MaxRetryAttempts = 3;
        options.Retry.Delay = TimeSpan.FromSeconds(2);
    });

// AI Enhancement Services (V2 - Caching, Semantic Analysis, Conversation History)
builder.Services.AddSingleton<ProductApi.Services.AI.Caching.IAiCacheService, ProductApi.Services.AI.Caching.AiMemoryCacheService>();
builder.Services.AddScoped<ProductApi.Services.AI.Analysis.ISemanticAnalysisService, ProductApi.Services.AI.Analysis.SemanticAnalysisService>();
builder.Services.AddSingleton<ProductApi.Services.AI.Conversation.IConversationHistoryService, ProductApi.Services.AI.Conversation.ConversationHistoryService>();

// Use V2 with enhancements - supports backward compatibility
builder.Services.AddScoped<ProductApi.Services.AI.IAiChatService, ProductApi.Services.AI.AiChatServiceV2>();

// DE4 Weather Routing (A* + baseline + mock hazard)
builder.Services.AddScoped<ProductApi.Services.WeatherRouting.IGridBuilder, ProductApi.Services.WeatherRouting.GridBuilder>();
// Hàm đánh giá tính bằng NHIÊN LIỆU (tấn), có kể sức cản sóng gió — thay cho khoảng cách thuần.
// Dùng tham số nhiên liệu mặc định: hình dạng tuyến tối ưu chỉ phụ thuộc các hệ số tổn thất
// tốc độ (sóng/gió), còn sức chứa hay công suất của từng tàu chỉ co giãn chi phí theo một hệ số
// chung nên không đổi thứ tự các tuyến. Cá thể hoá theo vessel_fuel_profiles là bước sau.
// Đổi về HeuristicCost nếu cần so sánh với đường ngắn nhất thuần tuý.
builder.Services.AddScoped<ProductApi.Services.WeatherRouting.IHeuristicCost>(_ =>
    new ProductApi.Services.WeatherRouting.WeatherFuelCost(
        new ProductApi.Services.WeatherRouting.FuelModel(
            new ProductApi.Services.WeatherRouting.FuelModelOptions())));
builder.Services.AddScoped<ProductApi.Services.WeatherRouting.IAstStarRouter, ProductApi.Services.WeatherRouting.AstStarRouter>();
builder.Services.AddScoped<ProductApi.Services.WeatherRouting.IStraightBaselineRouter, ProductApi.Services.WeatherRouting.StraightBaselineRouter>();
builder.Services.AddScoped<ProductApi.Services.WeatherRouting.IWeatherRoutingService, ProductApi.Services.WeatherRouting.WeatherRoutingService>();

// DE4 Weather Routing — lập kế hoạch n chặng (bunkering / fuel plan)
builder.Services.AddScoped<ProductApi.Services.WeatherRouting.IVoyageLegPlanner, ProductApi.Services.WeatherRouting.VoyageLegPlanner>();
builder.Services.AddScoped<ProductApi.Services.WeatherRouting.IVoyageLegPlanService, ProductApi.Services.WeatherRouting.VoyageLegPlanService>();


builder.Services.AddSingleton<ProductApi.Services.Background.ReportEvaluationQueue>();
builder.Services.AddHostedService<ProductApi.Services.Background.ReportEvaluationWorker>();

// Phase 2.3: Nonce registry cleanup service
builder.Services.AddHostedService<ProductApi.Services.Sync.SyncNonceRegistryCleanupService>();
builder.Services.AddHostedService<ProductApi.Services.Sync.SyncQueuePurgeService>();

// Production Health Checks
builder.Services.AddHealthChecks()
    .AddCheck<ProductApi.Security.DatabaseHealthCheck>("postgres_db");


// Secret Validation for Production Mode
using (var loggerFactory = LoggerFactory.Create(logging => logging.AddConsole()))
{
    var tempLogger = loggerFactory.CreateLogger("StartupValidation");
    builder.Configuration.ValidateProductionSecrets(builder.Environment, tempLogger);
}

var app = builder.Build();

// Seed an existing database without starting workers or applying unrelated migrations.
if (builder.Configuration.GetValue("SeedRanksOnly", false))
{
    using var seedScope = app.Services.CreateScope();
    var added = await RankSeedData.SeedAsync(seedScope.ServiceProvider.GetRequiredService<AppDbContext>());
    app.Logger.LogInformation("Rank catalogue seeded: {Added} new ranks.", added);
    return;
}


// Migrate DB using EF Core Migrations
var autoMigrateDatabase = builder.Configuration.GetValue("Database:AutoMigrate", true);
if (autoMigrateDatabase)
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    db.Database.SetCommandTimeout(TimeSpan.FromMinutes(5));
    var retryCount = 0;
    while (retryCount < 5)
    {
        try
        {
            logger.LogInformation($"Attempting database migration (Attempt {retryCount + 1}/5)...");
            db.Database.Migrate();
            await db.Database.ExecuteSqlRawAsync(@"
                CREATE TABLE IF NOT EXISTS voyage_reviews (
                    ""Id"" uuid NOT NULL,
                    ""VoyageId"" uuid NOT NULL,
                    ""ReviewStatus"" character varying(30) NOT NULL,
                    ""Notes"" text,
                    ""ReviewedBy"" character varying(100),
                    ""ReviewedAt"" timestamp with time zone,
                    ""Tags"" text,
                    ""CreatedAt"" timestamp with time zone NOT NULL,
                    ""UpdatedAt"" timestamp with time zone NOT NULL,
                    CONSTRAINT ""PK_voyage_reviews"" PRIMARY KEY (""Id""),
                    CONSTRAINT ""FK_voyage_reviews_voyage_records_VoyageId"" FOREIGN KEY (""VoyageId"") REFERENCES voyage_records (""Id"") ON DELETE CASCADE
                );

                CREATE UNIQUE INDEX IF NOT EXISTS ""IX_voyage_reviews_VoyageId"" ON voyage_reviews (""VoyageId"");
                CREATE INDEX IF NOT EXISTS ""IX_voyage_reviews_ReviewStatus"" ON voyage_reviews (""ReviewStatus"");
            ");
            // â”€â”€ Migration: Add IsRunning column to EngineData â”€â”€
            await db.Database.ExecuteSqlRawAsync(@"
                ALTER TABLE ""EngineData""
                ADD COLUMN IF NOT EXISTS ""IsRunning"" boolean NOT NULL DEFAULT false;
            ");

            await db.Database.ExecuteSqlRawAsync(@"
                ALTER TABLE crew_members
                ADD COLUMN IF NOT EXISTS ""VesselId"" uuid;

                CREATE INDEX IF NOT EXISTS ""IX_crew_members_VesselId"" ON crew_members (""VesselId"");

                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.tables
                        WHERE table_schema = 'public' AND table_name = 'crew_assignments'
                    ) THEN
                        UPDATE crew_members AS cm
                        SET ""VesselId"" = src.""VesselId""
                        FROM (
                            SELECT DISTINCT ON (ca.""CrewMemberId"")
                                ca.""CrewMemberId"",
                                ca.""VesselId""
                            FROM crew_assignments AS ca
                            WHERE ca.""Status"" IN (
                                'OnBoarded',
                                'ReadyToJoin',
                                'TravelInProgress',
                                'Confirmed',
                                'PendingCrewConfirmation',
                                'Proposed',
                                'Draft'
                            )
                            ORDER BY
                                ca.""CrewMemberId"",
                                CASE ca.""Status""
                                    WHEN 'OnBoarded' THEN 1
                                    WHEN 'ReadyToJoin' THEN 2
                                    WHEN 'TravelInProgress' THEN 3
                                    WHEN 'Confirmed' THEN 4
                                    WHEN 'PendingCrewConfirmation' THEN 5
                                    WHEN 'Proposed' THEN 6
                                    WHEN 'Draft' THEN 7
                                    ELSE 99
                                END,
                                COALESCE(ca.""ActualStartDate"", ca.""PlannedStartDate"", ca.""UpdatedAt"", ca.""CreatedAt"") DESC
                        ) AS src
                        WHERE cm.""Id"" = src.""CrewMemberId""
                          AND cm.""VesselId"" IS NULL;
                    END IF;
                END $$;
            ");
            // â”€â”€ PMS: add VesselId to equipment_assets & material_items â”€â”€
            await db.Database.ExecuteSqlRawAsync(@"
                ALTER TABLE equipment_assets
                ADD COLUMN IF NOT EXISTS ""VesselId"" uuid;

                DROP INDEX IF EXISTS ""IX_equipment_assets_AssetCode"";
                CREATE UNIQUE INDEX IF NOT EXISTS ""IX_equipment_assets_VesselId_AssetCode""
                    ON equipment_assets (""VesselId"", ""AssetCode"");

                ALTER TABLE material_item_ship
                ADD COLUMN IF NOT EXISTS ""VesselId"" uuid;

                DROP INDEX IF EXISTS ""IX_material_items_ItemCode"";
                DROP INDEX IF EXISTS ""IX_material_items_VesselId_ItemCode"";
                CREATE UNIQUE INDEX IF NOT EXISTS ""IX_material_item_ship_VesselId_ShipItemCode""
                    ON material_item_ship (""VesselId"", ""ShipItemCode"");

                ALTER TABLE ""MaintenanceTasks""
                ADD COLUMN IF NOT EXISTS ""VesselId"" uuid;

                CREATE INDEX IF NOT EXISTS ""IX_MaintenanceTasks_VesselId""
                    ON ""MaintenanceTasks"" (""VesselId"");

                -- Backfill VesselId from OriginNode (IMO) for existing tasks
                UPDATE ""MaintenanceTasks"" AS mt
                SET ""VesselId"" = v.""Id""
                FROM ""Vessels"" AS v
                WHERE mt.""VesselId"" IS NULL
                  AND mt.""OriginNode"" IS NOT NULL
                  AND mt.""OriginNode"" <> ''
                  AND mt.""OriginNode"" <> 'SHORE'
                  AND v.""IMO"" = mt.""OriginNode"";
            ");

            // â”€â”€ Shore notifications table â”€â”€
            await db.Database.ExecuteSqlRawAsync(@"
                CREATE TABLE IF NOT EXISTS shore_notifications (
                    ""Id""         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    ""Type""       character varying(50)  NOT NULL,
                    ""Title""      character varying(200) NOT NULL,
                    ""Message""    character varying(500) NOT NULL,
                    ""VesselId""   uuid,
                    ""VesselName"" character varying(200),
                    ""CrewMemberId"" uuid,
                    ""CrewName""   character varying(200),
                    ""CreatedAt""  timestamp with time zone NOT NULL DEFAULT NOW(),
                    ""IsRead""     boolean NOT NULL DEFAULT false
                );

                CREATE INDEX IF NOT EXISTS ""IX_shore_notifications_CreatedAt""
                    ON shore_notifications (""CreatedAt"");
                CREATE INDEX IF NOT EXISTS ""IX_shore_notifications_IsRead""
                    ON shore_notifications (""IsRead"");
            ");

            // ---- DE4 Weather Routing: hồ sơ nhiên liệu tàu + cột PlanJson ----
            await db.Database.ExecuteSqlRawAsync(@"
                CREATE TABLE IF NOT EXISTS vessel_fuel_profiles (
                    ""Id"" uuid NOT NULL,
                    ""VesselId"" uuid NOT NULL,
                    ""VesselName"" character varying(100) NULL,
                    ""FuelType"" character varying(20) NOT NULL DEFAULT 'VLSFO',
                    ""FuelCapacityTons"" double precision NOT NULL DEFAULT 220,
                    ""CurrentFuelTons"" double precision NULL,
                    ""ReserveFraction"" double precision NOT NULL DEFAULT 0.2,
                    ""ServiceSpeedKts"" double precision NOT NULL DEFAULT 11.5,
                    ""ServicePowerKw"" double precision NOT NULL DEFAULT 900,
                    ""SfocMainGPerKwh"" double precision NOT NULL DEFAULT 180,
                    ""AuxLoadKw"" double precision NOT NULL DEFAULT 120,
                    ""SfocAuxGPerKwh"" double precision NOT NULL DEFAULT 215,
                    ""SeaMarginFraction"" double precision NOT NULL DEFAULT 0.15,
                    ""SpeedExponent"" double precision NOT NULL DEFAULT 3.0,
                    ""WeatherAllowanceFraction"" double precision NOT NULL DEFAULT 0.08,
                    ""PortStayHours"" double precision NOT NULL DEFAULT 8.0,
                    ""MaxDetourNm"" double precision NOT NULL DEFAULT 250,
                    ""Source"" character varying(20) NOT NULL DEFAULT 'ESTIMATE',
                    ""Notes"" character varying(500) NULL,
                    ""CreatedAt"" timestamp with time zone NOT NULL,
                    ""UpdatedAt"" timestamp with time zone NOT NULL,
                    CONSTRAINT ""PK_vessel_fuel_profiles"" PRIMARY KEY (""Id"")
                );

                CREATE UNIQUE INDEX IF NOT EXISTS ""IX_vessel_fuel_profiles_VesselId""
                    ON vessel_fuel_profiles (""VesselId"");

                ALTER TABLE weather_routing_jobs
                ADD COLUMN IF NOT EXISTS ""PlanJson"" jsonb NOT NULL DEFAULT jsonb_build_object();

                ALTER TABLE ""Vessels"" ADD COLUMN IF NOT EXISTS ""MainEnginePowerKw"" double precision;
                ALTER TABLE ""Vessels"" ADD COLUMN IF NOT EXISTS ""FuelCapacityTons"" double precision;
                ALTER TABLE ""Vessels"" ADD COLUMN IF NOT EXISTS ""FuelConsumptionTonsPerDay"" double precision;
                ALTER TABLE ""Vessels"" ADD COLUMN IF NOT EXISTS ""CruisingRangeNm"" double precision;

            ");

            // Ensure the username uniqueness constraint.
            await db.Database.ExecuteSqlRawAsync(@"
                CREATE UNIQUE INDEX IF NOT EXISTS ""IX_Users_Username""
                    ON ""Users"" (""Username"");

            ");

            // â”€â”€ Auto-create SMS tables if not present â”€â”€
            await db.Database.ExecuteSqlRawAsync(@"
                CREATE TABLE IF NOT EXISTS ism_elements (
                    ""Id"" integer NOT NULL,
                    ""ChapterName"" character varying(250) NOT NULL,
                    CONSTRAINT ""PK_ism_elements"" PRIMARY KEY (""Id"")
                );

                CREATE TABLE IF NOT EXISTS sms_procedures (
                    ""Id"" uuid NOT NULL,
                    ""IsmElementId"" integer NOT NULL,
                    ""ProcedureCode"" character varying(50) NOT NULL,
                    ""Title"" character varying(300) NOT NULL,
                    ""Content"" text NOT NULL,
                    ""Version"" character varying(20) NOT NULL,
                    ""PublishDate"" timestamp with time zone NOT NULL,
                    ""ObsoleteDate"" timestamp with time zone,
                    ""Status"" character varying(20) NOT NULL,
                    ""WatermarkText"" character varying(100),
                    ""FilePath"" character varying(500),
                    ""OriginalFileName"" character varying(250),
                    ""ChangeNote"" text,
                    ""CreatedAt"" timestamp with time zone NOT NULL,
                    ""UpdatedAt"" timestamp with time zone NOT NULL,
                    CONSTRAINT ""PK_sms_procedures"" PRIMARY KEY (""Id""),
                    CONSTRAINT ""FK_sms_procedures_ism_elements_IsmElementId"" FOREIGN KEY (""IsmElementId"") REFERENCES ism_elements (""Id"") ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS sms_procedure_acknowledgements (
                    ""Id"" uuid NOT NULL,
                    ""SmsProcedureId"" uuid NOT NULL,
                    ""UserName"" character varying(100) NOT NULL,
                    ""Rank"" character varying(50) NOT NULL,
                    ""AcknowledgedAt"" timestamp with time zone NOT NULL,
                    ""DigitalSignature"" text,
                    ""CreatedAt"" timestamp with time zone NOT NULL,
                    ""UpdatedAt"" timestamp with time zone NOT NULL,
                    CONSTRAINT ""PK_sms_procedure_acknowledgements"" PRIMARY KEY (""Id""),
                    CONSTRAINT ""FK_sms_procedure_ack_sms_procedures"" FOREIGN KEY (""SmsProcedureId"") REFERENCES sms_procedures (""Id"") ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS sms_form_templates (
                    ""Id"" uuid NOT NULL,
                    ""SmsProcedureId"" uuid NOT NULL,
                    ""FormCode"" character varying(50) NOT NULL,
                    ""Title"" character varying(300) NOT NULL,
                    ""ContentSchema"" text NOT NULL,
                    ""CreatedAt"" timestamp with time zone NOT NULL,
                    ""UpdatedAt"" timestamp with time zone NOT NULL,
                    CONSTRAINT ""PK_sms_form_templates"" PRIMARY KEY (""Id""),
                    CONSTRAINT ""FK_sms_form_templates_sms_procedures_SmsProcedureId"" FOREIGN KEY (""SmsProcedureId"") REFERENCES sms_procedures (""Id"") ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS sms_filled_records (
                    ""Id"" uuid NOT NULL,
                    ""SmsFormTemplateId"" uuid NOT NULL,
                    ""FormCode"" character varying(50) NOT NULL DEFAULT '',
                    ""FormTitle"" character varying(300) NOT NULL DEFAULT '',
                    ""ProcedureCode"" character varying(50) NOT NULL DEFAULT '',
                    ""FilledBy"" character varying(100) NOT NULL,
                    ""FilledDate"" timestamp with time zone NOT NULL,
                    ""FilledData"" text NOT NULL,
                    ""DigitalSignatures"" text,
                    ""Status"" character varying(20) NOT NULL,
                    ""VesselName"" character varying(100),
                    ""CreatedAt"" timestamp with time zone NOT NULL,
                    ""UpdatedAt"" timestamp with time zone NOT NULL,
                    CONSTRAINT ""PK_sms_filled_records"" PRIMARY KEY (""Id""),
                    CONSTRAINT ""FK_sms_filled_records_sms_form_templates"" FOREIGN KEY (""SmsFormTemplateId"") REFERENCES sms_form_templates (""Id"") ON DELETE CASCADE
                );

                -- Bring pre-existing SMS tables up to the model shape. CREATE TABLE IF NOT EXISTS
                -- does not update older local DBs that were created by an earlier SMS draft.
                ALTER TABLE ism_elements
                    ADD COLUMN IF NOT EXISTS ""IsSynced"" boolean NOT NULL DEFAULT false,
                    ADD COLUMN IF NOT EXISTS ""OriginNode"" character varying(50) NOT NULL DEFAULT 'SHORE',
                    ADD COLUMN IF NOT EXISTS ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT NOW(),
                    ADD COLUMN IF NOT EXISTS ""UpdatedAt"" timestamp with time zone NOT NULL DEFAULT NOW();

                ALTER TABLE sms_procedures
                    ADD COLUMN IF NOT EXISTS ""IsSynced"" boolean NOT NULL DEFAULT false,
                    ADD COLUMN IF NOT EXISTS ""OriginNode"" character varying(50) NOT NULL DEFAULT 'SHORE',
                    ADD COLUMN IF NOT EXISTS ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT NOW(),
                    ADD COLUMN IF NOT EXISTS ""UpdatedAt"" timestamp with time zone NOT NULL DEFAULT NOW();

                ALTER TABLE sms_procedure_acknowledgements
                    ADD COLUMN IF NOT EXISTS ""IsSynced"" boolean NOT NULL DEFAULT false,
                    ADD COLUMN IF NOT EXISTS ""OriginNode"" character varying(50) NOT NULL DEFAULT 'SHORE',
                    ADD COLUMN IF NOT EXISTS ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT NOW(),
                    ADD COLUMN IF NOT EXISTS ""UpdatedAt"" timestamp with time zone NOT NULL DEFAULT NOW();

                ALTER TABLE sms_form_templates
                    ADD COLUMN IF NOT EXISTS ""IsSynced"" boolean NOT NULL DEFAULT false,
                    ADD COLUMN IF NOT EXISTS ""OriginNode"" character varying(50) NOT NULL DEFAULT 'SHORE',
                    ADD COLUMN IF NOT EXISTS ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT NOW(),
                    ADD COLUMN IF NOT EXISTS ""UpdatedAt"" timestamp with time zone NOT NULL DEFAULT NOW();

                ALTER TABLE sms_filled_records
                    ADD COLUMN IF NOT EXISTS ""IsSynced"" boolean NOT NULL DEFAULT false,
                    ADD COLUMN IF NOT EXISTS ""OriginNode"" character varying(50) NOT NULL DEFAULT 'SHORE',
                    ADD COLUMN IF NOT EXISTS ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT NOW(),
                    ADD COLUMN IF NOT EXISTS ""UpdatedAt"" timestamp with time zone NOT NULL DEFAULT NOW();

                -- Fix existing sms_filled_records: add defaults to denormalized columns
                -- so Edge-synced rows (which omit these fields) insert successfully.
                ALTER TABLE sms_filled_records ALTER COLUMN ""FormTitle"" SET DEFAULT '';
                ALTER TABLE sms_filled_records ALTER COLUMN ""ProcedureCode"" SET DEFAULT '';
                ALTER TABLE sms_filled_records ALTER COLUMN ""FormCode"" SET DEFAULT '';

                CREATE TABLE IF NOT EXISTS sms_procedure_histories (
                    ""Id"" uuid NOT NULL,
                    ""SmsProcedureId"" uuid NOT NULL,
                    ""Version"" character varying(20) NOT NULL,
                    ""Content"" text NOT NULL,
                    ""ChangeNote"" text,
                    ""ChangedBy"" character varying(100) NOT NULL,
                    ""ChangedAt"" timestamp with time zone NOT NULL,
                    ""CreatedAt"" timestamp with time zone NOT NULL,
                    ""UpdatedAt"" timestamp with time zone NOT NULL,
                    CONSTRAINT ""PK_sms_procedure_histories"" PRIMARY KEY (""Id""),
                    CONSTRAINT ""FK_sms_procedure_histories_sms_procedures"" FOREIGN KEY (""SmsProcedureId"") REFERENCES sms_procedures (""Id"") ON DELETE CASCADE
                );
            ");


            logger.LogInformation("Database migration/verification completed successfully.");
            break;
        }
        catch (Exception ex)
        {
            retryCount++;
            logger.LogError(ex, $"Database migration attempt {retryCount} failed.");
            db.ChangeTracker.Clear();
            if (retryCount >= 5) throw;
            await Task.Delay(5000); // Wait 5 seconds before retry
        }
    }
}
else
{
    var logger = app.Services.GetRequiredService<ILogger<Program>>();
    logger.LogInformation("Database auto-migration disabled by configuration.");
}

using (var seedScope = app.Services.CreateScope())
{
    var added = await RankSeedData.SeedAsync(seedScope.ServiceProvider.GetRequiredService<AppDbContext>());
    app.Logger.LogInformation("Rank catalogue seeded: {Added} new ranks.", added);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseForwardedHeaders();

if (!app.Environment.IsDevelopment() && enforceHttps)
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

// Global exception handling middleware
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        context.Response.ContentType = "application/json";
        var exceptionFeature = context.Features.Get<IExceptionHandlerFeature>();
        var exception = exceptionFeature?.Error;

        var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
        logger.LogError(exception, "Unhandled exception on {Method} {Path}",
            context.Request.Method, context.Request.Path);

        var (statusCode, message) = exception switch
        {
            ArgumentNullException => (StatusCodes.Status400BadRequest, "Missing required parameter"),
            ArgumentException => (StatusCodes.Status400BadRequest, "Invalid parameter"),
            KeyNotFoundException => (StatusCodes.Status404NotFound, "Resource not found"),
            UnauthorizedAccessException => (StatusCodes.Status403Forbidden, "Access denied"),
            InvalidOperationException => (StatusCodes.Status409Conflict, "Operation conflict"),
            OperationCanceledException => (StatusCodes.Status408RequestTimeout, "Request timed out"),
            DbUpdateException => (StatusCodes.Status409Conflict, "Database constraint violation"),
            _ => (StatusCodes.Status500InternalServerError, "An internal error occurred")
        };

        context.Response.StatusCode = statusCode;
        await context.Response.WriteAsync(JsonSerializer.Serialize(new
        {
            error = message,
            status = statusCode,
            traceId = context.TraceIdentifier
        }));
    });
});

// Create uploads directories
var uploadsPath = Path.Combine(app.Environment.ContentRootPath, "uploads");
Directory.CreateDirectory(uploadsPath);
Directory.CreateDirectory(Path.Combine(uploadsPath, "crew", "certificates"));
Directory.CreateDirectory(Path.Combine(uploadsPath, "crew", "avatars"));
Directory.CreateDirectory(Path.Combine(uploadsPath, "crew", "documents", "travel_documents"));
Directory.CreateDirectory(Path.Combine(uploadsPath, "crew", "documents", "seafarer_documents"));
Directory.CreateDirectory(Path.Combine(uploadsPath, "crew", "documents", "employment_documents"));
Directory.CreateDirectory(Path.Combine(uploadsPath, "crew", "documents", "health_documents"));
Directory.CreateDirectory(Path.Combine(uploadsPath, "sync-content"));
Directory.CreateDirectory(Path.Combine(uploadsPath, "sync-staging"));
Directory.CreateDirectory(Path.Combine(uploadsPath, "sms"));

// Security Headers Middleware for Production
app.Use(async (context, next) =>
{
    context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Append("X-Frame-Options", "SAMEORIGIN");
    context.Response.Headers.Append("X-XSS-Protection", "1; mode=block");
    context.Response.Headers.Append("Referrer-Policy", "strict-origin-when-cross-origin");
    await next();
});

app.UseCors("AllowWebMobile");

// Serve uploaded static files (SMS PDFs, avatars, certificates)
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploadsPath),
    RequestPath = "/uploads",
    OnPrepareResponse = ctx =>
    {
        var origin = ctx.Context.Request.Headers["Origin"].ToString();
        if (!string.IsNullOrEmpty(origin))
        {
            ctx.Context.Response.Headers["Access-Control-Allow-Origin"] = origin;
            ctx.Context.Response.Headers["Access-Control-Allow-Credentials"] = "true";
        }
    }
});
app.UseRouting();
app.UseRateLimiter();
app.UseWhen(
    context => ProductApi.Security.SyncRequestVerificationMiddleware.IsProtectedSyncRequest(context.Request) ||
               (context.Request.Method.Equals(HttpMethods.Post, StringComparison.OrdinalIgnoreCase) &&
                context.Request.Path.Equals("/api/sync/handshake", StringComparison.OrdinalIgnoreCase)),
    branch => branch.UseMiddleware<ProductApi.Security.NodeApiTokenMiddleware>());
app.UseWhen(
    context => ProductApi.Security.SyncRequestVerificationMiddleware.IsProtectedSyncRequest(context.Request),
    branch => branch.UseMiddleware<ProductApi.Security.SyncRequestVerificationMiddleware>());

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// Health Check Endpoints
app.MapHealthChecks("/health/live", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    Predicate = _ => false
});
app.MapHealthChecks("/health/ready");

app.Run();
