# stop-ad-break.ps1 -- Cancel an active ad break on a live stream
#
# Usage:
#   .\scripts\stop-ad-break.cmd -Stream "stream"

param(
    [Parameter(Mandatory)] [string] $Stream
)

$proxyPort = 8081
$url = "http://localhost:${proxyPort}/ad-break/${Stream}"

try {
    $response = Invoke-RestMethod -Uri $url -Method Delete -ContentType 'application/json' -ErrorAction Stop
    if ($response.ok) {
        Write-Host "Ad break cancelled on '$Stream'. Transitioning back to live..." -ForegroundColor Green
    } else {
        Write-Host "ERROR: $($response.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 404) {
        Write-Host "No active ad break found for stream '$Stream'." -ForegroundColor Yellow
    } else {
        Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
    exit 1
}
