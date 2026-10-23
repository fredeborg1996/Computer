# Sigma AI · installation og login

1. Arbejdsmappe: `C:\MAK-Sigma`. Serveren kræver Node 22+. Efter kildeopdatering køres `npm install` og `npm run build`; `jose` bruges til signaturkontrol af OpenAI-login.
2. Start serveren med `./Start-Demo.ps1 -NoBrowser -NoWatch`. Det starter ingen webvisning eller konkurrerende COM-bro. Serveren lytter kun på 127.0.0.1:4317. En allerede kørende server skal genstartes efter kodeopdateringen; genstart ikke Sigma for dette. Health angiver version `sigma-ai-chatgpt-1` for denne version.
3. I Sigmas AppScript IDE: stop den tidligere scriptkørsel, genåbn `C:\MAK-Sigma\Sigma-Native-AI.pas` fra disken og vælg Build og Run. Den tidligere version er kompileret, og panelet er åbnet af brugeren. Den nye dropdown/login-version skal kompileres igen. Åbn panelet via Værktøjer → Sigma AI.
4. Panelet har én dropdown: Lokal model, OpenAI eller Anthropic. Modellen vælges nedenunder. Ved OpenAI er listen begrænset til kontoens aktuelle modeller; lokal model og Anthropic kan redigeres. Ved OpenAI vælges Continue with ChatGPT. Gennemfør selv login, kontovalg og samtykke i OpenAI's officielle systembrowser. Ingen legitimationsoplysninger skrives i Sigma eller sendes gennem chatten.
5. Efter login vises kontostatus og kontoens tilgængelige modelnavne i Sigma. Vælg en model fra listen og klik Gem modelvalg. Login alene autoriserer ikke brug af abonnementet: den nødvendige tilladelse og kontoens berettigelse skal også være på plads. Der skiftes ikke automatisk til en API-nøgle ved fejl.
6. Skriv i Dit spørgsmål og klik Send. Chatten medtager automatisk afgrænsede uddrag fra den aktive sag, tidligere beskeder i samme samtale og lokale historikfund. Ved OpenAI sendes dette til den valgte ChatGPT-model. Der er ingen særskilt forhåndsvisning eller valg af ID'er. Materiale viser det tilgængelige grundlag. Login og modelvalg sender ikke kalkulationsmateriale.

Den beskyttede forbindelse gemmes i `data/chatgpt-connection/`, krypteret med Windows DPAPI for denne Windows-bruger. Kopiér ikke mappen til andre computere eller publicering. Ingen credentials fra Codex, ChatGPT-desktop eller andre apps læses. Log ud af ChatGPT afbryder brug af lokale tokens med det samme og forsøger fjernfrakobling; eventuel fejl vises.

Lokal model kræver Ollama og det præcise modelnavn, eksempelvis qwen3.5:9b. Anthropic kræver ANTHROPIC_API_KEY i serverens miljø. Den ældre OpenAI API-adapter kræver OPENAI_API_KEY og et eksplicit API-valg i backend. Nøgler må aldrig hardcodes, logges eller indtastes i chatten. SIGMA_LOCAL_ONLY=1 blokerer cloud/login.

Det gamle Open-SigmaPanel.vbs / Start-SigmaPanel.ps1 åbner separat Edge og er ikke det native panel. COM-broen er bygget men runtime-proben gav MK_E_UNAVAILABLE; den native integration anvender AppScript i stedet.

Brugerens rigtige kalkulation må kun læses. Felter/summer og tre vis/skjul-cyklusser skal stadig afstemmes; de er ikke bevist af automatiske tests. Se QA.md. Officiel loginvejledning: https://developers.openai.com/siwc/token-sharing-open-source/sign-in


Længere samtaler og materiale læses med Tidligere, Næste og Seneste. Sidetallet viser placeringen. Musehjul understøttes ikke pålideligt af Sigmas eksponerede tekstkontrol. Skrivefeltet kan navigeres med piletaster og Ctrl+Home/Ctrl+End.

## Fast tilføjelse ved hver Sigma-opstart

En scriptkørsel i Alt+F12-editoren er midlertidig. For at bevare Sigma AI-knappen efter genstart skal den native kode pakkes og installeres som en Sigma-tilføjelse én gang:

1. I AppScript-editoren vælges Tools → Create add-in bundle → New.
2. Brug navnet Sigma AI, et stabilt ID og tilføj kun C:\MAK-Sigma\Sigma-Native-AI.pas. Medtag ikke diagnosticeringsscripts, det gamle browserpanel, data eller tokens.
3. Byg og gem som C:\MAK-Sigma\Sigma-AI.sigmabundle. Gem også guidens projekt til senere opdateringer. En eventuel krypteringskode til bundlen er adskilt fra ChatGPT-login.
4. Indlæs den færdige .sigmabundle i Sigma ved at trække filen ind i Sigma-vinduet. Kontrollér derefter Filer → Indstillinger → Tilføjelser (Add-ins), og at Sigma AI er aktiv.
5. Gem eget arbejde, og genåbn Sigma, når det passer. Værktøjer → Sigma AI skal nu være tilgængelig uden editoren. Den lokale server skal også køre for at chatten virker.

Kontrol 20. oktober: Den lokale faste scriptliste er tom (Count=0); AutoRunScripts er allerede 1. En permanent bundle er endnu ikke bygget eller installeret. Computer Use læser Sigma/editoren, men dialogfokus og åbning af kildefilen fungerer ikke stabilt. Derfor er hverken installation eller genstartstest gennemført. Der er ikke ændret i sigma.ini eller genstartet Sigma.

Officiel vejledning: https://developer.sigmaestimates.com/docs/bundle/ og https://community.sigmaestimates.com/docs/exploring-the-settings-window/

Til en samlet lokal installation kan den færdige bundle pakkes med:

    .\Build-SigmaAI-Package.ps1

Det opretter Sigma-AI.sigmapackage med kun install.xml og Sigma-AI.sigmabundle. Installationen kopierer bundlen til Sigmas add-in-mappe; der er ingen automatisk genstart eller shellhandling. Scriptet bygger ikke Pascal-koden og installerer ikke selv pakken. Der er bestået en isoleret pakketest med syntetisk indhold; en rigtig bundle og installation udestår stadig.

## Opdatering til ydelsesrettelsen 1.0.1
Åbn det eksisterende bundleprojekt New bundle.sigmabundleproj via Add-in Bundle builder → Update og byg bundlen igen. Projektet peger på den opdaterede Sigma-Native-AI.pas og bevarer tilføjelsens identitet. Den installerede bundle ændres først, når en ny bundle er bygget og installeret. Derefter kan Build-SigmaAI-Package.ps1 køres med -BundlePath '.\New bundle.sigmabundle' -OutputPath '.\Sigma-AI-1.0.1.sigmapackage'.

Panelets Opdater-knap indlæser ændringer uden at scanne hele kalkulationen hvert få sekunder. Send indlæser altid et nyt grundlag. Den skjulte serverstarter bruger Start-SigmaAI-Server.vbs og Start-SigmaAI-Server.ps1 i C:\MAK-Sigma; behold begge filer ved lokal installation.
