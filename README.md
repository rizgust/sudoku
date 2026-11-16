# Sudoku

A clean, ad-free Sudoku where every difficulty is earned. Plain HTML/CSS/JS: no build step, no dependencies, works offline once installed. Design reference: [docs/design-00.md](docs/design-00.md).

**Play locally:** open `index.html` in a browser.

- **Six tiers graded by technique**, not clue count: Beginner, Easy, Medium, Hard, Expert, Master. A human-style logical solver (singles → pairs/triples → wings, fish, unique rectangles → chains) grades every puzzle, and each puzzle has exactly one solution.
- **Earned unlocks:** only Beginner is open at first. Higher tiers need completions, clean solves and passed qualifications (no hints, at most one mistake).
- **Event-driven arcade score** ([docs/formula-score-00.md](docs/formula-score-00.md)): every correct digit scores, completed rows/columns/blocks pay bonuses (with double and triple clears), and quick runs of placements build Time, Number, Line, Block and Hybrid chains inside a per-difficulty time window. Completion and time bonuses land at the end; mistakes, hints, assists and mode multiply the total. XP raises your level. Bronze → Diamond mastery ranks per tier. Replaying a puzzle earns no progression credit.
- **Modes:** Classic, Qualification, Daily Challenge (the same puzzle for everyone), Time Attack, Zen and Practice (starts the board right where a chosen technique is needed).
- **Hints that explain:** each hint names the technique, highlights the cells and explains the deduction. Apply places the digit or crosses out candidates.
- **Statistics:** per-tier records, solve-time trend with an improvement note, techniques met, full attempt history. About 47 achievements, some hidden.
- Notes (long-press a number on touch screens), undo, optional Auto notes assist, light/dark theme, phone and desktop layouts, autosave.

Keyboard: `1`–`9` fill · `Shift`+digit toggles a note · `N` notes mode · `H` hint · arrows move · `Backspace` erase · `Ctrl`+`Z` undo · `P` pause

### Files

- `sudoku.js`: engine (brute-force solver, logical solver and techniques, generator, symmetry transforms)
- `scoring.js`: scoring engine and all balancing values (`RULES`, versioned). Consumes gameplay events, never touches the board
- `chains.js`: chain detector. Reports which chain patterns each eligible placement completes; knows nothing about points
- `progress.js`: tiers, XP, mastery, unlock rules, achievements; all stats are derived from the attempt history
- `tools/test-scoring.js`: checks the engine against the spec's examples. Run `bun tools/test-scoring.js`
- `puzzles.js`: generated fallback bank and technique-practice puzzles. Rebuild with `bun tools/build-bank.js`
- `app.js`, `index.html`, `style.css`: UI

Puzzles are generated live in the browser (usually well under a second). If that takes too long, a bank puzzle is used with a random symmetry transform, which keeps its grade and unique solution.

## Deploy to Vercel

It's a static site, so Vercel needs no build settings.

**From GitHub (recommended, auto-deploys on every push):**
1. Push this repo to GitHub.
2. In Vercel: **Add New → Project**, then import the repo.
3. Framework Preset: **Other**. Leave Build Command and Output Directory empty. Click **Deploy**.

**From the command line:** run `bunx vercel` (or `npx vercel`) in this folder, then `bunx vercel --prod`.

`vercel.json` makes sure the service worker (`sw.js`) is never cached by the browser, so phones pick up new versions.

## Install on your phone

Open your Vercel URL (it must be the `https://` link), then:

- **iPhone (Safari):** Share button → **Add to Home Screen** → Add.
- **Android (Chrome):** ⋮ menu → **Add to Home screen** / **Install app**.

It opens full-screen like an app and works offline after the first visit.

Notes:
- On iPhone, the home-screen app keeps its own save data, separate from Safari. A game started in Safari won't appear in the installed app.
- After a new deploy, the app updates the next time you open it while online.
- Vibration feedback only works on Android; iPhone browsers don't support it.
