# Boss 505 SkuConnect aktualisieren.
#
# Holt den aktuellen Stand aus dem GitHub-Repository und legt ihn ueber den
# Programmordner. Eigene Daten bleiben liegen: Stationsdaten, Profile und
# node_modules werden nicht angefasst.
#
# Das Ergebnis kommt als Fenster, nicht als Konsolentext. Ein Fenster liest
# die Sprachausgabe von allein vor, Konsolentext nicht.

param([string]$Programm = "")

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms | Out-Null

$repo   = "Sku75/Boss-505-SkuConnect"
$zweig  = "main"
$bleibt = @("Stationsdaten", "Profile", "node_modules")

function Sagen($text, $titel) {
  [System.Windows.Forms.MessageBox]::Show($text, $titel,
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
}

try {
  if (-not $Programm -or -not (Test-Path (Join-Path $Programm "package.json"))) {
    Sagen "Der Programmordner wurde nicht gefunden.`r`n`r`nGesucht wurde hier:`r`n$Programm`r`n`r`nStarte Boss 505 SkuConnect einmal, dann legt es diese Datei neu an." "Update nicht moeglich"
    exit 0
  }

  $hier = (Get-Content (Join-Path $Programm "package.json") -Raw | ConvertFrom-Json).version

  # Fensterlos pruefen, welche Fassung im Netz liegt.
  $pfadImRepo = "Programm/Boss%20505%20SkuConnect/package.json"
  $url = "https://raw.githubusercontent.com/$repo/$zweig/$pfadImRepo"
  try {
    $antwort = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
    $dort = ($antwort.Content | ConvertFrom-Json).version
  } catch {
    $code = $null
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    if ($code -eq 404) {
      Sagen "Das Repository ist von aussen nicht lesbar.`r`n`r`nEntweder steht es auf privat, dann muss es auf oeffentlich gestellt werden, oder der Name hat sich geaendert.`r`n`r`nDeine Fassung hier: $hier" "Kein Zugriff"
    } else {
      Sagen "Die Verbindung zu GitHub hat nicht geklappt.`r`n`r`n$($_.Exception.Message)`r`n`r`nDeine Fassung hier: $hier" "Keine Verbindung"
    }
    exit 0
  }

  if ([version]$dort -le [version]$hier) {
    Sagen "Du hast schon die neueste Fassung.`r`n`r`nHier: $hier`r`nIm Netz: $dort" "Nichts zu tun"
    exit 0
  }

  # Laeuft das Programm noch, waeren die Dateien gesperrt.
  if (Get-Process electron -ErrorAction SilentlyContinue) {
    Sagen "Boss 505 SkuConnect laeuft noch.`r`n`r`nBitte das Programm schliessen und dieses Update danach noch einmal starten.`r`n`r`nHier: $hier`r`nIm Netz: $dort" "Erst schliessen"
    exit 0
  }

  $temp = Join-Path $env:TEMP ("sku505_update_" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $temp -Force | Out-Null
  $zip = Join-Path $temp "stand.zip"
  Invoke-WebRequest -Uri "https://codeload.github.com/$repo/zip/refs/heads/$zweig" -OutFile $zip -UseBasicParsing -TimeoutSec 300
  Expand-Archive -Path $zip -DestinationPath $temp -Force

  $wurzel = Get-ChildItem -Path $temp -Directory | Select-Object -First 1
  $neu = Join-Path $wurzel.FullName "Programm\Boss 505 SkuConnect"
  if (-not (Test-Path (Join-Path $neu "package.json"))) {
    Sagen "Das heruntergeladene Paket sieht anders aus als erwartet.`r`n`r`nEs wurde nichts geaendert." "Abgebrochen"
    Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
    exit 0
  }

  $zahl = 0
  foreach ($eintrag in Get-ChildItem -Path $neu) {
    if ($bleibt -contains $eintrag.Name) { continue }
    $ziel = Join-Path $Programm $eintrag.Name
    if ($eintrag.PSIsContainer) {
      Copy-Item $eintrag.FullName -Destination $Programm -Recurse -Force
    } else {
      Copy-Item $eintrag.FullName -Destination $ziel -Force
    }
    $zahl++
  }
  Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue

  $jetzt = (Get-Content (Join-Path $Programm "package.json") -Raw | ConvertFrom-Json).version
  if ($jetzt -eq $dort) {
    Sagen "Aktualisiert auf Version $jetzt.`r`n`r`nVorher: $hier`r`n$zahl Posten erneuert.`r`n`r`nDeine Stationsdaten und deine Profile sind unberuehrt.`r`n`r`nDie Neuerungen stehen in Patchnotes.txt im Programmordner." "Fertig"
  } else {
    Sagen "Die Dateien wurden kopiert, aber die Versionsnummer stimmt nicht.`r`n`r`nErwartet: $dort`r`nGefunden: $jetzt`r`n`r`nBitte im Chat melden." "Bitte pruefen"
  }
} catch {
  Sagen "Beim Aktualisieren ist etwas schiefgegangen.`r`n`r`n$($_.Exception.Message)`r`n`r`nEs kann sein, dass nur ein Teil erneuert wurde. Starte das Update noch einmal." "Fehlgeschlagen"
}
