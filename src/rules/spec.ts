// Spécification machine des règles de formatage d'un scénario professionnel.
// Référence détaillée : docs/REGLES_FORMATAGE.md
// Unités : les retraits et largeurs sont en caractères Courier 12 pt (1 car. = 0,1 po),
// mesurés depuis la marge gauche du texte (elle-même à 1,5 po du bord de page).

export type ElType =
  | 'scene'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'centered'
  | 'title'
  | 'blank'

export interface ElementSpec {
  /** Retrait depuis la marge gauche du texte, en caractères Courier. */
  indentCh: number
  /** Largeur maximale du texte, en caractères Courier. */
  widthCh: number
  /** L'élément s'affiche et s'exporte en MAJUSCULES. */
  uppercase: boolean
  /** Alignement particulier. */
  align?: 'right' | 'center'
  /** Lignes vides insérées avant l'élément à la pagination. */
  blanksBefore: number
  /** Nom affiché dans l'interface. */
  label: string
}

export const PAGE = {
  paper: 'letter' as const,
  marginTopIn: 1,
  marginBottomIn: 1,
  marginLeftIn: 1.5,
  marginRightIn: 1,
  /** Largeur utile du texte : 6 po à 10 car./po. */
  contentWidthCh: 60,
  /** ≈ 55 lignes de texte par page (6 lignes/po). */
  linesPerPage: 55,
  fontFamily: "'Courier Prime', Courier, monospace",
  fontSizePt: 12,
  lineHeightPt: 12,
}

export const ELEMENTS: Record<Exclude<ElType, 'blank'>, ElementSpec> = {
  scene:         { indentCh: 0,  widthCh: 60, uppercase: true,  blanksBefore: 2, label: 'Intitulé de séquence' },
  action:        { indentCh: 0,  widthCh: 60, uppercase: false, blanksBefore: 1, label: 'Action' },
  character:     { indentCh: 22, widthCh: 38, uppercase: true,  blanksBefore: 1, label: 'Personnage' },
  parenthetical: { indentCh: 16, widthCh: 24, uppercase: false, blanksBefore: 0, label: 'Didascalie' },
  dialogue:      { indentCh: 10, widthCh: 35, uppercase: false, blanksBefore: 0, label: 'Dialogue' },
  transition:    { indentCh: 0,  widthCh: 60, uppercase: true,  align: 'right', blanksBefore: 1, label: 'Transition' },
  centered:      { indentCh: 0,  widthCh: 60, uppercase: false, align: 'center', blanksBefore: 1, label: 'Texte centré' },
  title:         { indentCh: 0,  widthCh: 60, uppercase: false, blanksBefore: 0, label: 'Page de titre' },
}

/** Marqueurs de coupure de dialogue en bas / haut de page. */
export const LABELS = {
  more: '(SUITE)',
  contd: '(SUITE)',
}

/** Moments acceptés en fin d'intitulé de séquence. */
export const SCENE_TIMES = [
  'JOUR', 'NUIT', 'AUBE', 'CRÉPUSCULE', 'MATIN', 'SOIR', 'CONTINU', 'PLUS TARD',
  'MÊME HEURE', 'DAY', 'NIGHT', 'DAWN', 'DUSK', 'MORNING', 'EVENING', 'CONTINUOUS', 'LATER',
  'SAME',
]

/**
 * Moments hors usage → moment standard le plus proche. L'usage professionnel
 * (Final Draft, guides de format) : JOUR ou NUIT par défaut ; AUBE, MATIN,
 * SOIR, CRÉPUSCULE seulement si l'histoire l'exige ; CONTINU, PLUS TARD,
 * MÊME HEURE pour la continuité. La nuance (« fin de journée », « 8 h ») a sa
 * place dans l'action, pas dans l'intitulé, qui sert au plan de travail.
 * Clés sans accents, en majuscules.
 */
const NONSTANDARD_TIMES: Record<string, string> = {
  'JOURNEE': 'JOUR', 'EN JOURNEE': 'JOUR', 'MILIEU DE JOURNEE': 'JOUR', 'MIDI': 'JOUR',
  'APRES-MIDI': 'JOUR', 'APRES MIDI': 'JOUR', 'DEBUT D\'APRES-MIDI': 'JOUR',
  'DEBUT DE JOURNEE': 'MATIN', 'MATINEE': 'MATIN', 'DEBUT DE MATINEE': 'MATIN',
  'FIN DE MATINEE': 'MATIN', 'TOT LE MATIN': 'MATIN',
  'FIN DE JOURNEE': 'SOIR', 'FIN D\'APRES-MIDI': 'SOIR', 'FIN D\'APRES MIDI': 'SOIR',
  'SOIREE': 'SOIR', 'DEBUT DE SOIREE': 'SOIR', 'DEBUT DE SOIR': 'SOIR',
  'FIN DE SOIREE': 'NUIT', 'TARD LE SOIR': 'NUIT', 'MINUIT': 'NUIT', 'MILIEU DE LA NUIT': 'NUIT',
  'FIN DE NUIT': 'AUBE', 'PETIT MATIN': 'AUBE', 'AURORE': 'AUBE', 'POINT DU JOUR': 'AUBE',
  'LEVER DU JOUR': 'AUBE', 'LEVER DU SOLEIL': 'AUBE', 'PETIT JOUR': 'AUBE',
  'COUCHER DU SOLEIL': 'CRÉPUSCULE', 'TOMBEE DE LA NUIT': 'CRÉPUSCULE',
  'TOMBEE DU JOUR': 'CRÉPUSCULE', 'NUIT TOMBANTE': 'CRÉPUSCULE',
  'ENTRE CHIEN ET LOUP': 'CRÉPUSCULE', 'BRUNANTE': 'CRÉPUSCULE',
  'SUITE': 'CONTINU', 'EN CONTINU': 'CONTINU', 'CONTINUITE': 'CONTINU',
  'PEU APRES': 'PLUS TARD', 'ENSUITE': 'PLUS TARD',
  'MEME MOMENT': 'MÊME HEURE', 'AU MEME MOMENT': 'MÊME HEURE', 'SIMULTANEMENT': 'MÊME HEURE',
  'AFTERNOON': 'DAY', 'NOON': 'DAY', 'MIDDAY': 'DAY', 'SUNRISE': 'DAWN', 'SUNSET': 'DUSK',
  'TWILIGHT': 'DUSK', 'MIDNIGHT': 'NIGHT', 'LATE NIGHT': 'NIGHT', 'CONTINUED': 'CONTINUOUS',
}

/**
 * Moment standard à proposer à la place de `segment` (fin d'intitulé après le
 * dernier « - »), ou null s'il est déjà standard ou ne ressemble pas à un moment.
 */
export function suggestSceneTime(segment: string): string | null {
  const up = segment.toLocaleUpperCase('fr-FR').replace(/\s+/g, ' ').replace(/[’]/g, '\'').trim()
  if (SCENE_TIMES.includes(up)) return null
  const key = up.normalize('NFD').replace(/\p{M}/gu, '')
  if (NONSTANDARD_TIMES[key]) return NONSTANDARD_TIMES[key]
  // Heure d'horloge (« 8H », « 14 H 30 », « 22:00 ») : jour ou nuit.
  const clock = /^(\d{1,2})\s*(?:H|:)\s*(\d{2})?$/.exec(up)
  if (clock) { const h = Number(clock[1]); return h >= 7 && h < 20 ? 'JOUR' : 'NUIT' }
  // Moment standard noyé dans une tournure (« TARD DANS LA NUIT », « QUELQUES INSTANTS PLUS TARD »).
  let best: { at: number; time: string } | null = null
  for (const time of SCENE_TIMES) {
    const m = new RegExp(`(?<![\\p{L}])${time}(?![\\p{L}])`, 'u').exec(up)
    if (m && (!best || m.index < best.at)) best = { at: m.index, time }
  }
  return best?.time ?? null
}

export const REGEX = {
  /** Intitulé de séquence : INT./EXT./I/E/SÉQ, numéro de séquence optionnel devant. */
  scene: /^(?:\d+[.)]?\s+)?(?:INT(ÉRIEUR)?|EXT(ÉRIEUR)?|I\/E|INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|SÉQ|SEQ)[\s.:/\-–—]/i,
  /** Transitions connues (le test de casse est fait à part). */
  transitionWord: /^(FADE (IN|OUT|TO)|FONDU( (AU|ENCHAÎNÉ|NOIR|BLANC))*( :)?|CUT TO|SMASH CUT( TO)?|MATCH CUT( TO)?|DISSOLVE TO|OUVERTURE EN FONDU)\b/i,
  /** Carton de fin, centré : « FIN », « THE END ». */
  end: /^(FIN|THE END)\.?$/,
  /** Clé de bloc titre en tête de document : « Titre: … ». */
  titleKey: /^(titre|title|auteur(s)?|author(s)?|écrit par|written by|credit|crédit|contact|date|source|copyright|version|draft( date)?)\s*:/i,
  /** Extension(s) de personnage en fin de ligne : (V.O.), (OFF), (H.C.) (SUITE)… — le groupe capture la dernière. */
  charExtension: /(?:\s*\(([^)]*)\))+\s*$/,
  /** Extensions reconnues sur la ligne du personnage ; tout le reste est une didascalie. */
  knownExtension: /^(V\.?\s?O\.?|VOIX OFF|O\.?\s?S\.?|O\.?\s?C\.?|OFF|H\.?\s?C\.?|HORS CHAMP|SUITE|CONT'D|CONT\.?|V\.?\s?F\.?|PRE-LAP|PRÉ-LAP|AU TÉLÉPHONE|TÉLÉPHONE|FILTRÉ|SUR L'ÉCRAN)$/i,
  /** Moment en fin d'intitulé. */
  sceneTime: new RegExp(`[-–—]\\s*(${SCENE_TIMES.join('|')})\\s*$`, 'i'),
  /**
   * Intitulé et action sur la même ligne (« 1. INT. CHAMBRE - NUIT : Arthur dort. »),
   * typique d'un élément de montage : traité comme de l'action, pas comme un intitulé.
   */
  sceneInline: new RegExp(`(${SCENE_TIMES.join('|')})\\s*:\\s+\\S+(?:\\s+\\S+){2,}`, 'iu'),
}

/** Vrai si la ligne est entièrement en majuscules (accents compris) et contient des lettres. */
export function isUpperLine(s: string): boolean {
  return /\p{L}/u.test(s) && s === s.toLocaleUpperCase('fr-FR')
}
