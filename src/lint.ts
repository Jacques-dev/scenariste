import { ParsedLine } from './parser'
import { wrap } from './paginate'
import { ELEMENTS, REGEX, SCENE_TIMES, isUpperLine } from './rules/spec'

export type Severity = 'warn' | 'info'

/** Correction automatique applicable à la (ou aux) ligne(s) concernée(s). */
export interface Fix {
  label: string
  apply: (lineText: string) => string
  /** Lignes supplémentaires auxquelles appliquer la même transformation. */
  lines?: number[]
  /** true : correction à décider au cas par cas, exclue de « Tout corriger ». */
  manual?: boolean
  /**
   * Correction sur plusieurs lignes : `apply` reçoit les `span` lignes à partir de
   * chaque ligne visée, jointes par « \n », et renvoie leur remplacement.
   */
  span?: number
}

export interface Issue {
  lineNo: number
  ruleId: string
  severity: Severity
  message: string
  fix?: Fix
}

const upper = (s: string) => s.toLocaleUpperCase('fr-FR')
const deaccent = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '')
const normName = (s: string) => deaccent(upper(s)).replace(/\s+/g, ' ').trim()

/** Moment en fin de ligne, sans exiger le tiret. */
const TIME_END = new RegExp(`\\s+(${SCENE_TIMES.join('|')})\\s*$`, 'i')
/** Moment n'importe où dans la ligne (mot entier, accents compris). */
const TIME_ANY = new RegExp(`(?<![\\p{L}])(${SCENE_TIMES.join('|')})(?![\\p{L}])`, 'iu')
/** INT/EXT sans point ni slash derrière (espace ou tiret : « INT LIEU », « INT-NUIT-LIEU »). */
const PREFIX_NO_DOT = /^(int|ext)(?=\s|[-–—])/i
/** Précisions entre parenthèses en fin d'intitulé : « - NUIT (FLASHBACK) ». */
const TRAILING_PARENS = /(?:\s*\([^)]*\))+\s*$/

/** Sépare un intitulé en corps et précisions finales entre parenthèses. */
function splitHeading(line: string): [string, string] {
  const m = TRAILING_PARENS.exec(line)
  return m ? [line.slice(0, m.index), m[0]] : [line, '']
}

/** Applique `fn` au corps de l'intitulé, en conservant les précisions finales. */
const onBody = (fn: (body: string) => string) => (line: string) => {
  const [body, tail] = splitHeading(line)
  return fn(body) + tail
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** « ÉVA » → « Éva », « JEAN-PAUL » → « Jean-Paul ». */
const titleCase = (s: string) =>
  s.toLocaleLowerCase('fr-FR').replace(/(^|[-\s])(\p{L})/gu, (_m, a, b) => a + upper(b))
/** Nom propre d'un seul mot (pas une fonction comme « L'INSPECTEUR » ou « LE CROUPIER »). */
const PROPER_NAME = /^\p{L}[\p{L}-]*$/u
/** Occurrence au sein d'un groupe en majuscules (« PARENTS D'ÉVA ») : à ignorer. */
const IN_CAPS_GROUP = /\p{Lu}{2,}['’\s]+(?:D['’])?$/u

/** Distance d'édition ≤ 1 entre deux noms (substitution, insertion ou suppression). */
function near(a: string, b: string): boolean {
  if (a === b) return false
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > 1) return false
  if (la === lb) {
    let diff = 0
    for (let i = 0; i < la; i++) if (a[i] !== b[i] && ++diff > 1) return false
    return diff === 1
  }
  const [s, l] = la < lb ? [a, b] : [b, a]
  let i = 0
  let j = 0
  let skipped = false
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) { i++; j++ }
    else if (!skipped) { skipped = true; j++ }
    else return false
  }
  return true
}

/* --- nombres en toutes lettres (0 à 999 999) --- */
const UNITS = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf',
]
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', '', 'quatre-vingt']

function below100(n: number): string {
  if (n < 20) return UNITS[n]
  const t = Math.floor(n / 10)
  const u = n % 10
  if (t === 7 || t === 9) {
    const base = t === 7 ? 'soixante' : 'quatre-vingt'
    if (t === 7 && u === 1) return 'soixante et onze'
    return `${base}-${UNITS[10 + u]}`
  }
  if (u === 0) return t === 8 ? 'quatre-vingts' : TENS[t]
  if (u === 1 && t !== 8) return `${TENS[t]} et un`
  return `${TENS[t]}-${UNITS[u]}`
}

function below1000(n: number): string {
  const h = Math.floor(n / 100)
  const r = n % 100
  if (h === 0) return below100(r)
  const cent = h === 1 ? 'cent' : `${UNITS[h]} cent${r === 0 ? 's' : ''}`
  return r === 0 ? cent : `${cent} ${below100(r)}`
}

export function numberToFrench(n: number): string {
  if (n < 1000) return below1000(n)
  const k = Math.floor(n / 1000)
  const r = n % 1000
  // « cent » et « vingt » perdent leur s devant « mille » : deux cent mille.
  const mille = k === 1 ? 'mille' : `${below1000(k).replace(/(cent|vingt)s$/, '$1')} mille`
  return r === 0 ? mille : `${mille} ${below1000(r)}`
}

/**
 * Nombres isolés uniquement : « 15 heures », « 30 000 » (milliers séparés par une
 * espace) oui ; « 15h », « A4 » ou les décimaux « 3,5 » non.
 */
const LONE_NUMBER = /(?<![\p{L}\d]|\d[,.])(?:\d{1,3}(?:[   ]\d{3})(?![\d])|\d{1,6})(?![\p{L}\d]|[,.]\d)(\s*[€%])?/gu
const hasLoneNumber = (s: string) => s.search(LONE_NUMBER) >= 0
const numbersToWords = (s: string) =>
  s.replace(LONE_NUMBER, (m, unit?: string) => {
    const words = numberToFrench(parseInt(m.replace(/\D/g, ''), 10))
    if (!unit) return words
    return `${words} ${unit.trim() === '€' ? 'euros' : 'pour cent'}`
  })

/** Ligne de bloc titre : « Clé: valeur ». */
const titleValue = (parsed: ParsedLine[], key: RegExp) => {
  const l = parsed.find(p => p.type === 'title' && key.test(p.text))
  return l ? { line: l, value: l.text.replace(/^[^:]*:/, '').trim() } : null
}

/** Didascalie collée à la réplique : « (un temps)Bon. » */
const PAREN_INLINE = /^(\s*\([^)]*\))\s*(\S.*)$/
/** Emphase façon Markdown/Fountain : **gras**, *italique*. */
const EMPHASIS = /\*{1,3}(?=\S)([^*]*?\S)\*{1,3}/g

/** Réécrit le nom d'une ligne de personnage en conservant @ et l'extension (V.O.)… */
function renameCue(main: string) {
  return (line: string) =>
    line.replace(/^(\s*@?\s*)(.*?)(\s*\([^)]*\))?\s*$/u, (_m, pre, _name, ext) => `${pre}${main}${ext ?? ''}`)
}

function nextNonBlank(parsed: ParsedLine[], from: number): ParsedLine | undefined {
  for (let i = from + 1; i < parsed.length; i++) {
    if (parsed[i].type !== 'blank') return parsed[i]
  }
  return undefined
}

/** Vérifie le texte contre les règles de docs/REGLES_FORMATAGE.md (§7). */
export function lint(parsed: ParsedLine[]): Issue[] {
  const issues: Issue[] = []
  const add = (lineNo: number, ruleId: string, severity: Severity, message: string, fix?: Fix) =>
    issues.push({ lineNo, ruleId, severity, message, fix })

  let actionRun = 0
  let actionRunStart = -1
  let dialogueRun = 0
  let dialogueRunStart = -1

  // Noms des personnages qui parlent (forme normalisée), connus d'avance.
  const cueNames = new Set<string>()
  const cueDisplay = new Map<string, string>()
  for (const p of parsed) {
    if (p.type !== 'character') continue
    const core = p.text.replace(REGEX.charExtension, '').trim()
    if (core.length < 2) continue
    const key = normName(core)
    cueNames.add(key)
    if (!cueDisplay.has(key)) cueDisplay.set(key, upper(core))
  }

  // Noms de personnages : variantes regroupées par forme normalisée.
  const charGroups = new Map<string, Map<string, { count: number; firstLine: number; lines: number[] }>>()

  const flushRuns = () => {
    if (actionRun > 6)
      add(actionRunStart, 'action-long', 'info',
        `Paragraphe d'action de ${actionRun} lignes : aérez (3–4 lignes recommandées).`)
    if (dialogueRun > 12)
      add(dialogueRunStart, 'dialogue-long', 'info',
        `Réplique de ${dialogueRun} lignes : envisagez de la couper par de l'action.`)
    actionRun = 0
    dialogueRun = 0
  }

  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i]
    const prev = parsed[i - 1]
    const next = parsed[i + 1]

    if (p.type === 'action') {
      if (actionRun === 0) actionRunStart = p.lineNo
      // Lignes réellement imprimées (une ligne de l'éditeur peut en faire plusieurs).
      actionRun += wrap(p.text, ELEMENTS.action.widthCh).length
    } else if (actionRun > 0 && p.type === 'blank') { flushRuns() }

    if (p.type === 'dialogue') {
      if (dialogueRun === 0) dialogueRunStart = p.lineNo
      dialogueRun += wrap(p.text, ELEMENTS.dialogue.widthCh).length
    } else if (dialogueRun > 0 && p.type !== 'parenthetical') { flushRuns() }

    // Doubles espaces (hors bloc titre et lignes vides).
    if (p.type !== 'blank' && p.type !== 'title' && /\S {2,}\S/.test(p.text))
      add(p.lineNo, 'double-space', 'info', 'Doubles espaces dans la ligne.', {
        label: 'Corriger',
        apply: line => line.replace(/(\S) {2,}(?=\S)/g, '$1 '),
      })

    // Ni gras ni italique dans un scénario (§1) : reliquat de traitement de texte.
    EMPHASIS.lastIndex = 0
    if (p.type !== 'blank' && p.type !== 'title' && EMPHASIS.test(p.text))
      add(p.lineNo, 'emphasis', 'info',
        'Pas de gras ni d\'italique dans un scénario : les astérisques seront imprimés tels quels.', {
          label: 'Retirer les astérisques',
          apply: line => line.replace(EMPHASIS, '$1'),
        })

    switch (p.type) {
      case 'scene': {
        if (!isUpperLine(p.text))
          add(p.lineNo, 'scene-caps', 'warn',
            "L'intitulé de séquence doit être entièrement en MAJUSCULES.", {
              label: 'Mettre en majuscules',
              apply: line => upper(line),
            })
        if (PREFIX_NO_DOT.test(p.text))
          add(p.lineNo, 'scene-prefix', 'info',
            'Ajoutez un point après le préfixe : « INT. », « EXT. ».', {
              label: 'Ajouter le point',
              apply: line => line.replace(/^(\s*)(int|ext)\s*[-–—]?\s*/i, (_m, a, b) => `${a}${upper(b)}. `),
            })
        // Le moment est cherché dans le dernier segment (après le dernier tiret), hors
        // précisions entre parenthèses : « - NUIT (FLASHBACK) », « - FIN DE NUIT » et
        // « - JOUR ET NUIT » sont valides ; « RADE DE NUIT - SOIR » a pour moment SOIR.
        const [body] = splitHeading(p.text)
        const lastDash = Math.max(body.lastIndexOf('-'), body.lastIndexOf('–'), body.lastIndexOf('—'))
        const hasDashTime = lastDash >= 0 && TIME_ANY.test(body.slice(lastDash + 1))
        const hasEndTime = TIME_END.test(body)
        if (!hasDashTime && hasEndTime)
          add(p.lineNo, 'scene-sep', 'info',
            'Séparez le moment par un tiret : « - JOUR ».', {
              label: 'Ajouter le tiret',
              apply: onBody(b => b.replace(TIME_END, (_m, t) => ` - ${upper(t)}`)),
            })
        if (!hasDashTime && !hasEndTime) {
          const misplaced = TIME_ANY.exec(body)
          if (misplaced)
            add(p.lineNo, 'scene-time-order', 'info',
              `Le moment se place en fin d'intitulé : « INT. LIEU - ${upper(misplaced[1])} ».`, {
                label: 'Déplacer à la fin',
                apply: onBody(line => {
                  const m = TIME_ANY.exec(line)
                  if (!m) return line
                  let rest = line.slice(0, m.index) + line.slice(m.index + m[0].length)
                  rest = rest
                    .replace(/\s*[-–—]\s*[-–—]\s*/g, ' - ') // tirets doublés
                    .replace(/([.:])\s*[-–—]\s*/, '$1 ')    // tiret collé au préfixe
                    .replace(/\s*[-–—]\s*$/, '')            // tiret final orphelin
                    .replace(/\s{2,}/g, ' ')
                    .trimEnd()
                  return `${rest} - ${upper(m[1])}`
                }),
              })
          else
            add(p.lineNo, 'scene-time', 'info',
              'Terminez l\'intitulé par le moment : « INT. MAISON DE CAMPAGNE - JOUR ».')
        }
        if (/\.$/.test(p.text))
          add(p.lineNo, 'scene-period', 'info',
            'Pas de point final dans un intitulé de séquence.', {
              label: 'Retirer le point',
              apply: line => line.replace(/\.\s*$/, ''),
            })
        const after = nextNonBlank(parsed, i)
        if (!after || after.type === 'scene' || after.type === 'transition')
          add(p.lineNo, 'scene-empty', 'warn',
            'Séquence vide : décrivez au moins une action sous l\'intitulé.')
        break
      }
      case 'character': {
        const core = p.text.replace(REGEX.charExtension, '').trim()
        if (core) {
          const key = normName(core)
          if (!charGroups.has(key)) charGroups.set(key, new Map())
          const variants = charGroups.get(key)!
          const v = variants.get(core)
          if (v) { v.count++; v.lines.push(p.lineNo) }
          else variants.set(core, { count: 1, firstLine: p.lineNo, lines: [p.lineNo] })
        }
        const exts = [...p.text.slice(core.length).matchAll(/\(([^)]*)\)/g)].map(m => m[1].trim())
        if (core && exts.some(e => !REGEX.knownExtension.test(e)))
          add(p.lineNo, 'char-paren', 'warn',
            'Sur la ligne du nom, seules les extensions (V.O.), (OFF), (SUITE)… sont admises : ' +
            'une indication de jeu se place sur sa propre ligne, entre le nom et la réplique.', {
              label: 'Passer à la ligne',
              apply: line => {
                const m = REGEX.charExtension.exec(line)
                if (!m) return line
                const all = [...m[0].matchAll(/\(([^)]*)\)/g)].map(x => x[1].trim())
                const keep = all.filter(e => REGEX.knownExtension.test(e)).map(e => ` (${e})`).join('')
                const moved = all.filter(e => !REGEX.knownExtension.test(e))
                  .map(e => `\n(${e.toLocaleLowerCase('fr-FR')})`).join('')
                return line.slice(0, m.index) + keep + moved
              },
            })
        break
      }
      case 'parenthetical': {
        const inner = p.text.replace(/^\(|\)$/g, '').trim()
        // « (SUITE) », « (OFF) »… seuls sous le nom : ce sont des extensions du nom.
        if (prev?.type === 'character' && /\)\s*$/.test(p.text) && REGEX.knownExtension.test(inner)) {
          add(p.lineNo, 'paren-ext', 'warn',
            `« (${inner}) » est une extension du nom, pas une didascalie : elle se place sur la ligne du personnage.`, {
              label: 'Remonter sur la ligne du nom',
              lines: [prev.lineNo],
              span: 2,
              apply: block => {
                const [name, ext] = block.split('\n')
                return `${name.trimEnd()} ${ext.trim()}`
              },
            })
          break
        }
        // Didascalie et réplique sur la même ligne : on les sépare d'abord, les
        // autres vérifications porteront ensuite sur la didascalie seule.
        if (PAREN_INLINE.test(p.text)) {
          add(p.lineNo, 'paren-inline', 'warn',
            'Didascalie et réplique sur la même ligne : la réplique va à la ligne suivante.', {
              label: 'Séparer',
              apply: line => line.replace(PAREN_INLINE, '$1\n$2'),
            })
          break
        }
        // Majuscule initiale admise devant un nom de personnage (« (à Paul) » non,
        // « (Paul se lève) » oui) ou un sigle.
        const firstWord = /^[\p{L}'’.]+/u.exec(inner)?.[0] ?? ''
        const capOk = cueNames.has(normName(firstWord)) || (firstWord.length > 1 && isUpperLine(firstWord))
        const badCap = /^\p{Lu}/u.test(inner) && !capOk
        // Point final, mais pas les points de suspension.
        const badPeriod = /(?<!\.)\.\s*\)?\s*$/.test(p.text)
        if (badCap || badPeriod)
          add(p.lineNo, 'paren-style', 'info',
            badCap
              ? 'Didascalie en minuscules, sans point final : « (un temps) ».'
              : 'Pas de point final dans une didascalie : « (un temps) ».', {
              label: 'Corriger',
              apply: line => {
                let out = line
                if (badCap) out = out.replace(/\(\s*(\p{Lu})/u, m => m.toLocaleLowerCase('fr-FR'))
                if (badPeriod) out = out.replace(/(?<!\.)\.\s*(\)?)\s*$/, '$1')
                return out
              },
            })
        if (inner.length > ELEMENTS.parenthetical.widthCh * 2)
          add(p.lineNo, 'paren-long', 'info',
            'Didascalie de plus de deux lignes : écrivez-la plutôt en action.')
        if (!/\)\s*$/.test(p.text))
          add(p.lineNo, 'paren-close', 'warn', 'Parenthèse non refermée.', {
            label: 'Fermer',
            apply: line => line.replace(/\s*$/, ')'),
          })
        const after = nextNonBlank(parsed, i)
        if (!after || (after.type !== 'dialogue' && after.type !== 'parenthetical'))
          add(p.lineNo, 'paren-end', 'warn',
            'Une didascalie ne termine jamais une réplique : déplacez-la avant le dialogue ou écrivez-la en action.', {
              label: 'Passer en action',
              manual: true,
              apply: line => {
                const inner = line.trim().replace(/^\(|\)$/g, '').trim()
                const cap = inner.charAt(0).toLocaleUpperCase('fr-FR') + inner.slice(1)
                return `\n${cap}${/[.!?…]$/.test(cap) ? '' : '.'}`
              },
            })
        break
      }
      case 'dialogue': {
        // Action collée sous une réplique, sans ligne vide : « Arthur sourit, … ».
        if (prev?.type === 'dialogue') {
          const words = p.text.split(/\s+/)
          for (let n = 1; n <= 3 && n < words.length; n++) {
            const name = normName(words.slice(0, n).join(' '))
            if (cueNames.has(name) && /^\p{Ll}/u.test(words[n])) {
              add(p.lineNo, 'dialogue-action', 'warn',
                'Cette ligne ressemble à de l\'action collée sous la réplique : ' +
                'sans ligne vide avant, elle est imprimée comme du dialogue.', {
                  label: 'Insérer une ligne vide avant',
                  manual: true,
                  apply: line => `\n${line}`,
                })
              break
            }
          }
        }
        if (hasLoneNumber(p.text))
          add(p.lineNo, 'dialogue-digits', 'info',
            'Dans un dialogue, les nombres s\'écrivent en toutes lettres (« dix-sept », pas « 17 »).', {
              label: 'Écrire en lettres',
              apply: numbersToWords,
            })
        break
      }
      case 'transition': {
        // « MARC : » suivi directement d'une réplique : un nom de personnage
        // écrit à la manière théâtrale, pris pour une transition.
        if (/:$/.test(p.text) && !REGEX.transitionWord.test(p.text) && next && next.type !== 'blank') {
          add(p.lineNo, 'char-colon', 'warn',
            'Pas de deux-points après le nom du personnage : « MARC », réplique dessous.', {
              label: 'Retirer « : »',
              apply: line => line.replace(/^(\s*)>?\s*/, '$1').replace(/\s*:\s*$/, ''),
            })
          break
        }
        // « FADE OUT. » et « FONDU AU NOIR. » admis en dernière ligne, avec leur point.
        const isLast = !nextNonBlank(parsed, i)
        const ending = /^(FADE OUT|FONDU AU (NOIR|BLANC))\b/i.test(p.text)
        if (!/:$/.test(p.text) && !/^FADE OUT\b/i.test(p.text) && !(ending && isLast))
          add(p.lineNo, 'transition-colon', 'info',
            'Une transition se termine par deux-points : « CUT TO: », « FONDU AU NOIR : ».', {
              label: 'Ajouter « : »',
              apply: line => line.replace(/\s*\.?\s*$/, /FONDU|OUVERTURE|COUPE/i.test(line) ? ' :' : ':'),
            })
        break
      }
      case 'action': {
        if (/^\(.*\)$/.test(p.text)) {
          let k = i - 1
          while (k >= 0 && parsed[k].type === 'blank') k--
          const heading = parsed[k]
          if (heading?.type === 'scene')
            add(p.lineNo, 'paren-orphan', 'warn',
              'Précision isolée sous l\'intitulé : intégrez-la à l\'intitulé, après le moment ' +
              '(« INT. BUREAU - JOUR (QUELQUES JOURS PLUS TARD) »).', {
                label: 'Intégrer à l\'intitulé',
                lines: [heading.lineNo],
                span: p.lineNo - heading.lineNo + 1,
                apply: block => {
                  const parts = block.split('\n')
                  return `${parts[0].trimEnd()} ${upper(parts[parts.length - 1].trim())}`
                },
              })
          else
            add(p.lineNo, 'paren-orphan', 'warn',
              'Didascalie hors d\'un bloc de dialogue : placez-la sous un nom de personnage.')
        }
        if (REGEX.scene.test(p.text) && REGEX.sceneInline.test(p.text))
          add(p.lineNo, 'scene-inline', 'info',
            'Intitulé et action sur la même ligne. Pour un montage : une ligne « MONTAGE - … », ' +
            'puis une entrée courte par plan (« Chambre d\'hôtel, nuit : Arthur… »), puis « FIN DU MONTAGE ». ' +
            'Sinon, séparez l\'intitulé et l\'action.')
        if (/\b(nous voyons|on voit|we see)\b/i.test(p.text))
          add(p.lineNo, 'action-we-see', 'info',
            'Décrivez directement l\'image : « nous voyons / on voit » est implicite.')
        // « la caméra suit… » oui ; « la caméra de surveillance » (un objet du décor) non.
        if (/\b(la caméra(?!\s+(de|du|des)\s)|travelling|panoramique|zoom (avant|arrière)|gros plan sur)/i.test(p.text))
          add(p.lineNo, 'action-camera', 'info',
            'Indication de caméra : à réserver aux nécessités dramatiques (c\'est le travail du réalisateur).')
        const prevBlank = !prev || prev.type === 'blank'
        const nextBlank = !next || next.type === 'blank'
        const core = p.text.replace(REGEX.charExtension, '').trim()
        if (prevBlank && nextBlank && core.length > 0 && core.length <= 30 &&
            isUpperLine(core) && !/[.!?…:]$/.test(core) && !REGEX.transitionWord.test(core))
          add(p.lineNo, 'char-blank', 'info',
            'Ligne seule en MAJUSCULES traitée comme action. Réplique manquante dessous ? ' +
            '(forcez un personnage avec « @ », une action avec « ! »)')
        break
      }
    }
  }
  flushRuns()

  // Casse des noms dans l'action : MAJUSCULES à la première apparition, casse normale ensuite.
  const actions = parsed.filter(p => p.type === 'action')
  // Seuls les noms propres d'un mot sont suivis : « LE CROUPIER » peut désigner plusieurs figurants.
  for (const name of cueDisplay.values()) {
    if (!PROPER_NAME.test(name)) continue
    const re = new RegExp(`(?<![\\p{L}])${escapeRe(name)}(?![\\p{L}])`, 'giu')
    let intro: ParsedLine | undefined
    const capsLines: number[] = []
    for (const a of actions) {
      for (const m of a.text.matchAll(re)) {
        if (!intro) {
          intro = a
          if (m[0] !== upper(m[0]))
            add(a.lineNo, 'char-intro', 'info',
              `Première apparition de « ${m[0]} » dans l'action : son nom s'écrit en MAJUSCULES.`, {
                label: 'Mettre en majuscules',
                apply: line => line.replace(new RegExp(re.source, 'iu'), x => upper(x)),
              })
          break
        }
        if (a === intro) break
        if (m[0] === name && !IN_CAPS_GROUP.test(a.text.slice(0, m.index))) {
          capsLines.push(a.lineNo)
          break
        }
      }
    }
    if (intro && capsLines.length > 0) {
      const normal = titleCase(name)
      add(capsLines[0], 'char-caps', 'info',
        `Après sa présentation (l. ${intro.lineNo + 1}), « ${name} » s'écrit « ${normal} » dans l'action ` +
        `(${capsLines.length} ligne${capsLines.length > 1 ? 's' : ''}).`, {
          label: `Écrire « ${normal} » (${capsLines.length} lignes)`,
          manual: true,
          lines: capsLines,
          apply: line => line.replace(new RegExp(`(?<![\\p{L}])${escapeRe(name)}(?![\\p{L}])`, 'gu'),
            (x, idx: number) => IN_CAPS_GROUP.test(line.slice(0, idx)) ? x : normal),
        })
    }
  }

  // Cohérence des noms de personnages.
  for (const variants of charGroups.values()) {
    if (variants.size < 2) continue
    const sorted = [...variants.entries()].sort((a, b) => b[1].count - a[1].count)
    const main = sorted[0][0]
    for (const [v, info] of sorted.slice(1))
      add(info.firstLine, 'char-variant', 'warn',
        `« ${v} » et « ${main} » : le nom d'un personnage doit rester strictement identique.`, {
          label: `Renommer en « ${main} » (${info.count}×)`,
          manual: true,
          apply: renameCue(main),
          lines: info.lines,
        })
  }
  const keys = [...charGroups.keys()].filter(k => k.length >= 4)
  const total = (k: string) => [...charGroups.get(k)!.values()].reduce((s, v) => s + v.count, 0)
  const allLines = (k: string) => [...charGroups.get(k)!.values()].flatMap(v => v.lines)
  for (let a = 0; a < keys.length; a++) {
    for (let b = a + 1; b < keys.length; b++) {
      if (!near(keys[a], keys[b])) continue
      // POLICIER 1 / POLICIER 2 : deux personnages distincts, pas une faute.
      if (/\d/.test(keys[a] + keys[b]) && keys[a].replace(/\d+/g, '') === keys[b].replace(/\d+/g, '')) continue
      // On propose de renommer le moins fréquent vers le plus fréquent.
      const [keep, drop] = total(keys[a]) >= total(keys[b]) ? [keys[a], keys[b]] : [keys[b], keys[a]]
      const keepName = [...charGroups.get(keep)!.keys()][0]
      const dropEntry = [...charGroups.get(drop)!.entries()][0]
      add(dropEntry[1].firstLine, 'char-near', 'warn',
        `« ${dropEntry[0]} » et « ${keepName} » : deux orthographes du même personnage ?`, {
          label: `Renommer en « ${keepName} » (${total(drop)}×)`,
          manual: true,
          apply: renameCue(keepName),
          lines: allLines(drop),
        })
    }
  }

  // Page de titre : les deux mentions obligatoires (§4), signalées seulement
  // une fois le scénario commencé.
  if (parsed.some(p => p.type !== 'title' && p.type !== 'blank')) {
    const t = titleValue(parsed, /^(titre|title)\s*:/i)
    if (t && !t.value)
      add(t.line.lineNo, 'title-empty', 'info', 'Page de titre : indiquez le titre du scénario.')
    const a = titleValue(parsed, /^(écrit par|written by|auteurs?|authors?)\s*:/i)
    if (a && !a.value)
      add(a.line.lineNo, 'title-empty', 'info', 'Page de titre : indiquez le nom de l\'auteur.')
  }

  return issues.sort((a, b) => a.lineNo - b.lineNo)
}
