# package-vod.ps1 — Package a recording as VOD with optional ad (pre-roll or mid-roll)
# Prepares the ad automatically if not already prepared.
# Final output is a single directory with linear segments and one index.m3u8.
#
# Usage (pre-roll ad — default):
#   .\scripts\package-vod.ps1 -Stream "stream" -Recording "stream_2026-06-10_15-18-10.mkv" -AdName "promo15" -AdFile "ads\source\promo.mp4"
#
# Usage (mid-roll ad at 30 seconds):
#   .\scripts\package-vod.ps1 -Stream "stream" -Recording "stream_2026-06-10_15-18-10.mkv" -AdName "promo15" -AdFile "ads\source\promo.mp4" -AdPosition 30
#
# Usage (without ad):
#   .\scripts\package-vod.ps1 -Stream "stream" -Recording "stream_2026-06-10_15-18-10.mkv"

param(
    [Parameter(Mandatory)] [string] $Stream,
    [Parameter(Mandatory)] [string] $Recording,
    [string] $AdName,
    [string] $AdFile,
    [int] $AdPosition = 0
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

# ── Helper: parse an HLS playlist into segment objects ──
function Parse-HlsPlaylist($playlistPath) {
    $segments = @()
    $duration = 0.0
    foreach ($line in (Get-Content $playlistPath)) {
        if ($line -match '^#EXTINF:([\d.]+)') {
            $duration = [double]$matches[1]
        }
        elseif ($line -match '^segment_\d+\.ts$') {
            $segments += @{ file = $line; duration = $duration }
        }
    }
    return $segments
}

# ── Helper: copy segments from a parsed playlist into the output dir with sequential naming ──
function Copy-Segments($segments, $sourceDir, $outDir, $startIndex) {
    $i = $startIndex
    foreach ($seg in $segments) {
        $destName = "segment_{0:D3}.ts" -f $i
        Copy-Item "$sourceDir\$($seg.file)" "$outDir\$destName" -Force
        $i++
    }
    return $i
}

# ── Prepare ad if needed ──
if ($AdName) {
    $adDir = "$root\ads\prepared\$AdName"

    if ($AdFile) {
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
              -f hls -hls_time 2 -hls_list_size 0 `
              -hls_segment_filename "$adDir\segment_%03d.ts" `
              "$adDir\playlist.m3u8"

            if ($LASTEXITCODE -ne 0) {
                Write-Host "ERROR: Ad preparation failed" -ForegroundColor Red
                exit 1
            }

            Write-Host "Ad prepared: $adDir" -ForegroundColor Green
        }
    } else {
        if (-not (Test-Path "$adDir\playlist.m3u8")) {
            Write-Host "ERROR: Ad '$AdName' not prepared and no -AdFile provided." -ForegroundColor Red
            Write-Host "  Run with: -AdFile `"ads\source\<file>.mp4`"" -ForegroundColor Yellow
            exit 1
        }
    }

    $adDir = "$root\ads\prepared\$AdName"
}

# ── Determine ad placement mode ──
$midRoll = ($AdName -and $AdPosition -gt 0)
$hasAd = $false

# ── Step 1: Transcode to temp directories ──
$tmpDir = "$outDir\.tmp"
if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
New-Item -ItemType Directory -Path $tmpDir | Out-Null
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

if ($midRoll) {
    Write-Host "Transcoding recording (mid-roll at ${AdPosition}s)..." -ForegroundColor Yellow

    $preDir = "$tmpDir\pre"
    $postDir = "$tmpDir\post"
    New-Item -ItemType Directory -Path $preDir | Out-Null
    New-Item -ItemType Directory -Path $postDir | Out-Null

    # Pre-ad portion
    Write-Host "  Transcoding pre-ad (0s to ${AdPosition}s)..." -ForegroundColor Yellow
    ffmpeg -i "$recordingsDir\$Recording" `
      -ss 0 -t $AdPosition `
      -c:v copy -c:a aac -b:a 128k -ar 44100 -ac 2 `
      -f hls -hls_time 2 -hls_list_size 0 `
      -hls_segment_filename "$preDir\segment_%03d.ts" `
      "$preDir\playlist.m3u8"

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Pre-ad transcoding failed" -ForegroundColor Red
        exit 1
    }

    # Post-ad portion
    Write-Host "  Transcoding post-ad (${AdPosition}s to end)..." -ForegroundColor Yellow
    ffmpeg -i "$recordingsDir\$Recording" `
      -ss $AdPosition `
      -c:v copy -c:a aac -b:a 128k -ar 44100 -ac 2 `
      -f hls -hls_time 2 -hls_list_size 0 `
      -hls_segment_filename "$postDir\segment_%03d.ts" `
      "$postDir\playlist.m3u8"

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Post-ad transcoding failed" -ForegroundColor Red
        exit 1
    }

    Write-Host "Recording transcoded (pre + post)" -ForegroundColor Green
} else {
    # Pre-roll or no ad: single pass into temp dir
    $recDir = "$tmpDir\recording"
    New-Item -ItemType Directory -Path $recDir | Out-Null

    Write-Host "Transcoding recording to HLS (copy video, transcode audio)..." -ForegroundColor Yellow

    ffmpeg -i "$recordingsDir\$Recording" `
      -c:v copy -c:a aac -b:a 128k -ar 44100 -ac 2 `
      -f hls -hls_time 2 -hls_list_size 0 `
      -hls_segment_filename "$recDir\segment_%03d.ts" `
      "$recDir\playlist.m3u8"

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Recording transcoding failed" -ForegroundColor Red
        exit 1
    }
}

# ── Step 2: Copy ad segments to temp ──
$adTmpDir = $null
if ($AdName) {
    $adSrc = "$root\ads\prepared\$AdName"
    if (Test-Path "$adSrc\playlist.m3u8") {
        $hasAd = $true
        $adTmpDir = "$tmpDir\ad"
        New-Item -ItemType Directory -Path $adTmpDir | Out-Null
        Copy-Item "$adSrc\segment_*.ts" "$adTmpDir\" -Force
        Copy-Item "$adSrc\playlist.m3u8" "$adTmpDir\playlist.m3u8" -Force
        Write-Host "Copied ad segments" -ForegroundColor Yellow
    }
}

# ── Step 3: Assemble linear segments into output dir ──
Write-Host "Assembling final playlist..." -ForegroundColor Yellow

$playlistLines = @()
$playlistLines += "#EXTM3U"
$playlistLines += "#EXT-X-VERSION:3"
$playlistLines += "#EXT-X-TARGETDURATION:2"
$playlistLines += "#EXT-X-MEDIA-SEQUENCE:0"
$segIndex = 0

if ($midRoll) {
    # Pre-ad recording segments
    $prePlaylist = Parse-HlsPlaylist "$tmpDir\pre\playlist.m3u8"
    foreach ($seg in $prePlaylist) {
        $destName = "segment_{0:D3}.ts" -f $segIndex
        Copy-Item "$tmpDir\pre\$($seg.file)" "$outDir\$destName" -Force
        $playlistLines += "#EXTINF:$($seg.duration),"
        $playlistLines += $destName
        $segIndex++
    }

    # Ad segments
    if ($hasAd) {
        $playlistLines += "#EXT-X-DISCONTINUITY"
        $adPlaylist = Parse-HlsPlaylist "$adTmpDir\playlist.m3u8"
        foreach ($seg in $adPlaylist) {
            $destName = "segment_{0:D3}.ts" -f $segIndex
            Copy-Item "$adTmpDir\$($seg.file)" "$outDir\$destName" -Force
            $playlistLines += "#EXTINF:$($seg.duration),"
            $playlistLines += $destName
            $segIndex++
        }
    }

    # Post-ad recording segments
    $playlistLines += "#EXT-X-DISCONTINUITY"
    $postPlaylist = Parse-HlsPlaylist "$tmpDir\post\playlist.m3u8"
    foreach ($seg in $postPlaylist) {
        $destName = "segment_{0:D3}.ts" -f $segIndex
        Copy-Item "$tmpDir\post\$($seg.file)" "$outDir\$destName" -Force
        $playlistLines += "#EXTINF:$($seg.duration),"
        $playlistLines += $destName
        $segIndex++
    }
} else {
    # Pre-roll or no ad
    if ($hasAd) {
        $adPlaylist = Parse-HlsPlaylist "$adTmpDir\playlist.m3u8"
        foreach ($seg in $adPlaylist) {
            $destName = "segment_{0:D3}.ts" -f $segIndex
            Copy-Item "$adTmpDir\$($seg.file)" "$outDir\$destName" -Force
            $playlistLines += "#EXTINF:$($seg.duration),"
            $playlistLines += $destName
            $segIndex++
        }
        $playlistLines += "#EXT-X-DISCONTINUITY"
    }

    $recPlaylist = Parse-HlsPlaylist "$tmpDir\recording\playlist.m3u8"
    foreach ($seg in $recPlaylist) {
        $destName = "segment_{0:D3}.ts" -f $segIndex
        Copy-Item "$tmpDir\recording\$($seg.file)" "$outDir\$destName" -Force
        $playlistLines += "#EXTINF:$($seg.duration),"
        $playlistLines += $destName
        $segIndex++
    }
}

$playlistLines += "#EXT-X-ENDLIST"

[System.IO.File]::WriteAllLines("$outDir\index.m3u8", $playlistLines)

# ── Step 4: Clean up temp directory ──
Remove-Item $tmpDir -Recurse -Force

# ── Step 5: Update manifest.json ──
Write-Host "Updating VOD manifest..." -ForegroundColor Yellow

$manifestPath = "$root\vod\manifest.json"
$manifest = @()

if (Test-Path $manifestPath) {
    try {
        $existing = Get-Content $manifestPath -Raw | ConvertFrom-Json
        if ($null -ne $existing) {
            $manifest = @($existing)
        }
    } catch {
        Write-Host "  WARN: Could not parse existing manifest, regenerating." -ForegroundColor Yellow
    }
}

$manifest = @($manifest | Where-Object { $_.id -ne $outName })

$parts = $outName -split '_', 2
$derivedStream = if ($parts.Count -ge 1) { $parts[0] } else { 'unknown' }

$derivedRecordedAt = ''
if ($parts.Count -ge 2) {
    $dateTimeStr = $parts[1] -replace '_', '-'
    $dateComponents = $dateTimeStr -split '-'
    if ($dateComponents.Count -ge 6) {
        $derivedRecordedAt = "$($dateComponents[0])-$($dateComponents[1])-$($dateComponents[2])T$($dateComponents[3]):$($dateComponents[4]):$($dateComponents[5])"
    }
}

$labelStream = $derivedStream
$labelDate = ''
if ($derivedRecordedAt) {
    try {
        $dt = [DateTime]::Parse($derivedRecordedAt)
        $labelDate = $dt.ToString('MMM d, yyyy')
    } catch {
        $labelDate = $derivedRecordedAt.Substring(0, [Math]::Min(10, $derivedRecordedAt.Length))
    }
}
$label = "$labelStream"
if ($labelDate) { $label += " - $labelDate" }

$newEntry = @{
    id          = $outName
    stream      = $derivedStream
    label       = $label
    recordedAt  = $derivedRecordedAt
}

$manifest += $newEntry
$manifest | ConvertTo-Json -Depth 3 | Set-Content -Path $manifestPath -Encoding UTF8

Write-Host "Manifest updated: $manifestPath" -ForegroundColor Green

Write-Host ""
Write-Host "VOD packaged: $outDir" -ForegroundColor Green
Write-Host "  Segments: $segIndex segments" -ForegroundColor Green
Write-Host "  Playlist: $outDir\index.m3u8" -ForegroundColor Green
if ($midRoll) {
    Write-Host "  Ad position: ${AdPosition}s (mid-roll)" -ForegroundColor Cyan
} elseif ($hasAd) {
    Write-Host "  Ad position: start (pre-roll)" -ForegroundColor Cyan
}
Write-Host "  Play at:  http://localhost:8080/vod/$outName/index.m3u8" -ForegroundColor Cyan
