import {
  EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, keymap,
  drawSelection, highlightActiveLine, placeholder,
} from '@codemirror/view'
import { EditorState, RangeSetBuilder } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { parseScript } from './parser'
import { ElType } from './rules/spec'

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
  }
  return builder.finish()
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
        highlightActiveLine(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        placeholder('INT. LIEU - JOUR  …puis décrivez l\'action. Un NOM EN MAJUSCULES seul sur sa ligne ouvre un dialogue.'),
        screenplayHighlight,
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
  }
}

export type { ElType }
