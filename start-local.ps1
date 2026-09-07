$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"

$backendCommand = "Set-Location '$backendDir'; npm run start"
$frontendCommand = "Set-Location '$frontendDir'; npm run dev -- --host 127.0.0.1 --port 8080"

Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", $backendCommand
Start-Sleep -Seconds 2
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", $frontendCommand

Write-Host "Started backend on http://127.0.0.1:3001 and frontend on http://localhost:8080"
