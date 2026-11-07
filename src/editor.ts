import {
  EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType, keymap,
  drawSelection, highlightActiveLine, placeholder, lineNumbers, highlightActiveLineGutter,
} from '@codemirror/view'
import { EditorState, RangeSetBuilder, StateField, Text } from '@codemirror/state'
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

// ---------------------------------------------------------------------------
// Squelette de page de titre verrouillé.
//
// Les trois premières lignes (« Titre: », « Écrit par: », « Source: ») sont une
// structure, pas du texte libre : on ne peut écrire qu'après les deux-points, et
// ni les intitulés ni les sauts de ligne qui les séparent ne sont modifiables à
// la main. Seules les lignes qui portent réellement l'intitulé attendu sont
// verrouillées : un texte importé qui n'a pas ce squelette reste entièrement libre.
// ---------------------------------------------------------------------------
const HEADER_LABELS = [/^Titre:[ ]?/, /^Écrit par:[ ]?/, /^Source:[ ]?/]
const HEADER_LINES = HEADER_LABELS.length

interface HeaderLocks {
  /** Intitulés (« Titre: »…) : ni suppression ni insertion à l'intérieur ou avant. */
  labels: [number, number][]
  /** Sauts de ligne qui suivent chaque ligne verrouillée : non supprimables. */
  breaks: [number, number][]
  /** Les trois intitulés sont présents : le squelette est complet. */
  full: boolean
}

function headerLocks(doc: Text): HeaderLocks {
  const labels: [number, number][] = []
  const breaks: [number, number][] = []
  let full = true
  for (let i = 0; i < HEADER_LINES; i++) {
    if (i + 1 > doc.lines) { full = false; break }
    const line = doc.line(i + 1)
    const m = HEADER_LABELS[i].exec(line.text)
    if (!m) { full = false; continue }
    labels.push([line.from, line.from + m[0].length])
    if (line.number < doc.lines) breaks.push([line.to, line.to + 1])
  }
  return { labels, breaks, full }
}

/** Rejette toute frappe, suppression, collage ou glisser qui toucherait au squelette. */
const headerGuard = EditorState.changeFilter.of(tr => {
  // Les modifications programmatiques (Nouveau, import, corrections, annuler) passent.
  if (!tr.isUserEvent('input') && !tr.isUserEvent('delete')) return true
  const { labels, breaks } = headerLocks(tr.startState.doc)
  if (labels.length === 0) return true
  const doc = tr.startState.doc
  const headerEnd = doc.line(Math.min(HEADER_LINES, doc.lines)).to
  let ok = true
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const isDeletion = toA > fromA
    for (const [a, b] of labels) {
      if (isDeletion ? (fromA < b && toA > a) : (fromA >= a && fromA < b)) ok = false
    }
    for (const [a, b] of breaks) {
      if (isDeletion && fromA < b && toA > a) ok = false
    }
    // Pas de saut de ligne dans une valeur de la page de titre.
    if (fromA <= headerEnd && inserted.lines > 1) ok = false
  })
  return ok
})

/** Bouton facultatif sous le squelette : insère une séquence type pour démarrer. */
function insertFirstScene(view: EditorView) {
  const { doc } = view.state
  const headerEnd = doc.line(Math.min(HEADER_LINES, doc.lines)).to
  const at = headerEnd + 2 + 'INT. '.length
  view.dispatch({
    changes: { from: headerEnd, to: doc.length, insert: '\n\nINT. LIEU - JOUR' },
    selection: { anchor: at, head: at + 'LIEU'.length },
    scrollIntoView: true,
  })
  view.focus()
}

class FirstSceneWidget extends WidgetType {
  eq() { return true }
  toDOM(view: EditorView) {
    const box = document.createElement('div')
    box.className = 'cm-suggest'
    box.append('Pas d’idée pour démarrer ? ')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = 'Insérer une séquence type'
    btn.title = 'Écrit « INT. LIEU - JOUR » : il ne reste qu’à remplacer LIEU. Facultatif — vous pouvez aussi écrire directement.'
    btn.addEventListener('mousedown', e => e.preventDefault())
    btn.addEventListener('click', () => insertFirstScene(view))
    box.append(btn)
    return box
  }
}

function buildHeaderDecorations(doc: Text): DecorationSet {
  const { labels, full } = headerLocks(doc)
  const ranges = labels.map(([a, b]) => Decoration.mark({ class: 'cm-lock' }).range(a, b))
  if (full) {
    // Squelette complet et corps encore vide : on propose, discrètement, une première séquence.
    let empty = true
    for (let n = HEADER_LINES + 1; n <= doc.lines; n++) {
      if (doc.line(n).text.trim() !== '') { empty = false; break }
    }
    if (empty) {
      ranges.push(Decoration.widget({ widget: new FirstSceneWidget(), block: true, side: 1 }).range(doc.line(HEADER_LINES).to))
    }
  }
  return Decoration.set(ranges, true)
}

const headerField = StateField.define<DecorationSet>({
  create: state => buildHeaderDecorations(state.doc),
  update: (value, tr) => (tr.docChanged ? buildHeaderDecorations(tr.newDoc) : value),
  provide: f => [
    EditorView.decorations.from(f),
    // Le curseur saute par-dessus les intitulés au lieu d'y entrer.
    EditorView.atomicRanges.of(view =>
      view.state.field(f).update({ filter: (from, to) => to > from })),
  ],
})

/** Le curseur est-il sur une des lignes verrouillées du squelette ? */
function inHeaderLine(state: EditorState): boolean {
  const { labels } = headerLocks(state.doc)
  const line = state.doc.lineAt(state.selection.main.head)
  return line.number <= HEADER_LINES && labels.some(([a]) => a === line.from)
}

// Entrée / Tab dans le squelette : passe à la valeur suivante (puis au corps du
// scénario après « Source: »), Maj+Tab revient à la valeur précédente — au lieu
// de casser la structure. Hors du squelette, ne fait rien (retourne false).
const moveInHeader = (dir: 1 | -1) => (view: EditorView): boolean => {
  const { state } = view
  if (!inHeaderLine(state)) return false
  const line = state.doc.lineAt(state.selection.main.head)
  if (dir === -1) {
    if (line.number > 1) {
      view.dispatch({
        selection: { anchor: state.doc.line(line.number - 1).to },
        scrollIntoView: true,
      })
    }
    return true
  }
  if (line.number < HEADER_LINES) {
    view.dispatch({
      selection: { anchor: state.doc.line(line.number + 1).to },
      scrollIntoView: true,
    })
    return true
  }
  // Après la dernière ligne du squelette : une ligne vide, puis le corps.
  const bodyLine = HEADER_LINES + 2
  const missing = Math.max(0, bodyLine - state.doc.lines)
  const changes = missing ? { from: state.doc.length, insert: '\n'.repeat(missing) } : undefined
  const doc = changes ? state.update({ changes }).state.doc : state.doc
  view.dispatch({
    changes,
    selection: { anchor: doc.line(bodyLine).to },
    scrollIntoView: true,
  })
  return true
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
          { key: 'Enter', run: moveInHeader(1) },
          // Sur le squelette, Tab navigue entre les champs ; ailleurs il fait
          // tourner le type de la ligne.
          {
            key: 'Tab',
            run: v => moveInHeader(1)(v) || cycleType(1)(v),
            shift: v => moveInHeader(-1)(v) || cycleType(-1)(v),
          },
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
        headerGuard,
        headerField,
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
      // Place la ligne visée en haut de la zone visible (avec une petite marge).
      // Près de la fin du script, le défilement est naturellement plafonné :
      // la ligne reste alors là où le bas du document le permet.
      view.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 24 }),
      })
      view.focus()
    },
    insertSnippet(snippet: string, selStart: number, selEnd: number) {
      const { state } = view
      // Curseur sur le squelette de titre : le gabarit s'insère après lui, sans
      // couper la page de titre.
      const line = inHeaderLine(state)
        ? state.doc.line(Math.min(HEADER_LINES, state.doc.lines))
        : state.doc.lineAt(state.selection.main.head)
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
