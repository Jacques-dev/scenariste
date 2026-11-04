// Spécification machine des règles de formatage d'un scénario professionnel.
// Référence détaillée : docs/REGLES_FORMATAGE.md
// Unités : les retraits et largeurs sont en caractères Courier 12 pt (1 car. = 0,1 po),
// mesurés depuis la marge gauche du texte (elle-même à 1,25 po du bord de page).

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
  // Marges latérales égales : le bloc de texte (6 po) est centré sur la page.
  marginLeftIn: 1.25,
  marginRightIn: 1.25,
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
  'JOUR', 'NUIT', 'AUBE', 'CRÉPUSCULE', 'MATIN', 'MATINÉE', 'MIDI', 'APRÈS-MIDI', 'SOIR',
  'SOIRÉE', 'CONTINU', 'CONTINUITÉ', 'PLUS TARD', 'PLUS TÔT', 'MÊME HEURE', 'MÊME MOMENT',
  'DAY', 'NIGHT', 'DAWN', 'DUSK', 'MORNING', 'AFTERNOON', 'EVENING', 'CONTINUOUS', 'LATER',
].sort((a, b) => b.length - a.length) // « APRÈS-MIDI » avant « MIDI » dans les alternatives

/** Un moment (mot entier, accents compris). */
const TIME_WORD = `(?<![\\p{L}])(?:${SCENE_TIMES.join('|')})(?![\\p{L}])`

export const REGEX = {
  /** Intitulé de séquence : INT./EXT./I/E/SÉQ, numéro de séquence optionnel devant. */
  scene: /^(?:\d+[.)]?\s+)?(?:INT(ÉRIEUR)?|EXT(ÉRIEUR)?|I\/E|INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|SÉQ|SEQ)[\s.:/]/i,
  /** Transitions connues (le test de casse est fait à part). */
  transitionWord: /^(FADE (IN|OUT|TO)|FONDU( (AU|ENCHAÎNÉ|NOIR|BLANC))*( :)?|CUT TO|SMASH CUT( TO)?|MATCH CUT( TO)?|DISSOLVE TO|OUVERTURE EN FONDU|FIN)\b/i,
  /** Clé de bloc titre en tête de document : « Titre: … ». */
  titleKey: /^(titre|title|auteur(s)?|author(s)?|écrit par|written by|credit|crédit|contact|date|source|copyright|version|draft( date)?)\s*:/i,
  /** Extension de personnage : (V.O.), (OFF), (SUITE)… */
  charExtension: /\(([^)]*)\)\s*$/,
  /**
   * Moment dans le dernier segment de l'intitulé, après un tiret, avec
   * qualificatifs et précisions entre parenthèses admis :
   * « - JOUR », « - FIN DE NUIT », « - JOUR ET NUIT (MONTAGE) », « - NUIT (PLUS TÔT) ».
   * Le tiret d'« APRÈS-MIDI » n'est pas un séparateur (pas d'espace autour).
   */
  sceneTime: new RegExp(`(?:\\s[-–—]|[-–—]\\s)(?:(?!\\s[-–—]|[-–—]\\s).)*${TIME_WORD}(?:(?!\\s[-–—]|[-–—]\\s).)*$`, 'iu'),
}

/** Vrai si la ligne est entièrement en majuscules (accents compris) et contient des lettres. */
export function isUpperLine(s: string): boolean {
  return /\p{L}/u.test(s) && s === s.toLocaleUpperCase('fr-FR')
}
