# Sudoku

A clean, ad-free Sudoku where every difficulty is earned. TypeScript and plain DOM (no UI framework), built with Vite, installable and offline-capable. Design reference: [docs/design-00.md](docs/design-00.md).

- **Six tiers graded by technique**, not clue count: Beginner, Easy, Medium, Hard, Expert, Master. A human-style logical solver (singles → pairs/triples → wings, fish, unique rectangles → chains) grades every puzzle, and each puzzle has exactly one solution.
- **Earned unlocks:** only Beginner is open at first. Higher tiers need completions, clean solves and passed qualifications (no hints, at most one mistake).
- **Event-driven arcade score** ([docs/formula-score-00.md](docs/formula-score-00.md)): every correct digit scores, completed rows/columns/blocks pay bonuses (with double and triple clears), and quick runs of placements build Time, Number, Line, Block and Hybrid chains inside a per-difficulty time window. Completion and time bonuses land at the end; mistakes, hints, assists and mode multiply the total. XP raises your level. Bronze → Diamond mastery ranks per tier. Replaying a puzzle earns no progression credit.
- **Arcade feedback** ([docs/effect-00.md](docs/effect-00.md)): light sweeps for cleared rows, columns and blocks, escalating chain celebrations (Chain → Great → Super → Mega → Legendary) coloured by chain type, one combined title per move with the exact amounts, synthesized sounds, and a celebratory result screen. Separate switches for visual effects, sound effects, chain sounds and celebrations, plus a volume slider. Respects reduced motion.
- **Modes:** Classic, Qualification, Daily Challenge (the same puzzle for everyone), Time Attack, Zen and Practice (starts the board right where a chosen technique is needed).
- **Hints that explain:** each hint names the technique, highlights the cells and explains the deduction. Apply places the digit or crosses out candidates.
- **Statistics:** per-tier records, solve-time trend with an improvement note, techniques met, full attempt history. About 47 achievements, some hidden.
- Notes (long-press a number on touch screens), undo, optional Auto notes assist, light/dark theme, phone and desktop layouts, autosave.

Keyboard: `1`–`9` fill · `Shift`+digit toggles a note · `N` notes mode · `H` hint · arrows move · `Backspace` erase · `Ctrl`+`Z` undo · `P` pause

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

Puzzles are generated live in the browser (usually well under a second). If that takes too long, a bank puzzle is used with a random symmetry transform, which keeps its grade and unique solution.

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
