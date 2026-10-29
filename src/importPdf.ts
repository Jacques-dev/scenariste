import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { REGEX, isUpperLine } from './rules/spec'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

interface RawLine {
  x: number // position horizontale du premier item, en points
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
 */
export async function importPdf(data: ArrayBuffer): Promise<string> {
  // isEvalSupported: false — interdit à pdf.js de compiler du code issu d'un
  // PDF non fiable (défense en profondeur, sans effet sur l'extraction de texte).
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
  const allLines: RawLine[][] = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const byY = new Map<number, { x: number; str: string }[]>()
    for (const item of content.items) {
      if (!('str' in item) || item.str.trim() === '') continue
      const x = item.transform[4] as number
      const y = item.transform[5] as number
      const key = Math.round(y / 3) * 3 // regroupe les items de la même ligne
      if (!byY.has(key)) byY.set(key, [])
      byY.get(key)!.push({ x, str: item.str })
    }
    const lines: RawLine[] = [...byY.entries()]
      .sort((a, b) => b[0] - a[0]) // haut de page d'abord
      .map(([y, items]) => {
        items.sort((a, b) => a.x - b.x)
        return { x: items[0].x, y, text: items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim() }
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

  const out: string[] = []
  let prev: Guess = 'skip'

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

      // Nettoie le marqueur (SUITE)/(CONT'D) des reprises de dialogue.
      let text = t
      if (g === 'character') text = text.replace(/\s*\((CONT'?D|SUITE)\)\s*$/i, '')

      // Lignes vides entre blocs.
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
          continue
        }
      }

      push(text)
      prev = g
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}
