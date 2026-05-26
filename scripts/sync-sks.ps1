param(
  [string]$Source = "D:\node.js\sks",
  [string]$Destination = "D:\node.js\madagaji\apps\sks"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Source)) {
  throw "Source path not found: $Source"
}

New-Item -ItemType Directory -Force -Path $Destination | Out-Null

Write-Host "Syncing SKS..."
Write-Host "  Source      : $Source"
Write-Host "  Destination : $Destination"

robocopy $Source $Destination /E /XD node_modules .git /XF .env .env.local .env.development .env.production package-lock.json /R:1 /W:1
$code = $LASTEXITCODE

# Robocopy exit code: <8 is success/warning, >=8 is failure
if ($code -ge 8) {
  throw "Robocopy failed with exit code $code"
}

Write-Host "Sync completed (robocopy exit code: $code)."
