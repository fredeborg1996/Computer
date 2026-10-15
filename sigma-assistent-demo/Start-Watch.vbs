Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
folder = files.GetParentFolderName(WScript.ScriptFullName)
node = shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"
If Not files.FileExists(node) Then node = "node"
shell.Run Chr(34) & node & Chr(34) & " " & Chr(34) & folder & "\watch.mjs" & Chr(34), 0, False
