# Selvstændig kalkulation til Windows

En tidlig, selvstændig Windows-app. Du kan oprette kalkulationslinjer, redigere mængde samt kost- og salgspris, se summer og gemme/genåbne arbejdet i vores eget `.skalk`-format. Du kan importere komponentstruktur fra Sigma `.sit` (både ZIP- og XML-varianten). Importen medtager **ikke** priser, mængder eller Sigmas beregningslogik; originalfilen ændres ikke. Du kan også åbne et Sigma-bibliotek (`.sli`), vælge en post i træet og kopiere dens navn, position, enhed og eksplicit gemte enhedspriser til kalkulationen. Mængden sættes til 1; ressourceformler og underposter kopieres ikke med.

Byg Windows-programmet med .NET 10 SDK:

```powershell
dotnet publish Sigma.Desktop/Sigma.Desktop.csproj -c Release -r win-x64 --self-contained true
```

Start `Sigma.Desktop/bin/Release/net10.0-windows/win-x64/publish/Sigma.Desktop.exe` på Windows. Brugerfladen er nu bygget efter Sigmas overordnede opbygning: topmenu, flere biblioteksfaner med kategoritræ og pristabel samt kalkulation nederst. Brug “Åbn Sigma-bibliotek”, vælg en post og tryk “Kopiér valgt post”, eller brug “Importer Sigma .sit” for at hente en projektstruktur. Det er ikke en pixelidentisk kopi eller en fuld Sigma-erstatning: bl.a. ressourcekalkulation, rapporter, fuld `.sit`-kompatibilitet og Windows-UI-test mangler. Menupunkter uden implementeret funktion viser en tydelig status i stedet for at foregive funktionalitet.

Vil du blot prøve den allerede byggede version, så hent `windows-build/Sigma.Desktop-win-x64.zip`, pak hele ZIP-filen ud på Windows, og start `Sigma.Desktop.exe` fra den udpakkede mappe. Behold de øvrige filer i samme mappe. Bygningen er kontrolleret i cloudmiljøet, men selve WPF-vinduet er ikke afprøvet på Windows endnu.

Den platformuafhængige projektlæser kan også kontrolleres fra kommandolinjen:

```powershell
dotnet run --project Sigma.Inspect/Sigma.Inspect.csproj -- "C:\sti\til\projekt.sit"
```

Se [SIGMA_ANALYSIS.md](SIGMA_ANALYSIS.md) for dokumenterede observationer og åbne spørgsmål.

## Sigma-installationsarkiv

Den private repository indeholder også brugerens originale tredelte arkiv i `sigma-installation/`:

- `Sigma Professional.z01`
- `Sigma Professional.z02`
- `Sigma Professional.zip`

Download **alle tre filer** til samme mappe på Windows. Åbn eller udpak derefter `.zip`-delen med 7-Zip; den finder automatisk `.z01` og `.z02`. Arkivet blev testet samlet og indeholder 126 filer. Det er brugerens kommercielle programfiler, ikke kildekode til vores app; del dem ikke videre uden rettigheder. Skærmoptagelse og private `.sli`-biblioteker er ikke medtaget.
