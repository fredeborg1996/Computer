Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
folder = files.GetParentFolderName(WScript.ScriptFullName)
shell.Run "wscript.exe " & Chr(34) & folder & "\Start-Watch.vbs" & Chr(34), 0, False
WScript.Sleep 1000
shell.Run "http://127.0.0.1:4317", 1, False
