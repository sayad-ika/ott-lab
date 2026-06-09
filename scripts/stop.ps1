Write-Host "Stopping OTT pipeline..." -ForegroundColor Cyan

Write-Host "  [1/4] Stopping player (node/vite)" -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "  [2/4] Stopping nginx" -ForegroundColor Yellow
Get-Process -Name "nginx" -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "  [3/4] Stopping ffmpeg" -ForegroundColor Yellow
Get-Process -Name "ffmpeg" -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "  [4/4] Stopping mediamtx" -ForegroundColor Yellow
Get-Process -Name "mediamtx" -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "  Removing firewall rule..." -ForegroundColor Yellow
netsh advfirewall firewall delete rule name="OTT-Lab-HTTP" | Out-Null

Write-Host ""
Write-Host "All services stopped." -ForegroundColor Green
