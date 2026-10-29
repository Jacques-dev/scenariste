import { useEffect, useMemo, useRef, useState } from 'react'
import { createEditor, EditorHandle } from './editor'
import { parseScript, stats } from './parser'
import { lint } from './lint'
import { paginate } from './paginate'
import { ELEMENTS, ElType } from './rules/spec'
import { Preview } from './components/Preview'
import { LintPanel } from './components/LintPanel'
import { RulesPanel } from './components/RulesPanel'

type Mode = 'edit' | 'preview' | 'rules'
const STORAGE_KEY = 'scenariste-doc'

// Les premières versions pré-remplissaient l'éditeur avec un scénario d'exemple,
// que la sauvegarde automatique a pu enregistrer chez les visiteurs : on le purge.
const OLD_SAMPLE_SIGNATURE = [
  'Titre: LA DERNIÈRE SÉANCE',
  'INT. CINÉMA LE ROYAL - SALLE DE PROJECTION - NUIT',
  'adresse@exemple.fr',
]

// Document de départ : les deux seules mentions obligatoires de la page de
// titre d'un scénario professionnel (docs/REGLES_FORMATAGE.md §4).
const NEW_DOC = 'Titre: \nÉcrit par: \n\n'

function initialDoc(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved == null || saved.trim() === '') return NEW_DOC
    if (OLD_SAMPLE_SIGNATURE.every(s => saved.includes(s))) {
      localStorage.removeItem(STORAGE_KEY)
      return NEW_DOC
    }
    return saved
  } catch {
    return NEW_DOC
  }
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function App() {
  const [doc, setDoc] = useState<string>(initialDoc)
  const [cursorLine, setCursorLine] = useState(0)
  const [mode, setMode] = useState<Mode>('edit')
  const [showLint, setShowLint] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const editorHost = useRef<HTMLDivElement>(null)
  const editor = useRef<EditorHandle | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const docRef = useRef(doc)

  useEffect(() => {
    if (!editorHost.current || editor.current) return
    editor.current = createEditor(editorHost.current, docRef.current, (text, line) => {
      docRef.current = text
      setDoc(text)
      setCursorLine(line)
    })
  }, [])

  // Sauvegarde locale (débouncée).
  useEffect(() => {
    const id = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, doc) } catch { /* stockage plein ou bloqué */ }
    }, 400)
    return () => clearTimeout(id)
  }, [doc])

  const parsed = useMemo(() => parseScript(doc), [doc])
  const issues = useMemo(() => lint(parsed), [parsed])
  const st = useMemo(() => stats(parsed), [parsed])
  const pageCount = useMemo(() => paginate(parsed).length, [parsed])

  const currentType: ElType | null = useMemo(() => {
    const p = parsed.find(l => l.lineNo === cursorLine)
    return p && p.type !== 'blank' ? p.type : null
  }, [parsed, cursorLine])

  const setText = (text: string) => {
    editor.current?.setText(text)
    docRef.current = text
    setDoc(text)
  }

  const goTo = (lineNo: number) => {
    setMode('edit')
    requestAnimationFrame(() => editor.current?.goToLine(lineNo))
  }

  const onNew = () => {
    if (doc.trim() && !window.confirm('Remplacer le document actuel par un document vide ?')) return
    setText(NEW_DOC)
  }

  const onImport = async (file: File) => {
    setBusy(true)
    setNotice(null)
    try {
      let text: string
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const { importPdf } = await import('./importPdf')
        text = await importPdf(await file.arrayBuffer())
      } else {
        text = await file.text()
      }
      if (doc.trim() && !window.confirm(`Remplacer le document actuel par « ${file.name} » reformaté ?`)) {
        setBusy(false)
        return
      }
      setText(text)
      setMode('edit')
      setNotice(`« ${file.name} » importé et reformaté. Vérifiez les remarques du panneau de droite.`)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const exportPdf = () => {
    setMode('preview')
    setTimeout(() => window.print(), 300)
  }

  const baseName = () => {
    const m = /^\s*titre?\s*:\s*(.+)$/im.exec(doc)
    const t = m?.[1]?.trim()
    return (t && t.replace(/[^\p{L}\p{N} _-]/gu, '').trim()) || 'scenario'
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Scénariste</div>
        <nav className="tabs">
          <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>Éditeur</button>
          <button className={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')}>Aperçu paginé</button>
          <button className={mode === 'rules' ? 'on' : ''} onClick={() => setMode('rules')}>Règles</button>
        </nav>
        <div className="actions">
          <button onClick={onNew}>Nouveau</button>
          <button onClick={() => fileInput.current?.click()} disabled={busy}>
            {busy ? 'Import…' : 'Importer PDF/texte'}
          </button>
          <button onClick={exportPdf}>Exporter PDF</button>
          <button onClick={() => download(`${baseName()}.fountain`, doc)}>.fountain</button>
          <button onClick={() => download(`${baseName()}.txt`, doc)}>.txt</button>
        </div>
        <input
          ref={fileInput} type="file" accept=".pdf,.txt,.fountain,.md" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f) }}
        />
      </header>

      {notice && (
        <div className="notice" onClick={() => setNotice(null)}>{notice} ✕</div>
      )}

      <main className={`main mode-${mode}`}>
        <div className="editor-wrap" style={{ display: mode === 'edit' ? undefined : 'none' }}>
          <div className="editor-page">
            <div ref={editorHost} className="editor-host" />
          </div>
          {showLint && (
            <aside className="side">
              <div className="side-head">
                Remarques ({issues.length})
                <button className="side-close" onClick={() => setShowLint(false)}>✕</button>
              </div>
              <LintPanel issues={issues} onGoTo={goTo} />
            </aside>
          )}
        </div>
        {mode === 'preview' && <Preview parsed={parsed} />}
        {mode === 'rules' && <RulesPanel />}
      </main>

      <footer className="statusbar">
        <span className="st-el">{currentType ? ELEMENTS[currentType].label : '—'}</span>
        <span>{pageCount} page{pageCount > 1 ? 's' : ''} (≈ {pageCount} min)</span>
        <span>{st.scenes} séquence{st.scenes > 1 ? 's' : ''}</span>
        <span>{st.words} mots</span>
        <span>{st.characters.length} personnage{st.characters.length > 1 ? 's' : ''}</span>
        <button className="st-lint" onClick={() => { setMode('edit'); setShowLint(v => !v) }}>
          {issues.length === 0 ? '✓ conforme' : `${issues.length} remarque${issues.length > 1 ? 's' : ''}`}
        </button>
      </footer>
    </div>
  )
}
