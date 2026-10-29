# Scénariste

**➡ Site en ligne : https://jacques-dev.github.io/scenariste/**

Site web d'écriture de scénarios au format professionnel (standard international
« master scene format », avec les usages français).

## Fonctionnalités

- **Éditeur intelligent** : chaque ligne est reconnue en temps réel (intitulé de séquence,
  action, personnage, didascalie, dialogue, transition) et formatée avec les retraits,
  largeurs et casses du standard. Forçages manuels façon Fountain : `.intitulé`,
  `@Personnage`, `!action`, `>TRANSITION :`, `>centré<`.
- **Vérificateur** : panneau de remarques (règles du document de référence) avec saut
  direct à la ligne concernée.
- **Aperçu paginé** : pages US Letter, Courier 12, ≈ 55 lignes/page, numérotation,
  page de titre, coupures de dialogue `(SUITE)`, intitulés et noms jamais orphelins.
- **Import** : PDF (texte extractible), `.txt` ou `.fountain` — le texte est reclassé
  par retraits et contenu, puis reformaté.
- **Export** : PDF (via l'aperçu paginé → impression), `.fountain`, `.txt`.
- Chaque visite repart d'un document vierge (rien n'est stocké) ; une alerte prévient
  avant de quitter la page si un travail non exporté serait perdu.

## Règles de formatage

La référence complète (marges, retraits, casse, pagination, usages français) est dans
[docs/REGLES_FORMATAGE.md](docs/REGLES_FORMATAGE.md). Sa traduction machine, utilisée par
l'éditeur, la pagination, l'import et le lint, est dans [src/rules/spec.ts](src/rules/spec.ts).

## Lancer

```bash
npm install
npm run dev
```

puis ouvrir http://localhost:5173.
