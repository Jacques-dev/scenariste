import { ELEMENTS, PAGE, ElType } from '../rules/spec'

const ORDER: Exclude<ElType, 'blank' | 'title'>[] = [
  'scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'centered',
]

const inToCm = (v: number) => (v * 2.54).toFixed(1).replace('.', ',')

export function RulesPanel() {
  return (
    <div className="rules-panel">
      <h2>Règles de formatage appliquées</h2>
      <p>
        Standard international (<em>master scene format</em>) : Courier {PAGE.fontSizePt} pt,
        10 caractères/pouce, 6 lignes/pouce, ≈ {PAGE.linesPerPage} lignes par page,
        soit <strong>1 page ≈ 1 minute d'écran</strong>. Marges : gauche {inToCm(PAGE.marginLeftIn)} cm
        (reliure), droite {inToCm(PAGE.marginRightIn)} cm, haut et bas {inToCm(PAGE.marginTopIn)} cm.
        La référence complète est dans <code>docs/REGLES_FORMATAGE.md</code>.
      </p>

      <h3>Retraits des éléments</h3>
      <table>
        <thead>
          <tr><th>Élément</th><th>Retrait</th><th>Largeur</th><th>Casse</th></tr>
        </thead>
        <tbody>
          {ORDER.map(t => {
            const s = ELEMENTS[t]
            return (
              <tr key={t}>
                <td>{s.label}</td>
                <td>{s.align === 'right' ? 'aligné à droite' : s.align === 'center' ? 'centré' : `${s.indentCh / 10} po (${inToCm(s.indentCh / 10)} cm)`}</td>
                <td>{s.widthCh} car.</td>
                <td>{s.uppercase ? 'MAJUSCULES' : 'mixte'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h3>Comment l'éditeur reconnaît les éléments</h3>
      <ul>
        <li><strong>Intitulé de séquence</strong> : ligne commençant par <code>INT.</code>, <code>EXT.</code>, <code>INT./EXT.</code>, <code>I/E</code> ou <code>SÉQ.</code> — ex. <code>INT. CUISINE - JOUR</code></li>
        <li><strong>Personnage</strong> : ligne en MAJUSCULES, précédée d'une ligne vide et suivie d'une réplique — ex. <code>MARCEL (V.O.)</code></li>
        <li><strong>Didascalie</strong> : ligne entre parenthèses sous un nom — ex. <code>(un temps)</code></li>
        <li><strong>Dialogue</strong> : toute ligne qui suit un personnage ou une didascalie</li>
        <li><strong>Transition</strong> : MAJUSCULES terminées par <code>:</code> — ex. <code>FONDU AU NOIR :</code></li>
        <li><strong>Action</strong> : tout le reste</li>
      </ul>

      <h3>Forçages manuels (si la détection se trompe)</h3>
      <ul>
        <li><code>.intitulé</code> — force un intitulé de séquence</li>
        <li><code>@Personnage</code> — force un nom de personnage</li>
        <li><code>!texte</code> — force de l'action</li>
        <li><code>&gt;TRANSITION :</code> — force une transition</li>
        <li><code>&gt;texte centré&lt;</code> — centre le texte</li>
      </ul>

      <h3>Page de titre</h3>
      <p>
        En tête de document, renseignez : <code>Titre:</code>, <code>Écrit par:</code> (ou
        <code> Auteur:</code>), <code>Source:</code>, <code>Contact:</code>, <code>Date:</code>.
        La page de titre est générée dans l'aperçu et l'export.
      </p>

      <h3>Pagination automatique</h3>
      <ul>
        <li>≈ {PAGE.linesPerPage} lignes par page, numéro en haut à droite (page 1 non numérotée)</li>
        <li>Intitulé jamais orphelin en bas de page (au moins 2 lignes d'action le suivent)</li>
        <li>Nom de personnage jamais seul en bas de page</li>
        <li>Dialogue coupé avec <code>(SUITE)</code>, repris avec <code>NOM (SUITE)</code></li>
      </ul>
    </div>
  )
}
