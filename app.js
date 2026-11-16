(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const { ROW, COL, BOX, ROWS, COLS, BOXES, PEERS, TECHNIQUES } = Sudoku;
  const { TIERS, MODES } = Progress;
  const KEYS = { game: 'sudoku.v2.game', settings: 'sudoku.settings.v1', profile: 'sudoku.v2.profile' };
  const MAX_HISTORY = 500;

  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke-width="3"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>';
  const ICON_LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  const ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  const ICON_CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

  // ---------- Storage ----------

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch { return fallback; }
    },
    set(key, value) {
      try {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(value));
      } catch { /* storage unavailable */ }
    },
  };

  const settings = Object.assign(
    { highlightMistakes: true, highlightSame: true, autoRemoveNotes: true, advancedAssists: false, vibrate: true, theme: 'auto' },
    store.get(KEYS.settings, {})
  );
  const profile = Object.assign(
    { version: 2, history: [], achievements: {}, unlocked: 1, practiced: {} },
    store.get(KEYS.profile, {})
  );
  let summary = Progress.summarize(profile);

  let game = null;
  let selected = null;
  let notesMode = false;
  let paused = false;
  let view = 'home';
  let hintState = null;
  let loading = false;

  const saveGame = () => store.set(KEYS.game, game && !game.completed ? game : null);
  const saveSettings = () => store.set(KEYS.settings, settings);
  const saveProfile = () => store.set(KEYS.profile, profile);

  function refresh() {
    summary = Progress.summarize(profile);
    if (summary.unlocked > profile.unlocked) profile.unlocked = summary.unlocked;
  }

  function isValidGame(g) {
    const arr = (a) => Array.isArray(a) && a.length === 81;
    return g && g.v === 2 && MODES[g.mode] && Progress.tier(g.tier) && arr(g.puzzle) && arr(g.solution) && arr(g.values) && arr(g.notes);
  }

  // ---------- Formatting ----------

  function formatTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = (sec / 3600) | 0;
    const m = ((sec % 3600) / 60) | 0;
    const s = sec % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
  const fmt = (n) => Math.round(n).toLocaleString();
  const pct = (x) => `${Math.round(x * 100)}%`;
  const minutes = (sec) => `${Math.round(sec / 60)} min`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tierName = (id) => Progress.tier(id).name;
  const today = () => Progress.dayKey(Date.now());

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    retrigger(el, 'show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // ---------- Board DOM ----------

  const boardEl = $('#board');
  const numpadEl = $('#numpad');
  const cells = [];
  const numButtons = [];

  function buildBoard() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 81; i++) {
      const el = document.createElement('div');
      el.className = `cell r${ROW[i]} c${COL[i]}`;
      el.setAttribute('role', 'gridcell');
      el.dataset.i = i;
      const val = document.createElement('span');
      val.className = 'value';
      const notes = document.createElement('div');
      notes.className = 'notes';
      for (let d = 1; d <= 9; d++) {
        const s = document.createElement('span');
        s.textContent = d;
        notes.appendChild(s);
      }
      el.append(val, notes);
      el.addEventListener('animationend', (e) => {
        if (e.animationName === 'flash') el.classList.remove('flash');
        if (e.animationName === 'shake') el.classList.remove('shake');
        if (e.animationName === 'pop') el.classList.remove('pop');
      });
      frag.appendChild(el);
      cells.push({ el, val, notes: notes.children });
    }
    boardEl.appendChild(frag);

    for (let d = 1; d <= 9; d++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'num';
      b.style.setProperty('--dc', `var(--d${d})`);
      b.innerHTML = `<span class="d">${d}</span><span class="left"></span>`;
      b.setAttribute('aria-label', `Enter ${d}`);
      bindNumButton(b, d);
      numpadEl.appendChild(b);
      numButtons.push(b);
    }
  }

  // Tap = normal input. Long-press = the opposite mode (note instead of number, or vice versa).
  const LONG_PRESS_MS = 420;
  function bindNumButton(b, d) {
    let timer = null;
    let fired = false;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
      b.classList.remove('long-press');
    };
    b.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      fired = false;
      cancel();
      timer = setTimeout(() => {
        fired = true;
        b.classList.add('long-press');
        buzz(12);
        input(d, !notesMode);
      }, LONG_PRESS_MS);
    });
    b.addEventListener('pointerup', cancel);
    b.addEventListener('pointerleave', cancel);
    b.addEventListener('pointercancel', cancel);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      if (fired) { fired = false; return; }
      input(d);
    });
  }

  function buzz(pattern) {
    if (!settings.vibrate || typeof navigator.vibrate !== 'function') return;
    try { navigator.vibrate(pattern); } catch { /* not allowed */ }
  }

  function retrigger(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // restart CSS animation
    el.classList.add(cls);
  }

  // ---------- Puzzles ----------

  const BANK = (typeof PUZZLE_BANK !== 'undefined' ? PUZZLE_BANK : []);
  const pause0 = () => new Promise((r) => setTimeout(r, 0));

  function fits(g, tierId) {
    if (!g || g.level !== tierId) return false;
    if (tierId === 1) return g.clues >= 36;
    if (tierId === 2) return g.clues <= 34;
    return true;
  }

  function fromBank(tierId, rnd) {
    const list = BANK.filter((e) => e[0] === tierId);
    const e = list[(rnd() * list.length) | 0];
    const puzzle = Sudoku.transform(Sudoku.fromString(e[1]), (rnd() * 4294967296) >>> 0);
    return { puzzle, solution: Sudoku.solve(puzzle, 1).solution, techs: e[2] };
  }

  /**
   * Fresh, uniquely solvable puzzle graded to `tierId` by the logical solver. Runs in small
   * chunks so the page stays responsive. With a seed (Daily) the result is deterministic.
   */
  async function makePuzzle(tierId, { seed = null, budgetMs = 2500, maxTries = 600 } = {}) {
    const rnd = seed != null ? Sudoku.mulberry32(seed) : Math.random;
    const mode = tierId <= 2 ? tierId : 3;
    const t0 = performance.now();
    let chunk = performance.now();
    for (let tries = 0; tries < maxTries; tries++) {
      const g = Sudoku.generate(mode, rnd);
      if (fits(g, tierId)) return { puzzle: g.puzzle, solution: g.solution, techs: Object.keys(g.techs).join(' ') };
      if (seed == null && performance.now() - t0 > budgetMs) break;
      if (performance.now() - chunk > 40) { await pause0(); chunk = performance.now(); }
    }
    return fromBank(tierId, rnd);
  }

  // One puzzle per tier generated ahead of time while the player is busy.
  const prefetched = {};
  function prefetch(tierId) {
    if (prefetched[tierId] || prefetch.busy) return;
    prefetch.busy = true;
    const run = () => makePuzzle(tierId, { budgetMs: 6000 }).then((p) => { prefetched[tierId] = p; prefetch.busy = false; });
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 4000 });
    else setTimeout(run, 1500);
  }

  function practicePuzzle(tech) {
    const lv = TECHNIQUES[tech].level;
    let list = BANK.filter((e) => e[2].split(' ').includes(tech) && (lv > 1 || e[0] === 1));
    const exact = list.filter((e) => e[0] === lv);
    if (exact.length) list = exact;
    if (!list.length) return null;
    for (let tries = 0; tries < 20; tries++) {
      const e = list[(Math.random() * list.length) | 0];
      const puzzle = Sudoku.transform(Sudoku.fromString(e[1]), (Math.random() * 4294967296) >>> 0);
      const r = Sudoku.rate(puzzle, 6, { record: true });
      const at = r.log.findIndex((x) => x.step.tech === tech);
      if (at < 0) continue;
      const before = r.log[at].before;
      const start = Array.from(before.v);
      const notes = lv >= 2 ? Array.from(before.c) : new Array(81).fill(0);
      return { puzzle: start, solution: r.values, techs: e[2], notes };
    }
    return null;
  }

  // ---------- Game lifecycle ----------

  const inProgress = () => game && !game.completed;

  /** Runs `fn` after confirming that the current game may be abandoned. */
  function guardAbandon(fn) {
    if (!inProgress() || !game.moved) { fn(); return; }
    const isQual = game.mode === 'qual';
    confirmDialog(
      isQual ? 'Abandon qualification?' : 'Start a new game?',
      isQual ? 'Leaving now counts as a failed qualification attempt.' : `Your ${MODES[game.mode].name} ${tierName(game.tier)} game will be recorded as abandoned.`,
      'Abandon',
      () => { finish('abandoned', { silent: true }); fn(); }
    );
  }

  async function startGame({ mode, tier: tierId, tech = null }) {
    if (loading) return;
    loading = true;
    hideHint();
    const prev = game;
    game = null;
    selected = null;
    notesMode = false;
    route('game');
    $('#loading-overlay').hidden = false;
    boardEl.classList.add('paused');
    await pause0();

    let p = null, pid;
    if (mode === 'daily') {
      const info = Progress.dailyInfo(today());
      tierId = info.tierId;
      p = await makePuzzle(tierId, { seed: info.seed });
      pid = info.pid;
    } else if (mode === 'practice') {
      p = practicePuzzle(tech);
      if (p) tierId = Math.max(1, TECHNIQUES[tech].level);
    } else {
      p = prefetched[tierId] || await makePuzzle(tierId);
      delete prefetched[tierId];
    }
    loading = false;
    $('#loading-overlay').hidden = true;
    if (!p) { game = prev; toast('No practice puzzle available for that technique yet.'); route('home'); return; }
    pid = pid || `${mode === 'practice' ? 'pr' : 'p'}-${Sudoku.hashString(Sudoku.toString(p.puzzle)).toString(36)}`;

    game = {
      v: 2,
      mode,
      tier: tierId,
      pid,
      tech: tech || null,
      techs: p.techs,
      puzzle: p.puzzle,
      solution: p.solution,
      values: p.puzzle.slice(),
      notes: p.notes ? p.notes.map((m, i) => (p.puzzle[i] ? 0 : m)) : new Array(81).fill(0),
      mistakes: 0,
      hints: 0,
      assisted: false,
      elapsed: 0,
      start: Date.now(),
      moved: false,
      history: [],
      completed: false,
    };
    setPaused(false);
    saveGame();
    render();
    if (mode !== 'daily' && mode !== 'practice') prefetch(tierId);
  }

  const canPlay = () => view === 'game' && inProgress() && !paused && !loading;

  function snapshot() {
    game.history.push({ v: game.values.slice(), n: game.notes.slice() });
    if (game.history.length > MAX_HISTORY) game.history.shift();
    game.moved = true;
  }

  function commit() {
    saveGame();
    render();
  }

  // ---------- Actions ----------

  function select(i) {
    if (paused || !game || loading) return;
    selected = i;
    render();
  }

  function input(d, asNote = notesMode) {
    if (!canPlay() || selected == null) return;
    const i = selected;
    if (game.puzzle[i]) return;

    if (asNote) {
      if (game.values[i]) return;
      // Can't add a note for a number already placed in the same row, column or box.
      if (!(game.notes[i] & (1 << d))) {
        const conflicts = PEERS[i].filter((p) => game.values[p] === d);
        if (conflicts.length) {
          conflicts.forEach((p) => retrigger(cells[p].el, 'shake'));
          buzz(25);
          return;
        }
      }
      snapshot();
      game.notes[i] ^= 1 << d;
      commit();
      return;
    }

    if (game.values[i] === d) { erase(); return; }

    hideHint();
    snapshot();
    game.values[i] = d;
    game.notes[i] = 0;
    if (settings.autoRemoveNotes) clearPeerNotes(i, d);

    if (d !== game.solution[i]) {
      game.mistakes++;
      retrigger(cells[i].el, 'shake');
      buzz([35, 50, 35]);
      if (game.mode === 'qual' && game.mistakes > 1) {
        commit();
        finish('failed', { reason: 'mistakes' });
        return;
      }
    } else {
      retrigger(cells[i].el, 'pop');
      flashCompletedUnits(i);
    }
    checkWin();
    commit();
  }

  function erase() {
    if (!canPlay() || selected == null) return;
    const i = selected;
    if (game.puzzle[i] || (!game.values[i] && !game.notes[i])) return;
    hideHint();
    snapshot();
    game.values[i] = 0;
    game.notes[i] = 0;
    commit();
  }

  function undo() {
    if (!canPlay() || !game.history.length) return;
    hideHint();
    const s = game.history.pop();
    game.values = s.v;
    game.notes = s.n;
    commit();
  }

  function toggleNotesMode() {
    notesMode = !notesMode;
    render();
  }

  function candidatesFor(i) {
    let m = 0x3fe;
    for (const p of PEERS[i]) if (game.values[p]) m &= ~(1 << game.values[p]);
    return m;
  }

  function autoNotes() {
    if (!canPlay() || !assistsAllowed()) return;
    hideHint();
    snapshot();
    game.assisted = true;
    for (let i = 0; i < 81; i++) game.notes[i] = game.values[i] ? 0 : candidatesFor(i);
    commit();
    toast('Candidates filled. Advanced assist: score ×0.8');
  }

  const assistsAllowed = () => settings.advancedAssists && game && game.mode !== 'qual';
  const hintsAllowed = () => game && game.mode !== 'qual';

  function clearPeerNotes(i, d) {
    const mask = ~(1 << d);
    for (const p of PEERS[i]) game.notes[p] &= mask;
  }

  function flashCompletedUnits(i) {
    const units = [ROWS[ROW[i]], COLS[COL[i]], BOXES[BOX[i]]];
    for (const unit of units) {
      if (!unit.every((k) => game.values[k] === game.solution[k])) continue;
      unit.forEach((k, n) => {
        const el = cells[k].el;
        el.style.setProperty('--d', n);
        retrigger(el, 'flash');
      });
    }
  }

  // ---------- Hints ----------
  // A hint explains one logical step on the current board. Apply performs it.

  function hint() {
    if (!canPlay() || !hintsAllowed()) return;
    if (hintState) { applyHint(); return; }

    const wrong = [];
    for (let i = 0; i < 81; i++) if (game.values[i] && game.values[i] !== game.solution[i]) wrong.push(i);
    let h;
    if (wrong.length) {
      const i = wrong.includes(selected) ? selected : wrong[0];
      h = {
        kind: 'wrong', cell: i, focus: [i], title: 'Check this cell',
        text: `${Sudoku.cellName(i)} doesn’t match the solution. Fix it before going further: logic built on a wrong digit leads nowhere.`,
        apply: 'Erase it',
      };
    } else {
      // Use the player's notes if every empty cell has them and none rules out the answer.
      const notesOk = game.values.every((v, i) => v || (game.notes[i] & (1 << game.solution[i])));
      const step = Sudoku.hintStep(game.values, notesOk ? game.notes : null);
      if (step) {
        const t = TECHNIQUES[step.tech];
        h = {
          kind: 'step', step, focus: step.focus, title: step.name || t.name, text: step.text,
          apply: step.place ? `Place ${step.place[1]}` : 'Apply to notes',
        };
      } else {
        let i = selected;
        if (i == null || game.values[i]) {
          const open = [];
          for (let k = 0; k < 81; k++) if (!game.values[k]) open.push(k);
          i = open[(Math.random() * open.length) | 0];
        }
        h = {
          kind: 'reveal', cell: i, focus: [i], title: 'Reveal a cell',
          text: `No step from the technique library applies here. ${Sudoku.cellName(i)} is ${game.solution[i]}.`,
          apply: `Place ${game.solution[i]}`,
        };
      }
    }
    game.hints++;
    hintState = h;
    $('#hint-title').textContent = h.title;
    $('#hint-text').textContent = h.text;
    $('#hint-apply').textContent = h.apply;
    $('#hint-learn').hidden = h.kind !== 'step';
    $('#hint-card').hidden = false;
    if (h.kind === 'step' && h.step.place) selected = h.step.place[0];
    else if (h.cell != null) selected = h.cell;
    commit();
  }

  function applyHint() {
    const h = hintState;
    if (!h || !canPlay()) return;
    hideHint();
    snapshot();
    if (h.kind === 'wrong') {
      game.values[h.cell] = 0;
    } else if (h.kind === 'reveal' || (h.kind === 'step' && h.step.place)) {
      const [i, d] = h.kind === 'reveal' ? [h.cell, game.solution[h.cell]] : h.step.place;
      game.values[i] = d;
      game.notes[i] = 0;
      if (settings.autoRemoveNotes) clearPeerNotes(i, d);
      selected = i;
      retrigger(cells[i].el, 'pop');
      flashCompletedUnits(i);
      checkWin();
    } else {
      // Elimination: make sure the affected cells show candidates, then cross them out.
      for (const [i, d] of h.step.elims) {
        if (!game.notes[i]) game.notes[i] = h.step.cands[i];
        game.notes[i] &= ~(1 << d);
      }
    }
    commit();
  }

  function hideHint() {
    if (!hintState) return;
    hintState = null;
    $('#hint-card').hidden = true;
    if (game) render();
  }

  function showLearn(tech) {
    const t = TECHNIQUES[tech];
    $('#learn-title').textContent = t.name;
    $('#learn-level').textContent = `${tierName(Math.max(1, t.level))} technique`;
    $('#learn-text').textContent = t.desc;
    $('#dlg-learn').showModal();
  }

  // ---------- Finishing ----------

  function checkWin() {
    if (!game.values.every((v, k) => v === game.solution[k])) return;
    finish('won');
  }

  function finish(res, { silent = false, reason = null } = {}) {
    if (!game || game.completed) return;
    hideHint();
    const before = summary;
    const t = Progress.tier(game.tier);
    const end = Date.now();
    const won = res === 'won';
    const sc = won ? Progress.score({ tierId: game.tier, elapsed: game.elapsed, mistakes: game.mistakes, hints: game.hints, assisted: game.assisted, mode: game.mode }) : null;
    const replay = profile.history.some((a) => a.pid === game.pid && a.res === 'won');
    const qualPassed = game.mode === 'qual' && won && game.mistakes <= 1 && game.hints === 0 && !game.assisted;
    const xp = won ? Progress.xpFor({ total: sc.total, mode: game.mode, replay, qualPassed }) : 0;
    if (res === 'abandoned' && game.mode === 'qual') res = 'failed';

    const rec = {
      pid: game.pid, tier: game.tier, mode: game.mode, start: game.start, end,
      t: game.elapsed, wall: Math.round((end - game.start) / 1000), res,
      m: game.mistakes, h: game.hints, as: game.assisted,
      sc: sc ? sc.total : 0, xp, up: won && game.elapsed <= t.par, qp: qualPassed,
      tech: won ? game.techs : '',
    };
    if (sc) Object.assign(rec, { B: sc.B, T: sc.T, A: sc.A, H: sc.H, S: sc.S });
    profile.history.push(rec);
    if (won && game.mode === 'practice' && game.tech) profile.practiced[game.tech] = end;
    const newAch = won ? Progress.awardAchievements(profile, end) : [];
    refresh();
    saveProfile();

    game.completed = true;
    game.result = res;
    store.set(KEYS.game, null);
    render();
    if (silent) return;

    setTimeout(() => {
      buzz(won ? [20, 60, 20, 60, 40] : [60, 40, 60]);
      showResult({ rec, sc, before, newAch, qualPassed, replay, reason });
    }, won ? 750 : 250);
  }

  function showResult({ rec, sc, before, newAch, qualPassed, replay, reason }) {
    const won = rec.res === 'won';
    const t = Progress.tier(rec.tier);
    const mode = MODES[rec.mode];
    const after = summary;

    let title = 'Solved!';
    if (rec.mode === 'qual') title = qualPassed ? 'Qualification passed' : 'Qualification failed';
    else if (!won) title = reason === 'time' ? 'Time’s up' : 'Game over';
    else if (rec.mode === 'practice') title = 'Practice complete';
    $('#result-title').textContent = title;
    $('#result-mark').innerHTML = won && (rec.mode !== 'qual' || qualPassed) ? ICON_CHECK : ICON_X;
    $('#result-mark').classList.toggle('fail', !(won && (rec.mode !== 'qual' || qualPassed)));

    const prevBest = before.perTier[rec.tier].bestTime;
    const isBest = won && rec.mode !== 'zen' && rec.mode !== 'practice' && (prevBest == null || rec.t < prevBest);
    const isHigh = won && rec.sc > before.perTier[rec.tier].bestScore && rec.mode !== 'practice';
    const tags = [`${mode.name} · ${t.name}`];
    if (isBest) tags.push('New best time');
    else if (isHigh) tags.push('New high score');
    if (replay) tags.push('Replay: reduced XP');
    if (!won && rec.mode === 'qual') tags.push(reason === 'mistakes' ? 'More than one mistake' : 'Attempt abandoned');
    if (!won && reason === 'time') tags.push(`Par ${formatTime(t.par)}`);
    $('#result-sub').textContent = tags.join(' · ');

    const showScore = won && rec.mode !== 'practice';
    $('#result-score').hidden = !showScore;
    $('#result-breakdown').hidden = !showScore;
    if (showScore) {
      $('#result-score').innerHTML = `${fmt(sc.total)}<small> pts</small>`;
      const rows = [
        ['Base', fmt(sc.B)],
        ['Time bonus', `+${fmt(sc.T)}`],
        ['Accuracy', `×${sc.A.toFixed(2)}`],
        ['Hints', `×${sc.H.toFixed(2)}`],
        ['Assists', `×${sc.S.toFixed(2)}`],
      ];
      if (sc.M !== 1) rows.push([mode.name, `×${sc.M.toFixed(2)}`]);
      $('#result-breakdown').innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
    }
    $('#result-time').textContent = rec.mode === 'zen' ? '—' : formatTime(rec.t);
    $('#result-mistakes').textContent = rec.m;
    $('#result-hints').textContent = rec.h;

    const lvUp = after.level.level > before.level.level;
    const achXp = newAch.reduce((s, a) => s + a.xp, 0);
    $('#result-xp').innerHTML = rec.xp || achXp ? `
      <div class="xp-line"><b>+${fmt(rec.xp + achXp)} XP</b><span>${lvUp ? `Level up! Lv ${after.level.level}` : `Lv ${after.level.level} · ${fmt(after.level.into)} / ${fmt(after.level.need)}`}</span></div>
      <div class="bar"><i style="width:${pct(after.level.pct)}"></i></div>` : '';

    const news = [];
    if (after.unlocked > before.unlocked) news.push(`<div class="news unlock">${ICON_LOCK}<span><b>${tierName(after.unlocked)} unlocked</b><small>${esc(Progress.tier(after.unlocked).blurb)}</small></span></div>`);
    const mb = before.mastery[rec.tier], ma = after.mastery[rec.tier];
    if (ma.rank > mb.rank) news.push(`<div class="news rank"><span class="medal r${ma.rank}"></span><span><b>${t.name} ${ma.rankName}</b><small>New mastery rank</small></span></div>`);
    else if (MODES[rec.mode].progression && won && ma.next) news.push(`<div class="news"><span class="medal r${ma.rank}"></span><span><b>${t.name} · ${ma.rankName}</b><small>${pct(ma.pct)} toward ${ma.next.name}</small></span></div>`);
    if (rec.mode === 'qual') {
      const up = after.unlockProgress[rec.tier + 1];
      if (up && !(after.unlocked > before.unlocked)) news.push(`<div class="news"><span class="medal"></span><span><b>Qualifications ${up.quals} / ${up.req.quals}</b><small>for ${tierName(rec.tier + 1)}</small></span></div>`);
    }
    for (const a of newAch) news.push(`<div class="news ach">${ICON_CHECK}<span><b>${esc(a.name)}</b><small>${esc(a.desc)} · +${a.xp} XP</small></span></div>`);
    $('#result-news').innerHTML = news.join('');

    const next = $('#result-next');
    next.hidden = false;
    if (rec.mode === 'daily') next.hidden = true;
    else if (rec.mode === 'qual') {
      const up = after.unlockProgress[rec.tier + 1];
      next.textContent = up && up.qualReady ? 'Next qualification' : 'Play classic';
    } else if (rec.mode === 'practice') next.textContent = 'Practice again';
    else next.textContent = 'Next puzzle';
    $('#dlg-result').showModal();
  }

  function nextFromResult() {
    $('#dlg-result').close();
    if (!game) return;
    const { mode, tier: tierId, tech } = game;
    if (mode === 'qual') {
      const up = summary.unlockProgress[tierId + 1];
      startGame({ mode: up && up.qualReady ? 'qual' : 'classic', tier: up && up.qualReady ? tierId : summary.unlocked });
    } else startGame({ mode, tier: tierId, tech });
  }

  function setPaused(p) {
    paused = !!p && inProgress();
    boardEl.classList.toggle('paused', paused || loading);
    $('#pause-overlay').hidden = !paused;
    const btn = $('#btn-pause');
    btn.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
    btn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
    btn.title = paused ? 'Resume (P)' : 'Pause (P)';
  }

  // ---------- Game rendering ----------

  function renderTimer() {
    if (!game) return;
    const el = $('#timer');
    if (game.mode === 'time') {
      const left = Progress.tier(game.tier).par - game.elapsed;
      el.textContent = formatTime(left);
      el.classList.toggle('low', left <= 60);
    } else {
      el.textContent = formatTime(game.elapsed);
      el.classList.remove('low');
    }
  }

  // Live score grows with every correct digit on the board: the puzzle's score (before the
  // time bonus) times the share of empty cells solved so far. Mistakes and hints lower it
  // right away; the time bonus is added on completion, so the final matches the formula.
  let lastScore = { pid: null, value: 0 };
  function renderScore() {
    if (!game || game.mode === 'practice') return;
    const args = { tierId: game.tier, mistakes: game.mistakes, hints: game.hints, assisted: game.assisted, mode: game.mode };
    let value;
    if (game.completed && game.result === 'won') {
      value = Progress.score({ ...args, elapsed: game.elapsed }).total;
    } else {
      const noTime = Progress.score({ ...args, elapsed: Infinity }).total;
      let open = 0, solved = 0;
      for (let i = 0; i < 81; i++) {
        if (game.puzzle[i]) continue;
        open++;
        if (game.values[i] === game.solution[i]) solved++;
      }
      value = open ? Math.round((noTime * solved) / open) : noTime;
    }
    if (lastScore.pid === game.pid && value > lastScore.value) {
      const pop = $('#score-pop');
      pop.textContent = `+${fmt(value - lastScore.value)}`;
      retrigger(pop, 'show');
    }
    lastScore = { pid: game.pid, value };
    $('#score-live').textContent = fmt(value);
  }

  function render() {
    if (!game) return;
    const { values, puzzle, solution, notes } = game;
    const sel = selected;
    const selVal = sel != null ? values[sel] : 0;
    const counts = new Array(10).fill(0);

    const focus = new Set(hintState ? hintState.focus : []);
    const target = hintState?.kind === 'step' && hintState.step.place ? hintState.step.place[0] : (hintState?.cell ?? -1);
    const elimMap = new Map();
    if (hintState?.kind === 'step' && hintState.step.elims) {
      for (const [i, d] of hintState.step.elims) elimMap.set(i, (elimMap.get(i) || 0) | (1 << d));
    }

    for (let i = 0; i < 81; i++) {
      const v = values[i];
      if (v) counts[v]++;
      const c = cells[i];
      const cl = c.el.classList;
      const isPeer = sel != null && i !== sel &&
        (ROW[i] === ROW[sel] || COL[i] === COL[sel] || BOX[i] === BOX[sel]);

      c.val.textContent = v || '';
      cl.toggle('has-value', !!v);
      cl.toggle('given', !!puzzle[i]);
      cl.toggle('user', !puzzle[i] && !!v);
      cl.toggle('error', settings.highlightMistakes && !puzzle[i] && !!v && v !== solution[i]);
      cl.toggle('selected', i === sel);
      cl.toggle('peer', isPeer && !hintState);
      cl.toggle('same', settings.highlightSame && !!selVal && v === selVal && i !== sel);
      cl.toggle('hint-focus', focus.has(i));
      cl.toggle('hint-target', i === target);
      cl.toggle('hint-elim', elimMap.has(i));

      const em = elimMap.get(i) || 0;
      const m = notes[i] | (em && !notes[i] ? hintState.step.cands[i] : 0);
      for (let d = 1; d <= 9; d++) {
        const s = c.notes[d - 1].classList;
        const on = !v && !!(m & (1 << d));
        s.toggle('on', on);
        s.toggle('hl', on && settings.highlightSame && selVal === d);
        s.toggle('x', !!(em & (1 << d)));
      }
    }

    for (let d = 1; d <= 9; d++) {
      const left = Math.max(0, 9 - counts[d]);
      const b = numButtons[d - 1];
      b.querySelector('.left').textContent = left;
      b.classList.toggle('done', left === 0);
    }

    const t = Progress.tier(game.tier);
    $('#game-title').textContent = game.mode === 'practice' ? `Practice · ${TECHNIQUES[game.tech].name}` : `${MODES[game.mode].name}`;
    let sub = t.name;
    if (game.mode === 'qual') sub += ` · No hints · ${Math.max(0, 1 - game.mistakes)} mistake left`;
    if (game.mode === 'time') sub += ` · Par ${formatTime(t.par)}`;
    if (game.mode === 'daily') sub += ` · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    $('#game-sub').textContent = sub;

    numpadEl.classList.toggle('notes-mode', notesMode);
    $('#btn-notes').setAttribute('aria-pressed', String(notesMode));
    $('#notes-badge').textContent = notesMode ? 'ON' : 'OFF';
    $('.touch-help').textContent = notesMode
      ? 'Tip: long-press a number to place it instead of a note.'
      : 'Tip: long-press a number to add it as a note.';
    const done = game.completed;
    $('#btn-undo').disabled = !game.history.length || done;
    $('#btn-hint').disabled = done || !hintsAllowed();
    $('#btn-hint').hidden = !hintsAllowed();
    $('#btn-erase').disabled = done;
    $('#btn-autonotes').hidden = !assistsAllowed();
    $('#btn-autonotes').disabled = done;
    $('#view-game').style.setProperty('--tc', `var(--t${game.tier || 1})`);
    $('#tools').style.setProperty('--tools', $$('#tools .tool:not([hidden])').length);

    $('#mistakes').textContent = game.mode === 'qual' ? `${game.mistakes}/1` : game.mistakes;
    $('#score-wrap').hidden = game.mode === 'practice';
    $('#timer-wrap').hidden = game.mode === 'zen';
    $('#btn-pause').hidden = game.mode === 'zen';

    const pc = $('#practice-card');
    pc.hidden = game.mode !== 'practice' || done || !!hintState;
    if (game.mode === 'practice') {
      $('#practice-title').textContent = `Find the ${TECHNIQUES[game.tech].name}`;
      $('#practice-text').textContent = TECHNIQUES[game.tech].desc;
    }
    renderTimer();
    renderScore();
  }

  // ---------- Home ----------

  function renderHome() {
    const s = summary;
    $('#home-level').textContent = `Lv ${s.level.level}`;
    $('#home-xp-bar').style.width = pct(s.level.pct);
    $('#home-xp-text').textContent = `${fmt(s.level.into)} / ${fmt(s.level.need)} XP`;

    const top = s.unlocked;
    const m = s.mastery[top];
    $('#home-rank').textContent = `${tierName(top)} · ${m.rankName}`;
    $('#home-medal').className = `medal r${m.rank}`;
    $('#home-rank-bar').style.width = pct(m.next ? m.pct : 1);
    $('#home-rank-next').textContent = m.next
      ? `${pct(m.pct)} toward ${tierName(top)} ${m.next.name} · ${m.clean}/${m.next.clean} clean${m.next.underPar ? ` · ${m.underPar}/${m.next.underPar} under par` : ''}`
      : 'Top rank reached';

    const cont = $('#home-continue');
    cont.hidden = !inProgress();
    if (inProgress()) {
      $('#home-continue-sub').textContent = `${MODES[game.mode].name} · ${tierName(game.tier)} · ${game.mode === 'zen' ? 'in progress' : formatTime(game.elapsed)}`;
    }

    const d = Progress.dailyInfo(today());
    $('#home-daily-sub').textContent = `${tierName(d.tierId)} · ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`;
    const dd = s.dailyDoneToday;
    $('#home-daily-side').innerHTML = dd
      ? `<span class="chip ok">${ICON_CHECK}Done</span>`
      : (s.dailyStreak.current ? `<span class="chip">${s.dailyStreak.current} day streak</span>` : '');

    $('#tier-list').innerHTML = TIERS.map((t) => {
      const best = s.perTier[t.id].bestTime;
      const ms = s.mastery[t.id];
      if (t.id <= s.unlocked) {
        const up = s.unlockProgress[t.id + 1];
        const qual = up && up.qualReady && t.id === s.unlocked
          ? `<button class="btn primary small qual-btn" type="button" data-qual="${t.id}">Take qualification <small>${up.quals}/${up.req.quals}</small></button>` : '';
        return `<div class="tier-row-wrap" style="--tc:var(--t${t.id})">
          <button class="card tier-row" type="button" data-play="${t.id}">
            <span class="tier-num">${t.id}</span>
            <span class="tier-text"><b>${t.name}</b><small>${esc(t.blurb)}</small></span>
            <span class="tier-side"><span class="medal r${ms.rank}" title="${ms.rankName}"></span><small>${best != null ? formatTime(best) : ''}</small></span>
          </button>${qual}</div>`;
      }
      if (t.id === s.unlocked + 1) {
        const up = s.unlockProgress[t.id];
        const below = tierName(t.id - 1);
        const line = (label, cur, req) => req ? `<li class="${cur >= req ? 'met' : ''}">${cur >= req ? ICON_CHECK : '<i></i>'}${label} <b>${cur} / ${req}</b></li>` : '';
        return `<div class="card tier-row locked next" style="--tc:var(--t${t.id})">
            <span class="tier-num">${ICON_LOCK}</span>
            <span class="tier-text"><b>${t.name}</b><small>${esc(t.blurb)}</small>
              <ul class="req">
                ${line(`${below} puzzles`, up.completed, up.req.completed)}
                ${line('Clean solves', up.clean, up.req.clean)}
                ${line('Qualifications', up.quals, up.req.quals)}
              </ul>
              <span class="bar"><i style="width:${pct(up.pct)}"></i></span>
            </span>
          </div>`;
      }
      return `<div class="card tier-row locked" style="--tc:var(--t${t.id})">
          <span class="tier-num">${ICON_LOCK}</span>
          <span class="tier-text"><b>${t.name}</b><small>Unlocks after ${tierName(t.id - 1)}</small></span>
        </div>`;
    }).join('');

    // Collapsible level picker: summary shows where you are and whether a qualification waits.
    const qualReady = s.unlockProgress[s.unlocked + 1]?.qualReady;
    $('#lp-sub').textContent = `${tierName(s.unlocked)} · ${s.unlocked} of ${TIERS.length} unlocked`;
    $('#lp-badge').innerHTML = qualReady ? '<span class="chip ok">Qualification ready</span>' : '';
    $('#level-picker').open = !!settings.levelsOpen;

    const earned = Object.keys(profile.achievements).length;
    $('#home-awards-sub').textContent = `${earned} / ${Progress.ACHIEVEMENTS.length} earned`;
  }

  // ---------- Pickers ----------

  function openPicker(mode) {
    const list = $('#pick-list');
    if (mode === 'practice') {
      $('#dlg-pick-title').textContent = 'Practice';
      $('#dlg-pick-sub').textContent = 'Pick a technique. The board starts right where it’s needed. Practice doesn’t affect your score or unlocks.';
      const groups = {};
      for (const [key, t] of Object.entries(TECHNIQUES)) {
        const lv = Math.max(1, t.level);
        const has = BANK.some((e) => e[2].split(' ').includes(key));
        if (!has) continue;
        (groups[lv] = groups[lv] || []).push([key, t]);
      }
      list.innerHTML = Object.entries(groups).map(([lv, items]) => `
        <h3>${tierName(+lv)}</h3>
        ${items.map(([key, t]) => `<button class="pick-btn" type="button" data-tech="${key}">
          <span><b>${t.name}</b></span>${profile.practiced[key] ? `<span class="chip ok">${ICON_CHECK}Done</span>` : ''}</button>`).join('')}
      `).join('');
    } else {
      $('#dlg-pick-title').textContent = MODES[mode].name;
      $('#dlg-pick-sub').textContent = mode === 'time'
        ? 'Solve before the par time runs out. Records are kept separately.'
        : 'No timer and no pressure. Scores are halved and don’t count toward unlocks.';
      list.innerHTML = TIERS.filter((t) => t.id <= summary.unlocked).map((t) => {
        const side = mode === 'time'
          ? (summary.perTier[t.id].timeAttackBest != null ? `Best ${formatTime(summary.perTier[t.id].timeAttackBest)}` : `Par ${formatTime(t.par)}`)
          : '';
        return `<button class="pick-btn" type="button" data-tier="${t.id}"><span><b>${t.name}</b></span><small>${side}</small></button>`;
      }).join('');
    }
    list.dataset.pickMode = mode;
    $('#dlg-pick').showModal();
  }

  function confirmDialog(title, text, ok, fn) {
    $('#dlg-confirm-title').textContent = title;
    $('#dlg-confirm-text').textContent = text;
    const btn = $('#dlg-confirm-ok');
    btn.textContent = ok;
    btn.onclick = () => { $('#dlg-confirm').close(); fn(); };
    $('#dlg-confirm').showModal();
  }

  // ---------- Statistics ----------

  let statsFilter = 'all';

  function renderStats() {
    const s = summary;
    const tile = (label, value) => `<div class="tile"><b>${value}</b><span>${label}</span></div>`;
    const sel = statsFilter === 'all' ? null : +statsFilter;
    const H = profile.history;
    const rows = sel ? H.filter((a) => a.tier === sel) : H;
    const wins = rows.filter((a) => a.res === 'won');
    const timed = wins.filter((a) => a.mode !== 'zen' && a.mode !== 'practice');
    const avg = (xs) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : 0);

    const detail = {
      Played: rows.length,
      Completed: wins.length,
      Abandoned: rows.filter((a) => a.res === 'abandoned').length,
      'Failed': rows.filter((a) => a.res === 'failed').length,
      'Win rate': rows.length ? pct(wins.length / rows.length) : '–',
      'Best time': timed.length ? formatTime(Math.min(...timed.map((a) => a.t))) : '–',
      'Average time': timed.length ? formatTime(avg(timed.map((a) => a.t))) : '–',
      'Best score': wins.length ? fmt(Math.max(...wins.map((a) => a.sc))) : '–',
      'Clean games': wins.filter(Progress.isClean).length,
      'Mistakes per game': wins.length ? avg(wins.map((a) => a.m)).toFixed(1) : '–',
      'Hints per game': wins.length ? avg(wins.map((a) => a.h)).toFixed(1) : '–',
      'Under par': wins.filter((a) => a.up).length,
    };

    // Solve-time trend: last 30 timed wins for the selected tier (or the most-played tier).
    let trendTier = sel;
    if (!trendTier) {
      let bestN = 0;
      for (const t of TIERS) { const n = s.perTier[t.id].times.length; if (n > bestN) { bestN = n; trendTier = t.id; } }
    }
    const series = trendTier ? H.filter((a) => a.tier === trendTier && a.res === 'won' && a.mode !== 'zen' && a.mode !== 'practice').slice(-30) : [];
    let improvement = '';
    if (series.length >= 6) {
      const half = Math.floor(series.length / 2);
      const a1 = avg(series.slice(0, half).map((a) => a.t)), a2 = avg(series.slice(half).map((a) => a.t));
      const dir = a2 < a1 ? 'dropped' : 'rose';
      improvement = `Your average ${tierName(trendTier)} time ${dir} from ${minutes(a1)} to ${minutes(a2)} over the last ${series.length} puzzles.`;
    }

    const maxDone = Math.max(1, ...TIERS.map((t) => s.perTier[t.id].completed));
    const techList = Object.entries(s.techCounts).sort((a, b) => TECHNIQUES[a[0]].level - TECHNIQUES[b[0]].level || b[1] - a[1]);

    $('#stats-root').innerHTML = `
      <div class="tiles">
        ${tile(`Level · ${fmt(s.xp)} XP`, s.level.level)}
        ${tile('Puzzles completed', fmt(s.completed))}
        ${tile('Win rate', s.played ? pct(s.winRate) : '–')}
        ${tile('Perfect games', fmt(s.clean))}
        ${tile('Longest streak', `${s.streak.best} day${s.streak.best === 1 ? '' : 's'}`)}
        ${tile('Current streak', `${s.streak.current} day${s.streak.current === 1 ? '' : 's'}`)}
        ${tile('Play time', s.playTime >= 3600 ? `${(s.playTime / 3600).toFixed(1)} h` : minutes(s.playTime))}
        ${tile('Total score', fmt(s.totalScore))}
      </div>

      <h2 class="section-title">Performance by difficulty</h2>
      <div class="card bars">
        ${TIERS.map((t) => {
          const pt = s.perTier[t.id];
          return `<div class="bar-row"><span>${t.name}</span><span class="bar"><i style="width:${(pt.completed / maxDone) * 100}%"></i></span><b>${pt.completed}</b></div>`;
        }).join('')}
      </div>

      <div class="chips" role="tablist">
        <button class="chip-btn" type="button" data-filter="all" aria-pressed="${!sel}">All</button>
        ${TIERS.map((t) => `<button class="chip-btn" type="button" data-filter="${t.id}" aria-pressed="${sel === t.id}">${t.name}</button>`).join('')}
      </div>

      <div class="card">
        <table class="kv">${Object.entries(detail).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
      </div>

      <h2 class="section-title">Solve time${trendTier ? ` · ${tierName(trendTier)}` : ''}</h2>
      <div class="card chart-card">
        ${series.length >= 2 ? trendChart(series, Progress.tier(trendTier).par) : '<p class="muted small">Complete a few timed puzzles to see your trend.</p>'}
        ${improvement ? `<p class="insight">${improvement}</p>` : ''}
      </div>

      <h2 class="section-title">Personal records</h2>
      <div class="card">
        <table class="stats">
          <thead><tr><th></th><th>Best time</th><th>High score</th><th>Time Attack</th><th>Rank</th></tr></thead>
          <tbody>${TIERS.map((t) => {
            const pt = s.perTier[t.id];
            return `<tr><td>${t.name}</td><td>${pt.bestTime != null ? formatTime(pt.bestTime) : '–'}</td><td>${pt.bestScore ? fmt(pt.bestScore) : '–'}</td><td>${pt.timeAttackBest != null ? formatTime(pt.timeAttackBest) : '–'}</td><td><span class="medal r${s.mastery[t.id].rank}" title="${s.mastery[t.id].rankName}"></span></td></tr>`;
          }).join('')}</tbody>
        </table>
        <table class="kv">
          <tr><td>Longest clean streak</td><td>${s.bestCleanRun}</td></tr>
          <tr><td>Daily challenges</td><td>${s.dailyCount} · best ${s.dailyStreak.best} in a row</td></tr>
          <tr><td>Best daily score</td><td>${s.dailyBest ? fmt(s.dailyBest) : '–'}</td></tr>
        </table>
      </div>

      <h2 class="section-title">Techniques met</h2>
      <div class="card">
        ${techList.length ? `<table class="kv">${techList.map(([k, n]) => `<tr><td>${TECHNIQUES[k].name} <small class="muted">${tierName(Math.max(1, TECHNIQUES[k].level))}</small></td><td>${n} puzzle${n === 1 ? '' : 's'}</td></tr>`).join('')}</table>` : '<p class="muted small">Solved puzzles list the techniques they needed here.</p>'}
      </div>

      <h2 class="section-title">History</h2>
      <div class="card history">
        ${H.length ? `<table class="stats">
          <thead><tr><th>Date</th><th>Puzzle</th><th>Result</th><th>Time</th><th>Score</th></tr></thead>
          <tbody>${H.slice(-40).reverse().map((a) => `<tr>
            <td>${new Date(a.end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
            <td>${tierName(a.tier)}<small class="muted"> ${MODES[a.mode].name}</small></td>
            <td class="res-${a.res}">${a.res === 'won' ? (Progress.isClean(a) ? 'Clean' : 'Won') : a.res === 'failed' ? 'Failed' : 'Abandoned'}</td>
            <td>${a.mode === 'zen' ? '–' : formatTime(a.t)}</td>
            <td>${a.res === 'won' && a.mode !== 'practice' ? fmt(a.sc) : '–'}</td>
          </tr>`).join('')}</tbody>
        </table>` : '<p class="muted small">No games yet.</p>'}
      </div>
    `;
  }

  function trendChart(series, par) {
    const W = 320, Hh = 140, P = { l: 34, r: 8, t: 10, b: 18 };
    const ts = series.map((a) => a.t / 60);
    const avgs = ts.map((_, k) => {
      const w = ts.slice(Math.max(0, k - 4), k + 1);
      return w.reduce((x, y) => x + y, 0) / w.length;
    });
    const max = Math.max(par / 60, ...ts) * 1.1;
    const x = (k) => P.l + (k / Math.max(1, ts.length - 1)) * (W - P.l - P.r);
    const y = (v) => P.t + (1 - v / max) * (Hh - P.t - P.b);
    const line = (vals) => vals.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const ticks = [0, max / 2, max].map((v) => `<text x="${P.l - 6}" y="${y(v) + 3}" text-anchor="end">${Math.round(v)}m</text><line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/>`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Solve time per puzzle, in minutes">
      ${ticks}
      <line x1="${P.l}" x2="${W - P.r}" y1="${y(par / 60)}" y2="${y(par / 60)}" class="par"/>
      <text x="${W - P.r}" y="${y(par / 60) - 4}" text-anchor="end" class="par-label">par</text>
      ${ts.map((v, k) => `<circle cx="${x(k)}" cy="${y(v)}" r="2.5" class="dot"><title>${v.toFixed(1)} min</title></circle>`).join('')}
      <path d="${line(avgs)}" class="avg"/>
      <text x="${P.l}" y="${Hh - 4}">older</text><text x="${W - P.r}" y="${Hh - 4}" text-anchor="end">recent</text>
    </svg>
    <p class="legend muted small"><span class="lg-dot"></span>each puzzle <span class="lg-line"></span>5-game average</p>`;
  }

  // ---------- Achievements ----------

  function renderAwards() {
    const s = summary;
    const got = profile.achievements;
    const earnedXp = Object.values(got).reduce((x, a) => x + (a.xp || 0), 0);
    const groups = {};
    for (const a of Progress.ACHIEVEMENTS) (groups[a.group] = groups[a.group] || []).push(a);
    $('#awards-root').innerHTML = `
      <div class="tiles two">
        <div class="tile"><b>${Object.keys(got).length} / ${Progress.ACHIEVEMENTS.length}</b><span>Earned</span></div>
        <div class="tile"><b>${fmt(earnedXp)}</b><span>XP from achievements</span></div>
      </div>
      ${Object.entries(groups).map(([g, list]) => `
        <h2 class="section-title">${g}</h2>
        <div class="card ach-list">
          ${list.map((a) => {
            const done = !!got[a.id];
            const [cur, target] = a.progress(s);
            const secret = a.hidden && !done;
            return `<div class="ach ${done ? 'done' : ''}">
              <span class="ach-icon">${done ? ICON_CHECK : secret ? '?' : ''}</span>
              <span class="ach-text">
                <b>${secret ? 'Hidden achievement' : esc(a.name)}</b>
                <small>${secret ? 'Keep playing to discover it' : esc(a.desc)}</small>
                ${!done && !secret && target > 1 ? `<span class="bar"><i style="width:${pct(Math.min(1, cur / target))}"></i></span><small class="prog">${fmt(Math.min(cur, target))} / ${fmt(target)}</small>` : ''}
              </span>
              <span class="ach-xp">+${a.xp}</span>
            </div>`;
          }).join('')}
        </div>`).join('')}
    `;
  }

  // ---------- Views ----------

  function route(name) {
    const hash = `#/${name}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
    showView(name);
  }

  function go(name) {
    // Push so the phone's back button returns home.
    if (location.hash !== `#/${name}`) location.hash = `#/${name}`;
    else showView(name);
  }

  function showView(name) {
    if (name === 'game' && !game && !loading) name = 'home';
    if (!['home', 'game', 'stats', 'awards'].includes(name)) name = 'home';
    if (view === 'game' && name !== 'game') { hideHint(); saveGame(); }
    view = name;
    for (const v of ['home', 'game', 'stats', 'awards']) $(`#view-${v}`).hidden = v !== name;
    if (name === 'home') renderHome();
    if (name === 'stats') renderStats();
    if (name === 'awards') renderAwards();
    if (name === 'game') render();
    window.scrollTo(0, 0);
  }

  // Keep the phone's status/address bar color in sync with a manually chosen theme.
  const themeMetas = $$('meta[name="theme-color"]');
  themeMetas.forEach((m) => { m.dataset.auto = m.content; });

  function applyTheme() {
    if (settings.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', settings.theme);
    const forced = settings.theme === 'dark' ? '#221c22' : settings.theme === 'light' ? '#fdf5ea' : null;
    themeMetas.forEach((m) => { m.content = forced || m.dataset.auto; });
  }

  function openSettings() {
    $$('[data-setting]').forEach((el) => {
      const key = el.dataset.setting;
      if (el.type === 'checkbox') el.checked = !!settings[key];
      else el.value = settings[key];
    });
    $('#dlg-settings').showModal();
  }

  // ---------- Events ----------

  function moveSelection(dr, dc) {
    if (selected == null) { select(40); return; }
    const r = (ROW[selected] + dr + 9) % 9;
    const c = (COL[selected] + dc + 9) % 9;
    select(r * 9 + c);
  }

  function bindEvents() {
    boardEl.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.cell');
      if (el) select(Number(el.dataset.i));
    });

    $('#btn-undo').addEventListener('click', undo);
    $('#btn-erase').addEventListener('click', erase);
    $('#btn-notes').addEventListener('click', toggleNotesMode);
    $('#btn-hint').addEventListener('click', hint);
    $('#btn-autonotes').addEventListener('click', autoNotes);
    $('#btn-pause').addEventListener('click', () => setPaused(!paused));
    $('#btn-resume').addEventListener('click', () => setPaused(false));
    $('#hint-apply').addEventListener('click', applyHint);
    $('#hint-close').addEventListener('click', hideHint);
    $('#hint-learn').addEventListener('click', () => { if (hintState?.step) showLearn(hintState.step.tech); });

    $$('[data-action="settings"]').forEach((b) => b.addEventListener('click', openSettings));
    document.addEventListener('click', (e) => {
      const r = e.target.closest('[data-route]');
      if (r) { go(r.dataset.route); return; }
      const play = e.target.closest('[data-play]');
      if (play) { guardAbandon(() => startGame({ mode: 'classic', tier: +play.dataset.play })); return; }
      const qual = e.target.closest('[data-qual]');
      if (qual) {
        const id = +qual.dataset.qual;
        confirmDialog(
          `${tierName(id)} qualification`,
          `Solve a ${tierName(id)} puzzle with no hints and at most one mistake. A second mistake ends the attempt. Pass to move closer to ${tierName(id + 1)}.`,
          'Start',
          () => guardAbandon(() => startGame({ mode: 'qual', tier: id }))
        );
        return;
      }
      const mode = e.target.closest('[data-mode]');
      if (mode) { openPicker(mode.dataset.mode); return; }
      const filter = e.target.closest('[data-filter]');
      if (filter) { statsFilter = filter.dataset.filter; renderStats(); }
    });

    $('#level-picker').addEventListener('toggle', () => {
      settings.levelsOpen = $('#level-picker').open;
      saveSettings();
    });

    $('#home-continue').addEventListener('click', () => { if (inProgress()) { go('game'); setPaused(false); } });
    $('#home-daily').addEventListener('click', () => {
      if (inProgress() && game.mode === 'daily') { go('game'); return; }
      guardAbandon(() => startGame({ mode: 'daily' }));
    });

    $('#pick-list').addEventListener('click', (e) => {
      const b = e.target.closest('.pick-btn');
      if (!b) return;
      const mode = $('#pick-list').dataset.pickMode;
      $('#dlg-pick').close();
      if (mode === 'practice') guardAbandon(() => startGame({ mode, tech: b.dataset.tech }));
      else guardAbandon(() => startGame({ mode, tier: +b.dataset.tier }));
    });

    $('#result-home').addEventListener('click', () => { $('#dlg-result').close(); go('home'); });
    $('#result-next').addEventListener('click', nextFromResult);

    $$('dialog').forEach((dlg) => {
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
      dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
    });

    $$('[data-setting]').forEach((el) => {
      el.addEventListener('change', () => {
        const key = el.dataset.setting;
        settings[key] = el.type === 'checkbox' ? el.checked : el.value;
        saveSettings();
        applyTheme();
        render();
      });
    });

    document.addEventListener('keydown', (e) => {
      if (document.querySelector('dialog[open]') || view !== 'game') return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
        return;
      }
      if (e.altKey) return;

      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (m) {
        e.preventDefault();
        input(Number(m[1]), notesMode || e.shiftKey);
        return;
      }

      switch (e.key) {
        case 'ArrowUp': e.preventDefault(); moveSelection(-1, 0); break;
        case 'ArrowDown': e.preventDefault(); moveSelection(1, 0); break;
        case 'ArrowLeft': e.preventDefault(); moveSelection(0, -1); break;
        case 'ArrowRight': e.preventDefault(); moveSelection(0, 1); break;
        case 'Backspace':
        case 'Delete':
        case '0':
          e.preventDefault(); erase(); break;
        case 'n': case 'N': toggleNotesMode(); break;
        case 'h': case 'H': hint(); break;
        case 'p': case 'P': if (game?.mode !== 'zen') setPaused(!paused); break;
        case 'Escape': selected = null; hideHint(); render(); break;
      }
    });

    window.addEventListener('hashchange', () => showView(location.hash.replace(/^#\/?/, '') || 'home'));

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (inProgress() && game.mode !== 'zen') setPaused(true);
        saveGame();
      }
    });
    window.addEventListener('pagehide', saveGame);

    setInterval(() => {
      if (view !== 'game' || !inProgress() || paused || loading || document.hidden) return;
      if (document.querySelector('dialog[open]')) return;
      game.elapsed++;
      renderTimer();
      if (game.mode === 'time' && game.elapsed >= Progress.tier(game.tier).par) {
        finish('failed', { reason: 'time' });
        return;
      }
      if (game.elapsed % 5 === 0) saveGame();
    }, 1000);
  }

  // ---------- Boot ----------

  applyTheme();
  buildBoard();
  bindEvents();
  if (typeof navigator.vibrate !== 'function') $('#setting-vibrate').hidden = true;

  // Offline support + "Add to Home Screen" (needs http/https, so it's skipped when opened as a file).
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline support unavailable */ });
    });
  }

  const saved = store.get(KEYS.game, null);
  if (isValidGame(saved) && !saved.completed) {
    game = Object.assign({ mistakes: 0, hints: 0, elapsed: 0, history: [], completed: false, moved: true, start: Date.now() }, saved);
    setPaused(false);
  }
  refresh();
  const initial = location.hash.replace(/^#\/?/, '') || 'home';
  route(initial === 'game' && !game ? 'home' : initial);
})();
