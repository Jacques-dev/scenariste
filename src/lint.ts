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

const TIMES = SCENE_TIMES.join('|')
/** Moment en fin de ligne sans tiret, précisions entre parenthèses admises. */
const TIME_END = new RegExp(`\\s+(${TIMES})((?:\\s*\\([^)]*\\))*)\\s*$`, 'iu')
/** Moment n'importe où dans la ligne (mot entier, accents compris). */
const TIME_ANY = new RegExp(`(?<![\\p{L}])(${TIMES})(?![\\p{L}])`, 'iu')
/** Point final d'un intitulé (pas les points de suspension). */
const SCENE_PERIOD = /(?<!\.)\.\s*$/
const stripPeriod = (s: string) => s.replace(SCENE_PERIOD, '')
/** INT/EXT sans point ni slash derrière. */
const PREFIX_NO_DOT = /^(int|ext)(?=\s)/i

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
const LONE_NUMBER = /(?<![\p{L}\d]|\d[,.])(?:\d{1,3}(?:[ \u00A0\u202F]\d{3})(?![\d])|\d{1,6})(?![\p{L}\d]|[,.]\d)(\s*[€%])?/gu
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

  // Noms de personnages connus (formes normalisées), pour les règles qui en ont besoin.
  const charNames = new Set(
    parsed.filter(p => p.type === 'character')
      .map(p => normName(p.text.replace(REGEX.charExtension, '')))
      .filter(Boolean),
  )

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
              apply: line => line.replace(/^(\s*)(int|ext)(?=\s)/i, (_m, a, b) => a + upper(b) + '.'),
            })
        // Le point final éventuel est signalé à part (scene-period) : on
        // l'ignore ici pour ne pas fausser la détection du moment.
        const head = stripPeriod(p.text)
        const hasDashTime = REGEX.sceneTime.test(head)
        const hasEndTime = TIME_END.test(head)
        if (!hasDashTime && hasEndTime)
          add(p.lineNo, 'scene-sep', 'info',
            'Séparez le moment par un tiret : « - JOUR ».', {
              label: 'Ajouter le tiret',
              apply: line => stripPeriod(line).replace(TIME_END, (_m, t, paren) => ` - ${upper(t)}${paren}`),
            })
        if (!hasDashTime && !hasEndTime) {
          const misplaced = TIME_ANY.exec(head)
          if (misplaced)
            add(p.lineNo, 'scene-time-order', 'info',
              `Le moment se place en fin d'intitulé : « INT. LIEU - ${upper(misplaced[1])} ».`, {
                label: 'Déplacer à la fin',
                apply: line => {
                  const src = stripPeriod(line)
                  const m = TIME_ANY.exec(src)
                  if (!m) return line
                  let rest = src.slice(0, m.index) + src.slice(m.index + m[0].length)
                  rest = rest
                    .replace(/\s*[-–—]\s*[-–—]\s*/g, ' - ') // tirets doublés
                    .replace(/([.:])\s*[-–—]\s*/, '$1 ')    // tiret collé au préfixe
                    .replace(/\s*[-–—]\s*$/, '')            // tiret final orphelin
                    .replace(/\s{2,}/g, ' ')
                    .trimEnd()
                  return `${rest} - ${upper(m[1])}`
                },
              })
          else
            add(p.lineNo, 'scene-time', 'info',
              'Terminez l\'intitulé par le moment : « INT. MAISON DE CAMPAGNE - JOUR ».')
        }
        if (SCENE_PERIOD.test(p.text))
          add(p.lineNo, 'scene-period', 'info',
            'Pas de point final dans un intitulé de séquence.', {
              label: 'Retirer le point',
              apply: stripPeriod,
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
        break
      }
      case 'parenthetical': {
        // Didascalie et réplique sur la même ligne : on les sépare d'abord, les
        // autres vérifications porteront ensuite sur la didascalie seule.
        const inline = PAREN_INLINE.exec(p.text)
        if (inline) {
          add(p.lineNo, 'paren-inline', 'warn',
            'Didascalie et réplique sur la même ligne : la réplique va à la ligne suivante.', {
              label: 'Séparer',
              apply: line => line.replace(PAREN_INLINE, '$1\n$2'),
            })
          break
        }
        const inner = p.text.replace(/^\(|\)$/g, '').trim()
        // Majuscule initiale admise devant un nom de personnage (« (à Paul) » non,
        // « (Paul se lève) » oui) ou un sigle.
        const firstWord = /^[\p{L}'’.]+/u.exec(inner)?.[0] ?? ''
        const capOk = charNames.has(normName(firstWord)) || (firstWord.length > 1 && isUpperLine(firstWord))
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
        // Mot de fin (« FIN. », « FADE OUT. », « FONDU AU NOIR. ») admis en
        // dernière ligne du script, avec son point.
        const isLast = !nextNonBlank(parsed, i)
        const ending = /^(FADE OUT|FONDU AU (NOIR|BLANC)|FIN)\b/i.test(p.text)
        if (!/:$/.test(p.text) && !(ending && (isLast || /^FIN\b/i.test(p.text))))
          add(p.lineNo, 'transition-colon', 'info',
            'Une transition se termine par deux-points : « CUT TO: », « FONDU AU NOIR : ».', {
              label: 'Ajouter « : »',
              apply: line => line.replace(/\s*\.?\s*$/, /FONDU|OUVERTURE|COUPE/i.test(line) ? ' :' : ':'),
            })
        break
      }
      case 'action': {
        if (/^\(.*\)$/.test(p.text))
          add(p.lineNo, 'paren-orphan', 'warn',
            'Didascalie hors d\'un bloc de dialogue : placez-la sous un nom de personnage.')
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

  // Première apparition d'un personnage dans l'action : nom en MAJUSCULES (§3.2).
  // On ne regarde que la toute première mention, et seulement si elle précède
  // sa première réplique (sinon le personnage a été présenté autrement).
  for (const variants of charGroups.values()) {
    const [name, info] = [...variants.entries()].sort((a, b) => a[1].firstLine - b[1].firstLine)[0]
    if (name.length < 2) continue
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    const re = new RegExp(`(?<![\\p{L}'’])${esc}(?![\\p{L}])`, 'iu')
    const first = parsed.find(l => l.type === 'action' && l.lineNo < info.firstLine && re.test(l.text))
    if (!first) continue
    const m = re.exec(first.text)!
    if (isUpperLine(m[0])) continue
    add(first.lineNo, 'char-intro-caps', 'info',
      `Première apparition de ${name} : son nom s'écrit en MAJUSCULES dans l'action.`, {
        label: `Écrire « ${upper(m[0])} »`,
        apply: line => line.replace(re, x => upper(x)),
      })
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
