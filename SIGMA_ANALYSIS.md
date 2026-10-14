# Sigma Professional: første tekniske kortlægning

## Materiale og integritet

- Det tredelte arkiv `Sigma Professional.z01`, `.z02`, `.zip` blev testet med 7-Zip: **Everything is Ok**.
- Arkivet indeholder 146 poster, heraf 126 filer. Hovedprogrammet `sigma.exe` er 98.251.376 byte, SHA-256 `1af3ccf61ad0af84c4841c2531bfd4c209d83e70838a740d8d3e3676652f4bf6`.
- Originalfilerne ligger i `/workspace/scratch/sigma-unpacked` til analyse og er ikke lagt ind i projektets kildekode.

## Verificerede observationer

- REA klassificerer `sigma.exe` som en 32-bit PE-fil uden .NET/CLI-metadata (Evidence `ev_373843d2345188fe899bb5d95670274674c85d6b8c2c075d7251f6f74fc01f28`). Der er derfor ikke C#-metoder at dekompilere fra hovedprogrammet.
- Strenge i programfilen henviser til Delphi/Embarcadero, Sigma-projekter, beregninger, ressourcer, rapporter og tilbud. De viser mulige funktioner, men ikke deres fulde adfærd.
- `SigmaSharePoint.dll` er ligeledes en native 32-bit PE-fil. Den indeholder referencer til `Sigma.SigmaApplication` COM-registrering og `sigma.exe`; det underbygger en integration mellem SharePoint-komponenten og hovedprogrammet. REA Evidence `ev_cd36b50a3e282bcbe12ce64416292a316d7ffec801b63dab7c2837551061dab4` bekræfter, at DLL'en ikke er .NET.
- `EG.Construction.News.Client.dll` er en .NET Standard 2.0-komponent, der refererer til `System.Text.Json` (REA Evidence `ev_ac8e9c716423274915f57402ee02f26a3aab1da5e106758ce99c53538dce501e`).
- Eksemplet `Configurations/Templates/Blank.sit` er et ZIP-arkiv med en XML-post `Blank.sit` og metadata. XML-roden er `SigmaFile`, med `FileType="SIGPROJ"` og `FileSaveVersion="41"`. Eksemplets BuildInfo angiver Sigma `8.3.0.13047`; det er metadata for eksemplet, ikke nødvendigvis versionen af den vedlagte EXE. `1. GT skabelon med byggeplads.sit` er derimod ren XML; begge varianter forekommer i det samme installationssæt.
- Arkivet indeholder projekt- og rapportskabeloner for kalkulation, afrapportering, tilbud og lister, samt en `.chm`-hjælpefil og sprog-DLL'er.

## Skærmoptagelse 2026-10-09

Det todelte videoarkiv (`.z01` + `.zip`) er integritetstestet med 7-Zip og indeholder én afspilbar MP4 på ca. 195 sekunder. Følgende er direkte observationer fra optagelsen, ikke slutninger ud fra programfilen:

- 0:00: Startvisningen har Ny/Åbn/Gem-menu og projekt-/standardskabeloner.
- 0:30: Et nyt projekt er åbnet i **Kalkulation** med fanerne Indhold, Slutskema, Ressourcer, Indsigt og Nøgletal. Indholdet er et positions- og pristabeltræ.
- 1:00: **Biblioteker** viser et særskilt bibliotekspanel over kalkulationspanelet. Biblioteket har kategoritræ og pristabel.
- 1:30–1:45: Biblioteksposterne *Opbrydning af Asfalt* og *Bortskaffelse af grøntaffald* ses i tilbudslisten. Begge har mængde 300 m². Første post viser kostpris pr. enhed 77,67, samlet kostpris 23.300,61 og salgspris 29.126,00. Forskellen mellem vist enhedspris × mængde og samlet beløb viser, at afrunding/skjult præcision skal undersøges, før en beregningsregel kan implementeres sikkert.
- 2:00: En valgt aktivitet viser et underliggende ressource-/prisgrundlag. Senere ses flere åbne biblioteks- og prispaneler.
- 3:00: Fil/Info-visningen for et prisbibliotek viser dokumentegenskaber og validering.

Optagelsen viser ikke tydeligt oprettelse af egne biblioteksposter, ændring af enhedspris, rapporteksport eller gem/genåbn af det nye projekt. De arbejdsgange og beregningsregler er derfor endnu ikke valideret. Optagelsen er en reference til brugerflade og interaktion; den er ikke en projektspecifikation eller kildekode.

## Brugerens biblioteker

- `GT. Anlæg Jord_Beton.sli` og `bibliotek m. byggeplads og kayser thorsen priser.sli` er ZIP-arkiver med `SigmaFile FileType="SIGLIB" FileSaveVersion="41"` og hhv. 3.352 og 203 komponenter.
- En komponent kan indeholde `Name`, `Position`, `Unit`, `QuantityUnregulated`, `UnitPrice`, `UnitSalesPrice`, `CostPrice`, `SalesPrice`, `AmountFormula` og underkomponenter. Eksempelvis har *Formand* i det mindre bibliotek mængden 1036, formlen `140*7.4`, enhedsprisen 550 og særskilte beregnede totalfelter. Derfor er en flad kopiering af en enkelt post ikke ækvivalent med Sigmas ressourcebaserede kalkulation.
- Vores første `.sli`-import læser begge biblioteker og kopierer kun direkte lagrede enhedspriser for den valgte post; den genberegner ikke formler eller arver priser fra underposter.

## Hvad der skal kortlægges for en selvstændig version

1. Projektmodellens træ, ressourcer, enheder, formler og beregningsregler ud fra flere `.sit`-eksempler og observeret programadfærd.
2. Filimport og -eksport, herunder versionsfelter og bevarelse af ukendte XML-felter.
3. Brugerfladens vigtigste arbejdsgange: projektoprettelse, redigering, kalkulation, tilbud og rapportering.
4. Eksterne integrationer og data, herunder SharePoint, varekataloger og nyhedstjenesten.
5. Sammenligning med det kørende Windows-program. Statisk analyse alene kan ikke bekræfte beregningsresultater eller alle skærmbilleder og handlinger.

## Status

Arkivet og den første skærmoptagelse er verificeret. Brugeren har valgt et **Windows-program** som mål. Vores app kan nu oprette, redigere og gemme en enkel kalkulation i eget format samt importere projektstruktur fra `.sit`. En komplet kopi er **ikke** implementeret. Særligt ressourcebaseret priskalkulation, biblioteksoverførsel, rapporter, original `.sit`-eksport og Windows-afprøvning mangler. Den vedlagte optagelse giver visuel adfærdsevidens, men ikke nok til at fastslå alle beregningsregler.
