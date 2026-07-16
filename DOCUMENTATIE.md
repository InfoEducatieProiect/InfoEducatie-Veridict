# Documentația proiectului Veridict

> **Veridict** este o platformă pentru școli care ajută profesorii să verifice integritatea academică a lucrărilor. Profesorii creează teme, elevii încarcă lucrări (fișiere `.txt` sau `.docx`), iar aplicația analizează automat fiecare lucrare pentru a găsi semne de copiat: plagiat între elevi, text scris de inteligența artificială, schimbări suspecte de stil și texte copiate de pe internet.
>
> Sloganul aplicației: *„De la suspiciune, la certitudine matematică.”*

Acest document explică, pe înțelesul tuturor, **ce face** aplicația, **ce tehnologii folosește** și **cum funcționează** pe dinăuntru — fără a intra în detalii de programare.

---

## Cuprins

1. [Ce este Veridict și ce problemă rezolvă](#1-ce-este-veridict-și-ce-problemă-rezolvă)
2. [Cine folosește aplicația (cele trei tipuri de utilizatori)](#2-cine-folosește-aplicația-cele-trei-tipuri-de-utilizatori)
3. [Ce poate face aplicația](#3-ce-poate-face-aplicația)
4. [Cele patru tipuri de analiză (explicate simplu)](#4-cele-patru-tipuri-de-analiză-explicate-simplu)
5. [Teme vs. Teste — cum diferă analiza stilului](#5-teme-vs-teste--cum-diferă-analiza-stilului)
6. [Confidențialitatea elevilor](#6-confidențialitatea-elevilor)
7. [Ce tehnologii folosește aplicația](#7-ce-tehnologii-folosește-aplicația)
8. [Ce informații sunt păstrate (baza de date)](#8-ce-informații-sunt-păstrate-baza-de-date)
9. [Cum „navighezi” prin aplicație (adresa din browser)](#9-cum-navighezi-prin-aplicație-adresa-din-browser)
10. [Limba aplicației (română / engleză)](#10-limba-aplicației-română--engleză)
11. [Cum pornești aplicația](#11-cum-pornești-aplicația)
12. [Lucruri importante de știut](#12-lucruri-importante-de-știut)

---

## 1. Ce este Veridict și ce problemă rezolvă

Când un profesor primește zeci de lucrări, este aproape imposibil să verifice manual dacă:
- doi elevi au copiat unul de la altul,
- un text a fost generat de un program de inteligență artificială (de exemplu ChatGPT),
- un elev a scris brusc într-un stil complet diferit de al lui obișnuit,
- textul a fost copiat de pe internet.

**Veridict face aceste verificări automat** și îi prezintă profesorului rezultatele clar, cu procente și grafice. Ideea centrală este să transforme o bănuială („parcă lucrarea asta e suspectă”) într-o dovadă măsurabilă, bazată pe cifre.

---

## 2. Cine folosește aplicația (cele trei tipuri de utilizatori)

Aplicația are **trei tipuri de utilizatori**:

### 🛠️ Administratorul
Este persoana care **furnizează conturile** pentru elevi și profesori. În Veridict **nu există înregistrare liberă** — nu îți poți face singur cont. Accesul este restricționat („Acces restricționat — Conturi autorizate”), iar administratorul este cel care:
- creează conturile elevilor și profesorilor și le oferă datele de conectare,
- asociază fiecare cont cu rolul corect (elev sau profesor) și cu clasa potrivită,
- gestionează aceste conturi în timp.

Administratorul lucrează „în spatele scenei” (la nivelul sistemului care ține conturile și datele), fără un ecran separat în interfața obișnuită a aplicației. Practic, el se asigură că fiecare elev și profesor are un cont valid și corect configurat.

### 👨‍🏫 Profesorul
Creează teme, vede lucrările predate și pornește analiza. Are acces la toate rezultatele și rapoartele detaliate.

### 🎓 Elevul
Vede temele pe care le are de predat, încarcă lucrarea și își vede istoricul predărilor. **Elevul nu vede niciun scor sau raport de analiză** (vezi [capitolul 6](#6-confidențialitatea-elevilor)).

> La conectare, fiecare persoană intră pe portalul potrivit (Elev sau Profesor). Aplicația verifică rolul contului: un elev nu se poate conecta pe portalul de profesor și invers.

---

## 3. Ce poate face aplicația

### Pentru profesor
- **Creează o temă** pentru o anumită clasă, cu titlu, cerință, detalii, termen-limită (deadline) și **tip**: *Temă* (temă de casă obișnuită) sau *Test*.
- **Vede toate lucrările** predate pentru fiecare temă, într-un tabel.
- **Pornește analiza** cu un singur buton. Aplicația procesează toate lucrările și afișează, pentru fiecare elev: scorul AI, similaritatea cu colegii și abaterea de stil.
- **Intră în detaliu pe fiecare elev** (butonul „Detalii”), unde găsește un panou de analiză cu mai multe secțiuni:
  - graficul de similaritate cu colegii,
  - „radarul” stilometric (amprenta de scris),
  - clasificarea AI,
  - scanarea web globală (căutarea pe internet),
  - graficul de integritate al întregii clase.
- **Citește lucrarea** oricărui elev, direct în aplicație.

### Pentru elev
- **Vede temele active** ale clasei și termenele-limită.
- **Încarcă lucrarea** (fișier `.txt` sau `.docx`), cu o previzualizare înainte de trimitere.
- **Vede istoricul** lucrărilor trimise, cu un statut simplu: „Trimis” sau „În Evaluare”.

---

## 4. Cele patru tipuri de analiză (explicate simplu)

Aici stă „inteligența” aplicației. Pentru fiecare lucrare se fac patru verificări diferite.

### a) Plagiat între elevi (similaritatea)
Aplicația compară lucrările elevilor **între ele** și caută pasaje comune. Folosește două metode complementare:
- **Potrivirea de expresii (Jaccard):** cât de multe grupuri de cuvinte apar identic în ambele lucrări. Dacă două lucrări au multe fraze la fel, e semn de copiat.
- **Asemănarea de vocabular (Cosinus):** cât de asemănătoare sunt cele două texte ca „amprentă” de cuvinte folosite, chiar dacă frazele nu sunt identice.

Când două lucrări depășesc un anumit prag de asemănare, aplicația le marchează ca **pereche suspectă** și evidențiază exact frazele comune, ca profesorul să le poată compara una lângă alta.

### b) Detectarea textului scris de inteligența artificială
Aplicația estimează cât de probabil este ca textul să fi fost generat de un program AI (ChatGPT și altele). Se uită la mai multe semnale:
- un **model de inteligență artificială** antrenat să recunoască texte generate automat,
- **ritmul textului** — oamenii scriu neregulat (propoziții scurte și lungi amestecate), iar AI-ul tinde să scrie foarte uniform,
- **expresii tipice** pe care AI-ul le folosește des.

Rezultatul este un **scor AI** (un procent). Cu cât e mai mare, cu atât e mai probabil ca textul să fie scris de o mașină. Aplicația funcționează atât în română, cât și în engleză.

### c) Stilometria — „amprenta de scris”
Fiecare persoană are un stil propriu de a scrie. Stilometria măsoară acest stil prin cinci indicatori:
- **bogăția vocabularului** (câte cuvinte diferite folosește),
- **lungimea medie a propozițiilor**,
- **cât de des folosește verbe**,
- **cât de des folosește adjective**,
- **cât de des folosește semne de punctuație**.

Aplicația compară stilul lucrării curente cu **stilul obișnuit** al acelui elev (numit „referință” sau *baseline*). Dacă apare o abatere mare — de exemplu, un elev care scrie de obicei simplu predă brusc un text foarte elaborat — analiza o semnalează ca suspectă.

### d) Plagiat de pe internet (scanarea web)
Aplicația caută pe internet dacă textul a fost copiat de undeva. Pentru asta folosește **inteligența artificială Google (Gemini)** împreună cu **căutarea Google**: găsește pagini web care ar putea fi surse, le compară cu lucrarea și raportează un verdict, un procent de potrivire și lista de linkuri suspecte. Rezultatele sunt salvate, ca să nu fie nevoie să se refacă căutarea de fiecare dată (dar profesorul poate cere o rescanare).

---

## 5. Teme vs. Teste — cum diferă analiza stilului

Temele și testele se comportă la fel în aproape toate privințele. **Singura diferență este la stilometrie** (amprenta de scris):

- **La o temă de casă:** stilul lucrării se **compară** cu referința (stilul obișnuit al elevului), iar aplicația arată cât de mult diferă. Referința rămâne neschimbată.
- **La un test:** pornind de la ideea că un test se face în clasă, sub supraveghere, textul este considerat „autentic”. De aceea, stilul testului **devine noua referință** pentru acel elev — punctul de comparație pentru temele viitoare.

Dacă un elev dă mai multe teste, referința se calculează ca o **medie a tuturor testelor** (fiecare test contează în mod egal). Astfel, un singur test „ciudat” nu strică referința, iar comparațiile ulterioare sunt corecte și evită acuzațiile nedrepte.

---

## 6. Confidențialitatea elevilor

Aceasta este o **regulă strictă** a aplicației: ecranul elevului **nu afișează niciodată** scoruri AI, procente de plagiat, grafice sau alerte de analiză.

Un elev vede doar dacă lucrarea a fost primită și statutul ei:
- **„Trimis”** — lucrarea a fost predată,
- **„În Evaluare”** — lucrarea încă nu a fost analizată.

Rezultatele analizei rămân **exclusiv** pentru profesor. Această regulă este respectată peste tot în aplicație.

---

## 7. Ce tehnologii folosește aplicația

Pe scurt, ce „unelte” stau la baza aplicației și la ce folosește fiecare:

| Tehnologie | La ce folosește (pe înțelesul tuturor) |
|---|---|
| **Next.js** (cu React) | „Scheletul” aplicației web — se ocupă de paginile, ecranele și logica din browser. |
| **Supabase** | Ține **baza de date** (unde se salvează totul) și gestionează **conturile și autentificarea** (login/logout, roluri). Aici lucrează și administratorul cu conturile. |
| **Tailwind CSS + shadcn/ui** | Aspectul vizual: culori, butoane, tabele, ferestre — partea care face aplicația să arate modern și îngrijit. |
| **Framer Motion** | Animațiile fine (tranziții între ecrane, apariții line). |
| **SWR** | Încarcă datele rapid din baza de date și le ține actualizate pe ecran. |
| **Recharts** | Desenează graficele (distribuția scorurilor, radarul de stil). |
| **mammoth.js** | Transformă fișierele `.docx` în text simplu, direct în browser, când elevul încarcă o lucrare. |
| **Python + spaCy** | Analiza limbajului pentru stilometrie (spaCy este un instrument specializat pe limbaj, cu suport pentru română). |
| **Gemini (Google) + Căutarea Google** | Scanarea internetului pentru plagiat web. |
| **Modele de inteligență artificială (transformers/torch)** | Recunoașterea textelor generate de AI. |

Aplicația combină deci **partea web** (ce vede utilizatorul) cu **partea de analiză** (scripturi Python care fac calculele grele „în spate”). Ecranul îi trimite textul lucrării, scriptul face analiza și returnează rezultatul, care apoi se salvează și se afișează.

---

## 8. Ce informații sunt păstrate (baza de date)

Baza de date este locul unde se salvează totul. Principalele categorii de informații:

| Ce se salvează | Ce conține |
|---|---|
| **Profiluri (conturi)** | Fiecare cont: rolul (elev sau profesor), numele afișat și clasa din care face parte. Aceste conturi sunt create de administrator. |
| **Clase** | Clasele din școală (de ex. „12B”). |
| **Teme** | Titlul, cerința, detaliile, termenul-limită, clasa țintă și tipul (temă sau test). |
| **Lucrări predate** | Cine a predat, la ce temă, numele fișierului, textul lucrării și dacă a fost analizată. |
| **Rezultatele analizei** | Pentru fiecare lucrare: scorul AI, similaritatea cu colegii, abaterea de stil și cei cinci indicatori de stilometrie. |
| **Perechile suspecte** | Elevii între care s-a găsit asemănare mare, împreună cu frazele comune. |
| **Referințele de stil** | „Amprenta de scris” obișnuită a fiecărui elev și câte teste au contribuit la ea. |
| **Sursele web** | Linkurile găsite la scanarea de plagiat pe internet, salvate pentru fiecare lucrare. |

---

## 9. Cum „navighezi” prin aplicație (adresa din browser)

Aplicația ține minte **unde te afli** chiar în adresa din bara browserului. Asta aduce trei avantaje practice:

- **Reîmprospătarea paginii nu te aruncă înapoi** — dacă profesorul studiază raportul unui elev și reîncarcă pagina din greșeală, revine exact unde era.
- **Butonul „Înapoi” al browserului funcționează logic** — te duce cu un nivel mai sus (de la raportul elevului, înapoi la lista lucrărilor), nu afară din aplicație.
- **Poți da mai departe un link** — profesorul poate copia adresa și o poate trimite unui coleg, iar acela ajunge direct la același raport (dacă are drept de acces).

Practic, adresa se schimbă pe măsură ce intri mai adânc: de la lista de teme, la o temă anume, la un anumit elev, până la o anumită secțiune din raportul lui.

---

## 10. Limba aplicației (română / engleză)

Aplicația este în întregime în **română**, dar are un **buton de schimbare a limbii** în **engleză**. Toate textele afișate sunt luate din două „dicționare” (unul român, unul englez), astfel încât întreaga interfață se traduce dintr-o singură apăsare. Preferința de limbă este ținută minte între vizite.

---

## 11. Cum pornești aplicația

Pentru cineva care vrea să ruleze aplicația pe calculatorul propriu, pașii de bază sunt:

```bash
# 1. Instalează componentele aplicației web
pnpm install

# 2. Instalează componentele de analiză (Python) — o singură dată
pip install spacy requests beautifulsoup4 google-genai transformers torch sentencepiece langdetect numpy
python -m spacy download ro_core_news_sm

# 3. Pornește aplicația în modul dezvoltare
pnpm dev
```

Este nevoie și de un fișier de configurare (`.env.local`) cu:
- adresa și cheia bazei de date **Supabase**,
- o cheie pentru **Gemini** (Google), necesară scanării web.

Odată pornită, aplicația se deschide în browser, iar utilizatorii se conectează cu contul primit de la administrator.

---

## 12. Lucruri importante de știut

- **Conturile sunt oferite de administrator.** Nu există înregistrare liberă; fiecare elev și profesor primește un cont creat și configurat de administrator.
- **Confidențialitatea elevilor este obligatorie.** Nicio informație de analiză (scoruri, procente, grafice) nu trebuie să ajungă vreodată pe ecranul elevului.
- **Analiza „grea” se face cu Python.** Dacă partea Python nu este instalată corect (de exemplu, lipsește modelul de limbă română pentru spaCy sau cheia Gemini), analizele respective nu vor funcționa, chiar dacă restul aplicației merge.
- **Testele modelează referința de stil.** Un test bine dat ajută aplicația să înțeleagă cum scrie de obicei elevul, ceea ce face mai precise verificările de la temele viitoare.
- **Rezultatele sunt un ajutor, nu o sentință.** Mai ales la plagiatul web, aplicația recomandă verificarea manuală a linkurilor: sistemul semnalează corelații și surse posibile, dar decizia finală rămâne a profesorului.

---

*Acest document descrie aplicația la momentul redactării. Când se schimbă modul de funcționare, este bine să fie actualizat și el.*


