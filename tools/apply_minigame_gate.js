//=============================================================================
// tools/apply_minigame_gate.js
//
// Two surgical changes, both inside data/Map034.json ("Nayon ng Mayumi"):
//
//   1. GATE the Shadow battle (event 29) behind the Mang Isko mini-game, so the
//      selection game cannot be walked past.
//   2. REWARD the mini-game with candy, so it feeds the Candy Points economy
//      like every quiz victory does.
//
// ── Why the gate is a variable, not a switch ────────────────────────────────
// The obvious gate is a new switch set by the mini-game. That would SOFT-LOCK
// existing saves: a player who already finished the mini-game is on the event's
// page 4 ("Kamusta kayo bata?"), so page 1 never runs again, the new switch is
// never set, and the boss becomes permanently unreachable.
//
// Instead the gate reads V2 "Material_Count", which the mini-game itself sets to
// 0 on entry and increments once per correct pick. It reaches 3 only by
// finishing the game, and it is stored in the save file, so it is correct for:
//
//   new game, mini-game not done   V2 = 0  -> blocked (intended)
//   new game, mini-game done       V2 = 3+ -> allowed
//   old save, mini-game done       V2 = 3+ -> allowed   (no soft-lock)
//   old save, boss already beaten  self switch A on -> blank page (unchanged)
//
// ── Page order ──────────────────────────────────────────────────────────────
// MV's Game_Event.findProperPageIndex scans pages BACKWARDS and takes the first
// whose conditions are met, so the highest matching page wins. Event 29 becomes:
//
//   page 1  (always)      "go back to Mang Isko" message
//   page 2  (V2 >= 3)     the battle, unchanged
//   page 3  (self switch A) blank, unchanged
//
// That ordering keeps the already-beaten case (self switch A) at the top, so a
// finished fight can never be re-triggered.
//
// Usage:  node tools/apply_minigame_gate.js [--check]
//=============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const FILE = 'Map034.json';

const CANDY = 6;

// Event 1 = Mang Isko (the mini-game). Event 29 = the Shadow battle.
const EVENT_MINIGAME = 1;
const EVENT_BOSS = 29;
const GATE_VAR = 2;         // "Material_Count"
const GATE_VALUE = 3;       // three correct picks = the mini-game is finished
const CANDY_REWARD = 2;     // +20 Candy Points

const GAIN_ITEM = 126;
const IF = 111;
const SELF_SWITCH = 123;
const BATTLE = 301;
const NAV_ARROW = 356;

// The reward is announced with Show Text: the mini-game runs on the map, but
// keeping the same "Nakuha mo ang gantimpala:" wording as the battle rewards
// makes the two reads consistent.
function rewardCommands(indent) {
    return [
        { code: GAIN_ITEM, indent: indent, parameters: [CANDY, 0, 0, CANDY_REWARD] },
        { code: 101, indent: indent, parameters: ['', 0, 1, 2] },
        { code: 401, indent: indent, parameters: ['Nakuha mo ang gantimpala:'] },
        { code: 401, indent: indent, parameters: ['candy x' + CANDY_REWARD + '.'] }
    ];
}

function blockedCommands() {
    return [
        { code: 101, indent: 0, parameters: ['', 0, 1, 2] },
        { code: 401, indent: 0, parameters: ['Sandali... may itinuturo pa si Mang Isko'] },
        { code: 401, indent: 0, parameters: ['na hindi natin napakinggan.'] },
        { code: 101, indent: 0, parameters: ['Actor2', 4, 1, 2] },
        { code: 401, indent: 0, parameters: ['Arkin: Tama, bumalik muna tayo sa kanya'] },
        { code: 401, indent: 0, parameters: ['bago natin harapin si Shadow.'] },
        { code: NAV_ARROW, indent: 0, parameters: ['NavArrow event ' + EVENT_MINIGAME] },
        { code: 0, indent: 0, parameters: [] }
    ];
}

//-----------------------------------------------------------------------------
// Event 29 — insert the blocking page and gate the battle on the variable
//-----------------------------------------------------------------------------
function gateBoss(ev) {
    const pages = ev.pages;

    const battleAt = pages.findIndex(pg => (pg.list || []).some(c => c.code === BATTLE));
    if (battleAt < 0) throw new Error('event 29: no page contains a battle command');

    // Idempotency: the blocking page is the only page that points the arrow at
    // the mini-game and has no battle.
    const already = pages.some(pg =>
        (pg.list || []).some(c => c.code === NAV_ARROW &&
            String(c.parameters[0]) === 'NavArrow event ' + EVENT_MINIGAME) &&
        !(pg.list || []).some(c => c.code === BATTLE));
    if (already) return { changed: false };

    const battlePage = pages[battleAt];

    // The battle page must not already carry unrelated conditions, or adding
    // the variable would silently change what the page means.
    const c = battlePage.conditions;
    if (c.actorValid || c.itemValid || c.selfSwitchValid || c.switch1Valid || c.switch2Valid || c.variableValid) {
        throw new Error('event 29: the battle page already has conditions; refusing to guess');
    }

    // The blocking page is a clone of the battle page so every other property
    // (image, trigger, priority, move settings) stays identical — only the
    // conditions stay empty and the command list is replaced.
    const blocked = JSON.parse(JSON.stringify(battlePage));
    blocked.list = blockedCommands();

    battlePage.conditions.variableValid = true;
    battlePage.conditions.variableId = GATE_VAR;
    battlePage.conditions.variableValue = GATE_VALUE;

    // Reverse-scan priority means the LAST page wins, so: blocked (always),
    // battle (V2 >= 3), blank (self switch A). The blank page must stay last.
    pages.splice(battleAt, 0, blocked);

    return { changed: true, blockedAt: battleAt };
}

//-----------------------------------------------------------------------------
// Event 1 — grant candy once, at the moment the mini-game is completed
//-----------------------------------------------------------------------------
function rewardMinigame(ev) {
    const list = ev.pages[0].list;

    // Idempotency.
    if (list.some(c => c.code === GAIN_ITEM && c.parameters[0] === CANDY)) {
        return { changed: false };
    }

    // Completion is the "if Material_Count >= 3" branch on page 1. The reward
    // goes right before the self switch that ends the mini-game, so it is inside
    // that branch and therefore granted exactly once.
    const ifAt = list.findIndex(c => c.code === IF &&
        c.parameters[0] === 1 &&
        c.parameters[1] === GATE_VAR &&
        c.parameters[2] === 0 &&
        c.parameters[3] === GATE_VALUE &&
        c.parameters[4] === 1);
    if (ifAt < 0) throw new Error('event 1: the "Material_Count >= 3" branch was not found');

    let endAt = -1;
    for (let i = ifAt + 1; i < list.length; i++) {
        const c = list[i];
        if (c.code === SELF_SWITCH && c.parameters[0] === 'A' && c.parameters[1] === 0) {
            endAt = i;
            break;
        }
        // Never cross out of the branch.
        if (c.code === 411 || c.code === 412) break;
    }
    if (endAt < 0) throw new Error('event 1: the branch end (self switch A on) was not found');

    list.splice(endAt, 0, ...rewardCommands(list[endAt].indent));
    return { changed: true, at: endAt };
}

//-----------------------------------------------------------------------------
function main() {
    const checkOnly = process.argv.includes('--check');
    const filePath = path.join(DATA, FILE);
    const text = fs.readFileSync(filePath, 'utf8');
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(eol);
    const parsed = JSON.parse(text);

    // Prove the file really is one verbatim JSON event per line before editing.
    const lineOf = {};
    (parsed.events || []).forEach(e => {
        if (!e) return;
        const want = JSON.stringify(e);
        const idx = lines.findIndex(l => l.startsWith('{"id":' + e.id + ','));
        if (idx < 0) throw new Error(FILE + ': event ' + e.id + ' is not on a single line');
        if (lines[idx].replace(/,$/, '') !== want) {
            throw new Error(FILE + ': event ' + e.id + ' is not verbatim JSON; refusing to edit');
        }
        lineOf[e.id] = idx;
    });

    const before = {};
    (parsed.events || []).forEach(e => { if (e) before[e.id] = JSON.stringify(e); });

    const boss = parsed.events.find(e => e && e.id === EVENT_BOSS);
    const mini = parsed.events.find(e => e && e.id === EVENT_MINIGAME);
    if (!boss) throw new Error('event ' + EVENT_BOSS + ' not found');
    if (!mini) throw new Error('event ' + EVENT_MINIGAME + ' not found');
    if (String(mini.name).trim() !== 'Mang Isko') {
        throw new Error('event ' + EVENT_MINIGAME + ' is not Mang Isko; refusing to guess');
    }

    const g = gateBoss(boss);
    const r = rewardMinigame(mini);

    if (!g.changed && !r.changed) {
        console.log('  ' + FILE + ': already applied, nothing to do');
        return;
    }

    // Write back only the touched event lines.
    for (const [ev, changed] of [[boss, g.changed], [mini, r.changed]]) {
        if (!changed) continue;
        const idx = lineOf[ev.id];
        const hadComma = lines[idx].endsWith(',');
        lines[idx] = JSON.stringify(ev) + (hadComma ? ',' : '');
    }

    const out = lines.join(eol);

    // Whole-file checks: still parses, and no untouched event moved.
    const recheck = JSON.parse(out);
    (recheck.events || []).forEach(e => {
        if (!e || e.id === EVENT_BOSS || e.id === EVENT_MINIGAME) return;
        if (JSON.stringify(e) !== before[e.id]) {
            throw new Error(FILE + ': event ' + e.id + ' changed unexpectedly');
        }
    });

    const summary = [];
    if (g.changed) {
        summary.push('event ' + EVENT_BOSS + ' (Shadow battle): added a blocking page at index ' +
            (g.blockedAt + 1) + ', battle now gated on V' + GATE_VAR + ' >= ' + GATE_VALUE);
    }
    if (r.changed) {
        summary.push('event ' + EVENT_MINIGAME + ' (Mang Isko): candy x' + CANDY_REWARD +
            ' granted at the completion branch (index ' + r.at + ')');
    }

    if (checkOnly) {
        console.log('  ' + FILE + ': would apply');
        summary.forEach(s => console.log('    ' + s));
        return;
    }

    fs.writeFileSync(filePath, out, 'utf8');
    console.log('  wrote ' + FILE + ' (' + (eol === '\r\n' ? 'CRLF' : 'LF') + ')');
    summary.forEach(s => console.log('    ' + s));
}

main();
