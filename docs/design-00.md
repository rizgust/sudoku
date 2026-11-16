# **Sudoku — Game Design Concept**

Let's design Sudoku as a **highly replayable, progression-based puzzle game**, rather than a traditional Sudoku app where players simply select a difficulty and solve puzzles.

The core idea is simple:

**Every puzzle contributes to your progression. Every difficulty must be earned. Every achievement reflects actual skill.**

The game should encourage players to keep playing through scores, mastery, statistics, achievements, and increasingly difficult challenges.

## **1. Core gameplay loop**

**Select unlocked difficulty**

Choose a new Sudoku puzzle

**Solve the puzzle**

Time, mistakes, hints and assists are tracked

**Earn score and progression**

Gain XP, improve records, unlock achievements

**Unlock harder challenges**

Prove your mastery before advancing

Repeat with fresh puzzles and new goals

## **2. Difficulty progression**

Six grades, each with a distinct identity. Only Beginner is unlocked initially.

**Beginner**

Tier 1

Basic elimination, row/column scanning, and singles

&#x20;Unlocked by default

**Easy**

Tier 2

Singles and straightforward candidate elimination

&#x20;Complete Beginner qualification

**Medium**

Tier 3

Locked candidates, pairs, and more involved deductions

&#x20;Complete Easy qualification

**Hard**

Tier 4

Advanced candidate interactions and multi-step logic

&#x20;Complete Medium qualification

**Expert**

Tier 5

X-Wing, complex subsets and advanced deductions

&#x20;Complete Hard qualification

**Master**

Tier 6

Complex chains, advanced fish patterns and challenging combinations

&#x20;Complete Expert qualification

**Important:** Difficulty should be determined by the logical techniques required to solve a puzzle, not simply the number of empty cells. A puzzle generator should use a logical solver to validate and grade each puzzle.

## **3. Unlocking higher difficulties**

I recommend a combination of **experience, consistency, accuracy, and skill verification**. Repeating an easy puzzle hundreds of times should not automatically unlock Master.

| Unlock | Qualification requirements                                  |
| ------ | ----------------------------------------------------------- |
| Easy   | Complete 5 Beginner puzzles, at least 3 clean               |
| Medium | Complete 10 Easy puzzles, 5 clean, pass 1 qualification     |
| Hard   | Complete 15 Medium puzzles, 8 clean, pass 2 qualifications  |
| Expert | Complete 20 Hard puzzles, 12 clean, pass 3 qualifications   |
| Master | Complete 30 Expert puzzles, 20 clean, pass 5 qualifications |

A *clean* solve means no incorrect entries and no hints. Qualification puzzles are special challenges that must be completed without hints and with no more than one mistake.

Qualification requirements are cumulative within the relevant tier. Completing extra puzzles after qualification is fine, and unlocked difficulties remain unlocked permanently.

### **Interactive progression simulator**

**Unlock simulator**

In progress

Target difficultyHard

Qualification progress

**56%**

Puzzles completed

8 / 15

Clean completions

5 / 8

Qualification passes

1 / 2

Sample requirements for a player progressing from Medium to Hard.

## **4. Scoring system**

Separate **Score**, **XP**, and **Mastery** so that they serve different purposes.

- **Score:** Measures performance on an individual puzzle.
- **XP:** Measures lifetime activity and overall player level.
- **Mastery:** Measures skill within each difficulty.

### **Proposed scoring formula**

\\[ \text{Score} = \max(0, (B+T)\times A \times H \times S) \\]

Where:

| Factor | Meaning                                                      |
| ------ | ------------------------------------------------------------ |
| B      | Base score by difficulty                                     |
| T      | Time bonus, up to 50% of base score                          |
| A      | Accuracy multiplier, minus 10% per mistake                   |
| H      | Hint multiplier, minus 20% per hint                          |
| S      | Assist multiplier, 1.0 standard or 0.8 with advanced assists |

Base scores:

Beginner

## **100**

Easy

## **250**

Medium

## **500**

Hard

## **1,000**

Expert

## **2,000**

Master

## **4,000**

### **Try the scoring calculator**

DifficultyBeginner

Completion time

10 min

Mistakes**0**

Hints**0**

Advanced assists enabled

ESTIMATED PUZZLE SCORE

# **100 pts**

Base points

100

Time bonus

+0

Accuracy, hints and assist multipliers

1.00×

The example numbers are starting values for balancing, not final limits.

**Anti-farming design:** XP is awarded for each legitimate completion, but only unique puzzle IDs qualify for full progression credit. Replaying the same puzzle should not repeatedly generate mastery progress. Also, scores should be compared within difficulty, rather than having a single global leaderboard dominated by Master puzzles.

## **5. Player statistics**

This should be one of the main attractions of the game. Players should be able to see their actual improvement over time.

## **Player Statistics**

Illustrative profile

Level 18

# **247**

Puzzles completed

# **84.6%**

Win rate

# **32**

Perfect games

# **12 days**

Longest streak

**Performance by difficulty**

0255075100BeginnerEasyMediumHardExpertMaster

Illustrative completion counts

**Solve time improvement**

9 min12 min15 min18 min21 minW1W2W3W4W5W6

Illustrative average minutes per puzzle

I would track these statistics at both **global level and per-difficulty level**.

| Category    | Statistics                                               |
| ----------- | -------------------------------------------------------- |
| Activity    | Played, completed, abandoned, streaks, total playtime    |
| Performance | Win rate, completion time, personal best, average time   |
| Accuracy    | Mistakes, clean games, hint usage, mistake rate          |
| Progression | XP, level, mastery, qualifications, unlocked tiers       |
| Skill       | Techniques used, technique-specific success, improvement |
| History     | Every puzzle attempt, score, date, duration, result      |

One valuable feature is a **personal improvement chart**: for example, "Your average Hard completion time dropped from 23 to 16 minutes over the last 30 puzzles."

## **6. Achievement system**

Achievements should reward a combination of persistence, skill, improvement, and milestones.

+50 XP

**First Steps**

Complete your first puzzle

+300 XP

**Perfectionist**

10 clean games in a row

+200 XP

**On Fire**

7-day playing streak

+250 XP

**Speed Demon**

Complete 10 puzzles below par time

+500 XP

**Logical Thinker**

Complete 50 Hard puzzles

+2000 XP

**Sudoku Grandmaster**

Complete 100 Master puzzles cleanly

We can expand this with achievement collections:

- **Milestone achievements:** 10, 100, 500, 1,000 completed puzzles.
- **Difficulty achievements:** First Expert clear, 100 Master clears.
- **Consistency achievements:** 7, 30, 100-day streaks.
- **Skill achievements:** Complete puzzles using no hints, zero mistakes, advanced techniques.
- **Hidden achievements:** Discoverable rewards for unusual challenges.

Achievement progress should always be visible, such as `72 / 100 Master puzzles`, with rewards for completion.

## **7. Designing for long-term replayability**

Unlocking Master shouldn't mean reaching the end of the game.

I would introduce four ongoing systems:

**Daily Challenge**

Everyone gets the same daily puzzle. Track personal bests, completion streaks, and daily performance. A missed day shouldn't wipe out permanent progress.

**Mastery Ranks**

After unlocking a difficulty, advance through Bronze, Silver, Gold, Platinum, and Diamond ranks within that tier. Each rank has increasingly demanding clean-completion challenges.

**Personal Records**

Track best time, highest score, longest clean streak, and lifetime accomplishments. Players can compete against their previous performance even without online leaderboards.

**Unlimited Procedural Puzzles**

Generate a fresh, uniquely identifiable puzzle for each play session. Verify a unique solution, grade it using logical techniques, and avoid recent repeats.

## **8. Game modes**

| Mode            | Purpose                                | Progression                    |
| --------------- | -------------------------------------- | ------------------------------ |
| Classic         | Unlimited puzzles, selected difficulty | Full                           |
| Qualification   | Prove readiness for next difficulty    | Unlocks                        |
| Daily Challenge | One shared puzzle every day            | Achievements, XP               |
| Time Attack     | Race against a par time                | Separate records               |
| Zen             | No timer pressure, relaxed solving     | Reduced score, normal practice |
| Practice        | Learn specific Sudoku techniques       | Learning achievements          |

I would ship Classic, Qualification, and Daily Challenge first, then add the others.

## **9. Game integrity and technical rules**

To make the progression meaningful, a few things are essential:

**Puzzle generation:** Generate Sudoku boards with exactly one solution. Evaluate them using a human-style logical solver. Assign difficulty based on the hardest required techniques and the overall reasoning complexity, then reject puzzles outside the selected tier.

**Hint system:** Provide useful explanations, not just reveal random cells. For example, explain why a particular candidate is eliminated. Hints should affect competitive scoring and clean-clear eligibility.

**Persistence:** Autosave each move and support resuming sessions. Active elapsed time should be tracked separately from time spent away from the game.

**Mistake handling:** Count an error only when a confirmed digit conflicts with the solution; candidate notes should not count as mistakes. For regular gameplay, consider allowing unlimited corrections but reducing score.

**Fairness:** Fix starting clues during a session, track puzzle IDs, and give qualification puzzles consistent rules. Competitive records should use a fixed assist profile.

**Statistics integrity:** Store results per attempt, with puzzle ID, logical rating, timestamp, score components, hint count, mistake count, elapsed time, and completion status. Calculate summaries from the history so they can be rebuilt.

## **10. Suggested screen structure**

**SUDOKU**

12

Lv. 18

CURRENT RANK

**Hard · Silver**

68% toward Hard Gold

**Continue Game**

Medium · In progress

**Daily Challenge**

Today's puzzle

**Statistics**

Progress and records

**Achievements**

Awards and milestones

**Select Difficulty**

Beginner

Easy

Medium

Hard

Expert

Master

Conceptual home screen, not a playable game

## **11. Recommended initial release**

I would avoid building every possible feature immediately. The strongest first version is:

1. A reliable Sudoku engine covering all six difficulty grades.
2. Unlimited puzzles with autosave, notes, undo, hints, and mistake tracking.
3. Qualification-based difficulty unlocks.
4. Score, XP, and per-difficulty mastery.
5. Comprehensive player statistics and puzzle history.
6. Approximately 30–50 achievements.
7. Daily Challenge and personal records.

**My main design recommendation:** Make *mastery* the central progression mechanic rather than XP alone. XP rewards commitment, but mastery and qualification demonstrate that the player is genuinely improving at Sudoku.

That distinction will make progressing from Beginner all the way to Master feel earned, while still giving players reasons to return after reaching the highest difficulty.

The next design decision is whether this should be a **minimalist Sudoku app with deep progression systems**, or a more game-like experience with ranks, seasons, collectible rewards, and competitive features.