import {
  EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType, keymap,
  drawSelection, highlightActiveLine, placeholder, lineNumbers, highlightActiveLineGutter,
} from '@codemirror/view'
import { EditorState, RangeSetBuilder } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { parseScript } from './parser'
import { ElType } from './rules/spec'

/** Texte fantôme affiché après une clé de bloc titre laissée vide. */
class GhostWidget extends WidgetType {
  constructor(readonly text: string) { super() }
  eq(other: GhostWidget) { return other.text === this.text }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-ghost'
    span.textContent = this.text
    return span
  }
}

const GHOSTS: [RegExp, string][] = [
  [/^Source:\s*$/, '(facultatif sauf si adaptation)'],
]

/** Décorations de ligne : applique la classe de l'élément détecté à chaque ligne. */
function buildDecorations(view: EditorView): DecorationSet {
  const parsed = parseScript(view.state.doc.toString())
  const builder = new RangeSetBuilder<Decoration>()
  const total = view.state.doc.lines
  for (const p of parsed) {
    if (p.type === 'blank') continue
    if (p.lineNo + 1 > total) break
    const line = view.state.doc.line(p.lineNo + 1)
    builder.add(line.from, line.from, Decoration.line({ class: `el el-${p.type}` }))
    if (p.type === 'title') {
      const ghost = GHOSTS.find(([re]) => re.test(line.text))
      if (ghost) {
        builder.add(line.to, line.to, Decoration.widget({ widget: new GhostWidget(ghost[1]), side: 1 }))
      }
    }
  }
  return builder.finish()
}

// Majuscules automatiques : les intitulés de séquence (et les personnages ou
// transitions forcés) sont réellement convertis dans le texte, pas seulement à
// l'affichage, pour que le vérificateur et les exports restent cohérents avec
// ce que l'auteur voit à l'écran.
const autoUppercase = EditorView.updateListener.of(u => {
  if (!u.docChanged || u.view.composing) return
  const { state } = u.view
  const parsed = parseScript(state.doc.toString())
  const changes: { from: number; to: number; insert: string }[] = []
  for (const p of parsed) {
    if (p.type !== 'scene' && p.type !== 'character' && p.type !== 'transition') continue
    if (p.lineNo + 1 > state.doc.lines) break
    const line = state.doc.line(p.lineNo + 1)
    const upper = line.text.toLocaleUpperCase('fr-FR')
    if (upper !== line.text && upper.length === line.text.length) {
      changes.push({ from: line.from, to: line.to, insert: upper })
    }
  }
  if (changes.length) {
    // On ne peut pas dispatcher depuis un update listener : on diffère d'une
    // microtâche, en vérifiant que le document n'a pas bougé entre-temps.
    queueMicrotask(() => {
      if (u.view.state.doc === state.doc) u.view.dispatch({ changes })
    })
  }
})

// Tab / Maj+Tab : fait tourner le type de la ligne via les marqueurs de
// forçage, comme le Tab de Final Draft (auto → .séquence → @personnage →
// >transition → !action → auto).
const SIGILS = ['', '.', '@', '>', '!']
const cycleType = (dir: 1 | -1) => (view: EditorView): boolean => {
  const { state } = view
  const line = state.doc.lineAt(state.selection.main.head)
  const m = /^[.@>!]/.exec(line.text)
  const cur = m ? SIGILS.indexOf(m[0]) : 0
  const rest = m ? line.text.slice(1) : line.text
  const next = SIGILS[(cur + dir + SIGILS.length) % SIGILS.length]
  const head = state.selection.main.head
  const delta = next.length - (m ? 1 : 0)
  const anchor = Math.max(
    line.from + next.length,
    Math.min(head + delta, line.from + next.length + rest.length),
  )
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: next + rest },
    selection: { anchor },
  })
  return true
}

const screenplayHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = buildDecorations(view) }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = buildDecorations(u.view)
    }
  },
  { decorations: v => v.decorations },
)

export interface EditorHandle {
  view: EditorView
  setText(text: string): void
  goToLine(lineNo: number): void
  /**
   * Insère un gabarit d'élément à la position du curseur, précédé d'une ligne
   * vide si nécessaire, et sélectionne la partie à remplir (selStart/selEnd,
   * offsets dans le gabarit).
   */
  insertSnippet(snippet: string, selStart: number, selEnd: number): void
}

export function createEditor(
  parent: HTMLElement,
  initial: string,
  onChange: (doc: string, cursorLine: number) => void,
): EditorHandle {
  // Sur le squelette de page de titre, place le curseur juste après « Titre: ».
  const firstLineEnd = initial.indexOf('\n')
  const startSelection = initial.startsWith('Titre:') && firstLineEnd > 0
    ? { anchor: firstLineEnd }
    : undefined

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: initial,
      selection: startSelection,
      extensions: [
        history(),
        drawSelection(),
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        keymap.of([
          { key: 'Tab', run: cycleType(1), shift: cycleType(-1) },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.lineWrapping,
        // Correcteur orthographique du navigateur (soulignement des fautes).
        EditorView.contentAttributes.of({
          spellcheck: 'true',
          autocorrect: 'off',
          autocapitalize: 'off',
          lang: 'fr',
        }),
        placeholder('INT. LIEU - JOUR  …puis décrivez l\'action. Un NOM EN MAJUSCULES seul sur sa ligne ouvre un dialogue.'),
        screenplayHighlight,
        autoUppercase,
        EditorView.updateListener.of(u => {
          if (u.docChanged || u.selectionSet) {
            const line = u.state.doc.lineAt(u.state.selection.main.head).number - 1
            onChange(u.state.doc.toString(), line)
          }
        }),
      ],
    }),
  })

  return {
    view,
    setText(text: string) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
    },
    goToLine(lineNo: number) {
      const line = view.state.doc.line(Math.min(lineNo + 1, view.state.doc.lines))
      view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true })
      view.focus()
    },
    insertSnippet(snippet: string, selStart: number, selEnd: number) {
      const { state } = view
      const line = state.doc.lineAt(state.selection.main.head)
      const lineEmpty = line.text.trim() === ''
      const prev = line.number > 1 ? state.doc.line(line.number - 1) : null
      const needBlank = lineEmpty ? (prev != null && prev.text.trim() !== '') : true
      const prefix = lineEmpty ? (needBlank ? '\n' : '') : '\n\n'
      const next = line.number < state.doc.lines ? state.doc.line(line.number + 1) : null
      const suffix = next && next.text.trim() !== '' ? '\n' : ''
      const from = lineEmpty ? line.from : line.to
      const to = line.to
      view.dispatch({
        changes: { from, to, insert: prefix + snippet + suffix },
        selection: {
          anchor: from + prefix.length + selStart,
          head: from + prefix.length + selEnd,
        },
        scrollIntoView: true,
      })
      view.focus()
    },
  }
}

export type { ElType }
