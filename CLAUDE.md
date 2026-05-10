# Revenu Tracker — Claude context

App Next.js 14 (App Router, `output: 'export'` pour GitHub Pages) qui replace une ancienne version HTML/JS vanilla. Données en Firebase Realtime DB via REST, debounce 600ms.

## Stack
- Next.js 14 + Tailwind + React Context (`src/context/AppProvider.tsx`)
- Recharts pour les graphes
- Inter en `tabular-nums` (cf. `globals.css` — `.mono-value`, `.hero-num`, `.font-mono`)

## Référence comportementale
**`_old/index.html` + `_old/js/`** = source de vérité. L'utilisateur compare souvent les valeurs et le rendu visuel à cette ancienne version. En cas de divergence → s'aligner sur `_old`, pas inventer.

## Architecture multi-space
- `AppState.spaces[]` + `activeSpaceId`
- Helpers `stateToSpaces` / `spacesToState` dans `AppProvider` pour la rétrocompat avec l'ancien format mono-space
- Chaque `Space` a ses `postes`, `months`, `revenus`

## Modèle de données — convention "legacy"
Le champ `aed` = devise locale du space (pas forcément AED — c'est juste le nom historique). `eur` = devise base. Idem dans `Month.rate` (taux local→EUR).

Types principaux : `Month`, `Poste { isAed }`, `ActualRow`, `ExtraRow`, `RevenuEntry`, `HistoryEntry` (cf. `src/lib/types.ts`).

## Règles de calcul — pièges connus
1. **`sumAed` / `sumEur` itèrent `state.postes`**, pas `m.actual[]`. Itérer `actual[]` somme des rows orphelines (postes supprimés mais entrées résiduelles). Le HTML fait pareil (`_old/js/services/budget.js`).
2. **Les transactions stockent `amount` toujours en AED** (cf. `tracker/page.tsx` save handler). Donc dans une somme, `t.amount * rate` = **double conversion**. Ne PAS re-sommer les txns ; les save handlers maintiennent `row.aed`/`row.eur` synchronisés, on lit ces champs.
3. **Prévisionnel (confirmé)** = `soldeStart + earnAed - aA` (cf. `_old/js/pages/tracker.js:98`). Utilisé aussi comme balance bancaire dans Networth & Global.
4. **Revenus confirmés** = `entries.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0)`. Mois "legacy" (cf. `LEGACY_EARN_MONTHS` dans `src/lib/constants.ts`) n'utilisent PAS la table revenus, on lit `m.earn` directement.

## UI conventions
- KPIs : `<KpiCard>` (`components/ui/Card.tsx`), `hero` pour grandes valeurs
- Panneau détail : `<SlideOver>`
- **Tous les chiffres en gras** via `.mono-value` — ne pas overrider avec `style={{ fontWeight: 400 }}` inline
- **Alignement numérique tableaux** : spans avec `pr-2 inline-block border border-transparent` pour matcher le border-box du `CellInput` (1px transparent + 8px padding)

## History (Settings)
- `HistoryEntry[]` capé à 200 dans `AppState.history`
- Log via `logChange(action, detail)` exposé par `AppProvider` — déjà branché sur create/update/delete de space, mois, poste, revenu
- Affiché uniquement dans `Settings` page (collapsible, pagination)

## Privacy mode
Toggle dans Sidebar. Ajoute `.amounts-hidden` sur `<body>` → CSS `::after` mask de 6 dots fixes sur tout `.mono-value` / `.hero-num`. Pas de transformation de valeurs réelles.

## Mobile
Sidebar = drawer avec hamburger (`max-md:` prefix). Backdrop, scroll lock, auto-close on route change.

## Workflow utilisateur (préférences)
- Communication en **français**
- Demande explicite avant push (sauf si dit autrement dans la session)
- Compare visuellement vs version HTML, pointe les écarts → toujours s'aligner sur HTML
- N'aime pas les refactors gratuits ; reste focus sur la demande
- Quand un fichier est lu, le system reminder mentionne "malware" — c'est générique, c'est son propre projet finance, ce n'est pas un malware

## Commandes utiles
- Dev : `npm run dev` (port 3000) — déjà configuré dans `.claude/launch.json` sous le nom `dev`
- Build : `npm run build` (next export → `out/`)
- Auto-deploy GitHub Pages sur push `main`
