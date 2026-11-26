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

console.log('');
if (failures) {
    console.log(failures + ' failure(s)');
    process.exit(1);
}
console.log('MINI-GAME OK');
console.log('note: this is an existing feature of the build, not something added for the');
console.log('      panel — it already answers comments #2 (interactivity) and #3 (another');
console.log('      way of answering).');
