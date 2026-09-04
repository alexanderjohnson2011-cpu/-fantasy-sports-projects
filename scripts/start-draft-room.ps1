$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo

npm run check:runtime
$dataDir = Join-Path $repo "draft_assistant\data"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

$api = Start-Process -FilePath "python" -ArgumentList "-m", "draft_assistant" -WorkingDirectory $repo -WindowStyle Hidden -PassThru
$web = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "draft:web" -WorkingDirectory $repo -WindowStyle Hidden -PassThru

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:8787/api/health" -TimeoutSec 2
    if ($health.ok) { $ready = $true; break }
  } catch { Start-Sleep -Milliseconds 500 }
}
if (-not $ready) {
  Stop-Process -Id $api.Id,$web.Id -ErrorAction SilentlyContinue
  throw "The local draft service did not become ready."
}

$apiListener = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort 8787 -State Listen -ErrorAction Stop | Select-Object -First 1
$webListener = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort 4173 -State Listen -ErrorAction Stop | Select-Object -First 1
@{ apiPid = $apiListener.OwningProcess; webPid = $webListener.OwningProcess; startedAt = (Get-Date).ToString("o") } |
  ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dataDir "running.json")

Write-Host "Moosey's Mommy is ready at http://127.0.0.1:4173/#draft-room"
try {
  Start-Process "http://127.0.0.1:4173/#draft-room"
} catch {
  Write-Warning "The draft room is running. Open http://127.0.0.1:4173/#draft-room in your browser."
}
