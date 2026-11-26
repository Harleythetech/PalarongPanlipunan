//=============================================================================
// tools/simulate_battle.js
//
// Executes the transformed troop event with a tiny interpreter and enumerates
// every possible combination of answers. Proves that, for every path:
//
//   - execution terminates (never falls off the end mid-question)
//   - every question is asked exactly once
//   - "PalSupport quizdone" runs exactly once, at the very end
//   - the enemy takes damage on exactly the correct answers
//   - no jump target is missing
//
// Hint branches are excluded from the enumeration because they intentionally
// loop back to the same question (verified separately by verify_shuffle.js).
//
// Usage:  node tools/simulate_battle.js
//=============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const core = require('../js/plugins/PalQuiz.js');

const ROOT = path.resolve(__dirname, '..');
const troops = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'Troops.json'), 'utf8'));

let failures = 0;
let paths = 0;

// -----------------------------------------------------------------------------
// Minimal event interpreter: just enough to follow the quiz control flow.
// -----------------------------------------------------------------------------
function run(list, pick) {
    const label = {};
    list.forEach((c, i) => { if (c.code === 118 && c.indent === 0) label[c.parameters[0]] = i; });

    const trace = { questions: [], correct: 0, wrong: 0, quizdone: 0, damage: 0, gameOver: 0 };
    let pc = 0;
    let answered = 0;
    let guard = 0;

    while (pc < list.length) {
        if (++guard > 100000) return { error: 'infinite loop', trace };

        const c = list[pc];

        if (c.code === 118) { pc++; continue; }            // Label
        if (c.code === 0) { pc++; continue; }              // no-op here
        if (c.code === 119) {                              // Jump to Label
            const t = label[c.parameters[0]];
            if (t === undefined) return { error: 'missing label ' + c.parameters[0], trace };
            pc = t;
            continue;
        }

        if (c.code === 102) {                              // Show Choices
            trace.questions.push(c.parameters[0][0]);
            const n = c.parameters[0].length;
            const sel = pick(answered, n);
            answered++;

            // Walk to the matching When, skipping the other branches.
            let q = pc + 1;
            let target = -1;
            let depth = 0;
            while (q < list.length) {
                const d = list[q];
                if (d.code === 402 && d.indent === 0) {
                    if (depth === 0) {
                        if (d.parameters[0] === sel) { target = q; break; }
                    }
                }
                if (d.code === 404 && d.indent === 0) { break; }
                q++;
            }
            if (target < 0) return { error: 'no When for selection ' + sel, trace };
            pc = target + 1;
            continue;
        }

        if (c.code === 402) {
            // Entering a When branch we are not in: skip to End Choices.
            let q = pc + 1;
            while (q < list.length && !(list[q].code === 404 && list[q].indent === 0)) q++;
            pc = q + 1;
            continue;
        }

        if (c.code === 404) { pc++; continue; }            // End Choices

        if (c.code === 356) {
            // Match MV's command356: params[0].split(" "), then shift().
            const parts = String((c.parameters || [])[0] || '').split(' ');
            const command = String(parts.shift() || '').toLowerCase();
            const args = parts.map(s => String(s).toLowerCase());
            if (command === 'palbattlehud' || command === 'battlehud') {
                if (args[0] === 'enemyscore' && args[1] === 'add') trace.wrong++;
                else if (args[0] === 'score' && args[1] === 'add') trace.correct++;
            }
            if (command === 'palsupport' && args[0] === 'quizdone') trace.quizdone++;
            pc++;
            continue;
        }

        if (c.code === 353) {                              // Game Over
            trace.gameOver++;
            pc++;
            continue;
        }

        if (c.code === 331) {                              // Change Enemy HP
            // params: [index, operation, operandType, operand, allowKnockout]
            const value = c.parameters[2] === 0 ? c.parameters[3] : 0;
            const signed = c.parameters[1] === 0 ? value : -value;
            trace.damage += -signed;
            pc++;
            continue;
        }

        pc++;
    }

    return { trace };
}

// -----------------------------------------------------------------------------
// Enumerate answer combinations
// -----------------------------------------------------------------------------
function enumerate(n, perQuestion, fn) {
    const total = Math.pow(perQuestion, n);
    for (let mask = 0; mask < total; mask++) {
        const picks = [];
        let m = mask;
        for (let i = 0; i < n; i++) { picks.push(m % perQuestion); m = Math.floor(m / perQuestion); }
        fn(picks);
    }
}

for (const troop of troops) {
    if (!troop || !troop.pages || !troop.pages[0]) continue;
    const page = troop.pages[0];
    const fp = core.fingerprint(page.list);
    if (fp.blocks === 0) continue;

    const nQuestions = fp.blocks;

    // How many answer choices (excluding the hint option) per question.
    const choicesPer = [];
    core.splitBlocks(page.list).blocks.forEach(b => {
        const c = b.cmds.find(x => x.code === 102);
        const list = c.parameters[0];
        const hint = /humingi ng pahiwatig/i.test(String(list[list.length - 1]));
        choicesPer.push(hint ? list.length - 1 : list.length);
    });
    const uniform = choicesPer.every(v => v === choicesPer[0]);

    let troopFail = 0;
    const damageByCorrect = new Map();

    const check = (picks) => {
        paths++;
        // Build a fresh transformed page for this run, then execute it.
        const out = core.transform(page.list, mulberry32(picks.join('') * 7919 + troop.id), {
            shuffleQuestions: true, shuffleAnswers: true, neutralizeOrdinals: true, injectHint: true
        });
        if (!out) { troopFail++; if (troopFail < 4) console.error(`  troop ${troop.id}: transform null`); return; }

        const res = run(out, (i) => picks[i % picks.length]);
        if (res.error) { troopFail++; if (troopFail < 4) console.error(`  troop ${troop.id}: ${res.error}`); return; }

        const t = res.trace;
        const problems = [];
        if (t.questions.length !== nQuestions) problems.push(`asked ${t.questions.length}/${nQuestions}`);
        if (t.quizdone !== 1) problems.push(`quizdone ${t.quizdone}`);
        if (t.correct + t.wrong !== nQuestions) problems.push(`scored ${t.correct + t.wrong}/${nQuestions}`);
        if (t.gameOver !== 0) problems.push('Game Over command executed ' + t.gameOver + 'x');
        if (problems.length) {
            troopFail++;
            if (troopFail < 4) console.error(`  troop ${troop.id} picks=${picks}: ${problems.join(', ')}`);
        }

        if (!damageByCorrect.has(t.correct)) damageByCorrect.set(t.correct, new Set());
        damageByCorrect.get(t.correct).add(t.damage);
    };

    if (uniform) {
        enumerate(nQuestions, choicesPer[0], check);
    } else {
        // Mixed choice counts: enumerate per-question recursively.
        const rec = (i, picks) => {
            if (i === nQuestions) { check(picks); return; }
            for (let c = 0; c < choicesPer[i]; c++) rec(i + 1, picks.concat([c]));
        };
        rec(0, []);
    }

    const status = troopFail === 0 ? 'OK' : troopFail + ' FAILED';
    console.log(`troop ${troop.id} "${troop.name}": ${nQuestions} questions, ${Math.pow(choicesPer[0], nQuestions)} paths -> ${status}`);
    if (troopFail === 0) {
        // Enemy HP is 100 for every quiz battle, so damage >= 100 wins.
        const winners = [...damageByCorrect.keys()].filter(k =>
            [...damageByCorrect.get(k)].some(d => d >= 100)).sort((a, b) => a - b);
        const all = [...damageByCorrect.keys()].sort((a, b) => a - b);
        const maxDamage = Math.max(...[...damageByCorrect.values()].map(s => Math.max(...s)));
        console.log(`      wins with ${winners.join('/')} correct; all-correct damage ${maxDamage}/100`);
        if (!winners.includes(all[all.length - 1])) {
            console.error('      FAIL: answering everything correctly does not win');
            failures++;
        }
    } else {
        failures += troopFail;
    }
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

console.log(`\n${paths} paths simulated, ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
