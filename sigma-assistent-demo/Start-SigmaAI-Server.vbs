Option Explicit
Dim launcher
Set launcher = CreateObject("WScript.Shell")
launcher.Run "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -File ""C:\MAK-Sigma\Start-SigmaAI-Server.ps1""", 0, False
