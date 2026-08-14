$ErrorActionPreference = "Stop"
$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:FINDREPEATEDSONG_DATA_DIR = Join-Path $appDir "data"
$env:FINDREPEATEDSONG_STATIC_DIR = Join-Path $appDir "static"
if (-not $env:FINDREPEATEDSONG_PORT) { $env:FINDREPEATEDSONG_PORT = "38491" }

$process = Start-Process -FilePath (Join-Path $appDir "findrepeatedsong.exe") -PassThru
Start-Sleep -Seconds 1
Start-Process "http://127.0.0.1:$($env:FINDREPEATEDSONG_PORT)"
$process.WaitForExit()
