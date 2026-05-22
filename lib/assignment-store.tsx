"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import { computeFullScore, generateShingles } from "./analysisEngine"

// ─── Types ────────────────────────────────────────────────────────────────────

export type SchoolClass = "10A" | "10B" | "11A" | "11B" | "12A" | "12B"

export const ALL_CLASSES: SchoolClass[] = ["10A", "10B", "11A", "11B", "12A", "12B"]

export interface Assignment {
  id: string
  title: string
  requirement: string
  details: string
  deadline: string
  createdAt: string
  submissionCount: number
  className: SchoolClass
  additional_url?: string
  additional_filename?: string
}

export interface AnalysisReport {
  assignmentId: string
  ranAt: string
  scores: Record<string, StudentScore>
}

export interface StudentScore {
  aiScore: number
  similarity: number
  stilometric: "Stil Consistent" | "Abatere Stilistică"
  lexicalDiversity: number
  avgSentenceLength: number
  verbDensity: number
  adjectiveDensity: number
  punctuationUsage: number
  historicLexicalDiversity: number
  historicAvgSentenceLength: number
  historicVerbDensity: number
  historicAdjectiveDensity: number
  historicPunctuationUsage: number
  peerMatches: { name: string; similarity: number }[]
  plagiarismWeb?: {
    verdict: string
    scor_maxim: number
    sursa_principala: string | null
    plagiarism_urls: { url: string; scor: number }[]
  } | null
  id?: string
  analysisScoreId?: string
  analysis_score_id?: string
  studentId?: string
  student_id?: string
  submissionId?: string
  submission_id?: string
  stilometricDeviation?: number
  stylometryMetrics?: {
    ttr: number
    asl: number
    verbs: number
    adjs: number
    punct: number
  } | null
  stylometryBaseline?: {
    ttr: number
    asl: number
    verbs: number
    adjs: number
    punct: number
  } | null
}

export interface StudentSubmission {
  studentName: string
  assignmentId: string
  fileName: string
  uploadedAt: string
  aiScore: number
  analysed: boolean
  textPreview: string
}

// ─── SECTION 1: DATABASE-READY MODULAR ARCHITECTURE ──────────────────────────
// Three normalized relational tables that mirror a production PostgreSQL schema.
// All UI metrics are computed on-the-fly via .filter() / .map() / .reduce().

export interface DbStudent {
  id: string
  name: string
}

export interface DbAssignment {
  id: string
  title: string
  deadline: string
}

export interface DbSubmission {
  id: string
  student_id: string
  assignment_id: string
  submitted_at: string
  text: string
}

// ── DB_STUDENTS ──────────────────────────────────────────────────────────────
// Exactly 31 students. st_30 and st_31 have NO submission entry.

export const DB_STUDENTS: DbStudent[] = [
  { id: "st_1",  name: "Popescu Andrei" },
  { id: "st_2",  name: "Ionescu Maria" },
  { id: "st_3",  name: "Vasilescu Dan" },
  { id: "st_4",  name: "Georgescu Ana" },
  { id: "st_5",  name: "Dumitrescu Elena" },
  { id: "st_6",  name: "Radu Mihai" },
  { id: "st_7",  name: "Stancu Gabriel" },
  { id: "st_8",  name: "Stoica Ioana" },
  { id: "st_9",  name: "Dinu Cristian" },
  { id: "st_10", name: "Stan Bianca" },
  { id: "st_11", name: "Rusu Alexandru" },
  { id: "st_12", name: "Mihalcea Laura" },
  { id: "st_13", name: "Sandu Corina" },
  { id: "st_14", name: "Marcu Vlad" },
  { id: "st_15", name: "Nistor George" },
  { id: "st_16", name: "Teodorescu Alina" },
  { id: "st_17", name: "Dobre Ionuț" },
  { id: "st_18", name: "Vasile Roxana" },
  { id: "st_19", name: "Marin Eduard" },
  { id: "st_20", name: "Oprea Simona" },
  { id: "st_21", name: "Năstase Tudor" },
  { id: "st_22", name: "Florea Anca" },
  { id: "st_23", name: "Barbu Robert" },
  { id: "st_24", name: "Ene Mihaela" },
  { id: "st_25", name: "Preda Costel" },
  { id: "st_26", name: "Alexandru Diana" },
  { id: "st_27", name: "Luca Ștefan" },
  { id: "st_28", name: "Gheorghe Carmen" },
  { id: "st_29", name: "Pavel Marius" },
  { id: "st_30", name: "Badea Raluca" },   // NO submission — unsubmitted
  { id: "st_31", name: "Miron Costin" },   // NO submission — unsubmitted
]

// ── DB_ASSIGNMENTS ────────────────────────────────────────────────────────────

export const DB_ASSIGNMENTS: DbAssignment[] = [
  { id: "as_1", title: "Monografia satului arhaic în Baltagul", deadline: "2026-05-24T23:59:00" },
]

// ── DB_SUBMISSIONS ────────────────────────────────────────────────────────────
// 29 submissions for "as_1". st_30 (Badea Raluca) and st_31 (Miron Costin) omitted.
//
// Flagged clusters (algorithm will naturally score ≥ 50% Jaccard):
//   CLUSTER A (near-copy): st_1 ↔ st_5  (Popescu Andrei & Dumitrescu Elena)
//   CLUSTER B (heavy paraphrase): st_2 ↔ st_6 ↔ st_15  (Ionescu Maria, Radu Mihai, Nistor George)
//   CLUSTER C (structural overlap): st_3 ↔ st_9 ↔ st_19  (Vasilescu Dan, Dinu Cristian, Marin Eduard)
//   Student st_29 has a unique text — no cluster.

export const DB_SUBMISSIONS: DbSubmission[] = [
  // ── CLUSTER A — near-copy pair ─────────────────────────────────────────────
  {
    id: "sub_1", student_id: "st_1", assignment_id: "as_1", submitted_at: "2026-05-23T14:20:00",
    text: "Romanul Baltagul de Mihail Sadoveanu reprezintă o frescă monumentală a satului arhaic românesc de la munte. Comunitatea din Magura Tarcăului este guvernată de legi nescrise ancestrale, vechi de milenii, unde datina și tradiția stabilesc ordinea cosmică și socială deplină. Viața oierenilor se desfășoară într-un ritm transhumant ciclic, strâns legat de anotimpuri și de mișcarea turmelor de oi pe munte. În acest spațiu izolat și mistic, moartea lui Nechifor Lipan nu reprezintă doar o tragedie personală sau o crimă obișnuită, ci o perturbare gravă a echilibrului universal profund. Vitoria Lipan, personaj mitic și mult mai puternic decât pare, pornește într-o adevărată călătorie inițiatică pentru restabilirea adevărului și aplicarea dreptății absolute, ghidată de semne cosmice și credință nepieritoare în ordinea divină a lucrurilor."
  },
  {
    id: "sub_5", student_id: "st_5", assignment_id: "as_1", submitted_at: "2026-05-24T09:12:00",
    text: "O frescă monumentală a satului arhaic românesc de la munte este reprezentată cu măiestrie în romanul Baltagul de Mihail Sadoveanu. Comunitatea din Magura Tarcăului este guvernată de legi nescrise ancestrale, vechi de milenii, unde datina și tradiția stabilesc ordinea cosmică și socială deplină în viața de zi cu zi. Ritmul transhumant ciclic controlează modul în care viața oierenilor se desfășoară în timp, fiind strâns legat de anotimpuri și de mișcarea turmelor de oi pe munte. În acest spațiu izolat și profund mistic, moartea lui Nechifor Lipan nu este doar o tragedie personală, ci o perturbare gravă a echilibrului universal. Vitoria Lipan, un personaj mitic și extrem de puternic, pornește într-o lungă călătorie inițiatică pentru restabilirea adevărului și aplicarea dreptății absolute, ghidată de semne cosmice și de credință în ordinea divină."
  },
  // ── CLUSTER B — heavy paraphrase triplet ──────────────────────────────────
  {
    id: "sub_2", student_id: "st_2", assignment_id: "as_1", submitted_at: "2026-05-23T15:10:00",
    text: "Monografia comunității pastorale din Baltagul evidențiază un univers conservator în care timpul pare să fi rămas suspendat pentru totdeauna. Sadoveanu insistă pe legătura organică dintre om și natură, descriind cu precizie de etnograf ritualurile fundamentale ale existenței: botezul, nunta și înmormântarea. Satul românesc de munte este prezentat ca un organism colectiv autoreglabil, reticent la inovațiile tehnologice sau legislative ale lumii moderne de la șes. Personajele refuză instinctiv autoritățile statului, preferând să își rezolve conflictele interne pe baza obiceiului pământului. Mentalitatea arhaică implică o percepție magică asupra realității înconjurătoare, unde visele, vremea și comportamentul animalelor sunt semne clare trimise de divinitate pentru a ghida acțiunile oamenilor din sat."
  },
  {
    id: "sub_6", student_id: "st_6", assignment_id: "as_1", submitted_at: "2026-05-24T10:30:00",
    text: "Universul conservator în care timpul pare suspendat este evidențiat perfect în monografia comunității pastorale din opera Baltagul. Mihail Sadoveanu insistă pe legătura organică dintre om și natură, punând accent pe ritualurile fundamentale ale existenței umane: botezul, nunta și înmormântarea. Satul românesc de munte este prezentat ca un organism colectiv autoreglabil, extrem de reticent la toate inovațiile tehnologice sau legislative aduse de lumea modernă de la șes. Personajele de aici refuză instinctiv intervenția autorităților statului, preferând să își rezolve conflictele pe baza obiceiului vechi al pământului. Această mentalitate arhaică implică o percepție magică specială asupra realității înconjurătoare, unde visele și vremea sunt semne trimise de divinitate pentru a ghida oamenii."
  },
  {
    id: "sub_15", student_id: "st_15", assignment_id: "as_1", submitted_at: "2026-05-24T15:45:00",
    text: "Mihail Sadoveanu construiește în Baltagul monografia unui univers conservator, în care timpul pare suspendat și legătura organică dintre om și natură este esențială. Ritualurile fundamentale ale existenței — botezul, nunta și înmormântarea — sunt descrise cu acuratețe etnografică remarcabilă. Satul este prezentat ca un organism colectiv autoreglabil, reticent la inovațiile tehnologice sau legislative ale lumii moderne. Localnicii refuză instinctiv autoritățile statului, preferând cu tărie să își rezolve disputele pe baza vechiului obicei al pământului. Mentalitatea pastorală arhaică implică o percepție magică profundă a realității, unde visele și comportamentul animalelor constituie semne divine clare, menite să ghideze pașii oamenilor simpli din munte."
  },
  // ── CLUSTER C — structural overlap triplet ────────────────────────────────
  {
    id: "sub_3", student_id: "st_3", assignment_id: "as_1", submitted_at: "2026-05-23T16:05:00",
    text: "Perspectiva mitică asupra existenței în opera sadoveană se suprapune peste o structură epică de roman polițist cu elemente arhaice. Căutarea adevărului de către Vitoria Lipan urmează un traseu geografic real prin munți, dar și o axă spirituală internă profundă. Autorul explorează subtil psihologia femeii voluntare, capabilă să preia atributele masculine ale autorității într-o criză gravă. Gheorghiță reprezintă liantul generațional dintre trecut și viitor, fiind educat de mamă în spiritul tradiției pentru a deveni noul cap de familie. Romanul capturează conflictul mocnit dintre modernitate și arhaic, ilustrat prin contrastul dintre hanurile de la drumul mare și gospodăriile izolate din munți."
  },
  {
    id: "sub_9", student_id: "st_9", assignment_id: "as_1", submitted_at: "2026-05-24T12:15:00",
    text: "În Baltagul, perspectiva mitică asupra existenței se suprapune perfect peste o structură epică ce amintetse de romanul polițist cu elemente arhaice. Căutarea adevărului de către Vitoria Lipan urmează un traseu geografic real prin munții Moldovei, dar și o axă spirituală internă de mare profunzime. Sadoveanu explorează cu subtilitate psihologia femeii voluntare, capabilă să preia atributele masculine ale autorității în fața unei crize grave. Gheorghiță este liantul dintre trecut și viitor, educat de mamă în spiritul tradiției pentru a deveni noul cap al familiei. Romanul surprinde conflictul mocnit dintre lumea modernă și cea arhaică, prin contrastul viu dintre hanuri și gospodăriile de munte."
  },
  {
    id: "sub_19", student_id: "st_19", assignment_id: "as_1", submitted_at: "2026-05-24T17:30:00",
    text: "Opera Baltagul prezintă o perspectivă mitică asupra existenței, suprapusă peste o structură epică de roman polițist cu clare elemente arhaice românești. Căutarea adevărului de Vitoria Lipan urmează un traseu geografic prin munți, dar și o axă spirituală profundă interioară. Autorul explorează psihologia femeii voluntare, care preia atributele masculine ale autorității în criză. Gheorghiță este liantul dintre trecut și viitor, educat de mamă în spiritul tradiției ca să devină capul familiei. Conflictul mocnit dintre modernitate și lumea arhaică este ilustrat prin contrastul dintre hanurile de la drum și gospodăriile izolate din munții Moldovei, unde viața aspră a oierilor își păstrează puritatea originală de milenii."
  },
  // ── UNIQUE ESSAYS (below 20% similarity between each other) ──────────────
  {
    id: "sub_4", student_id: "st_4", assignment_id: "as_1", submitted_at: "2026-05-23T18:45:00",
    text: "Vitoria Lipan este personajul central al romanului Baltagul, o femeie cu o voință de fier și o credință profundă în ordinea divină și în dreptatea lumii. Plecând de acasă cu fiul ei Gheorghiță, ea traversează munți și sate, interogând oameni și urmărind cu răbdare urmele bărbatului ei dispărut. Ceea ce o distinge de celelalte personaje feminine din literatura română este faptul că ea nu plânge pasiv, ci acționează metodic și inteligent. Identitatea ei este inseparabilă de tradiție și de credința ortodoxă, care îi dau puterea de a înfrunta necunoscutul. Descoperirea crimei și pedepsirea vinovaților reprezintă în final restabilirea echilibrului cosmic perturbat, o victorie a dreptului nescris al muntelui față de lacomia și răutatea umană care au tulburat pacea."
  },
  {
    id: "sub_7", student_id: "st_7", assignment_id: "as_1", submitted_at: "2026-05-24T11:02:00",
    text: "Baltagul lui Sadoveanu este o capodoperă a literaturii române care reconstituie cu fidelitate lumea pastorală arhaică a Moldovei de munte. Titlul însuși, baltag, desemnează arma crimei și un simbol al justiției ancestrale, care se întoarce inevitabil împotriva celui care a folosit-o cu scopuri meschine. Naturalismul detaliat al lui Sadoveanu face ca peisajul să devină un personaj activ al romanului, nu doar un simplu decor pasiv. Munții, pădurile de brad și apele repezi ale văilor reflectă starea interioară a eroinei și amplifică tensiunea narativă a căutării. Romanul se structurează pe două planuri simultan: unul real și detectivistic, altul mitic și spiritual, ambele converg spre aceeași concluzie morală despre dreptate și răzbunare justificată."
  },
  {
    id: "sub_8", student_id: "st_8", assignment_id: "as_1", submitted_at: "2026-05-24T11:50:00",
    text: "Tema drumului în Baltagul este strâns legată de simbolistica inițierii și a transformării spirituale profunde. Vitoria și fiul ei Gheorghiță nu efectuează un simplu voiaj geografic, ci trec printr-un proces de maturizare și de cunoaștere a naturii umane reale în toată complexitatea ei. Fiecare oprire a lor la hanuri sau la stâne echivalează cu o probă ce îi testează curajul, răbdarea și inteligența deosebită. Sadoveanu utilizează tehnica întâlnirilor succesive pentru a crea o hartă morală a lumii rurale românești, cu oamenii ei buni și răi, cinstiți sau lacomi. Finalul romanului, cu descoperirea crimei în valea Dornei, reprezintă triumful ordinii tradiționale asupra haosului moral adus de avarice și de slăbiciunea caracterului uman."
  },
  {
    id: "sub_10", student_id: "st_10", assignment_id: "as_1", submitted_at: "2026-05-24T13:00:00",
    text: "Elementele de monografie etnografică din Baltagul depășesc cu mult funcția decorativă, constituind un adevărat document al civilizației pastorale românești de munte. Sadoveanu descrie cu meticulozitate obiceiurile legate de transhumanță, de creșterea oilor, de prepararea brânzeturilor și de calendarul pastoral al anului. Fiecare detaliu al vieții materiale este redat cu o acuratețe care transformă romanul într-un tratat de folclor viu și autentic. Lumea satului de munte funcționează pe baza unui cod nescris transmis oral din generație în generație, mult mai puternic și mai respectat decât orice lege scrisă a statului modern. Această dimensiune documentară conferă romanului o valoare literară și antropologică deopotrivă excepțională pentru înțelegerea culturii tradiționale românești."
  },
  {
    id: "sub_11", student_id: "st_11", assignment_id: "as_1", submitted_at: "2026-05-24T13:40:00",
    text: "Nechifor Lipan este în Baltagul un personaj absent fizic, dar omniprezent simbolic pe tot parcursul narațiunii. Povestea lui este reconstituită treptat prin mărturiile oamenilor întâlniți de Vitoria, creând imaginea unui bărbat respectat, harnic și cu simțul onoarei bine format. Dispariția sa nu este niciodată un simplu fapt divers, ci un eveniment cu rezonanțe mitice profunde, asemănător morții unui erou de legendă. Prezența lui spirituală ghidează pașii soției sale, care simte prin intuiție maternă unde trebuie să meargă și ce întrebări să adreseze. Finalul ritualului de înmormântare, cu toate ceremoniile tradiționale respectate cu strictețe, restaurează ordinea lumii și îi aduce soțului mort liniștea eternă meritată."
  },
  {
    id: "sub_12", student_id: "st_12", assignment_id: "as_1", submitted_at: "2026-05-24T14:10:00",
    text: "Relația dintre natură și destin în Baltagul este una dintre temele esențiale ale romanului sadovean. Natura nu este niciodată neutră sau indiferentă la soarta personajelor, ci participă activ la destinul lor prin semne și presimțiri transmise pe căi misterioase. Vântul, ploaia, zborul corvilor și lătratul câinilor sunt tot atâtea mesaje ale unui univers însuflețit care vorbește celor ce știu să asculte cu înțelepciune. Vitoria înțelege aceste semnale cu o intuiție aproape supranaturală, dăruită ei de viața aspră în sânul naturii de la munte. Această comuniune profundă dintre om și cosmos reprezintă miezul filozofic al operei lui Sadoveanu și o distinge clar de toate celelalte romane ale perioadei interbelice românești."
  },
  {
    id: "sub_13", student_id: "st_13", assignment_id: "as_1", submitted_at: "2026-05-24T14:32:00",
    text: "Credința religioasă și obiceiurile ortodoxe joacă un rol structural fundamental în romanul Baltagul de Mihail Sadoveanu. Vitoria Lipan vizitează biserici și se roagă la sfinți înainte de a lua orice decizie importantă în călătoria sa grea. Postul, rugăciunea și respectul față de morți sunt practici care o ancorează în lumea valorilor tradiționale ale neamului ei. Prin aceste practici, Vitoria nu acționează singură, ci se simte susținută de o forță transcendentă care îi legitimează cauza dreaptă. Romanul lui Sadoveanu arată că, în lumea arhaică de munte, legea divină și legea comunității sunt una și aceeași, nediferențiate și imposibil de separat."
  },
  {
    id: "sub_14", student_id: "st_14", assignment_id: "as_1", submitted_at: "2026-05-24T15:01:00",
    text: "Construcția romanescă a Baltagului se bazează pe alternanța dintre planul realist al investigației și cel mitic al destinului implacabil. Sadoveanu îmbină cu măiestrie detaliile concrete ale vieții pastorale moldovenești cu dimensiunea legendară a căutării feminine a dreptății. Tehnica narativă lineară este dublată de o rețea de simboluri și presimțiri care anticipează revelațiile finale. Personajele secundare, hangiii, ciobanașii și negustorii întâlniți pe drum, compun un mozaic al tipologiei umane rurale, fiecare contribuind cu o informație crucială la reconstituirea crimei. Această arhitectură narativă atent construită conferă romanului o densitate literară deosebită și o savoare unică a epicii românești tradiționale de munte."
  },
  {
    id: "sub_16", student_id: "st_16", assignment_id: "as_1", submitted_at: "2026-05-24T16:11:00",
    text: "Limbajul artistic al lui Sadoveanu în Baltagul este una dintre comorile literaturii române clasice. Proza sa are o muzicalitate aparte, un ritm lent și solemn, adaptat perfect subiectului pastoral arhaic. Utilizarea arhaismelor și a regionalismelor moldovenești conferă textului autenticitate și savoare lingvistică unică. Dialogurile personajelor reproduce fidel vorbirea populară a oamenilor de la munte din prima jumătate a secolului al douăzecilea. Prin această grijă extremă pentru limbă și detaliu, Sadoveanu realizează o operă totală în care conținutul și forma se susțin reciproc în mod exemplar, creând un univers literar coerent și profund emoționant pentru cititor."
  },
  {
    id: "sub_17", student_id: "st_17", assignment_id: "as_1", submitted_at: "2026-05-24T16:40:00",
    text: "Simbolistica baltaguluialtag ca obiect în romanul omonim transcende funcția sa practică de unealtă, devenind un axis mundi al justiției tradiționale. Arma cu care a fost ucis Nechifor Lipan devine proba materială a crimei și instrumentul răzbunării simbolice cuvenite. Posesia baltaguluialtag de către criminali le dezvăluie vina cu o forță probatorie mai mare decât orice mărturie verbală. Vitoria îl recuperează și îl păstrează cu grijă ca pe o relicvă sacră ce aparține istoriei familiei sale. Prin această centrare narativă pe obiect, Sadoveanu demonstrează că în lumea arhaică, bunurile materiale sunt purtătoare de memorie și de suflet, la fel ca ființele umane."
  },
  {
    id: "sub_18", student_id: "st_18", assignment_id: "as_1", submitted_at: "2026-05-24T17:05:00",
    text: "Spațiul geografic din Baltagul nu este un simplu cadru pasiv al acțiunii, ci un protagonist activ și sensibil al romanului. Sadoveanu știe că munții Moldovei, cu pădurile lor de brazi și izvoarele lor reci, modelează psihologia și valorile oamenilor care trăiesc în mijlocul lor. Topografia romanului urmează cu fidelitate drumurile reale ale transhumanței, conferind narațiunii un puls geografic autentic. Fiecare vale sau culme depășită de Vitoria marchează un progres interior în lunga sa căutare de dreptate. Relația dintre personaj și peisaj este reciprocă și profundă, creând sentimentul că muntele însuși plânge după Nechifor și îl ajută pe Vitoria să descopere adevărul."
  },
  {
    id: "sub_20", student_id: "st_20", assignment_id: "as_1", submitted_at: "2026-05-24T18:00:00",
    text: "Analiza personajului Gheorghiță în Baltagul relevă un proces de formare și maturizare specific bildungsromanului, adaptat contextului arhaic al lumii de munte. El pleacă de acasă ca un adolescent lipsit de experiență și se întoarce — mai bine zis, sosește în Dorna — ca un bărbat format. Procesul său educațional nu se realizează în școli, ci prin contactul direct cu oamenii și cu viața aspră pe drumurile muntilor. Mama sa, Vitoria, este mentorul și ghidul său practic, transmițindu-i prin exemple concrete codul moral al comunității lor. Transformarea lui Gheorghiță reprezintă continuitatea culturală a familiei Lipan și, în sens mai larg, a întregii lumi pastorale moldovenești."
  },
  {
    id: "sub_21", student_id: "st_21", assignment_id: "as_1", submitted_at: "2026-05-24T18:30:00",
    text: "Crima din Baltagul nu este prezentată niciodată în manieră senzaționalistă, ci ca o breșă în ordinea morală a lumii tradiționale de munte. Ucigașii, Calistrat Bogza și Ilie Cuțui, sunt caracterizați de Sadoveanu ca oameni cuprinși de avarice și de patima câștigului rapid necinstit. Ei sunt devianți ai unei lumi în care solidaritatea și cinstea sunt valori supreme respectate de toți. Pedepsirea lor nu vine din exterior, ci din interiorul comunității, prin denunțul colectiv și prin acțiunea Vitoriei. Acest deznodământ moral demonstrează că, în concepția sadoveaniană, justiția arhaică a satului de munte este autosuficientă și nu are nevoie de instituțiile statului modern pentru a se împlini."
  },
  {
    id: "sub_22", student_id: "st_22", assignment_id: "as_1", submitted_at: "2026-05-24T19:02:00",
    text: "Tehnica portretizării indirecte este un element central al artei narative sadovaniene în Baltagul. Nechifor Lipan nu apare niciodată viu în fața cititorului, ci este construit treptat prin amintirile soției, prin povestirile oamenilor întâlniți pe drum și prin obiectele sale lăsate în urmă. Această absență fizică paradoxal sporește prezența sa simbolică pe tot parcursul romanului. Portretul său moral, cel al unui oier cinstit, respectat și bun creștin, iese în relief tocmai prin contrast cu criminalii care l-au ucis din lăcomie. Sadoveanu demonstrează astfel că o viață trăită cu demnitate nu dispare odată cu moartea, ci continuă să existe în memoria colectivă a comunității și în acțiunile celor dragi."
  },
  {
    id: "sub_23", student_id: "st_23", assignment_id: "as_1", submitted_at: "2026-05-24T19:45:00",
    text: "Funcția mitică a viselor în Baltagul este esențială pentru înțelegerea logicii interioare a romanului sadovean. Vitoria primește prin vise avertismente și confirmări ale bănuielilor sale despre soarta bărbatului ei dispărut. Visele nu sunt simple manifestări ale subconștientului, ci mesaje clare trimise de o lume de dincolo care comunică cu cei vii prin semne onirice. Această credință în comunicarea dintre vii și morți este parte integrantă a cosmologiei populare românești arhaice, prezentate autentic de Sadoveanu. Funcția revelativă a viselor conferă narațiunii o tensiune ascendentă continuă și justifică certitudinea cu care eroina urmărește pista crimei fără să șovăie nicio clipă."
  },
  {
    id: "sub_24", student_id: "st_24", assignment_id: "as_1", submitted_at: "2026-05-24T20:15:00",
    text: "Ritualul de înmormântare de la finalul Baltagului este unul dintre cele mai solemne și mai puternice momente ale literaturii române clasice în ansamblu. Sadoveanu descrie cu grijă și reverență fiecare etapă a ceremoniei funerare, respectând cu strictețe datinile ortodoxe și obiceiurile populare moldovenești ale timpului. Gestul Vitoriei de a organiza o înmormântare demnă pentru Nechifor, după ce i-a găsit rămășițele și a demascat ucigașii, este actul final al iubirii ei conjugale indestructibile. Prin această ceremonie, ordinea lumii este restaurată complet, sufletul lui Nechifor poate pleca liniștit, iar familia Lipan poate să continue viața. Finalul romanului nu este trist, ci sublim în toată gravitatea sa ancestrală profundă."
  },
  {
    id: "sub_25", student_id: "st_25", assignment_id: "as_1", submitted_at: "2026-05-24T20:50:00",
    text: "Baltagul face parte dintr-o trilogie a lumii moldovenești de munte a lui Sadoveanu, alături de Frații Jderi și Hanu Ancuței. Toate aceste opere împart aceeași atmosferă de reverie pastorală, același limbaj poetic și aceeași filozofie a timpului circular. Ceea ce le diferențiază este tonul particular al fiecărei narațiuni, Baltagul aducând în prim-plan dimensiunea polițistă și aceea a justiției spontane. Tematica justiției populare, apărarea onoarei și pedepsirea crimei de către comunitate sunt recurente în proza sadoveniancă și reflectă o viziune coerentă despre ordinea morală a lumii tradiționale. Înțelegerea Baltagului în context intertextual îmbogățește receptarea sa și dezvăluie amplitudinea proiectului literar al marelui scriitor moldovean."
  },
  {
    id: "sub_26", student_id: "st_26", assignment_id: "as_1", submitted_at: "2026-05-24T21:10:00",
    text: "Dimensiunea feminină a eroismului este redefinită radical în Baltagul lui Sadoveanu prin figura Vitoriei Lipan. Într-o lume dominată de bărbați și de coduri ale masculinității pastorale, ea reușește să impună propria logică a acțiunii fără să renunțe la identitatea sa de soție și de mamă. Puterea ei nu este fizică, ci morală și intelectuală, manifestată prin capacitatea de a citi semne, de a asculta oamenii și de a pune întrebări inteligente. Sadoveanu creează în Vitoria un model de feminitate puternică, ancorată în tradiție dar nu redusă la ea, capabilă de acțiune autonomă în fața tragediei. Prin acest personaj, romanul contribuie la o reevaluare subtilă a rolurilor de gen în cadrul comunității tradiționale românești de munte."
  },
  {
    id: "sub_27", student_id: "st_27", assignment_id: "as_1", submitted_at: "2026-05-24T21:40:00",
    text: "Tema memoriei colective și a transmiterii identității prin narațiune orală este prezentă în toată fibra romanului Baltagul. Vitoria reconstituie traseul soțului ei întrebând oamenii care l-au văzut sau cu care a vorbit, construind astfel o narațiune fragmentată a vieții lui recente. Această tehnică de reconstituire orală reproduce mecanismul tradiției populare, unde istoria nu este scrisă în cărți, ci purtată viu în memoria oamenilor din sat. Romanul lui Sadoveanu devine astfel un omagiu adus culturii orale a lumii rurale moldovenești, amenințate de modernizarea forțată. Autorul arată că această cultură posedă o coerență și o profunzime spirituală care merită să fie salvate și celebrate în literatura română cultă."
  },
  {
    id: "sub_28", student_id: "st_28", assignment_id: "as_1", submitted_at: "2026-05-24T22:10:00",
    text: "Personajul Vitoriei Lipan din Baltagul este adesea comparat de critica literară cu eroinele din tragedia greacă antică, prin determinarea ei de fier și prin suferința asumată cu demnitate remarcabilă. Există în gesturile și vorbele ei o grandoare clasică, o gravitate a femeii care cunoaște legile nescrise ale destinului și le acceptă fără revoltă sterilă. Sadoveanu însuși a declarat că s-a inspirat din balade populare pentru a construi acest personaj de o robustețe morală exemplară. Contextul istorico-social al anilor treizeci, cu frământările modernizării forțate a satului românesc, dă o dimensiune suplimentară simbolică acestei femei care reprezintă rezistența lumii arhaice la schimbare. Prin Vitoria, Sadoveanu apără valorile pereniale ale civilizației rurale moldovenești în fața presiunilor istoriei nemiloase."
  },
  {
    id: "sub_29", student_id: "st_29", assignment_id: "as_1", submitted_at: "2026-05-24T22:45:00",
    text: "Baltagul rămâne în istoria literaturii române drept cel mai complex roman al lui Mihail Sadoveanu și unul dintre vârfurile absolute ale prozei interbelice. Scriitorul a reușit să integreze organic mai multe registre narative: polițist, mitic, etnografic și liric, creând o operă cu o uimitoare unitate interioară. Tema esențială a romanului poate fi rezumată ca triumful dreptății morale și cosmice asupra crimei și avariciei, exprimat printr-o acțiune epică de o simplitate înșelătoare. Structura romanului, aparent liniară, ascunde o rețea complexă de simboluri, leitmotive și paralelisme care se dezvăluie cititorului atent. Valoarea sa culturală depășește granițele literaturii pure, făcând din Baltagul un document esențial al civilizației tradiționale românești de munte, în toată frumusețea și demnitatea ei ancestrală."
  },
  // st_30 (Badea Raluca) — NO entry = unsubmitted
  // st_31 (Miron Costin) — NO entry = unsubmitted
]

// ─── Derived join helpers (simulate SQL INNER JOIN on the fly) ────────────────

/** Returns the full name of a student by id */
export function getStudentName(studentId: string): string {
  return DB_STUDENTS.find((s) => s.id === studentId)?.name ?? studentId
}

/** Returns all submissions for a given assignment_id, joined with student names */
export function getSubmissionsForAssignment(assignmentId: string): Array<DbSubmission & { studentName: string }> {
  return DB_SUBMISSIONS
    .filter((sub) => sub.assignment_id === assignmentId)
    .map((sub) => ({
      ...sub,
      studentName: getStudentName(sub.student_id),
    }))
}

/** Returns students with NO submission for a given assignment */
export function getUnsubmittedStudents(assignmentId: string): DbStudent[] {
  const submittedIds = new Set(
    DB_SUBMISSIONS.filter((s) => s.assignment_id === assignmentId).map((s) => s.student_id)
  )
  return DB_STUDENTS.filter((st) => !submittedIds.has(st.id))
}

/** Count submitted vs total for a given assignment */
export function getSubmissionStats(assignmentId: string) {
  const submitted = DB_SUBMISSIONS.filter((s) => s.assignment_id === assignmentId).length
  const total = DB_STUDENTS.length
  return { submitted, total, notSubmitted: total - submitted }
}

// ─── Class rosters ────────────────────────────────────────────────────────────

export const CLASS_STUDENTS: Record<SchoolClass, string[]> = {
  "10A": ["Andrei Popescu", "Maria Ionescu", "Vlad Constantin", "Elena Dumitrescu"],
  "10B": ["Radu Gheorghe", "Ioana Popa", "Cristian Marin", "Alina Stoica"],
  "11A": ["Mihai Stanescu", "Ana Vasilescu", "Bogdan Neagu", "Simona Rusu"],
  "11B": ["Cosmin Dima", "Laura Barbu", "Florin Tudose", "Roxana Lupescu"],
  "12A": [
    "Andrei Popescu", "Maria Ionescu", "Vlad Constantin", "Elena Dumitrescu",
    "Radu Gheorghe", "Ioana Popa", "Cristian Marin", "Alina Stoica",
  ],
  "12B": DB_STUDENTS.map((s) => s.name),
}

// ──��� Historic baseline profiles ───────────────────────────────────────────────

export interface HistoricBaseline {
  ttr: number
  asl: number
  verbs: number
  adjs: number
  punct: number
}

export const STUDENT_BASELINES: Record<string, HistoricBaseline> = {
  "Popescu Andrei":    { ttr: 46.5, asl: 12.2, verbs: 22.1, adjs: 9.4,  punct: 13.8 },
  "Ionescu Maria":     { ttr: 44.8, asl: 11.9, verbs: 23.5, adjs: 8.9,  punct: 14.1 },
  "Vasilescu Dan":     { ttr: 49.1, asl: 15.4, verbs: 18.2, adjs: 12.6, punct: 11.2 },
  "Georgescu Ana":     { ttr: 47.9, asl: 14.8, verbs: 19.1, adjs: 12.1, punct: 11.9 },
  "Dumitrescu Elena":  { ttr: 46.5, asl: 12.2, verbs: 22.1, adjs: 9.4,  punct: 13.8 },
  "Radu Mihai":        { ttr: 44.8, asl: 11.9, verbs: 23.5, adjs: 8.9,  punct: 14.1 },
  "Stancu Gabriel":    { ttr: 52.3, asl: 13.1, verbs: 20.4, adjs: 10.8, punct: 12.5 },
  "Stoica Ioana":      { ttr: 39.2, asl: 10.1, verbs: 26.3, adjs: 6.2,  punct: 15.5 },
  "Dinu Cristian":     { ttr: 45.2, asl: 12.8, verbs: 21.5, adjs: 9.8,  punct: 13.2 },
  "Stan Bianca":       { ttr: 48.6, asl: 14.2, verbs: 19.8, adjs: 11.4, punct: 12.1 },
  "Rusu Alexandru":    { ttr: 43.9, asl: 11.5, verbs: 24.1, adjs: 8.5,  punct: 14.8 },
  "Mihalcea Laura":    { ttr: 50.1, asl: 15.8, verbs: 17.9, adjs: 13.2, punct: 10.8 },
  "Sandu Corina":      { ttr: 46.8, asl: 13.4, verbs: 20.8, adjs: 10.2, punct: 13.5 },
  "Marcu Vlad":        { ttr: 51.4, asl: 16.1, verbs: 17.5, adjs: 13.8, punct: 10.5 },
  "Nistor George":     { ttr: 44.5, asl: 12.1, verbs: 22.8, adjs: 9.1,  punct: 14.2 },
  "Teodorescu Alina":  { ttr: 47.2, asl: 14.5, verbs: 19.5, adjs: 11.8, punct: 11.8 },
  "Dobre Ionuț":       { ttr: 42.8, asl: 10.8, verbs: 25.2, adjs: 7.8,  punct: 15.1 },
  "Vasile Roxana":     { ttr: 49.5, asl: 15.2, verbs: 18.5, adjs: 12.4, punct: 11.5 },
  "Marin Eduard":      { ttr: 45.8, asl: 13.2, verbs: 21.2, adjs: 10.1, punct: 13.4 },
  "Oprea Simona":      { ttr: 48.2, asl: 14.8, verbs: 19.2, adjs: 11.6, punct: 12.2 },
  "Năstase Tudor":     { ttr: 43.5, asl: 11.2, verbs: 24.5, adjs: 8.2,  punct: 14.6 },
  "Florea Anca":       { ttr: 50.8, asl: 16.2, verbs: 17.2, adjs: 13.5, punct: 10.2 },
  "Barbu Robert":      { ttr: 46.1, asl: 12.5, verbs: 21.8, adjs: 9.5,  punct: 13.8 },
  "Ene Mihaela":       { ttr: 47.8, asl: 14.1, verbs: 19.8, adjs: 11.2, punct: 12.5 },
  "Preda Costel":      { ttr: 44.2, asl: 11.8, verbs: 23.2, adjs: 8.8,  punct: 14.4 },
  "Alexandru Diana":   { ttr: 49.2, asl: 15.5, verbs: 18.1, adjs: 12.8, punct: 11.1 },
  "Luca Ștefan":       { ttr: 45.5, asl: 12.9, verbs: 21.5, adjs: 9.9,  punct: 13.2 },
  "Gheorghe Carmen":   { ttr: 48.5, asl: 14.5, verbs: 19.5, adjs: 11.5, punct: 12.0 },
  "Pavel Marius":      { ttr: 43.2, asl: 11.0, verbs: 24.8, adjs: 8.0,  punct: 15.0 },
  "Badea Raluca":      { ttr: 50.5, asl: 15.9, verbs: 17.8, adjs: 13.0, punct: 10.6 },
  "Miron Costin":      { ttr: 47.1, asl: 13.8, verbs: 20.2, adjs: 10.5, punct: 13.1 },
}

// ─── BALTAGUL_TEXTS — derived from DB_SUBMISSIONS via JOIN ───────────────────
// This is the existing keyed map consumed by MassiveNetworkGraph and forensic engine.
// Computed at module load from DB_SUBMISSIONS × DB_STUDENTS for "as_1".

export const BALTAGUL_TEXTS: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const sub of DB_SUBMISSIONS) {
    if (sub.assignment_id === "as_1") {
      const student = DB_STUDENTS.find((s) => s.id === sub.student_id)
      if (student) map[student.name] = sub.text
    }
  }
  return map
})()

// ─── Other assignment mock texts ──────────────────────────────────────────────

const MOCK_TEXT_1 = `Revoluția Industrială reprezintă una dintre cele mai profunde transformări din istoria omenirii. Începând cu Anglia secolului al XVIII-lea, procesul de industrializare a remodelat radical structura socială europeană, ducând la apariția proletariatului urban și a clasei burgheze.

Migrarea masivă de la sat la oraș a creat noi centre de putere economică, dar și zone de sărăcie extremă. Condiţiile de muncă în fabricile textile erau adesea inumane: copii de opt ani lucrau câte doisprezece ore pe zi, fără protecție legală.

Totodată, această perioadă a generat progrese tehnologice remarcabile — mașina cu aburi a lui James Watt, războiul mecanic de țesut, locomotiva cu aburi — care au comprimat distanțele și au accelerat comerțul internațional.`

const MOCK_TEXT_2 = `Impactul Revoluției Industriale nu poate fi subestimat. Transformările structurale ale societății europene din această perioadă au dus la apariția unor noi clase sociale și la modificarea fundamentală a relațiilor de producție.

Clasa muncitoare industrială, proletariatul, s-a format ca urmare directă a mecanizării producției. Aceasta a înlocuit meșteșugarul tradițional cu muncitorul de fabrică, anonim și înlocuibil.`

const MOCK_TEXT_3 = `Analiza istorică a Revoluției Industriale evidențiază un paradox fundamental: progresul material s-a construit pe suferința imediată a milioane de oameni. Urbanizarea accelerată a generat slumuri descrise vívid de Friedrich Engels în „Situația clasei muncitoare din Anglia".`

const MOCK_TEXT_BIO_1 = `Fotosinteza este procesul biochimic prin care plantele verzi convertesc energia luminoasă în energie chimică stocată sub formă de glucoză.

Ecuația globală: 6CO₂ + 6H₂O + energie luminoasă → C₆H₁₂O₆ + 6O₂

Procesul se desfășoară în reacțiile luminoase (în tilacoidele cloroplastului) și ciclul Calvin (în stroma cloroplastului).`

// ─── Seed assignments ─────────────────────────────────────────────────────────

const SEED_ASSIGNMENTS: Assignment[] = [
  {
    id: "a1",
    title: "Eseu — Revoluția Industrială",
    requirement: "Analizați impactul Revoluției Industriale asupra structurii sociale europene.",
    details: "Minimum 3 surse bibliografice. Format: .pdf sau .docx",
    deadline: "2026-05-25T23:59:00",
    createdAt: "10 mai 2026",
    submissionCount: 5,
    className: "12A",
    additional_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/320px-Camponotus_flavomarginatus_ant.jpg",
    additional_filename: "Ghid_Revolutia_Industriala.pdf",
  },
  {
    id: "a2",
    title: "Monografia satului arhaic în Baltagul",
    requirement: "Analizați tema călătoriei inițiatice și construcția personajului Vitoria Lipan în romanul Baltagul de Mihail Sadoveanu.",
    details: "Minimum 400 cuvinte. Includeți citate din text. Format: .txt sau .docx",
    // deadline mirrors DB_ASSIGNMENTS[0]
    deadline: "2026-05-24T23:59:00",
    createdAt: "08 mai 2026",
    submissionCount: 29,
    className: "12B",
    additional_filename: "Baltagul_Sadoveanu_Editie_Critica.pdf",
  },
  {
    id: "a3",
    title: "Proiect — Fotosinteza",
    requirement: "Descrieți mecanismul fotosintezei și importanța sa ecologică.",
    details: "Includeți diagrame și scheme. Format: .pdf",
    deadline: "2026-06-01T23:59:00",
    createdAt: "05 mai 2026",
    submissionCount: 2,
    className: "10A",
  },
]

// ─── Seed submissions (JOIN of DB_SUBMISSIONS for a2, others mocked) ─────────

// Build the 12B seed subs on-the-fly from the relational DB
const DB_BALTAGUL_SUBS: StudentSubmission[] = getSubmissionsForAssignment("as_1").map((sub, i) => ({
  studentName: sub.studentName,
  assignmentId: "a2",
  fileName: `${sub.studentName.split(" ")[1] ?? sub.studentName}_Baltagul.docx`,
  uploadedAt: (() => {
    const d = new Date(sub.submitted_at)
    return d.toLocaleString("ro-RO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
  })(),
  aiScore: 0,
  analysed: false,
  textPreview: sub.text,
}))

const SEED_SUBMISSIONS: StudentSubmission[] = [
  // 12A — Revoluția Industrială
  { studentName: "Andrei Popescu",   assignmentId: "a1", fileName: "Andrei_RevInd.pdf",   uploadedAt: "12 mai 2026, 09:14", aiScore: 0, analysed: false, textPreview: MOCK_TEXT_1 },
  { studentName: "Maria Ionescu",    assignmentId: "a1", fileName: "Maria_RevInd.docx",   uploadedAt: "12 mai 2026, 11:02", aiScore: 0, analysed: false, textPreview: MOCK_TEXT_2 },
  { studentName: "Vlad Constantin",  assignmentId: "a1", fileName: "Vlad_RevInd.pdf",     uploadedAt: "11 mai 2026, 16:45", aiScore: 0, analysed: false, textPreview: MOCK_TEXT_3 },
  { studentName: "Elena Dumitrescu", assignmentId: "a1", fileName: "Elena_RevInd.pdf",    uploadedAt: "11 mai 2026, 14:30", aiScore: 0, analysed: false, textPreview: MOCK_TEXT_1 },
  { studentName: "Radu Gheorghe",    assignmentId: "a1", fileName: "Radu_RevInd.docx",    uploadedAt: "10 mai 2026, 22:17", aiScore: 0, analysed: false, textPreview: MOCK_TEXT_2 },
  // 12B — Baltagul (derived from DB_SUBMISSIONS relational join)
  ...DB_BALTAGUL_SUBS,
  // 10A — Fotosinteza
  { studentName: "Andrei Popescu", assignmentId: "a3", fileName: "Andrei_Fotosinteza.pdf",  uploadedAt: "07 mai 2026, 15:20", aiScore: 0, analysed: false, textPreview: MOCK_TEXT_BIO_1 },
  { studentName: "Maria Ionescu",  assignmentId: "a3", fileName: "Maria_Fotosinteza.docx", uploadedAt: "06 mai 2026, 20:10", aiScore: 0, analysed: false, textPreview: MOCK_TEXT_BIO_1 },
]

// ─── Exported alias for MassiveNetworkGraph ───────────────────────────────────

export const CLASA_30_ELEVI: Record<string, string> = BALTAGUL_TEXTS

// ─── Context ──────────────────────────────────────────────────────────────────

interface AssignmentStore {
  assignments: Assignment[]
  submissions: StudentSubmission[]
  analysisReports: Record<string, AnalysisReport>
  addAssignment: (a: Omit<Assignment, "id" | "createdAt" | "submissionCount">) => void
  addSubmission: (s: Omit<StudentSubmission, "aiScore" | "analysed" | "textPreview">) => void
  runAiAnalysis: (assignmentId: string) => void
}

const AssignmentContext = createContext<AssignmentStore | null>(null)

export function AssignmentProvider({ children }: { children: ReactNode }) {
  const [assignments, setAssignments] = useState<Assignment[]>(SEED_ASSIGNMENTS)
  const [submissions, setSubmissions] = useState<StudentSubmission[]>(SEED_SUBMISSIONS)
  const [analysisReports, setAnalysisReports] = useState<Record<string, AnalysisReport>>({})

  const addAssignment = useCallback(
    (data: Omit<Assignment, "id" | "createdAt" | "submissionCount">) => {
      const newAssignment: Assignment = {
        ...data,
        id: `a${Date.now()}`,
        createdAt: new Date().toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" }),
        submissionCount: 0,
      }
      setAssignments((prev) => [newAssignment, ...prev])
    },
    []
  )

  const addSubmission = useCallback(
    (data: Omit<StudentSubmission, "aiScore" | "analysed" | "textPreview">) => {
      const newSub: StudentSubmission = {
        ...data,
        aiScore: 0,
        analysed: false,
        textPreview: "Conținut lucrare indisponibil în modul demo.",
      }
      setSubmissions((prev) => [newSub, ...prev])
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === data.assignmentId ? { ...a, submissionCount: a.submissionCount + 1 } : a
        )
      )
    },
    []
  )

  const runAiAnalysis = useCallback(
    (assignmentId: string) => {
      const assnSubs = submissions.filter((s) => s.assignmentId === assignmentId)
      if (assnSubs.length === 0) return

      const corpus = assnSubs.map((s) => ({
        name: s.studentName,
        text: s.textPreview,
        shingles: new Set<string>(),
      }))
      for (const entry of corpus) {
        entry.shingles = generateShingles(entry.text)
      }

      const scores: AnalysisReport["scores"] = {}

      const updatedSubs = submissions.map((s) => {
        if (s.assignmentId !== assignmentId) return s
        const computed = computeFullScore(s.studentName, s.textPreview, corpus)
        scores[s.studentName] = {
          aiScore: computed.aiScore,
          similarity: computed.similarity,
          stilometric: computed.stilometric,
          lexicalDiversity: computed.lexicalDiversity,
          avgSentenceLength: computed.avgSentenceLength,
          verbDensity: computed.verbDensity,
          adjectiveDensity: computed.adjectiveDensity,
          punctuationUsage: computed.punctuationUsage,
          historicLexicalDiversity: computed.historicLexicalDiversity,
          historicAvgSentenceLength: computed.historicAvgSentenceLength,
          historicVerbDensity: computed.historicVerbDensity,
          historicAdjectiveDensity: computed.historicAdjectiveDensity,
          historicPunctuationUsage: computed.historicPunctuationUsage,
          peerMatches: computed.peerMatches,
        }
        return { ...s, aiScore: computed.aiScore, analysed: true }
      })

      setSubmissions(updatedSubs)
      setAnalysisReports((prev) => ({
        ...prev,
        [assignmentId]: {
          assignmentId,
          ranAt: new Date().toLocaleString("ro-RO", {
            day: "numeric", month: "long", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          }),
          scores,
        },
      }))
    },
    [submissions]
  )

  return (
    <AssignmentContext.Provider value={{ assignments, submissions, analysisReports, addAssignment, addSubmission, runAiAnalysis }}>
      {children}
    </AssignmentContext.Provider>
  )
}

export function useAssignments() {
  const ctx = useContext(AssignmentContext)
  if (!ctx) throw new Error("useAssignments must be used inside AssignmentProvider")
  return ctx
}
