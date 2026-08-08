# Steuert die USB-Verbindung zur RC-505, damit das Kabel stecken bleiben kann.
#
# Aktion trennen    Die Station wird von Windows abgemeldet. Sie verlaesst
#                   damit den Zustand Idling und das Bedienfeld reagiert
#                   wieder. Erst dann laesst sich die Betriebsart umstellen.
# Aktion verbinden  Die Station wird wieder angemeldet und in der jetzt am
#                   Geraet eingestellten Betriebsart erkannt.
# Aktion neuladen   Beides nacheinander, ersetzt Kabel ziehen und stecken.
#
# Ausgabe, je eine Zeile:
#   GEFUNDEN=<InstanzId>
#   ZUSTAND=SPEICHER|AUDIO|GETRENNT|WEG
#   FEHLER=<Text>

param([string]$Aktion = 'neuladen')

$ErrorActionPreference = 'Continue'

function AlleGeraete {
    Get-PnpDevice -ErrorAction SilentlyContinue |
        Where-Object { $_.InstanceId -like 'USB\VID_0582&PID_017*' }
}

function AktivesGeraet {
    $liste = AlleGeraete | Where-Object { $_.Status -eq 'OK' }
    $anschluss = $liste | Where-Object { $_.Class -eq 'USB' } | Select-Object -First 1
    if ($anschluss) { return $anschluss }
    return $liste | Select-Object -First 1
}

function PufferLeeren {
    try {
        Get-Volume -ErrorAction SilentlyContinue |
            Where-Object { $_.DriveType -eq 'Removable' -and $_.DriveLetter } |
            ForEach-Object { Write-VolumeCache -DriveLetter $_.DriveLetter -ErrorAction SilentlyContinue }
    } catch { }
}

$istAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

function Fuehre([string]$befehl, [string]$id) {
    if ($istAdmin) {
        & pnputil $befehl "$id" | Out-Null
    } else {
        Start-Process -FilePath 'pnputil' -ArgumentList "$befehl `"$id`"" -Verb RunAs -Wait -WindowStyle Hidden
    }
}

function Lage {
    $a = AktivesGeraet
    if (-not $a) { return 'GETRENNT' }
    if ($a.InstanceId -like '*PID_0170*') { return 'SPEICHER' }
    if ($a.InstanceId -like '*PID_0171*') { return 'AUDIO' }
    return 'WEG'
}

if ($Aktion -eq 'trennen' -or $Aktion -eq 'neuladen') {
    $ziel = AktivesGeraet
    if (-not $ziel) {
        Write-Output "FEHLER=Keine RC-505 am USB gefunden"
        exit
    }
    Write-Output "GEFUNDEN=$($ziel.InstanceId)"
    PufferLeeren
    Fuehre '/disable-device' $ziel.InstanceId
    Start-Sleep -Milliseconds 1500
}

if ($Aktion -eq 'verbinden' -or $Aktion -eq 'neuladen') {
    # Beim Verbinden alle bekannten Kennungen freigeben. Die Station meldet
    # sich je nach Betriebsart mit einer anderen, darum nicht nur die eine.
    $abgemeldet = AlleGeraete | Where-Object { $_.Status -ne 'OK' }
    foreach ($g in $abgemeldet) { Fuehre '/enable-device' $g.InstanceId }

    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 500
        if ((Lage) -ne 'GETRENNT') { break }
    }
}

Write-Output "ZUSTAND=$(Lage)"
