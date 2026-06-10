$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "Starting OTT pipeline..." -ForegroundColor Cyan

# Open firewall for LAN access
Write-Host "  [0] Opening firewall ports..." -ForegroundColor Yellow
netsh advfirewall firewall delete rule name="OTT-Lab-HTTP" | Out-Null
netsh advfirewall firewall add rule name="OTT-Lab-HTTP" dir=in action=allow protocol=tcp localport=8080 | Out-Null
netsh advfirewall firewall delete rule name="OTT-Lab-WebRTC-Signal" | Out-Null
netsh advfirewall firewall add rule name="OTT-Lab-WebRTC-Signal" dir=in action=allow protocol=tcp localport=8889 | Out-Null
netsh advfirewall firewall delete rule name="OTT-Lab-WebRTC-Media" | Out-Null
netsh advfirewall firewall add rule name="OTT-Lab-WebRTC-Media" dir=in action=allow protocol=udp localport=8189 | Out-Null

# 1. MediaMTX
Write-Host "  [1/4] MediaMTX (port 1935)" -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\mediamtx'; mediamtx mediamtx.yml"
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "  >>> Start OBS and begin streaming to rtmp://localhost:1935/live/stream <<<" -ForegroundColor Magenta
Write-Host ""
Read-Host "  Press ENTER once OBS is streaming..."

# 2. FFmpeg
Write-Host "  [2/4] FFmpeg (RTMP -> HLS)" -ForegroundColor Yellow
$streamDir = "$root\stream"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "ffmpeg -i rtmp://localhost:1935/live/stream -c:v libx264 -preset veryfast -tune zerolatency -b:v 3500k -maxrate 4000k -bufsize 6000k -c:a aac -b:a 128k -ar 44100 -f hls -hls_time 6 -hls_list_size 10 -hls_flags delete_segments+append_list -hls_segment_filename '$streamDir\segment_%03d.ts' '$streamDir\stream.m3u8'"

Write-Host "  Waiting 5s for HLS segments..." -ForegroundColor DarkGray
Start-Sleep -Seconds 5

# Build player
Write-Host "  Building player..." -ForegroundColor Yellow
Set-Location "$root\player"
npm run build 2>&1 | Out-Null

# 3. Nginx
Write-Host "  [3/4] Nginx (port 8080)" -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& 'C:\tools\nginx-1.31.1\nginx.exe' -p '$root\nginx' -c '$root\nginx\nginx.conf'"

# 4. Player dev server
Write-Host "  [4/4] Vite player (port 5173)" -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\player'; npm run dev"

Write-Host ""
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1).IPAddress
Write-Host "All services launched." -ForegroundColor Green
Write-Host ""
Write-Host "  HLS player:   http://$ip`:8080" -ForegroundColor Cyan
Write-Host "  OPS monitor:  http://$ip`:8080/monitor" -ForegroundColor Cyan
Write-Host "  Stop with: stop.cmd" -ForegroundColor Cyan
