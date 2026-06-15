# start-pipeline.ps1 -- Single-command backend orchestration.
#
# Boots MediaMTX, the ad-proxy, and Nginx, then watches MediaMTX's REST API
# and auto-spawns an FFmpeg (HLS + MKV recording) whenever a new stream key
# connects. No player build, no Vite dev server -- backend only.
#
# Usage:  .\scripts\start-pipeline.cmd
# Teardown:  .\scripts\stop.cmd

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ErrorActionPreference = 'Continue'

# --- Tool paths -------------------------------------------------------------
$nginxExe = 'C:\tools\nginx-1.31.1\nginx.exe'

# --- Helpers ----------------------------------------------------------------

function Wait-ForPort {
    param([int]$Port, [int]$TimeoutSec = 20)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $client = $null
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $iar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
            if ($iar.AsyncWaitHandle.WaitOne(400, $false) -and $client.Connected) {
                $client.EndConnect($iar)
                return $true
            }
        } catch { } finally {
            if ($client) { $client.Close() }
        }
        Start-Sleep -Milliseconds 400
    }
    return $false
}

function Stop-ByName([string]$Name) {
    Get-Process -Name $Name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

function Stop-AdProxy {
    # Kill only the node process owning :8081 (leaves vite/player node alone)
    $conn = Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

function Start-FfmpegForStream([string]$StreamName) {
    # MediaMTX reports full paths like 'live/stream' (app + key). Derive the
    # bare key for local output dirs/files; build the RTMP URL from the full
    # path so we don't double the 'live/' app prefix.
    $key = $StreamName
    if ($key -match '/') { $key = ($key -split '/')[-1] }

    $outDir = Join-Path $root "stream\$key"
    if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

    $recDir = Join-Path $root "recordings\$key"
    if (-not (Test-Path $recDir)) { New-Item -ItemType Directory -Path $recDir | Out-Null }

    $ts  = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
    $mkv = Join-Path $recDir "${key}_${ts}.mkv"

    $rtmpUrl = "rtmp://localhost:1935/$StreamName"
    $seg     = Join-Path $outDir 'segment_%03d.ts'
    $m3u8    = Join-Path $outDir 'stream.m3u8'

    $argList = @(
        '-i', $rtmpUrl,
        '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
        '-b:v', '3500k', '-maxrate', '4000k', '-bufsize', '6000k',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
        '-f', 'hls',
        '-hls_time', '6',
        '-hls_list_size', '10',
        '-hls_flags', 'delete_segments+append_list',
        '-hls_segment_filename', $seg,
        $m3u8,
        '-f', 'matroska', $mkv
    )

    $p = Start-Process -FilePath 'ffmpeg' -ArgumentList $argList -PassThru
    return @{ Proc = $p; Mkv = $mkv }
}

# --- Cleanup any leftover backend processes ---------------------------------
Write-Host "Cleaning up leftover backend processes..." -ForegroundColor DarkGray
Stop-AdProxy
Stop-ByName 'ffmpeg'
Stop-ByName 'nginx'
Stop-ByName 'mediamtx'
Start-Sleep -Seconds 1

# --- Firewall ---------------------------------------------------------------
Write-Host "Opening firewall ports (8080 / 8889 / 8189 / 1935)..." -ForegroundColor Yellow
netsh advfirewall firewall delete rule name="OTT-Lab-HTTP"           | Out-Null
netsh advfirewall firewall add rule name="OTT-Lab-HTTP"           dir=in action=allow protocol=tcp localport=8080 | Out-Null
netsh advfirewall firewall delete rule name="OTT-Lab-WebRTC-Signal"  | Out-Null
netsh advfirewall firewall add rule name="OTT-Lab-WebRTC-Signal"  dir=in action=allow protocol=tcp localport=8889 | Out-Null
netsh advfirewall firewall delete rule name="OTT-Lab-WebRTC-Media"   | Out-Null
netsh advfirewall firewall add rule name="OTT-Lab-WebRTC-Media"   dir=in action=allow protocol=udp localport=8189 | Out-Null
netsh advfirewall firewall delete rule name="OTT-Lab-RTMP"           | Out-Null
netsh advfirewall firewall add rule name="OTT-Lab-RTMP"           dir=in action=allow protocol=tcp localport=1935 | Out-Null

# --- 1. MediaMTX ------------------------------------------------------------
Write-Host "[1/3] Starting MediaMTX (RTMP :1935, WHEP :8889, API :9997)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\mediamtx'; mediamtx mediamtx.yml"
if (-not (Wait-ForPort -Port 9997 -TimeoutSec 25)) {
    Write-Host "  ERROR: MediaMTX API not responding on :9997. Aborting." -ForegroundColor Red
    exit 1
}
Write-Host "      MediaMTX up." -ForegroundColor Green

# --- 2. ad-proxy ------------------------------------------------------------
Write-Host "[2/3] Starting ad-proxy (:8081)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "node '$root\scripts\ad-proxy.mjs'"
if (-not (Wait-ForPort -Port 8081 -TimeoutSec 20)) {
    Write-Host "  ERROR: ad-proxy not responding on :8081. Aborting." -ForegroundColor Red
    exit 1
}
Write-Host "      ad-proxy up." -ForegroundColor Green

# --- 3. Nginx ---------------------------------------------------------------
Write-Host "[3/3] Starting Nginx (:8080)..." -ForegroundColor Yellow
Start-Process -FilePath $nginxExe `
    -ArgumentList @("-p", "$root\nginx", "-c", "$root\nginx\nginx.conf") `
    -WorkingDirectory "$root\nginx"
if (-not (Wait-ForPort -Port 8080 -TimeoutSec 20)) {
    Write-Host "  ERROR: Nginx not responding on :8080. Aborting." -ForegroundColor Red
    exit 1
}
Write-Host "      Nginx up." -ForegroundColor Green

# --- LAN info ---------------------------------------------------------------
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notlike '169.*' } |
       Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "Backend ready. Watching for incoming streams..." -ForegroundColor Cyan
Write-Host "  >>> Start OBS and push to:  rtmp://localhost:1935/live/<any-key>" -ForegroundColor Magenta
Write-Host "  >>> From LAN:               rtmp://${ip}:1935/live/<any-key>"    -ForegroundColor Magenta
Write-Host "  HLS per stream:             http://${ip}:8080/live/<key>/stream.m3u8" -ForegroundColor DarkGray
Write-Host "  WHEP monitor per stream:    http://${ip}:8889/live/<key>/whep"        -ForegroundColor DarkGray
Write-Host "  Stop everything with:       .\scripts\stop.cmd"                      -ForegroundColor DarkGray
Write-Host ""

# --- Stream detection loop --------------------------------------------------
$ApiV3 = 'http://localhost:9997/v3/paths/list'
$ApiV2 = 'http://localhost:9997/v2/paths/list'
$active = @{}   # streamName -> @{ Proc; Started; RetryAfter }

while ($true) {
    $names = @()
    foreach ($url in @($ApiV3, $ApiV2)) {
        try {
            $resp = Invoke-RestMethod -Uri $url -TimeoutSec 3 -ErrorAction Stop
            if ($resp.items) {
                $names = @($resp.items | ForEach-Object { $_.name })
            }
            break
        } catch {
            # try the next API endpoint
        }
    }

    foreach ($n in $names) {
        if ([string]::IsNullOrWhiteSpace($n)) { continue }

        # Prune a dead FFmpeg; apply a cooldown if it died too quickly
        if ($active.ContainsKey($n)) {
            $e = $active[$n]
            if ($e.Proc -and $e.Proc.HasExited) {
                $life = ((Get-Date) - $e.Started).TotalSeconds
                if ($life -lt 10) {
                    $e.RetryAfter = (Get-Date).AddSeconds(15)
                    Write-Host "  '$n' FFmpeg exited after $([int]$life)s -- waiting 15s before retry" -ForegroundColor Red
                } else {
                    Write-Host "  '$n' FFmpeg ended after $([int]$life)s." -ForegroundColor DarkGray
                }
                $e.Proc = $null
            }
        }

        # Decide whether to (re)start FFmpeg for this stream
        $shouldStart = $false
        if (-not $active.ContainsKey($n) -or -not $active[$n].Proc) {
            if ($active.ContainsKey($n) -and $active[$n].RetryAfter -and ((Get-Date) -lt $active[$n].RetryAfter)) {
                $shouldStart = $false   # still cooling down
            } else {
                $shouldStart = $true
            }
        }

        if ($shouldStart) {
            $info = Start-FfmpegForStream $n
            $active[$n] = @{ Proc = $info.Proc; Started = (Get-Date); RetryAfter = $null }
            Write-Host "  New stream detected: $n  ->  FFmpeg PID $($info.Proc.Id)" -ForegroundColor Green
            Write-Host "      recording -> $($info.Mkv)" -ForegroundColor DarkGray
        }
    }

    Start-Sleep -Seconds 2
}
