# Kontrol af mødedemo · 14. oktober 2026

## Afprøvet

- Produktion bygget med React/Vite. Otte motortests består. Separat API-test består: adgangskontrol, ugyldige data, revisionskonflikt, lokalt samtykke til automatisk vurdering, snapshotmodtagelse og adskillelse af projekters kildegrundlag.
- I Codex' indbyggede browser: ændret jordmængde 480 → 500, sum 171.700 → 175.400 kr.; kildevisning; ny post med nulpris; afstand 120 → 20 m; afklaring gemt og genfundet; rigtige TAG-sider indlæst. Ingen Playwright-fallback nødvendig.
- Ollama `qwen3.5:9b` er installeret: **9.0B, Q4_K_M**, cirka 6,55 GB inklusive modeldele. Automatisk modelvurdering gennemført, derefter rigtig chat og ny automatisk vurdering efter afstandsændring. Vurderingens revision matchede kalkulationens revision 10. Ordrette citater blev genfundet i de angivne kilder. Dette validerer demoens forløb, ikke generel tilbudsnøjagtighed.
- Serveren blev bevidst stoppet; `watch.mjs` genstartede den. Start ved login er konfigureret via en Windows-genvej og VBScript; PowerShell-politikken er ikke ændret. Selve et nyt Windows-login er ikke afprøvet.
- Sigma-klienten kan ikke testes på denne pc, da Sigma er på den anden computer. HTTP-modtageren er testet med konstruerede snapshots. AppScript er **ikke kompileret i Sigma**. Prisfelter, aktive poster, summer og timer skal afstemmes dér.

## Visuel kontrol

Udgangspunkt: brugerens tidligere kodevisualisering `aktiv-tilbudsassistent.html` og ønsket om kode frem for et genereret billede. Ingen godkendt bitmap-konceptfil findes; ingen billedbaseret designgodkendelse påstås. Den funktionelle struktur er videreført til en kalkulationsdemo med AI til højre.

Seneste browserbillede er gemt i `data/demo-preview.jpg` og inspiceret med `view_image`. Kontrollerede punkter: 1) kalkulationsgrid og højrepanel, 2) typografi og læsbarhed på felter, 3) rolige grønne/grå farver og ravfarvede krav, 4) knapper, kildevisning og afklaringsdialog, 5) afstande, total og sidestruktur. Desktop ved browserens normale bredde cirka 1280 px; mobil ved logisk 390 × 844 px. Sidepanelets DOM viste 390 px uden udvendigt vandret overflow; kalkulationstabellen har tilsigtet intern vandret rulning.

Kopikontrol: konstruerede priser og kilder er markeret. Ved rigtige TAG-uddrag ændres kildebeskrivelsen; original kalkulation er fortsat et eksempel. Klip af AI-tekst i sidepanelets indre rulningsområde er tilsigtet; chatfeltet forbliver tilgængeligt. Ingen kendte blokerende layoutfejl. Der påstås ikke pixelidentitet med et ikke-eksisterende billedkoncept.

Rettelser under testen: initial render-fejl, afstandsfeltets hændelsesværdi, rolig redigering med kort debounce, browser-prompt erstattet med en rigtig dialog, og autostart rettet til at fungere uden ændret PowerShell-politik.

## Afgrænsning

Dette er en mødedemo og en integrationsprototype. Et indbygget dockpanel i Sigma er ikke lavet; det separate panel kan placeres ved siden af Sigma. Regelkontroller er afgrænsede eksempler, dokumentudvælgelsen er delvis, og en kilde med et genfundet citat beviser ikke i sig selv modellens fortolkning. Historiske tilbud og efterkalkulationer er ikke koblet på. Ingen LoRA-adapter er deployeret. Virkelige tilbud eller bilag godkendes ikke automatisk.

## Integrationsudvidelse · 14. oktober 2026

- 13 motortests består, herunder hierarki uden dobbelttælling, bevarelse af præcision, subtotalafvigelse på 75.960 kr. og accept efter rettelse. Subtotaltesten er en syntetisk v2-snapshotkontrol; den er ikke en ny fuld kontrol af Sorø-regnearket.
- API-test omfatter præcis cloududvælgelse, engangsbillet, afvisning efter ændret revision samt faktisk filovervågning med Python: valid fil → afvigende sum afvist → rettet fil accepteret og fejl ryddet. Ingen modelkald i denne test.
- Eksisterende Bluewater .sig læst lokalt: 177 poster, to hovedposter, 3.696.929 kr. Originalens SHA-256 er uændret. Dette er en filafstemning, ikke sammenligning med en kørende Sigma-visning.
- SigmaLiveBridge.cs kompileret med Windows .NET Framework C# til x86. Ét forbindelsesforsøg gav CO_E_CLASSSTRING: Sigma COM-klassen er ikke registreret på denne pc. Liveforbindelsen er derfor endnu ikke afprøvet i Sigma. Der blev ikke startet eller installeret Sigma.
- OpenAI/Claude API-adaptere verificeret med simulerede API-svar; firmalås og ingen fallback verificeret. Ingen rigtige cloudkald, ingen abonnementsforbindelse, ingen automatisk cloudtilstand.
- Seneste COM-bro bruger CLSID fra den udtrukne type library direkte, uden et gættet ProgID. Ny kompilering bestod; forbindelsesprobe gav MK_E_UNAVAILABLE, da ingen kørende Sigma er tilgængelig. Ingen COM-registrering blev ændret.
- Udvidelsen er testet i Codex' indbyggede browser: lokal/hybrid-valg, præcis forhåndsvisning af én valgt post og én kilde, synlig udbyder, deaktiveret afsendelse uden forbindelse. Ingen konsolfejl. Mobilbredde 390 px uden udvendigt vandret overflow. Skærmbillede: data/integration-preview.png. Ingen ekstern Playwright-fallback blev brugt.

## Nye kalkulationer og automatisk historik · 14. oktober 2026

- COM-broen kræver ikke længere et gemt filnavn. Identitet er pr. projektobjekt, så to nye projekter med samme titel holdes adskilt, og Gem/omdøb ikke skifter identitet. --self-test kører den faktiske serializer med hukommelsesfixtures: tom ny sag, første post, ny sag med samme titel, retur til tidligere sag, Gem/omdøb. Dette er ikke runtime-test af vendor-COM.
- Watchdog starter også livebroen skjult; begge processer er startet på denne pc. Broens status er fortsat MK_E_UNAVAILABLE, fordi Sigma ikke kører her.
- 14 motortests samt API-test består. API-test: lokal historieindeksering, tom ikke-gemt kalkulation → afventende, første regnvandspost → automatisk match, ny asfaltsag med samme titel → nyt match og gamle kilder fjernet. Det kørte uden browser og med modelautomatik slået fra. Seneste resultat blev gemt med korrekt revision.
- Lokal OneDrive-historik: 115 .sig-filer gennemgået, 93 kalkulationsfiler indekseret, 22 kopier samlet, ingen afvisninger. .sit-skabeloner og deaktiverede poster indgår ikke. Gemte priser bruges kun i hash til kopigenkendelse, ikke som godkendte priseksempler. Aktuelle filnavne og indeks medfølger ikke pakken.
- To konstruerede faglige søgninger mod det rigtige lokale indeks (regnvand/udgravning og asfalt/belægning) gav tre kandidater hver. Relevansen er endnu ikke vurderet af en tilbudsberegner. Tekstmatch er ikke en påstand om semantisk/faglig lighed.
- Den kørende lokale demo er opdateret og viser det nye historikpanel og 93 indekserede filer. Browserkontrol: ingen konsolfejl; en demonstrationssag får ingen virkelig historik automatisk knyttet til de syntetiske krav.

## Chatvisning · 14. oktober 2026

- Standardpanelet er en samtale, ikke en oversigt med primære faner. Kilder, afklaringer og indstillinger er flyttet til en menu. Skrivefeltet understøtter Enter og Shift+Enter.
- Backend gemmer sagsspecifik velkomst, søgestart, resultater, regelkontroller, spørgsmål og svar i en lokal journal. Gentagne identiske snapshots giver ingen ny søgebesked. API-testen verificerer også, at uændrede krav ikke gentages, samt at journalen kan læses tilbage fra disk og følger Gem/genstart på samme fil.
- Browser: localhost:4317/?panel=1. Menu åbnet/lukket, automatisk vurdering pauset til test og genaktiveret. Rigtigt spørgsmål til lokal Qwen9B fik svar med et genfundet SAB-citat. Genindlæsning beholdt ét spørgsmål og ét svar. Ingen relevante konsolfejl.
- Konstrueret separat server på port 4319: en ny tom sag modtog en tilbudspost og fik faktiske søgestart-/resultatbeskeder mod en konstrueret historikfil. Ingen virksomhedsdata blev brugt. Ved 440×900 var dokumentbredden 440 og skrivefeltets underkant 900. Midlertidig server ryddes automatisk op. Der påstås ikke ny runtime-test i Sigma.
- Endelig mobilkontrol på den nye chat: 440×900 og 390×844, ingen vandret overflow, skrivefeltets underkant følger viewportens underkant. Skærmbillede gemt uden for kildeprojektet: C:/Users/frede/.codex/visualizations/2026/10/08/01a11c73-6a1a-75b2-8c26-2dfc66f83ade/sigma-chat-panel.png. Browserens viewport er nulstillet. Automatisk AI-vurdering er genaktiveret efter testen. API-test med genindlæst journal består.


## Automatisk sagsmateriale (14. oktober 2026)
Når en gemt Sigma-kalkulation åbnes, søger assistenten lokalt i dens sagsmappe efter SAB, TAG, AAB, rettelsesblade og øvrigt navngivet udbudsmateriale. En undermappe kaldet Kalkulation/Beregning/Sigma kan føre søgningen op til sagsmappen. Ingen søgning på hele disken. En ugemt kalkulation eller en fælles tilbudsmappe kan kræve ét mappe-/filvalg i Kilder. Mapper med andre kalkulationer udelades.

PDF med tekst, DOCX og TXT læses. PDF kræver Python-pakken pypdf (allerede tilgængelig på denne pc). DOCX/TXT henviser til tekstafsnit, ikke opdigtede PDF-sider. Excel, tegninger, mailfiler og ZIP registreres kun som fundne. Scannede PDF-sider kræver OCR, som endnu ikke er integreret. Flere versioner kræver eksplicit valg; der gættes ikke på gældende udgave.

Grænser: dybde 3 undermapper, 300 filer, 30 MB pr. læst fil, op til 100 kildeafsnit samlet. Kilder genkontrolleres hvert minut og ved projektskift. Chatten viser fund og begrænsninger. Modelkonteksten er stadig et begrænset udvalg af uddrag og indebærer ikke fuld kontrol af materialet.

Historiske kandidater rangeres nu også efter genkendte arbejdsarter og sammenlignelige mængder/enheder fra Sigma-hierarkiet. Underliggende ressourcer tælles ikke dobbelt som aktivitetsmængder. Adgangsforhold, prisniveau, vundet/tabt og faktisk indtjening er stadig ukendte. Dette er deterministisk sammenligning, ikke ny modeltræning.

Verifikation: npm run build, npm test (15), node test-api.mjs samt python test-discovery.py (4). API-testen dækker automatisk tilknytning, ændret kildehash og eksplicit versionsvalg. Testene bruger syntetiske sager; live Sigma på den anden computer mangler fortsat afprøvning.
