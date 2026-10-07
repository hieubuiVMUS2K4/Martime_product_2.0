param(
    [switch]$SkipNpm,
    [switch]$SkipDotnet,
    [switch]$SkipZip
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$prodDir = Join-Path $scriptDir "production"
$backendProject = Join-Path $scriptDir "edge-services\EdgeCollector.csproj"
$frontendDir = Join-Path $scriptDir "frontend-edge"
$initScriptsSrc = Join-Path $scriptDir "edge-services\init-scripts"
$envSource = Join-Path $scriptDir "edge-services\.env"
$envProdTemplate = Join-Path $prodDir ".env.production"
$envRuntime = Join-Path $prodDir ".env"
$artifactDir = Join-Path $scriptDir "artifacts\production"

function Write-Step([string]$msg) { Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Write-OK([string]$msg) { Write-Host "    OK: $msg" -ForegroundColor Green }
function Fail([string]$msg) { Write-Host "    FAIL: $msg" -ForegroundColor Red; exit 1 }

Write-Step "Checking prerequisites"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Host "    WARN: docker not found locally (still fine if only packaging)" -ForegroundColor Yellow }
if (-not $SkipDotnet -and -not (Get-Command dotnet -ErrorAction SilentlyContinue)) { Fail "dotnet not found" }
if (-not $SkipNpm -and -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { Fail "npm.cmd not found" }
if (-not (Test-Path $backendProject)) { Fail "Backend project not found: $backendProject" }
if (-not (Test-Path $frontendDir)) { Fail "Frontend folder not found: $frontendDir" }
if (-not (Test-Path $prodDir)) { Fail "Production folder not found: $prodDir" }
Write-OK "Folders and tools validated"

Write-Step "Cleaning previous production artifacts"
$cleanPaths = @(
    (Join-Path $prodDir "backend"),
    (Join-Path $prodDir "frontend\dist"),
    (Join-Path $prodDir "init-scripts")
)
foreach ($p in $cleanPaths) {
    if (Test-Path $p) { Remove-Item $p -Recurse -Force }
    New-Item -ItemType Directory -Path $p -Force | Out-Null
    Write-OK "Prepared: $p"
}

if (-not $SkipDotnet) {
    Write-Step "Publishing backend (.NET 8 Release)"
    $backendOut = Join-Path $prodDir "backend"
    dotnet publish $backendProject -c Release -o $backendOut --nologo
    if ($LASTEXITCODE -ne 0) { Fail "dotnet publish failed (exit $LASTEXITCODE)" }
    $dllPath = Join-Path $backendOut "MaritimeEdgeServer.dll"
    if (-not (Test-Path $dllPath)) { Fail "Published DLL missing: $dllPath" }
    Write-OK "Backend published"
}

Write-Step "Building frontend (Vite)"
Push-Location $frontendDir
try {
    $npmCmd = "npm.cmd"
    $frontendBuildOk = $true
    if (-not $SkipNpm) {
        & $npmCmd ci --silent
        if ($LASTEXITCODE -ne 0) { Fail "npm ci failed" }
    }
    & $npmCmd run build
    if ($LASTEXITCODE -ne 0) {
        $frontendBuildOk = $false
        Write-Host "    WARN: npm run build failed (usually TypeScript errors). Falling back to vite-only build..." -ForegroundColor Yellow
        cmd /c npx vite build
        if ($LASTEXITCODE -ne 0) { Fail "vite build failed" }
    }
    if ($frontendBuildOk) {
        Write-OK "Frontend built via npm run build"
    } else {
        Write-Host "    WARN: Frontend built with vite-only fallback. Review TypeScript errors before next release." -ForegroundColor Yellow
    }
} finally {
    Pop-Location
}
$frontendDistSrc = Join-Path $frontendDir "dist"
$frontendDistDst = Join-Path $prodDir "frontend\dist"
if (-not (Test-Path $frontendDistSrc)) { Fail "Frontend dist not found: $frontendDistSrc" }
Copy-Item (Join-Path $frontendDistSrc "*") $frontendDistDst -Recurse -Force
if (-not (Test-Path (Join-Path $frontendDistDst "index.html"))) { Fail "index.html missing in production frontend dist" }
Write-OK "Frontend copied"

Write-Step "Copying database init scripts"
$dumpCandidates = Get-ChildItem (Join-Path $scriptDir "..") -Filter "edge_database_export_*.sql" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending

if ($dumpCandidates -and $dumpCandidates.Count -gt 0) {
    $selectedDump = $dumpCandidates[0].FullName
    Copy-Item $selectedDump (Join-Path $prodDir "init-scripts\00-edge-dump.sql") -Force
    Write-OK ("Using dump-first init script: " + (Split-Path $selectedDump -Leaf))
} elseif (Test-Path $initScriptsSrc) {
    Copy-Item (Join-Path $initScriptsSrc "*") (Join-Path $prodDir "init-scripts") -Recurse -Force
    Write-Host "    WARN: dump file not found, fallback to edge-services/init-scripts" -ForegroundColor Yellow
} else {
    Write-Host "    WARN: no dump file and init-scripts source missing" -ForegroundColor Yellow
}

# Remove psql meta commands unsupported by some container psql versions.
# Đọc/ghi bằng UTF-8 không BOM qua .NET: Get-Content của PowerShell 5.1 đọc UTF-8 không BOM theo
# bảng mã ANSI và Set-Content -Encoding UTF8 chèn BOM — cả hai làm hỏng tiếng Việt trong dump.
# Regex dùng chuỗi nháy đơn: PowerShell không thoát "\", viết "\\\\" là khớp HAI dấu gạch chéo.
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$sqlFiles = Get-ChildItem (Join-Path $prodDir "init-scripts") -Filter "*.sql" -File -Recurse -ErrorAction SilentlyContinue
foreach ($sql in $sqlFiles) {
    $raw = [System.IO.File]::ReadAllText($sql.FullName, $utf8NoBom)
    $sanitized = [System.Text.RegularExpressions.Regex]::Replace(
        $raw,
        '(?m)^\\(restrict|unrestrict)\b.*(?:\r?\n)?',
        '')
    $sanitized = [System.Text.RegularExpressions.Regex]::Replace(
        $sanitized,
        '(?m)^CREATE SCHEMA public;(?=[ \t]*\r?$)',
        'CREATE SCHEMA IF NOT EXISTS public;')
    if ($sanitized -ne $raw) {
        [System.IO.File]::WriteAllText($sql.FullName, $sanitized, $utf8NoBom)
        Write-OK ("Sanitized init SQL for compatibility/idempotency: " + $sql.Name)
    }
}
Write-OK "Init scripts prepared"

Write-Step "Preparing runtime .env"
if (Test-Path $envSource) {
    Copy-Item $envSource $envRuntime -Force
    Write-OK "Copied production/.env from edge-services/.env"
} elseif (Test-Path $envProdTemplate) {
    Copy-Item $envProdTemplate $envRuntime -Force
    Write-Host "    WARN: edge-services/.env not found, fallback to .env.production template" -ForegroundColor Yellow
} else {
    Fail "No env source available (.env or .env.production)"
}

Write-Step "Validating production package"
$required = @(
    (Join-Path $prodDir "docker-compose.yml"),
    (Join-Path $prodDir "Dockerfile.backend"),
    (Join-Path $prodDir "Dockerfile.frontend"),
    (Join-Path $prodDir "docker-entrypoint.sh"),
    (Join-Path $prodDir "nginx\default.conf.template"),
    (Join-Path $prodDir "backend\MaritimeEdgeServer.dll"),
    (Join-Path $prodDir "frontend\dist\index.html"),
    (Join-Path $prodDir ".env")
)
$allOk = $true
foreach ($f in $required) {
    if (Test-Path $f) {
        Write-OK ("Found: " + $f.Replace($scriptDir + "\\", ""))
    } else {
        Write-Host "    MISSING: $f" -ForegroundColor Red
        $allOk = $false
    }
}
if (-not $allOk) { Fail "Production package validation failed" }

if (-not $SkipZip) {
    Write-Step "Creating transfer zip"
    New-Item -ItemType Directory -Path $artifactDir -Force | Out-Null
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $zipPath = Join-Path $artifactDir ("edge-production-" + $timestamp + ".zip")
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Compress-Archive -Path (Join-Path $prodDir "*") -DestinationPath $zipPath -CompressionLevel Optimal
    Write-OK "Zip created: $zipPath"
}

$totalSize = (Get-ChildItem $prodDir -Recurse -File | Measure-Object Length -Sum).Sum
Write-Host "`n=============================================" -ForegroundColor Green
Write-Host " EDGE PRODUCTION PACKAGE READY" -ForegroundColor Green
Write-Host (" Path : " + $prodDir) -ForegroundColor Green
Write-Host (" Size : " + [math]::Round($totalSize / 1MB, 1) + " MB") -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Server run commands:" -ForegroundColor Yellow
Write-Host "  cd production"
Write-Host "  docker compose up -d --build"
Write-Host ""
Write-Host "Optional tools:" -ForegroundColor Yellow
Write-Host "  docker compose --profile tools up -d pgadmin"
