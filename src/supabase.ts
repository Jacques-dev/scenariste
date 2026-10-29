import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

/** Client Supabase, ou null tant que src/config.ts n'est pas renseigné. */
export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null

export interface ScenarioRow {
  id: string
  title: string
  content: string
  updated_at: string
}

/** Connexion via Google uniquement (OAuth) ; revient sur le site après le consentement. */
export async function signInWithGoogle(): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
  })
  if (error) throw new Error(error.message)
}

const TITLE_RE = /^\s*titre?\s*:\s*(.+)$/im

export function titleOf(content: string): string {
  return TITLE_RE.exec(content)?.[1]?.trim() || 'Sans titre'
}

/** Insère ou met à jour un scénario ; retourne son id. */
export async function saveScenario(id: string | null, content: string): Promise<string> {
  if (!supabase) throw new Error('Supabase non configuré.')
  const payload = { title: titleOf(content), content, updated_at: new Date().toISOString() }
  if (id) {
    // .select() pour détecter un update à 0 ligne (scénario supprimé depuis un
    // autre appareil, par exemple) : on le recrée au lieu d'échouer en silence.
    const { data, error } = await supabase
      .from('scenarios').update(payload).eq('id', id).select('id')
    if (error) throw new Error(error.message)
    if (data && data.length > 0) return id
  }
  const { data, error } = await supabase.from('scenarios').insert(payload).select('id').single()
  if (error) throw new Error(error.message)
  return data.id
}

export async function listScenarios(): Promise<ScenarioRow[]> {
  if (!supabase) throw new Error('Supabase non configuré.')
  const { data, error } = await supabase
    .from('scenarios')
    .select('id,title,content,updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function deleteScenario(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré.')
  const { error } = await supabase.from('scenarios').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
