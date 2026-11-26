//=============================================================================
// tools/add_quiz_rewards.js
//
// Adds an announced reward to the "If Win" branch of every quiz battle, so the
// player is actually told what they earned.
//
// Why this is needed: every quiz boss already drops something through the enemy
// drop table, but BattleHUD sets the battle log window's opacity to 0
// (BattleHUD.js, _suppressDefaultBattleUI), so MV's "Obtained Potion!" line is
// never visible. The items were being granted invisibly.
//
// The edit is surgical. These map files store exactly one event per line, each
// line being JSON.stringify(event). The script proves that for every event
// before touching anything, then rewrites only the touched event's line, so
// every other byte of the file is preserved. Line endings (some maps are CRLF,
// some LF) are kept exactly as they were.
//
// Usage:  node tools/add_quiz_rewards.js [--check]
//=============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');

// itemId: 1 = Potion (+500 HP), 6 = candy (+10 Candy Points)
const POTION = 1;
const CANDY = 6;

// One entry per battle event. Map025 and Map043 each hold two copies of the
// same fight on adjacent tiles, so both must be edited or the reward would
// depend on which tile the player happened to step on.
//
// afterCode picks the anchor: the reward goes straight after the chapter prize
// (gainItem), or after the tutorial's Recover All.
const REWARDS = [
    { file: 'Map002.json', event: 4, potions: 1, candy: 1, label: 'Tutorial', afterCode: 314 },
    { file: 'Map025.json', event: 2, potions: 1, candy: 2, label: 'Fanatio' },
    { file: 'Map025.json', event: 3, potions: 1, candy: 2, label: 'Fanatio' },
    { file: 'Map035.json', event: 4, potions: 1, candy: 2, label: 'Malviro' },
    { file: 'Map034.json', event: 29, potions: 1, candy: 2, label: 'Shadow' },
    { file: 'Map047.json', event: 5, potions: 1, candy: 2, label: 'Veyra' },
    { file: 'Map043.json', event: 15, potions: 2, candy: 3, label: 'Morrivelle' },
    { file: 'Map043.json', event: 19, potions: 2, candy: 3, label: 'Morrivelle' }
];

const IF_WIN = 601;
const IF_LOSE = 603;
const END_BRANCH = 604;
const GAIN_ITEM = 126;

function rewardCommands(r, indent) {
    const parts = [];
    if (r.potions > 0) parts.push('Potion x' + r.potions);
    if (r.candy > 0) parts.push('candy x' + r.candy);
    return [
        { code: GAIN_ITEM, indent: indent, parameters: [POTION, 0, 0, r.potions] },
        { code: GAIN_ITEM, indent: indent, parameters: [CANDY, 0, 0, r.candy] },
        { code: 101, indent: indent, parameters: ['', 0, 1, 2] },
        { code: 401, indent: indent, parameters: ['Nakuha mo ang gantimpala:'] },
        { code: 401, indent: indent, parameters: [parts.join(' at ') + '.'] }
    ];
}

// [start, end) of the If Win block.
function winBlock(list) {
    const start = list.findIndex(c => c.code === IF_WIN);
    if (start < 0) return null;
    let end = list.findIndex((c, i) => i > start && (c.code === IF_LOSE || c.code === END_BRANCH));
    if (end < 0) end = list.length;
    return [start, end];
}

function alreadyRewarded(list) {
    const b = winBlock(list);
    if (!b) return false;
    for (let i = b[0]; i < b[1]; i++) {
        const c = list[i];
        if (c.code !== GAIN_ITEM) continue;
        if (c.parameters[0] !== POTION && c.parameters[0] !== CANDY) continue;
        const next = list[i + 1];
        if (next && next.code === GAIN_ITEM) return true;
    }
    return false;
}

// Adds the reward to every If Win page of the event. Returns the number of
// commands added, 0 when there is no win branch, or -1 when already rewarded.
function editEvent(ev, r) {
    let added = 0;
    ev.pages.forEach(pg => {
        const list = pg.list;
        if (!Array.isArray(list)) return;
        const b = winBlock(list);
        if (!b) return;
        if (alreadyRewarded(list)) { added = -1; return; }

        const anchorCode = r.afterCode || GAIN_ITEM;
        let at = b[0];
        for (let i = b[0] + 1; i < b[1]; i++) {
            if (list[i].code === anchorCode) { at = i; break; }
        }
        const add = rewardCommands(r, list[at].indent);
        list.splice(at + 1, 0, ...add);
        added += add.length;
    });
    return added;
}

function main() {
    const checkOnly = process.argv.includes('--check');
    const byFile = {};
    for (const r of REWARDS) (byFile[r.file] = byFile[r.file] || []).push(r);

    let totalAdded = 0;
    const touched = [];

    for (const [file, list] of Object.entries(byFile)) {
        const filePath = path.join(DATA, file);
        const text = fs.readFileSync(filePath, 'utf8');
        const eol = text.includes('\r\n') ? '\r\n' : '\n';
        const lines = text.split(eol);
        const parsed = JSON.parse(text);

        // Hard proof that this file really is one event per line, so a surgical
        // line replacement cannot lose anything. If a file were ever saved in a
        // different format this throws instead of corrupting it.
        const lineOf = {};
        (parsed.events || []).forEach(e => {
            if (!e) return;
            const want = JSON.stringify(e);
            const idx = lines.findIndex(l => l.startsWith('{"id":' + e.id + ','));
            if (idx < 0) throw new Error(file + ': event ' + e.id + ' not found on a single line');
            if (lines[idx].replace(/,$/, '') !== want) {
                throw new Error(file + ': event ' + e.id + ' is not a verbatim JSON line; refusing to edit');
            }
            lineOf[e.id] = idx;
        });

        const before = {};
        (parsed.events || []).forEach(e => { if (e) before[e.id] = JSON.stringify(e); });

        let changed = false;
        for (const r of list) {
            const idx = lineOf[r.event];
            if (idx === undefined) throw new Error(file + ': event ' + r.event + ' not found');

            const line = lines[idx];
            const hadComma = line.endsWith(',');
            const ev = JSON.parse(line.replace(/,$/, ''));

            const added = editEvent(ev, r);
            if (added === 0) throw new Error(file + ' ev' + r.event + ': no If Win branch found');
            if (added < 0) {
                console.log('  ' + file + ' ev' + r.event + ' (' + r.label + '): already rewarded, skipped');
                continue;
            }

            lines[idx] = JSON.stringify(ev) + (hadComma ? ',' : '');
            changed = true;
            totalAdded += added;
            touched.push(file + ' ev' + r.event + ' (' + r.label + '): +' + added +
                ' commands, Potion x' + r.potions + ', candy x' + r.candy);
        }

        const out = lines.join(eol);

        // The whole file must still parse, and every event other than the
        // edited ones must serialize identically to before.
        const recheck = JSON.parse(out);
        const editedIds = list.map(r => r.event);
        (recheck.events || []).forEach(e => {
            if (!e || editedIds.includes(e.id)) return;
            if (JSON.stringify(e) !== before[e.id]) {
                throw new Error(file + ': event ' + e.id + ' changed unexpectedly');
            }
        });

        if (checkOnly) {
            console.log('  ' + file + ': parses cleanly, ' + editedIds.length + ' battle event(s) to update' +
                (changed ? '' : ' (already done)'));
            continue;
        }
        if (!changed) {
            console.log('  ' + file + ': nothing to write');
            continue;
        }
        fs.writeFileSync(filePath, out, 'utf8');
        console.log('  wrote ' + file + ' (' + (eol === '\r\n' ? 'CRLF' : 'LF') + ')');
    }

    if (!checkOnly) {
        touched.forEach(t => console.log('    ' + t));
        console.log('\n' + totalAdded + ' commands added across ' + touched.length + ' event(s).');
    }
}

main();
