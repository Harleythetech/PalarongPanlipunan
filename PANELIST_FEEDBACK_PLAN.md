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
| B3 | Invisible battle commands | `BattleHUD` hides party/actor/status windows | A failed quiz no longer drops the player into that state (§4.4) |
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
| 2 | Limited interactivity (mini games, bonus games) | **Already in the build**: the "Mang Isko" pick-three selection game in *Nayon ng Mayumi* — choose 3 of 6 examples of *kulturang materyal*, with per-option feedback, an anti-repeat guard and a retry loop. It is part of the "interview the villagers" quest beat (§3.1) |
| 3 | Another answer style | Two of them: the selection game above (pick-many instead of one answer), and answer-position shuffle inside every quiz |
| 4 | Feedback system | SFX + screen flash/shake + floating score + Arkin reaction line + live tally on the HUD |
| 4 | Damage curve | Correct answers 14–33, wrong answers scaled by quiz length (16 / 8 / 7, about half the party's HP if every answer is wrong); no single answer one-shots the enemy or the party, and no question is skipped |
| 5 | Candy points | One **Candy Points** currency, earning rules, rank unlock at 100, counter in battle **and** on the map |
| 6 | Arkin health / support | 0–100 support gauge, ranks 1–4, hint charges, exhausted state, per-battle recovery |

Deferred: treasure hunt, matching mini-game, ordering puzzle, candy shop,
question-pool expansion (§10) — **all additions on top of the mini-game that
already exists**, not replacements for it.

### 3.1 The mini-game that was already there

Comment #2 was carried as "not delivered" for most of this work until the build
was audited for existing interactivity. It already has one, in the main quest:
**Mang Isko**, `Map034` event 1 in *Nayon ng Mayumi*.

The player is taught *kapaligiran* and *kultura*, then asked to name three
examples of **kulturang materyal** from six options:

| Option | Verdict | Why |
|---|---|---|
| Bahay (house) | correct | built by people |
| Tulay (bridge) | correct | built by people |
| Poste ng Ilaw (lamp post) | correct | built by people |
| Damit (clothing) | correct | made by people |
| Puno (tree) | wrong | part of nature |
| Tubig (water) | wrong | part of nature |

How it behaves:

- **Pick three, not one.** It loops on a `Label` / `Jump to Label` pair until the
  counter `Material_Count` (V2) reaches 3. A wrong answer costs time, not
  progress: there is no dead end and no way to fail out of the quest.
- **No double counting.** Each correct option owns a switch (`Bahay_Selected`,
  `Tulay_Selected`, `Poste_Selected`, `Damit_Selected`); picking it again is
  refused with *"Napili mo na ang … Pumili naman ng ibang halimbawa."*
- **Per-option feedback.** Every option answers with its own reason — *"Tama! Ang
  bahay ay halimbawa ng kulturang materyal."* versus *"Mali! Ang puno ay bahagi
  ng kalikasan…"* — which is the feedback pattern comment #4 asks for, in a
  non-quiz format.
- **It is part of the quest, and it is now enforced.** Completing it clears the
  "talk to Mang Isko" beat and moves the arrow on to the next four villagers.
  The Shadow battle (`Map034` ev29) is now **gated on the mini-game**: its battle
  page only exists while `Material_Count` (V2) is at least 3, which only the
  mini-game can produce. Step on the tile before finishing and the party says so
  and the arrow points back to Mang Isko.
- **It pays candy.** Completing the three picks grants **candy x2** (+20 Candy
  Points), announced with *"Nakuha mo ang gantimpala: candy x2."*, so the beat
  feeds the same economy as the quiz victories instead of paying nothing.

**A real bug was found here and fixed.** The sixth option was labelled
`Bulaklak` (flower) while its feedback still read *"Tama! Ang Damit na suot
natin…"* and its switch was still `Damit_Selected` — the option had been renamed
from "Damit" to "Bulaklak" without updating the text. That taught the wrong
thing: a flower is nature, not material culture, so a student who answered
correctly was told they were right about *clothing* they never picked. The label
is back to **Damit**, which now agrees with its feedback text, its switch name
and the lesson.

**How the gate avoids breaking anything.** The gate reads a *variable* that the
mini-game itself fills in, not a new switch set inside page 1 of the conversation:

| State | V2 | Self switch A | Page that runs |
|---|---:|---|---|
| New game, mini-game not done | 0 | off | 1 — "go back to Mang Isko" |
| Mini-game done | 3+ | off | 2 — the battle |
| Boss already beaten | 3+ | **on** | 3 — blank |

This matters because a new switch would have **soft-locked existing saves**: a
player who already finished the mini-game sits on the event's later page, so page
1 never runs again and the switch would never be set. Reading V2 means any save
that already completed the mini-game satisfies the gate automatically, and any
save that already beat Shadow still lands on the blank page.

**Could be improved (post-deadline, not started):**

- It is a pick-many list, not a spatial or timed game; the treasure hunt and the
  matching-pairs game in §10 would add variety.
- The "Hindi pa rin po." retry branch replays the whole opening dialogue rather
  than only the explanation, which is a long read for a student who just wanted
  the lesson repeated.

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
6. Replace the all-or-nothing damage numbers with a flat curve (see 4.3).
7. Remove ordinal filler (`Ikalawang katanungan.`, `Huling tanong.`,
   `Fanatio:" Para naman sa pangalawang tanong.`) so a moved block never lies
   about its position. Real questions that merely mention an ordinal are kept.
8. Append `PalSupport quizdone <n>`.
9. Validate again; any mismatch returns the original list untouched.

### 4.3 Damage curve

The shipped numbers are not a curve: the last question of every quiz deals
exactly `100`, which one-shots the `100 HP` enemy *and* one-shots `100 HP`
Harold, while a 3-question quiz jumps `25 → 50 → 100`. Answering correctly was
sometimes an instant win, and answering wrong was sometimes an instant knockout.

Rewritten in the runtime copy only:

| Event | Formula | 3 questions | 6 questions | 7 questions |
|---|---|---|---|---|
| Correct answer | `floor((enemyMaxHp − 1) / questions)` | 33 | 16 | 14 |
| Wrong answer | `max(1, floor(partyMaxHp × wrongDamageShare / questions))` | 16 | 8 | 7 |
| Answers needed to pass | `ceil(passRatio × n)` | 2/3 | 3/6 | 4/7 |
| Enemy HP left after all correct | `enemyMaxHp − n × damage` | 1 | 4 | 2 |
| HP lost if every answer is wrong | `n × wrong damage` | 48/100 | 48/100 | 49/100 |

- Every correct answer is deliberately **non-lethal**. MV ends the battle the
  moment the last enemy dies; a lethal answer would cut the quiz short and skip
  the `quizdone` command at the end of the page. The killing blow is applied once
  by `quizdone`, after the score is known.
- Both sides are scaled by the number of questions, so quiz length does not
  change the size of the stake. `wrongDamageShare` is the share of the party's
  health that a *whole quiz* costs if every answer is wrong (default `0.5`), and
  it is split evenly over however many questions the battle has: a 3-question
  quiz costs 16 per mistake, a 6-question quiz 8, a 7-question quiz 7 — always
  about half the party's health in total. `passRatio` defaults to `0.5`.
- Enemy HP is read from `Enemies.json` (highest member, because `Change Enemy HP`
  targets every enemy at once).
- Party HP is read from the frailest battle member, so one wrong answer can never
  knock anybody out.
- Only constant operands are rewritten; variable-driven commands are untouched.
- Switches: `normalizeDamage` (default on). Off = the original numbers.
- If PalSupport is switched off (S31), normalization is skipped too, so the
  authored last-question finisher still ends the battle. Otherwise the quiz
  could never finish.

### 4.4 Battle outcome (the safe part)

- **Pass** (at least `steps` correct answers): `quizdone` applies the finisher, so
  the enemy dies at the very end and the engine's normal victory path runs the
  existing `If Win` branch. No question is ever skipped. The party keeps whatever
  HP it has left, exactly like a won battle.
- **Fail** (fewer than `steps` correct): the party is knocked out so the engine
  runs its **normal defeat path** — defeat ME, defeat message, actor collapse —
  which fires the existing `If Lose` branch (Arkin: "magbasa muna tayo ng mga
  tala…").
- **Damage is not free.** `quizdone` records each member's HP before the knockout;
  once the battle actually exits (`BattleManager.updateBattleEnd`), each member is
  put back on it (floored at 1 HP). So a wrong answer costs real health on the
  map, the same way it would in a normal battle. The old behaviour healed the
  party to full after a loss, which made the quiz damage meaningless. The restore
  runs at exit, not at defeat, so the HUD still shows the party dead for the whole
  defeat message — the battle visibly ends with a knockout.
- **The map's own heal cannot undo it.** The tutorial is the only place in the
  project with a heal (two `Recover All` commands, one in the `If Win` branch and
  one in `If Lose`, Map002 event 4), and a battle's branch runs immediately after
  the battle. That heal is left in place — it is the only recovery the game has —
  but it is capped at *max HP minus what this quiz cost*: enter at 100, lose 50,
  leave at 50 even after `Recover All`. Damage taken **before** the battle is
  still healed by it, so the authored top-up keeps working. The cap is tied to
  the event that started the battle (its own `If Win`/`If Lose` branch), runs
  once, and can never leave a member below the HP they earned. A heal from any
  other event — an inn, a save point — is never touched.
- A member that actually hit 0 HP mid-quiz comes back at 1 HP, never 0: 0 HP on
  the map is the game over screen.
- **A wiped party cannot win.** Damage carries between battles now, so it is
  possible to enter a quiz at low HP and be knocked out mid-round. The quiz still
  runs to the end (MV does not check the party while a troop event is running),
  and at `quizdone` an all-dead party is sent down the defeat path **even if the
  score passes**. Otherwise a dead party could collect a victory.
- **A won quiz revives its casualties at 1 HP.** Outside the tutorial no map heals
  and no shop sells a revive item (`Stimulant` exists but is not sold anywhere),
  so leaving a knocked-out member dead after a win would strand that member for
  the rest of the game. They get up at 1 HP — the damage still shows.
- A failed quiz forces `canLose` on for that battle, so even a map event authored
  without "can lose" can never send the player to the title screen.
- `quizdone` receives both the total and the pass threshold
  (`PalSupport quizdone <total> <pass>`), so the data and the plugin can never
  disagree. A missing threshold defaults to half the questions.

> **Why the knockout still has to happen.** `If Lose` is chosen by
> `BattleManager.endBattle(2)`, and the engine only reaches the defeat message
> when the party is actually dead. Leaving the party standing and calling
> `endBattle(2)` directly stopped the fight mid-air with no defeat at all — the
> bug found in playtesting. The knockout is what produces the death, the defeat
> message and the `If Lose` branch; the HP restore afterwards is what makes the
> damage stick.

> **The `Game Over` trap.** `Troops.json` troop 1 has two `Game Over` event
> commands (L125/L132) on the *final* question's wrong answers. They fire
> **before** the injected `quizdone`, so answering the last question wrong
> hard-reset the run to the title screen and the `If Lose` branch could never
> run. PalQuiz strips command `353` from the **runtime copy only** (switch
> `softenGameOver`, default on). `data/Troops.json` is still byte-identical to
> `21885e1`.

This is strictly better than before: no invisible-command-window state, no
stranded dead member, no early end to the quiz, and losing a quiz now costs HP.

### 4.4a Health is the stake, and it is visible

This is a quiz **with health**, not a quiz scored by health: an answer is always
judged honestly, and health is what the answer costs. The team's earlier idea of
letting low health make a correct answer count as wrong was dropped — it turns a
knowledge check into a coin flip and creates a death spiral (low HP → judged
wrong → more damage → lower HP).

- A wrong answer costs HP **as it happens**, through the troop page's own
  `Change HP` command, so the party bars drop during the quiz.
- The HP cost is announced with a floating `-N HP` next to the answer (16 in the
  three-question tutorial, 7–8 in the longer quizzes), measured
  as the difference between the last two answers. Nothing is hard-coded, so if a
  branch is ever re-authored the number follows the data. The Arkin gauge is
  reported separately (`Arkin -15`) so it is not mistaken for health.
- A branch that heals instead of hurting is reported as `+N HP`.
- Health carries between battles, and the map HUD already shows both members'
  bars, so the cost of a lost quiz is visible before the next one.
- **Potions are the recovery, and every victory grants one.** `Potion` (item 1,
  `+500 HP`, 50 G) is usable from the menu; item effects never pass through the
  damage bookkeeping, so a potion always heals for real (§4.6).

### 4.6 Battle rewards — why the potion source had to be made visible

Every quiz boss already dropped an item through the enemy drop table, but the
player never saw it. `BattleHUD._suppressDefaultBattleUI` sets the battle log
window's `opacity` **and** `contentsOpacity` to `0`, so MV's
`Obtained Potion!` line is drawn into an invisible window. The items were being
granted silently — which is why the project looked like it had no potion source
at all.

The fix is an announced reward in each battle's **`If Win` branch**, using the
game's own message window (which is not suppressed):

| Battle | Troop | Questions | Potion | Candy |
|---|---|---:|---:|---:|
| Tutorial (`Map002` ev4) | 1 | 3 | 1 | 1 |
| Fanatio (`Map025` ev2 **and** ev3) | 2 | 3 | 1 | 2 |
| Malviro (`Map035` ev4) | 3 | 7 | 1 | 2 |
| Shadow (`Map034` ev29) | 4 | 6 | 1 | 2 |
| Veyra (`Map047` ev5) | 5 | 7 | 1 | 2 |
| Morrivelle (`Map043` ev15 **and** ev19) | 6 | 7 | 2 | 3 |

- `Map025` and `Map043` each hold **two copies** of the same fight on adjacent
  tiles, so both are edited — otherwise the payout would depend on which tile the
  player stepped on. Neither pair can be fought twice (winning `Map043` one sets
  switch 21, which turns both events into their empty second page).
- Rewards are **inside `If Win` only**. Nothing is granted on a loss, so a retry
  cannot be farmed for items.
- The tutorial reward is anchored after its `Recover All`, so the player reads it
  after the trainer's lines and just before the map change — and it is the moment
  they learn that potions exist.
- Purely additive: no existing command, item, or drop was removed, so the game
  cannot become harder than it was.

**Is the campaign still winnable?** `tools/economy_check.js` answers that from
the real data rather than by hand: it reads the questions from `Troops.json`, the
damage from `PalQuiz.damagePlan`, the drops from `Enemies.json`, and the rewards
from the map events, then simulates the pessimistic-but-passing player (the most
wrong answers that still passes each quiz, healing between battles only, always on
the weaker member). That run finishes the last battle at **79/100 HP with 3
potions spare**. Without any potions at all the same run dies on the last quiz —
so the rewards are load-bearing, not decoration.

`Stimulant` (item 4, revive) is still sold nowhere; a knock-out is handled by the
1 HP revival on a won quiz (§4.4) rather than by an item.

### 4.5 Map HUD

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
| `js/plugins/PalQuiz.js` | **new** — in-memory shuffle, damage curve, validation |
| `js/plugins/MapStatusWindow_Reworked.js` | candy counter + rank label |
| `js/plugins.js` | BattleHUD score vars `1/2 → 3/4`; register the two plugins after BattleHUD |
| `data/Items.json` | item 6 metadata (one line changed) |
| `data/System.json` | V3–V12, S23/S30/S31 names |
| `data/Troops.json` | **unchanged, byte-identical to `21885e1`** |
| `tools/verify_shuffle.js` | **new** — 3 000-permutation fuzz over the real troop data |
| `tools/simulate_support.js` | **new** — headless MV runtime scenario tests |
| `tools/simulate_battle.js` | **new** — enumerates every answer path, checks control flow and the damage curve |
| `data/_backup/*` | inert pre-panel snapshots (`DataManager` only reads `data/<Name>.json`) |

---

## 7. Verification

```bash
node tools/verify_shuffle.js 500     # 3000 permutations, 0 failures
node tools/simulate_support.js       # ALL CHECKS PASSED
node tools/simulate_battle.js        # 7344 answer paths, 0 failures
node tools/economy_check.js          # ECONOMY OK
node tools/add_quiz_rewards.js --check   # map reward blocks still intact
node tools/apply_minigame_gate.js --check # gate + mini-game reward still applied
node tools/verify_minigame.js        # MINI-GAME OK
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
  `updateBattleEnd` hook puts them back on the HP they had earned, so the wrong
  answers still cost health afterwards
- a `Recover All` straight after the quiz (the tutorial's win and lose branches)
  keeps that quiz's damage, while still healing anything lost before the battle
- a heal with no quiz behind it, a second heal, and a heal from another event
  (inn, save point) all still heal fully, even one second later
- a member knocked out mid-quiz comes back at 1 HP, never 0 (no game over loop)
- a stale defeat flag never leaks into the next battle
- each answer announces the HP it actually cost (`-N HP`), separately from the
  Arkin gauge (`Arkin -15`); a correct answer announces no HP change; a branch
  heal is announced as `+N HP`
- a potion heals normally after a quiz, is never rolled back, and the healed HP
  becomes the baseline for the next battle
- a heal after the battle event has finished is a real heal, never capped
- candy adds 10 points each
- kill switch suppresses everything
- `BattleManager.setup` rewrites the page **in memory only**; `Troops.json`
  on disk is unchanged
- `Conversation_Count` / `Material_Count` are never touched

`simulate_battle.js` proves, for all 7344 answer combinations across the six
quiz battles (one fixed shuffle per battle, as in play):

- every path terminates, asks each question once, fires `quizdone` once
- no `Game Over` command is left to execute
- the enemy takes damage **only** on correct answers, and always the planned
  amount
- the enemy **never** dies mid-quiz, so all questions are always asked
- `quizdone` carries the right total and pass threshold
- every score from `0` to `n` is reachable
- one wrong answer costs `floor(50 % of the party's HP / questions)`, so a
  quiz-length quiz and a short quiz cost the same in total

| Troop | Questions | Damage/correct | Damage/wrong | Answers to pass | Max enemy damage | Damage if all wrong |
|---|---|---|---|---|---|---|
| 1, 2 | 3 | 33 | 16 | 2 | 99/100 | 48/100 |
| 3, 5, 6 | 7 | 14 | 7 | 4 | 98/100 | 49/100 |
| 4 | 6 | 16 | 8 | 3 | 96/100 | 48/100 |

`economy_check.js` proves, from the real data rather than a hand calculation:

- every quiz battle that a map event starts has a reward in its `If Win` branch,
  and that reward is **announced with a Show Text** (the battle log is hidden, so
  an unannounced grant would be invisible)
- no reward is granted in an `If Lose` branch, so a loss cannot be farmed
- the two copies of the Fanatio and Morrivelle fights give **identical** rewards,
  so the payout cannot depend on which tile the player stood on
- the pessimistic passing run (most wrong answers that still passes, healing only
  between battles, always on the weaker member) reaches the last battle alive at
  **79/100 HP with 3 potions spare**
- the same run with the rewards removed dies on the last quiz — the rewards are
  load-bearing
- a fully failed quiz still costs 48/100 HP, so the stakes remain real
- the campaign hands out 18 candy (180 Candy Points) — 16 from the six quiz
  victories and 2 from the Mang Isko mini-game — enough for rank 2 (`Gabay`) and
  over half of the way to rank 3 (`Sandigan`, 250)

`add_quiz_rewards.js` and `apply_minigame_gate.js` are idempotent and refuse to
edit a file whose events are not one-verbatim-JSON-per-line; re-running either
finds nothing to do.

`verify_minigame.js` proves the Mang Isko selection game still teaches what it
claims to teach:

- the menu cannot be cancelled, so a required story beat has no escape
- every branch's feedback **names the option that was clicked** (the rule that
  catches the `Bulaklak` / `Damit` drift above)
- correct options are praised and wrong options are corrected, matching the score
- the exit threshold (3) is reachable and not trivial (4 options are correct)
- the pick counter is reset on entry, so a replay cannot start already complete
- each correct option is recorded and cannot be counted twice
- a wrong answer loops back instead of ending the event
- completion sets a self switch, so the game cannot be replayed for free
- the four correct answers are exactly the man-made ones, and the switch names
  still agree with the option labels
- **the Shadow battle is gated**: its one battle page carries a `Material_Count >=
  3` condition, the page that runs before the mini-game contains no battle, the
  page that runs after it does, and a boss that was already beaten still resolves
  to the blank page — so the fight cannot be re-triggered
- **the gate cannot soft-lock a save**: it reads a variable the mini-game itself
  fills in, not a switch set inside page 1, so a save that finished the mini-game
  before this change satisfies the gate without replaying it
- **the reward is real and not farmable**: exactly one candy grant, inside the
  completion branch (not on entry), announced by a Show Text, and the branch ends
  by leaving the page

Run against the pre-fix data it fails three independent ways (the `Bulaklak`
drift), and against the pre-gate data it fails twice more (`the battle is not
gated on the mini-game counter`, `the mini-game grants no candy`).

---

## 8. Rollback

```bash
git checkout main                  # abandon everything
git revert <commit>                # undo one step

# disable at runtime without a rebuild
# S30 ON  = no shuffling
# S31 ON  = no points/support/feedback (PalQuiz then keeps the authored
#           damage, so the battle still ends)
```

`Troops.json` needs no backup — it is never modified.

---

## 9. Manual QA still required (in-engine)

These need the actual game window; the harness cannot render or read input.

1. New game → tutorial battle: questions appear in a new order, choices in new
   positions; `Item3` + green flash + `+10` pop on a correct answer.
2. Each of the six bosses: completes, card shows `Kendi`, support gauge, tally.
3. Replay a boss three times → three different orders; no repeats inside one run.
4. A wrong answer shows **both** `-16 HP` (tutorial) and `Arkin -15`, and the
   party bars drop by the `-16` · the two must not be confused with each other.
5. Answer everything wrong → `KULANG PA`, the defeat message, Arkin's "magbasa
   muna tayo" line, and the party on the map **missing the HP the wrong answers
   cost** (not healed to full by the branch's `Recover All`). Each wrong answer
   should take a small, equal slice of HP — never knock anyone out in one hit at
   full health.
6. Win the tutorial with one or two wrong answers → `PANALO!`, and the party
   leaves at 100 minus the damage those wrong answers cost.
7. Win the tutorial → the trainer's lines, then **"Nakuha mo ang gantimpala:
   Potion x1 at candy x1."** — this is the moment the player learns potions
   exist, and it must appear because the battle log that would normally say
   "Obtained Potion!" is hidden by `BattleHUD`.
8. Use that `Potion` from the menu → HP recovers for real, and the next battle
   starts from the healed value (not from the pre-potion HP).
9. Win a boss → the equivalent reward line appears once, after the chapter prize.
   **Fight `Fanatio` and `Morrivelle` from each of their two tiles in turn**: the
   reward must be the same either way, and the fight must not be repeatable.
10. Lose a boss on purpose → **no** reward line, and no item gained.
11. Lose seven answers' worth of support → card reads `WALA`, the hint option
    refuses ("Naubos na ang aking mga tala").
12. Reach 100 points → rank badge flips to `GABAY`.
13. Save mid-chapter, reload → points, rank, support, hints, potion and candy
    counts intact.
14. Load an **old** save (`save/file1.rpgsave`) → no crash, support initialises
    to full on the next battle.
15. Mobile scale 1.4: card and map counter do not overlap other HUD elements.
16. Play **Mang Isko** in *Nayon ng Mayumi*: pick `Puno` or `Tubig` first → told
    `Mali!` and asked again; pick `Bahay` twice → the second pick is refused;
    pick `Bahay`, `Tulay`, `Damit` → his follow-up question appears, then the
    `NavArrow` moves on and talking to him again gives only `Kamusta kayo bata?`.
    The fourth option must read **`Damit`**, never `Bulaklak`.
17. On the third correct pick → **"Nakuha mo ang gantimpala: candy x2."**, and the
    candy count on the map HUD goes up by 2. Re-talk to him → no second candy.
18. **Before** finishing the mini-game, walk onto the Shadow tile (`Map034`
    (36,15)) → the party says *"may itinuturo pa si Mang Isko na hindi natin
    napakinggan"*, the arrow points back to him, and **no battle starts**.
    After finishing the mini-game, the same tile starts the Shadow battle
    normally. Win it, step on the tile again → nothing happens.
19. Load a save that **already finished** the mini-game but has **not** beaten
    Shadow → the tile must start the battle, not the "go back" line (this is the
    soft-lock guard).
20. Confirm `Troops.json` is still byte-identical: `git diff 21885e1 -- data/Troops.json`.

Watch specifically for: the support card rendering on top of a sprite, and the
`Kendi N` label width on the companion window in Filipino.

---

## 10. Deferred (post-deadline)

The build already has one mini-game (§3.1), and it is now both gated into the
quest and rewarded. Everything below is an **addition**, not a replacement, so
the panel answer does not depend on any of it landing.

| Feature | Notes |
|---|---|
| **Treasure hunt** | 5 clue NPCs on an existing map; reuses `MissionTracker` `CM` + `NavArrow`; each clue behind a self-switch so it cannot be farmed. Event-only, zero engine risk. |
| **Matching mini-game** | 8 pairs / 60 s, `Scene_PalMatch`; +2 per pair, +20 perfect. |
| **Ordering puzzle** | Arrange a timeline; third priority. |
| **Candy shop** | Extra hint 10 / heal 20 / revive 50 / cosmetic 100; needs `Scene_PalCandyShop` (the default shop only takes gold). The candy economy is already in place: the campaign awards 18 candy (180 points) — 16 from the six quizzes and 2 from the Mang Isko mini-game — enough for rank 2 and over half of rank 3, so a shop would have something to spend. |
| **Question pools** | Each topic needs 15–20 questions with explanations before shuffling feels varied long-term. Tonight the 33 existing questions simply change order, which already satisfies the comment. |
| **Fanatio hint option** | Troop 2 has no "Humingi ng Pahiwatig" choice at all (all other battles do). Adding one is a content edit to `Troops.json`, deliberately out of scope for a night where that file must not change. |
| **Stimulant source** | `Stimulant` (item 4, revive, 300 G) is sold nowhere and granted nowhere. A knock-out is currently recovered by the 1 HP revival on a won quiz (§4.4), so this is not a blocker — but a revive item would be the natural next reward if the demos get harder. |

---

## 11. Definition of done

- [x] `data/Troops.json` byte-identical to `21885e1`
- [x] Shuffle verified over 3 000 permutations, 0 failures
- [x] Correct answer can never be paired with the wrong feedback
- [x] Points, ranks, support, hints, candy verified headlessly
- [x] `Conversation_Count` / `Material_Count` survive battles
- [x] Both kill switches restore pre-panel behaviour
- [x] Old saves tolerated (append-only variables, `fresh` detection)
- [x] Every quiz victory grants an announced Potion + candy; the campaign is
      provably winnable on the worst passing path (`economy_check.js`)
- [x] Existing selection mini-game audited, its label/feedback bug fixed, and
      guarded by `verify_minigame.js` — it answers comments #2 and #3
- [x] The mini-game is enforced (Shadow battle gated on it) and pays candy, with
      no soft-lock for existing saves
- [ ] In-engine playtest (§9) — **before the panel**
