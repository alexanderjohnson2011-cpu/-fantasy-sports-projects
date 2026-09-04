$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $repo "draft_assistant\data\running.json"
if (-not (Test-Path -LiteralPath $statePath)) {
  Write-Host "No recorded draft-room processes were found."
  exit 0
}
$state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
foreach ($processId in @($state.apiPid, $state.webPid)) {
  if ($processId) { Stop-Process -Id $processId -ErrorAction SilentlyContinue }
}
Remove-Item -LiteralPath $statePath -ErrorAction SilentlyContinue
Write-Host "Moosey's Mommy draft room stopped."
