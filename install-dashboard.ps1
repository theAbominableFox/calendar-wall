# Prepares a Windows PC to run the dashboard. Run via install-dashboard.cmd; safe to run again.
#  - installs Python for the current user if it's missing (winget, or python.org as fallback)
#  - checks that Microsoft Edge is present
#  - creates an empty calendars.json if there is none
#  - removes the "downloaded from the internet" mark from the project files
#  - puts "Home Dashboard" shortcuts on the desktop
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$pyVersion = '3.14.7'   # used only for the python.org fallback download
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "   OK  $text" -ForegroundColor Green }
function Fail($text) { Write-Host "   !!  $text" -ForegroundColor Red; exit 1 }

# A fresh Windows has a "python" placeholder that only points to the Microsoft Store,
# so check that Python actually runs rather than that the command exists.
function Find-Python {
  foreach ($cmd in 'python', 'py') {
    try {
      $out = & $cmd -c "import sys; print(sys.version_info >= (3, 8))" 2>$null
      if ($LASTEXITCODE -eq 0 -and $out -eq 'True') { return $cmd }
    } catch { }
  }
  return $null
}

# Installers update PATH in the registry; pick that up without opening a new window.
function Update-SessionPath {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
              [Environment]::GetEnvironmentVariable('Path', 'User')
}

# Per-user install (no admin needed), added to PATH, with the py/pyw launcher.
$pyArgs = 'InstallAllUsers=0', 'PrependPath=1', 'Include_launcher=1', 'InstallLauncherAllUsers=0', 'Include_test=0'

Step 'Python'
$python = Find-Python
if ($python) {
  Ok ("found: " + (& $python --version))
} else {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host '   Installing Python with winget (this can take a few minutes)...'
    winget install --id Python.Python.3.14 --exact --source winget --silent `
      --accept-package-agreements --accept-source-agreements `
      --override ('/quiet ' + ($pyArgs -join ' '))
    Update-SessionPath
    $python = Find-Python
  }
  if (-not $python) {
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'amd64' }
    $url = "https://www.python.org/ftp/python/$pyVersion/python-$pyVersion-$arch.exe"
    $exe = Join-Path $env:TEMP "python-$pyVersion-$arch.exe"
    Write-Host "   Downloading Python $pyVersion from python.org..."
    Invoke-WebRequest $url -OutFile $exe -UseBasicParsing
    $sig = Get-AuthenticodeSignature $exe
    if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notlike '*Python Software Foundation*') {
      Remove-Item $exe -Force
      Fail 'The downloaded installer is not signed by the Python Software Foundation. Stopping.'
    }
    Write-Host '   Installing Python (this can take a few minutes)...'
    Start-Process $exe -ArgumentList (@('/quiet') + $pyArgs) -Wait
    Remove-Item $exe -Force -ErrorAction SilentlyContinue
    Update-SessionPath
    $python = Find-Python
  }
  if (-not $python) { Fail 'Python could not be installed. Install it from https://www.python.org/downloads/ and run this again.' }
  Ok ("installed: " + (& $python --version))
}

Step 'Connection to Google Calendar'
# A fresh Windows downloads most root certificates only when Windows itself first needs them,
# and Python can't trigger that. A request through PowerShell does, so Python can then connect.
$probe = 'https://calendar.google.com/calendar/ical/en.polish%23holiday%40group.v.calendar.google.com/public/basic.ics'
$pyCheck = "import urllib.request; urllib.request.urlopen('$probe', timeout=20).read(1)"
function Test-PythonHttps { & $python -c $pyCheck 2>$null; return $LASTEXITCODE -eq 0 }
$connected = $false
try { $connected = Test-PythonHttps } catch { }
if (-not $connected) {
  try { Invoke-WebRequest 'https://calendar.google.com/' -Method Head -UseBasicParsing -TimeoutSec 20 | Out-Null } catch { }
  try { $connected = Test-PythonHttps } catch { }
}
if ($connected) { Ok 'Python can download calendars' }
else { Write-Host '   !!  Python could not reach Google Calendar. Check the internet connection; the dashboard will retry by itself.' -ForegroundColor Yellow }

Step 'Microsoft Edge'
$edge = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe' |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if ($edge) { $edgeExe = (Get-ItemProperty $edge).'(default)'; Ok 'found' } else { Fail 'Microsoft Edge is needed to open the dashboard. Install it from https://www.microsoft.com/edge and run this again.' }

Step 'Calendars'
$calendars = Join-Path $root 'calendars.json'
if (Test-Path $calendars) {
  Ok 'calendars.json already exists'
} else {
  # UTF-8 without BOM: server.py's JSON parser rejects a BOM.
  [IO.File]::WriteAllText($calendars, "[]`n", (New-Object Text.UTF8Encoding($false)))
  Ok 'created an empty calendars.json - add your calendar addresses to it (see README.md)'
}

Step 'Project files'
# Files from a downloaded zip carry a mark that makes Windows warn before running the launchers.
Get-ChildItem $root -Recurse -File | Unblock-File
Ok 'ready to run'

Step 'Desktop shortcuts'
$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
foreach ($s in @(
    @{ Name = 'Home Dashboard'; Target = 'start-dashboard.cmd' },
    @{ Name = 'Home Dashboard (full screen)'; Target = 'start-dashboard-fullscreen.cmd' })) {
  $lnk = $shell.CreateShortcut((Join-Path $desktop "$($s.Name).lnk"))
  $lnk.TargetPath = Join-Path $root $s.Target
  $lnk.WorkingDirectory = $root
  $lnk.WindowStyle = 7   # minimized, so the launcher's console window stays out of sight
  $lnk.IconLocation = "$edgeExe,0"
  $lnk.Save()
  Ok $s.Name
}

Write-Host "`nAll set. Open the dashboard with the 'Home Dashboard' shortcut on the desktop." -ForegroundColor Green
