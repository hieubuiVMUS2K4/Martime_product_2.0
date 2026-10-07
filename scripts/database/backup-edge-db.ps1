# ==============================================================================
# AUTOMATED POSTGRESQL DATABASE BACKUP SCRIPT FOR EDGE SYSTEM
# ==============================================================================
# Usage:
#   powershell -ExecutionPolicy Bypass -File ./scripts/database/backup-edge-db.ps1
# ==============================================================================

param (
    [string]$ContainerName = "production-postgres-1",
    [string]$DbUser = "edge_user",
    [string]$DbName = "maritime_edge",
    [string]$BackupDir = "./dumps/edge_backups",
    [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
if (!(Test-Path -Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

$backupFile = Join-Path $BackupDir "edge_dump_${timestamp}.sql"

Write-Host "[BACKUP] Starting automated database backup for Edge System ($DbName)..." -ForegroundColor Cyan

try {
    # pg_dump ghi file NGAY TRONG container rồi docker cp chép nguyên byte ra ngoài.
    # KHÔNG dùng "> file" hay "| Out-File": PowerShell 5.1 giải mã stdout theo bảng mã
    # console (CP437) nên tiếng Việt UTF-8 thành rác kiểu "Lß╗ìc", và ghi ra UTF-16.
    $containerFile = "/tmp/edge_dump_${timestamp}.sql"
    docker exec $ContainerName pg_dump -U $DbUser -d $DbName -f $containerFile
    if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit $LASTEXITCODE)." }
    docker cp "${ContainerName}:${containerFile}" $backupFile
    if ($LASTEXITCODE -ne 0) { throw "docker cp failed (exit $LASTEXITCODE)." }
    docker exec $ContainerName rm -f $containerFile | Out-Null

    if ((Get-Item $backupFile).Length -eq 0) {
        throw "Backup file created is empty. Check database connection and user permissions."
    }

    Write-Host "[BACKUP] Edge Database dump completed successfully: $backupFile" -ForegroundColor Green

    # Retention policy: Purge backups older than RetentionDays
    $cutoff = (Get-Date).AddDays(-$RetentionDays)
    Get-ChildItem -Path $BackupDir -Filter "edge_dump_*.sql*" | Where-Object { $_.LastWriteTime -lt $cutoff } | ForEach-Object {
        Remove-Item $_.FullName -Force
        Write-Host "[CLEANUP] Deleted old edge backup: $($_.Name)" -ForegroundColor Yellow
    }

    Write-Host "[BACKUP] Edge Backup process finished successfully." -ForegroundColor Green
}
catch {
    Write-Host "[ERROR] Edge Database backup failed: $_" -ForegroundColor Red
    exit 1
}
