import { useEffect, useMemo, useRef, useState } from 'react'
import { createEditor, EditorHandle } from './editor'
import { parseScript, stats } from './parser'
import { lint, Issue } from './lint'
import { SceneNav } from './components/SceneNav'
import { paginate } from './paginate'
import { ELEMENTS, ElType } from './rules/spec'
import { Preview } from './components/Preview'
import { LintPanel } from './components/LintPanel'
import { RulesPanel } from './components/RulesPanel'
import { ScenariosDialog, useSession } from './components/Cloud'
import { supabase, saveScenario, signInWithGoogle, ScenarioRow } from './supabase'

type Mode = 'edit' | 'preview' | 'rules'

// Document de départ : les mentions obligatoires de la page de titre
// (docs/REGLES_FORMATAGE.md §4) plus la source, facultative — la laisser
// vide ou supprimer la ligne si le scénario n'est pas une adaptation.
const NEW_DOC = 'Titre: \nÉcrit par: \nSource: \n\n'

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function App() {
  const [doc, setDoc] = useState<string>(NEW_DOC)
  const [cursorLine, setCursorLine] = useState(0)
  const [mode, setMode] = useState<Mode>('edit')
  const [showLint, setShowLint] = useState(true)
  const [showScenes, setShowScenes] = useState(true)
  const [showExport, setShowExport] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Stockage cloud (Supabase) — inactif tant que src/config.ts est vide.
  const session = useSession()
  const [showList, setShowList] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const lastSavedRef = useRef<string>('')

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

  // Chaque visite repart d'un document vierge : rien n'est conservé.
  // On prévient donc avant de quitter si un travail en cours serait perdu.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      const d = docRef.current
      if (d.trim() !== NEW_DOC.trim() && d !== lastSavedRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

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
    setCurrentId(null)
    lastSavedRef.current = ''
  }

  const onSave = async () => {
    if (!session || saving) return
    setSaving(true)
    try {
      const content = docRef.current
      const id = await saveScenario(currentId, content)
      setCurrentId(id)
      lastSavedRef.current = content
      setNotice('Scénario enregistré dans votre espace.')
    } catch (e) {
      setNotice(`Échec de l'enregistrement : ${e instanceof Error ? e.message : e}`)
    } finally {
      setSaving(false)
    }
  }

  const onOpenScenario = (row: ScenarioRow) => {
    const d = docRef.current
    if (d.trim() !== NEW_DOC.trim() && d !== lastSavedRef.current &&
        !window.confirm('Le document en cours n\'est pas enregistré. L\'écraser ?')) return
    setText(row.content)
    setCurrentId(row.id)
    lastSavedRef.current = row.content
    setShowList(false)
    setMode('edit')
  }

  // Applique les corrections automatiques du vérificateur (chaînées par ligne).
  const applyFixes = (toFix: Issue[]) => {
    const view = editor.current?.view
    if (!view) return
    const byLine = new Map<number, Issue[]>()
    for (const it of toFix) {
      if (!it.fix || it.lineNo + 1 > view.state.doc.lines) continue
      byLine.set(it.lineNo, [...(byLine.get(it.lineNo) ?? []), it])
    }
    const changes = [...byLine.entries()].flatMap(([lineNo, its]) => {
      const line = view.state.doc.line(lineNo + 1)
      let text = line.text
      for (const it of its) text = it.fix!.apply(text)
      return text === line.text ? [] : [{ from: line.from, to: line.to, insert: text }]
    })
    if (changes.length) view.dispatch({ changes })
  }

  const onLogin = () => {
    signInWithGoogle().catch(e => setNotice(`Connexion impossible : ${e.message}`))
  }

  const onLogout = async () => {
    await supabase?.auth.signOut()
    setCurrentId(null)
    lastSavedRef.current = ''
  }

  // Ctrl+S : enregistrer quand on est connecté.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void onSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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
      setCurrentId(null)
      lastSavedRef.current = ''
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
          <div className="menu-wrap">
            <button onClick={() => setShowExport(v => !v)}>Exporter ▾</button>
            {showExport && (
              <>
                <div className="menu-backdrop" onClick={() => setShowExport(false)} />
                <div className="menu">
                  <button onClick={() => { setShowExport(false); exportPdf() }}>
                    PDF <span className="menu-hint">mise en page finale, via impression</span>
                  </button>
                  <button onClick={() => { setShowExport(false); download(`${baseName()}.fountain`, doc) }}>
                    Fountain <span className="menu-hint">pour Final Draft, Highland…</span>
                  </button>
                  <button onClick={() => { setShowExport(false); download(`${baseName()}.txt`, doc) }}>
                    Texte brut <span className="menu-hint">.txt universel</span>
                  </button>
                </div>
              </>
            )}
          </div>
          {supabase && !session && (
            <button className="accent" onClick={onLogin}>Se connecter avec Google</button>
          )}
          {supabase && session && (
            <>
              <button className="accent" onClick={onSave} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button onClick={() => setShowList(true)}>Mes scénarios</button>
              <button title={session.user.email ?? ''} onClick={onLogout}>Déconnexion</button>
            </>
          )}
        </div>
        <input
          ref={fileInput} type="file" accept=".pdf,.txt,.fountain,.md" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f) }}
        />
      </header>

      {notice && (
        <div className="notice" onClick={() => setNotice(null)}>{notice} ✕</div>
      )}
      {showList && (
        <ScenariosDialog currentId={currentId} onOpen={onOpenScenario} onClose={() => setShowList(false)} />
      )}

      <main className={`main mode-${mode}`}>
        <div className="editor-wrap" style={{ display: mode === 'edit' ? undefined : 'none' }}>
          {showScenes && (
            <SceneNav parsed={parsed} cursorLine={cursorLine} onGo={goTo} onClose={() => setShowScenes(false)} />
          )}
          <div className="editor-page">
            <div ref={editorHost} className="editor-host" />
          </div>
          {showLint && (
            <aside className="side">
              <div className="side-head">
                Remarques ({issues.length})
                <button className="side-close" onClick={() => setShowLint(false)}>✕</button>
              </div>
              <LintPanel
                issues={issues}
                onGoTo={goTo}
                onFix={it => applyFixes([it])}
                onFixAll={() => applyFixes(issues)}
              />
            </aside>
          )}
        </div>
        {mode === 'preview' && <Preview parsed={parsed} />}
        {mode === 'rules' && <RulesPanel />}
      </main>

      <footer className="statusbar">
        <button className="st-toggle" onClick={() => { setMode('edit'); setShowScenes(v => !v) }}>
          ☰ Séquences
        </button>
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
