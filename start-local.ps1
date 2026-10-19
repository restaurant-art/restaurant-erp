param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 8000
)

$ErrorActionPreference = 'Stop'
$backendPath = Join-Path $PSScriptRoot 'backend'
$pythonPath = Join-Path $backendPath '.venv\Scripts\python.exe'
$appUrl = "http://localhost:$Port/"
$healthUrl = "http://127.0.0.1:$Port/api/health/"

function Test-LocalApp {
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
        return $health.status -eq 'ok' -and $health.service -eq 'UVPRO'
    } catch {
        return $false
    }
}

if (Test-LocalApp) {
    Write-Output "UVPRO is already running: $appUrl"
    return
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $Port belongs to another service. Stop that service or choose -Port with a free port."
}
foreach ($requiredPath in @($pythonPath, (Join-Path $backendPath 'db.sqlite3'), (Join-Path $PSScriptRoot 'frontend\dist\index.html'))) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Local setup is incomplete: $requiredPath is missing. See docs/INSTALLATION.md."
    }
}

$serverProcess = Start-Process -FilePath $pythonPath `
    -ArgumentList @('manage.py', 'runserver', "127.0.0.1:$Port", '--noreload') `
    -WorkingDirectory $backendPath -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $backendPath 'local-server.stdout.log') `
    -RedirectStandardError (Join-Path $backendPath 'local-server.stderr.log')

for ($attempt = 0; $attempt -lt 15; $attempt++) {
    if (Test-LocalApp) {
        Write-Output "UVPRO is running: $appUrl (process $($serverProcess.Id))"
        return
    }
    $serverProcess.Refresh()
    if ($serverProcess.HasExited) { break }
    Start-Sleep -Milliseconds 400
}
throw "UVPRO did not start. Check backend/local-server.stderr.log. Existing data has not been reset."
