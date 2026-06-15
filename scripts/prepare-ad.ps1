# prepare-ad.ps1 -- Transcode an MP4 ad into HLS segments for the ad proxy.
#
# The output lands in ads/prepared/<Name>/ with a playlist.m3u8 and numbered
# .ts segments. Encoding settings mirror the live pipeline (start-pipeline.ps1)
# so the ad blends seamlessly with the live stream.
#
# Usage:
#   .\scripts\prepare-ad.cmd -Name "MW4" -Source "ads\source\mw4.mp4"
#   .\scripts\prepare-ad.cmd -Name "promo15" -Source "C:\Downloads\promo.mp4"

param(
    [Parameter(Mandatory)] [string] $Name,
    [Parameter(Mandatory)] [string] $Source
)

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

# --- Validate input ----------------------------------------------------------
if (-not (Test-Path $Source)) {
    Write-Host "ERROR: Source file not found: $Source" -ForegroundColor Red
    exit 1
}

$outDir = Join-Path $root "ads\prepared\$Name"
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
}

$segPattern = Join-Path $outDir 'segment_%03d.ts'
$playlist   = Join-Path $outDir 'playlist.m3u8'

# Clean any previous run
Remove-Item (Join-Path $outDir '*.ts') -ErrorAction SilentlyContinue
Remove-Item $playlist -ErrorAction SilentlyContinue

Write-Host "Preparing ad '$Name'..." -ForegroundColor Yellow
Write-Host "  Source:    $Source" -ForegroundColor DarkGray
Write-Host "  Output:    $outDir" -ForegroundColor DarkGray

# --- Transcode ---------------------------------------------------------------
# Settings match start-pipeline.ps1: H.264 libx264, AAC 128k, 2s HLS segments.
# -preset fast (not veryfast) for better quality since this is offline.
# -movflags +faststart not needed -- HLS segments, not progressive MP4.
$argList = @(
    '-i', $Source,
    '-c:v', 'libx264', '-preset', 'fast',
    '-b:v', '3500k', '-maxrate', '4000k', '-bufsize', '6000k',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '0',
    '-hls_segment_filename', $segPattern,
    $playlist
)

& ffmpeg @argList 2>&1 | ForEach-Object { if ($_ -match '^(frame=|Error|Conversion)') { Write-Host $_ } }

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: FFmpeg exited with code $LASTEXITCODE" -ForegroundColor Red
    exit 1
}

# --- Verify output -----------------------------------------------------------
$segments = Get-Item (Join-Path $outDir '*.ts') -ErrorAction SilentlyContinue
if (-not $segments -or $segments.Count -eq 0) {
    Write-Host "ERROR: No segments produced. Check the source file." -ForegroundColor Red
    exit 1
}

$totalDur = 0
$segCount = $segments.Count
# Read duration from playlist
if (Test-Path $playlist) {
    $lines = Get-Content $playlist
    foreach ($line in $lines) {
        if ($line -match '^#EXTINF:([0-9.]+)') {
            $totalDur += [double]$Matches[1]
        }
    }
}

Write-Host "Done! $segCount segments, $([math]::Round($totalDur, 1))s total" -ForegroundColor Green
Write-Host "  Playlist: $playlist" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Use with: .\scripts\start-ad-break.cmd -Stream `"stream`" -Ad `"$Name`"" -ForegroundColor Cyan
