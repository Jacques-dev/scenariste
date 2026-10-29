import { useMemo } from 'react'
import { ParsedLine, titleInfo } from '../parser'
import { paginate, OutLine } from '../paginate'
import { ELEMENTS, ElType } from '../rules/spec'

function lineStyle(l: OutLine): React.CSSProperties {
  if (l.type === 'blank') return {}
  if (l.type === 'more') {
    return { paddingLeft: `${ELEMENTS.parenthetical.indentCh}ch` }
  }
  const spec = ELEMENTS[l.type as Exclude<ElType, 'blank'>]
  if (!spec) return {}
  const style: React.CSSProperties = {}
  if (spec.align === 'right') style.textAlign = 'right'
  else if (spec.align === 'center') style.textAlign = 'center'
  else style.paddingLeft = `${spec.indentCh}ch`
  return style
}

export function Preview({ parsed }: { parsed: ParsedLine[] }) {
  const pages = useMemo(() => paginate(parsed), [parsed])
  const info = useMemo(() => titleInfo(parsed), [parsed])

  return (
    <div className="pages">
      {info?.title && (
        <div className="page title-page">
          <div className="title-main">
            <div className="tp-title">{info.title.toLocaleUpperCase('fr-FR')}</div>
            <div className="tp-credit">{info.credit ?? 'écrit par'}</div>
            {info.author && <div className="tp-author">{info.author}</div>}
          </div>
          {info.source && <div className="tp-source">Source : {info.source}</div>}
          <div className="tp-contact">
            {info.contact && <div>{info.contact}</div>}
            {info.date && <div>{info.date}</div>}
          </div>
        </div>
      )}
      {pages.map(p => (
        <div className="page" key={p.number}>
          {p.number > 1 && <div className="pagenum">{p.number}.</div>}
          <div className="page-body">
            {p.lines.map((l, i) => (
              <div key={i} className={`pl pl-${l.type}`} style={lineStyle(l)}>
                {l.text === '' ? ' ' : l.text}
              </div>
            ))}
          </div>
        </div>
      ))}
      {pages.length === 0 && !info?.title && (
        <p className="empty-note">Rien à afficher : écrivez quelque chose dans l'éditeur.</p>
      )}
    </div>
  )
}
