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

## Identité des mois (id, année, collision)
`Month.id` est le NOM du mois (« OCTOBRE »), sans année — jusqu'à ce qu'une collision
survienne (le mois revient chaque année). `Month._year` est un champ **calculé**
(`detectYears()` dans `utils.ts`), jamais saisi. Il est recalculé par `AppProvider` à
chaque changement des mois (pour `state.months` ET `spaces[].months`), donc à jour pour
toutes les pages — la lecture des revenus par période en dépend. Dans du code pur / des
tests, appeler `detectYears()` (ou poser `_year`) avant de s'en servir.

**Collision de nom** : la création d'un mois passe par `newMonthId()` + `buildNewMonth()`
(`lib/months.ts`, logique unique desktop + mobile, testée). `newMonthId` suffixe
automatiquement l'année à 2 chiffres (« OCTOBRE 26 ») via `inferNextMonthYear()`
(`utils.ts`) — déterministe, dérivé du dernier mois de la liste, aucune saisie demandée.
La collision se juge sur le MOIS CALENDAIRE, pas sur la chaîne exacte : « DÉCEMBRE »
collisionne avec « DECEMBRE » (avant, l'accent suffisait à créer un second mois sans
suffixe — le « DÉCEMBRE » de 2026 en prod vient de là). Format choisi pour matcher le
contournement manuel que l'utilisateur avait déjà utilisé avant ce fix (voir son mois
réel « OCTOBRE 26 »). Le suffixe à 4 chiffres reste toléré en lecture.

**Tout code qui doit reconnaître un nom de mois depuis un id** (afficher, dater,
grouper) passe par `monthBaseName(id)` / `monthYearSuffix(id)` / `monthIndexOf(id)`
(`lib/constants.ts`) — PAS de comparaison exacte contre `MOIS_LIST` ni
`LEGACY_EARN_MONTHS.includes(m.id)` en dur : ça casse dès qu'un suffixe apparaît
(cf. `bankHistory.ts`, `trips/page.tsx:trackerMonthForDate`, `shortMonth()`).

**Renommer un mois** : `renameMonth(oldId, newName)` (`AppProvider`) — rekey aussi
`trip.swap.monthId` (la SEULE référence persistée à un id de mois hors `Month`
lui-même ; les rechargements de voyage affichés sont recalculés à la volée depuis
`mo.id`). La table Revenus n'est PAS rekeyée : elle est indexée par période calendaire,
pas par id de mois (cf. plus bas) — seul un mois au nom libre, lu par clé exacte, garde
son rekey. Bouton crayon à côté du mois courant (desktop : pill du nav ; mobile : sheet
dédiée).

Si le nom visé est pris par un AUTRE mois **sans suffixe année explicite**, ça ne
bloque PAS : ce mois-là est automatiquement poussé vers son propre suffixe année
(`monthBaseName + son _year`, cf. `detectYears`) pour libérer le nom — même
principe que `createMonth`, appliqué au renommage (l'utilisateur a explicitement
demandé cette cohérence : « c'est ce que je t'ai demandé de fix à la base »). Le
blocage franc (`error`) ne survient que si le nom visé porte DÉJÀ un suffixe
explicite qui collisionne (aucune direction sensée pour un swap), ou si le swap
lui-même collisionnerait. Retour `{ error, swapped? }`, pas juste une string —
`swapped` sert à logger/expliquer le second renommage silencieux.

## Règles de calcul — pièges connus
1. **`sumAed` / `sumEur` itèrent `state.postes`**, pas `m.actual[]`. Itérer `actual[]` somme des rows orphelines (postes supprimés mais entrées résiduelles). Le HTML fait pareil (`_old/js/services/budget.js`).
2. **Les transactions stockent `amount` toujours en AED** (cf. `tracker/page.tsx` save handler), converti au taux du **jour de la saisie** — pas au `m.rate` du mois. Donc `t.amount * rate` = **double conversion**, jamais. Et l'inverse est vrai aussi : re-dériver l'AED depuis `row.eur` au taux du mois ne redonne pas le montant saisi (une tx de 1 196 AED s'affichait 1 175). Pour l'AED d'une ligne « Réel », passer par **`rowAedSpent()`** (`lib/utils.ts`) : txns si présentes, sinon repli selon la devise de référence du poste. Pour l'EUR, lire `row.eur`, maintenu par les save handlers.
3. **Prévisionnel (confirmé)** = `soldeStart + earnAed - aA` (cf. `_old/js/pages/tracker.js:98`). Utilisé aussi comme balance bancaire dans Networth & Global.
4. **Revenus confirmés** = `entries.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0)`. Les mois « legacy » (octobre 2025 → février 2026) n'utilisent PAS la table revenus, on lit `m.earn`. **Toujours tester avec `isLegacyMonth(m)`** (`lib/revenus.ts`, critère par PÉRIODE) — jamais `LEGACY_EARN_MONTHS.includes(m.id)` ni `isLegacyEarnMonth(id)` : par nom, le « DÉCEMBRE » de 2026 était pris pour celui de 2025 et affichait 0 revenu.
5. **« Aujourd'hui »** = `todayISO()` (`lib/utils.ts`, date LOCALE). `new Date().toISOString()` donne la date UTC : à Dubaï, entre minuit et 4 h, c'était la veille.

## Revenus — table indexée par période (année + mois)
Toute la logique vit dans **`lib/revenus.ts`** (ré-exportée par `utils.ts`) et le hook
**`lib/useRevenus.ts`**, partagé par `revenus/page.tsx` et `MobileRevenus.tsx` (qui ne font
plus que du rendu : période affichée, formulaire, écritures → une seule implémentation).

**Stockage** (`state.revenus.months`) — format inchangé pour l'existant, aucune migration :
- année de base 2026 (`REV_BASE_YEAR`) : clé = nom seul → « OCTOBRE »
- toute autre année : nom + année 2 chiffres → « JANVIER 27 »

Ne JAMAIS écrire `revenus.months[nom]` en dur. Passer par :
- `revKey(year, idx)` / `resolveRevKey(months, year, idx)` (clé de lecture/écriture,
  tolère « FEVRIER » sans accent et le suffixe 4 chiffres) ;
- `revYearView(months, year)` : la table d'UNE année par nom de mois — la forme que
  manipulent les pages ; `revYears()` : années proposées (données + année en cours + année
  suivante à partir d'octobre) ;
- écritures pures : `buildRevenuEntry`, `addRevenu`, `updateRevenu` (déplace l'entrée si
  le mois / l'année du formulaire change), `removeRevenu`, `confirmRevenu`.

Pourquoi : la table n'avait pas d'année (« l'année en cours » implicite). Dès janvier 2027
les revenus de janvier 2026 auraient été lus comme ceux de janvier 2027, et tout 2026
serait passé « à venir ».

**Période affichée** (sélecteur d'année : en-tête desktop, sheet « Choisir un mois » sur
mobile ; le formulaire porte Mois + Année) :
- **Atterrissage** : année et mois CALENDAIRES courants (desktop + mobile), pas le dernier
  mois qui a des données — sinon saisir des revenus en prévision pour le mois suivant
  faisait ouvrir la page dessus.
- **Stats annuelles** (`renderGlobal`, pour l'année affichée) : un mois pas encore
  commencé (`isFutureRevMonth(nom, année)`) ne compte PAS — en septembre, tout se calcule
  de janvier à septembre inclus, quel que soit le `status` des entrées. Une année passée
  compte en entier. Le mois reste listé (estompé, badge « À VENIR », delta/%/vs M-1 à
  « — ») et ses barres restent visibles mais estompées (`<Cell fillOpacity>`), hors total.

**Lecture côté tracker** : **toujours `monthRevenus(revenusMonths, m)`** (l'objet `Month`,
plus son id) — résolution par période : « OCTOBRE 26 » lit la clé « OCTOBRE » (2026),
« JANVIER 27 » lit « JANVIER 27 », et l'OCTOBRE de 2025 ne lit rien. Mois au nom libre ou
sans année connue → clé exacte. `monthRevenuConfirmedEur(m, …)` = la valeur « Revenus » du
tracker (earn legacy ou entrées confirmées) ; Dashboard et Vue Globale (desktop + mobile)
somment ça mois tracker par mois tracker pour rester réconciliables avec lui.

**Taux de change des revenus non confirmés** : une prévision / entrée en attente n'est
pas encore encaissée → affichée et sommée AU TAUX DU JOUR, comme le budget du tracker
(`revenuLive` / `revenusMonthsLive`, `lib/utils.ts`). Recalculé à la LECTURE, jamais
réécrit en base : les pages Revenus lisent `viewMonths`, les handlers d'écriture lisent
`rev.months` brut (mêmes index). Ancre : USD/AED → l'AED est fixe (montant × taux de
swap, dirham peggé au dollar), l'EUR en découle (EUR/USD dérivé de l'EUR/AED live via
`USD_AED_PEG`) ; EUR → l'EUR est fixe, l'AED en découle. **La confirmation fige ces
mêmes valeurs** (`revenuAtRate` au taux live dans `confirmEntry`, desktop + mobile) →
aucun saut au clic ; avant, seules les entrées EUR étaient rafraîchies et une entrée USD
gardait l'EUR du jour de SAISIE (récurrence hebdo = des semaines d'écart). L'édition
d'une entrée non confirmée pré-remplit aux valeurs live ; celle d'une confirmée reste
neutre (taux historique). Tracker : AED des prévisions = somme de l'AED de CHAQUE
entrée (`previewAed`, passé aussi à `BudgetBalanceCard`), pas l'EUR total reconverti.
Revenus confirmés en AED : `monthRevenuConfirmedAed()` partout (desktop, mobile,
`monthBankBalance`) — le mobile faisait `EUR × m.rate`.

## Mois pas encore commencés (simulations) — hors de toutes les stats
L'utilisateur crée des mois à l'avance pour SIMULER ses dépenses (ex : NOVEMBRE 26
saisi en octobre, avec budget et solde de départ). Un tel mois ne doit impacter AUCUNE
donnée agrégée tant qu'il n'a pas commencé — il reste visible et éditable dans le
tracker. Tout agrégat passe par **`startedMonths(months)`** (`lib/utils.ts`) : Dashboard
(`ms`), Vue Globale desktop + mobile (totaux, nb de mois, graphe), `lastMonthWithBalance`
et `bankRealDelta` (patrimoine / solde réel — un mois de simulation avec un `soldeStart`
devenait sinon le « solde actuel »), agrégat de période du tracker. Côté Revenus, mêmes
règle (`isFutureRevMonth`) + stats annuelles arrêtées à la DATE du jour : dans les mois
commencés, une entrée datée après aujourd'hui ne compte pas encore (« jusqu'au JJ/MM »).

`startedMonths` repose sur `detectYears()`, ancré sur le suffixe année explicite le plus
récent (« NOVEMBRE 26 ») ; sans suffixe, le dernier mois prend l'année qui le place au
plus près d'aujourd'hui avec ≤ 3 mois d'avance (avant : toujours l'année civile en cours
→ un JANVIER créé en décembre tombait 11 mois dans le passé). `pickInitialMonth`
(`AppProvider`) compare aussi le nom SANS suffixe : il atterrissait sur l'OCTOBRE de
l'année précédente au lieu d'« OCTOBRE 26 ».

## UI conventions
- KPIs : `<KpiCard>` (`components/ui/Card.tsx`), `hero` pour grandes valeurs
- Panneau détail : `<SlideOver>`
- **Confirmations / alertes / saisies** : `const { confirm, alert, prompt } = useDialog()`
  (`components/ui/Dialog.tsx`, promesses) — **jamais** `window.confirm/alert/prompt`
  (fenêtres grises hors thème ; appelées depuis un `setState`, elles s'ouvraient deux fois
  en dev). `{ danger: true }` pour une action destructrice. Le handler devient `async` :
  **après le `await`, repartir de `getState()`** (exposé par `useApp()`) et non du `state`
  capturé avant l'ouverture de la fenêtre — sinon on écrase ce qui a bougé entre-temps
  (taux rafraîchi). `DialogProvider` est monté AU-DESSUS d'`AppProvider` (`app/layout.tsx`).
- **Tous les chiffres en gras** via `.mono-value` — ne pas overrider avec `style={{ fontWeight: 400 }}` inline
- **Alignement numérique tableaux** : spans avec `pr-2 inline-block border border-transparent` pour matcher le border-box du `CellInput` (1px transparent + 8px padding)

## Thème (jour / nuit)
- Tokens CSS dans `globals.css` : `:root` = sombre, `[data-theme="light"]` = clair. Stockés en **canaux RGB** (`--bg: 9 9 11`) car `tailwind.config.ts` les consomme via `rgb(var(--x) / <alpha-value>)` — c'est ce qui garde `bg-accent/10`, `border-danger/25`… fonctionnels. **Ne jamais y remettre un hex.**
- Échelles : `bg` 1→4 = fond de page → élévation ; `t` 1→4 = texte le plus contrasté → le plus discret. **En clair `bg` s'inverse** (`bg` = le plus gris, `bg-3` = blanc) — sauf `bg-4`, qui reste un gris : au-dessus du blanc il n'y a plus rien, donc puces et survols redescendent. `t` s'inverse aussi.
- Palette claire calibrée au contraste (rampe froide base `16 24 40`, teintes 600/700) : tout le texte passe AA. Avant de retoucher une couleur claire, refaire l'audit — un ratio calculé sur le fond effectif, pas à l'œil.
- État dans `AppProvider` : `theme` / `toggleTheme`, appliqué en `data-theme` sur `<html>`. **La persistance se fait dans `toggleTheme`, pas dans un effet** — un effet écraserait la préférence au montage (l'état initial est `'dark'`).
- Script anti-flash dans `app/layout.tsx` (clé `fhq_theme`, à garder alignée sur `THEME_KEY`).
- **Graphes** : Recharts pose `fill`/`stroke` en attributs SVG, qui n'acceptent pas `var()`. Les couleurs de chrome passent donc par `chartTheme(theme)` / `chartTooltipStyle(theme)` (`src/lib/chartTheme.ts`). Les palettes de séries (`PIE_COLORS`…) restent en dur, elles lisent sur les deux fonds.
- Toute nouvelle couleur d'UI passe par un token, pas par un hex.

## Désactiver un poste régulier (Réglages)
Un poste régulier est une colonne PARTAGÉE par tous les mois (renommer/supprimer via
Settings affecte donc TOUS les mois — cf. les pièges de `savePoste`/`deletePoste`
dans `settings/page.tsx`). Pour arrêter d'utiliser un poste à partir d'une date sans
toucher à l'historique : `setPosteActiveFrom(posteName, cutoffMonthId)` dans
`settings/page.tsx` écrit/retire simplement le nom dans `Month.hiddenPostes` (déjà
utilisé partout via `isHidden()`, `lib/utils.ts`) pour chaque mois à partir du
cutoff — jamais `budget`/`actual`, donc non destructif et réversible (`cutoffMonthId:
null` réactive partout). `createMonth` (desktop + mobile) hérite `hiddenPostes` du
mois précédent à la création, donc un poste désactivé le reste dans les mois créés
après coup sans action répétée.

**Pas de bannière « Masqués dans X » dans le tracker** (desktop ni mobile) — retirée à
la demande de l'utilisateur : avec l'héritage ci-dessus elle réapparaissait sur chaque
nouveau mois, en permanence. Réglages est donc le SEUL endroit pour voir le statut et
réactiver. Conséquence : `hiddenStatus()` (`settings/page.tsx`) doit couvrir aussi un
masquage PONCTUEL au milieu de l'historique (icône œil du tracker, pas un « à partir
de ») — statut « Masqué dans N mois » + bouton Réactiver dès que `count > 0`, sinon ce
masquage n'aurait plus aucun chemin de restauration.

**Regrouper des postes pour les stats** : `Poste.group?: string` (`lib/types.ts`),
éditable dans la modale « Modifier » de Réglages. Sert UNIQUEMENT à l'agrégation du
Dashboard (`avgExp`/`posteTotals` dans `dashboard/page.tsx`, clé `p.group || p.name`
au lieu de `p.name`) — ne touche jamais le tracker, le budget/réel, ni l'historique.
Pensé pour le cas « CHARGES SG + CHARGES REVO désactivés, remplacés par CHARGES
FRANCE » (cf. ci-dessus) : les trois partagent le même groupe et s'additionnent en
une seule barre sur toute la période, malgré des noms différents dans le temps.
Différent de l'outil « Fusionner » de `DataAudit.tsx` (fusion EXACTE-nom et
DESTRUCTIVE — somme réellement les valeurs et supprime un poste) : ce champ ne
fusionne rien, c'est juste une clé d'affichage.

**Regrouper des postes PONCTUELS (extras)** : mêmes principe et raison d'être que
`Poste.group`, mais les extras (`Month.extraActual[]`) n'ont pas d'objet partagé
entre mois où stocker un champ — chaque mois a sa propre copie du nom. Le
regroupement vit donc à part : `AppState.extraGroups?: Record<string, string>`
(mirroré sur `Space`, cf. `stateToSpaces`/`spacesToState` dans `AppProvider.tsx`),
nom brut → groupe. Édité dans une section dédiée de Réglages (« Dépenses
ponctuelles ») qui scanne `state.months[].extraActual` pour lister les noms
distincts avec leur nb d'occurrences — utile pour repérer d'un coup d'œil des
variantes comme « AUTRE »/« AUTRES ». `dashboard/page.tsx` lit `extraGroups[r.name]
|| r.name` dans `avgExp` (« Répartition moyenne », qui INCLUT maintenant les
extras — avant ce fix elle ne comptait que les postes réguliers) et `posteTotals`
(« Total par poste »). Ne touche jamais `extraActual`/`extraBudget`.

## Structure des postes — lignes repérées par POSITION
`month.budget[i]` / `month.actual[i]` appartiennent à `postes[i]` : les lignes ne portent
ni nom ni identifiant. Supprimer, déplacer ou fusionner un poste doit donc déplacer les
lignes de CHAQUE mois du même mouvement, sinon les montants glissent d'un poste à l'autre
sans erreur visible. **Seul `lib/postes.ts` a le droit de le faire** (`removePosteAt`,
`swapPostes`, `mergePostes` — pures, testées sur l'invariant d'alignement) ; Réglages et
`DataAudit` passent par elles. Ajouter un poste = l'ajouter EN FIN de liste.

Pas d'identifiant stable sur les lignes, volontairement : le poser demande de réécrire
tous les mois, et tant qu'un appareil peut encore écraser l'état d'un autre (pas de
détection de conflit), deux versions de l'app ouvertes en même temps pourraient mélanger
les budgets. À refaire après la fiabilisation de la synchro.

## Régularisation du solde
`applyRegul(m, soldeRéel, prévisionnelHorsAjustement)` (`lib/regul.ts`) — logique unique
desktop + mobile : calcule `Month.adjustment` ET consigne la régul dans `Month.reguls[]`
(`{ ts, real, adjustment }`, ajout seul). C'est la seule trace fiable du solde bancaire à
une date : l'historique global est capé à 200 entrées et les régul d'avant juin 2026 y
avaient disparu. Affiché par `<RegulHistory>` dans la fenêtre de régul (les deux UI).

## Transactions — une seule façon de les construire
`makeTxn()` / `withTxns()` / `addTxnsToPoste()` / `addTxnsToExtra()` (`lib/txns.ts`) appliquent
les règles de la saisie du tracker : `amount` en devise locale au taux DU JOUR (`state.rate`),
`eur` et `originalAmount` écrits à côté, les DEUX devises de la ligne recalculées. Tout ce
qui crée une transaction hors du formulaire du tracker (récurrences, import de relevé)
passe par là.

## Recherche globale
`searchAll()` (`lib/search.ts`) + `<GlobalSearch>` (un composant : fenêtre ⌘K sur desktop,
plein écran sur mobile ; monté par `Sidebar` et `MobileShell`). Cherche dépenses (transactions,
postes ponctuels, montants saisis sans transaction) et revenus, tous mois confondus ; chaque
mot doit correspondre (texte sans accents/casse, ou montant). Les totaux portent sur TOUS
les résultats, la liste est tronquée à 150. Un résultat ouvre son mois : `setCurMonth` pour
le tracker, `setRevFocus({ year, month })` (contexte) pour Revenus — `useRevenus` le consomme.

## Dashboard — solde jour par jour et santé financière
- **`dailyBalance()`** (`lib/balanceHistory.ts`, carte `<BalanceCard>`) : chaque mois repart
  de son `soldeStart` (à défaut, la fin calculée du mois précédent) puis chaque mouvement est
  appliqué à SA date — revenus confirmés, dépenses débitant le compte (pas les dépenses de
  voyage), montants sans transaction au 1er, régul à leur date (journal) ou dès le 1er (sans
  journal). **Invariant testé : le dernier jour d'un mois = `monthBankBalance()` du tracker.**
  Seule exception : un revenu sans `rate` (2 entrées de mars 2026) est valorisé au taux DU
  MOIS, pas au taux du jour comme dans le tracker (aligné, lui, sur `_old`) — sinon le passé
  de la courbe bougerait avec l'EUR/AED. Mois legacy exclus (revenus non datés) → la courbe
  commence en mars 2026.
- **`lib/insights.ts`** (carte `<HealthCard>`) : taux d'épargne, mois d'autonomie (solde ÷
  dépense moyenne des 3 derniers mois, sans revenu), année N vs N−1 par mois calendaire.
  Toujours sur les mois TERMINÉS : le mois en cours est partiel (`lastCompleted`).

## Récurrences (dépenses et revenus à date fixe)
`AppState.recurring[]` (global, chaque règle porte son `spaceId`), logique dans
`lib/recurring.ts`, gestion dans Réglages (`<RecurringSettings>`).
- Une règle ne crée RIEN toute seule : elle fait apparaître `<RecurringBanner>` — dans le
  tracker pour les dépenses ÉCHUES (date ≤ aujourd'hui ; en avance, elles gonfleraient le
  Réel), dans Revenus pour toutes les dates du mois affiché (ajoutées en PRÉVISION).
- **Pas d'ajout silencieux à l'ouverture, volontairement** : tant qu'un appareil peut écraser
  l'état d'un autre, une écriture déclenchée par un onglet périmé effacerait les saisies
  faites ailleurs. À reconsidérer après la fiabilisation de la synchro.
- Idempotence : tout élément généré porte `recur = idRègle@YYYY-MM-DD` ; une occurrence
  présente ou « ignorée » (`rule.skipped`) n'est plus proposée. `rule.from` borne le passé.
- Le bandeau n'existe que s'il y a quelque chose à faire (rappel : l'utilisateur a fait
  retirer un bandeau permanent du tracker).

## Simulateur
`AppState.simulations[]` (global, `spaceId`), page `/simulation`, logique `lib/simulation.ts`.
Scénarios sur 1–12 mois stockés À PART des mois : aucun effet sur les stats — c'est le
remplaçant des « faux mois » créés à l'avance. Enregistrement automatique (600 ms après la
dernière frappe, et en quittant la page). Le budget se remplit depuis le budget du mois en
cours OU la moyenne RÉELLE des 3 derniers mois (`averageLines`) : chez l'utilisateur le
budget (~5 900 AED) est très loin du réel (~23 000 AED), d'où le rappel affiché.
`monthFromSimulation()` crée le vrai mois (refusé s'il existe ou s'il n'est pas le suivant)
et renvoie `reactivated` : les postes désactivés qui ont une ligne redeviennent visibles ce
mois-là — annoncé dans la confirmation.

## Relevé bancaire (import CSV + rapprochement)
Page `/import`, logique `lib/bankCsv.ts`. Le fichier est lu dans le navigateur (UTF-8, repli
Windows-1252) : rien n'est envoyé ni stocké, seules les transactions ajoutées à la main le
sont. Lecture tolérante (séparateur, lignes parasites avant l'en-tête, dates, montants,
débit/crédit ou colonne unique) avec correspondance des colonnes ajustable.
`reconcile()` apparie un pour un en 3 passes : même montant et dates à 5 j ; même montant
quelle que soit la date ; montant proche (≤ 1 ou 0,5 %) et dates à 5 j, marqué « ≈ ». Sorties
↔ dépenses seulement, entrées ↔ revenus confirmés. Le relevé doit être dans la devise
locale ; une entrée d'argent manquante se saisit dans Revenus (pas d'ajout automatique).

## Synchro — relecture au retour dans l'app (`lib/sync.ts`, `AppProvider`)
L'état est restauré depuis la copie locale à l'ouverture d'une page, et une sauvegarde
envoie l'état ENTIER. Garde-fous en place (ce n'est PAS encore la détection de conflit) :
- `pullRemote()` au montage et à chaque retour au premier plan (≥ 15 s d'écart) : la
  version en ligne est adoptée si son `lastUpdate` est plus récent ET s'il ne reste aucune
  modification locale non envoyée (`fdxb_dirty`, levé quand le PUT est confirmé). La copie
  remplacée est gardée dans `fdxb_state_prev`. Jamais d'écriture ici.
- Le taux (rafraîchi toutes les 10 min) part en `PATCH` du seul champ `rate` — avant,
  chaque rafraîchissement renvoyait tout l'état : un onglet périmé écrasait le reste sans
  aucune action.
- `fbSet` rejette si le serveur refuse (un refus passait pour un succès).
**Tests navigateur sans toucher la prod** : `scripts/mock-firebase.js` (faux Firebase
local, écritures en mémoire) + `NEXT_PUBLIC_FB_URL` dans `.env.local` (lu par
`lib/firebase.ts`, jamais commité, à supprimer ensuite). Remplace l'ancien bouchon
`fetch`, qui tombait à chaque rechargement complet de la page.

## History (Settings)
- `HistoryEntry[]` capé à 200 dans `AppState.history`
- Log via `logChange(action, detail)` exposé par `AppProvider` — déjà branché sur create/update/delete de space, mois, poste, revenu
- Affiché uniquement dans `Settings` page (collapsible, pagination)

## Privacy mode
Toggle dans Sidebar. Ajoute `.amounts-hidden` sur `<body>` → CSS `::after` mask de 6 dots fixes sur tout `.mono-value` / `.hero-num`. Pas de transformation de valeurs réelles.

## Mobile
**Architecture parallèle** : UI mobile dédiée via `src/components/mobile/`. Le switch desktop ↔ mobile se fait via `useIsMobile()` (`src/lib/useIsMobile.ts`, breakpoint 768px).

**Direction validée par l'utilisateur (nov. 2026) : s'inspirer de Revolut, et RIEN de gros.**
Il a rejeté une première maquette (« l'UI est horrible », « tes maquettes sont énormes ») :
un seul gros chiffre par écran (le solde, centré, sans carte autour), actions rondes
dessous, listes fines dans des cartes arrondies sans bordure, pilules, bouton principal
neutre (`bg-t-1 text-bg`), couleur réservée aux pastilles / au vert du reste / au rouge
d'un dépassement. Pas de bouton flottant, pas de barre de progression par ligne.

- **`data-ui="mobile"` sur `<html>`** : posé AVANT le premier rendu par le script de
  `app/layout.tsx` (mêmes règles que `useIsMobile`, qui le tient ensuite à jour). Le CSS
  s'en sert pour cacher le squelette desktop pré-rendu (`data-shell="desktop"`) — sinon la
  barre latérale apparaît une fraction de seconde — et pour toutes les règles tactiles
  (`globals.css`, fin de fichier). Variante Tailwind **`mob:`** = ce sélecteur ; à préférer
  à `max-md:` dans un composant partagé (ne touche pas la vue desktop forcée).
- **Kit `components/mobile/ui.tsx`** (`MCard`, `MRow`, `MIcon`, `MLabel`, `MPill`, `MSeg`,
  `MAction`, `MButton`, `MField`, `MDivider`, `MEmpty`, `MBar`, `MBadge`) — tout nouvel
  écran mobile s'en sert, pour garder la même densité. Tailles : titre de ligne 15px,
  ligne secondaire 13px, ligne 56px, pastille 36px, zone tactile ≥ 44px. `surface="sheet"`
  dans un volet (tokens `--sheet` / `--cell`).
- **Champs de saisie : 16px minimum** (forcé en CSS sous `data-ui=mobile`) — en dessous,
  iOS zoome à chaque frappe. Montants : `inputMode="decimal"` + `parseAmount()` (virgule
  acceptée), jamais `type="number"`. Gros montant d'un volet : classe `m-amount`.
- **Chiffres** : toujours `.mono-value` (masquage des montants), en 600 sur mobile ; une
  ligne secondaire porte `m-sub` (500) — c'est fait d'office dans `MRow`.
- **`BottomSheet`** = LA fenêtre mobile : glisser la poignée pour fermer, reste au-dessus
  du clavier (`--kb`, `useKeyboardInset`), `footer` = barre d'actions fixe. `Modal` et
  `SlideOver` s'y replient automatiquement sur mobile ; `Dialog` se colle en bas.
  Ordre dans le JSX = ordre d'empilement (un volet ouvert PAR-DESSUS un autre se déclare après).
- **`useOverlay()`** (`lib/useOverlay.ts`) : pile des fenêtres ouvertes — Échap et le
  retour du téléphone ferment celle du dessus. Une seule entrée d'historique « garde »,
  jamais de `history.back()` à la fermeture (course possible avec un `router.push`).
- **`MobileShell`** : barre du haut (avatar d'espace + pastille de synchro, recherche,
  œil) et barre du bas **Accueil · Revenus · Stats · Résidence · Menu**. « Menu » est une
  page (`/menu`, `MobileMenu`) ; les pages qu'elle ouvre (`MENU_PAGES`) ont un retour +
  titre dans la barre du haut. `PageHeader` masque son fil d'Ariane et son h1 sur mobile.
- **Accueil = `MobileTracker`** (volets dans `mobile/tracker/`) : solde prévisionnel,
  actions Dépense / Revenu / Régul / Plus, résumé du mois, postes, postes ponctuels,
  dernières opérations. Couvre tout le tracker desktop (budget, montant direct, ponctuels,
  période, graphiques, soldes, création / renommage de mois). Montants en devise locale
  ou en EUR (bascule mémorisée, `fhq_m_unit`) ; le % consommé est calculé dans la devise
  AFFICHÉE.
- App installable : `public/manifest.webmanifest` + `public/icons/` (chemins relatifs,
  le basePath est ajouté dans `app/layout.tsx`). **Pas de service worker** : une version
  gardée en cache pourrait écraser les données tant que la synchro n'est pas fiabilisée.
- Chaque page mobile fait `if (isMobile === true) return <MobileXxx />;` après les hooks et avant le return desktop
- **Backup desktop** : `?desktop=1` ou « Afficher la version ordinateur » dans Menu (localStorage `fdxb_force_desktop` ; `?desktop=0` pour revenir)

**Refonte en cours — écrans refaits** : shell, Menu, Accueil (tracker), Revenus (vues Mois
et Année), Vue Globale, Stats (Dashboard), Résidence, Patrimoine, Voyages, Setup, Réglages.
**Reste à faire** : Simulateur et Relevé bancaire (déjà responsives, à passer au kit),
puis les finitions (page de connexion, recherche, bandeau des récurrences, carte « Bilan »,
contrôle thème clair / 320 px / tablette). Avant chaque écran : inventaire des actions du
desktop, et rien n'est livré tant qu'il en manque une (« aucun manquement »).

**Comment un écran mobile est construit** : quand la page a déjà un hook partagé
(`useRevenus`), un composant `Mobile<Page>` ne fait que du rendu. Sinon la branche mobile
vit DANS le fichier de la page (`if (isMobile === true) return (…)`, après les calculs) et
réutilise ses états et ses handlers tels quels — parité garantie sans dupliquer la logique.
Les composants partagés (`HealthCard`, `BalanceCard`, `RecurringSettings`) ont la même
branche. `DataAudit` reste un outil technique, simplement rendu utilisable (`.m-legacy`). Je ne peux tester qu'en émulation : clavier réel, encoche et mode
installé sont à confirmer par l'utilisateur sur son téléphone → un push par étape.

Piège React rencontré : ne jamais DÉFINIR un composant à l'intérieur d'un autre s'il
contient des champs de saisie (`const Field = () => …` dans le rendu) — il est recréé à
chaque frappe et le champ perd le focus. Le déclarer au niveau module.

### Logique partagée desktop / mobile
Les deux UI ne doivent différer que par le RENDU. Toute règle métier vit dans `lib/` :
- `lib/useRevenus.ts` — page Revenus entière (période, formulaire, écritures) ;
- `lib/months.ts` — id et contenu d'un nouveau mois ;
- `lib/regul.ts` — régularisation du solde ; `lib/postes.ts` — structure des postes ;
- `lib/normalize.ts` — `normalizeLoadedState()` appliqué aux TROIS chemins de chargement
  (localStorage, Firebase, import) ; `looksLikeBackup()` protège l'import (un JSON valide
  quelconque, « {} », remplaçait toutes les données par du vide), qui demande en plus une
  confirmation.
- `lib/trackerOps.ts` — TOUTES les écritures du tracker (transaction : ajout, édition,
  déplacement, suppression ; budget ; montant direct ; masquer ; ajouter / supprimer un
  poste), pures et testées ; `lib/useTrackerFigures.ts` — les chiffres d'un mois ;
- `lib/labels.ts` — « Novembre 2026 », « Hier », « 18 novembre » (jamais une date ISO brute à l'écran).
Éditer une transaction conserve `tripId` / `tripKind` / `recur` (avant, modifier une dépense
de voyage la faisait re-débiter le compte et la sortait du voyage).

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

## Qualité — tests, lint, garde-fou d'erreur
- `npm run check` = typage (`tsc --noEmit`) + ESLint + tests (vitest). **La CI le rejoue
  avant le build : si un des trois échoue, rien n'est déployé.**
- Tests dans `src/lib/__tests__/` (logique pure uniquement, données synthétiques — jamais
  de vraies données : le dépôt est public). Toute règle de calcul ajoutée ou corrigée
  s'accompagne d'un test ; les « pièges connus » ci-dessus y sont tous couverts.
- `public/__test/` est ignoré par git : c'est là que va une copie locale de la prod pour
  tester dans le navigateur (à supprimer ensuite).
- Erreur de rendu → `components/ErrorScreen.tsx` (via `error.tsx` / `global-error.tsx`),
  autonome, avec téléchargement de la copie locale `fdxb_state`.

## Commandes utiles
- Dev : `npm run dev` (port 3000) — configuré dans `.claude/launch.json` sous le nom `finance-tracker`
- Vérifier : `npm run check` ; tests seuls : `npm test`
- Build : `npm run build` (next export → `out/`)
- Auto-deploy GitHub Pages sur push `main` (après typage + lint + tests)
