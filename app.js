(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const DIFFICULTIES = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };
  const KEYS = { game: 'sudoku.game.v1', settings: 'sudoku.settings.v1', stats: 'sudoku.stats.v1' };
  const MAX_HISTORY = 500;
  const { ROW, COL, BOX, ROWS, COLS, BOXES, PEERS } = Sudoku;

  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke-width="3"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>';

  // ---------- Storage ----------

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    },
  };

  const settings = Object.assign(
    { highlightMistakes: true, highlightSame: true, autoRemoveNotes: true, vibrate: true, theme: 'auto', lastDifficulty: 'easy' },
    store.get(KEYS.settings, {})
  );
  const stats = store.get(KEYS.stats, {}) || {};

  let game = null;
  let selected = null;
  let notesMode = false;
  let paused = false;

  const saveGame = () => { if (game) store.set(KEYS.game, game); };
  const saveSettings = () => store.set(KEYS.settings, settings);
  const saveStats = () => store.set(KEYS.stats, stats);

  function statFor(d) {
    if (!stats[d]) stats[d] = { played: 0, won: 0, best: null };
    return stats[d];
  }

  function isValidGame(g) {
    const arr = (a) => Array.isArray(a) && a.length === 81;
    return g && DIFFICULTIES[g.difficulty] && arr(g.puzzle) && arr(g.solution) && arr(g.values) && arr(g.notes);
  }

  // ---------- DOM ----------

  const boardEl = $('#board');
  const numpadEl = $('#numpad');
  const cells = [];
  const numButtons = [];

  function build() {
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

  // ---------- Game lifecycle ----------

  function newGame(difficulty) {
    const { puzzle, solution } = Sudoku.generate(difficulty);
    game = {
      difficulty,
      puzzle,
      solution,
      values: puzzle.slice(),
      notes: new Array(81).fill(0),
      mistakes: 0,
      hints: 0,
      elapsed: 0,
      history: [],
      completed: false,
    };
    settings.lastDifficulty = difficulty;
    saveSettings();
    statFor(difficulty).played++;
    saveStats();
    selected = null;
    setPaused(false);
    saveGame();
    render();
  }

  function restart() {
    Object.assign(game, {
      values: game.puzzle.slice(),
      notes: new Array(81).fill(0),
      mistakes: 0,
      hints: 0,
      elapsed: 0,
      history: [],
      completed: false,
    });
    selected = null;
    setPaused(false);
    saveGame();
    render();
  }

  const canPlay = () => game && !game.completed && !paused;

  function snapshot() {
    game.history.push({ v: game.values.slice(), n: game.notes.slice() });
    if (game.history.length > MAX_HISTORY) game.history.shift();
  }

  function commit() {
    saveGame();
    render();
  }

  // ---------- Actions ----------

  function select(i) {
    if (paused || !game) return;
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
      // Removing an existing note is always allowed.
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

    snapshot();
    game.values[i] = d;
    game.notes[i] = 0;
    if (settings.autoRemoveNotes) clearPeerNotes(i, d);

    if (d !== game.solution[i]) {
      game.mistakes++;
      if (settings.highlightMistakes) {
        retrigger(cells[i].el, 'shake');
        buzz([35, 50, 35]);
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
    snapshot();
    game.values[i] = 0;
    game.notes[i] = 0;
    commit();
  }

  function undo() {
    if (!canPlay() || !game.history.length) return;
    const s = game.history.pop();
    game.values = s.v;
    game.notes = s.n;
    commit();
  }

  function hint() {
    if (!canPlay()) return;
    let i = selected;
    if (i == null || game.values[i] === game.solution[i]) {
      const open = [];
      for (let k = 0; k < 81; k++) if (game.values[k] !== game.solution[k]) open.push(k);
      if (!open.length) return;
      i = open[(Math.random() * open.length) | 0];
    }
    snapshot();
    const d = game.solution[i];
    game.values[i] = d;
    game.notes[i] = 0;
    game.hints++;
    if (settings.autoRemoveNotes) clearPeerNotes(i, d);
    selected = i;
    retrigger(cells[i].el, 'pop');
    flashCompletedUnits(i);
    checkWin();
    commit();
  }

  function toggleNotesMode() {
    notesMode = !notesMode;
    render();
  }

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

  function checkWin() {
    if (!game.values.every((v, k) => v === game.solution[k])) return;
    game.completed = true;
    const s = statFor(game.difficulty);
    s.won++;
    const isBest = s.best == null || game.elapsed < s.best;
    if (isBest) s.best = game.elapsed;
    saveStats();
    setTimeout(() => {
      buzz([20, 60, 20, 60, 40]);
      showWin(isBest);
    }, 750);
  }

  function setPaused(p) {
    paused = !!p && !!game && !game.completed;
    boardEl.classList.toggle('paused', paused);
    $('#pause-overlay').hidden = !paused;
    const btn = $('#btn-pause');
    btn.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
    btn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
    btn.title = paused ? 'Resume (P)' : 'Pause (P)';
  }

  // ---------- Rendering ----------

  function formatTime(sec) {
    const h = (sec / 3600) | 0;
    const m = ((sec % 3600) / 60) | 0;
    const s = sec % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  function renderTimer() {
    $('#timer').textContent = formatTime(game ? game.elapsed : 0);
  }

  function render() {
    if (!game) return;
    const { values, puzzle, solution, notes } = game;
    const sel = selected;
    const selVal = sel != null ? values[sel] : 0;
    const counts = new Array(10).fill(0);

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
      cl.toggle('peer', isPeer);
      cl.toggle('same', settings.highlightSame && !!selVal && v === selVal && i !== sel);

      const m = notes[i];
      for (let d = 1; d <= 9; d++) {
        const s = c.notes[d - 1].classList;
        const on = !v && !!(m & (1 << d));
        s.toggle('on', on);
        s.toggle('hl', on && settings.highlightSame && selVal === d);
      }
    }

    for (let d = 1; d <= 9; d++) {
      const left = Math.max(0, 9 - counts[d]);
      const b = numButtons[d - 1];
      b.querySelector('.left').textContent = left;
      b.classList.toggle('done', left === 0);
    }

    numpadEl.classList.toggle('notes-mode', notesMode);
    const notesBtn = $('#btn-notes');
    notesBtn.setAttribute('aria-pressed', String(notesMode));
    $('#notes-badge').textContent = notesMode ? 'ON' : 'OFF';
    $('.touch-help').textContent = notesMode
      ? 'Tip: long-press a number to place it instead of a note.'
      : 'Tip: long-press a number to add it as a note.';
    $('#btn-undo').disabled = !game.history.length || game.completed;
    $('#btn-hint').disabled = game.completed;
    $('#btn-erase').disabled = game.completed;

    $('#difficulty-label').textContent = DIFFICULTIES[game.difficulty];
    $('#mistakes').textContent = game.mistakes;
    $('#mistakes-wrap').hidden = !settings.highlightMistakes;
    renderTimer();
  }

  // ---------- Dialogs ----------

  function openNewGame() {
    document.querySelectorAll('[data-best]').forEach((el) => {
      const best = stats[el.dataset.best]?.best;
      el.textContent = best != null ? `Best ${formatTime(best)}` : '';
    });
    document.querySelectorAll('.diff-btn').forEach((b) => {
      b.classList.toggle('current', game && b.dataset.diff === game.difficulty);
    });
    $('#btn-restart').hidden = !game || game.completed;
    $('#dlg-new').showModal();
  }

  function openSettings() {
    document.querySelectorAll('[data-setting]').forEach((el) => {
      const key = el.dataset.setting;
      if (el.type === 'checkbox') el.checked = !!settings[key];
      else el.value = settings[key];
    });
    $('#stats-body').innerHTML = Object.entries(DIFFICULTIES).map(([key, label]) => {
      const s = stats[key] || { played: 0, won: 0, best: null };
      return `<tr><td>${label}</td><td>${s.played}</td><td>${s.won}</td><td>${s.best != null ? formatTime(s.best) : '–'}</td></tr>`;
    }).join('');
    $('#dlg-settings').showModal();
  }

  function showWin(isBest) {
    $('#win-sub').textContent = `${DIFFICULTIES[game.difficulty]}${isBest ? ' · New best time!' : ''}`;
    $('#win-time').textContent = formatTime(game.elapsed);
    $('#win-mistakes').textContent = game.mistakes;
    $('#win-hints').textContent = game.hints;
    $('#dlg-win').showModal();
  }

  // Keep the phone's status/address bar color in sync with a manually chosen theme.
  const themeMetas = [...document.querySelectorAll('meta[name="theme-color"]')];
  themeMetas.forEach((m) => { m.dataset.auto = m.content; });

  function applyTheme() {
    if (settings.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', settings.theme);
    const forced = settings.theme === 'dark' ? '#111318' : settings.theme === 'light' ? '#f3f2ee' : null;
    themeMetas.forEach((m) => { m.content = forced || m.dataset.auto; });
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
    $('#btn-pause').addEventListener('click', () => setPaused(!paused));
    $('#btn-resume').addEventListener('click', () => setPaused(false));
    $('#btn-new').addEventListener('click', openNewGame);
    $('#btn-settings').addEventListener('click', openSettings);

    document.querySelectorAll('.diff-btn').forEach((b) => {
      b.addEventListener('click', () => {
        $('#dlg-new').close();
        newGame(b.dataset.diff);
      });
    });
    $('#btn-restart').addEventListener('click', () => {
      $('#dlg-new').close();
      restart();
    });
    $('#btn-win-again').addEventListener('click', () => {
      $('#dlg-win').close();
      newGame(game.difficulty);
    });
    $('#btn-win-choose').addEventListener('click', () => {
      $('#dlg-win').close();
      openNewGame();
    });

    document.querySelectorAll('dialog').forEach((dlg) => {
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
      dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
    });

    document.querySelectorAll('[data-setting]').forEach((el) => {
      el.addEventListener('change', () => {
        const key = el.dataset.setting;
        settings[key] = el.type === 'checkbox' ? el.checked : el.value;
        saveSettings();
        applyTheme();
        render();
      });
    });

    document.addEventListener('keydown', (e) => {
      if (document.querySelector('dialog[open]')) return;
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
        case 'p': case 'P': setPaused(!paused); break;
        case 'Escape': selected = null; render(); break;
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (game && !game.completed) setPaused(true);
        saveGame();
      }
    });
    window.addEventListener('pagehide', saveGame);

    setInterval(() => {
      if (!game || game.completed || paused || document.hidden) return;
      if (document.querySelector('dialog[open]')) return;
      game.elapsed++;
      renderTimer();
      if (game.elapsed % 5 === 0) saveGame();
    }, 1000);
  }

  // ---------- Boot ----------

  applyTheme();
  build();
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
    game = Object.assign({ mistakes: 0, hints: 0, elapsed: 0, history: [], completed: false }, saved);
    setPaused(false);
    render();
  } else {
    newGame(DIFFICULTIES[settings.lastDifficulty] ? settings.lastDifficulty : 'easy');
  }
})();
