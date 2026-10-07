# Shore Database Backup Script
# Run this BEFORE applying optimization changes

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = "productdb_backup_$timestamp.sql"
$container = "martime_product_v11-postgres-1"
$database = "productdb"
$user = "product"

Write-Host "Starting Shore Database Backup..." -ForegroundColor Cyan
Write-Host "Timestamp: $timestamp" -ForegroundColor Gray

# Check if container is running
$containerRunning = docker ps --filter "name=$container" --format "{{.Names}}"
if (-not $containerRunning) {
    Write-Host "ERROR: Container $container is not running!" -ForegroundColor Red
    Write-Host "Run: docker-compose up -d" -ForegroundColor Yellow
    exit 1
}

# Create backup using pg_dump.
# pg_dump ghi file NGAY TRONG container rồi docker cp chép nguyên byte ra ngoài. KHÔNG pipe qua
# "| Out-File": PowerShell 5.1 giải mã stdout theo bảng mã console (CP437) nên tiếng Việt UTF-8
# thành rác kiểu "Lß╗ìc"; thêm "-t" còn đổi xuống dòng thành CRLF.
Write-Host "Creating backup: $backupFile" -ForegroundColor Yellow
$containerFile = "/tmp/$backupFile"
docker exec $container pg_dump -U $user -d $database --clean --if-exists --format=plain -f $containerFile
if ($LASTEXITCODE -eq 0) {
    docker cp "${container}:${containerFile}" $backupFile
    docker exec $container rm -f $containerFile | Out-Null
}

if ($LASTEXITCODE -eq 0) {
    $fileSize = (Get-Item $backupFile).Length / 1MB
    $fileSizeRounded = [math]::Round($fileSize, 2)
    Write-Host "Backup completed successfully!" -ForegroundColor Green
    Write-Host "File: $backupFile (Size: $fileSizeRounded MB)" -ForegroundColor Green
    Write-Host ""
    Write-Host "To restore, run commands (KHÔNG pipe file qua PowerShell):" -ForegroundColor Cyan
    Write-Host "docker cp $backupFile ${container}:/tmp/$backupFile" -ForegroundColor White
    Write-Host "docker exec $container psql -U $user -d $database -f /tmp/$backupFile" -ForegroundColor White
} else {
    Write-Host "Backup failed!" -ForegroundColor Red
    exit 1
}
