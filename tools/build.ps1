# Builds dist\BlockHost-Setup.exe (one-file installer) and dist\BlockHost-portable.zip.
# Needs only what Windows ships (csc.exe, tar.exe) plus a Node.js install to copy node.exe from.
# Stops if the tests fail, or if anything that is about to be packaged contains API keys, saved settings or user data.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
Set-Location $root
$tar = Join-Path $env:windir 'System32\tar.exe'   # bsdtar (handles zip); Git's tar does not
$csc = Join-Path $env:windir 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$build = Join-Path $root 'build'; $stage = Join-Path $build 'stage'; $dist = Join-Path $root 'dist'
$wv = Join-Path $root 'tools\webview2'; $boot = Join-Path $root 'tools\webview2-bootstrapper\MicrosoftEdgeWebview2Setup.exe'
$ver = (Get-Content app\version.json -Raw | ConvertFrom-Json).version

# 1. bundle the newest Node.js LTS (security fixes), verified against nodejs.org's official checksums.
#    Falls back to this PC's own Node with a warning if that fails.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$nodeDir = Split-Path (Get-Command node).Source
try {
  $idx = Invoke-RestMethod -UseBasicParsing 'https://nodejs.org/dist/index.json'   # assign first: PS 5.1 does not unroll a piped JSON array
  $lts = ($idx | Where-Object { $_.lts } | Select-Object -First 1).version
  $cache = Join-Path $build "node-$lts"
  if (-not (Test-Path (Join-Path $cache 'node.exe'))) {
    $name = "node-$lts-win-x64.zip"; $nzip = Join-Path $build $name
    Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$lts/$name" -OutFile $nzip
    $sums = (Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$lts/SHASUMS256.txt").Content -split "`n"
    $want = (($sums | Where-Object { $_ -match [regex]::Escape($name) + '\s*$' }) -split '\s+')[0]
    if ((Get-FileHash $nzip -Algorithm SHA256).Hash.ToLower() -ne $want.ToLower()) { Remove-Item $nzip; throw 'Node.js download failed its checksum' }
    $tmpx = Join-Path $build 'node-extract'; if (Test-Path $tmpx) { Remove-Item $tmpx -Recurse -Force }
    & $tar -xf $nzip -C (New-Item -ItemType Directory -Force $tmpx)
    if (Test-Path $cache) { Remove-Item $cache -Recurse -Force }
    Move-Item (Get-ChildItem $tmpx | Select-Object -First 1).FullName $cache
    Remove-Item $tmpx -Recurse -Force; Remove-Item $nzip -Force
  }
  $nodeDir = $cache
  Write-Host "Bundling Node.js $lts (newest LTS, checksum verified)"
} catch { Write-Warning "Could not get the newest Node.js LTS ($($_.Exception.Message)); bundling this PC's Node $((node -v).Trim()) instead." }
$nodeExe = Join-Path $nodeDir 'node.exe'

# 2. tests must pass, on the exact Node.js that will ship
& $nodeExe --test "tests/*.test.js"
if ($LASTEXITCODE) { throw 'tests failed - nothing was packaged' }

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage, $dist | Out-Null

node tools\make-icon.js
robocopy app (Join-Path $stage 'app') /E /NFL /NDL /NJH /NJS | Out-Null
New-Item -ItemType Directory -Force (Join-Path $stage 'runtime\node') | Out-Null
Copy-Item (Join-Path $nodeDir 'node.exe') (Join-Path $stage 'runtime\node\node.exe')
if (Test-Path (Join-Path $nodeDir 'LICENSE')) { Copy-Item (Join-Path $nodeDir 'LICENSE') (Join-Path $stage 'runtime\node\LICENSE') }
Copy-Item README.txt, LICENSE.txt $stage
Copy-Item app\public\legal\privacy.txt (Join-Path $stage 'PRIVACY.txt')
Copy-Item app\public\legal\notices.txt (Join-Path $stage 'NOTICES.txt')
Copy-Item (Join-Path $wv '*') $stage   # WebView2 .NET libraries + loader + license (Microsoft, redistributable)

# 3. version info for each exe comes from app\version.json
function Write-Info($title, $file) {
  Set-Content -Encoding utf8 $file @"
using System.Reflection;
[assembly: AssemblyTitle("$title")]
[assembly: AssemblyProduct("BlockHost")]
[assembly: AssemblyDescription("Minecraft Java server manager")]
[assembly: AssemblyVersion("$ver.0")]
[assembly: AssemblyFileVersion("$ver.0")]
static class BuildInfo { public const string Version = "$ver"; }
"@
}
Write-Info 'BlockHost' "$build\info-app.cs"; Write-Info 'BlockHost Setup' "$build\info-setup.cs"; Write-Info 'Uninstall BlockHost' "$build\info-uninstall.cs"
$common = @('/nologo', '/target:winexe', '/platform:x64', '/optimize', "/win32icon:$build\app.ico")

& $csc @common /out:"$stage\BlockHost.exe" /win32manifest:tools\app.manifest `
  /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:"$wv\Microsoft.Web.WebView2.Core.dll" /reference:"$wv\Microsoft.Web.WebView2.WinForms.dll" tools\launcher.cs "$build\info-app.cs"
if ($LASTEXITCODE) { throw 'launcher build failed' }
& $csc @common /out:"$stage\Uninstall.exe" /reference:System.Windows.Forms.dll tools\uninstall.cs "$build\info-uninstall.cs"
if ($LASTEXITCODE) { throw 'uninstaller build failed' }

# 4. nothing secret or personal may be packaged
node tools\check-secrets.js $stage
if ($LASTEXITCODE) { throw 'secret check failed - nothing was packaged' }

$zip = Join-Path $build 'BlockHost.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
& $tar -a -c -f $zip -C $stage .
if ($LASTEXITCODE) { throw 'zip failed' }
if ((& $tar -tf $zip) -match '(^|/)data/') { throw 'package contains a data folder - aborting' }

if ((Get-AuthenticodeSignature $boot).Status -ne 'Valid') { throw 'WebView2 bootstrapper signature is not valid' }
& $csc @common /out:"$dist\BlockHost-Setup.exe" /resource:"$zip,BlockHost.zip" /resource:"$boot,WebView2Setup.exe" `
  /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll tools\setup.cs "$build\info-setup.cs"
if ($LASTEXITCODE) { throw 'setup build failed' }
Copy-Item $zip (Join-Path $dist 'BlockHost-portable.zip') -Force
Write-Host "Built BlockHost $ver"
Get-ChildItem $dist | Select-Object Name, @{n = 'MB'; e = { [math]::Round($_.Length / 1MB, 1) } }
