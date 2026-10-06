using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.FileProviders;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.HttpOverrides;
using System.Threading.RateLimiting;
using MaritimeEdge.Data;
using MaritimeEdge.Security;
using MaritimeEdge.Services.Core;
using MaritimeEdge.Services.Inventory;
using MaritimeEdge.Services.Maintenance;
using MaritimeEdge.Services.Reporting;
using MaritimeEdge.Services.Voyage;
using MaritimeEdge.Services.Logbooks;
using MaritimeEdge.Services.AbstractLog;
using MaritimeEdge.Services;
using MaritimeEdge.Services.AI;
using MaritimeEdge.Services.Common;
using MaritimeEdge.Extensions;
using MaritimeEdge.Repositories;

namespace MaritimeEdge
{
    public class Program
    {
        /// <summary>
        /// Load .env file và set environment variables trước khi app khởi động.
        /// Ưu tiên: biến môi trường hệ thống > .env file > appsettings.json
        /// </summary>
        private static void LoadDotEnv()
        {
            // Tìm .env ở thư mục hiện tại hoặc thư mục chạy app
            var candidates = new[]
            {
                Path.Combine(Directory.GetCurrentDirectory(), ".env"),
                Path.Combine(AppContext.BaseDirectory, ".env")
            };

            var envFile = candidates.FirstOrDefault(File.Exists);
            if (envFile == null) return;

            foreach (var line in File.ReadAllLines(envFile))
            {
                var trimmed = line.Trim();
                // Bỏ qua dòng trống và comment
                if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith("#")) continue;

                var idx = trimmed.IndexOf('=');
                if (idx < 0) continue;

                var key   = trimmed[..idx].Trim();
                var value = trimmed[(idx + 1)..].Trim();

                // Chỉ set nếu chưa có (ưu tiên biến môi trường hệ thống)
                if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable(key)))
                    Environment.SetEnvironmentVariable(key, value);
            }
        }

        /// <summary>
        /// Xây dựng connection string từ env vars (EDGE_POSTGRES_*).
        /// Nếu không có env vars, giữ nguyên connection string từ appsettings.json.
        /// </summary>
        private static string ResolveConnectionString(string? baseConnStr)
        {
            var host     = Environment.GetEnvironmentVariable("EDGE_POSTGRES_HOST")     ?? "localhost";
            var port     = Environment.GetEnvironmentVariable("EDGE_POSTGRES_PORT")     ?? "5433";
            var db       = Environment.GetEnvironmentVariable("EDGE_POSTGRES_DB");
            var user     = Environment.GetEnvironmentVariable("EDGE_POSTGRES_USER");
            var password = Environment.GetEnvironmentVariable("EDGE_POSTGRES_PASSWORD");

            // Nếu không có bất kỳ env var nào → dùng nguyên appsettings
            if (string.IsNullOrEmpty(db) && string.IsNullOrEmpty(user) && string.IsNullOrEmpty(password))
                return baseConnStr ?? string.Empty;

            if (string.IsNullOrWhiteSpace(db) ||
                string.IsNullOrWhiteSpace(user) ||
                string.IsNullOrWhiteSpace(password))
            {
                throw new InvalidOperationException(
                    "EDGE_POSTGRES_DB, EDGE_POSTGRES_USER, and EDGE_POSTGRES_PASSWORD must all be configured when overriding the database connection via environment variables.");
            }

            // Nếu có env var → build lại connection string với giá trị từ .env
            return $"Host={host};Port={port};" +
                   $"Database={db};" +
                   $"Username={user};" +
                   $"Password={password};" +
                   "Pooling=true;MinPoolSize=2;MaxPoolSize=50;" +
                   "ConnectionIdleLifetime=300;ConnectionPruningInterval=10";
        }

        private static void ApplyLegacyShoreApiEnvironment(ConfigurationManager configuration)
        {
            var shoreApiUrl = Environment.GetEnvironmentVariable("SHORE_API_URL");
            if (!string.IsNullOrWhiteSpace(shoreApiUrl))
                configuration["ShoreAPI:BaseUrl"] = shoreApiUrl.TrimEnd('/');

            var shoreApiKey = Environment.GetEnvironmentVariable("SHORE_API_KEY");
            if (!string.IsNullOrWhiteSpace(shoreApiKey))
                configuration["ShoreAPI:ApiKey"] = shoreApiKey;
        }

        /// <summary>
        /// Legacy Mode only (Vessel Provisioning v3 plan — Phase 1).
        /// Map cac bien EDGE_SYNC_* / EDGE_NODE_API_TOKEN tu .env vao IConfiguration de
        /// SyncSecurity:* va NodeApiToken duoc nap dung nhu tai lieu implementation_plan.md mo ta.
        /// Managed Mode (khi da co edge_provisioning_profile active) KHONG duoc dua vao ham nay
        /// cho sync runtime — chi la fallback cho production dang chay Legacy Mode.
        /// </summary>
        private static void ApplyLegacySyncSecurityEnvironment(ConfigurationManager configuration)
        {
            void Map(string envKey, string configKey)
            {
                var val = Environment.GetEnvironmentVariable(envKey);
                if (!string.IsNullOrWhiteSpace(val))
                    configuration[configKey] = val;
            }

            Map("EDGE_SYNC_NODE_ID", "SyncSecurity:NodeId");
            Map("EDGE_SYNC_SIGNING_KEY", "SyncSecurity:SigningKey");
            Map("EDGE_SYNC_KEY_VERSION", "SyncSecurity:KeyVersion");
            Map("EDGE_SYNC_SECURITY_ENABLED", "SyncSecurity:Enabled");
            Map("EDGE_SYNC_PROTOCOL_VERSION", "SyncSecurity:ProtocolVersion");
            Map("EDGE_NODE_API_TOKEN", "NodeApiToken");
        }

        public static async Task Main(string[] args)
        {
            // Load .env file TRƯỚC KHI khởi tạo builder
            LoadDotEnv();

            var builder = WebApplication.CreateBuilder(args);
            ApplyLegacyShoreApiEnvironment(builder.Configuration);
            ApplyLegacySyncSecurityEnvironment(builder.Configuration);

            // Configure default port - Listen on all network interfaces for mobile access
            // Can be overridden by command line: dotnet run --urls "http://0.0.0.0:5001"
            if (!args.Any(arg => arg.StartsWith("--urls")))
            {
                builder.WebHost.UseUrls("http://0.0.0.0:5001");
            }

            // Add services to the container
            // ResolveConnectionString: ưu tiên env vars (.env file) > appsettings.json
            var connectionString = ResolveConnectionString(
                builder.Configuration.GetValue<string>("Database:ConnectionString"));
            
            // HTTP context accessor for audit interceptor
            builder.Services.AddHttpContextAccessor();
            builder.Services.AddScoped<AuditInterceptor>();

            builder.Services.AddDbContext<EdgeDbContext>((sp, options) =>
                options.UseNpgsql(connectionString)
                       .AddInterceptors(sp.GetRequiredService<AuditInterceptor>())
            );

            // Add HttpClient for SignalK
            builder.Services.AddHttpClient("SignalK", client =>
            {
                client.Timeout = TimeSpan.FromSeconds(30);
                client.DefaultRequestHeaders.Add("User-Agent", "MaritimeEdge/1.0");
            });

            // Add HttpClient for Shore API sync
            builder.Services.AddHttpClient("ShoreAPI", client =>
            {
                var timeout = builder.Configuration.GetValue("ShoreAPI:Timeout", 30);
                client.Timeout = Timeout.InfiniteTimeSpan; // Sync transport applies per-link timeouts.
                client.DefaultRequestHeaders.Add("User-Agent", "MaritimeEdge/1.0");
                var apiKey = builder.Configuration["ShoreAPI:ApiKey"];
                if (!string.IsNullOrEmpty(apiKey) && apiKey != "your-api-key-here")
                    client.DefaultRequestHeaders.Add("X-API-Key", apiKey);

                // Vessel Provisioning v3 (Legacy Mode fallback) — per-node API token,
                // doc tu NodeApiToken (duoc map boi ApplyLegacySyncSecurityEnvironment tu EDGE_NODE_API_TOKEN).
                var nodeToken = builder.Configuration["NodeApiToken"];
                if (!string.IsNullOrEmpty(nodeToken) && nodeToken != "your-api-key-here")
                    client.DefaultRequestHeaders.Add("X-Node-Api-Token", nodeToken);
            });

            // Add Memory Cache for performance optimization
            builder.Services.AddMemoryCache();

            // Add AutoMapper for DTO mapping consolidation
            builder.Services.AddAutoMapperProfiles();

            // Add Business Services
            builder.Services.AddScoped<FuelAnalyticsService>();
            builder.Services.AddScoped<ISignalKHttpClient, SignalKHttpClient>();
            builder.Services.AddScoped<IReportingService, ReportingService>();
            builder.Services.AddScoped<IAggregateReportService, AggregateReportService>();
            builder.Services.AddScoped<ISyncService, SyncService>();
            builder.Services.AddScoped<ISyncFileStorageService, LocalSyncFileStorageService>();
            builder.Services.AddScoped<ISyncFilePreparationService, SyncFilePreparationService>();
            builder.Services.AddScoped<ISyncRequestSigningService, SyncRequestSigningService>();
            builder.Services.AddScoped<ISyncConflictHandler, SyncConflictHandler>();
            // Vessel Provisioning v3 — Managed Mode (Phase 3)
            builder.Services.AddSingleton<MaritimeEdge.Security.IEdgeDataEncryptionService, MaritimeEdge.Security.EdgeDataEncryptionService>();
            builder.Services.AddScoped<MaritimeEdge.Services.Core.IEdgeRuntimeConfigService, MaritimeEdge.Services.Core.EdgeRuntimeConfigService>();
            builder.Services.AddScoped<IWatchkeepingService, WatchkeepingService>();
            builder.Services.AddScoped<IDeckLogbookService, DeckLogbookService>();
            builder.Services.AddScoped<IEngineLogbookService, EngineLogbookService>();
            builder.Services.AddScoped<IGarbageRecordService, GarbageRecordService>();
            builder.Services.AddScoped<IGarbagePartIService, GarbagePartIService>();
            builder.Services.AddScoped<IGarbagePartIIService, GarbagePartIIService>();
            builder.Services.AddScoped<IBallastWaterService, BallastWaterService>();
            builder.Services.AddScoped<IOilRecordService, OilRecordService>();
            builder.Services.AddScoped<IVoyageLogService, VoyageLogService>();
            builder.Services.AddScoped<MaterialReceiptService>();

            // Add Authentication & System Log Services (ISPS/ISM/IMO MSC.428)
            builder.Services.AddScoped<ISystemLogService, SystemLogService>();
            builder.Services.AddScoped<IAuthService, AuthService>();

            // Add Voyage Management Service
            builder.Services.AddScoped<IVoyageManagementService, VoyageManagementService>();

            // Add Voyage Cockpit Service (Phase 3)
            builder.Services.AddScoped<IVoyageCockpitService, VoyageCockpitService>();

            // Add Voyage Financial Service (Phase 4)
            builder.Services.AddScoped<IVoyageFinancialService, VoyageFinancialService>();

            // Add Voyage Efficiency Service (Phase 5)
            builder.Services.AddScoped<IVoyageEfficiencyService, VoyageEfficiencyService>();

            // Add Voyage Context Service (Phase 6 - auto-link records to voyage/leg)
            builder.Services.AddScoped<IVoyageContextService, VoyageContextService>();

            // Add Abstract Log Service
            builder.Services.AddScoped<IAbstractLogService, AbstractLogService>();

            // Add PMS Repositories
            builder.Services.AddScoped<IEquipmentAssetRepository, EquipmentAssetRepository>();
            builder.Services.AddScoped<IMaintenanceScheduleRepository, MaintenanceScheduleRepository>();

            // Add PMS Services
            builder.Services.AddScoped<MaintenanceCompletionService>();
            builder.Services.AddScoped<MaintenanceCycleUpdater>();
            builder.Services.AddHostedService<MaintenanceCycleWorker>();
            builder.Services.AddScoped<PmsPdfService>();

            // Add Ship Data Services
            builder.Services.AddScoped<IShipDataRepository, ShipDataRepository>();
            builder.Services.AddScoped<IShipDataService, ShipDataService>();

            // Add AI Chat Service
            builder.Services.AddScoped<IChatService, ChatService>();

            // NMEA Parser
            builder.Services.AddSingleton<MaritimeEdge.Services.Parsers.NmeaParser>();

            // Add Background Services
            var telemetrySimulatorEnabled = builder.Configuration.GetValue("TelemetrySimulator:Enabled", false);
            if (telemetrySimulatorEnabled)
            {
                builder.Services.AddHostedService<MaritimeEdge.Services.Voyage.TelemetrySimulatorService>();
            }

            var signalKCollectorEnabled = builder.Configuration.GetValue("SignalK:Enabled", false);
            if (signalKCollectorEnabled)
            {
                builder.Services.AddHostedService<MaritimeEdge.Services.Voyage.SignalKDataCollectorService>();
            }

            var nmeaPlaybackEnabled = builder.Configuration.GetValue("NmeaPlayback:Enabled", false);
            if (nmeaPlaybackEnabled)
            {
                builder.Services.AddHostedService<MaritimeEdge.Services.Voyage.NmeaPlaybackService>();
            }

            var gpsCollectorEnabled = builder.Configuration.GetValue("GpsCollector:Enabled", false);
            if (gpsCollectorEnabled)
            {
                builder.Services.AddHostedService<MaritimeEdge.Services.Voyage.GpsCollectorService>();
            }

            var positionSyncEnqueuerEnabled = builder.Configuration.GetValue("PositionSyncEnqueuer:Enabled", true);
            if (positionSyncEnqueuerEnabled)
            {
                builder.Services.AddHostedService<MaritimeEdge.Services.Voyage.PositionSyncEnqueuerService>();
            }

            // Engine Sync Enqueuer — đồng bộ trạng thái động cơ từ Edge lên Shore
            var engineSyncEnqueuerEnabled = builder.Configuration.GetValue("EngineSyncEnqueuer:Enabled", true);
            if (engineSyncEnqueuerEnabled)
            {
                builder.Services.AddHostedService<MaritimeEdge.Services.Voyage.EngineSyncEnqueuerService>();
            }

            // Alert Sync Enqueuer — đồng bộ SafetyAlarm + EngineEvent lên Shore (tần suất cao, ưu tiên Critical)
            var alertSyncEnqueuerEnabled = builder.Configuration.GetValue("AlertSyncEnqueuer:Enabled", true);
            if (alertSyncEnqueuerEnabled)
            {
                builder.Services.AddHostedService<MaritimeEdge.Services.Voyage.AlertSyncEnqueuerService>();
            }

            // SMS Sync Enqueuer — đồng bộ SmsFilledRecord + SmsProcedureAcknowledge từ Edge lên Shore
            builder.Services.AddHostedService<MaritimeEdge.Services.Sync.SmsSyncEnqueuerService>();

            builder.Services.AddHostedService<MaritimeEdge.Services.Core.DataCleanupService>();
            builder.Services.AddHostedService<MaritimeEdge.Services.Core.EdgeSyncQueuePurgeService>();
            if (builder.Configuration.GetValue("Sync:Enabled", true))
            {
                builder.Services.AddHostedService<MaritimeEdge.Services.Core.SyncBackgroundWorker>();
                builder.Services.AddHostedService<MaritimeEdge.Services.Core.SyncFileBackgroundWorker>();
            }

            // Production Health Checks
            builder.Services.AddHealthChecks()
                .AddCheck<MaritimeEdge.Security.EdgeDatabaseHealthCheck>("edge_postgres_db");


            // Secret Validation for Edge Production Mode
            using (var loggerFactory = LoggerFactory.Create(logging => logging.AddConsole()))
            {
                var tempLogger = loggerFactory.CreateLogger("StartupValidation");
                builder.Configuration.ValidateProductionSecrets(builder.Environment, tempLogger);
            }

            // Add Controllers
            builder.Services.AddScoped<RankPermissionService>();
            builder.Services.AddScoped<RankPermissionFilter>();
            builder.Services.AddControllers(options => options.Filters.AddService<RankPermissionFilter>())
                .AddJsonOptions(options =>
                {
                    options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
                    options.JsonSerializerOptions.PropertyNameCaseInsensitive = true; // Accept both camelCase and PascalCase input
                });


            builder.Services.AddAuthorizationBuilder()
                .AddPolicy("InternalAccess", policy =>
                    policy.Requirements.Add(new InternalAccessRequirement()));
            builder.Services.AddSingleton<IAuthorizationHandler, InternalAccessHandler>();

            builder.Services.Configure<ForwardedHeadersOptions>(options =>
            {
                options.ForwardedHeaders = ForwardedHeaders.XForwardedFor |
                                           ForwardedHeaders.XForwardedProto |
                                           ForwardedHeaders.XForwardedHost;
                options.KnownNetworks.Clear();
                options.KnownProxies.Clear();
            });
            
            // Add CORS for frontend-edge (support both port 3001 and 3002)
            builder.Services.AddCors(options =>
            {
                options.AddPolicy("AllowFrontend", policy =>
                {
                    policy.SetIsOriginAllowed(origin =>
                    {
                        if (string.IsNullOrWhiteSpace(origin)) return false;
                        
                        // Allow localhost on any port
                        if (origin.StartsWith("http://localhost:") || origin.StartsWith("https://localhost:"))
                            return true;
                        
                        // Allow local network IPs (192.168.x.x)
                        if (origin.StartsWith("http://192.168.") || origin.StartsWith("https://192.168."))
                            return true;
                        
                        // Allow 172.x.x.x range (Docker/VM networks)
                        if (origin.StartsWith("http://172.") || origin.StartsWith("https://172."))
                            return true;
                        
                        return false;
                    })
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials();
                });
            });

            // Add Swagger
            builder.Services.AddEndpointsApiExplorer();
            builder.Services.AddSwaggerGen(c =>
            {
                c.SwaggerDoc("v1", new() { Title = "Maritime Edge API", Version = "v1" });
            });

            // Add Rate Limiting
            builder.Services.AddRateLimiter(options =>
            {
                options.RejectionStatusCode = 429;
                
                // Global fixed window: 100 requests per minute per IP
                options.AddPolicy("fixed", httpContext =>
                    RateLimitPartition.GetFixedWindowLimiter(
                        partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                        factory: _ => new FixedWindowRateLimiterOptions
                        {
                            PermitLimit = 100,
                            Window = TimeSpan.FromMinutes(1),
                            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                            QueueLimit = 5
                        }));
                
                // Strict limiter for login attempts only: 10 per minute per IP.
                // Session validation/refresh and account management use the fixed policy.
                options.AddPolicy("auth", httpContext =>
                    RateLimitPartition.GetFixedWindowLimiter(
                        partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                        factory: _ => new FixedWindowRateLimiterOptions
                        {
                            PermitLimit = 10,
                            Window = TimeSpan.FromMinutes(1),
                            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                            QueueLimit = 0
                        }));

                // Cost-sensitive limiter for AI endpoints.
                options.AddPolicy("ai", httpContext =>
                    RateLimitPartition.GetFixedWindowLimiter(
                        partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                        factory: _ => new FixedWindowRateLimiterOptions
                        {
                            PermitLimit = 20,
                            Window = TimeSpan.FromMinutes(1),
                            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                            QueueLimit = 0
                        }));
            });

            // QuestPDF Community License (free for internal/open use)
            QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

            // Register bundled Lato font (Arial not available on Linux containers)
            var latoDir = Path.Combine(AppContext.BaseDirectory, "LatoFont");
            if (Directory.Exists(latoDir))
            {
                foreach (var ttf in Directory.GetFiles(latoDir, "*.ttf"))
                    QuestPDF.Drawing.FontManager.RegisterFont(File.OpenRead(ttf));
            }

            var app = builder.Build();

            // Initialize database with migrations
            using (var scope = app.Services.CreateScope())
            {
                var dbContext = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();
                var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
                var autoMigrate = app.Configuration.GetValue("Database:AutoMigrate", true);
                
                try
                {
                    if (autoMigrate)
                    {
                        logger.LogInformation("Checking database migrations...");

                        var pendingMigrations = await dbContext.Database.GetPendingMigrationsAsync();
                        if (pendingMigrations.Any())
                        {
                            logger.LogInformation($"Applying {pendingMigrations.Count()} pending migration(s)...");
                            await dbContext.Database.MigrateAsync();
                            logger.LogInformation("Database migrations applied successfully");
                        }
                        else
                        {
                            logger.LogInformation("Database is up-to-date, no pending migrations");
                        }
                    }
                    else
                    {
                        logger.LogInformation("Database auto-migration disabled by configuration");
                    }

                    // ── Migration: Add is_running column to engine_data ──
                    await dbContext.Database.ExecuteSqlRawAsync(@"
                        ALTER TABLE engine_data
                        ADD COLUMN IF NOT EXISTS is_running boolean NOT NULL DEFAULT false;
                    ");

                    // ── Migration: Add missing form_code column to sms_filled_records ──
                    // The original AddSmsSystem migration omitted this column from the table
                    // definition even though the SmsFilledRecord model includes a FormCode property.
                    await dbContext.Database.ExecuteSqlRawAsync(@"
                        ALTER TABLE public.sms_filled_records
                        ADD COLUMN IF NOT EXISTS form_code character varying(50) NOT NULL DEFAULT '';
                        ALTER TABLE public.sms_filled_records
                        ADD COLUMN IF NOT EXISTS form_title text NOT NULL DEFAULT '';
                        ALTER TABLE public.sms_filled_records
                        ADD COLUMN IF NOT EXISTS procedure_code character varying(50) NOT NULL DEFAULT '';
                    ");

                    // ── Self-healing: Repair missing file_path in sms_procedures ──
                    await dbContext.Database.ExecuteSqlRawAsync(@"
                        UPDATE public.sms_procedures p
                        SET file_path = m.storage_path
                        FROM public.sync_file_manifests m
                        WHERE (m.table_name = 'sms_procedure' OR m.table_name = 'sms_procedures')
                          AND m.record_key = p.id::text
                          AND (p.file_path IS NULL OR p.file_path = '')
                          AND m.storage_path IS NOT NULL AND m.storage_path <> '';
                    ");

                    if (await AdminAccountSeed.SeedAsync(dbContext))
                        logger.LogInformation("Created initial admin account; password change required on first login");

                    var crewAccountsCreated = await CrewAccountProvisioning.BackfillApprovedCrewAsync(dbContext);
                    logger.LogInformation("Provisioned {Count} missing crew accounts with CREW role", crewAccountsCreated);
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Error applying database migrations");
                    throw;
                }
            }

            // Configure the HTTP request pipeline
            
            // Global exception handler — MUST be first in pipeline
            app.UseMiddleware<GlobalExceptionMiddleware>();

            // Swagger only in Development
            if (app.Environment.IsDevelopment())
            {
                app.UseSwagger();
                app.UseSwaggerUI(c =>
                {
                    c.SwaggerEndpoint("/swagger/v1/swagger.json", "Maritime Edge API v1");
                    c.RoutePrefix = "swagger";
                });
            }

            app.UseForwardedHeaders();

            if (!app.Environment.IsDevelopment() && builder.Configuration.GetValue("Security:EnforceHttps", false))
            {
                app.UseHsts();
                app.UseHttpsRedirection();
            }

            var uploadsPath = Path.Combine(app.Environment.ContentRootPath, "uploads");
            Directory.CreateDirectory(uploadsPath);
            
            // Create crew document subdirectories
            Directory.CreateDirectory(Path.Combine(uploadsPath, "crew", "documents", "travel_documents"));
            Directory.CreateDirectory(Path.Combine(uploadsPath, "crew", "documents", "seafarer_documents"));
            Directory.CreateDirectory(Path.Combine(uploadsPath, "crew", "documents", "employment_documents"));
            Directory.CreateDirectory(Path.Combine(uploadsPath, "crew", "documents", "health_documents"));

            // Create drill document subdirectories
            Directory.CreateDirectory(Path.Combine(uploadsPath, "drill", "documents"));
            
            // Enable CORS for ALL requests
            app.UseCors("AllowFrontend");
            
            // Configure static files with CORS headers explicitly
            app.UseStaticFiles(new StaticFileOptions
            {
                FileProvider = new PhysicalFileProvider(uploadsPath),
                RequestPath = "/uploads",
                OnPrepareResponse = ctx =>
                {
                    // Add CORS headers to static file responses
                    var origin = ctx.Context.Request.Headers["Origin"].ToString();
                    if (!string.IsNullOrEmpty(origin) && 
                        (origin.StartsWith("http://localhost:") || 
                         origin.StartsWith("http://192.168.") ||
                         origin.StartsWith("http://172.")))
                    {
                        ctx.Context.Response.Headers["Access-Control-Allow-Origin"] = origin;
                        ctx.Context.Response.Headers["Access-Control-Allow-Credentials"] = "true";
                    }
                }
            });

            // Security Headers Middleware for Edge Production
            app.Use(async (context, next) =>
            {
                context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
                context.Response.Headers.Append("X-Frame-Options", "SAMEORIGIN");
                context.Response.Headers.Append("X-XSS-Protection", "1; mode=block");
                context.Response.Headers.Append("Referrer-Policy", "strict-origin-when-cross-origin");
                await next();
            });

            app.UseRouting();

            // Rate limiting
            app.UseRateLimiter();

            // Session-based auth middleware - resolves Bearer token → user identity
            // MUST be before UseAuthorization so HttpContext.Items are populated
            // for AuditInterceptor and controller authorization checks
            app.UseMiddleware<SessionAuthMiddleware>();

            app.UseAuthorization();
            app.MapControllers();

            // Health Check Endpoints
            app.MapHealthChecks("/health/live", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
            {
                Predicate = _ => false
            });
            app.MapHealthChecks("/health/ready");

            app.Run();

        }

    }
}
