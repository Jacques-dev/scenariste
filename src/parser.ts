import { ElType, REGEX, isUpperLine } from './rules/spec'

export interface ParsedLine {
  /** Index de ligne, base 0, identique au découpage CodeMirror. */
  lineNo: number
  /** Ligne brute. */
  raw: string
  /** Texte épuré (trim + caractères de forçage retirés). */
  text: string
  type: ElType
}

/**
 * Classe chaque ligne du document en élément de scénario.
 * Syntaxe naturelle (INT./EXT., MAJUSCULES…) + forçages façon Fountain :
 *   .intitulé   @personnage   !action   >transition   >centré<
 */
export function parseScript(source: string): ParsedLine[] {
  const raws = source.split(/\r\n|\r|\n/)
  const trimmed = raws.map(r => r.trim())
  const out: ParsedLine[] = []
  let i = 0

  // Bloc titre : uniquement en tête de document.
  if (i < raws.length && REGEX.titleKey.test(trimmed[0] ?? '')) {
    while (i < raws.length && trimmed[i] !== '') {
      out.push({ lineNo: i, raw: raws[i], text: trimmed[i], type: 'title' })
      i++
    }
  }

  let inDialogue = false
  for (; i < raws.length; i++) {
    const t = trimmed[i]
    const push = (type: ElType, text = t) => out.push({ lineNo: i, raw: raws[i], text, type })

    if (t === '') {
      inDialogue = false
      push('blank')
      continue
    }

    // Forçages explicites.
    if (t.startsWith('!')) { inDialogue = false; push('action', t.slice(1)); continue }
    if (/^>.*<$/.test(t)) { inDialogue = false; push('centered', t.slice(1, -1).trim()); continue }
    if (t.startsWith('>')) { inDialogue = false; push('transition', t.slice(1).trim()); continue }
    if (t.startsWith('@')) { inDialogue = true; push('character', t.slice(1).trim()); continue }
    if (t.startsWith('.') && !t.startsWith('..')) { inDialogue = false; push('scene', t.slice(1).trim()); continue }

    // Intitulé de séquence.
    if (REGEX.scene.test(t)) { inDialogue = false; push('scene'); continue }

    // Bloc de dialogue en cours.
    if (inDialogue) {
      if (t.startsWith('(')) { push('parenthetical'); continue }
      push('dialogue')
      continue
    }

    // Transition : MAJUSCULES + mot-clé connu ou « : » final.
    if (isUpperLine(t) && t.length <= 32 && (REGEX.transitionWord.test(t) || /:$/.test(t))) {
      push('transition')
      continue
    }

    // Personnage : MAJUSCULES, précédé d'une ligne vide, suivi d'une ligne non vide.
    const prevBlank = i === 0 || trimmed[i - 1] === ''
    const nextNonBlank = i + 1 < trimmed.length && trimmed[i + 1] !== ''
    const core = t.replace(REGEX.charExtension, '').trim()
    if (
      prevBlank && nextNonBlank &&
      core.length > 0 && core.length <= 38 &&
      isUpperLine(core) && !/[.!?…]$/.test(core) && !t.startsWith('(')
    ) {
      inDialogue = true
      push('character')
      continue
    }

    push('action')
  }
  return out
}

export interface Block {
  type: ElType
  lines: ParsedLine[]
}

/** Regroupe les lignes consécutives de même type ; les lignes vides ferment le bloc. */
export function toBlocks(parsed: ParsedLine[]): Block[] {
  const blocks: Block[] = []
  let cur: Block | null = null
  for (const p of parsed) {
    if (p.type === 'blank') { cur = null; continue }
    if (cur && cur.type === p.type) cur.lines.push(p)
    else { cur = { type: p.type, lines: [p] }; blocks.push(cur) }
  }
  return blocks
}

export interface TitleInfo {
  title?: string
  credit?: string
  author?: string
  source?: string
  contact?: string
  date?: string
}

/** Extrait les métadonnées du bloc titre. */
export function titleInfo(parsed: ParsedLine[]): TitleInfo | null {
  const lines = parsed.filter(p => p.type === 'title')
  if (lines.length === 0) return null
  const info: TitleInfo = {}
  for (const l of lines) {
    const m = /^([^:]+):\s*(.*)$/.exec(l.text)
    if (!m) continue
    const key = m[1].toLowerCase().trim()
    const val = m[2].trim()
    if (/^(titre|title)$/.test(key)) info.title = val
    else if (/^(auteur|auteurs|author|authors)$/.test(key)) info.author = val
    else if (/^(écrit par|written by)$/.test(key)) {
      info.credit = m[1].trim()
      if (val && !info.author) info.author = val
    } else if (/^(credit|crédit)$/.test(key)) info.credit = val
    else if (/^source$/.test(key)) info.source = val
    else if (/^contact$/.test(key)) info.contact = val
    else if (/^(date|version|draft date|draft)$/.test(key)) info.date = val
  }
  return info
}

export interface Stats {
  scenes: number
  words: number
  characters: string[]
}

export function stats(parsed: ParsedLine[]): Stats {
  let scenes = 0
  let words = 0
  const chars = new Set<string>()
  for (const p of parsed) {
    if (p.type === 'scene') scenes++
    if (p.type === 'action' || p.type === 'dialogue') {
      words += p.text.split(/\s+/).filter(Boolean).length
    }
    if (p.type === 'character') {
      const name = p.text.replace(REGEX.charExtension, '').trim().toLocaleUpperCase('fr-FR')
      if (name) chars.add(name)
    }
  }
  return { scenes, words, characters: [...chars].sort() }
}
