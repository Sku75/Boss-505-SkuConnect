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

# Das Modul liegt mitgeliefert im Programmordner, damit Sku505 auch von einem
# Stick auf einem fremden Rechner die Audiogeraete setzen kann. Nur wenn die
# eigene Kopie fehlt, wird auf ein installiertes Modul zurueckgegriffen.
$eigenes = Join-Path $PSScriptRoot 'Module\AudioDeviceCmdlets\AudioDeviceCmdlets.psd1'
try {
    if (Test-Path $eigenes) {
        Import-Module $eigenes -ErrorAction Stop
    } else {
        Import-Module AudioDeviceCmdlets -ErrorAction Stop
    }
} catch {
    Write-Output "FEHLER=Das Modul AudioDeviceCmdlets liess sich nicht laden"
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
