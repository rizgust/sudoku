# Sudoku — Effects & Feedback Specification v1.0

**Implementation:** Vanilla HTML, CSS, JavaScript  
**Visual theme:** Dark / Charcoal / Emerald / Muted Gold  
**Dependencies:** None required  
**Objective:** Make correct placements, region clears, chains, and achievements increasingly satisfying through visual and audio feedback.

---

## A. Basic Number Placement

### Correct Number — `NUMBER_PLACED`

Trigger: A player confirms a correct digit.

Visual:
- Number scales from 0.85 to 1.12, then settles at 1.0.
- Cell background briefly highlights.
- Small score popup floats upward.
- Animation lasts 160–220 ms.

Audio:
- Short, soft click.
- Slightly metallic, not mechanical.
- Low volume.

Score popup examples:

`+50`, `+75`, `+125`, `+200`

### Incorrect Number — `WRONG_NUMBER`

Visual:
- Cell briefly flashes muted red.
- Cell shakes horizontally by approximately 2 pixels.
- Mistake counter receives a short pulse.
- No positive score particles.

Audio:
- Short, muted low-frequency knock.
- No harsh alarm.

Duration: 180–250 ms.

Incorrect placements should never produce a satisfying reward sound.

---

## B. Region Completion Effects

### Row Complete — `ROW_COMPLETED`

- Completed row receives a left-to-right light sweep.
- All nine cells pulse briefly.
- Floating text: `ROW COMPLETE`
- Score: `+300`
- Audio: Two-note rising chime.

Duration: 450 ms.

### Column Complete — `COLUMN_COMPLETED`

- Completed column receives a top-to-bottom light sweep.
- All nine cells pulse briefly.
- Floating text: `COLUMN COMPLETE`
- Score: `+300`
- Audio: Two-note rising chime with a slightly different pitch.

Duration: 450 ms.

### Block Complete — `BLOCK_COMPLETED`

- The 3×3 block briefly gains an emerald outline.
- Light burst originates from its center.
- Floating text: `BLOCK COMPLETE`
- Score: `+500`
- Audio: Deeper metallic *ka-chink*.

Duration: 550 ms.

### Double Clear — `DOUBLE_CLEAR`

Trigger: One number completes two regions simultaneously.

- Two region animations play together.
- Gold accent replaces the usual emerald.
- Large text: `DOUBLE CLEAR!`
- Additional score: `+200`
- A short double metallic chime.

Duration: 650 ms.

### Triple Clear — `TRIPLE_CLEAR`

Trigger: One number completes a row, column, and block simultaneously.

- All three regions illuminate.
- Radial gold burst from the last cell.
- Large text: `TRIPLE CLEAR!!`
- Additional score: `+400`
- Short jackpot-style chime.

Duration: 850 ms.

Triple Clear should feel rare and exceptional.

---

## C. Chain Reveal Effects

### Chain Level 0 — Normal

**Length:** 1–2 placements.

- Standard number pop.
- Small floating points.
- Normal placement sound.
- No screen effects.

### Chain Level 1 — Chain!

**Length:** 3 placements.

- Emerald ring around the latest cell.
- `3× CHAIN!` text appears near the board.
- Small particles.
- First metallic *ka-chink* sound.

Duration: 300–400 ms.

### Chain Level 2 — Great Chain!

**Length:** 4 placements.

- More pronounced cell glow.
- `GREAT CHAIN!`
- Two short metallic sounds.
- Score popup grows slightly.
- A narrow pulse travels across the chain indicator.

Duration: 400–500 ms.

### Chain Level 3 — Super Chain!

**Length:** 5 placements.

- Accent transitions from emerald to gold.
- `SUPER CHAIN!`
- Rising musical chime.
- 8–12 particles.
- Score popup has a brief overshoot animation.

Duration: 500–650 ms.

### Chain Level 4 — Mega Chain!

**Length:** 6–7 placements.

- `MEGA CHAIN!!`
- Gold particle burst.
- Subtle pulse around the Sudoku board.
- Three-to-four-note ascending sound.
- Current chain multiplier receives a glowing outline.

Duration: 600–750 ms.

### Chain Level 5 — Legendary Chain!

**Length:** 8+ placements.

- `LEGENDARY!!!`
- Bright muted-gold flash.
- 16–24 particles.
- Board-scale pulse.
- Optional 1–2 px screen shake.
- Short jackpot fanfare.
- Larger animated score popup.

Duration: 750–1000 ms.

For chains beyond eight, effects do not continuously grow without limit. Instead, pitch and small visual details can continue increasing within a capped intensity range.

---

## D. Chain Type Identity

Each chain type gets its own visual identity.

| Type | Accent | Signature effect |
|---|---|---|
| Time Chain | Cyan | Pulsing clock ring |
| Number Chain | Blue | Matching digits briefly illuminate |
| Block Chain | Emerald | 3×3 block outline |
| Line Chain | Amber | Row/column light sweep |
| Hybrid Chain | Gold | Multi-pattern burst |

The intensity level determines effect size.

The chain type determines effect color and pattern.

Example:

A Level 5 Number Chain uses legendary intensity with blue-themed accents.

A Level 5 Hybrid Chain uses legendary intensity with gold accents.

---

## E. Chain Timer Feedback

While an active chain can still be extended:

- Display a small timer bar.
- Show remaining time numerically only when useful.
- Timer bar shrinks smoothly.
- At 30% remaining, accent shifts toward amber.
- At 15% remaining, the indicator subtly pulses.
- Timer expires without a loud failure effect.

When a chain expires:

- Fade out the chain indicator.
- Play a soft closing sound only for an activated chain.
- Do not show `FAILED`.
- Do not subtract earned points.

The timer must never cover candidate notes or grid digits.

---

## F. Audio Design

All sounds must be short, distinguishable, and relatively quiet.

### Audio Layers

1. **Input layer:** Soft clicks for number placement.
2. **Reward layer:** Chimes for row, column, and block completion.
3. **Chain layer:** Metallic sounds with ascending pitch.
4. **Celebration layer:** Short fanfares for exceptional achievements.

### Progressive Chain Audio

| Length | Sound |
|---|---|
| 1–2 | Tick |
| 3 | Ka-chink |
| 4 | Ka-chink-chink |
| 5 | Rising metallic chime |
| 6–7 | Ascending 3–4 note chime |
| 8+ | Brief jackpot fanfare |

The pitch should rise with chain intensity, but maximum volume must remain controlled.

Multiple simultaneous scoring events should be combined into a coordinated sequence rather than playing all sounds at once.

### Audio Settings

Players can independently configure:

- Master sound volume.
- Sound effects on/off.
- Chain sounds on/off.
- Celebration sounds on/off.

Audio must initialize only after user interaction, respecting browser autoplay restrictions.

---

## G. Screen Effects and Priority

Event priority:

1. Puzzle completion.
2. Legendary Chain.
3. Triple Clear.
4. Mega Chain.
5. Double Clear.
6. Super Chain.
7. Standard Chain.
8. Region Completion.
9. Normal Placement.

When several events happen on one move:

- Always apply all valid score rewards.
- Show one dominant celebration.
- Show other reward amounts in a compact summary.
- Do not stack full-screen animations.
- Merge simultaneous audio into a single coordinated flourish.

Example:

A final placement triggers a Block Chain and Triple Clear.

Display:

`LEGENDARY TRIPLE CLEAR!`

Below:

`+500 Block`

`+300 Row`

`+300 Column`

`+400 Triple Clear`

`+1,200 Chain`

The exact bonus amounts must come from the scoring engine.

---

## H. Puzzle Completion Effects

### Normal Completion

- Board receives a gentle emerald sweep.
- Completed cells briefly illuminate.
- Text: `PUZZLE SOLVED`
- Final score counts upward.
- Score breakdown appears.
- Completion sound plays.

### Clean Completion

Additional effects:

- Gold checkmark.
- `PERFECT SOLVE`
- Special clean-completion sound.

### New Personal Best

Additional effects:

- `NEW PERSONAL BEST!`
- Small gold particle burst.
- Highlight previous score versus new score.

### Difficulty Unlock

- Unlock icon opens.
- Difficulty label illuminates.
- Text: `NEW DIFFICULTY UNLOCKED`
- Short celebratory sound.

### Mastery Rank Up

- Mastery emblem animates into its new rank.
- Gold or rank-specific effect.
- Display the newly earned rank.

Celebrations must be skippable and must not delay saving results.

---

## I. Animation Timing Standards

| Effect | Duration |
|---|---:|
| Number input | 160–220 ms |
| Wrong placement | 180–250 ms |
| Score popup | 500–700 ms |
| Region clear | 450–550 ms |
| Double Clear | 650 ms |
| Triple Clear | 850 ms |
| Chain activation | 300–400 ms |
| Legendary Chain | 750–1000 ms |
| Puzzle completion | 1000–1600 ms |

Animations must not lock the board during regular gameplay.

Use easing:

- Placement: ease-out / back-out.
- Floating score: ease-out.
- Light sweeps: ease-in-out.
- Particles: ease-out.
- Screen pulse: ease-out.

---

## J. Performance Requirements

Implementation must work on ordinary web browsers without a game engine.

Preferred technologies:

- HTML for interface structure.
- CSS keyframes for simple animations.
- Web Animations API for dynamic effects.
- Web Audio API for short synthesized sounds.
- `requestAnimationFrame` only where needed.

Performance constraints:

- Target 60 FPS on modern devices.
- Animate `transform` and `opacity` wherever possible.
- Avoid repeatedly changing layout-affecting styles.
- Reuse particle DOM nodes where practical.
- Limit simultaneous particles.
- Avoid large full-screen blur effects.
- Cancel animation effects when leaving the game.
- Respect `prefers-reduced-motion`.

Reduced Motion mode must replace movement-heavy animations with static highlights, small fades, or text indicators.

Audio and effects must never change the awarded score, chain rules, or gameplay timing.

---

## K. Event-Driven Implementation

The effects system must be independent from the Sudoku rules and scoring engine.

Suggested event contract:

```js
{
  type: "CHAIN_EXTENDED",
  attemptId: "attempt-123",
  chainId: "chain-456",
  chainType: "BLOCK",
  chainLength: 5,
  effectTier: "SUPER",
  pointsAwarded: 640,
  remainingTimeMs: 2400,
  cell: { row: 4, col: 5 }
}
```

Supported events:

- `NUMBER_PLACED`
- `WRONG_NUMBER`
- `ROW_COMPLETED`
- `COLUMN_COMPLETED`
- `BLOCK_COMPLETED`
- `DOUBLE_CLEAR`
- `TRIPLE_CLEAR`
- `CHAIN_STARTED`
- `CHAIN_EXTENDED`
- `CHAIN_EXPIRED`
- `PUZZLE_COMPLETED`
- `CLEAN_COMPLETION`
- `PERSONAL_BEST`
- `DIFFICULTY_UNLOCKED`
- `MASTERY_RANK_UP`
- `ACHIEVEMENT_UNLOCKED`

The game engine is the source of truth.

The effects layer must never independently infer scoring events by reading the DOM.

---

## L. Final Design Principle

The game should produce increasing satisfaction through:

**Correct Placement → Chain Activation → Chain Escalation → Region Completion → Special Clear → Puzzle Completion**

Each stage provides stronger audiovisual feedback.

However:

- The board stays readable.
- Animations do not interfere with inputs.
- Sound effects remain controlled.
- All effects can be reduced or disabled.
- Scoring stays deterministic.
- Long chains feel exciting without being essential for mastery.

The ultimate goal is a Sudoku game that remains intellectually satisfying while providing the rewarding feedback of a polished arcade game.
