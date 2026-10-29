import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, listScenarios, deleteScenario, ScenarioRow } from '../supabase'

/** Session Supabase courante (null si déconnecté ou non configuré). */
export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  return session
}

export function ScenariosDialog({
  currentId,
  onOpen,
  onClose,
}: {
  currentId: string | null
  onOpen: (row: ScenarioRow) => void
  onClose: () => void
}) {
  const [rows, setRows] = useState<ScenarioRow[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = () => {
    listScenarios().then(setRows).catch(e => setMsg(e.message))
  }
  useEffect(refresh, [])

  const remove = async (row: ScenarioRow) => {
    if (!window.confirm(`Supprimer définitivement « ${row.title} » ?`)) return
    try {
      await deleteScenario(row.id)
      refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog dialog-wide" onClick={e => e.stopPropagation()}>
        <h3>Mes scénarios</h3>
        {msg && <div className="dialog-msg">{msg}</div>}
        {rows === null && !msg && <p className="dialog-sub">Chargement…</p>}
        {rows?.length === 0 && (
          <p className="dialog-sub">Aucun scénario enregistré. Écrivez, puis cliquez sur « Enregistrer ».</p>
        )}
        {rows && rows.length > 0 && (
          <ul className="scenario-list">
            {rows.map(r => (
              <li key={r.id} className={r.id === currentId ? 'current' : ''}>
                <button className="sc-open" onClick={() => onOpen(r)}>
                  <span className="sc-title">{r.title}</span>
                  <span className="sc-date">
                    {new Date(r.updated_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
                    {r.id === currentId ? ' — ouvert' : ''}
                  </span>
                </button>
                <button className="sc-del" title="Supprimer" onClick={() => remove(r)}>🗑</button>
              </li>
            ))}
          </ul>
        )}
        <div className="dialog-actions">
          <button className="ghost" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}
