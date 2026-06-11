Write-Host "Restarting nginx..." -ForegroundColor Cyan

Write-Host "  [1/2] Stopping nginx" -ForegroundColor Yellow
Get-Process -Name "nginx" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

Write-Host "  [2/2] Starting nginx" -ForegroundColor Yellow
& "C:\tools\nginx-1.31.1\nginx.exe" -p "D:\ott-lab\nginx" -c "D:\ott-lab\nginx\nginx.conf"

Write-Host ""
Write-Host "Nginx restarted." -ForegroundColor Green
