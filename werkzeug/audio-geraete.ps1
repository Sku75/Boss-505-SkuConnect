# Liest und setzt die Standard-Audiogeraete von Windows.
#
# Aktion liste   Gibt alle Geraete aus, je Zeile:
#                  GERAET=Wiedergabe|Aufnahme;<Name>;<standard ja oder nein>
# Aktion setze   Setzt das Geraet, dessen Name den Suchtext enthaelt, als
#                Standard fuer die angegebene Rolle. Setzt zugleich die
#                Kommunikations-Rolle, damit Programme wie Discord folgen,
#                sofern sie auf Standard stehen.
#
# Ausgabe bei setze:
#   GESETZT=<Name>
#   FEHLER=<Text>

param(
    [string]$Aktion = 'liste',
    [string]$Suche = '',
    [string]$Rolle = 'wiedergabe'
)

$ErrorActionPreference = 'Continue'

try {
    Import-Module AudioDeviceCmdlets -ErrorAction Stop
} catch {
    Write-Output "FEHLER=Das Modul AudioDeviceCmdlets fehlt"
    exit
}

$art = if ($Rolle -eq 'aufnahme') { 'Recording' } else { 'Playback' }

if ($Aktion -eq 'liste') {
    try {
        Get-AudioDevice -List | ForEach-Object {
            $bezeichnung = if ($_.Type -eq 'Recording') { 'Aufnahme' } else { 'Wiedergabe' }
            $standard = if ($_.Default) { 'ja' } else { 'nein' }
            Write-Output ("GERAET=" + $bezeichnung + ";" + $_.Name + ";" + $standard)
        }
    } catch {
        Write-Output "FEHLER=$($_.Exception.Message)"
    }
    exit
}

if ($Aktion -eq 'setze') {
    if (-not $Suche) {
        Write-Output "FEHLER=Kein Suchtext angegeben"
        exit
    }
    try {
        $ziel = Get-AudioDevice -List |
            Where-Object { $_.Type -eq $art -and $_.Name -like ("*" + $Suche + "*") } |
            Select-Object -First 1
        if (-not $ziel) {
            Write-Output "FEHLER=Kein passendes Geraet fuer $Suche gefunden"
            exit
        }
        Set-AudioDevice -ID $ziel.ID | Out-Null
        try { Set-AudioDevice -ID $ziel.ID -CommunicationOnly | Out-Null } catch { }
        Write-Output ("GESETZT=" + $ziel.Name)
    } catch {
        Write-Output "FEHLER=$($_.Exception.Message)"
    }
    exit
}

Write-Output "FEHLER=Unbekannte Aktion $Aktion"
