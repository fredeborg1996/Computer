# MAK Sigma-assistent

Målet er en lokal, proaktiv tilbudsassistent ved siden af EG Sigma Estimates.

- Bevar eksisterende OpenClaw-økonomiopsætning, træningsforsøg og Ascencion-build uden ændringer.
- `npm run build`, `npm test`, `node test-api.mjs` er de relevante checks. Test API bruger midlertidig datamappe og port 4318; rigtige sagsdata skal ikke bruges som testfixture.
- `data/` er lokale virksomhedsdata og bridge-token. Læs ikke token højt, send ikke indhold til cloud/review-services og commit ikke mappen. Opret ikke screenshots af rigtigt materiale til offentlig brug.
- 9B-modellen er grundmodellen `qwen3.5:9b` via Ollama; LoRA-adapterne er ikke runtime-deployeret.
- Markér altid demodata, ikke-dækkende dokumentuddrag og uprøvede Sigma-dele. Syntetiske krav må aldrig knyttes til rigtige Sigma-sager.
- Modellen må foreslå og forklare. Mængder, summer, kildesporbarhed, lagring og gyldighed håndteres i kode. Manglende enhedsprisgrundlag må ikke blive til et godkendt resultat.
- Intet udbud afgives og ingen original kalkulation eller bilag godkendes automatisk.
- AppScript-prototypen skal kompileres og feltafstemmes i brugerens Sigma-version, før integrationen kan betegnes som testet. Højrestillet browserpanel er ikke et indbygget Sigma-dockpanel.

## GitHub-opdateringer

- Brugeren har bedt om at lægge integrationen i `fredeborg1996/Computer` og publicere efterfølgende opdateringer samme sted. Efter relevante ændringer: kør checks, byg og pak med Package-Demo.ps1, opdatér koden under `sigma-assistent-demo/` og downloadpakken `sigma-download/MAK-Sigma-latest.zip`. Opdatér versionsfilen med ZIP'ens SHA-256. Bekræft upload før du siger, at den nye version kan hentes.
- Repositoryet er offentligt. Publicér kun vores integrationskode og den eksplicit pakkede distribution. Aldrig `data/`, logfiler, OneDrive-filer, tokens, træningsdata eller Sigma-installationsfiler. Eksisterende andre projekter i repositoryet skal bevares.
- GitHub-pluginet kan bruges til commit/ref-opdatering, når lokal GitHub CLI ikke er logget ind. Ingen automatisk baggrundspush eller automatisk installation på bærbaren er etableret.
