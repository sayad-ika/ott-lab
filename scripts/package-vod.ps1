# package-vod.ps1 — Package a recording as VOD with optional pre-roll ad
# Prepares the ad automatically if not already prepared.
#
# Usage (with ad):
#   .\scripts\package-vod.ps1 -Stream "stream" -Recording "stream_2026-06-10_15-18-10.mkv" -AdName "promo15" -AdFile "ads\source\promo.mp4"
#
# Usage (without ad):
#   .\scripts\package-vod.ps1 -Stream "stream" -Recording "stream_2026-06-10_15-18-10.mkv"

param(
    [Parameter(Mandatory)] [string] $Stream,
    [Parameter(Mandatory)] [string] $Recording,
    [string] $AdName,
    [string] $AdFile
)

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$recordingsDir = "$root\recordings\$Stream"
$outName = [System.IO.Path]::GetFileNameWithoutExtension($Recording)
$outDir = "$root\vod\$outName"

# ── Validate recording exists ──
if (-not (Test-Path "$recordingsDir\$Recording")) {
    Write-Host "ERROR: Recording not found: $recordingsDir\$Recording" -ForegroundColor Red
    exit 1
}

# ── Prepare ad if needed ──
if ($AdName) {
    $adDir = "$root\ads\prepared\$AdName"

    if ($AdFile) {
        # Ad source provided — prepare if not already done
        if (-not (Test-Path $AdFile)) {
            Write-Host "ERROR: Ad file not found: $AdFile" -ForegroundColor Red
            exit 1
        }

        if ((Test-Path "$adDir\playlist.m3u8") -and (Get-ChildItem "$adDir\segment_*.ts" -ErrorAction SilentlyContinue)) {
            Write-Host "Ad already prepared: $adDir" -ForegroundColor DarkGray
        } else {
            if (-not (Test-Path $adDir)) { New-Item -ItemType Directory -Path $adDir | Out-Null }

            Write-Host "Preparing ad: $AdFile -> $adDir" -ForegroundColor Yellow

            ffmpeg -i $AdFile `
              -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=60" `
              -c:v libx264 -preset veryfast -tune zerolatency `
              -b:v 3500k -maxrate 4000k -bufsize 6000k `
              -c:a aac -b:a 128k -ar 44100 -ac 2 `
              -f hls -hls_time 6 -hls_list_size 0 `
              -hls_segment_filename "$adDir\segment_%03d.ts" `
              "$adDir\playlist.m3u8"

            if ($LASTEXITCODE -ne 0) {
                Write-Host "ERROR: Ad preparation failed" -ForegroundColor Red
                exit 1
            }

            Write-Host "Ad prepared: $adDir" -ForegroundColor Green
        }
    } else {
        # No ad source — must already be prepared
        if (-not (Test-Path "$adDir\playlist.m3u8")) {
            Write-Host "ERROR: Ad '$AdName' not prepared and no -AdFile provided." -ForegroundColor Red
            Write-Host "  Run with: -AdFile `"ads\source\<file>.mp4`"" -ForegroundColor Yellow
            exit 1
        }
    }

    $adDir = "$root\ads\prepared\$AdName"
}

# ── Create output directories ──
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
if (-not (Test-Path "$outDir\recording")) { New-Item -ItemType Directory -Path "$outDir\recording" | Out-Null }

# ── Step 1: Copy ad segments (if any) ──
$hasAd = $false
if ($AdName) {
    $adSrc = "$root\ads\prepared\$AdName"
    if (Test-Path "$adSrc\playlist.m3u8") {
        $hasAd = $true
        if (-not (Test-Path "$outDir\ad")) { New-Item -ItemType Directory -Path "$outDir\ad" | Out-Null }
        Copy-Item "$adSrc\segment_*.ts" "$outDir\ad\" -Force
        Copy-Item "$adSrc\playlist.m3u8" "$outDir\ad\playlist.m3u8" -Force
        Write-Host "Copied ad segments to $outDir\ad" -ForegroundColor Yellow
    }
}

# ── Step 2: Transcode recording to HLS ──
Write-Host "Transcoding recording to HLS (copy video, transcode audio)..." -ForegroundColor Yellow

ffmpeg -i "$recordingsDir\$Recording" `
  -c:v copy -c:a aac -b:a 128k -ar 44100 -ac 2 `
  -f hls -hls_time 6 -hls_list_size 0 `
  -hls_segment_filename "$outDir\recording\segment_%03d.ts" `
  "$outDir\recording\playlist.m3u8"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Recording transcoding failed" -ForegroundColor Red
    exit 1
}

# ── Step 3: Build combined playlist ──
$playlistLines = @()
$playlistLines += "#EXTM3U"
$playlistLines += "#EXT-X-VERSION:3"
$playlistLines += "#EXT-X-TARGETDURATION:6"
$playlistLines += "#EXT-X-MEDIA-SEQUENCE:0"

if ($hasAd) {
    # Parse ad playlist for segment info
    $adPlaylist = Get-Content "$outDir\ad\playlist.m3u8"
    $adSegments = @()
    $adDuration = 0.0

    foreach ($line in $adPlaylist) {
        if ($line -match '^#EXTINF:([\d.]+)') {
            $adDuration = [double]$matches[1]
        }
        elseif ($line -match '^segment_\d+\.ts$') {
            $adSegments += @{ file = "ad/$line"; duration = $adDuration }
        }
    }

    # Add ad segments
    foreach ($seg in $adSegments) {
        $playlistLines += "#EXTINF:$($seg.duration),"
        $playlistLines += $seg.file
    }

    $playlistLines += "#EXT-X-DISCONTINUITY"
}

# Parse recording playlist for segment info
$recPlaylist = Get-Content "$outDir\recording\playlist.m3u8"
$recDuration = 0.0

foreach ($line in $recPlaylist) {
    if ($line -match '^#EXTINF:([\d.]+)') {
        $recDuration = [double]$matches[1]
    }
    elseif ($line -match '^segment_\d+\.ts$') {
        $playlistLines += "#EXTINF:$($recDuration),"
        $playlistLines += "recording/$line"
    }
}

$playlistLines += "#EXT-X-ENDLIST"

[System.IO.File]::WriteAllLines("$outDir\index.m3u8", $playlistLines)

Write-Host ""
Write-Host "VOD packaged: $outDir" -ForegroundColor Green
Write-Host "  Playlist: $outDir\index.m3u8" -ForegroundColor Green
Write-Host "  Play at:  http://localhost:8080/vod/$outName/index.m3u8" -ForegroundColor Cyan
