# Run InfraDrishti backend using the embedded Python 3.12 distribution
# Usage: powershell -ExecutionPolicy Bypass -File run_backend.ps1

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $ScriptDir ".venv_py312\python.exe"

if (-not (Test-Path $Python)) {
    Write-Error "Python not found at: $Python"
    exit 1
}

Write-Host "Using Python: $Python" -ForegroundColor Green
Write-Host "Starting InfraDrishti backend on http://127.0.0.1:8000 ..." -ForegroundColor Cyan

Set-Location $ScriptDir
& $Python -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8000
