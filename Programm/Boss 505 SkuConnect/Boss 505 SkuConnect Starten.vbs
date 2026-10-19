' Startet Boss 505 SkuConnect ohne schwarzes Konsolenfenster.
' Ruft das Programm direkt auf, nicht ueber eine Batchdatei.
Set fso = CreateObject("Scripting.FileSystemObject")
ordner = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = ordner
sh.Run """" & ordner & "\node_modules\electron\dist\electron.exe"" """ & ordner & """", 1, False
