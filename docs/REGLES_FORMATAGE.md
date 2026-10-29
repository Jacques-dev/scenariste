# Règles de formatage d'un scénario professionnel

Référence complète utilisée par l'application **Scénariste**. Le standard décrit ici est le
format international (dit « américain » ou *master scene format*), employé par Final Draft,
Fountain, la WGA et la quasi-totalité des productions, avec les adaptations d'usage en France.
La spécification machine correspondante vit dans `src/rules/spec.ts` : toute règle chiffrée
ci-dessous y est encodée et sert au formatage temps réel, à la pagination, à l'import PDF et
au vérificateur.

---

## 1. Principes généraux

| Règle | Valeur |
|---|---|
| Police | Courier (ou variante : Courier Prime, Courier Final Draft), **12 pt** exclusivement |
| Densité | 10 caractères par pouce, 6 lignes par pouce (interligne simple = 12 pt) |
| Équivalence | **1 page ≈ 1 minute d'écran** (c'est la raison d'être de toutes ces règles) |
| Papier | US Letter (8,5 × 11 po) pour le standard ; A4 accepté en France avec les mêmes marges |
| Lignes par page | **≈ 55 lignes** de texte (hors numéro de page) |
| Enrichissements | Pas de gras, pas d'italique, pas de couleur. Le soulignement est toléré avec parcimonie (titres de séquences chez certains auteurs). Aucune justification : texte en drapeau (aligné à gauche) |
| Temps | L'action s'écrit **au présent de l'indicatif**, à la troisième personne |

## 2. Marges de la page

Mesurées depuis le bord du papier :

| Marge | Valeur |
|---|---|
| Gauche | **1,5 po (3,8 cm)** — élargie pour la reliure (brads) |
| Droite | 1 po (2,5 cm), non justifiée |
| Haut | 1 po (2,5 cm) avant la première ligne de texte |
| Bas | 1 po (2,5 cm) minimum ; on ne descend jamais sous 0,5 po |
| Numéro de page | à 0,5 po du haut, aligné sur la marge droite, suivi d'un point (`12.`) ; la page 1 n'est pas numérotée |

La largeur utile du texte est donc de **6 po = 60 caractères** Courier.

## 3. Les éléments et leurs retraits

Les retraits ci-dessous sont mesurés **depuis la marge gauche du texte** (donc depuis 1,5 po
du bord), en caractères Courier (1 car. = 0,1 po).

| Élément | Retrait | Largeur max | Casse |
|---|---|---|---|
| Intitulé de séquence (slugline) | 0 | 60 car. | MAJUSCULES |
| Action / description | 0 | 60 car. | Mixte |
| Nom de personnage | **22 car. (2,2 po)** | ≈ 38 car. | MAJUSCULES |
| Didascalie « (parenthèse) » | **16 car. (1,6 po)** | ≈ 24 car. | minuscules |
| Dialogue | **10 car. (1,0 po)** | **≈ 35 car.** | Mixte |
| Transition | aligné à droite | — | MAJUSCULES |
| Plan (shot) | 0 | 60 car. | MAJUSCULES |
| Texte centré | centré | 60 car. | Mixte |

### 3.1 Intitulé de séquence (*scene heading* / slugline)

Structure : `INT./EXT. LIEU - MOMENT`

- Toujours en **MAJUSCULES**, précédé de **deux lignes vides** (une seule après le tout
  premier `FADE IN:`), suivi d'une ligne vide.
- Préfixe obligatoire : `INT.` (intérieur), `EXT.` (extérieur), `INT./EXT.` ou `I/E`
  (mixte, p. ex. voiture en mouvement). En France on rencontre aussi `SÉQ.` suivi d'un
  numéro : `SÉQ. 12 - INT. CUISINE - JOUR`.
- Le **lieu** va du général au particulier, séparé par des tirets :
  `INT. HÔPITAL - COULOIR DES URGENCES - NUIT`.
- Le **moment** termine l'intitulé : `JOUR`, `NUIT`, `AUBE`, `CRÉPUSCULE`, `MATIN`, `SOIR`,
  ou pour la continuité : `CONTINU`, `PLUS TARD`, `MÊME HEURE` (`DAY`, `NIGHT`,
  `CONTINUOUS`, `LATER` en anglais).
- Jamais de point final ; pas de mise en scène dans l'intitulé.
- La numérotation des séquences dans les deux marges (`12 … 12`) est réservée aux
  **versions de tournage** (shooting script), pas aux versions de lecture.

### 3.2 Action / description

- Pleine largeur (60 car.), interligne simple, une ligne vide entre chaque paragraphe.
- Présent de l'indicatif, voix active, uniquement **ce qui se voit ou s'entend**.
- Paragraphes courts : 3 à 4 lignes maximum recommandées ; un paragraphe par image ou par
  temps fort.
- En MAJUSCULES dans l'action :
  - le **nom d'un personnage à sa première apparition** : `MARCEL (60 ans), projectionniste voûté…` (ensuite en minuscules) ;
  - optionnellement les **bruits importants** (`La porte CLAQUE.`) et les mouvements de
    caméra si indispensables (`TRAVELLING sur…`) — à utiliser avec retenue ;
  - les inserts : `INSERT - LA LETTRE`, retour avec `RETOUR SCÈNE` (`BACK TO SCENE`).
- Pas de `nous voyons / we see` systématique, pas de direction d'acteurs ni d'objectifs de
  caméra sauf nécessité dramatique.

### 3.3 Nom de personnage (*character cue*)

- Retrait de 2,2 po (22 car.), **MAJUSCULES**, précédé d'une ligne vide, jamais seul en bas
  de page.
- Le nom doit rester **strictement identique** dans tout le script (pas de MARCEL puis
  M. DUPONT).
- Extensions entre parenthèses, collées au nom :
  - `(V.O.)` *voice over* — narration, téléphone entendu, pensée ; en France : `(VOIX OFF)` ;
  - `(O.S.)` *off screen* — le personnage est présent dans la scène mais hors champ ;
    en France : `(OFF)` ;
  - `(SUITE)` / `(CONT'D)` — même personnage qui reprend la parole après une action, ou
    dialogue repris après un saut de page.
- Personnages non nommés : fonction en majuscules (`LE SERVEUR`, `POLICIER 1`).

### 3.4 Didascalie (*parenthetical* / « parenthèse »)

- Retrait de 1,6 po (16 car.), largeur ≈ 24 car., **minuscules**, entre parenthèses, sans
  point final : `(un temps)`, `(à Marie, sèchement)`.
- Placée sous le nom du personnage ou entre deux répliques, jamais en fin de réplique.
- Réservée au strict nécessaire : ton, destinataire, micro-action. Si elle dépasse une
  ligne, c'est de l'action.

### 3.5 Dialogue

- Retrait de 1,0 po (10 car.), largeur **3,5 po ≈ 35 caractères**, interligne simple.
- Jamais coupé d'un saut de page sans marqueurs : `(SUITE)` (`(MORE)`) en bas de page,
  puis `NOM (SUITE)` (`NAME (CONT'D)`) en haut de la page suivante. La coupe se fait entre
  deux phrases, jamais au milieu d'une phrase.
- Dialogues simultanés (*dual dialogue*) : deux colonnes côte à côte — à réserver aux cas
  indispensables.
- Les chiffres se écrivent en toutes lettres dans les dialogues (`dix-sept`, pas `17`).

### 3.6 Transitions

- Alignées à **droite**, MAJUSCULES, terminées par deux-points : `CUT TO:`, `DISSOLVE TO:`,
  `SMASH CUT TO:` ; en France : `FONDU AU NOIR :`, `FONDU ENCHAÎNÉ :`.
- Exceptions alignées à **gauche** : `FADE IN:` (`OUVERTURE EN FONDU :`) en tout début de
  script ; `FADE OUT.` / `FIN` en toute fin.
- Le *cut* étant implicite entre deux séquences, les transitions explicites sont rares dans
  une version de lecture.

### 3.7 Plans (*shots*) et texte centré

- Un plan imposé s'écrit comme un intitulé à la marge gauche : `GROS PLAN - LA CLÉ`,
  `VUE AÉRIENNE`. À éviter hors nécessité.
- Le texte centré sert aux cartons : `FIN`, `TROIS ANS PLUS TARD`.

## 4. Page de titre

- **Titre** en MAJUSCULES, centré, au tiers supérieur de la page (souligné ou non).
- Deux lignes plus bas, centré : `écrit par` (`written by`), puis le **nom de l'auteur**.
- Le cas échéant : `d'après l'œuvre de…` (source), numéro de version et date.
- **Coordonnées** (auteur ou agent) en bas à gauche ; n° d'enregistrement (SACD, WGA…)
  en bas à droite si souhaité.
- Aucun numéro de page, aucune illustration, même police Courier 12.

## 5. Règles de pagination

1. ≈ 55 lignes de texte par page, numéro en haut à droite suivi d'un point, page 1 non
   numérotée.
2. Un **intitulé de séquence n'est jamais orphelin** en bas de page : au moins deux lignes
   d'action doivent le suivre, sinon il passe à la page suivante.
3. Un **nom de personnage n'est jamais seul** en bas de page : au moins une ligne de
   dialogue doit suivre.
4. Une didascalie ne termine jamais une page.
5. Dialogue coupé : `(SUITE)`/`(MORE)` + reprise `NOM (SUITE)`/`(CONT'D)` (§ 3.5).
6. Un paragraphe d'action peut se couper librement entre deux lignes.
7. `SUITE`/`CONTINUED` en haut/bas de page pour les scènes à cheval : réservé aux versions
   de tournage, désuet en lecture.

## 6. Usages spécifiques français

- Le format américain ci-dessus est aujourd'hui la norme de fait en France (CNC, ateliers,
  concours). Subsistent quelques usages locaux :
  - `SÉQ.` + numéro dans les intitulés ; `JOUR/NUIT` parfois abrégés `J/N` ;
  - `(OFF)` pour hors-champ et `(VOIX OFF)` pour la narration ;
  - papier A4 (21 × 29,7 cm) avec les mêmes marges — la règle 1 page ≈ 1 minute reste
    approximativement valable ;
  - la « continuité dialoguée » traditionnelle (présentation en deux colonnes
    image/son) ne subsiste que dans certains documentaires et doublages : hors périmètre.
- Typographie française dans les dialogues et l'action : espaces insécables avant `; : ! ?`,
  guillemets « … », tirets cadratins pour les incises — tolérés mais beaucoup de
  productions gardent la typographie simple (ASCII) héritée des logiciels anglo-saxons.

## 7. Ce que vérifie l'application (lint)

| Code | Vérification | Sévérité |
|---|---|---|
| `scene-caps` | Intitulé de séquence entièrement en majuscules | avertissement |
| `scene-time` | Présence du moment (JOUR/NUIT…) en fin d'intitulé | info |
| `char-blank` | Ligne seule en MAJUSCULES traitée comme action (réplique oubliée ?) | info |
| `paren-style` | Didascalie en minuscules, sans point final | info |
| `paren-orphan` | Didascalie hors d'un bloc de dialogue | avertissement |
| `paren-long` | Didascalie de plus d'une ligne (devrait être de l'action) | info |
| `transition-colon` | Transition terminée par `:` | info |
| `action-long` | Paragraphe d'action > 6 lignes | info |
| `dialogue-long` | Réplique > 12 lignes | info |

Le formatage « dur » (retraits, largeurs, casse d'affichage, pagination, `(SUITE)`) est
appliqué automatiquement par l'éditeur et l'export : il n'a pas besoin d'être vérifié.
