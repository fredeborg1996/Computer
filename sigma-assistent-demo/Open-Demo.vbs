Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
folder = files.GetParentFolderName(WScript.ScriptFullName)
Set log = files.OpenTextFile(folder & "\panel-launch.log", 8, True)
log.WriteLine Now & " Open-Demo reached"
log.Close
shell.CurrentDirectory = folder
shell.Run "wscript.exe " & Chr(34) & folder & "\Start-Watch.vbs" & Chr(34), 0, False
shell.Run "wscript.exe " & Chr(34) & folder & "\Open-SigmaPanel.vbs" & Chr(34), 0, False
