import { ParsedLine } from './parser'
import { ELEMENTS, REGEX, isUpperLine } from './rules/spec'

export type Severity = 'warn' | 'info'

export interface Issue {
  lineNo: number
  ruleId: string
  severity: Severity
  message: string
}

/** Vérifie le texte contre les règles de docs/REGLES_FORMATAGE.md (§7). */
export function lint(parsed: ParsedLine[]): Issue[] {
  const issues: Issue[] = []
  const add = (lineNo: number, ruleId: string, severity: Severity, message: string) =>
    issues.push({ lineNo, ruleId, severity, message })

  let actionRun = 0
  let actionRunStart = -1
  let dialogueRun = 0
  let dialogueRunStart = -1

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
      // Approximation : nb de lignes une fois replié à 35 caractères.
      dialogueRun += Math.max(1, Math.ceil(p.text.length / ELEMENTS.dialogue.widthCh))
    } else if (dialogueRun > 0 && p.type !== 'parenthetical') { flushRuns() }

    switch (p.type) {
      case 'scene': {
        if (!isUpperLine(p.text))
          add(p.lineNo, 'scene-caps', 'warn',
            "L'intitulé de séquence doit être entièrement en MAJUSCULES.")
        if (!REGEX.sceneTime.test(p.text))
          add(p.lineNo, 'scene-time', 'info',
            'Précisez le moment en fin d\'intitulé : « - JOUR », « - NUIT »…')
        if (/\.$/.test(p.text))
          add(p.lineNo, 'scene-period', 'info',
            "Pas de point final dans un intitulé de séquence.")
        break
      }
      case 'parenthetical': {
        const inner = p.text.replace(/^\(|\)$/g, '').trim()
        if (/^\p{Lu}/u.test(inner) || /[.]\)?\s*$/.test(p.text))
          add(p.lineNo, 'paren-style', 'info',
            'Didascalie en minuscules, sans point final : « (un temps) ».')
        if (inner.length > ELEMENTS.parenthetical.widthCh * 2)
          add(p.lineNo, 'paren-long', 'info',
            "Didascalie trop longue : si elle dépasse une ligne, écrivez-la en action.")
        if (!/\)\s*$/.test(p.text))
          add(p.lineNo, 'paren-close', 'warn', 'Parenthèse non refermée.')
        break
      }
      case 'transition': {
        if (!/:$/.test(p.text) && !/^(FADE OUT|FIN)\b/i.test(p.text))
          add(p.lineNo, 'transition-colon', 'info',
            'Une transition se termine par deux-points : « CUT TO: », « FONDU AU NOIR : ».')
        break
      }
      case 'action': {
        // Didascalie égarée hors dialogue.
        if (/^\(.*\)$/.test(p.text))
          add(p.lineNo, 'paren-orphan', 'warn',
            'Didascalie hors d\'un bloc de dialogue : placez-la sous un nom de personnage.')
        // Ligne seule en MAJUSCULES : réplique dont le dialogue manque ?
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
  return issues.sort((a, b) => a.lineNo - b.lineNo)
}
