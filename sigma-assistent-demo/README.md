# Sigma AI · lokal integration

Aktuel status 16. oktober 2026: Brugeren har kompileret AppScript, åbnet det native panel via Værktøjer → Sigma AI og bekræftet, at ChatGPT-login virker. Ny kilde bruger almindelig chat med én Send-knap, automatisk afgrænset sagskontekst og mere plads til status. Denne seneste Pascal-version kræver ny Build/Run. Tre toggle-cyklusser, feltafstemning og et rigtigt modelsvar er endnu ikke verificeret.

`Sigma-Native-AI.pas` er den native integration. Den gamle `Sigma-AI-menu.pas` og `Start-SigmaPanel.ps1` åbner separat Edge og er ikke den nye Sigma AI-knap.

## Start og opsætning

Se [INSTALLATION.md](INSTALLATION.md). Start kun den lokale server med `./Start-Demo.ps1 -NoBrowser -NoWatch`; den genbruger en fungerende server og kontrollerer portkonflikter. `Start-SigmaPanel.ps1` er kun den ældre separate visning.

Før AI kan bruges, kræves et aktivt, gemt modelvalg. Lokal tilstand bruger det præcise Ollama-modelnavn, eksempelvis `qwen3.5:9b`; LoRA-adaptere er ikke indlæst. Ved OpenAI: vælg Continue with ChatGPT, gennemfør selv login og samtykke på OpenAI's officielle side, og vælg en model fra kontoens viste modelkatalog. Loginbrowseren bruges kun til godkendelsen; chatten bliver i Sigma. Adgang til abonnementsforbrug afhænger af kontoens berettigelse og godkendte rettigheder. Se [OpenAI's loginvejledning](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).

Forbindelsen gemmes krypteret med Windows DPAPI for den aktuelle Windows-bruger under `data/chatgpt-connection/`. Der læses ingen credentials fra Codex eller andre apps. Login sender ingen kalkulationsdata. Når brugeren klikker Send, modtager den valgte model spørgsmålet, op til 40 poster og 6 dokumentuddrag (højst 12.000 tegn), korte samtaleuddrag og lokale historikresuméer. Originalfiler sendes ikke. Ved Log ud ryddes lokalt brugbare tokens; eventuelt manglende fjernfrakobling vises i status.

Anthropic bruger `ANTHROPIC_API_KEY` i serverens miljø. Den eksisterende OpenAI API-nøgleadapter er bevaret som eksplicit alternativ i backend; den native OpenAI-knap bruger ChatGPT-login. Ingen tavs overgang mellem kontologin og API-nøgle. `SIGMA_LOCAL_ONLY=1` forhindrer cloud og login.

Modelvalget gemmes lokalt i `data/model-settings.json`. Ældre installationer uden bekræftet valg skal vælge igen. Valg af cloud sender ikke i sig selv materiale. Den native chat sender først ved klik på Send og kræver ikke ekstra forhåndsvisning. De ældre preview-endpoints er bevaret til den separate webvisning.

## Data og begrænsninger

AppScript læser posthierarki, mængder og Sigmas evaluerede salgs-/kostbeløb. Serveren kontrollerer summer og undgår dobbelttælling. Manglende felter, deaktiverede linjer, mere end 1000 linjer og uforenelige summer afvises. Felterne skal stadig afstemmes i den installerede Sigma-version.

Samtaler og kilder er knyttet til sagsidentitet og revision. Native chat kører som asynkrone serverjob, så AppScript ikke venter på modelgenerering. Ved sagsskift må et gammelt svar ikke bruges i den nye sag. Serveren har ét aktivt sagsgrundlag.

Sagsmateriale findes lokalt ved gemte kalkulationer. PDF med tekst, DOCX og TXT understøttes med begrænsede uddrag; scannede PDF kræver OCR, som ikke er integreret. Flere dokumentversioner kræver valg. Historiske kandidater er sammenligninger, ikke godkendte priser eller efterkalkulationer. Modellen godkender aldrig original kalkulation, bilag eller tilbud automatisk.

COM-broen kan bygges til x86, men forbindelsesproben mod denne åbne Sigma gav `0x800401E3 (MK_E_UNAVAILABLE)`. Det er en uafklaret liveforbindelse, ikke et bevis på at Sigma er fraværende. Native AppScript er den nye integrationsvej.

## Kontrol

`npm test`, `npm run build`, `node test-api.mjs`, `python test-discovery.py`. API-test bruger ledig port, midlertidige data og tom `SIGMA_HISTORY_ROOT`; ingen rigtige cloudkald. Se [QA.md](QA.md) for konkret verificeret status og udestående Sigma-test. `data/`, tokens, virksomhedsdata og skærmbilleder må ikke publiceres.


