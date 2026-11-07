import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { REGEX, isUpperLine } from './rules/spec'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

interface RawLine {
  page: number
  x: number // position horizontale du premier item, en points
  right: number // fin horizontale du dernier item, en points
  y: number
  text: string
}

type Guess =
  | 'scene' | 'action' | 'character' | 'parenthetical' | 'dialogue' | 'transition' | 'skip'

/**
 * Extrait le texte d'un PDF de scénario et le reclasse en texte source de
 * l'éditeur, en se servant des retraits horizontaux standard (spec.ts) et du
 * contenu des lignes. Lève une erreur si le PDF ne contient pas de texte
 * extractible (scan sans OCR).
 *
 * Un PDF ne connaît que des lignes *visuelles* : un paragraphe d'action ou une
 * réplique y est coupé en plusieurs lignes par la largeur de la page. On les
 * recolle (voir `wraps`) pour retrouver un paragraphe par ligne, comme dans
 * l'éditeur ; les vrais retours à la ligne et les lignes vides (écart vertical)
 * sont conservés.
 */
export async function importPdf(data: ArrayBuffer): Promise<string> {
  // isEvalSupported: false — interdit à pdf.js de compiler du code issu d'un
  // PDF non fiable (défense en profondeur, sans effet sur l'extraction de texte).
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
  const allLines: RawLine[][] = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const byY = new Map<number, { x: number; w: number; str: string }[]>()
    for (const item of content.items) {
      if (!('str' in item) || item.str.trim() === '') continue
      const x = item.transform[4] as number
      const y = item.transform[5] as number
      const key = Math.round(y / 3) * 3 // regroupe les items de la même ligne
      if (!byY.has(key)) byY.set(key, [])
      byY.get(key)!.push({ x, w: item.width, str: item.str })
    }
    const lines: RawLine[] = [...byY.entries()]
      .sort((a, b) => b[0] - a[0]) // haut de page d'abord
      .map(([y, items]) => {
        items.sort((a, b) => a.x - b.x)
        return {
          page: p,
          x: items[0].x,
          right: Math.max(...items.map(i => i.x + i.w)),
          y,
          text: items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim(),
        }
      })
    allLines.push(lines)
  }

  const flat = allLines.flat()
  if (flat.map(l => l.text).join('').length < 50) {
    throw new Error(
      'Ce PDF ne contient pas de texte extractible (scan sans OCR ?). ' +
      'Passez-le d\'abord dans un outil d\'OCR, ou importez un fichier texte.',
    )
  }

  // Marge gauche ≈ plus petit x fréquent (5e percentile).
  const xs = flat.map(l => l.x).sort((a, b) => a - b)
  const left = xs[Math.floor(xs.length * 0.05)] ?? xs[0]

  // Interligne ordinaire : écart vertical le plus fréquent entre deux lignes
  // d'une même page. Un écart nettement plus grand marque une ligne vide.
  const gaps: number[] = []
  for (const lines of allLines) {
    for (let i = 1; i < lines.length; i++) gaps.push(Math.round(lines[i - 1].y - lines[i].y))
  }
  const lineGap = mode(gaps.filter(g => g > 0)) ?? 12

  // Marge droite de chaque colonne (action, dialogue…) : la ligne la plus
  // longue parmi celles qui commencent au même retrait.
  const marginOf = (l: RawLine): number => {
    let m = 0
    for (const o of flat) if (Math.abs(o.x - l.x) < 6 && o.right > m) m = o.right
    return m
  }
  const margins = new Map<RawLine, number>()
  const margin = (l: RawLine) => {
    if (!margins.has(l)) margins.set(l, marginOf(l))
    return margins.get(l)!
  }

  /**
   * La ligne `a` est-elle coupée par la largeur de la colonne, `b` en étant la
   * suite ? Oui si le premier mot de `b` n'aurait pas tenu au bout de `a` :
   * c'est exactement ce qui a forcé le retour à la ligne.
   */
  const wraps = (a: RawLine, b: RawLine): boolean => {
    if (Math.abs(a.x - b.x) > 6) return false
    const charW = (a.right - a.x) / Math.max(1, a.text.length)
    const firstWord = b.text.split(' ')[0]
    return a.right + charW * (1 + firstWord.length) > margin(a) - charW / 2
  }

  const out: string[] = []
  let prev: Guess = 'skip'
  let prevRaw: RawLine | null = null

  const push = (line: string) => out.push(line)
  const blank = () => { if (out.length && out[out.length - 1] !== '') out.push('') }

  for (const lines of allLines) {
    for (const l of lines) {
      const t = l.text
      const dxIn = (l.x - left) / 72 // retrait en pouces depuis la marge gauche

      // Lignes à ignorer : numéros de page, marqueurs de coupure.
      if (/^\d+\.?$/.test(t)) continue
      if (/^\((MORE|SUITE|À SUIVRE)\)$/i.test(t)) continue
      if (/^(CONTINUED|SUITE)\s*:?\s*(\(\d+\))?$/i.test(t)) continue

      // Ligne vide dans l'original : écart vertical nettement supérieur à l'interligne.
      const gapBefore = prevRaw != null && prevRaw.page === l.page && prevRaw.y - l.y > lineGap * 1.5

      let g: Guess
      if (REGEX.scene.test(t)) g = 'scene'
      else if (isUpperLine(t) && (REGEX.transitionWord.test(t) || /:$/.test(t)) && dxIn > 2.5) g = 'transition'
      else if (dxIn > 1.6 && dxIn < 3.4 && isUpperLine(t.replace(REGEX.charExtension, '')) && t.length <= 40) g = 'character'
      else if (dxIn > 0.4 && t.startsWith('(')) g = 'parenthetical'
      else if (dxIn > 0.4 && dxIn <= 1.6) g = 'dialogue'
      else g = 'action'

      // Un « dialogue » qui suit de l'action sans nom de personnage est de l'action centrée bizarre :
      if (g === 'dialogue' && prev !== 'character' && prev !== 'dialogue' && prev !== 'parenthetical') {
        // probablement la suite d'un paragraphe ou un dialogue dont on a raté le nom : on garde dialogue
        // seulement si un nom vient d'être vu ; sinon action.
        g = 'action'
      }
      // Réplique sans retrait (mise en page non standard) : ce qui suit un nom
      // ou une didascalie sans ligne vide est encore la réplique.
      if (g === 'action' && !gapBefore && (prev === 'character' || prev === 'parenthetical' || prev === 'dialogue')) {
        g = t.startsWith('(') ? 'parenthetical' : 'dialogue'
      }

      // Suite d'un paragraphe coupé par la largeur de la colonne : on recolle.
      if (
        prevRaw && !gapBefore && g === prev && (g === 'action' || g === 'dialogue') &&
        out.length && out[out.length - 1] !== '' && wraps(prevRaw, l)
      ) {
        const last = out[out.length - 1]
        // Mot coupé sur un trait d'union (« pare- / brise ») : pas d'espace.
        out[out.length - 1] = /\p{L}-$/u.test(last) ? last + t : `${last} ${t}`
        prevRaw = l
        continue
      }

      // Nettoie le marqueur (SUITE)/(CONT'D) des reprises de dialogue.
      let text = t
      if (g === 'character') text = text.replace(/\s*\((CONT'?D|SUITE)\)\s*$/i, '')

      // Lignes vides entre blocs.
      if (gapBefore) blank()
      if (g === 'scene' || g === 'transition') { blank(); if (g === 'scene' && out.length) blank() }
      else if (g === 'character') blank()
      else if (g === 'action' && prev !== 'action') blank()

      // Reprise d'un même personnage dont on a retiré le (SUITE) juste après son dialogue : fusion.
      if (g === 'character' && prev === 'dialogue' && out.length >= 2) {
        const prevCue = [...out].reverse().find(x => x !== '' && isUpperLine(x.replace(REGEX.charExtension, '')))
        if (prevCue && prevCue.replace(REGEX.charExtension, '').trim() === text.trim()) {
          // même personnage qui continue : on supprime le doublon de nom
          prev = 'parenthetical' // le prochain dialogue se collera au bloc
          // retire la ligne vide qu'on vient d'ajouter
          if (out[out.length - 1] === '') out.pop()
          prevRaw = l
          continue
        }
      }

      push(text)
      prev = g
      prevRaw = l
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** Valeur la plus fréquente d'une liste (null si vide). */
function mode(values: number[]): number | null {
  const count = new Map<number, number>()
  let best: number | null = null
  for (const v of values) {
    const c = (count.get(v) ?? 0) + 1
    count.set(v, c)
    if (best === null || c > count.get(best)!) best = v
  }
  return best
}
