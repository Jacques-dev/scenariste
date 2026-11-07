import { REGEX, isUpperLine } from './rules/spec'

/**
 * Remet un texte importé (PDF, .txt, .fountain) sur le squelette de l'éditeur :
 *
 *   Titre: …
 *   Écrit par: …
 *   Source: …
 *   (Contact / Date / autres mentions éventuelles)
 *
 *   corps du scénario
 *
 * La page de titre d'origine peut prendre bien des formes : un bloc Fountain
 * (« Title: »), des lignes libres (« Passage de témoin », « Scénario : X »,
 * « écrit par » puis le nom à la ligne, « d'après le roman de… »), ou rien du
 * tout. On repère ces lignes avant le premier intitulé de séquence et on les
 * range dans les bons champs ; ce qui n'a pas de place reconnue est conservé
 * sous le squelette plutôt que perdu.
 *
 * Retire aussi les numéros de séquence isolés (« SÉQUENCE 1 ») posés juste
 * au-dessus d'un intitulé : la numérotation est l'affaire de la mise en page.
 */
export function normalizeImport(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const body = dropSceneNumbers(lines)

  let head: string[]
  let rest: string[]
  if (REGEX.titleKey.test(body.find(l => l.trim() !== '')?.trim() ?? '')) {
    // Bloc titre déjà au format clé: valeur (Fountain ou ancien export).
    const start = body.findIndex(l => l.trim() !== '')
    let end = start
    while (end < body.length && body[end].trim() !== '') end++
    head = foldFountainValues(body.slice(start, end))
    rest = body.slice(end)
  } else {
    const end = frontMatterEnd(body)
    head = body.slice(0, end).map(l => l.trim()).filter(l => l !== '')
    rest = body.slice(end)
  }

  const info = readTitleLines(head)
  const skeleton = [
    `Titre: ${info.title}`,
    `Écrit par: ${info.authors.join(' et ')}`,
    `Source: ${info.source}`,
    ...(info.contact.length ? [`Contact: ${info.contact.join(' · ')}`] : []),
    ...(info.date ? [`Date: ${info.date}`] : []),
    ...info.extras,
  ]
  const bodyText = rest.join('\n').replace(/^\s*\n/, '').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')
  return skeleton.join('\n') + '\n\n' + (bodyText ? bodyText + '\n' : '')
}

/** Numéro de séquence seul sur sa ligne : « SÉQUENCE 1 », « Séq. 12 : », « SEQUENCE N°3 ». */
const SCENE_NUMBER = /^s[ée]q(?:uence|\.)?\s*(?:n[°o]\s*)?\d+[a-z]?\s*:?$/i

function isSceneHeading(t: string): boolean {
  return REGEX.scene.test(t) && !REGEX.sceneInline.test(t)
}

function dropSceneNumbers(lines: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (SCENE_NUMBER.test(lines[i].trim())) {
      let j = i + 1
      while (j < lines.length && lines[j].trim() === '') j++
      if (j < lines.length && isSceneHeading(lines[j].trim())) continue
    }
    out.push(lines[i])
  }
  return out
}

/**
 * Fin de la page de titre « libre » : le premier intitulé de séquence, à
 * condition que ce qui précède ressemble bien à une page de titre (quelques
 * lignes courtes, pas de transition, pas de dialogue). Sinon 0 : pas de page
 * de titre, tout est corps.
 */
function frontMatterEnd(lines: string[]): number {
  const first = lines.findIndex(l => isSceneHeading(l.trim()))
  const end = first === -1 ? 0 : first
  const filled = lines.slice(0, end).map(l => l.trim()).filter(l => l !== '')
  if (filled.length === 0 || filled.length > 15) return 0
  if (filled.some(l => l.length > 90)) return 0
  // Une transition d'ouverture (« FONDU D'OUVERTURE : ») appartient au corps.
  const transition = filled.findIndex(l => isUpperLine(l) && REGEX.transitionWord.test(l))
  if (transition !== -1) {
    return transition === 0 ? 0 : lines.findIndex(l => l.trim() === filled[transition])
  }
  return end
}

/** Fountain : « Title: » suivi de valeurs indentées sur les lignes d'après. */
function foldFountainValues(block: string[]): string[] {
  const out: string[] = []
  for (const raw of block) {
    if (/^\s+\S/.test(raw) && out.length) {
      const prev = out[out.length - 1]
      out[out.length - 1] = /:\s*$/.test(prev) ? prev.replace(/\s*$/, ' ') + raw.trim() : `${prev} ${raw.trim()}`
    } else {
      out.push(raw.trim())
    }
  }
  return out
}

type Field = 'title' | 'author' | 'source' | 'contact' | 'date' | 'credit' | 'other'

const KEYS: [RegExp, Field][] = [
  [/^(titre|title)$/i, 'title'],
  [/^(écrit|écrite|écrits)\s+par$|^written\s+by$|^auteurs?$|^authors?$|^scénario(\s+(et|&)\s+dialogues?)?(\s+(de|par))?$|^scénaristes?$|^screenplay(\s+by)?$|^teleplay(\s+by)?$|^de$|^par$|^by$/i, 'author'],
  [/^(source|d['’]après|adapté\s+d[eu']|adaptation\s+d[eu']|inspiré\s+d[eu']|based\s+on)$/i, 'source'],
  [/^(contact|e-?mail|mail|courriel|tél\.?|téléphone|phone|agent)$/i, 'contact'],
  [/^(date|version|draft|draft\s+date)$/i, 'date'],
  [/^(credit|crédit)$/i, 'credit'],
]
const keyField = (key: string): Field =>
  KEYS.find(([re]) => re.test(key.trim()))?.[1] ?? 'other'

/** « Écrit par X », « d'après le roman de Y », « Scénario de Z » (sans deux-points). */
const INLINE = /^((?:écrit|écrite|écrits)\s+par|written\s+by|scénario(?:\s+(?:et|&)\s+dialogues?)?\s+(?:de|par)|screenplay\s+by|d['’]après|adapté\s+d[eu']|inspiré\s+d[eu']|based\s+on|by|de|par)\s+(.+)$/i
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/
const PHONE = /^(?:\+?\d[\d .-]{7,}\d)$/
const DATE = /^(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|(?:\d{1,2}\s+)?(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}|v(?:ersion)?\s*\d+(?:[.,]\d+)?)$/i

interface TitleData {
  title: string
  authors: string[]
  source: string
  contact: string[]
  date: string
  extras: string[]
}

function readTitleLines(head: string[]): TitleData {
  const d: TitleData = { title: '', authors: [], source: '', contact: [], date: '', extras: [] }
  const clean = (s: string) => s.replace(/^[*_]+|[*_]+$/g, '').trim()
  let pending: Field | null = null // clé seule (« écrit par ») : la valeur suit

  const assign = (field: Field, value: string, rawKey: string) => {
    const v = clean(value)
    switch (field) {
      case 'title': if (!d.title) d.title = v; else d.extras.push(`${rawKey}: ${v}`); break
      case 'author': if (v) d.authors.push(...v.split(/\s*(?:,|&|\bet\b|\band\b)\s*/).filter(Boolean)); break
      case 'source': d.source = d.source ? `${d.source} ${v}` : v; break
      case 'contact': d.contact.push(v); break
      case 'date': d.date = v; break
      case 'credit': break // « Écrit par » est imposé par le squelette
      default: d.extras.push(`${rawKey.trim().replace(/^\p{Ll}/u, c => c.toLocaleUpperCase('fr-FR'))}: ${v}`)
    }
  }

  for (const line of head) {
    if (pending) {
      assign(pending, line, '')
      pending = null
      continue
    }
    const kv = /^([^:]{1,40}?)\s*:\s*(.*)$/.exec(line)
    if (kv && !EMAIL.test(kv[1]) && !/^https?$/i.test(kv[1])) {
      const field = keyField(kv[1])
      // Un titre à deux-points (« Mission : Impossible ») en tête de page.
      if (field === 'other' && !d.title && d.authors.length === 0) { d.title = clean(line); continue }
      if (kv[2] === '') {
        // Clé seule (« Écrit par : ») : la valeur est sur la ligne suivante.
        if (field === 'other') d.extras.push(line)
        else if (field !== 'credit') pending = field
        continue
      }
      assign(field, kv[2], kv[1])
      continue
    }
    const lone = keyField(line)
    if (lone !== 'other' && lone !== 'title' && (d.title || !/^(de|par|by)$/i.test(line))) {
      if (lone !== 'credit') pending = lone
      continue
    }
    const inline = INLINE.exec(line)
    // « de X » / « par X » ne vaut crédit qu'une fois le titre trouvé
    // (sinon « Par une nuit d'hiver » deviendrait un auteur).
    if (inline && (d.title || !/^(de|par|by)$/i.test(inline[1]))) {
      assign(keyField(inline[1]), inline[2], inline[1])
      continue
    }
    if (EMAIL.test(line) || PHONE.test(line)) { d.contact.push(line); continue }
    if (DATE.test(line)) { d.date = line; continue }
    if (!d.title) { d.title = clean(line); continue }
    d.extras.push(line)
  }
  return d
}
