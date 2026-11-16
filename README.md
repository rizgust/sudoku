# Sudoku

A clean, ad-free Sudoku where every difficulty is earned. TypeScript and plain DOM (no UI framework), built with Vite, installable and offline-capable. Design reference: [docs/design-00.md](docs/design-00.md).

## Features

### Puzzles
- **Six difficulties graded by technique**, not clue count: Beginner, Easy, Medium, Hard, Expert, Master. A human-style logical solver with 21 techniques (singles → locked candidates and subsets → wings, fish, unique rectangles → X- and XY-chains) grades every puzzle, and every puzzle has exactly one solution.
- **Unlimited puzzles**, generated live in the browser. If generation is slow, a bundled bank puzzle is used with a random symmetry transform, which keeps its grade and unique solution. The next puzzle for each tier is prepared in the background.

### Modes
- **Classic**: the main mode. Counts toward unlocks and mastery.
- **Qualification**: no hints, no assists, at most one mistake (a second ends the attempt). Passes are needed to unlock harder tiers.
- **Daily Challenge**: one seeded puzzle per day, the same for everyone. The tier rotates through the week (Medium to Expert, Easy on Mondays).
- **Time Attack**: finish before the tier's par time (5 to 35 minutes). Records are kept separately.
- **Zen**: no timer, no pressure, half score, no chains, doesn't count toward unlocks.
- **Practice**: pick one of the techniques; the board starts right where that technique is the next step, with notes filled in. Doesn't affect score or unlocks.

### Playing
- Notes, with long-press on a number to switch between digit and note. Notes for a digit already in the same row, column or box are refused.
- Auto-remove notes when a digit is placed, undo, erase, pause (the board is hidden while paused).
- Matching digits are highlighted when a digit is selected. Optional **Guide lines** also shade every row and column that already holds it, so the open spots stand out; they count as an assist (a puzzle where they show halves its time bonus and chain points, then scores ×0.5) and are off in qualifications.
- **Hints that explain**: a hint first points out a wrong digit, otherwise names the next logical technique, highlights the cells and explains the deduction. Apply places the digit or crosses out candidates. "Learn" opens the technique's explanation.
- Optional **Auto notes** assist (scores ×0.8, not allowed in qualifications).
- Keyboard: `1`–`9` fill · `Shift`+digit toggles a note · `N` notes mode · `H` hint · arrows move · `Backspace` erase · `Ctrl`+`Z` undo · `P` pause · `Esc` clear selection.
- Autosave: a game in progress survives closing the app.

### Arcade scoring ([docs/formula-score-00.md](docs/formula-score-00.md))
- **Every correct digit scores** (50 points), the first time a cell is filled.
- **Region clears**: +300 for a row or column, +500 for a block. Completing two at once adds +200 (Double Clear), three at once +400 (Triple Clear).
- **Chains**: three or more correct placements inside a time window (60 s on Beginner down to 20 s on Master) form a chain. Chains are Time, Number (same digit), Line (same row or column), Block (same box) or Hybrid (Time + Block + Line). Longer chains, stronger types and harder tiers pay more; a chain pays only its growth, closes when its window ends, and the next one starts fresh. Mistakes, hints, clearing a correct digit and undo end a chain.
- **Completion bonus** (1,000 on Beginner to 40,000 on Master) and a **time bonus** of up to half of it (full at half par, none at twice par).
- **Penalties**: −10% per mistake, −20% per hint, ×0.8 with Auto notes, ×0.5 with Guide lines (which also halve the time bonus and chain points); Zen ×0.5, Practice ×0. Chain points are capped at 35% of the score.
- **Anti-farming**: a cell or region pays once per attempt, so undo, erase and re-entry earn nothing new.
- **Pure or Guided**: every attempt is labelled Pure (no guide lines or Auto notes at any point) or Guided; older attempts whose assist use can't be verified are labelled Legacy. The label shows on the result screen and in the history. Personal bests are shared; the Guided multipliers keep them fair.
- The live score updates as you play; the result screen breaks the final score down line by line.
- Scoring rules are versioned. Scores from older rules are kept but marked, and never compared with current ones.

### Arcade feedback ([docs/effect-00.md](docs/effect-00.md))
- Correct digits pop with a floating "+50" and a soft click; mistakes get a muted red flash, a small shake and a low knock.
- Light sweeps for cleared rows (left to right) and columns (top to bottom), an outline and burst for blocks, gold for Double and Triple Clears.
- **Escalating chain celebrations**: Chain → Great → Super → Mega → Legendary, coloured by chain type (Time cyan, Number blue, Block emerald, Line amber, Hybrid gold), with rings, particles, board pulses and rising ka-chink sounds.
- **One celebration per move**: when a tap triggers several rewards, one title wins (for example "LEGENDARY TRIPLE CLEAR!") and every amount is listed below it, with one combined sound.
- **Chain indicator** under the board: chain type, multiplier, length, a countdown ring that turns amber and pulses near the end, and the points the next placement would add.
- **Puzzle completion**: a light wave across the board, "PUZZLE SOLVED" or "PERFECT SOLVE" for a clean game. The result screen counts the score up (tap to skip) and celebrates personal bests, unlocks, new ranks and achievements.
- All sounds are synthesized (no audio files). Separate switches for visual effects, sound effects, chain sounds and celebration sounds, plus a volume slider. Reduced-motion settings replace movement with simple fades.

### Progression
- **Earned unlocks**: only Beginner is open at first. Each higher tier needs completed puzzles, clean solves (no mistakes, no hints) and qualification passes in the tier below, from 5 completions and 3 clean solves for Easy up to 30 completions, 20 clean solves and 5 qualifications for Master. Once unlocked, always unlocked.
- **Mastery ranks per tier**: Bronze → Silver → Gold → Platinum → Diamond, from clean solves and clean solves under par (Diamond: 100 clean, 60 under par). Ranks never go down.
- **XP and levels**: XP = 10 + score / 100 for each completed puzzle, bonus XP for the first daily completion and for passing a qualification, plus achievement XP.
- **Replays earn no progression credit** and a quarter of the XP.
- **56 achievements** in eight groups (milestones, difficulty, progression, consistency, skill, learning, chains, hidden), with progress bars; five stay secret until earned.
- **Streaks**: daily play streak and daily challenge streak.

### Statistics
- Totals, win rate, perfect games, streaks, play time and total score.
- Per-tier records: best time, high score, Time Attack best and mastery rank, with a filter by tier.
- Solve-time trend chart with a 5-game average and an improvement note.
- Clears and chains: rows, columns and blocks cleared, double and triple clears, chains by type, longest chain and best single chain.
- Techniques met, and the full attempt history.

### App
- Light and dark themes (or follow the system), phone and desktop layouts.
- Installable on phones and desktops, and works offline after the first visit.
- Optional vibration on Android.
- Progress, history and settings stay on the device (browser storage). The only outside request is the Nunito font from Google Fonts.

## Develop

Needs [Bun](https://bun.sh).

```sh
bun install
bun run dev        # local dev server with hot reload
bun run test       # scoring and chain tests (Vitest)
bun run typecheck  # strict TypeScript, app and tools
bun run build      # typecheck, then production build into dist/
bun run preview    # serve dist/ locally, service worker included
bun run bank       # regenerate the puzzle bank (src/core/puzzles.ts)
```

### Layout

- `src/core/`: the Sudoku engine (`sudoku.ts`: solvers, techniques, generator, transforms) and the generated puzzle bank (`puzzles.ts`). No DOM.
- `src/game/`: game rules, no DOM.
  - `events.ts`: the gameplay event types every other part agrees on.
  - `scoring.ts`: scoring engine and all balancing values (`RULES`, versioned). Consumes events, never touches the board.
  - `chains.ts`: chain detector. Reports which chain patterns each eligible placement completes; knows nothing about points.
  - `progress.ts`: tiers, XP, mastery, unlocks, achievements. All stats are derived from the attempt history.
- `src/effects/`: visual and audio feedback, driven only by gameplay events.
  - `moment.ts`: groups one move's events into one celebration (dominant title, summary, sound). Pure and tested.
  - `visuals.ts`: overlay effects (Web Animations API), `audio.ts`: synthesized sounds (Web Audio), `index.ts`: the controller.
- `src/ui/`: the interface.
  - `state.ts`: settings, profile, the game in progress and storage.
  - `gameplay-events.ts`: the event bus. Moves become events here; scoring and listeners (`onGameEvent`) react.
  - `board.ts`, `actions.ts`, `hints.ts`, `lifecycle.ts`, `hud.ts`, `result.ts`, `router.ts`, `bindings.ts`, `screens/`.
- `src/main.ts`: entry point. `index.html`, `src/style.css`, `public/icons/`.
- `vite.config.ts`: build and PWA settings (manifest, offline caching).

## Deploy to Vercel

`vercel.json` holds the settings, so nothing needs to be set in the dashboard: Vite preset, `bun install`, `bun run build`, output in `dist/`. It also stops browsers caching the service worker (so phones pick up new versions) and caches the fingerprinted files in `assets/` for a year.

**From GitHub (recommended, auto-deploys on every push):** import the repo in Vercel (**Add New → Project**) and click **Deploy**. For a project created before the move to Vite, the settings in `vercel.json` override the old "Other" preset; if the dashboard has its own Build Command or Output Directory overrides, clear them.

**From the command line:** `bunx vercel` for a preview, `bunx vercel --prod` for production.

## Install on your phone

Open your Vercel URL (it must be the `https://` link), then:

- **iPhone (Safari):** Share button → **Add to Home Screen** → Add.
- **Android (Chrome):** ⋮ menu → **Add to Home screen** / **Install app**.

It opens full-screen like an app and works offline after the first visit.

Notes:
- On iPhone, the home-screen app keeps its own save data, separate from Safari. A game started in Safari won't appear in the installed app.
- After a new deploy, the app downloads the update in the background and uses it the next time it opens.
- Saved games, history and settings stay in the browser's storage, so they carry over between versions.
- Vibration feedback only works on Android; iPhone browsers don't support it.
