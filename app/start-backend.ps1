param([string]$Node)
# Starts the backend with no visible window.
$root = Split-Path $PSScriptRoot
New-Item -ItemType Directory -Force (Join-Path $root 'data\logs') | Out-Null
Start-Process -WindowStyle Hidden -FilePath $Node -ArgumentList 'app\server.js' -WorkingDirectory $root `
  -RedirectStandardOutput (Join-Path $root 'data\logs\node.out') -RedirectStandardError (Join-Path $root 'data\logs\node.err')
