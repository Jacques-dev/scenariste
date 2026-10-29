import { ParsedLine } from './parser'
import { ELEMENTS, REGEX, SCENE_TIMES, isUpperLine } from './rules/spec'

export type Severity = 'warn' | 'info'

/** Correction automatique applicable à la ligne concernée. */
export interface Fix {
  label: string
  apply: (lineText: string) => string
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
  let lastDigitsLine = -10

  // Noms de personnages : variantes regroupées par forme normalisée.
  const charGroups = new Map<string, Map<string, { count: number; firstLine: number }>>()

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
      actionRun++
    } else if (actionRun > 0 && p.type === 'blank') { flushRuns() }

    if (p.type === 'dialogue') {
      if (dialogueRun === 0) dialogueRunStart = p.lineNo
      dialogueRun += Math.max(1, Math.ceil(p.text.length / ELEMENTS.dialogue.widthCh))
    } else if (dialogueRun > 0 && p.type !== 'parenthetical') { flushRuns() }

    // Doubles espaces (hors bloc titre et lignes vides).
    if (p.type !== 'blank' && p.type !== 'title' && /\S {2,}\S/.test(p.text))
      add(p.lineNo, 'double-space', 'info', 'Doubles espaces dans la ligne.', {
        label: 'Corriger',
        apply: line => line.replace(/(\S) {2,}(?=\S)/g, '$1 '),
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
        const hasDashTime = REGEX.sceneTime.test(p.text)
        const hasEndTime = TIME_END.test(p.text)
        if (!hasDashTime && hasEndTime)
          add(p.lineNo, 'scene-sep', 'info',
            'Séparez le moment par un tiret : « - JOUR ».', {
              label: 'Ajouter le tiret',
              apply: line => line.replace(TIME_END, (_m, t) => ` - ${upper(t)}`),
            })
        if (!hasDashTime && !hasEndTime)
          add(p.lineNo, 'scene-time', 'info',
            'Précisez le moment en fin d\'intitulé : « - JOUR », « - NUIT »…')
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
          if (v) v.count++
          else variants.set(core, { count: 1, firstLine: p.lineNo })
        }
        break
      }
      case 'parenthetical': {
        const inner = p.text.replace(/^\(|\)$/g, '').trim()
        if (/^\p{Lu}/u.test(inner) || /[.]\)?\s*$/.test(p.text))
          add(p.lineNo, 'paren-style', 'info',
            'Didascalie en minuscules, sans point final : « (un temps) ».', {
              label: 'Corriger',
              apply: line => line
                .replace(/\(\s*(\p{Lu})/u, m => m.toLocaleLowerCase('fr-FR'))
                .replace(/\.\s*(\)?)\s*$/, '$1'),
            })
        if (inner.length > ELEMENTS.parenthetical.widthCh * 2)
          add(p.lineNo, 'paren-long', 'info',
            "Didascalie trop longue : si elle dépasse une ligne, écrivez-la en action.")
        if (!/\)\s*$/.test(p.text))
          add(p.lineNo, 'paren-close', 'warn', 'Parenthèse non refermée.', {
            label: 'Fermer',
            apply: line => line.replace(/\s*$/, ')'),
          })
        const after = nextNonBlank(parsed, i)
        if (!after || (after.type !== 'dialogue' && after.type !== 'parenthetical'))
          add(p.lineNo, 'paren-end', 'warn',
            'Une didascalie ne termine jamais une réplique : déplacez-la avant le dialogue ou écrivez-la en action.')
        break
      }
      case 'dialogue': {
        if (/\d/.test(p.text) && p.lineNo > lastDigitsLine + 1) {
          add(p.lineNo, 'dialogue-digits', 'info',
            'Dans un dialogue, les nombres s\'écrivent en toutes lettres (« dix-sept », pas « 17 »).')
        }
        if (/\d/.test(p.text)) lastDigitsLine = p.lineNo
        break
      }
      case 'transition': {
        if (!/:$/.test(p.text) && !/^(FADE OUT|FIN)\b/i.test(p.text))
          add(p.lineNo, 'transition-colon', 'info',
            'Une transition se termine par deux-points : « CUT TO: », « FONDU AU NOIR : ».', {
              label: 'Ajouter « : »',
              apply: line => line.replace(/\s*$/, /FONDU|OUVERTURE|COUPE/i.test(line) ? ' :' : ':'),
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
        if (/\b(la caméra|travelling|panoramique|zoom (avant|arrière)|gros plan sur)\b/i.test(p.text))
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
        `« ${v} » et « ${main} » : le nom d'un personnage doit rester strictement identique.`)
  }
  const keys = [...charGroups.keys()].filter(k => k.length >= 4)
  for (let a = 0; a < keys.length; a++) {
    for (let b = a + 1; b < keys.length; b++) {
      if (!near(keys[a], keys[b])) continue
      const nameA = [...charGroups.get(keys[a])!.keys()][0]
      const entryB = [...charGroups.get(keys[b])!.entries()][0]
      add(entryB[1].firstLine, 'char-near', 'warn',
        `« ${entryB[0]} » et « ${nameA} » : deux orthographes du même personnage ?`)
    }
  }

  return issues.sort((a, b) => a.lineNo - b.lineNo)
}
