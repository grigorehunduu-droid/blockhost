# Downloads portable Node.js LTS (win-x64) into ..\runtime\node. Called by the launcher when no Node 18+ is found.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path $PSScriptRoot
$cache = Join-Path $root 'data\cache'
New-Item -ItemType Directory -Force $cache | Out-Null
$idx = Invoke-RestMethod -UseBasicParsing 'https://nodejs.org/dist/index.json'
$v = ($idx | Where-Object { $_.lts } | Select-Object -First 1).version
$name = "node-$v-win-x64.zip"
$zip = Join-Path $cache $name
Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$v/$name" -OutFile $zip
# Verify against the official checksum list before using it.
$sums = (Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$v/SHASUMS256.txt").Content -split "`n"
$want = (($sums | Where-Object { $_ -match [regex]::Escape($name) + '\s*$' }) -split '\s+')[0]
if ((Get-FileHash $zip -Algorithm SHA256).Hash.ToLower() -ne $want.ToLower()) { Remove-Item $zip; throw 'Node.js download failed its checksum' }
$tmp = Join-Path $cache 'nodex'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $tmp -Force
$rt = Join-Path $root 'runtime'
New-Item -ItemType Directory -Force $rt | Out-Null
$dest = Join-Path $rt 'node'
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Move-Item (Get-ChildItem $tmp | Select-Object -First 1).FullName $dest
Remove-Item $tmp -Recurse -Force; Remove-Item $zip -Force
Write-Host "Node.js $v installed."
