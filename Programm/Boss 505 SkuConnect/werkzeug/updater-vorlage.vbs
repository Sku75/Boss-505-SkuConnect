' Boss 505 SkuConnect aktualisieren.
' Diese Datei legt das Programm bei jedem Start neu im Ordner Boss an.
' Von Hand aendern lohnt nicht, die Aenderung ist beim naechsten Start weg.
' Die Pfade sind relativ zu dieser Datei, darum laeuft sie auf jedem Rechner.
Set fso = CreateObject("Scripting.FileSystemObject")
hier = fso.GetParentFolderName(WScript.ScriptFullName)
skript = hier & "\@SKRIPT@"
programm = hier & "\@PROGRAMM@"
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & skript & """ -Programm """ & programm & """", 0, False
