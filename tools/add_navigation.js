//=============================================================================
// tools/add_navigation.js
//
// Adds the second half of the guidance system: a `CM <eventId> <objective>`
// mission command everywhere the game already draws a `NavArrow event <id>`.
//
// ── Why both are needed ─────────────────────────────────────────────────────
// The two plugins do different jobs:
//
//   NavArrow event N   → a floating arrow pointing at event N
//   CM N <text>        → the OBJECTIVE panel text + compass bearing + distance
//
// Most interactions in the build call only `NavArrow`, so the arrow points at
// the next NPC but the mission panel stays empty. Both are re-issued per map
// because NavArrow resets and MissionTracker clears on every transfer
// (Scene_Map.onMapLoaded), so this is a per-map pairing, not a global one.
//
// ── What this does ──────────────────────────────────────────────────────────
//   1. FIX   Map002's balloon page 1 pointed the arrow at the elder (event 1)
//            but the mission at the cave (event 7) while saying "talk to the
//            elder". Corrected to event 1.
//   2. PAIR  Every `NavArrow event N` that has no `CM N ...` beside it gets one,
//            with the objective text below. Idempotent: a second run is a no-op.
//   3. LINK  Five story beats ended without pointing anywhere:
//              Map034 ev10 Aling Sita's door → the door tile, event 9
//              Map038 ev2  Bahay-Kubo narration → the exit, event 6
//              Map044 ev2  Mang Siko      → the door, event 1
//              Map047 ev5  Veyra battle   → the exit, event 3
//              Map048 ev1  Kapitana Elena → the exit, event 3
//
// ── Safety ──────────────────────────────────────────────────────────────────
// Additive only: every change inserts a command (or rewrites one objective
// string). No command is removed, no page condition, trigger, image or event
// position is touched. Map files are one-verbatim-JSON-event-per-line; the tool
// refuses to write if that is not true, and after writing it re-parses the file
// and proves every event outside the declared set is byte-identical.
//
// Usage:  node tools/add_navigation.js [--check]
//=============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');

const NAVARROW = 356;

//-----------------------------------------------------------------------------
// Objective text, keyed by map + target event id.
// Every arrow target must appear here or the tool aborts — no silent skips.
//-----------------------------------------------------------------------------
const OBJECTIVES = {
    Map002: {
        1: 'Makipag-usap kay Matandang Tagapayo',
        4: 'Pumunta at subukan ang iyong kaalaman sa isa sa mga kalaban',
        7: 'Pumunta sa kweba upang simulan ang misyon'
    },
    Map032: {
        1: 'Lumapit at makipag-usap kay Diwata'
    },
    Map034: {
        1: 'Kausapin si Mang Isko',
        2: 'Magtanong sa mga tao sa nayon',
        4: 'Magtanong sa mga tao sa nayon',
        6: 'Hanapin si Kiko sa itaas ng bundok',
        7: 'Tumawid sa ilog at hanapin si Mang Ambo',
        8: 'Magtanong sa mga tao sa nayon',
        10: 'Pumasok sa bahay ni Aling Sita',
        22: 'Lumabas ng nayon patungong Balon',
        23: 'Kausapin ang mga tao tungkol sa kalikasan'
    },
    Map035: {
        2: 'Pumunta sa pasukan ng Nayon ng Mayumi'
    },
    Map042: {
        2: 'Lumabas ng bahay ni Aling Sita'
    },
    Map043: {
        3: 'Pumasok sa bahay ni Mang Siko',
        5: 'Pumunta sa Pamilihang Bayan'
    },
    Map044: {
        1: 'Lumabas ng bahay ni Mang Siko'
    },
    Map045: {
        1: 'Kausapin si Aling Rosa',
        3: 'Pumunta sa Liwasang Bayan'
    },
    Map046: {
        1: 'Kausapin si Lolo Robert',
        19: 'Pumunta sa bahay ni Aling Mila at Tino'
    },
    Map047: {
        1: 'Kausapin si Aling Mila',
        2: 'Kausapin si Tino',
        3: 'Pumunta sa Bulwagan'
    },
    Map048: {
        1: 'Kausapin si Kapitana Elena',
        3: 'Lumabas ng Bulwagan'
    },
    Map049: {
        7: 'Lumabas ng bahay ni Niko',
        9: 'Kausapin si Niko'
    },
    Map050: {
        2: 'Lapitan at kausapin si Balong Berto',
        3: 'Kausapin si Robin',
        4: 'Kausapin si Laila',
        9: 'Pumunta sa susunod na lugar'
    },
    Map052: {
        1: 'Pumasok sa Bulwagan'
    }
};

// Same target, but the wording depends on what the player just did.
const OVERRIDES = [
    // After the failed gate on the Shadow tile, send the player back to Mang Isko.
    { map: 'Map034', event: 29, page: 0, target: 1, text: 'Bumalik kay Mang Isko' }
];

// Interactions that ended with no hand-off at all.
// `target` is always an event on the same map that the player can walk onto or
// talk to next — never a guess at a map they have not reached yet.
const APPEND = [
    { map: 'Map034', event: 10, page: 0, target: 9, text: 'Pumasok sa bahay ni Aling Sita' },
    { map: 'Map038', event: 2, page: 0, target: 6, text: 'Lumabas ng bahay at kausapin si Mang Ambo' },
    { map: 'Map044', event: 2, page: 0, target: 1, text: 'Lumabas ng bahay ni Mang Siko' },
    { map: 'Map047', event: 5, page: 0, target: 3, text: 'Pumunta sa Bulwagan' },
    { map: 'Map048', event: 1, page: 0, target: 3, text: 'Lumabas ng Bulwagan' }
];

// Existing CM commands whose event id disagrees with their own text.
const CM_FIXES = [
    {
        map: 'Map002', event: 2, page: 0,
        from: 'CM 7 Makipag Usap kay Matandang Tagapayo',
        to: 'CM 1 Makipag-usap kay Matandang Tagapayo'
    }
];

//-----------------------------------------------------------------------------
const cmPrefix = (target) => 'CM ' + target + ' ';

function isNavArrow(c) {
    return c && c.code === NAVARROW && /^NavArrow event (\d+)$/i.test(String(c.parameters[0] || ''));
}

function navTarget(c) {
    const m = String(c.parameters[0] || '').match(/^NavArrow event (\d+)$/i);
    return m ? Number(m[1]) : 0;
}

function cmTarget(c) {
    if (!c || c.code !== NAVARROW) return 0;
    const m = String(c.parameters[0] || '').match(/^CM\s+(\d+)(?:\s|$)/i);
    return m ? Number(m[1]) : 0;
}

// A CM may sit immediately before or after the arrow (both orders exist in the
// project today), so look two commands either way.
function hasPairedCM(list, i, target) {
    for (let j = i - 2; j <= i + 2; j++) {
        if (j === i || j < 0 || j >= list.length) continue;
        if (cmTarget(list[j]) === target) return true;
    }
    return false;
}

function objectiveFor(map, eventId, page, target) {
    const o = OVERRIDES.find(x =>
        x.map === map && x.event === eventId && x.page === page && x.target === target);
    if (o) return o.text;
    const t = OBJECTIVES[map] && OBJECTIVES[map][target];
    if (!t) {
        throw new Error(map + ' ev' + eventId + ' pg' + (page + 1) +
            ': no objective text for target event ' + target);
    }
    return t;
}

//-----------------------------------------------------------------------------
function editMap(mapKey, checkOnly) {
    const file = mapKey + '.json';
    const filePath = path.join(DATA, file);
    const text = fs.readFileSync(filePath, 'utf8');
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(eol);
    const parsed = JSON.parse(text);

    // Prove the file is one verbatim JSON event per line before editing.
    const lineOf = {};
    (parsed.events || []).forEach(e => {
        if (!e) return;
        const want = JSON.stringify(e);
        const idx = lines.findIndex(l => l.startsWith('{"id":' + e.id + ','));
        if (idx < 0) throw new Error(file + ': event ' + e.id + ' is not on a single line');
        if (lines[idx].replace(/,$/, '') !== want) {
            throw new Error(file + ': event ' + e.id + ' is not verbatim JSON; refusing to edit');
        }
        lineOf[e.id] = idx;
    });

    const before = {};
    (parsed.events || []).forEach(e => { if (e) before[e.id] = JSON.stringify(e); });

    const touched = new Set();
    const log = [];

    // -- 1. fix a CM whose event id contradicts its text ----------------------
    CM_FIXES.filter(f => f.map === mapKey).forEach(f => {
        const ev = (parsed.events || []).find(e => e && e.id === f.event);
        if (!ev) throw new Error(file + ': fix target ev' + f.event + ' not found');
        const list = ev.pages[f.page].list;
        let hits = 0;
        list.forEach(c => {
            if (c.code === NAVARROW && String(c.parameters[0]) === f.from) {
                c.parameters[0] = f.to;
                hits++;
            }
        });
        if (!hits) {
            const already = list.some(c => c.code === NAVARROW && String(c.parameters[0]) === f.to);
            if (!already) throw new Error(file + ': fix source not found: "' + f.from + '"');
        } else {
            touched.add(f.event);
            log.push('ev' + f.event + ': fixed CM target — "' + f.from + '" -> "' + f.to + '"');
        }
    });

    // -- 2. pair every NavArrow with a CM ------------------------------------
    (parsed.events || []).forEach(ev => {
        if (!ev) return;
        ev.pages.forEach((pg, pi) => {
            const list = pg.list;
            for (let i = 0; i < list.length; i++) {
                if (!isNavArrow(list[i])) continue;
                const target = navTarget(list[i]);
                if (hasPairedCM(list, i, target)) continue;
                const objective = objectiveFor(mapKey, ev.id, pi, target);
                list.splice(i, 0, {
                    code: NAVARROW,
                    indent: list[i].indent,
                    parameters: [cmPrefix(target) + objective]
                });
                touched.add(ev.id);
                log.push('ev' + ev.id + ' pg' + (pi + 1) + ' [' + i + ']: + CM ' + target + ' ' + objective);
                i++;
            }
        });
    });

    // -- 3. give dead-end interactions a hand-off ----------------------------
    APPEND.filter(a => a.map === mapKey).forEach(a => {
        const ev = (parsed.events || []).find(e => e && e.id === a.event);
        if (!ev) throw new Error(file + ': append target ev' + a.event + ' not found');
        const list = ev.pages[a.page].list;

        const already = list.some((c, i) => isNavArrow(c) && navTarget(c) === a.target &&
            hasPairedCM(list, i, a.target));
        if (already) return;

        // Insert before the self switch that closes the interaction, or before
        // the terminator when there is none.
        let at = list.length - 1;
        for (let i = list.length - 1; i >= 0; i--) {
            const c = list[i];
            if (c.code === 123 && String(c.parameters[0]) === 'A' && c.parameters[1] === 0) {
                at = i;
                break;
            }
        }
        const indent = list[at] ? list[at].indent : 0;
        list.splice(at, 0,
            { code: NAVARROW, indent: indent, parameters: [cmPrefix(a.target) + a.text] },
            { code: NAVARROW, indent: indent, parameters: ['NavArrow event ' + a.target] });
        touched.add(a.event);
        log.push('ev' + ev.id + ' pg' + (a.page + 1) + ' [' + at + ']: + CM + NavArrow event ' + a.target +
            ' (' + a.text + ')');
    });

    if (!log.length) return { file, changed: false, log: [] };
    if (checkOnly) return { file, changed: true, log };

    // -- write back only the touched event lines ------------------------------
    for (const id of touched) {
        const ev = (parsed.events || []).find(e => e && e.id === id);
        const idx = lineOf[id];
        const hadComma = lines[idx].endsWith(',');
        lines[idx] = JSON.stringify(ev) + (hadComma ? ',' : '');
    }
    const out = lines.join(eol);

    // -- whole-file checks ----------------------------------------------------
    const recheck = JSON.parse(out);
    (recheck.events || []).forEach(e => {
        if (!e || touched.has(e.id)) return;
        if (JSON.stringify(e) !== before[e.id]) {
            throw new Error(file + ': event ' + e.id + ' changed unexpectedly');
        }
    });

    // The file must still end the same way (no lost null slots / brackets).
    if (!out.trimEnd().endsWith('}')) throw new Error(file + ': the file no longer ends with }');

    fs.writeFileSync(filePath, out, 'utf8');
    return { file, changed: true, log };
}

//-----------------------------------------------------------------------------
function main() {
    const checkOnly = process.argv.includes('--check');
    const maps = [...new Set([
        ...Object.keys(OBJECTIVES),
        ...APPEND.map(a => a.map),
        ...CM_FIXES.map(f => f.map)
    ])].sort();

    let total = 0;
    maps.forEach(mapKey => {
        const r = editMap(mapKey, checkOnly);
        if (!r.changed) {
            console.log('  ' + r.file + ': already applied');
            return;
        }
        console.log('  ' + r.file + (checkOnly ? ': would change' : ': wrote'));
        r.log.forEach(l => console.log('      ' + l));
        total += r.log.length;
    });

    console.log('');
    if (!total) console.log('  nothing to do — navigation is already paired');
    else console.log('  ' + total + ' change(s) ' + (checkOnly ? 'pending' : 'applied'));
}

main();
