# Startet die RC-505 am USB neu. Das wirkt wie Kabel ziehen und wieder
# stecken, nur ohne mechanischen Verschleiss. Gedacht fuer den Wechsel
# zwischen Speicher-Modus und Audio-Modus, der am Geraet gemacht wird.
#
# Ausgabe, jeweils eine Zeile:
#   GEFUNDEN=<InstanzId>   das Geraet, das neu gestartet wurde
#   ZUSTAND=SPEICHER|AUDIO|WEG   was danach da ist
#   FEHLER=<Text>          falls etwas schiefging

$ErrorActionPreference = 'Continue'

function Finde {
    Get-PnpDevice -ErrorAction SilentlyContinue |
        Where-Object { $_.InstanceId -like 'USB\VID_0582&PID_017*' -and $_.Status -eq 'OK' }
}

$geraete = Finde
if (-not $geraete) {
    Write-Output "FEHLER=Keine RC-505 am USB gefunden"
    exit
}

# Den Anschluss selbst bevorzugen, nicht eine seiner Teilfunktionen.
$ziel = $geraete | Where-Object { $_.Class -eq 'USB' } | Select-Object -First 1
if (-not $ziel) { $ziel = $geraete | Select-Object -First 1 }
$id = $ziel.InstanceId
Write-Output "GEFUNDEN=$id"

# Vor dem Neustart alle Schreibpuffer der Wechseldatentraeger leeren,
# damit keine halb geschriebene Datei auf der Station zurueckbleibt.
try {
    Get-Volume -ErrorAction SilentlyContinue |
        Where-Object { $_.DriveType -eq 'Removable' -and $_.DriveLetter } |
        ForEach-Object { Write-VolumeCache -DriveLetter $_.DriveLetter -ErrorAction SilentlyContinue }
} catch { }

$istAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

try {
    if ($istAdmin) {
        pnputil /restart-device "$id" | Out-Null
    } else {
        # Ohne erhoehte Rechte geht es nicht. Windows fragt einmal nach.
        Start-Process -FilePath 'pnputil' -ArgumentList "/restart-device `"$id`"" -Verb RunAs -Wait -WindowStyle Hidden
    }
} catch {
    Write-Output "FEHLER=$($_.Exception.Message)"
    exit
}

# Der Station Zeit geben, sich neu anzumelden.
$zustand = 'WEG'
for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Milliseconds 500
    $neu = Finde | Select-Object -First 1
    if ($neu) {
        if ($neu.InstanceId -like '*PID_0170*') { $zustand = 'SPEICHER'; break }
        if ($neu.InstanceId -like '*PID_0171*') { $zustand = 'AUDIO'; break }
    }
}
Write-Output "ZUSTAND=$zustand"
