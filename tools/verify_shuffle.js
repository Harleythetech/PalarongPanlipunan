//=============================================================================
// tools/verify_shuffle.js
//
// Fuzz-tests js/plugins/PalQuiz.js against the real troop data.
//
// For every battle and every random permutation it asserts that:
//   - the transform returns a list (never null for valid input)
//   - the number of Show Choices / When / End Choices is unchanged
//   - the number of correct and wrong score commands is unchanged
//   - every Jump to Label still resolves
//   - every block still has exactly one Show Choices and one End Choices
//   - the chain starting at Q1 visits every question exactly once and ends
//   - every answer branch still carries its own score command, so a correct
//     answer can never be paired with the wrong feedback
//   - the Hint option is always the last choice
//
// Usage:  node tools/verify_shuffle.js [iterations]
//=============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const core = require('../js/plugins/PalQuiz.js');

const ROOT = path.resolve(__dirname, '..');
const ITER = Number(process.argv[2] || 200);

const troops = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'Troops.json'), 'utf8'));

function countScore(list) {
    let ok = 0, bad = 0;
    for (const c of list) {
        if (c.code !== 356) continue;
        const t = (c.parameters || []).join(' ').toLowerCase();
        if (/score add/.test(t)) ok++;
        if (/enemyscore add/.test(t)) bad++;
    }
    return { ok, bad };
}

function branchScores(list) {
    // Map every When branch to the score commands inside it.
    const blocks = core.splitBlocks(list);
    const out = [];
    for (const b of blocks.blocks) {
        const parts = core.splitBranches(b.cmds);
        const per = parts.branches.map(br => {
            let ok = 0, bad = 0;
            for (const c of br.cmds) {
                if (c.code !== 356) continue;
                const t = (c.parameters || []).join(' ').toLowerCase();
                if (/score add/.test(t)) ok++;
                if (/enemyscore add/.test(t)) bad++;
            }
            return ok + '/' + bad;
        });
        out.push(per.slice().sort().join(','));
    }
    return out;
}

function choiceTexts(list) {
    const blocks = core.splitBlocks(list);
    return blocks.blocks.map(b => {
        const c = b.cmds.find(x => x.code === 102);
        return c.parameters[0].slice().sort().join('|');
    });
}

// How many blocks actually offer the hint option. Troop 2 (Fanatio) has none.
function hintBlocks(list) {
    const blocks = core.splitBlocks(list);
    let n = 0;
    for (const b of blocks.blocks) {
        const c = b.cmds.find(x => x.code === 102);
        const choices = c.parameters[0];
        if (/humingi ng pahiwatig/i.test(String(choices[choices.length - 1]))) n++;
    }
    return n;
}

// For every block, map choice text -> answer kind. This is the check that
// proves a correct answer can never end up attached to a wrong-answer branch.
function pairings(list) {
    const blocks = core.splitBlocks(list);
    const out = [];
    for (const b of blocks.blocks) {
        const parts = core.splitBranches(b.cmds);
        const pairs = parts.branches.map(br => {
            const text = String(br.cmds[0].parameters[1]);
            let kind = 'none';
            for (const c of br.cmds) {
                if (c.code !== 356) continue;
                const t = (c.parameters || []).join(' ').toLowerCase();
                if (/enemyscore add/.test(t)) kind = 'wrong';
                else if (/score add/.test(t)) kind = 'correct';
            }
            return text + '=>' + kind;
        });
        out.push(pairs.slice().sort().join(','));
    }
    return out;
}

function walkChain(list) {
    // Follow the event from Q1 through the jump graph the way the interpreter
    // would for the "advance" path, and report the visited labels.
    const idx = {};
    const blocks = [];
    list.forEach((c, i) => {
        if (c.code === 118 && c.indent === 0) {
            idx[c.parameters[0]] = i;
            blocks.push({ name: c.parameters[0], start: i });
        }
    });
    if (!blocks.length) return { visited: [], ended: true };

    // Advance targets: from each block, the jumps that are NOT self-targets.
    const visited = [blocks[0].name];
    let cur = blocks[0].name;
    const seen = new Set([cur]);

    for (let guard = 0; guard < 100; guard++) {
        const b = blocks.find(x => x.name === cur);
        const end = blocks.indexOf(b) + 1 < blocks.length ? blocks[blocks.indexOf(b) + 1].start : list.length;
        const seg = list.slice(b.start, end);
        const jumps = seg.filter(c => c.code === 119).map(c => c.parameters[0]);
        const next = jumps.find(t => t !== cur);
        if (!next) return { visited, ended: true };       // fell through to the end
        if (seen.has(next)) return { visited, loop: next };
        seen.add(next);
        visited.push(next);
        cur = next;
    }
    return { visited, loop: 'guard' };
}

let failures = 0;
let transformed = 0;

for (const troop of troops) {
    if (!troop) continue;
    const page = troop.pages[0];
    if (!page || !page.list || !page.list.length) continue;

    const fp0 = core.fingerprint(page.list);
    if (fp0.blocks === 0) {
        console.log(`troop ${troop.id} "${troop.name}": no labelled questions, skipped`);
        continue;
    }

    const before = {
        fp: fp0,
        scores: countScore(page.list),
        branches: branchScores(page.list),
        choices: choiceTexts(page.list),
        pairings: pairings(page.list),
        labels: page.list.filter(c => c.code === 118 && c.indent === 0).length,
        hints: hintBlocks(page.list)
    };

    for (let i = 0; i < ITER; i++) {
        const out = core.transform(page.list, Math.random, {
            shuffleQuestions: true,
            shuffleAnswers: true,
            injectHint: true
        });

        const fail = (msg) => {
            failures++;
            console.error(`FAIL troop ${troop.id} "${troop.name}" iter ${i}: ${msg}`);
        };

        if (!out) { fail('transform returned null'); continue; }
        transformed++;

        const after = {
            fp: core.fingerprint(out),
            scores: countScore(out),
            branches: branchScores(out),
            choices: choiceTexts(out),
            pairings: pairings(out),
            labels: out.filter(c => c.code === 118 && c.indent === 0).length,
            hints: hintBlocks(out)
        };

        if (after.fp.choices !== before.fp.choices) fail('choice count changed');
        if (after.fp.whens !== before.fp.whens) fail('when count changed');
        if (after.fp.ends !== before.fp.ends) fail('end count changed');
        if (after.labels !== before.labels) fail('label count changed');

        if (after.scores.ok !== before.scores.ok) fail(`correct answers ${before.scores.ok} -> ${after.scores.ok}`);
        if (after.scores.bad !== before.scores.bad) fail(`wrong branches ${before.scores.bad} -> ${after.scores.bad}`);

        // Same multiset of per-branch score fingerprints: no answer moved
        // without its feedback.
        const b1 = before.branches.slice().sort().join('#');
        const b2 = after.branches.slice().sort().join('#');
        if (b1 !== b2) fail('branch score pairing changed');

        // Same multiset of choice text per block.
        const c1 = before.choices.slice().sort().join('#');
        const c2 = after.choices.slice().sort().join('#');
        if (c1 !== c2) fail('choice text set changed');

        // Each choice still points at its own answer branch.
        const p1 = before.pairings.slice().sort().join('#');
        const p2 = after.pairings.slice().sort().join('#');
        if (p1 !== p2) fail('choice -> answer pairing changed');

        if (!core.allJumpTargetsResolve(out)) fail('unresolved jump target');

        // Every block still has exactly one Show Choices / End Choices.
        const blocks = core.splitBlocks(out).blocks;
        for (const b of blocks) {
            const n102 = b.cmds.filter(c => c.code === 102 && c.indent === 0).length;
            const n404 = b.cmds.filter(c => c.code === 404 && c.indent === 0).length;
            if (n102 !== 1 || n404 !== 1) { fail(`block ${b.label} malformed (${n102}/${n404})`); break; }
        }

        // The advance chain must visit every question exactly once.
        const chain = walkChain(out);
        if (chain.loop) fail(`chain loops at ${chain.loop}`);
        if (chain.visited.length !== before.labels) {
            fail(`chain visits ${chain.visited.length}/${before.labels} questions`);
        }

        // Hint availability must survive the permutation, but a battle that
        // never offered a hint (troop 2, Fanatio) must not gain or lose one.
        if (after.hints !== before.hints) fail(`hint blocks ${before.hints} -> ${after.hints}`);

        for (const b of blocks) {
            const c = b.cmds.find(x => x.code === 102);
            const choices = c.parameters[0];
            const hintAt = [];
            choices.forEach((t, i) => {
                if (/humingi ng pahiwatig/i.test(String(t))) hintAt.push(i);
            });
            if (!hintAt.length) continue;

            if (hintAt.length !== 1 || hintAt[0] !== choices.length - 1) {
                fail(`block ${b.label}: hint option not last (${JSON.stringify(hintAt)} of ${choices.length})`);
                break;
            }
            const hasHintCmd = b.cmds.some(cmd => cmd.code === 356 &&
                (cmd.parameters || []).join(' ').toLowerCase() === 'palsupport hint');
            if (!hasHintCmd) { fail(`block ${b.label}: hint option without PalSupport hint`); break; }
        }

        // quizdone present exactly once.
        const done = out.filter(c => c.code === 356 &&
            /palsupport quizdone/i.test((c.parameters || []).join(' '))).length;
        if (done !== 1) fail(`quizdone count ${done}`);
    }

    console.log(`troop ${troop.id} "${troop.name}": ${ITER} permutations OK`);
}

console.log(`\ntransformed ${transformed} lists, ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
