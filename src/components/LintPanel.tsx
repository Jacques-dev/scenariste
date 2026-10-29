import { Issue } from '../lint'

export function LintPanel({ issues, onGoTo }: { issues: Issue[]; onGoTo: (lineNo: number) => void }) {
  if (issues.length === 0) {
    return (
      <div className="lint-panel">
        <div className="lint-ok">✓ Aucune remarque : le formatage respecte les règles.</div>
      </div>
    )
  }
  return (
    <div className="lint-panel">
      {issues.map((it, i) => (
        <button key={i} className={`lint-item sev-${it.severity}`} onClick={() => onGoTo(it.lineNo)}>
          <span className="lint-line">l. {it.lineNo + 1}</span>
          <span className="lint-sev">{it.severity === 'warn' ? '⚠' : 'ℹ'}</span>
          <span className="lint-msg">{it.message}</span>
        </button>
      ))}
    </div>
  )
}
