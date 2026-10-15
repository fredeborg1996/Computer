# MAK Tilbudsassistent — mødedemo og Sigma-prototype

## Start

Åbn `Start-Demo.ps1` med PowerShell, eller gå til http://127.0.0.1:4317 når serveren kører. Installation: Node 22+, `npm install`, `npm run build`, `npm start`. Ollama skal køre lokalt med `qwen3.5:9b`. Tjenesten lytter kun på loopback; den eksponeres ikke på internettet.

`Start-SigmaPanel.ps1` åbner kun AI-panelet i et separat Edge-appvindue ved skærmens højre kant. Alternativt `http://127.0.0.1:4317/?panel=1`. Sigma skal placeres ved siden af; panelet er endnu ikke indlejret i Sigmas vindue.

På denne computer er en skrivebordsgenvej og en login-genvej oprettet. `watch.mjs` genstarter serveren ved fejl og startes skjult via `Start-Watch.vbs`. Windows' PowerShell-politik er ikke ændret. `Open-Demo.vbs` starter overvågningen og åbner appen. Stop processen med PID i `data/watch.pid`, stop serverprocessen, og fjern `MAK Tilbudsassistent.lnk` fra Windows Start-mappen for at deaktivere autostart. Serveren er kun aktiv, mens brugeren er logget ind og computeren er vågen.

`Package-Demo.ps1` danner en ZIP til den anden computer med færdigbygget app og kildekode. `data/`, tokens, rigtige dokumenter, modelvægte og logfiler er udeladt. Pak ud, installér Node og Ollama, hent `qwen3.5:9b`, og dobbeltklik på `Open-Demo.vbs`. Den færdigbyggede app kræver ikke npm-installation for at blive vist.

## Vis på tre minutter

1. Fortæl: Dette er en demonstrationskalkulation med konstruerede krav og priser. Sigma er på en anden computer. Panelet viser den arbejdsgang, vi vil koble til Sigma.
2. Se advarslen om jordprøver. Åbn SAB-henvisningen: dokument og side følger kravet.
3. Opret den manglende post. Prisen står fortsat som uafklaret; assistenten må ikke gøre tilbuddet grønt uden dokumenteret prisgrundlag.
4. Ret afstanden til lastbil fra 120 til 20 m. Metodeforslaget ændres automatisk. Assistenten kræver bekræftelse af adgang og produktionstid, før den foreslår en besparelse.
5. Gem en faglig afklaring. Den gemmes lokalt, og kontrollen genåbnes ved ændret datagrundlag.
6. Spørg den lokale 9B-model. Automatiske modelvurderinger af ændringer kører i serveren, også hvis browserpanelet lukkes, mens computeren og serveren kører. Ingen analyse under dvale/slukket pc. Modellen er base-Qwen med dokumentkontekst; træningsadapteren er ikke indlæst.

## Sigma på den anden computer

Se [INSTALLATION.md](INSTALLATION.md) for den aktuelle integrationspakke. Den indeholder afprøvet overvågning af gemte Sigma-filer, en kompileret læsende COM-bro til liveændringer og højrepanelet. COM-forbindelsen og felterne skal stadig afprøves i den installerede Sigma-version på bærbaren. Der er ikke bygget et indlejret dockpanel.

Fil-/COM-snapshots bevarer posthierarki og Sigmas evaluerede salgs- og kostbeløb. Kun hovedposter tæller i tilbudssummen. Ukendt format eller uoverensstemmende sum afvises. Den gamle AppScript-fil er fortsat en ukompileret prototype og er ikke den anbefalede startvej.

Lokal 9B er standard. Et manuelt cloudtjek kan vælges med afgrænsede data og præcis forhåndsvisning. OpenAI- og Claude-API-adaptere er implementeret; nøgler, modelvalg og abonnementslogin er ikke tilkoblet. Ingen original kalkulation eller eksisterende OpenClaw-job ændres.

## Eget udbudsmateriale

`./Import-Pdf.ps1 -Pdf 'C:\sti\SAB.pdf' -Pages '12,13,14'` danner `data/dokumentuddrag.json`. Vælg denne fil under **Kilder**. PDF-teksten skal kontrolleres visuelt mod originalen; scannede sider kræver OCR. Side er PDF-siden, ikke nødvendigvis dokumentets trykte sidenummer. Import erstatter det aktuelle kildesæt. Saml flere PDF-udtræk i én JSON-liste, hvis SAB og TAG skal med samtidigt.

På denne computer er knappen **Prøv med rigtigt TAG fra CG Jensen** klar med PDF-side 11 og 13 fra `Tilbuds- og afregningsgrundlag (TAG) - 93610.200.pdf`. De trykte sidenumre er 10 og 12. Side 11 er også kontrolleret visuelt mod originalen. Dette er to udvalgte sider, ikke hele udbuddet; kalkulationen forbliver konstrueret.

Format: `[{"id":"SAB-v1-p12","name":"SAB.pdf","page":12,"text":"Ordret uddrag..."}]`.

Modelkontekst har et loft; relevante uddrag udvælges ud fra kalkulation/spørgsmål. Det er ikke en fuld tilbudskontrol. Regelkontrollen for jordprøver er et afgrænset demonstrativt eksempel; generelle krav skal udtrækkes, dokumenteres og valideres før produktion. Tidligere .sig-kalkulationer søges nu automatisk lokalt; se INSTALLATION.md. Faktiske udfald, efterkalkulationer og løbende modeltræning er ikke tilkoblet.

## Kontrol og vedligehold

`npm test` tester kravsporbarhed, matematisk sum, afklaringers gyldighed og metodeforudsætninger. API afviser ukendt origin/host og ugyldige data. Sigma-endpoint kræver lokalt bridge-token. Den lokale chat deler modelkøen med automatisk vurdering. Ollama kan også bruges af eksisterende økonomiagenter, så svartid varierer; det store finansmodel-setup ændres ikke.

Auto-knappen pauser modelvurderinger; regelkontroller fortsætter. `Nulstil demosag` erstatter den lokale demos tilstand; brug ikke knappen som en sagsarkivfunktion. Den lokale app har ét aktivt projekt ad gangen.

## Officielle integrationskilder

- https://developer.sigmaestimates.com/docs/create-your-code/
- https://developer.sigmaestimates.com/docs/basic-webservices/
- https://developer.sigmaestimates.com/appscript/Sigma.Document.TSigmaField.htm
- https://developer.sigmaestimates.com/appscript/System.Timers.TTimer.htm
- https://developer.sigmaestimates.com/appscript/System.Net.HTTP.Client.TWebClient.Post.htm


## Automatisk sagsmateriale (14. oktober 2026)
Når en gemt Sigma-kalkulation åbnes, søger assistenten lokalt i dens sagsmappe efter SAB, TAG, AAB, rettelsesblade og øvrigt navngivet udbudsmateriale. En undermappe kaldet Kalkulation/Beregning/Sigma kan føre søgningen op til sagsmappen. Ingen søgning på hele disken. En ugemt kalkulation eller en fælles tilbudsmappe kan kræve ét mappe-/filvalg i Kilder. Mapper med andre kalkulationer udelades.

PDF med tekst, DOCX og TXT læses. PDF kræver Python-pakken pypdf (allerede tilgængelig på denne pc). DOCX/TXT henviser til tekstafsnit, ikke opdigtede PDF-sider. Excel, tegninger, mailfiler og ZIP registreres kun som fundne. Scannede PDF-sider kræver OCR, som endnu ikke er integreret. Flere versioner kræver eksplicit valg; der gættes ikke på gældende udgave.

Grænser: dybde 3 undermapper, 300 filer, 30 MB pr. læst fil, op til 100 kildeafsnit samlet. Kilder genkontrolleres hvert minut og ved projektskift. Chatten viser fund og begrænsninger. Modelkonteksten er stadig et begrænset udvalg af uddrag og indebærer ikke fuld kontrol af materialet.

Historiske kandidater rangeres nu også efter genkendte arbejdsarter og sammenlignelige mængder/enheder fra Sigma-hierarkiet. Underliggende ressourcer tælles ikke dobbelt som aktivitetsmængder. Adgangsforhold, prisniveau, vundet/tabt og faktisk indtjening er stadig ukendte. Dette er deterministisk sammenligning, ikke ny modeltræning.

Verifikation: npm run build, npm test (15), node test-api.mjs samt python test-discovery.py (4). API-testen dækker automatisk tilknytning, ændret kildehash og eksplicit versionsvalg. Testene bruger syntetiske sager; live Sigma på den anden computer mangler fortsat afprøvning.
