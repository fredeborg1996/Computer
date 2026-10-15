Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
root = fs.GetParentFolderName(WScript.ScriptFullName)
shell.Run "wscript.exe """ & root & "\Start-Watch.vbs""", 0, False
shell.Run """" & root & "\SigmaLiveBridge.exe""", 0, False
