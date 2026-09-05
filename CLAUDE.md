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
2. **Les transactions stockent `amount` toujours en AED** (cf. `tracker/page.tsx` save handler), converti au taux du **jour de la saisie** — pas au `m.rate` du mois. Donc `t.amount * rate` = **double conversion**, jamais. Et l'inverse est vrai aussi : re-dériver l'AED depuis `row.eur` au taux du mois ne redonne pas le montant saisi (une tx de 1 196 AED s'affichait 1 175). Pour l'AED d'une ligne « Réel », passer par **`rowAedSpent()`** (`lib/utils.ts`) : txns si présentes, sinon repli selon la devise de référence du poste. Pour l'EUR, lire `row.eur`, maintenu par les save handlers.
3. **Prévisionnel (confirmé)** = `soldeStart + earnAed - aA` (cf. `_old/js/pages/tracker.js:98`). Utilisé aussi comme balance bancaire dans Networth & Global.
4. **Revenus confirmés** = `entries.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0)`. Mois "legacy" (cf. `LEGACY_EARN_MONTHS` dans `src/lib/constants.ts`) n'utilisent PAS la table revenus, on lit `m.earn` directement.

## UI conventions
- KPIs : `<KpiCard>` (`components/ui/Card.tsx`), `hero` pour grandes valeurs
- Panneau détail : `<SlideOver>`
- **Tous les chiffres en gras** via `.mono-value` — ne pas overrider avec `style={{ fontWeight: 400 }}` inline
- **Alignement numérique tableaux** : spans avec `pr-2 inline-block border border-transparent` pour matcher le border-box du `CellInput` (1px transparent + 8px padding)

## Thème (jour / nuit)
- Tokens CSS dans `globals.css` : `:root` = sombre, `[data-theme="light"]` = clair. Stockés en **canaux RGB** (`--bg: 9 9 11`) car `tailwind.config.ts` les consomme via `rgb(var(--x) / <alpha-value>)` — c'est ce qui garde `bg-accent/10`, `border-danger/25`… fonctionnels. **Ne jamais y remettre un hex.**
- Échelles : `bg` 1→4 = fond de page → élévation ; `t` 1→4 = texte le plus contrasté → le plus discret. Les deux s'inversent en clair.
- État dans `AppProvider` : `theme` / `toggleTheme`, appliqué en `data-theme` sur `<html>`. **La persistance se fait dans `toggleTheme`, pas dans un effet** — un effet écraserait la préférence au montage (l'état initial est `'dark'`).
- Script anti-flash dans `app/layout.tsx` (clé `fhq_theme`, à garder alignée sur `THEME_KEY`).
- **Graphes** : Recharts pose `fill`/`stroke` en attributs SVG, qui n'acceptent pas `var()`. Les couleurs de chrome passent donc par `chartTheme(theme)` / `chartTooltipStyle(theme)` (`src/lib/chartTheme.ts`). Les palettes de séries (`PIE_COLORS`…) restent en dur, elles lisent sur les deux fonds.
- Toute nouvelle couleur d'UI passe par un token, pas par un hex.

## History (Settings)
- `HistoryEntry[]` capé à 200 dans `AppState.history`
- Log via `logChange(action, detail)` exposé par `AppProvider` — déjà branché sur create/update/delete de space, mois, poste, revenu
- Affiché uniquement dans `Settings` page (collapsible, pagination)

## Privacy mode
Toggle dans Sidebar. Ajoute `.amounts-hidden` sur `<body>` → CSS `::after` mask de 6 dots fixes sur tout `.mono-value` / `.hero-num`. Pas de transformation de valeurs réelles.

## Mobile
**Architecture parallèle** : UI mobile dédiée via `src/components/mobile/`. Le switch desktop ↔ mobile se fait via `useIsMobile()` (`src/lib/useIsMobile.ts`, breakpoint 768px).

- `MobileShell` (`(dashboard)/layout.tsx`) : top app bar (space switcher + privacy toggle) + bottom tabs (Tracker · Revenus · Global · Résidence · Plus) + drawer "Plus" pour les pages secondaires
- `BottomSheet` : modal slide-up réutilisable (anim `slide-up` dans tailwind config)
- Chaque page mobile fait `if (isMobile === true) return <MobileXxx />;` après les hooks et avant le return desktop
- **Backup desktop** : `?desktop=1` URL ou bouton "Forcer la vue desktop" dans le sheet Plus → force la UI desktop sur mobile (utilise localStorage `fdxb_force_desktop`)

**Pages mobile dédiées actuellement** : Tracker, Revenus, Vue Globale.
**Pages utilisant encore la UI desktop** (responsive via `max-md:` + tables wrappées `overflow-x-auto`) : Dashboard, Net Worth, Résidence, Setup, Settings.

### ⚠️ Règle de parité mobile (workflow utilisateur)
**Chaque feature ajoutée sur la UI desktop DOIT être portée en mobile dans le même commit/push.** L'utilisateur ne valide pas un feature mobile manquante après-coup.
- Si la feature touche une page qui a son `Mobile<Page>.tsx` → mettre à jour les 2 fichiers
- Si la feature touche une page encore en UI desktop sur mobile → vérifier que ça reste utilisable, sinon créer le `Mobile<Page>.tsx` correspondant
- Si la feature ajoute un nouveau bouton/sheet/flow → l'intégrer dans le pattern mobile (FAB, BottomSheet, cards verticales — pas de table dense)

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
