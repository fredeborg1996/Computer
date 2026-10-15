# Sigma AI-assistent — download til bærbaren

[**Download MAK-Sigma-latest.zip**](https://github.com/fredeborg1996/Computer/raw/refs/heads/main/sigma-download/MAK-Sigma-latest.zip)

1. Download og udpak hele ZIP-filen i fx `C:\MAK-Sigma`. Kør ikke direkte fra ZIP.
2. Installér Node.js 22+, Python 3 og Ollama, hvis de mangler. I PowerShell:
   ```powershell
   ollama pull qwen3.5:9b
   py -m pip install pypdf
   ```
3. Åbn en kopi af en kalkulation i Sigma. Start `Open-Demo.vbs`, derefter `Open-SigmaPanel.vbs` fra pakken.
4. Under menuen → Indstillinger vælges historikmappen med tidligere kalkulationer. Sagsmateriale findes automatisk ved den gemte kalkulation, eller sagsmappen vælges under Kilder.
5. Kontrollér sagsnavn, mængder og summer mod Sigma. Ret en mængde i kopien og kontrollér, at ændringen modtages.

Hvis livebroen ikke forbinder, vælges `.sig`-filen under Sigma-forbindelse. Det følger gemte ændringer. Livebroen er endnu ikke runtime-valideret på den konkrete Sigma-bærbar. Panelet er et separat vindue, ikke et indbygget dockpanel. Den lokale 9B-model kræver tilstrækkelig hukommelse.

## Opdateringer

Samme downloadlink bruges til nye versioner. De installeres ikke automatisk på bærbaren. Luk assistent og livebro inden udskiftning, og bevar din lokale `data`-mappe; ZIP-filen indeholder ingen `data`-mappe. De udpakkede programfiler kan erstattes. Versions- og kontrolsum findes i [version.json](version.json).

Kildekode findes i [sigma-assistent-demo](../sigma-assistent-demo/). ZIP-pakken indeholder det færdigbyggede panel og livebroen, så npm-installation ikke kræves for almindelig brug.
