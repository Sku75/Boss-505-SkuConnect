# Roland-USB-Treiber pruefen und einrichten.
#
# Ohne diesen Treiber arbeitet die Station nicht als Audio- und MIDI-Geraet,
# der Buehnen-Modus faellt also aus. Erkannt wird er am Eintrag in der
# Programmliste von Windows, das geht ohne erhoehte Rechte. Das Einrichten
# selbst braucht sie, darum laeuft Setup.exe ueber die Windows-Rueckfrage.

param([string]$Aktion = "pruefen", [string]$Setup = "")

function TreiberName {
  $pfade = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
             'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')
  foreach ($pfad in $pfade) {
    $eintraege = Get-ChildItem $pfad -ErrorAction SilentlyContinue
    foreach ($e in $eintraege) {
      $name = (Get-ItemProperty $e.PSPath -ErrorAction SilentlyContinue).DisplayName
      if ($name -match 'RC-505 Driver') { return $name }
    }
  }
  return $null
}

if ($Aktion -eq "pruefen") {
  $name = TreiberName
  if ($name) { "DA=$name" } else { "FEHLT=1" }
  exit 0
}

if ($Aktion -eq "installieren") {
  if (-not (Test-Path $Setup)) { "FEHLER=Setup nicht gefunden"; exit 0 }
  try {
    Start-Process -FilePath $Setup -Verb RunAs -Wait
    $name = TreiberName
    if ($name) { "FERTIG=$name" } else { "OFFEN=Setup beendet, Treiber noch nicht gefunden" }
  } catch {
    "FEHLER=" + $_.Exception.Message
  }
  exit 0
}

"FEHLER=Unbekannte Aktion"
