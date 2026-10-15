# Sigma-assistent · integrationspakke

## På Sigma-bærbaren

1. Pak ZIP-filen ud i en lokal mappe. Installér Node 22+ og Ollama, hvis de mangler. Hent `qwen3.5:9b` via Ollama. Den bærbares hastighed er endnu ikke målt.
2. Dobbeltklik `Open-Demo.vbs`. Den færdigbyggede webapp kræver ingen npm-installation. Til filovervågning kræves Python 3; angiv eventuelt miljøvariablen `SIGMA_PYTHON` med fuld sti til python.exe. På udviklingsmaskinen findes Codex' Python automatisk.
3. Åbn en **kopi** af en kalkulation i Sigma. I assistentens **Sigma-forbindelse** kan du vælge kopiens fulde `.sig`-sti. Efter Gem følger assistenten filen hvert andet sekund. `.sit` og ZIP-komprimerede projektfiler understøttes også, når formatet er SIGPROJ 41.
4. Livebroen startes automatisk sammen med overvågningen via `Open-Demo.vbs` / `Start-Watch.vbs`. Sigma og assistenten skal køre under samme Windows-bruger og samme rettighedsniveau. Broen følger det aktive projekt hvert andet sekund, også nye og ikke-gemte projekter; der vælges ikke en ny fil manuelt ved hvert projektskift. Broen opretter eller redigerer ikke Sigma-projekter. `Start-LiveBridge.vbs` findes som manuel genstart. `SIGMA_LIVE_BRIDGE=0` fravælger automatisk brostart. EXE er x86/.NET Framework; `Build-LiveBridge.ps1` kan genopbygge den.
5. Åbn `Open-SigmaPanel.vbs` for panelet til højre. Det åbner et separat Edge-vindue. Det er **ikke et indbygget Sigma-dockpanel**. PowerShell-indstillingen i denne launcher gælder kun den ene proces; Windows-politikken ændres ikke permanent.
6. Indlæs sagens rigtige SAB/TAG/rettelsesblade under Kilder. Første nye projekt fjerner tidligere projektkilder og syntetiske demokrav.

COM-broen er kompileret, men **ikke runtime-valideret i Sigma**. Installationssættet er EG Sigma 8.3.2.13127; versionen på bærbaren kan afvige. COM-felternes navne, indeks, deaktiverede poster, afrunding, tillæg og summer skal afstemmes på projektkopien. Broen stopper ved manglende felter eller afviste data og skriver lokal status i `data/sigma-live-status.json`; den gætter ikke nulpriser. Et modtaget snapshot beviser ikke i sig selv korrekt feltafstemning.

Filovervågning er testet ende til ende. Den læser kun gemte resultater og evaluerer aldrig Sigmas formler. Deaktiverede poster, uventet format, over 1000 poster eller en afvigelse over 0,02 kr. mellem hovedposter og rod afvises. Sidste valide snapshot bevares ved fejl, og fejl vises under Sigma-forbindelse. COM/AppScript-snapshots stopper filovervågningen, så to input ikke konkurrerer. Auto arbejder kun, mens pc og server er vågne.

## Automatisk søgning i tidligere kalkulationer

Søgningen kører lokalt ved nye snapshots, ændrede poster og projektskift, også med lukket browser og pauset automatisk modelvurdering. En tom ny kalkulation afventer en beskrivende titel eller de første poster. Modellen trænes ikke i denne proces.

På denne pc findes OneDrive-mappen Sagsstyring automatisk. På bærbaren vælges mappen én gang under **Lignende sager → Historikmappe og dækning**, eller med `SIGMA_HISTORY_ROOT`. Stien gemmes lokalt. Indekset opdateres ved opstart og hver 15. minut. Der læses `.sig`, ikke `.sit`-skabeloner. Deaktiverede poster springes over. PDF/Excel og udfald/efterkalkulationer er endnu ikke inkluderet. Originalerne ændres ikke.

Op til tre kandidater rangeres efter fælles arbejdsord og postbeskrivelser med en vægtet tekstsøgning. Det er **ikke semantiske embeddings eller fagligt valideret sagslighed**. Mindst to fælles arbejdsord kræves; en utilstrækkelig søgning giver ingen kandidat. Matcher viser kildefil, fælles ord og eksempelposter. Aktuel fil og kendte kopier udelades. Filer med identiske aktive poster og lagrede beløb samles; forskellige mængder/priser bevares som særskilte kandidater. Et ordmatch er ikke en sandsynlighed eller et prisbevis.

Historiske kandidater kan indgå i den lokale 9B-vurdering, men historiske beløb bruges ikke automatisk som nye enhedspriser. Dato, størrelse, adgangsforhold og faktisk udfald skal afklares. Cloudforhåndsvisningen medtager ikke historik automatisk. Indeks og seneste matches gemmes privat i `data/` og medfølger ikke ZIP-filen.

Begrænsninger: 500 historikfiler / 8 MB indeks pr. scanning; overskridelser og afvisninger markeres i panelet. Den aktive v2-kalkulation har stadig grænsen 1000 poster og understøtter endnu ikke deaktiverede/negative prisposter. Der kan derfor ikke gives en garanti om enhver Sigma-kalkulation, før de konkrete versioner og scenarier er runtime-testet.

## Lokal drift og cloud

Standard er lokal Qwen 3.5 9B. Automatisk kontrol og chat bruger fortsat lokal model. Der er ingen automatisk cloudovergang. `SIGMA_LOCAL_ONLY=1` på serverprocessen låser cloud både i brugerflade og backend.

Valget **Lokal + valgfrit cloudtjek** giver valg af konkrete poster og kilder. Forhåndsvisningen er den præcise payload, som kan sendes. Sagsnavn, fuld tilbudssum og afklaringshistorik udelades; udvalgte postbeløb, beskrivelser og kildeuddrag kan stadig være fortrolige. Kun de første 40 poster og den begrænsede dokumentudvælgelse indgår. Forhåndsvisningen viser de faktiske uddrag; ikke-valgte kilder sendes ikke. En engangsbillet udløber efter fem minutter eller ved ændret kalkulation.

API-nøgler konfigureres **lokalt på serverprocessen**, aldrig i React, i chatten eller i ZIP-filen:

- OpenAI: `OPENAI_API_KEY` og et konto-tilgængeligt model-id i `SIGMA_OPENAI_MODEL`.
- Claude: `ANTHROPIC_API_KEY` og et konto-tilgængeligt model-id i `SIGMA_ANTHROPIC_MODEL`.

Genstart serveren efter ændrede miljøvariabler. Nøgler vises ikke via API. API-adapterne er testet med simulerede svar; ingen virksomhedsdata er sendt til cloud under udviklingen, og rigtige cloudkald er ikke testet. OpenAI-kald bruger `store:false`, hvilket ikke er et løfte om nul opbevaring hos udbyderen.

**Abonnementslogin er ikke tilkoblet.** En ChatGPT-/Claude-websession må ikke genbruges som vilkårlig API-nøgle. Sign in with ChatGPT kræver understøttet registrering og kontoberettigelse; den konkrete app er endnu ikke registreret. API-valget må ikke beskrives som inkluderet i et almindeligt abonnement uden at kontrollere kontoens vilkår. Der er ikke bygget fuldautomatisk cloudtilstand endnu; cloud er et manuelt ekstra tjek.

Officielle kilder kontrolleret 14. oktober 2026:

- [Sigma AppScript](https://developer.sigmaestimates.com/appscript/Sigma.htm)
- [OpenAI tekst/API](https://developers.openai.com/api/docs/guides/text)
- [Sign in with ChatGPT](https://developers.openai.com/siwc/quickstart)
- [Claude Messages API](https://platform.claude.com/docs/en/api/messages/create)

## Accepttest i Sigma

På projektkopien: sammenlign navn, antal poster, hovedpostsum, enkelte mængder og salgs-/kostpriser. Ændr en mængde og en enhedspris, bekræft samme nye beløb i begge vinduer. Kontroller, at underposter ses uden dobbelttælling. Skift projekt og kontrollér, at tidligere kilder fjernes. Kontrollér nulpriser, tillæg, alternative/deaktiverede poster og rettelsesblade. Ret derefter en kendt fejl og verificér, at advarslen forsvinder. Denne laptoptest er stadig udestående.

## Chat som standardvisning

Sidepanelet åbner nu som en almindelig samtale med skrivefelt nederst. Status, fundne lignende tilbud, regeladvarsler og lokale modelsvar kommer som assistentbeskeder. Når de første poster modtages fra Sigma, registreres søgestart og derefter det faktiske resultat i chatten. Der påstås ikke importdetektion før Sigma-broen har afleveret posterne.

Kilder, afklaringer, historikmappe og model-/Sigmaindstillinger ligger under menuen øverst. Samtaler gemmes lokalt pr. sag i data/conversations.json. De følger projektidentiteten, flyttes med første Gem, og genfindes efter genindlæsning. Identiske søgninger/advarsler duplikeres ikke. Livekoblingen til den konkrete Sigma-installation skal stadig runtime-testes på bærbaren.


## Automatisk sagsmateriale (14. oktober 2026)
Når en gemt Sigma-kalkulation åbnes, søger assistenten lokalt i dens sagsmappe efter SAB, TAG, AAB, rettelsesblade og øvrigt navngivet udbudsmateriale. En undermappe kaldet Kalkulation/Beregning/Sigma kan føre søgningen op til sagsmappen. Ingen søgning på hele disken. En ugemt kalkulation eller en fælles tilbudsmappe kan kræve ét mappe-/filvalg i Kilder. Mapper med andre kalkulationer udelades.

PDF med tekst, DOCX og TXT læses. PDF kræver Python-pakken pypdf (allerede tilgængelig på denne pc). DOCX/TXT henviser til tekstafsnit, ikke opdigtede PDF-sider. Excel, tegninger, mailfiler og ZIP registreres kun som fundne. Scannede PDF-sider kræver OCR, som endnu ikke er integreret. Flere versioner kræver eksplicit valg; der gættes ikke på gældende udgave.

Grænser: dybde 3 undermapper, 300 filer, 30 MB pr. læst fil, op til 100 kildeafsnit samlet. Kilder genkontrolleres hvert minut og ved projektskift. Chatten viser fund og begrænsninger. Modelkonteksten er stadig et begrænset udvalg af uddrag og indebærer ikke fuld kontrol af materialet.

Historiske kandidater rangeres nu også efter genkendte arbejdsarter og sammenlignelige mængder/enheder fra Sigma-hierarkiet. Underliggende ressourcer tælles ikke dobbelt som aktivitetsmængder. Adgangsforhold, prisniveau, vundet/tabt og faktisk indtjening er stadig ukendte. Dette er deterministisk sammenligning, ikke ny modeltræning.

Verifikation: npm run build, npm test (15), node test-api.mjs samt python test-discovery.py (4). API-testen dækker automatisk tilknytning, ændret kildehash og eksplicit versionsvalg. Testene bruger syntetiske sager; live Sigma på den anden computer mangler fortsat afprøvning.
