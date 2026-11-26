//=============================================================================
// tools/simulate_battle.js
//
// Executes the transformed troop event with a tiny interpreter and enumerates
// every possible combination of answers. Proves that, for every path:
//
//   - execution terminates (never falls off the end mid-question)
//   - every question is asked exactly once
//   - "PalSupport quizdone" runs exactly once, at the very end
//   - the enemy takes damage on exactly the correct answers, and only then
//   - the damage curve is sane: no answer kills the enemy mid-quiz, no single
//     wrong answer can knock out a party member, and quizdone carries the
//     number of correct answers needed to pass
//   - the damage is scaled by the question count: the same total health is at
//     stake in a 3-question quiz and a 7-question quiz, so the per-answer cost
//     differs between them
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
const enemies = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'Enemies.json'), 'utf8'));

const PARTY_MAX_HP = 100;   // Harold at level 1
const PASS_RATIO = 0.5;
const WRONG_SHARE = 0.5;    // the whole quiz's cost if every answer is wrong

let failures = 0;
let paths = 0;

// What each quiz length costs when every answer is wrong, so the totals can be
// compared across lengths at the end.
const totals = [];
const perAnswerByLength = {};

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

    const enemyMaxHp = Math.max(1, ...(troop.members || []).map(m => {
        const e = enemies[m.enemyId];
        return e && e.params ? Number(e.params[0]) || 0 : 0;
    }));
    const plan = core.damagePlan(nQuestions, {
        enemyMaxHp: enemyMaxHp,
        partyMaxHp: PARTY_MAX_HP,
        passRatio: PASS_RATIO,
        wrongDamageShare: WRONG_SHARE
    });

    // One shuffle for the entire battle, exactly like the game: choices do not
    // re-shuffle between answers, so a pick index always means the same answer.
    // (Seeding per path made "answer everything correctly" unreachable.)
    const out = core.transform(page.list, mulberry32(troop.id * 7919), {
        shuffleQuestions: true,
        shuffleAnswers: true,
        neutralizeOrdinals: true,
        softenGameOver: true,
        injectHint: true,
        normalizeDamage: true,
        enemyMaxHp: enemyMaxHp,
        partyMaxHp: PARTY_MAX_HP,
        passRatio: PASS_RATIO,
        wrongDamageShare: WRONG_SHARE
    });
    if (!out) {
        console.error(`troop ${troop.id} "${troop.name}": transform returned null`);
        failures++;
        continue;
    }

    let troopFail = 0;
    const damageByCorrect = new Map();

    // The normalised commands must all carry the planned values.
    const wrongHits = out.filter(c => c.code === 311);
    if (!wrongHits.length) {
        console.error(`troop ${troop.id}: no party-damage command on wrong answers`);
        failures++;
    }
    wrongHits.forEach(c => {
        if (c.parameters[4] !== plan.party) {
            console.error(`troop ${troop.id}: wrong-answer damage is ${c.parameters[4]}, expected ${plan.party}`);
            failures++;
        }
    });
    const enemyHits = out.filter(c => c.code === 331);
    if (enemyHits.length !== nQuestions) {
        console.error(`troop ${troop.id}: ${enemyHits.length} enemy-damage commands for ${nQuestions} questions`);
        failures++;
    }
    enemyHits.forEach(c => {
        if (c.parameters[3] !== plan.enemy) {
            console.error(`troop ${troop.id}: correct-answer damage is ${c.parameters[3]}, expected ${plan.enemy}`);
            failures++;
        }
    });

    const check = (picks) => {
        paths++;
        const res = run(out, (i) => picks[i % picks.length]);
        if (res.error) { troopFail++; if (troopFail < 4) console.error(`  troop ${troop.id}: ${res.error}`); return; }

        const t = res.trace;
        const problems = [];
        if (t.questions.length !== nQuestions) problems.push(`asked ${t.questions.length}/${nQuestions}`);
        if (t.quizdone !== 1) problems.push(`quizdone ${t.quizdone}`);
        if (t.correct + t.wrong !== nQuestions) problems.push(`scored ${t.correct + t.wrong}/${nQuestions}`);
        if (t.gameOver !== 0) problems.push('Game Over command executed ' + t.gameOver + 'x');
        if (t.damage !== t.correct * plan.enemy) {
            problems.push(`damage ${t.damage} for ${t.correct} correct, expected ${t.correct * plan.enemy}`);
        }
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
        const maxDamage = Math.max(...[...damageByCorrect.values()].map(s => Math.max(...s)));
        const scores = [...damageByCorrect.keys()].sort((a, b) => a - b);

        console.log(`      correct: ${plan.enemy} dmg (never lethal)  ->  ${plan.steps}/${nQuestions} right passes`);
        console.log(`      wrong:   ${plan.party} dmg  ->  all ${nQuestions} wrong = ${plan.party * nQuestions}/${PARTY_MAX_HP} HP`);
        console.log(`      max enemy damage ${maxDamage}/${enemyMaxHp}; scores reached ${scores.join('/')}`);

        // The same total budget has to come out of every quiz, whatever its
        // length: that is the point of scaling the damage by the question count.
        const budget = Math.floor(PARTY_MAX_HP * WRONG_SHARE);
        const totalWrong = plan.party * nQuestions;
        if (totalWrong > budget) {
            console.error(`      FAIL: ${nQuestions} wrong answers cost ${totalWrong}, over the ${budget} budget`);
            failures++;
        }
        if (totalWrong < budget - nQuestions) {
            console.error(`      FAIL: ${nQuestions} wrong answers cost only ${totalWrong} of a ${budget} budget`);
            failures++;
        }
        if (plan.party !== Math.max(1, Math.floor(budget / nQuestions))) {
            console.error(`      FAIL: per-answer damage ${plan.party} does not match budget ${budget} / ${nQuestions}`);
            failures++;
        }
        totals.push(totalWrong);
        perAnswerByLength[nQuestions] = plan.party;

        // Every possible score must be reachable.
        const all = [];
        for (let k = 0; k <= nQuestions; k++) all.push(k);
        if (scores.join('/') !== all.join('/')) {
            console.error(`      FAIL: scores ${scores.join('/')} != ${all.join('/')}`);
            failures++;
        }

        // The enemy has to survive every path: MV ends the battle the moment the
        // last enemy dies, which would cut the quiz short and skip quizdone.
        if (maxDamage >= enemyMaxHp) {
            console.error('      FAIL: the enemy can die before quizdone (the quiz would end early)');
            failures++;
        }

        if (plan.party >= PARTY_MAX_HP) {
            console.error('      FAIL: one wrong answer can knock out a party member');
            failures++;
        }

        // And the injected command must carry the pass threshold.
        const done = out.filter(c => c.code === 356 && /^palsupport quizdone/i.test(String(c.parameters[0])));
        const want = 'PalSupport quizdone ' + nQuestions + ' ' + plan.steps;
        if (done.length !== 1 || String(done[0].parameters[0]) !== want) {
            console.error(`      FAIL: expected "${want}", got ${done.map(c => c.parameters[0]).join(' | ') || 'none'}`);
            failures++;
        }

        // Sanity: the pass threshold must be reachable and not the whole quiz
        // unless passRatio demands it.
        if (plan.steps < 1 || plan.steps > nQuestions) {
            console.error(`      FAIL: pass threshold ${plan.steps} out of range for ${nQuestions} questions`);
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

// Cross-length check: the scaled damage has to make quiz length irrelevant to
// the total stake.
{
    const lengths = Object.keys(perAnswerByLength).map(Number).sort((a, b) => a - b);
    const budget = Math.floor(PARTY_MAX_HP * WRONG_SHARE);
    console.log('\nall-wrong cost by quiz length:');
    for (const n of lengths) {
        const per = perAnswerByLength[n];
        console.log(`      ${n} questions: ${per} dmg each = ${per * n}/${PARTY_MAX_HP}`);
    }

    // Short and long quizzes must differ per answer, or the damage is still flat.
    const distinct = new Set(lengths.map(n => perAnswerByLength[n]));
    if (lengths.length > 1 && distinct.size === 1) {
        console.error('      FAIL: per-answer damage is identical for every quiz length (not scaled)');
        failures++;
    }

    // ...and every length has to land on the same total, within one answer of
    // the budget (floor division).
    for (const n of lengths) {
        const total = perAnswerByLength[n] * n;
        if (total > budget || total < budget - n) {
            console.error(`      FAIL: ${n} questions cost ${total}, expected about ${budget}`);
            failures++;
        }
    }

    // A longer quiz must never cost more per answer than a shorter one.
    for (let i = 1; i < lengths.length; i++) {
        if (perAnswerByLength[lengths[i]] > perAnswerByLength[lengths[i - 1]]) {
            console.error('      FAIL: a longer quiz costs more per answer than a shorter one');
            failures++;
        }
    }
}

console.log(`\n${paths} paths simulated, ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
