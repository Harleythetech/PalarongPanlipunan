# Panelist Feedback — Implementation Plan & Delivery Record

**Project:** Palarong Panlipunan (RPG Maker MV 1.6.1)
**Source:** Capstone panel comments, 26 Nov 2026
**Budget:** ~9 hours, 1 developer
**Baseline:** `21885e1` (clean tree, pushed to `main`)
**Work branch:** `panel-feedback` (tag `pre-panel-fixes` at the baseline)

> **Status: implemented and machine-verified.** Two Node harnesses exercise the
> new code against a stubbed MV runtime and against the real troop data.
> In-engine visual checks are listed in §9 and still need a human playtest.

---

## 0. Locked decisions

| # | Decision |
|---|---|
| 1 | **The quiz decides the battle.** Inherited behaviour already does this: every correct answer runs `Change Enemy HP −100` and every enemy has 100 HP, so a correct answer ends the fight. No new threshold was added — a stricter pass mark would have made the game harder than it is today. |
| 2 | **Support rank, not literal unlock.** Arkin stays in the party from Chapter 1; his full support awakens at **100 Candy Points**. |
| 3 | **Treasure hunt + matching** are the two mini-games — both deferred past the deadline (§10). |
| 4 | **1 person, one night.** Must-list frozen. |

---

## 1. The one architectural rule

> **`data/Troops.json` is never written.**

The original plan was to migrate all 33 questions into a data file and replace
every troop page. Inspection killed that idea:

- Every question block is chained by **`Jump to Label Q{n}`** inside *every*
  answer branch.
- The hint branch **jumps back to its own label**.
- The last block's normal branches **fall through** instead of jumping.
- A wrong `answer` index would teach students the wrong thing — the one failure
  an educational game cannot ship.

So the shuffler transforms the **runtime copy** of the page at
`BattleManager.setup`, validates it, and falls back to the original order on any
mismatch. The file on disk is untouched (verified byte-identical to `21885e1`).

### Why it is safe by construction

| Concern | Why it cannot happen |
|---|---|
| Corrupt `Troops.json` | Never opened for writing |
| Soft-locked battle | Structural validator runs before *and* after; per-troop fallback |
| Correct answer marked wrong | Choice text and its branch body move as one unit and are never re-indexed separately |
| Hint option lost | The hint choice is pinned to the last slot and excluded from the shuffle |
| Retry repeats | Permutation is re-drawn from a pristine cached copy each battle |
| New bug in production | `QuizShuffle_Disabled` (S30) restores stock behaviour |

---

## 2. Audit — corrected findings

| Panel comment | Existed? | Reality found in code |
|---|---|---|
| Reshuffle questions | Fixed order | Troops 1–6 hold 33 questions (3/3/7/6/7/7) in labelled blocks |
| Mini-games / interactivity | No | `MapGen`, `NavArrow`, `MissionTracker`, `VirtualGamepad` exist; no game scene |
| Other answer styles | No | 4-option multiple choice only |
| Feedback | Text only | No SFX, flash, score pop, explanation or summary |
| Candy / points | Stub | Item 6 was blank; drops from enemies 5/7/8/9; no counter or use |
| Arkin health / support | Visual only | `BattleHUD` drew his HP; the quiz never touched it |

### Defects fixed

| ID | Defect | Evidence | Fix |
|---|---|---|---|
| B1 | Battle score clobbered story counters | `BattleHUD` used variable **1** (`Conversation_Count`) and **2** (`Material_Count`) and zeroed both on battle start | Repointed to V3/V4 |
| B2 | Hints limited to 2 for the whole game | `Hint_Count` (V15) was set once (tutorial) and only ever decremented | Refilled per battle from Arkin's rank; gate now actually works |
| B3 | Invisible battle commands | `BattleHUD` hides party/actor/status windows | A failed quiz no longer drops the player into that state (§4.3) |
| B4 | Quiz did not clearly decide the fight | — | Confirmed it already does (100 damage vs 100 HP); documented instead of rebalanced |
| B5 | Candy was a blank item | icon 0, empty description, no effect | Icon, description, non-consumable, `<CandyPoint:10>` |

> Earlier drafts claimed hints were "always available". Wrong. The gate is
> `If V15 > 0` (comparison 3 = greater-than) and the decrement is `−1`, so the
> gate works. The real bug was that V15 was only ever set **once**, so the whole
> playthrough shared two hints.

---

## 3. What shipped

| # | Panel comment | Delivered |
|---|---|---|
| 1 | Reshuffle questions | In-memory block permutation **and** answer-option shuffle, re-drawn every battle |
| 4 | Feedback system | SFX + screen flash/shake + floating score + Arkin reaction line + live tally on the HUD |
| 5 | Candy points | One **Candy Points** currency, earning rules, rank unlock at 100, counter in battle **and** on the map |
| 6 | Arkin health / support | 0–100 support gauge, ranks 1–4, hint charges, exhausted state, per-battle recovery |
| 3 | Another answer style | Answer-position shuffle (choices presented in a different order each time) |

Deferred: treasure hunt, matching mini-game, ordering puzzle, candy shop,
question-pool expansion (§10).

---

## 4. Implementation

### 4.1 `js/plugins/PalSupport.js` (new)

Hooks the commands **already present** in all 33 question branches, so feedback,
points and support work with **zero event edits**:

| Existing command | Intercept | Result |
|---|---|---|
| `PalBattleHUD score add 1` | correct | +10 points, streak, support +5, green flash, `Item3` SE, `+10` pop |
| `PalBattleHUD enemyscore add 1` | wrong | support −15, streak reset, red flash + shake, `Buzzer1` SE, `−15` pop |
| `PalSupport hint` *(injected at runtime)* | hint | −10 points, −10 support, one charge spent |
| `PalSupport quizdone <n>` *(injected at runtime)* | quiz end | resolves the battle |

Only `… add` is intercepted — `score set` and other subcommands are ignored.

**Earning table**

| Action | Candy Points | Support |
|---|---:|---:|
| Correct answer | +10 | +5 |
| Every 3rd consecutive correct | +5 bonus | — |
| Wrong answer | 0 | −15 |
| Hint | −10 | −10 |
| Candy item | +10 | — |

**Support ranks**

| Rank | Points | Support HP | Hints / battle | Perk |
|---|---:|---:|---:|---|
| 1 Kasama | 0 | 100 | 2 | baseline |
| 2 Gabay | **100** | 120 | 3 | — |
| 3 Sandigan | 250 | 150 | 4 | — |
| 4 Katuwang | 500 | 200 | 5 | — |

Support is a **separate gauge**, not Arkin's combat HP: enemy attacks then cannot
muddy the signal of quiz performance. At 0 the card reads `WALA`, hints are
cleared, and `Arkin_Support_Lost` (S23) turns on. At the next battle he returns
with 25.

**HUD:** a card under the right-hand party panel — `ARKIN · <RANK>`, support
gauge, `Pahiwatig n/N`, `Kendi <points>`, and a `Tama / Mali / %` tally.

### 4.2 `js/plugins/PalQuiz.js` (new)

1. Split the page at indent-0 labels into question blocks.
2. Validate the original chain.
3. Permute block bodies and rewrite **each block's own label** plus every
   `Jump to Label`.
4. Shuffle answer options; the hint option stays last; each branch moves with
   its own choice text.
5. Strip any `Game Over` (353) command from the runtime copy only.
6. Remove ordinal filler (`Ikalawang katanungan.`, `Huling tanong.`,
   `Fanatio:" Para naman sa pangalawang tanong.`) so a moved block never lies
   about its position. Real questions that merely mention an ordinal are kept.
7. Append `PalSupport quizdone <n>`.
8. Validate again; any mismatch returns the original list untouched.

### 4.3 Battle outcome (the safe part)

- **Pass** (enemy already dead from its own `−100 HP` command): nothing is
  changed. The engine's normal victory path runs the existing `If Win` branch.
- **Fail** (enemy alive ⇒ no correct answers): the party is knocked out so the
  engine runs its **normal defeat path** — defeat ME, defeat message, actor
  collapse — which fires the existing `If Lose` branch (Arkin: "magbasa muna
  tayo ng mga tala…"). The `endBattle` hook then restores the party, because the
  engine only revives to 1 HP and those `If Lose` branches never heal.

> **The `Game Over` trap.** `Troops.json` troop 1 has two `Game Over` event
> commands (L125/L132) on the *final* question's wrong answers. They fire
> **before** the injected `quizdone`, so answering the last question wrong
> hard-reset the run to the title screen and the `If Lose` branch could never
> run. PalQuiz strips command `353` from the **runtime copy only** (switch
> `softenGameOver`, default on). `data/Troops.json` is still byte-identical to
> `21885e1`.

This is strictly better than before: no invisible-command-window state, no dead
party on the map, and no change to the win condition.

### 4.4 Map HUD

`Window_MapCompanionHUD` now shows `Kendi <points>` on the name row and
`<Rank> HP` above Arkin's gauge, refreshing when points or rank change. No window
resize, so the mobile layout is unchanged.

---

## 5. Data changes (append-only)

| ID | Name | Owner |
|---|---|---|
| V3 | `Battle_Player_Score` | BattleHUD |
| V4 | `Battle_Enemy_Score` | BattleHUD |
| V5 | `Candy_Points` | PalSupport |
| V6 | `Quiz_Correct` | PalSupport |
| V7 | `Quiz_Wrong` | PalSupport |
| V8 | `Arkin_Support_HP` | PalSupport |
| V9 | `Arkin_Support_Rank` | PalSupport |
| V10 | `Quiz_Streak` | PalSupport |
| V11 | `Hint_Charges` | PalSupport |
| V12 | `Quiz_Accuracy` | PalSupport |
| S23 | `Arkin_Support_Lost` | PalSupport |
| S30 | `QuizShuffle_Disabled` | PalQuiz (ON = off) |
| S31 | `PalSupport_Disabled` | PalSupport (ON = off) |

V1 `Conversation_Count`, V2 `Material_Count` and V15 `Hint_Count` keep their
story roles. V15 is refilled at each battle by PalSupport and mirrors V11, so the
existing `If V15 > 0` gate limits hints correctly.

Kill switches are **default OFF = features ON**, so a fresh save and the demo
build work with no setup. Setting either ON reproduces pre-panel behaviour.

Item 6 (`candy`): icon 87, Filipino description, non-consumable, `occasion: 3`
(cannot be wasted), note `<CandyPoint:10>`.

---

## 6. Files

| File | Change |
|---|---|
| `js/plugins/PalSupport.js` | **new** — feedback, points, support, ranks, outcome |
| `js/plugins/PalQuiz.js` | **new** — in-memory shuffle + validation |
| `js/plugins/MapStatusWindow_Reworked.js` | candy counter + rank label |
| `js/plugins.js` | BattleHUD score vars `1/2 → 3/4`; register the two plugins after BattleHUD |
| `data/Items.json` | item 6 metadata (one line changed) |
| `data/System.json` | V3–V12, S23/S30/S31 names |
| `data/Troops.json` | **unchanged, byte-identical to `21885e1`** |
| `tools/verify_shuffle.js` | **new** — 3 000-permutation fuzz over the real troop data |
| `tools/simulate_support.js` | **new** — headless MV runtime scenario tests |
| `data/_backup/*` | inert pre-panel snapshots (`DataManager` only reads `data/<Name>.json`) |

---

## 7. Verification

```bash
node tools/verify_shuffle.js 500     # 3000 permutations, 0 failures
node tools/simulate_support.js       # ALL CHECKS PASSED
```

`verify_shuffle.js` proves, for every permutation of every troop:

- choice / when / end-choice counts unchanged
- correct and wrong score-command counts unchanged
- **each choice text still points at its own answer branch**
- every `Jump to Label` resolves, chain visits every question exactly once
- hint option stays last; hint blocks gain/lose none
- `quizdone` present exactly once

`simulate_support.js` proves:

- new game starts at **100** support (not 0/25)
- 3 correct = 35 points (streak bonus included), accuracy 100 %
- 100 points → rank 2, support cap 120
- 7 wrong → support 0, lost switch on, hints cleared
- next battle → 25 support, hints refilled
- hint costs 10 points + 10 support
- won quiz leaves the party alone; failed quiz knocks them out and the
  `endBattle` hook restores them
- candy adds 10 points each
- kill switch suppresses everything
- `BattleManager.setup` rewrites the page **in memory only**; `Troops.json`
  on disk is unchanged
- `Conversation_Count` / `Material_Count` are never touched

---

## 8. Rollback

```bash
git checkout main                  # abandon everything
git revert <commit>                # undo one step

# disable at runtime without a rebuild
# S30 ON  = no shuffling
# S31 ON  = no points/support/feedback
```

`Troops.json` needs no backup — it is never modified.

---

## 9. Manual QA still required (in-engine)

These need the actual game window; the harness cannot render or read input.

1. New game → tutorial battle: questions appear in a new order, choices in new
   positions; `Item3` + green flash + `+10` pop on a correct answer.
2. Each of the six bosses: completes, card shows `Kendi`, support gauge, tally.
3. Replay a boss three times → three different orders; no repeats inside one run.
4. Answer everything wrong → `KULANG PA`, Arkin's "magbasa muna tayo" line, and
   the party is alive on the map afterwards.
5. Lose seven answers' worth of support → card reads `WALA`, the hint option
   refuses ("Naubos na ang aking mga tala").
6. Reach 100 points → rank badge flips to `GABAY`.
7. Save mid-chapter, reload → points, rank, support, hints intact.
8. Load an **old** save (`save/file1.rpgsave`) → no crash, support initialises
   to full on the next battle.
9. Mobile scale 1.4: card and map counter do not overlap other HUD elements.
10. Confirm `Troops.json` is still byte-identical: `git diff 21885e1 -- data/Troops.json`.

Watch specifically for: the support card rendering on top of a sprite, and the
`Kendi N` label width on the companion window in Filipino.

---

## 10. Deferred (post-deadline)

| Feature | Notes |
|---|---|
| **Treasure hunt** | 5 clue NPCs on an existing map; reuses `MissionTracker` `CM` + `NavArrow`; each clue behind a self-switch so it cannot be farmed. Event-only, zero engine risk. |
| **Matching mini-game** | 8 pairs / 60 s, `Scene_PalMatch`; +2 per pair, +20 perfect. |
| **Ordering puzzle** | Arrange a timeline; third priority. |
| **Candy shop** | Extra hint 10 / heal 20 / revive 50 / cosmetic 100; needs `Scene_PalCandyShop` (the default shop only takes gold). |
| **Question pools** | Each topic needs 15–20 questions with explanations before shuffling feels varied long-term. Tonight the 33 existing questions simply change order, which already satisfies the comment. |
| **Fanatio hint option** | Troop 2 has no "Humingi ng Pahiwatig" choice at all (all other battles do). Adding one is a content edit to `Troops.json`, deliberately out of scope for a night where that file must not change. |
| **Balance** | One correct answer kills a 100-HP enemy, so the quiz is all-or-nothing. Tuning (more enemy HP, or less damage per correct answer) needs playtesting with students; not a 4 a.m. change. |

---

## 11. Definition of done

- [x] `data/Troops.json` byte-identical to `21885e1`
- [x] Shuffle verified over 3 000 permutations, 0 failures
- [x] Correct answer can never be paired with the wrong feedback
- [x] Points, ranks, support, hints, candy verified headlessly
- [x] `Conversation_Count` / `Material_Count` survive battles
- [x] Both kill switches restore pre-panel behaviour
- [x] Old saves tolerated (append-only variables, `fresh` detection)
- [ ] In-engine playtest (§9) — **before the panel**
