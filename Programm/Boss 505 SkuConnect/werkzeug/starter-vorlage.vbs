' Boss 505 SkuConnect starten.
' Diese Datei legt das Programm bei jedem Start neu im Ordner Boss an.
' Von Hand aendern lohnt nicht, die Aenderung ist beim naechsten Start weg.
' Der Pfad ist relativ zu dieser Datei. Darum laeuft sie auch, wenn der
' ganze Ordner Boss auf einem anderen Rechner liegt.
Set fso = CreateObject("Scripting.FileSystemObject")
hier = fso.GetParentFolderName(WScript.ScriptFullName)
programm = hier & "\@PROGRAMM@"
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = programm
sh.Run """" & programm & "\node_modules\electron\dist\electron.exe"" """ & programm & """", 1, False
