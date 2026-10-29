import { Block, ParsedLine, toBlocks } from './parser'
import { ELEMENTS, LABELS, PAGE, ElType, REGEX } from './rules/spec'

export interface OutLine {
  type: Exclude<ElType, 'title' | 'blank'> | 'blank' | 'more'
  text: string
}

export interface PageOut {
  number: number
  lines: OutLine[]
}

/** Replie un texte sur `width` caractères (coupure aux espaces). */
export function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let cur = ''
  for (let w of words) {
    while (w.length > width) {
      if (cur) { lines.push(cur); cur = '' }
      lines.push(w.slice(0, width))
      w = w.slice(width)
    }
    if (!cur) cur = w
    else if (cur.length + 1 + w.length <= width) cur += ' ' + w
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines
}

const upper = (s: string) => s.toLocaleUpperCase('fr-FR')

function renderText(text: string, type: ElType): string {
  const spec = ELEMENTS[type as Exclude<ElType, 'blank'>]
  return spec?.uppercase ? upper(text) : text
}

/**
 * Découpe le script en pages de PAGE.linesPerPage lignes, en appliquant les
 * règles de pagination (§5 de docs/REGLES_FORMATAGE.md) :
 * intitulés et personnages jamais orphelins, dialogues coupés avec (SUITE).
 */
export function paginate(parsed: ParsedLine[]): PageOut[] {
  const blocks = toBlocks(parsed).filter(b => b.type !== 'title')
  const cap = PAGE.linesPerPage
  const pages: PageOut[] = []
  let cur: OutLine[] = []

  const newPage = () => { pages.push({ number: pages.length + 1, lines: cur }); cur = [] }
  const remaining = () => cap - cur.length

  let currentChar = ''

  const chainNeed = (bi: number): number => {
    // Lignes minimales à garder ensemble à partir du bloc bi (début de chaîne).
    const b = blocks[bi]
    const spec = ELEMENTS[b.type as Exclude<ElType, 'blank'>]
    const blanks = cur.length === 0 ? 0 : spec.blanksBefore
    if (b.type === 'scene') {
      // Intitulé + ligne vide + 2 lignes du bloc suivant.
      return blanks + b.lines.length + 1 + 2
    }
    if (b.type === 'character') {
      // Nom + au moins 1 ligne de la suite (didascalie ou dialogue).
      return blanks + b.lines.length + 1
    }
    return blanks + 1
  }

  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi]
    const spec = ELEMENTS[b.type as Exclude<ElType, 'blank'>]
    const isDial = b.type === 'dialogue' || b.type === 'parenthetical'

    if (chainNeed(bi) > remaining()) newPage()

    if (cur.length > 0) {
      for (let k = 0; k < spec.blanksBefore && remaining() > 0; k++) {
        cur.push({ type: 'blank', text: '' })
      }
    }

    if (b.type === 'character') {
      currentChar = upper(b.lines[0].text.replace(REGEX.charExtension, '').trim())
    }

    const wrapped = b.lines.flatMap(l => wrap(renderText(l.text, b.type), spec.widthCh))

    for (let li = 0; li < wrapped.length; li++) {
      const linesLeftInBlock = wrapped.length - li
      if (isDial && remaining() <= 1 && linesLeftInBlock > 1) {
        // Coupure de dialogue : (SUITE) en bas, reprise NOM (SUITE) en haut.
        if (remaining() >= 1) cur.push({ type: 'more', text: LABELS.more })
        newPage()
        if (currentChar) cur.push({ type: 'character', text: `${currentChar} ${LABELS.contd}` })
      } else if (remaining() <= 0) {
        newPage()
        if (isDial && currentChar) {
          cur.push({ type: 'character', text: `${currentChar} ${LABELS.contd}` })
        }
      }
      cur.push({ type: b.type as OutLine['type'], text: wrapped[li] })
    }
  }
  if (cur.length) newPage()
  return pages
}
