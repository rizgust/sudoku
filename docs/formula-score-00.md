# SUDOKU — Complete Game Rules & Mechanics

**Version:** 1.0  
**Status:** Game Design Specification  
**Genre:** Logic Puzzle / Arcade / Progression  
**Platform:** Web, Mobile, Desktop  
**Primary Goal:** Create a highly replayable Sudoku game combining logical skill, dynamic scoring, meaningful progression, and long-term achievements.

---

# 1. Game Philosophy

Sudoku is fundamentally a logic puzzle. This game adds arcade-style mechanics without replacing the original rules.

The experience is built around five pillars:

1. **Logic:** Every puzzle must be solvable using logical deduction.
2. **Progression:** Players earn access to harder difficulties by demonstrating skill.
3. **Dynamic Scoring:** Correct placements, completed regions, and chains produce different rewards.
4. **Mastery:** Actual puzzle-solving ability is measured separately from arcade score.
5. **Replayability:** Unlimited puzzles, personal records, achievements, and challenges encourage repeated play.

The game must never require fast input to solve a puzzle successfully or advance through the main progression system.

Speed-based mechanics provide optional scoring rewards.

---

# 2. Fundamental Sudoku Rules

## 2.1 Board Structure

Every standard puzzle uses a 9×9 grid containing:

- 9 rows.
- 9 columns.
- 9 blocks of 3×3 cells.
- 81 total cells.
- Digits 1 through 9.

## 2.2 Core Rules

Each digit from 1 through 9 must appear exactly once in:

- Every row.
- Every column.
- Every 3×3 block.

Players must fill all initially empty cells correctly to complete the puzzle.

## 2.3 Fixed Numbers

Numbers provided by the puzzle generator are called **givens**.

Givens:

- Cannot be edited.
- Cannot be deleted.
- Do not earn placement points.
- Do not participate in chain events.
- Are excluded from the number of required player placements.

## 2.4 Puzzle Validity

Every generated puzzle must:

- Have exactly one valid solution.
- Be logically solvable without guessing.
- Match its assigned difficulty classification.
- Pass the game's logical solver validation.
- Receive a unique puzzle identifier.

A puzzle that cannot be classified reliably must not be used for ranked progression or qualifications.

---

# 3. Difficulty System

There are six difficulties.

| Difficulty | Tier | Primary Techniques |
|---|---|---|
| Beginner | 1 | Scanning, naked singles |
| Easy | 2 | Hidden singles, basic elimination |
| Medium | 3 | Locked candidates, pairs |
| Hard | 4 | Advanced candidate interactions, triples |
| Expert | 5 | X-Wing, advanced subsets |
| Master | 6 | Complex chains, advanced fish patterns |

Difficulty must be based primarily on logical solving complexity.

**The number of empty cells alone must never determine puzzle difficulty.**

Each puzzle is graded by a logical solver using:

- Required techniques.
- Hardest necessary technique.
- Number of deduction steps.
- Complexity of deduction sequences.

When multiple solving paths exist, grading must use a consistent, documented solver strategy.

---

# 4. Difficulty Unlock System

## 4.1 Initial Access

A new player begins with:

- Beginner unlocked.
- Easy locked.
- Medium locked.
- Hard locked.
- Expert locked.
- Master locked.

Once unlocked, a difficulty remains available permanently.

## 4.2 Qualification Requirements

| Unlock | Completed | Clean Games | Qualification Passes |
|---|---:|---:|---:|
| Easy | 5 Beginner | 3 | 0 |
| Medium | 10 Easy | 5 | 1 |
| Hard | 15 Medium | 8 | 2 |
| Expert | 20 Hard | 12 | 3 |
| Master | 30 Expert | 20 | 5 |

All requirements apply to the immediately preceding difficulty.

For example, unlocking Hard requires progress earned in Medium.

Requirements are cumulative; they do not need to be completed consecutively.

## 4.3 Clean Game

A clean game requires:

- Zero mistakes.
- Zero hints.
- A successfully completed puzzle.

Auto-fill candidates and manual notes are allowed in ordinary clean games, but may be restricted in specific achievements or qualifications.

## 4.4 Qualification Challenges

Qualification challenges:

- Use the difficulty being tested.
- Must be completed without hints.
- Allow a maximum of one mistake.
- Cannot use auto-fill candidates.
- Do not enforce a completion-time limit.
- Must use unique qualification puzzle IDs.

An unsuccessful qualification attempt may be retried with another puzzle.

Qualification passes are counted separately from ordinary completed games.

The unlock check runs automatically whenever any requirement is satisfied.

## 4.5 Anti-Farming

- Only unique puzzle IDs count toward qualification completion requirements.
- Replaying a previously completed puzzle does not count again.
- Qualification puzzles must not reuse IDs already credited for that qualification.
- Changing modes must not bypass unlock requirements.
- Time Attack, Zen, and Practice do not count toward difficulty unlocks.

---

# 5. Game Modes

## 5.1 Classic Mode

The standard game experience.

Features:

- All unlocked difficulties.
- Full dynamic scoring.
- Placement bonuses.
- Region completion bonuses.
- Chain bonuses.
- Time bonuses.
- Experience points.
- Statistics.
- Mastery progress.
- Achievements.

Classic Mode is the primary progression mode.

## 5.2 Daily Challenge

One designated puzzle per calendar day.

Rules:

- Daily puzzle is shared across players.
- Puzzle ID is associated with the date.
- Difficulty is predefined.
- Players can attempt the daily puzzle regardless of their unlocked Classic difficulties.
- Only the first successful completion earns Daily Challenge progression credit.
- Daily completion does not unlock Classic difficulties.
- Successful completion awards score, XP, and daily achievements.

The date uses a consistent server-defined calendar, initially UTC.

Daily records must identify the relevant date.

## 5.3 Time Attack

A score-focused mode with a completion deadline.

Rules:

- Difficulty must already be unlocked.
- Each difficulty has a configurable deadline.
- Failure to finish before the deadline ends the attempt.
- Dynamic placement, region, and chain scoring are enabled.
- Successful completion awards XP and Time Attack records.
- Time Attack does not contribute to Classic mastery or unlock requirements.

Initial deadlines:

| Difficulty | Deadline |
|---|---:|
| Beginner | 5 minutes |
| Easy | 8 minutes |
| Medium | 12 minutes |
| Hard | 18 minutes |
| Expert | 25 minutes |
| Master | 35 minutes |

## 5.4 Zen Mode

A relaxed experience.

Rules:

- No visible timer by default.
- No completion deadline.
- Hints are available.
- Pausing and resuming are permitted.
- Score multiplier: ×0.5.
- Chain bonuses are disabled.
- Does not contribute to difficulty unlocks.
- Earns reduced XP.
- Tracks Zen-specific statistics.

## 5.5 Practice Mode

An educational mode.

Features:

- Technique-specific exercises.
- Explanations.
- Assisted candidate analysis.
- Guided hints.
- Unlimited retries.

Rules:

- Score multiplier: ×0.
- No competitive leaderboard records.
- No Classic difficulty progression.
- No Classic mastery.
- Can award learning-specific achievements.

---

# 6. Input and Validation Rules

## 6.1 Player Actions

Players may:

- Select an empty cell.
- Enter a digit.
- Remove an entered digit.
- Add or remove candidate notes.
- Undo or redo moves.
- Request hints.
- Pause or resume.
- Enable or disable supported assists.

## 6.2 Correct Placement

A placement is correct when the confirmed digit matches the solution for that cell.

Only correct confirmed placements can:

- Earn placement points.
- Advance chains.
- Complete regions.
- Contribute to completion progress.

## 6.3 Incorrect Placement

A mistake occurs when a player confirms an incorrect digit.

Consequences:

- Mistake counter increases.
- Accuracy multiplier decreases.
- Active chains reset.
- The move earns no points.

Mistakes remain recorded even when the incorrect digit is removed.

A repeated incorrect entry in the same unresolved cell counts as another mistake only if it constitutes a new confirmed submission, not repeated validation of the same unchanged state.

## 6.4 Candidate Notes

Candidate notes:

- Do not earn points.
- Do not trigger chains.
- Do not count as mistakes.
- Do not complete regions.
- Do not count as revealed numbers.

Manual candidate notes do not reduce score.

## 6.5 Auto-Fill Candidates

Using automatic candidate generation activates the Assist penalty for the entire attempt.

Assist multiplier: ×0.8.

Disabling the feature later does not remove the penalty.

## 6.6 Undo and Redo

Undo and redo must not enable point farming.

Rules:

- A cell earns placement points at most once per attempt.
- A region earns its completion bonus at most once per attempt.
- Undo does not reverse recorded mistakes or hint usage.
- Re-entering a previously credited number does not award placement points again.
- Replayed moves cannot generate new chain rewards.

A reverted correct placement may still need to be restored to complete the board, but earns no additional score.

---

# 7. Dynamic Scoring System

## 7.1 Scoring Philosophy

Score is generated by multiple independent events rather than only puzzle completion.

Scoring events:

1. Correct Number Placement.
2. Region Completion.
3. Multiple Region Completion.
4. Chain Reveal.
5. Puzzle Completion.
6. Time Bonus.

Accuracy, hints, assists, and game mode modify the final score.

## 7.2 Final Score Formula

```text
RawScore =
    PlacementPoints
  + RegionBonuses
  + MultiClearBonuses
  + ChainBonuses
  + CompletionBonus
  + TimeBonus

FinalScore = floor(
    RawScore
    × AccuracyMultiplier
    × HintMultiplier
    × AssistMultiplier
    × GuideMultiplier
    × ModeMultiplier
)
```

The score cannot fall below zero.

All scoring calculations use deterministic integer rounding.

The score shown during gameplay is provisional; penalties are applied to the accumulated raw score when displaying the current total.

## 7.3 Placement Points

Each newly confirmed correct number earns points based on its assigned logical difficulty.

| Technique | Points |
|---|---:|
| Naked Single | 50 |
| Hidden Single | 75 |
| Locked Candidates | 100 |
| Naked/Hidden Pair | 125 |
| Advanced subset or comparable deduction | 150 |
| X-Wing / advanced pattern | 175 |
| Advanced logical chains | 200 |

### Technique Classification

A placement must not receive advanced technique points simply because the cell has multiple candidates.

The logical solver must establish the minimum recognized technique required for that placement under its consistent grading procedure.

If the engine cannot reliably establish a technique, the default reward is 50 points.

The game must not award points based on an unverified assumption about the technique the player personally used.

Technique rewards are evaluated against the relevant board state before the placement.

---

# 8. Region Completion Bonuses

Regions are rows, columns, and 3×3 blocks.

## 8.1 Standard Region Rewards

| Event | Bonus |
|---|---:|
| Complete a row | +300 |
| Complete a column | +300 |
| Complete a block | +500 |

Each region can award its completion bonus only once per attempt.

## 8.2 Multiple Region Completion

A single placement can simultaneously complete multiple regions.

| Event | Additional Bonus |
|---|---:|
| Complete 2 regions simultaneously | +200 |
| Complete 3 regions simultaneously | +400 |

Multi-clear bonuses are additional to the ordinary region bonuses.

Only one multi-clear bonus applies to a placement.

Examples:

**Row + Block**

```text
Placement points       +100
Row completion         +300
Block completion       +500
Double clear           +200
---------------------------
Total                 +1100
```

**Row + Column + Block**

```text
Placement points       +100
Row completion         +300
Column completion      +300
Block completion       +500
Triple clear           +400
---------------------------
Total                 +1600
```

Region completion bonuses are applied immediately upon the qualifying placement.

---

# 9. Chain Reveal System

Chain Reveal is an arcade scoring system rewarding sequences of correct placements.

Chains are optional bonuses.

They do not influence:

- Puzzle validity.
- Difficulty classification.
- Classic mastery.
- Qualification requirements.

## 9.1 Chain Types

There are five types.

### A. Time Chain

Trigger:

- Three or more eligible correct placements.
- All placements occur within the active difficulty's chain window.
- No digit or region restriction.

The first qualifying placement starts the chain sequence.

### B. Number Chain

Trigger:

- Three or more eligible correct placements.
- Every placement uses the same digit.
- All occur within the chain window.

Example:

```text
7 → 7 → 7
```

All placements must occur in different cells.

### C. Block Chain

Trigger:

- Three or more eligible correct placements.
- Every placement belongs to the same 3×3 block.
- All occur within the chain window.

Example:

```text
Block 5:
3 → 8 → 1
```

### D. Line Chain

Trigger:

- Three or more eligible correct placements.
- Every placement belongs to the same row OR same column.
- All occur within the chain window.

Row and column chains are tracked independently.

Example:

```text
Row 5:
2 → 4 → 9
```

### E. Hybrid Chain

A Hybrid Chain occurs when a sequence satisfies Time Chain plus at least two distinct additional chain categories.

Examples:

- Time + Number + Line.
- Time + Number + Block.
- Time + Line + Block.

Hybrid is a reward category derived from overlapping chains, rather than a separate input sequence.

---

# 10. Chain Time Windows

Every difficulty has a specific chain window.

| Difficulty | Window | Minimum Placements |
|---|---:|---:|
| Beginner | 60 seconds | 3 |
| Easy | 50 seconds | 3 |
| Medium | 40 seconds | 3 |
| Hard | 30 seconds | 3 |
| Expert | 24 seconds | 3 |
| Master | 20 seconds | 3 |

Scoring rules v2 doubled these windows (v1: 30 / 25 / 20 / 15 / 12 / 10 seconds).

## 10.1 Window Calculation

The window begins at the first placement in the qualifying sequence.

```text
ChainDuration =
    LastPlacementTime
  - FirstPlacementTime
```

The sequence qualifies when:

```text
ChainDuration <= DifficultyWindow
```

The timer does not reset for each placement.

Example:

```text
Hard difficulty: 15 seconds

00:00  Place 3
00:04  Place 8
00:09  Place 1
00:13  Place 7

Result:
4-placement chain within 13 seconds.
```

## 10.2 Sliding Chain Evaluation

To prevent an expired starting placement from blocking future chains, the engine evaluates recent consecutive eligible placements using a sliding time window.

When older placements expire, newer placements may form a different chain.

A chain extension is evaluated against the earliest placement in its currently qualifying sequence.

A sequence must contain at least three placements to qualify.

## 10.3 Chain Interruption

A chain is interrupted when:

- An incorrect number is submitted.
- A hint reveals or supplies a placement.
- A player manually clears a credited placement.
- An undo or redo operation changes the confirmed board.
- The active attempt ends.

Candidate note changes do not interrupt chains.

Pausing gameplay freezes the active game clock and chain timer; a pause cannot be used to perform placements or inspect an interactive board.

---

# 11. Chain Multipliers

## 11.1 Chain Length Multiplier

| Placements | Multiplier |
|---|---:|
| 1–2 | ×1.0 |
| 3 | ×1.3 |
| 4 | ×1.5 |
| 5 | ×1.8 |
| 6 or more | ×2.0 |

Maximum length multiplier: ×2.0.

## 11.2 Chain Type Factor

| Type | Factor |
|---|---:|
| Time | ×1.00 |
| Number | ×1.10 |
| Line | ×1.15 |
| Block | ×1.20 |
| Hybrid | +20% of calculated chain bonus |

When multiple patterns qualify, the engine selects the single strongest non-Hybrid chain type.

Factors do not stack multiplicatively.

## 11.3 Difficulty Chain Bonus Multiplier

| Difficulty | Bonus Multiplier |
|---|---:|
| Beginner | ×1.0 |
| Easy | ×1.2 |
| Medium | ×1.5 |
| Hard | ×2.0 |
| Expert | ×2.5 |
| Master | ×3.0 |

This multiplier affects chain bonus points only.

It does not multiply the underlying placement points or completion bonuses.

## 11.4 Chain Bonus Formula

```text
EligiblePlacementPoints =
    Sum of placement points
    in the qualifying sequence

ChainBonus =
    EligiblePlacementPoints
    × (LengthMultiplier × TypeFactor - 1)
    × DifficultyChainMultiplier
```

For Hybrid Chains:

```text
HybridBonus =
    ChainBonus × 0.20
```

The additional Hybrid bonus is included in the chain bonus total.

## 11.5 Example

Hard difficulty:

- Four placements.
- All within the same block.
- Completed within 13 seconds.
- Each placement worth 100 points.

```text
EligiblePlacementPoints = 400

LengthMultiplier = 1.5
BlockFactor = 1.2
DifficultyMultiplier = 2.0

ChainBonus =
    400 × (1.5 × 1.2 - 1) × 2.0

ChainBonus = 640
```

The four placements already earned 400 base points.

The chain adds 640 bonus points.

Total contribution:

```text
Placement points = 400
Chain bonus      = 640
----------------------
Total            = 1040
```

Region completion rewards are calculated separately.

---

# 12. Chain Scoring Safeguards

## 12.1 Preventing Duplicate Chain Rewards

Each confirmed placement is uniquely identified.

Chain reward calculation uses the incremental difference between the highest previously awarded value and the newly earned chain value.

A chain may be extended, but existing placement points cannot be credited again.

Example:

```text
3 placements → Chain reward 150
4 placements → Total chain value 300

Additional reward = 150
```

This prevents rewarding the entire chain repeatedly.

## 12.2 Overlapping Chains

A placement may qualify for multiple chain patterns.

The system:

1. Evaluates eligible active patterns.
2. Selects the pattern producing the highest valid chain reward.
3. Applies a Hybrid bonus if the sequence qualifies.
4. Awards only the incremental increase in reward.
5. Records the chain type and sequence.

A single qualifying placement sequence cannot be replayed as multiple independent chain payouts.

## 12.3 Chain Bonus Cap

Chain bonuses must not exceed 35% of the final pre-penalty raw score.

Let:

```text
NonChainScore =
    PlacementPoints
  + RegionBonuses
  + MultiClearBonuses
  + CompletionBonus
  + TimeBonus
```

Then:

```text
MaximumChainBonus = floor(
    NonChainScore × 0.35 / 0.65
)

EffectiveChainBonus = min(
    EarnedChainBonus,
    MaximumChainBonus
)
```

This means chain bonuses cannot exceed 35% of total raw score.

During play, the displayed chain bonus is provisional until the final cap can be calculated.

The engine must separately retain earned and effective chain bonuses for accurate statistics.

## 12.4 Anti-Farming

The system must prevent:

- Re-entering the same digit in the same cell for points.
- Undo/redo chain farming.
- Re-completing already credited regions.
- Reusing the same chain sequence for repeated rewards.
- Changing difficulty mid-attempt.
- Changing game mode mid-attempt.

---

# 13. Puzzle Completion Bonus

Each successfully completed puzzle grants a fixed completion bonus.

| Difficulty | Completion Bonus |
|---|---:|
| Beginner | 1,000 |
| Easy | 2,500 |
| Medium | 5,000 |
| Hard | 10,000 |
| Expert | 20,000 |
| Master | 40,000 |

Completion bonuses are independent from placement and region rewards.

They are awarded once per successful attempt.

A failed, abandoned, or unfinished puzzle does not receive the completion bonus.

---

# 14. Time Bonus

## 14.1 Par Times

| Difficulty | Par Time |
|---|---:|
| Beginner | 5 minutes |
| Easy | 8 minutes |
| Medium | 12 minutes |
| Hard | 18 minutes |
| Expert | 25 minutes |
| Master | 35 minutes |

## 14.2 Time Bonus Formula

```text
TimeBonus =
    0.5 × CompletionBonus
    × clamp(
        (2 × ParTime - CompletionTime)
        / (1.5 × ParTime),
        0,
        1
    )
```

Rules:

- Completing in half the par time or less earns the maximum time bonus.
- Completing at twice the par time or slower earns zero time bonus.
- Intermediate times receive proportionally smaller bonuses.
- Time bonus is never negative.

Maximum time bonus is 50% of the completion bonus.

The time bonus is awarded only upon puzzle completion.

---

# 15. Penalty System

## 15.1 Mistakes

```text
AccuracyMultiplier =
    max(0, 1 - 0.10 × Mistakes)
```

Each mistake reduces the scoring multiplier by 10 percentage points.

## 15.2 Hints

```text
HintMultiplier =
    max(0, 1 - 0.20 × HintsUsed)
```

Each hint reduces the multiplier by 20 percentage points.

The hint counter increases when the game provides a solution-specific deduction or revealed answer, not merely when a help panel is opened.

## 15.3 Auto-Fill Candidates

```text
AssistMultiplier =
    0.8 if auto-fill candidates was used
    1.0 otherwise
```

The penalty is applied once per attempt, not once per use.

## 15.3a Guide Lines

Guide lines shade every row and column that already holds the selected digit, which points straight at the cells where it can still go. They count as an assist.

```text
GuideMultiplier =
    0.5 if guide lines were shown during the attempt
    1.0 otherwise
```

Guide lines also halve the speed rewards, so a fast Guided game cannot outscore Pure play on speed alone:

```text
GuidedSpeed = 0.5 if guide lines were shown during the attempt, 1.0 otherwise

TimeBonus'   = floor(TimeBonus × GuidedSpeed)
ChainBonus'  = floor(EarnedChainBonus × GuidedSpeed)
EffectiveChainBonus = min(ChainBonus', MaximumChainBonus)   -- the 35% cap, computed with TimeBonus'
```

Placement, region, multi-clear and completion bonuses are unchanged before the final GuideMultiplier. Chain detection, chain length, the chain indicator and all effects work as usual; only the points are reduced.

Both penalties apply the first time the shading appears and stay for the whole attempt, including chains earned before it; turning the setting off afterwards does not remove them. Qualifications never show guide lines.

Introduced in scoring rules v3 (×0.5); the speed reduction in v4.

## 15.3b Pure and Guided Attempts

An attempt is **Guided** if guide lines or Auto notes were used at any point, otherwise **Pure**; once Guided, it stays Guided. This is a label shown on the result screen and in the history. Placement, region, time and chain rewards apply in both, and personal bests are shared: the assist multipliers keep them comparable. Completed attempts keep the status recorded at the time; older attempts whose assist use cannot be verified are labelled **Legacy**, never assumed Pure. Qualifications require no assists.

## 15.4 Mode Multipliers

| Mode | Multiplier |
|---|---:|
| Classic | ×1.0 |
| Daily Challenge | ×1.0 |
| Time Attack | ×1.0 |
| Zen | ×0.5 |
| Practice | ×0.0 |

Different game modes maintain separate competitive records.

---

# 16. Score Display Rules

## 16.1 Live Score

During gameplay, the game displays the provisional score calculated from events earned so far.

```text
LiveScore =
    floor(
        CurrentRawScore
        × CurrentPenalties
        × ModeMultiplier
    )
```

CurrentRawScore excludes completion and time bonuses until the puzzle is successfully completed.

The live score can decrease following mistakes, hints, or assist activation.

## 16.2 Score Popups

Examples:

```text
+75       Hidden Single
+300      Row Complete
+500      Block Complete
+200      Double Clear
+640      Block Chain!
```

Score animations must not block input.

## 16.3 Chain Visual Feedback

When a chain becomes active, display:

- Chain type.
- Current chain length.
- Time remaining.
- Potential incremental bonus.
- Chain multiplier.

Example:

```text
BLOCK CHAIN ×1.5
4 PLACEMENTS
6.2s REMAINING
```

Effects should remain subtle enough not to obstruct the Sudoku board.

Players may disable score animations and visual effects in settings.

## 16.4 Completion Screen

The final breakdown includes:

- Placement points.
- Region completion points.
- Multi-clear bonuses.
- Chain bonuses.
- Completion bonus.
- Time bonus.
- Mistakes.
- Hints.
- Assist modifier.
- Mode modifier.
- Final score.
- XP earned.
- New personal records.
- Progress toward mastery and achievements.

---

# 17. XP and Player Level

XP is separate from score.

## 17.1 XP Formula

```text
XP = 10 + floor(FinalScore / 100)
```

For successfully completed Classic, Daily Challenge, and Time Attack games.

Zen mode uses its already reduced final score in this formula.

Practice does not earn completion XP.

## 17.2 XP Anti-Farming

- The first successful completion of a puzzle earns full XP.
- Replaying a completed puzzle earns no additional completion XP.
- Failed attempts earn no completion XP.
- Achievements may award additional XP.

## 17.3 Player Level

Player level represents overall activity and progression.

Suggested cumulative XP requirement:

```text
XPRequiredForLevel(L) =
    50 × (L - 1) × L
```

Level 1 begins at 0 XP.

For example:

| Level | Total XP Required |
|---|---:|
| 1 | 0 |
| 2 | 100 |
| 3 | 300 |
| 5 | 1,000 |
| 10 | 4,500 |
| 20 | 19,000 |

Player level does not unlock Sudoku difficulties.

---

# 18. Mastery System

Mastery measures consistency and logical solving ability within each difficulty.

Every difficulty has independent mastery ranks:

1. Unranked.
2. Bronze.
3. Silver.
4. Gold.
5. Platinum.
6. Diamond.

## 18.1 Rank Requirements

Requirements below are cumulative within a single difficulty.

| Rank | Completed | Clean Completions |
|---|---:|---:|
| Bronze | 5 | 5 |
| Silver | 15 | 10 |
| Gold | 30 | 20 |
| Platinum | 60 | 40 |
| Diamond | 100 | 75 |

Additionally:

- Gold requires 1 clean qualification-style assessment.
- Platinum requires 3.
- Diamond requires 5.

These are mastery assessments within the same difficulty, distinct from difficulty-unlock qualifications.

## 18.2 Mastery Rules

Only Classic Mode contributes to mastery.

Mastery does not depend on:

- Arcade score.
- Chain count.
- Speed chains.
- Time Attack records.

Mastery depends on:

- Unique completed puzzles.
- Clean completions.
- Successful mastery assessments.

Mastery ranks do not decrease after being earned.

## 18.3 Difficulty Unlock Versus Mastery Rank

These are independent progression systems.

Example:

A player can unlock Medium while still being Bronze in Easy.

They can return to Easy later to continue earning Silver, Gold, Platinum, or Diamond.

---

# 19. Achievement System

Achievements are permanent accomplishments.

Each achievement has:

- Unique ID.
- Name.
- Description.
- Category.
- Requirements.
- Progress.
- Completion timestamp.
- XP reward.

## 19.1 Achievement Categories

### Completion Achievements

- First puzzle completed.
- 10 puzzles completed.
- 50 puzzles completed.
- 100 puzzles completed.
- 500 puzzles completed.
- 1,000 puzzles completed.

### Difficulty Achievements

- First Easy completion.
- First Medium completion.
- First Hard completion.
- First Expert completion.
- First Master completion.
- Complete 100 Master puzzles cleanly.

### Accuracy Achievements

- First clean game.
- 10 clean games.
- 10 consecutive clean games.
- 50 clean games.
- 100 clean games.

### Chain Achievements

- First Time Chain.
- First Number Chain.
- First Block Chain.
- First Line Chain.
- First Hybrid Chain.
- Reach a 6-placement chain.
- Earn a Triple Clear.
- Complete 100 qualifying chains.

### Speed Achievements

- Finish below par time.
- Finish below half the par time.
- Complete 10 puzzles below par time.
- Complete a Hard puzzle below par time without hints.

### Consistency Achievements

- 3-day play streak.
- 7-day streak.
- 30-day streak.
- 100-day streak.

### Mastery Achievements

- First Bronze rank.
- First Gold rank.
- First Diamond rank.
- Diamond rank in three difficulties.
- Diamond rank in all six difficulties.

### Learning Achievements

- Complete first technique tutorial.
- Complete all Beginner technique tutorials.
- Complete an advanced technique exercise.
- Complete all Practice modules.

### Hidden Achievements

Hidden achievements may reward unusual legitimate accomplishments.

They must not require exploiting scoring rules or performing unintended actions.

## 19.2 Achievement Progress

Achievements should show progress where applicable.

Example:

```text
Master of Logic
72 / 100 Master clean completions
```

Each achievement can be earned only once.

---

# 20. Statistics and Player Records

The system tracks both lifetime and per-difficulty statistics.

## 20.1 General Statistics

- Total puzzles started.
- Total puzzles completed.
- Total puzzles abandoned.
- Total active playtime.
- Total mistakes.
- Total hints.
- Total clean completions.
- Total XP.
- Current level.
- Current streak.
- Longest streak.

## 20.2 Per-Difficulty Statistics

For each difficulty:

- Games started.
- Games completed.
- Completion rate.
- Clean completion rate.
- Average completion time.
- Median completion time.
- Fastest completion.
- Highest score.
- Average score.
- Average mistakes.
- Average hints.
- Total chains.
- Mastery rank.
- Qualification progress.

## 20.3 Chain Statistics

Track:

- Total Time Chains.
- Total Number Chains.
- Total Block Chains.
- Total Line Chains.
- Total Hybrid Chains.
- Longest chain.
- Highest single-chain bonus.
- Total chain bonus points.
- Chain counts by difficulty.

## 20.4 Region Statistics

Track:

- Rows completed.
- Columns completed.
- Blocks completed.
- Double Clears.
- Triple Clears.

## 20.5 Personal Bests

Maintain separate records for:

- Fastest completion by difficulty.
- Highest score by difficulty.
- Highest score by mode.
- Most clean completions.
- Longest clean streak.
- Longest placement chain.
- Highest chain reward.

Records must include the puzzle ID and attempt ID.

---

# 21. Streak Rules

## 21.1 Daily Play Streak

A day counts when the player successfully completes at least one eligible puzzle.

Eligible modes:

- Classic.
- Daily Challenge.
- Time Attack.

Only one completed puzzle is necessary per day.

Multiple completions on the same day do not increase the streak more than once.

Use a consistently stored player timezone for daily streak boundaries.

## 21.2 Clean Completion Streak

A clean completion streak increases after every consecutive clean Classic completion.

It resets when a Classic puzzle is completed with mistakes or hints.

Abandoned and unfinished games do not increase the streak and do not reset it.

## 21.3 Chain Streak

A chain is a within-attempt sequence and is not part of the daily or clean-game streak systems.

Chain streaks reset according to the Chain Reveal rules.

---

# 22. Puzzle Lifecycle

## 22.1 Starting a Puzzle

When a player begins a new puzzle, the system:

1. Validates the selected mode.
2. Confirms the selected difficulty is permitted.
3. Retrieves or generates a valid puzzle.
4. Assigns a unique attempt ID.
5. Initializes timers and scoring.
6. Restores applicable settings.
7. Saves the attempt.

## 22.2 Active Gameplay

During play, the system:

- Validates confirmed placements.
- Records mistakes.
- Tracks hints and assists.
- Awards eligible placement points.
- Detects region completion events.
- Evaluates chain sequences.
- Updates provisional score.
- Autosaves player progress.

## 22.3 Pausing

In modes that support pausing:

- Active gameplay time stops.
- The chain timer stops.
- Input is disabled.
- The interactive board is hidden or covered.
- No scoring events can occur.

Time Attack cannot be paused during an active timed challenge.

## 22.4 Successful Completion

A puzzle is completed when:

- All 81 cells contain their correct digit.
- Every row, column, and block is valid.
- No cells remain unresolved.

Completion processing:

1. Validate final board.
2. Award any final region events.
3. Award completion bonus.
4. Calculate time bonus.
5. Apply chain bonus cap.
6. Apply penalties.
7. Calculate final score.
8. Award eligible XP.
9. Update mastery and unlock progress.
10. Update achievements.
11. Update statistics and records.
12. Mark attempt as completed.

Completion must be processed atomically to prevent duplicate rewards.

## 22.5 Abandoning

An abandoned puzzle:

- Does not award completion XP.
- Does not award a completion bonus.
- Does not count toward difficulty progression.
- Does not count as a completed game.
- Is retained in attempt history.

Its incomplete provisional score is not eligible for competitive records.

---

# 23. Puzzle Generation and Replayability

## 23.1 Unlimited Puzzles

The game should support a large supply of puzzles across all six difficulties.

Generation requirements:

- Unique solution.
- Logical solvability.
- Valid technique classification.
- Consistent difficulty grading.
- Unique puzzle ID.
- Duplicate detection.

## 23.2 Puzzle Repetition

The system should avoid offering recently completed puzzles when generating a new Classic attempt.

Replays are allowed through history or explicit replay features.

However, previously completed puzzle IDs cannot repeatedly grant full progression or XP rewards.

## 23.3 Puzzle Identity

Puzzle IDs should be derived from a canonical representation of the initial puzzle, ensuring that equivalent initial boards are recognized as the same puzzle where applicable.

The generated puzzle definition should remain immutable once an attempt starts.

---

# 24. Fairness and Competitive Integrity

## 24.1 Separate Competitive Records

Maintain separate leaderboards or personal records for:

- Difficulty.
- Game mode.
- Assist-enabled versus standard play, where appropriate.

Raw scores across different difficulties should not be treated as directly comparable.

## 24.2 Mastery Integrity

Arcade-oriented mechanics must never determine mastery advancement.

Players who solve puzzles slowly but accurately must be able to achieve the highest mastery ranks.

## 24.3 Timing Integrity

Use monotonic elapsed-time measurement when available.

Avoid relying solely on client wall-clock timestamps.

For competitive online modes, validate timing and attempt state against trusted server data.

## 24.4 Score Integrity

Every score must be reproducible from recorded gameplay events and versioned scoring rules.

Store the scoring rules version on each completed attempt.

If game balance changes in a later version, previously finalized scores must remain historically reproducible.

## 24.5 Anti-Cheat

For competitive online play:

- Validate puzzle completion server-side.
- Validate impossible placement sequences.
- Detect manipulated attempt data.
- Prevent duplicate reward submissions.
- Protect achievement and progression records.
- Use idempotent completion processing.

A locally played offline game may retain provisional results until synchronized and validated.

---

# 25. Settings and Accessibility

Players should be able to configure:

- Light or dark theme.
- Number highlighting.
- Same-number highlighting.
- Candidate display.
- Auto-fill candidates.
- Mistake highlighting.
- Sound effects.
- Haptic feedback.
- Score animations.
- Chain notifications.
- Reduced motion.
- Color-blind-friendly indicators.
- Keyboard input.
- Touch input.
- Timer visibility where allowed.

Gameplay assists that affect scoring must be clearly identified before activation.

Accessibility settings such as reduced motion and color adjustments must not create score penalties.

---

# 26. UI and Feedback Rules

The interface should prominently display:

- Current difficulty.
- Elapsed time where applicable.
- Mistakes.
- Hints.
- Live score.
- Active chains.
- Board.
- Candidate notes.
- Input controls.

When a special event occurs, display concise feedback.

Examples:

```text
+75 HIDDEN SINGLE

+500 BLOCK COMPLETE

+640 BLOCK CHAIN ×1.5

+400 TRIPLE CLEAR

NEW PERSONAL BEST!

HARD QUALIFICATION COMPLETE
```

Progression and achievements should be available from the main menu.

The board must remain the primary visual focus.

Feedback animations must not obstruct gameplay or delay player input.

---

# 27. Final Gameplay Loop

```text
START GAME
    ↓
SELECT GAME MODE
    ↓
SELECT DIFFICULTY
    ↓
GENERATE / LOAD PUZZLE
    ↓
SOLVE PUZZLE
    │
    ├── Correct Placement
    │       ├── Placement Points
    │       ├── Region Detection
    │       ├── Multi-Clear Detection
    │       └── Chain Detection
    │
    ├── Incorrect Placement
    │       ├── Record Mistake
    │       ├── Apply Penalty
    │       └── Reset Active Chains
    │
    ├── Hint / Assist
    │       └── Apply Appropriate Rules
    │
    └── Continue Until Complete
                ↓
          FINAL VALIDATION
                ↓
          COMPLETION BONUS
                ↓
             TIME BONUS
                ↓
           CHAIN BONUS CAP
                ↓
             PENALTIES
                ↓
            FINAL SCORE
                ↓
          XP + STATISTICS
                ↓
        MASTERY + ACHIEVEMENTS
                ↓
         DIFFICULTY UNLOCK
                ↓
           NEXT PUZZLE
```

---

# 28. Design Principles and Balancing Constraints

The following principles must remain consistent even if numerical values change.

1. **Logic comes first.** Scoring mechanics must never alter Sudoku's fundamental validity rules.

2. **Speed is optional.** Chain and time bonuses reward faster play, but cannot block core progression.

3. **Scores are event-driven.** Correct placements and accomplishments award points immediately.

4. **No duplicated rewards.** Placement, region, and chain events must be credited only according to their distinct rules.

5. **Mastery is skill-based.** Arcade score and speed cannot replace clean-completion and qualification requirements.

6. **Higher difficulty offers greater rewards.** More challenging puzzles receive larger completion and chain bonuses.

7. **Chain bonuses remain bounded.** The maximum chain contribution is 35% of raw score.

8. **Statistics are reconstructible.** Completed attempt records must preserve enough data to reproduce historical results.

9. **Every difficulty remains replayable.** Players can continue earning mastery ranks and achievements after unlocking higher levels.

10. **The game should feel rewarding without requiring artificial grinding.** Progression thresholds, XP, and scoring values should be adjustable through balancing configuration.

---

# 29. Configuration and Versioning

Numerical balancing values should be stored as configurable rules rather than scattered constants.

Suggested configuration groups:

```text
difficulty
  - technique thresholds
  - par times
  - completion bonuses
  - chain windows
  - chain difficulty multipliers

scoring
  - placement rewards
  - region bonuses
  - multi-clear bonuses
  - chain length multipliers
  - chain type factors
  - hybrid bonus
  - chain cap
  - mistake penalty
  - hint penalty
  - assist multiplier
  - mode multipliers

progression
  - difficulty unlock requirements
  - mastery requirements
  - qualification requirements
  - XP formula
  - level thresholds

achievements
  - achievement definitions
  - rewards
  - counters
```

Every game result must reference the rule configuration version used when it was completed.

---

# 30. Release Priorities

## Phase 1 — Core

- Puzzle generation and validation.
- All six difficulties.
- Classic Mode.
- Correct placement and mistake tracking.
- Candidate notes.
- Hint system.
- Autosave and resume.
- Dynamic scoring.
- Region clear bonuses.
- Time bonus.

## Phase 2 — Progression

- Difficulty unlocks.
- Qualification challenges.
- Mastery ranks.
- XP and levels.
- Statistics.
- Achievements.

## Phase 3 — Arcade Mechanics

- Time Chains.
- Number Chains.
- Block Chains.
- Line Chains.
- Hybrid Chains.
- Chain animations.
- Chain statistics.
- Scoring balance adjustments.

## Phase 4 — Additional Modes

- Daily Challenge.
- Time Attack.
- Zen Mode.
- Practice Mode.
- Mode-specific records.

## Phase 5 — Long-Term Replayability

- Expanded achievements.
- Competitive leaderboards.
- Advanced performance analytics.
- Additional challenges.
- Optional seasonal content.

---

# Final Design Summary

This Sudoku game combines three complementary systems:

**Logical Puzzle System**

The original Sudoku rules, puzzle generation, logical grading, and solving techniques.

**Arcade Scoring System**

Number reveals, completion bonuses, region clears, chain combinations, difficulty multipliers, and time-based rewards.

**Progression System**

Experience, player levels, difficulty qualification, mastery ranks, statistics, and achievements.

These systems should interact but remain logically independent.

A player who enjoys fast arcade-style play can pursue high scores and impressive chains.

A player who enjoys careful logical solving can pursue clean completions, advanced difficulties, and mastery ranks.

Both playstyles should feel valid, rewarding, and worth returning to.

**End of Game Rules & Mechanics Specification v1.0**
