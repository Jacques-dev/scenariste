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

/** Gabarits de la barre d'insertion : [libellé, infobulle, gabarit, sélection]. */
const TEMPLATES: { label: string; tip: string; snippet: string; sel: [number, number] }[] = [
  {
    label: '+ Séquence',
    tip: 'Nouvelle séquence : INT./EXT. LIEU - MOMENT, en majuscules — ex. INT. CUISINE - JOUR',
    snippet: 'INT. LIEU - JOUR',
    sel: [5, 9],
  },
  {
    label: '+ Personnage',
    tip: 'Nom du personnage en MAJUSCULES, seul sur sa ligne ; sa réplique dessous',
    snippet: 'PERSONNAGE\nRéplique.',
    sel: [0, 10],
  },
  {
    label: '+ Didascalie',
    tip: 'Indication de jeu entre parenthèses, en minuscules, sous le nom ou entre deux répliques — ex. (un temps)',
    snippet: '(didascalie)',
    sel: [1, 11],
  },
  {
    label: '+ Transition',
    tip: 'Transition en MAJUSCULES terminée par deux-points, alignée à droite — ex. FONDU AU NOIR :',
    snippet: 'CUT TO:',
    sel: [0, 7],
  },
  {
    label: '+ Centré',
    tip: 'Texte centré (cartons : FIN, TROIS ANS PLUS TARD…)',
    snippet: '> TEXTE <',
    sel: [2, 7],
  },
]

/** Astuce affichée selon l'élément sous le curseur. */
const HINTS: Record<string, string> = {
  empty: 'Astuce : « INT. LIEU - JOUR » commence une séquence · un NOM EN MAJUSCULES seul lance un dialogue',
  title: 'Ces lignes composent la page de titre (visible dans l\'aperçu paginé)',
  scene: 'Décrivez l\'action au présent sous l\'intitulé, puis ligne vide',
  action: 'Un NOM EN MAJUSCULES seul sur sa ligne fait parler un personnage',
  character: 'Tapez la réplique dessous ; « (didascalie) » entre parenthèses pour le jeu',
  parenthetical: 'Poursuivez la réplique sous la didascalie',
  dialogue: 'Ligne vide pour terminer la réplique et revenir à l\'action',
  transition: 'La transition s\'aligne à droite ; enchaînez avec un nouvel intitulé',
  centered: 'Texte centré — réservé aux cartons (FIN, PLUS TARD…)',
}

// Document de départ : les mentions obligatoires de la page de titre
// (docs/REGLES_FORMATAGE.md §4) plus la source, facultative — la laisser
// vide ou supprimer la ligne si le scénario n'est pas une adaptation.
const NEW_DOC = 'Titre: \nÉcrit par: \nSource: (facultatif sauf si adaptation)\n\n'

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

  // Boîte de confirmation stylée (remplace window.confirm).
  const [confirmBox, setConfirmBox] = useState<{ message: string; resolve: (ok: boolean) => void } | null>(null)
  const askConfirm = (message: string) =>
    new Promise<boolean>(resolve => setConfirmBox({ message, resolve }))
  const answerConfirm = (ok: boolean) => {
    confirmBox?.resolve(ok)
    setConfirmBox(null)
  }

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

  const onNew = async () => {
    const dirty = doc.trim() !== '' && doc.trim() !== NEW_DOC.trim() && doc !== lastSavedRef.current
    if (dirty && !(await askConfirm('Remplacer le document actuel par un document vide ? Le texte non enregistré sera perdu.'))) return
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

  const onOpenScenario = async (row: ScenarioRow) => {
    const d = docRef.current
    if (d.trim() !== NEW_DOC.trim() && d !== lastSavedRef.current &&
        !(await askConfirm('Le document en cours n\'est pas enregistré. L\'écraser ?'))) return
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
      if (!it.fix) continue
      for (const ln of it.fix.lines ?? [it.lineNo]) {
        if (ln + 1 > view.state.doc.lines) continue
        byLine.set(ln, [...(byLine.get(ln) ?? []), it])
      }
    }
    const changes = [...byLine.entries()].flatMap(([lineNo, its]) => {
      const line = view.state.doc.line(lineNo + 1)
      let text = line.text
      for (const it of its) text = it.fix!.apply(text)
      return text === line.text ? [] : [{ from: line.from, to: line.to, insert: text }]
    })
    if (changes.length) view.dispatch({ changes })
  }

  // « Tout corriger » : enchaîne les passes (une correction peut en révéler une
  // autre), en excluant les corrections à décider au cas par cas (fix.manual).
  const fixAll = () => {
    const view = editor.current?.view
    if (!view) return
    for (let pass = 0; pass < 5; pass++) {
      const before = view.state.doc.toString()
      const fixable = lint(parseScript(before)).filter(i => i.fix && !i.fix.manual)
      if (fixable.length === 0) break
      applyFixes(fixable)
      if (view.state.doc.toString() === before) break
    }
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
      const dirty = doc.trim() !== '' && doc.trim() !== NEW_DOC.trim() && doc !== lastSavedRef.current
      if (dirty && !(await askConfirm(`Remplacer le document actuel par « ${file.name} » reformaté ?`))) {
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
        <ScenariosDialog
          currentId={currentId}
          onOpen={onOpenScenario}
          onClose={() => setShowList(false)}
          confirm={askConfirm}
        />
      )}
      {confirmBox && (
        <div className="overlay" onClick={() => answerConfirm(false)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <h3>Confirmation</h3>
            <p className="dialog-sub">{confirmBox.message}</p>
            <div className="dialog-actions">
              <button className="accent" autoFocus onClick={() => answerConfirm(true)}>Confirmer</button>
              <button className="ghost" onClick={() => answerConfirm(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      <main className={`main mode-${mode}`}>
        <div className="editor-wrap" style={{ display: mode === 'edit' ? undefined : 'none' }}>
          {showScenes && (
            <SceneNav parsed={parsed} cursorLine={cursorLine} onGo={goTo} onClose={() => setShowScenes(false)} />
          )}
          <div className="editor-col">
            <div className="insertbar">
              <span className="insertbar-label">Insérer :</span>
              {TEMPLATES.map(t => (
                <button
                  key={t.label}
                  title={t.tip}
                  onClick={() => editor.current?.insertSnippet(t.snippet, t.sel[0], t.sel[1])}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="editor-page">
              <div ref={editorHost} className="editor-host" />
            </div>
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
                onFix={it => { applyFixes([it]); goTo(it.lineNo) }}
                onFixAll={fixAll}
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
        <span className="st-hint">{HINTS[currentType ?? 'empty'] ?? ''}</span>
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
