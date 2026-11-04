import { useState } from 'react'
import { Issue } from '../lint'

const keyOf = (it: Issue) => `${it.lineNo}|${it.message}`

export function LintPanel({
  issues,
  onGoTo,
  onFix,
  onFixAll,
}: {
  issues: Issue[]
  onGoTo: (lineNo: number) => void
  onFix: (issue: Issue) => void
  onFixAll: () => void
}) {
  // Premier clic : on va à la ligne et la remarque est sélectionnée.
  // Second clic sur la même remarque : on applique la correction (si elle existe).
  const [selected, setSelected] = useState<string | null>(null)

  const fixable = issues.filter(i => i.fix && !i.fix.manual).length
  if (issues.length === 0) {
    return (
      <div className="lint-panel">
        <div className="lint-ok">✓ Aucune remarque : le formatage respecte les règles.</div>
      </div>
    )
  }

  const onClick = (it: Issue) => {
    const key = keyOf(it)
    if (it.fix && selected === key) {
      setSelected(null)
      onFix(it)
    } else {
      setSelected(key)
      onGoTo(it.lineNo)
    }
  }

  return (
    <div className="lint-panel">
      {fixable > 1 && (
        <button className="lint-fixall" onClick={onFixAll}>
          ⚡ Tout corriger ({fixable} correction{fixable > 1 ? 's' : ''} automatique{fixable > 1 ? 's' : ''})
        </button>
      )}
      {issues.map((it, i) => {
        const isSel = selected === keyOf(it)
        return (
          <button
            key={i}
            className={`lint-item sev-${it.severity}${it.fix ? ' fixable' : ''}${isSel ? ' selected' : ''}`}
            title={
              it.fix
                ? isSel ? `Cliquer pour corriger : ${it.fix.label}` : 'Cliquer pour aller à la ligne, puis à nouveau pour corriger'
                : 'Cliquer pour aller à la ligne'
            }
            onClick={() => onClick(it)}
          >
            <span className="lint-line">l. {it.lineNo + 1}</span>
            <span className="lint-sev">{it.severity === 'warn' ? '⚠' : 'ℹ'}</span>
            <span className="lint-body">
              <span className="lint-msg">{it.message}</span>
              {isSel && it.fix && (
                <span className="lint-hint">Cliquer à nouveau pour corriger : {it.fix.label}</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
