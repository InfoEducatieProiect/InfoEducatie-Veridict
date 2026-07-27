DOCUMENTAȚIA PROIECTULUI VERIDICT

Veridict este o platformă pentru școli care ajută profesorii să verifice integritatea academică a lucrărilor. Profesorii creează teme, elevii încarcă lucrări (fișiere .txt sau .docx), iar aplicația analizează automat fiecare lucrare pentru a găsi semne de copiat: plagiat între elevi, text scris de inteligența artificială, schimbări suspecte de stil și texte copiate de pe internet.

Sloganul aplicației: „De la suspiciune, la certitudine matematică."

Acest document explică ce face aplicația, ce algoritmi stau în spatele fiecărei funcții și ce tehnologii folosește. Este scris pe înțelesul tuturor, dar intră și în detaliile metodelor, ca cititorul să înțeleagă cum ajunge aplicația la fiecare rezultat.


CUPRINS

   1. Ce este Veridict și ce problemă rezolvă
   2. Cine folosește aplicația (cele trei tipuri de utilizatori)
   3. Ce poate face aplicația
   4. Cele patru analize și algoritmii din spate
   5. Tabel-rezumat: algoritm + tehnologie pentru fiecare funcție
   6. Teme vs. Teste — cum diferă analiza stilului
   7. Confidențialitatea elevilor
   8. Ce tehnologii folosește aplicația
   9. Ce informații sunt păstrate (baza de date)
   10. Cum „navighezi" prin aplicație (adresa din browser)
   11. Limba aplicației (română / engleză)
   12. Cum pornești aplicația
   13. Lucruri importante de știut


1. CE ESTE VERIDICT ȘI CE PROBLEMĂ REZOLVĂ

Când un profesor primește zeci de lucrări, este aproape imposibil să verifice manual dacă:

   doi elevi au copiat unul de la altul,
   un text a fost generat de un program de inteligență artificială (de exemplu ChatGPT),
   un elev a scris brusc într-un stil complet diferit de al lui obișnuit,
   textul a fost copiat de pe internet.

Veridict face aceste verificări automat și îi prezintă profesorului rezultatele clar, cu procente și grafice. Ideea centrală este să transforme o bănuială („parcă lucrarea asta e suspectă") într-o dovadă măsurabilă, bazată pe cifre.


2. CINE FOLOSEȘTE APLICAȚIA (CELE TREI TIPURI DE UTILIZATORI)

Aplicația are trei tipuri de utilizatori.

Administratorul

Este persoana care furnizează conturile pentru elevi și profesori. În Veridict nu există înregistrare liberă — nu îți poți face singur cont. Accesul este restricționat („Acces restricționat — Conturi autorizate"), iar administratorul este cel care:

   creează conturile elevilor și profesorilor și le oferă datele de conectare,
   asociază fiecare cont cu rolul corect (elev sau profesor) și cu clasa potrivită,
   gestionează aceste conturi în timp.

Administratorul lucrează „în spatele scenei" (la nivelul sistemului care ține conturile și datele), fără un ecran separat în interfața obișnuită a aplicației.

Profesorul

Creează teme, vede lucrările predate și pornește analiza. Are acces la toate rezultatele și rapoartele detaliate.

Elevul

Vede temele pe care le are de predat, încarcă lucrarea și își vede istoricul predărilor. Elevul nu vede niciun scor sau raport de analiză (vezi capitolul 7).

La conectare, fiecare persoană intră pe portalul potrivit (Elev sau Profesor). Aplicația verifică rolul contului: un elev nu se poate conecta pe portalul de profesor și invers.


3. CE POATE FACE APLICAȚIA

Pentru profesor

   Creează o temă pentru o anumită clasă, cu titlu, cerință, detalii, termen-limită (deadline) și tip: Temă (temă de casă obișnuită) sau Test.

   Vede toate lucrările predate pentru fiecare temă, într-un tabel.

   Pornește analiza cu un singur buton. Aplicația procesează toate lucrările și afișează, pentru fiecare elev: scorul AI, similaritatea cu colegii și abaterea de stil.

   Intră în detaliu pe fiecare elev (butonul „Detalii"), unde găsește un panou de analiză cu mai multe secțiuni: graficul de similaritate cu colegii, „radarul" stilometric, clasificarea AI, scanarea web globală și graficul de integritate al întregii clase.

   Citește lucrarea oricărui elev, direct în aplicație.

Pentru elev

   Vede temele active ale clasei și termenele-limită.

   Încarcă lucrarea (fișier .txt sau .docx), cu o previzualizare înainte de trimitere.

   Vede istoricul lucrărilor trimise, cu un statut simplu: „Trimis" sau „În Evaluare".


4. CELE PATRU ANALIZE ȘI ALGORITMII DIN SPATE

Aici stă „inteligența" aplicației. Pentru fiecare lucrare se fac patru verificări diferite. Mai jos, fiecare are trei părți: ce face, cum funcționează algoritmul și ce tehnologie îl rulează.


a) Plagiat între elevi (similaritatea)

Ce face: compară lucrările elevilor între ele și găsește perechile suspecte, evidențiind exact frazele comune.

Cum funcționează algoritmul: aplicația folosește două metode clasice de comparare a textelor, apoi le combină.

   1. Similaritatea Cosinus (pe vocabular).
      Fiecare lucrare este transformată într-un „profil de frecvențe": se numără de câte ori apare fiecare cuvânt. Acest profil poate fi văzut ca un vector (o săgeată) într-un spațiu cu multe dimensiuni. Similaritatea Cosinus măsoară unghiul dintre vectorii a două lucrări:

         formula este produsul scalar / (lungimea vectorului 1 × lungimea vectorului 2), cu rezultat între 0 și 1 (0 = complet diferite, 1 = identice ca distribuție de cuvinte);
         pentru viteză, se folosesc „profiluri rare" (se parcurg doar cuvintele care apar efectiv), nu tot vocabularul clasei;
         pragul de suspiciune implicit este 0,45; perechile cu asemănare ≥ 50% devin muchii în graficul de integritate al clasei.

   2. Similaritatea Jaccard (pe expresii / „shingles").
      Textul este tăiat în grupuri de câte 4 cuvinte consecutive (numite shingles). Jaccard compară seturile de astfel de grupuri ale celor două lucrări:

         formula este câte grupuri au în comun / câte grupuri au în total (intersecție / reuniune), exprimată în procente;
         această metodă prinde copierea de fraze întregi, chiar și când vocabularul general diferă.

   3. Combinarea și evidențierea frazelor.
      Similaritatea unei perechi este, în esență, cea mai mare dintre cele două semnale. Separat, un modul de detectare a frazelor („ideatic similare") găsește pasajele comune, care sunt apoi colorate în ecranul de comparație una-lângă-alta.

Tehnologia: cod TypeScript pur (motorul din lib/analysis/), fără dependențe externe — rulează foarte rapid pentru o clasă întreagă.


b) Detectarea textului scris de inteligența artificială

Ce face: estimează, printr-un procent (scorul AI), cât de probabil este ca textul să fi fost generat de un program AI. Funcționează în română și engleză.

Cum funcționează algoritmul: este un ansamblu de trei semnale care sunt combinate cu ponderi ce se adaptează la limbă.

   1. Semnalul R — un model neural (clasificator RoBERTa).
      Un model de inteligență artificială pre-antrenat, yaya36095/xlm-roberta-text-detector (bazat pe XLM-RoBERTa, un model multilingv), care spune cât de „artificial" pare textul. Observație importantă: pentru textele în română, acest model tinde să dea scoruri foarte mari pentru aproape orice text, deci nu este de încredere singur — de aceea i se dă o pondere mică pe română.

   2. Semnalul P — perplexitatea (doar pentru română).
      Se folosește un model de limbă românesc, dumitrescustefan/bert-base-romanian-cased-v1 (un BERT pentru română, ~125 MB), pentru a măsura cât de „previzibil" este textul: modelul ascunde pe rând câte un cuvânt și încearcă să-l ghicească, calculând surpriza medie și variația surprizei la nivel de cuvânt. Textul generat de AI este de obicei foarte previzibil (surpriză mică, uniformă). Acest semnal există doar pe calea Python (varianta de rezervă în TypeScript nu îl are).

   3. Semnalul S — structura textului (stilometrie de suprafață).
      Un scor construit din mai mulți indicatori:

         Burstiness = deviația standard a lungimii propozițiilor. Oamenii scriu neregulat (propoziții scurte și lungi amestecate → burstiness mare); AI-ul scrie uniform (burstiness mic).
         Amprente (fraze-clișeu) = numărul de expresii tipic „AI" găsite în text, dintr-un dicționar bilingv (ex.: „un rol crucial", „în concluzie", „one of the most"). Se caută pe cuvinte întregi și fără diacritice, iar contribuția lor crește logaritmic (efect de saturație).
         Diversitatea vocabularului (TTR) și diversitatea semnelor de punctuație — AI-ul folosește adesea vocabular și punctuație mai uniforme.

Combinarea (fuziunea): scorul final = R × pondere_R + P × pondere_P + S × pondere_S, unde ponderile se schimbă după limbă (pe română se sprijină pe P și S; pe engleză se poate baza mai mult pe R). Există și „scuturi" anti-eroare: dacă textul e clar uman (burstiness mare + puține clișee), scorul R este plafonat, ca să nu se acuze pe nedrept un text literar sau enciclopedic. Rezultatul final este limitat la intervalul 0–99,4%.

Tehnologia: script Python scripts/ai_detector.py cu bibliotecile transformers / torch (modelele neural). Dacă Python nu e disponibil, aplicația folosește o variantă de rezervă în TypeScript (lib/hybrid-ai-detection.ts) care păstrează semnalul structural, dar fără perplexitate (scoruri mai puțin precise).


c) Stilometria — „amprenta de scris"

Ce face: măsoară stilul de scriere al elevului și îl compară cu stilul lui obișnuit, ca să prindă schimbări suspecte.

Cum funcționează algoritmul: din fiecare text se extrag cinci indicatori:

   TTR (bogăția vocabularului) — câte cuvinte diferite raportat la total;
   ASL (lungimea medie a propozițiilor) — câte cuvinte are, în medie, o propoziție;
   densitatea verbelor, densitatea adjectivelor — cât de des apar;
   densitatea semnelor de punctuație — semne la 100 de cuvinte.

Cei cinci indicatori formează „amprenta" elevului. Compararea cu referința (stilul obișnuit) se face cu o distanță Manhattan normalizată:

   deviația = ( 1/5 × Σ |valoare_curentă − valoare_referință| / max(valoare_curentă, valoare_referință) ) × 100

Pe scurt: pentru fiecare dintre cei 5 indicatori se calculează cât de mult diferă (proporțional), se face media și se transformă în procent. Dacă deviația depășește un prag (în jur de 38–40%), lucrarea este marcată cu „Abatere Stilistică".

Tehnologia: script Python scripts/analiza_stilometrie.py cu spaCy și modelul de limbă română ro_core_news_sm, care recunoaște corect părțile de vorbire (verbe, adjective). Varianta de rezervă în TypeScript aproximează verbele/adjectivele după terminații de cuvinte, când spaCy nu e disponibil.


d) Plagiat de pe internet (scanarea web)

Ce face: caută pe internet dacă textul a fost copiat de undeva și raportează sursele.

Cum funcționează algoritmul:

   1. Găsirea surselor — se folosește Gemini Flash (Google) împreună cu Google Search grounding: modelul caută pe web și întoarce linkuri către posibile surse. Aplicația alege o frază distinctivă din lucrare pentru o căutare mai țintită, apoi extrage URL-urile din răspuns (rezolvând și linkurile „ambalate" / de redirecționare).

   2. Descărcarea paginilor — sursele găsite sunt descărcate și curățate de cod (cu BeautifulSoup), rămânând doar textul.

   3. Compararea — între lucrare și fiecare sursă se calculează un scor hibrid = maximul dintre:

         similaritatea Cosinus (pe vocabular, ca la punctul a), și
         containment pe n-grame — se verifică ce fracțiune din grupurile de 2, 3 și 4 cuvinte ale lucrării apar în sursă. Această metodă prinde bine copierea pe porțiuni.

Rezultatul include un verdict, scorul maxim de potrivire, sursa principală și lista de linkuri suspecte. Totul se salvează în baza de date, ca să nu se refacă scanarea de fiecare dată (profesorul poate totuși cere o rescanare).

Tehnologia: script Python scripts/detectie_plagiat_gemini.py cu biblioteca google-genai (Gemini), requests și BeautifulSoup (descărcarea și curățarea paginilor). Necesită o cheie GEMINI_API_KEY.

De ce Python pentru analize? Partea web a aplicației (ce vede utilizatorul) trimite textul lucrării către aceste scripturi Python, care fac „calculele grele" și returnează un rezultat în format JSON. Astfel, modelele de inteligență artificială și analiza de limbaj rulează separat, iar interfața rămâne rapidă.


5. TABEL-REZUMAT: ALGORITM + TEHNOLOGIE PENTRU FIECARE FUNCȚIE

   Plagiat între elevi
      Algoritm / metodă: similaritate Cosinus (vectori de frecvențe) + Jaccard pe shingles de 4 cuvinte; evidențierea frazelor comune
      Tehnologia: TypeScript (lib/analysis/)

   Detectare text AI
      Algoritm / metodă: ansamblu de 3 semnale — clasificator RoBERTa (yaya36095/xlm-roberta-text-detector) + perplexitate BERT-RO (dumitrescustefan/bert-base-romanian-cased-v1) + scor structural (burstiness, fraze-clișeu, TTR, punctuație), cu ponderi adaptive pe limbă
      Tehnologia: Python (ai_detector.py, transformers/torch); rezervă TypeScript

   Stilometrie
      Algoritm / metodă: 5 indicatori de stil + distanță Manhattan normalizată față de referință
      Tehnologia: Python (analiza_stilometrie.py, spaCy ro_core_news_sm)

   Plagiat web
      Algoritm / metodă: Gemini 2.5 Flash + Google Search grounding pentru surse, apoi Cosinus + containment pe n-grame (2/3/4)
      Tehnologia: Python (detectie_plagiat_gemini.py, google-genai)

   Referință de stil (test)
      Algoritm / metodă: medie mobilă reală — nou = (vechi × n + curent) / (n + 1)
      Tehnologia: TypeScript + baza de date

   Interfața web
      Algoritm / metodă: componente și ecrane, încărcare de date
      Tehnologia: Next.js + React, SWR, Tailwind

   Conturi și date
      Algoritm / metodă: autentificare, roluri, stocare
      Tehnologia: Supabase


6. TEME VS. TESTE — CUM DIFERĂ ANALIZA STILULUI

Temele și testele se comportă la fel în aproape toate privințele. Singura diferență este la stilometrie (amprenta de scris):

   La o temă de casă: stilul lucrării se compară cu referința (stilul obișnuit al elevului), iar aplicația arată cât de mult diferă. Referința rămâne neschimbată.

   La un test: pornind de la ideea că un test se face în clasă, sub supraveghere, textul este considerat „autentic". De aceea, stilul testului devine noua referință pentru acel elev — punctul de comparație pentru temele viitoare.

Dacă un elev dă mai multe teste, referința se calculează ca o medie a tuturor testelor (fiecare test contează în mod egal), după formula:

   referință_nouă = ( referință_veche × n + valorile_testului_curent ) / ( n + 1 )

unde n este numărul de teste luate deja în calcul. Astfel, un singur test „ciudat" nu strică referința (spre deosebire de o medie care ar da toată greutatea ultimului test), iar comparațiile ulterioare rămân corecte și evită acuzațiile nedrepte.


7. CONFIDENȚIALITATEA ELEVILOR

Aceasta este o regulă strictă a aplicației: ecranul elevului nu afișează niciodată scoruri AI, procente de plagiat, grafice sau alerte de analiză.

Un elev vede doar dacă lucrarea a fost primită și statutul ei:

   „Trimis" — lucrarea a fost predată,
   „În Evaluare" — lucrarea încă nu a fost analizată.

Rezultatele analizei rămân exclusiv pentru profesor. Această regulă este respectată peste tot în aplicație.


8. CE TEHNOLOGII FOLOSEȘTE APLICAȚIA

Pe scurt, ce „unelte" stau la baza aplicației și la ce folosește fiecare.

   Next.js (cu React)
      „Scheletul" aplicației web — paginile, ecranele și logica din browser, plus rutele de server care pornesc analizele.

   Supabase
      Ține baza de date (unde se salvează totul) și gestionează conturile și autentificarea (login/logout, roluri). Aici lucrează și administratorul cu conturile.

   Tailwind CSS + shadcn/ui
      Aspectul vizual: culori, butoane, tabele, ferestre — partea care face aplicația să arate modern și îngrijit.

   Framer Motion
      Animațiile fine (tranziții între ecrane, apariții line).

   SWR
      Încarcă datele din baza de date și le ține actualizate pe ecran, cu memorare inteligentă („cache").

   Recharts
      Desenează graficele (distribuția scorurilor, radarul de stil).

   mammoth.js
      Transformă fișierele .docx în text simplu, direct în browser, când elevul încarcă o lucrare.

   Python + spaCy (ro_core_news_sm)
      Analiza de limbaj pentru stilometrie (recunoaște verbe, adjective, propoziții în română).

   transformers / torch
      Rulează cele două modele de inteligență artificială pentru detectarea textului generat de AI:
         yaya36095/xlm-roberta-text-detector (XLM-RoBERTa) — clasificatorul „uman vs. AI";
         dumitrescustefan/bert-base-romanian-cased-v1 (BERT românesc) — pentru perplexitate (cât de previzibil e textul).

   Gemini (Google) + google-genai
      Căutarea și analiza surselor de pe internet pentru plagiatul web. Modelul folosit: gemini-2.5-flash cu Google Search grounding.

   requests + BeautifulSoup
      Descarcă paginile web găsite și extrag textul curat pentru comparație.

Cum comunică cele două lumi: interfața web (TypeScript) și analizele grele (Python) vorbesc printr-un protocol simplu — aplicația trimite scriptului textul lucrării „la intrare", iar scriptul răspunde cu un rezultat în format JSON „la ieșire". Analiza pentru toată clasa (detectare AI + similaritate + stilometrie) este pornită dintr-o singură cerere și transmite progresul în timp real, ca profesorul să vadă o bară care avansează.


9. CE INFORMAȚII SUNT PĂSTRATE (BAZA DE DATE)

Baza de date este locul unde se salvează totul. Principalele categorii de informații:

   Profiluri (conturi)
      Fiecare cont: rolul (elev sau profesor), numele afișat și clasa din care face parte. Aceste conturi sunt create de administrator.

   Clase
      Clasele din școală (de ex. „12B").

   Teme
      Titlul, cerința, detaliile, termenul-limită, clasa țintă și tipul (temă sau test).

   Lucrări predate
      Cine a predat, la ce temă, numele fișierului, textul lucrării și dacă a fost analizată.

   Rezultatele analizei
      Pentru fiecare lucrare: scorul AI, similaritatea cu colegii, abaterea de stil și cei cinci indicatori de stilometrie.

   Perechile suspecte
      Elevii între care s-a găsit asemănare mare, împreună cu frazele comune.

   Referințele de stil
      „Amprenta de scris" obișnuită a fiecărui elev și câte teste au contribuit la ea.

   Sursele web
      Linkurile găsite la scanarea de plagiat pe internet, salvate pentru fiecare lucrare.


10. CUM „NAVIGHEZI" PRIN APLICAȚIE (ADRESA DIN BROWSER)

Aplicația ține minte unde te afli chiar în adresa din bara browserului. Asta aduce trei avantaje practice:

   Reîmprospătarea paginii nu te aruncă înapoi — dacă profesorul studiază raportul unui elev și reîncarcă pagina din greșeală, revine exact unde era.

   Butonul „Înapoi" al browserului funcționează logic — te duce cu un nivel mai sus (de la raportul elevului, înapoi la lista lucrărilor), nu afară din aplicație.

   Poți da mai departe un link — profesorul poate copia adresa și o poate trimite unui coleg, iar acela ajunge direct la același raport (dacă are drept de acces).

Practic, adresa se schimbă pe măsură ce intri mai adânc: de la lista de teme, la o temă anume, la un anumit elev, până la o anumită secțiune din raportul lui.


11. LIMBA APLICAȚIEI (ROMÂNĂ / ENGLEZĂ)

Aplicația este în întregime în română, dar are un buton de schimbare a limbii în engleză. Toate textele afișate sunt luate din două „dicționare" (unul român, unul englez), astfel încât întreaga interfață se traduce dintr-o singură apăsare. Preferința de limbă este ținută minte între vizite.


12. CUM PORNEȘTI APLICAȚIA

Pentru cineva care vrea să ruleze aplicația pe calculatorul propriu, pașii de bază sunt:

   1. Instalează componentele aplicației web
      pnpm install

   2. Instalează componentele de analiză (Python) — o singură dată
      pip install spacy requests beautifulsoup4 google-genai transformers torch sentencepiece langdetect numpy
      python -m spacy download ro_core_news_sm

   3. Pornește aplicația în modul dezvoltare
      pnpm dev

Este nevoie și de un fișier de configurare (.env.local) cu:

   adresa și cheia bazei de date Supabase,
   o cheie pentru Gemini (Google), necesară scanării web.

Odată pornită, aplicația se deschide în browser, iar utilizatorii se conectează cu contul primit de la administrator.


13. LUCRURI IMPORTANTE DE ȘTIUT

   Conturile sunt oferite de administrator. Nu există înregistrare liberă; fiecare elev și profesor primește un cont creat și configurat de administrator.

   Confidențialitatea elevilor este obligatorie. Nicio informație de analiză (scoruri, procente, grafice) nu trebuie să ajungă vreodată pe ecranul elevului.

   Analiza „grea" se face cu Python. Dacă partea Python nu este instalată corect (de exemplu, lipsește modelul de limbă română pentru spaCy sau cheia Gemini), analizele respective nu vor funcționa, chiar dacă restul aplicației merge. În cazul detectării AI există o variantă de rezervă în TypeScript, dar mai puțin precisă (fără perplexitate).

   Testele modelează referința de stil. Un test bine dat ajută aplicația să înțeleagă cum scrie de obicei elevul, ceea ce face mai precise verificările de la temele viitoare.

   Rezultatele sunt un ajutor, nu o sentință. Mai ales la plagiatul web, aplicația recomandă verificarea manuală a linkurilor: sistemul semnalează corelații și surse posibile, dar decizia finală rămâne a profesorului.


Acest document descrie aplicația la momentul redactării. Când se schimbă modul de funcționare, este bine să fie actualizat și el.
