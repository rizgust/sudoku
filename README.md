# Sudoku

A clean, ad-free Sudoku. Plain HTML/CSS/JS: no build step, no dependencies, works offline once installed.

**Play locally:** open `index.html` in a browser.

- 4 difficulties (Easy/Medium are solvable with simple logic; Hard/Expert need more advanced techniques). Every puzzle has exactly one solution.
- Notes (long-press a number on touch screens), undo, erase, hints, mistake highlighting, timer with pause
- Progress, settings and best times are saved in your browser
- Light/dark theme, phone (portrait and landscape) and desktop layouts
- Installable to the home screen, works offline

Keyboard: `1`–`9` fill · `Shift`+digit toggles a note · `N` notes mode · arrows move · `Backspace` erase · `Ctrl+Z` undo · `P` pause

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
