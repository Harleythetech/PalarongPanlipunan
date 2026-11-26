//=============================================================================
// tools/verify_minigame.js
//
// Guards the interactive selection mini-game in "Nayon ng Mayumi" (Mang Isko).
//
// This is the project's answer to panel comments #2 (Limited Interactivity) and
// #3 (another way of answering): the player is asked to pick three examples of
// "kulturang materyal" from six options, the game refuses to let the same
// option be counted twice, and it loops until three are correct.
//
// The gate exists because the event was found to contain a real content bug:
// the sixth option was labelled "Bulaklak" (a flower), but its feedback said
// "Tama! Ang Damit na suot natin..." because the option had been renamed from
// "Damit" to "Bulaklak" without updating the text or the switch name
// (switch 15 is still literally "Damit_Selected"). A flower is nature, not
// material culture, so the exercise taught the wrong thing.
//
// The checks below are structural (does the loop terminate? can an option be
// counted twice? is there a dead end?) plus one content rule: every branch's
// feedback must name the option the player actually clicked. That single rule
// is what catches a label/text drift like the one above.
//
// Usage:  node tools/verify_minigame.js
//=============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');

const GAIN_SCORE = 122;      // Control Variables
const IF = 111;              // Conditional Branch
const SET_SWITCH = 121;      // Control Switches
const SET_SELF = 123;        // Control Self Switch
const LABEL = 118;
const JUMP_LABEL = 119;
const CHOICES = 102;
const WHEN = 402;
const END_CHOICES = 404;
const TEXT = 401;

let failures = 0;
const fail = msg => { console.error('  FAIL ' + msg); failures++; };
const ok = msg => console.log('  ok   ' + msg);

const read = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const system = read('System.json');
const mapInfos = read('MapInfos.json');
const mapName = id => {
    const m = mapInfos.find(x => x && x.id === id);
    return m ? m.name : '?';
};

const norm = s => String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// The commands of one "When [choice]" branch, stopping at the next When/End.
function branchBody(list, at) {
    const indent = list[at].indent;
    const out = [];
    for (let i = at + 1; i < list.length; i++) {
        const c = list[i];
        if ((c.code === WHEN || c.code === END_CHOICES) && c.indent <= indent) break;
        out.push(c);
    }
    return out;
}

// Does this command add a positive constant to some variable?
function scoreAdd(c) {
    return c.code === GAIN_SCORE &&
           c.parameters[2] === 1 &&      // operation: add
           c.parameters[3] === 0 &&      // operand: constant
           c.parameters[4] > 0;
}

function branchesOf(list) {
    const out = [];
    list.forEach((c, i) => {
        if (c.code !== WHEN) return;
        const body = branchBody(list, i);
        out.push({
            index: c.parameters[0],
            label: String(c.parameters[1]),
            body,
            texts: body.filter(x => x.code === TEXT).map(x => String(x.parameters[0])),
            correct: body.some(scoreAdd)
        });
    });
    return out;
}

//-----------------------------------------------------------------------------
// Find every *scoring* pick-from-a-list mini-game. A plain dialogue menu with
// several options (the "who do you know?" menus) is not one: nothing is scored
// and no counter gates the exit.
//-----------------------------------------------------------------------------
const games = [];

for (const file of fs.readdirSync(DATA).filter(f => /^Map\d+\.json$/.test(f)).sort()) {
    const mapId = parseInt(file.match(/\d+/)[0], 10);
    const map = read(file);
    (map.events || []).forEach(ev => {
        if (!ev) return;
        (ev.pages || []).forEach((pg, pi) => {
            const list = pg.list || [];
            const menuAt = list.findIndex(c => c.code === CHOICES && (c.parameters[0] || []).length >= 4);
            if (menuAt < 0) return;
            const branches = branchesOf(list);
            if (!branches.some(b => b.correct)) return;                 // not a scoring game
            const hasLoop = list.some(c => c.code === LABEL) &&
                            list.some(c => c.code === JUMP_LABEL);
            if (!hasLoop) return;
            games.push({ file, mapId, ev, page: pi, list, menuAt, branches });
        });
    });
}

console.log('Palarong Panlipunan — interactive selection mini-games\n');

if (!games.length) {
    fail('no scoring pick-from-a-list mini-game with a retry loop was found anywhere');
}

for (const g of games) {
    const where = g.file + ' (map "' + mapName(g.mapId) + '") ev' + g.ev.id + ' "' + g.ev.name.trim() + '"';
    const tag = 'Map' + String(g.mapId).padStart(3, '0');
    console.log(where);

    const list = g.list;
    const options = list[g.menuAt].parameters[0];
    const branches = g.branches;
    const correct = branches.filter(b => b.correct);
    const wrong = branches.filter(b => !b.correct);

    // A required story beat must not be cancellable.
    if (list[g.menuAt].parameters[1] !== -1) {
        fail(tag + ': the choice menu can be cancelled');
    } else {
        ok(tag + ': the menu cannot be cancelled (no escape from a required beat)');
    }

    // Duplicate options would make the score depend on which line was clicked.
    if (new Set(options.map(norm)).size !== options.length) {
        fail(tag + ': two options have the same text');
    }

    if (!correct.length) fail(tag + ': no option awards a point');
    if (!wrong.length) fail(tag + ': every option is "correct" — there is no wrong answer');

    // 1. Feedback must name the option that was clicked.
    let misnamed = 0;
    branches.forEach(b => {
        if (!norm(b.texts.join(' ')).includes(norm(b.label))) {
            misnamed++;
            fail(tag + ': option "' + b.label + '" is answered with text that never names it — ' +
                'the feedback belongs to a different option. Text said: "' + b.texts[0] + '"');
        }
    });
    if (!misnamed) ok(tag + ': every option\'s feedback names that option');

    // 2. The wording must agree with the score.
    correct.forEach(b => {
        if (!/\btama\b/.test(norm(b.texts.join(' ')))) {
            fail(tag + ': "' + b.label + '" scores a point but is not praised as correct');
        }
    });
    wrong.forEach(b => {
        if (!/\bmali\b/.test(norm(b.texts.join(' ')))) {
            fail(tag + ': "' + b.label + '" is wrong but is not told it is wrong');
        }
    });

    // 3. The exit threshold must be reachable and not trivial.
    const counterVars = new Set();
    branches.forEach(b => b.body.forEach(c => {
        if (scoreAdd(c)) for (let v = c.parameters[0]; v <= c.parameters[1]; v++) counterVars.add(v);
    }));

    const thresholds = list.filter(c => c.code === IF &&
        c.parameters[0] === 1 &&
        counterVars.has(c.parameters[1]) &&
        c.parameters[2] === 0 &&                          // compare with a constant
        (c.parameters[4] === 0 || c.parameters[4] === 1)  // == or >=
    );

    if (!thresholds.length) {
        fail(tag + ': nothing checks the counter, so the mini-game can never be completed');
    } else {
        const need = thresholds[0].parameters[3];
        if (need > correct.length) {
            fail(tag + ': needs ' + need + ' correct picks but only ' + correct.length +
                ' options are correct — it can never be finished');
        } else if (need < 1) {
            fail(tag + ': the pass threshold is ' + need + ', so it completes without playing');
        } else {
            ok(tag + ': needs ' + need + ' correct picks, and ' + correct.length +
                ' options are correct (finishable, not trivial)');
        }
    }

    // 4. The counter must be reset, or a replay would start already complete.
    const reset = list.slice(0, g.menuAt).some(c => c.code === GAIN_SCORE &&
        c.parameters[2] === 0 && c.parameters[3] === 0 && c.parameters[4] === 0 &&
        [...counterVars].some(v => v >= c.parameters[0] && v <= c.parameters[1]));
    if (!reset) {
        fail(tag + ': the pick counter is never reset, so a replay would finish instantly');
    } else {
        ok(tag + ': the pick counter is reset on entry');
    }

    // 5. Each correct option must remember it was taken, so the same one cannot
    //    be clicked three times to satisfy the count.
    correct.forEach(b => {
        if (!b.body.some(c => c.code === SET_SWITCH && c.parameters[2] === 0)) {
            fail(tag + ': "' + b.label + '" does not record that it was picked');
        }
        if (!b.body.some(c => c.code === IF && c.parameters[0] === 0)) {
            fail(tag + ': "' + b.label + '" does not check whether it was already picked');
        }
    });
    ok(tag + ': every correct option is recorded and cannot be counted twice');

    // 6. A wrong answer must loop back rather than end the event.
    const label = (list.find(c => c.code === LABEL) || { parameters: [] }).parameters[0];
    const jumps = list.filter(c => c.code === JUMP_LABEL && c.parameters[0] === label);
    if (!jumps.length) {
        fail(tag + ': the label exists but nothing jumps back to it, so a wrong answer ends the game');
    } else {
        ok(tag + ': a wrong answer loops back and asks again');
    }

    // 7. Completion must move the event on, not fall back into the menu.
    if (!list.some(c => c.code === SET_SELF && c.parameters[1] === 0)) {
        fail(tag + ': completing the mini-game does not turn on a self switch, so it can be replayed');
    } else {
        ok(tag + ': completion turns on a self switch and moves the story on');
    }

    console.log('');
}

//-----------------------------------------------------------------------------
// The content itself: the four examples must really be material culture.
//-----------------------------------------------------------------------------
{
    const g = games.find(x => x.ev.name.trim() === 'Mang Isko');
    if (!g) {
        fail('the Mang Isko mini-game in "Nayon ng Mayumi" is missing');
    } else {
        const correct = g.branches.filter(b => b.correct).map(b => b.label).sort();
        const wrong = g.branches.filter(b => !b.correct).map(b => b.label).sort();

        const wantCorrect = ['Bahay', 'Damit', 'Poste ng Ilaw', 'Tulay'].sort();
        const wantWrong = ['Puno', 'Tubig'].sort();

        if (JSON.stringify(correct) !== JSON.stringify(wantCorrect)) {
            fail('the material-culture answers changed. Expected ' + wantCorrect.join(', ') +
                ', found ' + correct.join(', '));
        } else {
            ok('material culture (man-made): ' + correct.join(', '));
        }
        if (JSON.stringify(wrong) !== JSON.stringify(wantWrong)) {
            fail('the nature answers changed. Expected ' + wantWrong.join(', ') +
                ', found ' + wrong.join(', '));
        } else {
            ok('nature, not culture (correctly marked wrong): ' + wrong.join(', '));
        }

        // Switch names are the fossil record of intent: switch 15 is "Damit_Selected".
        const labelBySwitch = {};
        g.branches.forEach(b => b.body.forEach(c => {
            if (c.code === SET_SWITCH && c.parameters[2] === 0) labelBySwitch[c.parameters[0]] = b.label;
        }));
        let stale = 0;
        Object.entries(labelBySwitch).forEach(([id, label]) => {
            const name = String(system.switches[id] || '');
            if (!name) return;
            // The switch name may be a short form of the option ("Poste_Selected"
            // for "Poste ng Ilaw"), but the two must share their root word.
            const a = norm(name).replace(/ selected$/, '');
            const b = norm(label);
            const related = a === b || a.startsWith(b) || b.startsWith(a);
            if (!related) {
                stale++;
                fail('switch ' + id + ' "' + name + '" no longer matches its option "' + label +
                    '" — a renamed option left a stale name behind');
            }
        });
        if (!stale) ok('switch names agree with the option labels');
    }
}

//-----------------------------------------------------------------------------
// The gate: the quiz boss must not be reachable without playing the mini-game
//-----------------------------------------------------------------------------
// Without this, the interactivity is decoration the player can walk past. The
// risk in the other direction is worse: a gate that an already-progressed save
// cannot satisfy would soft-lock the quest forever. Both are checked here.
{
    const items = read('Items.json');
    const candyId = items.findIndex(it => it && /<CandyPoint:/i.test(String(it.note || '')));

    const REWARD_ITEM = candyId;
    const BATTLE_CMD = 301;

    // MV's Game_Event.findProperPageIndex scans BACKWARDS and returns the first
    // page whose conditions hold, so the highest matching page wins.
    const pageMatches = (pg, st) => {
        const c = pg.conditions;
        if (c.switch1Valid && !st.switches[c.switch1Id]) return false;
        if (c.switch2Valid && !st.switches[c.switch2Id]) return false;
        if (c.variableValid && (st.vars[c.variableId] || 0) < c.variableValue) return false;
        if (c.selfSwitchValid && !st.self[c.selfSwitchCh]) return false;
        if (c.itemValid && !st.items[c.itemId]) return false;
        if (c.actorValid) return false;
        return true;
    };
    const resolvePage = (pages, st) => {
        for (let i = pages.length - 1; i >= 0; i--) {
            if (pageMatches(pages[i], st)) return i;
        }
        return -1;
    };
    const hasBattle = pg => (pg.list || []).some(c => c.code === BATTLE_CMD);

    for (const g of games) {
        const map = read(g.file);
        const tag = 'Map' + String(g.mapId).padStart(3, '0');

        // The boss is the event in the same map that actually starts a battle.
        const bosses = (map.events || []).filter(e =>
            e && (e.pages || []).some(hasBattle));

        if (!bosses.length) {
            fail(tag + ': the mini-game gated nothing — no battle event was found in the map');
            continue;
        }

        // The counter the mini-game increments, and how far it can go.
        const counters = new Set();
        let maxPicks = 0;
        g.branches.forEach(b => {
            if (!b.correct) return;
            maxPicks++;
            b.body.forEach(c => {
                if (c.code === GAIN_SCORE && c.parameters[2] === 1 && c.parameters[4] > 0) {
                    for (let v = c.parameters[0]; v <= c.parameters[1]; v++) counters.add(v);
                }
            });
        });

        for (const boss of bosses) {
            const pages = boss.pages;
            const battlePages = pages.filter(hasBattle);
            if (battlePages.length !== 1) {
                fail(tag + ' ev' + boss.id + ': expected exactly one battle page, found ' + battlePages.length);
                continue;
            }
            const bp = battlePages[0];
            const bc = bp.conditions;

            // 1. The battle page must be gated on the mini-game's own counter.
            if (!bc.variableValid || !counters.has(bc.variableId)) {
                fail(tag + ' ev' + boss.id + ': the battle is not gated on the mini-game counter — ' +
                    'the player can walk past the mini-game');
                continue;
            }
            const need = bc.variableValue;

            // 2. The gate must be satisfiable.
            if (need > maxPicks) {
                fail(tag + ' ev' + boss.id + ': the battle needs ' + need +
                    ' but only ' + maxPicks + ' correct picks exist — unreachable');
                continue;
            }

            // 3. Soft-lock check. The gate reads a variable, not a one-shot flag,
            //    and that variable is the one the mini-game itself fills in. A
            //    save that already finished the mini-game therefore satisfies it
            //    without replaying. A switch set only inside page 1 would not.
            const setByMiniGame = g.list.some(c => c.code === GAIN_SCORE &&
                c.parameters[2] === 1 && c.parameters[4] > 0 &&
                c.parameters[0] <= bc.variableId && c.parameters[1] >= bc.variableId);
            if (!setByMiniGame) {
                fail(tag + ' ev' + boss.id + ': the gate variable is not filled in by the mini-game, ' +
                    'so an existing save could be permanently blocked');
            } else {
                ok(tag + ' ev' + boss.id + ': battle gated on V' + bc.variableId + ' >= ' + need +
                    ', which the mini-game fills in (old saves keep working)');
            }

            // 4. The four states that must behave.
            const base = { switches: {}, vars: {}, self: {}, items: {} };
            const stateDone = { switches: {}, vars: {}, self: {}, items: {} };
            stateDone.vars[bc.variableId] = need;

            const pNone = resolvePage(pages, base);
            const pDone = resolvePage(pages, stateDone);
            const pBeaten = resolvePage(pages, Object.assign({}, stateDone, {
                self: Object.assign({}, stateDone.self, { A: true })
            }));

            if (pNone >= 0 && hasBattle(pages[pNone])) {
                fail(tag + ' ev' + boss.id + ': the battle still runs before the mini-game is done');
            } else if (pNone < 0) {
                fail(tag + ' ev' + boss.id + ': no page matches the "not started" state, so the ' +
                    'player walks over the tile with no explanation');
            } else {
                ok(tag + ' ev' + boss.id + ': before the mini-game the tile explains why (page ' + (pNone + 1) + ')');
            }

            if (pDone < 0 || !hasBattle(pages[pDone])) {
                fail(tag + ' ev' + boss.id + ': finishing the mini-game does not unlock the battle');
            } else {
                ok(tag + ' ev' + boss.id + ': after the mini-game the battle unlocks (page ' + (pDone + 1) + ')');
            }

            // Once won, the fight must not come back. The winning page sets self
            // switch A, and a page conditioned on it must outrank the battle.
            const blankHigher = pages.some((pg, i) =>
                i > pages.indexOf(bp) && pg.conditions.selfSwitchValid &&
                pg.conditions.selfSwitchCh === 'A');
            const winsSetsA = (bp.list || []).some(c => c.code === SET_SELF &&
                c.parameters[0] === 'A' && c.parameters[1] === 0);
            if (!winsSetsA) {
                fail(tag + ' ev' + boss.id + ': the battle never sets self switch A on, so it can be refought');
            }
            if (!blankHigher) {
                fail(tag + ' ev' + boss.id + ': the "already beaten" page does not outrank the battle, ' +
                    'so the fight could repeat');
            } else if (pBeaten >= 0 && hasBattle(pages[pBeaten])) {
                fail(tag + ' ev' + boss.id + ': a beaten boss can be fought again');
            } else {
                ok(tag + ' ev' + boss.id + ': a beaten boss stays beaten');
            }
        }
    }

    //----------------------------------------------------------------------
    // The reward: the mini-game must pay into the Candy Points economy
    //----------------------------------------------------------------------
    const g = games.find(x => x.ev.name.trim() === 'Mang Isko');
    if (!g) {
        fail('cannot check the mini-game reward: the Mang Isko event is missing');
    } else if (REWARD_ITEM < 0) {
        fail('no item carries a <CandyPoint:N> note, so no reward could be paid in candy');
    } else {
        const tag = 'Map' + String(g.mapId).padStart(3, '0');
        const list = g.list;

        // Exactly one grant, anywhere in the event.
        const grants = [];
        list.forEach((c, i) => {
            if (c.code === 126 && c.parameters[0] === REWARD_ITEM) grants.push(i);
        });

        if (grants.length === 0) {
            fail(tag + ' ev' + g.ev.id + ': the mini-game grants no candy');
        } else if (grants.length > 1) {
            fail(tag + ' ev' + g.ev.id + ': the mini-game grants candy ' + grants.length +
                ' times, which is ambiguous');
        } else {
            const at = grants[0];
            const amount = list[at].parameters[3];

            // It must sit inside the completion branch, not on entry: otherwise a
            // player could collect it and leave.
            const ifAt = list.findIndex(c => c.code === IF &&
                c.parameters[0] === 1 &&
                c.parameters[1] === g.branches.find(b => b.correct).body
                    .map(x => x.code === GAIN_SCORE ? x.parameters[0] : null)
                    .filter(x => x !== null)[0] &&
                c.parameters[4] === 1);

            const inBranch = ifAt >= 0 && at > ifAt && at < (() => {
                for (let i = ifAt + 1; i < list.length; i++) {
                    if (list[i].code === 411 || list[i].code === 412) return i;
                }
                return list.length;
            })();

            if (!inBranch) {
                fail(tag + ' ev' + g.ev.id + ': the candy is granted outside the "mini-game complete" branch, ' +
                    'so it could be collected without finishing');
            } else if (!(amount > 0)) {
                fail(tag + ' ev' + g.ev.id + ': the candy grant is a no-op (amount ' + amount + ')');
            } else {
                // Announced, because a silent grant on the map is easy to miss.
                const after = list.slice(at + 1, at + 6);
                const announced = after.some(c => c.code === 101) &&
                                  after.some(c => c.code === TEXT);
                if (!announced) {
                    fail(tag + ' ev' + g.ev.id + ': the candy is granted silently; add a Show Text so the ' +
                        'player learns they earned something');
                } else {
                    ok(tag + ' ev' + g.ev.id + ': candy x' + amount +
                        ' granted once, inside the completion branch, and announced');
                }
            }

            // The completion branch must end by leaving page 1, or the reward
            // could be collected again.
            const setsSelf = (() => {
                for (let i = at; i < list.length; i++) {
                    const c = list[i];
                    if (c.code === 412 && c.indent === 0) return false;
                    if (c.code === SET_SELF && c.parameters[1] === 0) return true;
                }
                return false;
            })();
            if (!setsSelf) {
                fail(tag + ' ev' + g.ev.id + ': the reward branch does not leave the page, so it can be farmed');
            } else {
                ok(tag + ' ev' + g.ev.id + ': the reward branch ends by leaving the page (not farmable)');
            }
        }
    }
}

console.log('');
if (failures) {
    console.log(failures + ' failure(s)');
    process.exit(1);
}
console.log('MINI-GAME OK');
console.log('note: the mini-game is an existing feature of the build, not something added');
console.log('      for the panel — it already answers comments #2 (interactivity) and #3');
console.log('      (another way of answering).');
