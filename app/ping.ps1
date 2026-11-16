# Prints "port|boot" of a running BlockHost (nothing if none answers). Used by the .bat launcher.
try {
  $j = Get-Content -ErrorAction Stop (Join-Path (Split-Path $PSScriptRoot) 'data\instance.json') -Raw | ConvertFrom-Json
  $r = Invoke-RestMethod -UseBasicParsing -TimeoutSec 2 ("http://127.0.0.1:$($j.port)/api/ping")
  if ($r.ok -and $r.app -eq 'blockhost') { "$($j.port)|$($j.boot)" }
} catch {}
