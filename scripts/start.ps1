$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

# --- Stream configuration ---------------------------------------------------
# Add entries here to support more input streams.
# Each device pushes to: rtmp://<your-ip>:1935/live/<name>
$streams = @(
    @{ Name = 'stream';  Label = 'Main Camera' },
    @{ Name = 'camera1'; Label = 'Camera 1' }
)
# -----------------------------------------------------------------------------

Write-Host "Starting OTT pipeline ($($streams.Count) streams)..." -ForegroundColor Cyan

# Open firewall for LAN access
Write-Host "  [0] Opening firewall ports..." -ForegroundColor Yellow
netsh advfirewall firewall delete rule name="OTT-Lab-HTTP" | Out-Null
netsh advfirewall firewall add rule name="OTT-Lab-HTTP" dir=in action=allow protocol=tcp localport=8080 | Out-Null
netsh advfirewall firewall delete rule name="OTT-Lab-WebRTC-Signal" | Out-Null
netsh advfirewall firewall add rule name="OTT-Lab-WebRTC-Signal" dir=in action=allow protocol=tcp localport=8889 | Out-Null
netsh advfirewall firewall delete rule name="OTT-Lab-WebRTC-Media" | Out-Null
netsh advfirewall firewall add rule name="OTT-Lab-WebRTC-Media" dir=in action=allow protocol=udp localport=8189 | Out-Null
netsh advfirewall firewall delete rule name="OTT-Lab-RTMP" | Out-Null
netsh advfirewall firewall add rule name="OTT-Lab-RTMP" dir=in action=allow protocol=tcp localport=1935 | Out-Null

# 1. MediaMTX
Write-Host "  [1/4] MediaMTX (port 1935)" -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\mediamtx'; mediamtx mediamtx.yml"
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "  >>> Start OBS and begin streaming to the following RTMP URLs: <<<" -ForegroundColor Magenta
foreach ($s in $streams) {
    Write-Host "      rtmp://localhost:1935/live/$($s.Name)  ($($s.Label))" -ForegroundColor Magenta
}
Write-Host ""
Read-Host "  Press ENTER once all streams are active..."

# 2. FFmpeg -- one process per stream
Write-Host "  [2/4] FFmpeg (RTMP -> HLS) - $($streams.Count) streams" -ForegroundColor Yellow
$streamDir = "$root\stream"
foreach ($s in $streams) {
    $outDir = "$streamDir\$($s.Name)"
    if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

    $rtmpUrl = "rtmp://localhost:1935/live/$($s.Name)"
    $segmentPattern = "$outDir\segment_%03d.ts"
    $playlist = "$outDir\stream.m3u8"

    Write-Host "      Starting FFmpeg for '$($s.Name)' ($($s.Label))..." -ForegroundColor DarkGray
    $ffmpegCmd = "ffmpeg -i $rtmpUrl -c:v libx264 -preset veryfast -tune zerolatency -b:v 3500k -maxrate 4000k -bufsize 6000k -c:a aac -b:a 128k -ar 44100 -f hls -hls_time 6 -hls_list_size 10 -hls_flags delete_segments+append_list -hls_segment_filename '$segmentPattern' '$playlist'"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $ffmpegCmd
}

Write-Host "  Waiting 8s for HLS segments..." -ForegroundColor DarkGray
Start-Sleep -Seconds 8

# Build player
Write-Host "  Building player..." -ForegroundColor Yellow
Set-Location "$root\player"
npm run build 2>&1 | Out-Null

# 3. Nginx
Write-Host "  [3/4] Nginx (port 8080)" -ForegroundColor Yellow
$nginxExe = "C:\tools\nginx-1.31.1\nginx.exe"
$nginxPrefix = "$root\nginx"
$nginxConf = "$root\nginx\nginx.conf"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& '$nginxExe' -p '$nginxPrefix' -c '$nginxConf'"

# 4. Player dev server
Write-Host "  [4/4] Vite player (port 5173)" -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\player'; npm run dev"

Write-Host ""
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1).IPAddress
Write-Host "All services launched." -ForegroundColor Green
Write-Host ""
Write-Host "  Stream gallery: http://$ip`:8080/" -ForegroundColor Cyan
foreach ($s in $streams) {
    $label = $s.Label
    $name = $s.Name
    Write-Host "  ${label}:" -ForegroundColor Cyan
    Write-Host "    HLS:     http://$ip`:8080/stream/$name" -ForegroundColor Cyan
    Write-Host "    Monitor: http://$ip`:8080/monitor/$name" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "  Stop with: stop.cmd" -ForegroundColor Cyan
