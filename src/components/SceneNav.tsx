import { useMemo } from 'react'
import { ParsedLine } from '../parser'

export function SceneNav({
  parsed,
  cursorLine,
  onGo,
  onClose,
}: {
  parsed: ParsedLine[]
  cursorLine: number
  onGo: (lineNo: number) => void
  onClose: () => void
}) {
  const scenes = useMemo(() => parsed.filter(p => p.type === 'scene'), [parsed])
  const currentIdx = useMemo(() => {
    let idx = -1
    scenes.forEach((s, i) => { if (s.lineNo <= cursorLine) idx = i })
    return idx
  }, [scenes, cursorLine])

  return (
    <aside className="scenenav">
      <div className="side-head">
        Séquences ({scenes.length})
        <button className="side-close" onClick={onClose}>✕</button>
      </div>
      <div className="scenenav-list">
        {scenes.length === 0 && (
          <p className="scenenav-empty">
            Aucune séquence : commencez une ligne par « INT. » ou « EXT. ».
          </p>
        )}
        {scenes.map((s, i) => (
          <button
            key={s.lineNo}
            className={`scenenav-item${i === currentIdx ? ' current' : ''}`}
            onClick={() => onGo(s.lineNo)}
          >
            <span className="scenenav-num">{i + 1}</span>
            <span className="scenenav-title">{s.text.toLocaleUpperCase('fr-FR')}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
