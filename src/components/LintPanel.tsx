import { Issue } from '../lint'

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
  const fixable = issues.filter(i => i.fix && !i.fix.manual).length
  if (issues.length === 0) {
    return (
      <div className="lint-panel">
        <div className="lint-ok">✓ Aucune remarque : le formatage respecte les règles.</div>
      </div>
    )
  }
  return (
    <div className="lint-panel">
      {fixable > 1 && (
        <button className="lint-fixall" onClick={onFixAll}>
          ⚡ Tout corriger ({fixable} correction{fixable > 1 ? 's' : ''} automatique{fixable > 1 ? 's' : ''})
        </button>
      )}
      {issues.map((it, i) => (
        <div key={i} className={`lint-item sev-${it.severity}`}>
          <button className="lint-main" onClick={() => onGoTo(it.lineNo)}>
            <span className="lint-line">l. {it.lineNo + 1}</span>
            <span className="lint-sev">{it.severity === 'warn' ? '⚠' : 'ℹ'}</span>
            <span className="lint-msg">{it.message}</span>
          </button>
          {it.fix && (
            <button className="lint-fix" title={it.fix.label} onClick={() => onFix(it)}>
              ⚡ {it.fix.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
