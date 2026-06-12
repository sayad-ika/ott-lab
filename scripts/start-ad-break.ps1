# start-ad-break.ps1 -- Trigger an ad break on a live stream
#
# Usage:
#   .\scripts\start-ad-break.cmd -Stream "stream" -Ad "MW4"

param(
    [Parameter(Mandatory)] [string] $Stream,
    [string] $Ad = 'MW4'
)

$proxyPort = 8081
$url = "http://localhost:${proxyPort}/ad-break/${Stream}"

$body = @{ ad = $Ad } | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri $url -Method Post -Body $body -ContentType 'application/json' -ErrorAction Stop
    if ($response.ok) {
        Write-Host "Ad break started on '$Stream' with ad '$Ad' ($($response.duration)s)" -ForegroundColor Green
    } else {
        Write-Host "ERROR: $($response.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 404) {
        Write-Host "ERROR: Stream '$Stream' has no live manifest. Is the stream running?" -ForegroundColor Red
    } else {
        Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
    exit 1
}
