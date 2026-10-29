import { useEffect, useState } from 'react'

interface Step {
  selector: string
  title: string
  text: string
}

const STEPS: Step[] = [
  {
    selector: '.editor-host',
    title: 'La page',
    text: 'Écrivez ici : chaque ligne est reconnue et formatée automatiquement. '
      + '« INT. LIEU - JOUR » devient un intitulé de séquence, un NOM EN MAJUSCULES '
      + 'seul sur sa ligne lance un dialogue, « (un temps) » est une didascalie. '
      + 'La touche Tab fait tourner le type de la ligne, comme dans Final Draft.',
  },
  {
    selector: '.insertbar',
    title: 'Insérer un élément',
    text: 'Pas envie de retenir la syntaxe ? Ces boutons insèrent un gabarit prêt '
      + 'à remplir au bon endroit — la partie à compléter est déjà sélectionnée, '
      + 'tapez par-dessus.',
  },
  {
    selector: '.side',
    title: 'Les remarques',
    text: 'Le vérificateur compare votre texte aux règles professionnelles. '
      + 'Une remarque qui passe au vert au survol se corrige d\'un clic ; '
      + 'les autres mènent à la ligne concernée.',
  },
  {
    selector: '.scenenav',
    title: 'Les séquences',
    text: 'La liste de vos séquences, pour naviguer d\'un clic dans le script. '
      + 'La séquence où se trouve le curseur est surlignée.',
  },
  {
    selector: '.topbar',
    title: 'Aperçu et export',
    text: '« Aperçu paginé » montre les vraies pages (1 page ≈ 1 minute d\'écran). '
      + '« Exporter » produit le PDF final, un fichier Fountain ou texte. '
      + 'Connectez-vous avec Google pour enregistrer vos scénarios en ligne.',
  },
]

export function Guide({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const step = STEPS[i]

  useEffect(() => {
    if (!step) { onClose(); return }
    const el = document.querySelector(step.selector)
    if (!el) { setI(x => x + 1); return } // cible absente (panneau fermé) : étape sautée
    const measure = () => {
      const target = document.querySelector(step.selector)
      setRect(target ? target.getBoundingClientRect() : null)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i])

  if (!step || !rect) return null
  const last = i >= STEPS.length - 1

  // Bulle sous la cible, sinon au-dessus, sinon par-dessus (cible plein écran).
  // La bulle est plus haute sur écran étroit (texte replié sur plus de lignes).
  const bubbleH = window.innerWidth < 500 ? 300 : 210
  const bubbleStyle: React.CSSProperties = {
    left: Math.max(12, Math.min(rect.left + rect.width / 2 - 170, window.innerWidth - 352)),
  }
  if (rect.bottom + bubbleH < window.innerHeight) bubbleStyle.top = rect.bottom + 12
  else if (rect.top - bubbleH > 0) bubbleStyle.bottom = window.innerHeight - rect.top + 12
  else bubbleStyle.top = Math.max(12, Math.min(rect.top + 48, window.innerHeight - bubbleH - 20))

  return (
    <div className="guide">
      <div
        className="guide-highlight"
        style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }}
      />
      <div className="guide-bubble" style={bubbleStyle}>
        <div className="guide-step">{i + 1} / {STEPS.length}</div>
        <h4>{step.title}</h4>
        <p>{step.text}</p>
        <div className="guide-actions">
          <button className="ghost" onClick={onClose}>Passer le guide</button>
          {i > 0 && <button onClick={() => setI(i - 1)}>Précédent</button>}
          <button className="accent" autoFocus onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? 'C\'est parti !' : 'Suivant'}
          </button>
        </div>
      </div>
    </div>
  )
}
