# Seed Certificates PowerShell Script
Write-Host "Seeding certificate data..." -ForegroundColor Cyan

# Chép file vào container rồi chạy psql -f. KHÔNG đọc bằng Get-Content rồi pipe vào psql:
# PowerShell 5.1 đọc UTF-8 không BOM theo bảng mã ANSI và gửi stdin theo ASCII, nên dấu
# tiếng Việt bị hỏng hoặc thành "?".
docker cp "SEED_CERTIFICATES.sql" "maritime:/tmp/SEED_CERTIFICATES.sql"
if ($LASTEXITCODE -eq 0) {
    docker exec maritime psql -U postgres -d edge_database -v ON_ERROR_STOP=1 -f /tmp/SEED_CERTIFICATES.sql
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Successfully seeded certificates!" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to seed certificates" -ForegroundColor Red
}
