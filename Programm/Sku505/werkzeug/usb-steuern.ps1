# Hilft beim Trennen und Wiederverbinden der USB-Verbindung, damit das Kabel
# stecken bleiben kann.
#
# Die Station hat dafuer einen eigenen Weg, der im Handbuch auf Seite 27 steht:
# Erst am Rechner die Schreibpuffer leeren, dann am Geraet EXIT druecken und
# die Rueckfrage mit WRITE bestaetigen. Danach verlaesst die Station den
# Zustand Idling, das Bedienfeld reagiert wieder und die Betriebsart laesst
# sich umstellen. Erst dann meldet sie sich neu an.
#
# Aktion vorbereiten  Schreibpuffer leeren. Braucht keine erhoehten Rechte.
# Aktion erneuern     Das Geraet in Windows neu starten, falls es sich nach
#                     dem Umstellen nicht von selbst wieder meldet.
#
# Ausgabe, je eine Zeile:
#   ZUSTAND=SPEICHER|AUDIO|GETRENNT
#   GEFUNDEN=<InstanzId>
#   FEHLER=<Text>

param([string]$Aktion = 'vorbereiten')

$ErrorActionPreference = 'Continue'

function AktivesGeraet {
    $liste = Get-PnpDevice -ErrorAction SilentlyContinue |
        Where-Object { $_.InstanceId -like 'USB\VID_0582&PID_017*' -and $_.Status -eq 'OK' }
    $anschluss = $liste | Where-Object { $_.Class -eq 'USB' } | Select-Object -First 1
    if ($anschluss) { return $anschluss }
    return $liste | Select-Object -First 1
}

function Lage {
    $a = AktivesGeraet
    if (-not $a) { return 'GETRENNT' }
    if ($a.InstanceId -like '*PID_0170*') { return 'SPEICHER' }
    if ($a.InstanceId -like '*PID_0171*') { return 'AUDIO' }
    return 'GETRENNT'
}

if ($Aktion -eq 'vorbereiten') {
    $anzahl = 0
    try {
        Get-Volume -ErrorAction SilentlyContinue |
            Where-Object { $_.DriveType -eq 'Removable' -and $_.DriveLetter } |
            ForEach-Object {
                Write-VolumeCache -DriveLetter $_.DriveLetter -ErrorAction SilentlyContinue
                $anzahl++
            }
    } catch {
        Write-Output "FEHLER=$($_.Exception.Message)"
        exit
    }
    Write-Output "GELEERT=$anzahl"
    Write-Output "ZUSTAND=$(Lage)"
    exit
}

if ($Aktion -eq 'erneuern') {
    $ziel = AktivesGeraet
    if (-not $ziel) {
        # Nichts angemeldet. Dann kann Windows auch nichts neu starten, die
        # Station meldet sich von selbst, sobald sie wieder bereit ist.
        Write-Output "ZUSTAND=GETRENNT"
        exit
    }
    Write-Output "GEFUNDEN=$($ziel.InstanceId)"
    $istAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    try {
        if ($istAdmin) {
            pnputil /restart-device "$($ziel.InstanceId)" | Out-Null
        } else {
            # Genau ein Aufruf, damit Windows nur einmal nachfragt.
            Start-Process -FilePath 'pnputil' -ArgumentList "/restart-device `"$($ziel.InstanceId)`"" -Verb RunAs -Wait -WindowStyle Hidden
        }
    } catch {
        Write-Output "FEHLER=$($_.Exception.Message)"
        exit
    }
    for ($i = 0; $i -lt 16; $i++) {
        Start-Sleep -Milliseconds 500
        if ((Lage) -ne 'GETRENNT') { break }
    }
    Write-Output "ZUSTAND=$(Lage)"
    exit
}

Write-Output "FEHLER=Unbekannte Aktion $Aktion"
