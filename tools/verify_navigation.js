//=============================================================================
// tools/verify_navigation.js
//
// Proves that every place the game points an arrow also sets a mission, and
// that the guides are internally consistent.
//
// Checks:
//   1. every `NavArrow event N` has a matching `CM N <objective>` beside it
//      (same page, within two commands — both orders exist in the project)
//   2. every CM / NavArrow target is an event that exists on that same map
//      (MissionTracker and NavArrow both resolve event ids map-locally)
//   3. no objective text is empty or a placeholder
//   4. every map that uses one guide uses both
//   5. the three former dead ends now hand the player off:
//        Map044 ev2 Mang Siko, Map047 ev5 Veyra, Map048 ev1 Kapitana Elena
//   6. Map002's balloon page 1 no longer points the panel at the cave while
//      the arrow points at the elder
//
// Run:  node tools/verify_navigation.js [--from <git-ref>]
//=============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA = path.join(__dirname, '..', 'data');
const NAVARROW = 356;

const fromIdx = process.argv.indexOf('--from');
const fromRef = fromIdx >= 0 ? process.argv[fromIdx + 1] : null;

let failures = 0;
let checks = 0;

function ok(msg) { checks++; console.log('  ok   ' + msg); }
function fail(msg) { checks++; failures++; console.log('  FAIL ' + msg); }

function readMap(file) {
    if (!fromRef) return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));
    const raw = execSync('git show ' + fromRef + ':data/' + file, {
        maxBuffer: 64 * 1024 * 1024
    }).toString();
    return JSON.parse(raw);
}

function isNav(c) {
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
function cmText(c) {
    if (!c || c.code !== NAVARROW) return '';
    const m = String(c.parameters[0] || '').match(/^CM\s+\d+\s+([\s\S]*)$/i);
    return m ? m[1].trim() : '';
}

const MAPS = fs.readdirSync(DATA)
    .filter(f => /^Map\d+\.json$/.test(f))
    .sort();

console.log('Palarong Panlipunan — navigation coverage' +
    (fromRef ? '  (reading ' + fromRef + ')' : ''));
console.log('');

let arrows = 0;
let cms = 0;
const mapsWithArrow = new Set();
const mapsWithCM = new Set();

for (const file of MAPS) {
    const map = readMap(file);
    if (!map) continue;
    const tag = file.replace('.json', '');
    const events = (map.events || []).filter(Boolean);
    const eventIds = new Set(events.map(e => e.id));

    events.forEach(ev => {
        (ev.pages || []).forEach((pg, pi) => {
            const list = pg.list || [];
            list.forEach((c, i) => {
                if (isNav(c)) {
                    arrows++;
                    mapsWithArrow.add(tag);
                    const t = navTarget(c);
                    if (!eventIds.has(t)) {
                        fail(tag + ' ev' + ev.id + ' pg' + (pi + 1) +
                            ': arrow points at event ' + t + ', which does not exist on this map');
                    }
                    // Find the paired CM in the same page, within two commands.
                    let paired = false;
                    for (let j = i - 2; j <= i + 2; j++) {
                        if (j === i || j < 0 || j >= list.length) continue;
                        if (cmTarget(list[j]) === t) paired = true;
                    }
                    if (!paired) {
                        fail(tag + ' ev' + ev.id + ' pg' + (pi + 1) +
                            ': NavArrow event ' + t + ' has no matching CM ' + t);
                    }
                }
                if (cmTarget(c) > 0) {
                    cms++;
                    mapsWithCM.add(tag);
                    const t = cmTarget(c);
                    if (!eventIds.has(t)) {
                        fail(tag + ' ev' + ev.id + ' pg' + (pi + 1) +
                            ': CM points at event ' + t + ', which does not exist on this map');
                    }
                    const text = cmText(c);
                    if (!text) {
                        fail(tag + ' ev' + ev.id + ' pg' + (pi + 1) + ': CM ' + t + ' has no objective text');
                    } else if (/different way of answering|todo|tbd|placeholder/i.test(text)) {
                        fail(tag + ' ev' + ev.id + ' pg' + (pi + 1) +
                            ': CM objective is a placeholder: "' + text + '"');
                    }
                }
            });
        });
    });
}

// 4. both guides are used together, per map
const onlyArrow = [...mapsWithArrow].filter(m => !mapsWithCM.has(m));
const onlyCM = [...mapsWithCM].filter(m => !mapsWithArrow.has(m));
if (onlyArrow.length) {
    fail('maps with an arrow but no mission: ' + onlyArrow.join(', '));
} else {
    ok('every map that draws an arrow also shows a mission');
}
if (onlyCM.length) {
    fail('maps with a mission but no arrow: ' + onlyCM.join(', '));
} else {
    ok('every map that shows a mission also draws an arrow');
}

ok(arrows + ' arrow(s) and ' + cms + ' mission command(s) across ' +
    mapsWithArrow.size + ' map(s)');

// 5. former dead ends
const DEAD_ENDS = [
    { file: 'Map034.json', ev: 10, target: 9, what: "Aling Sita's door -> the door tile" },
    { file: 'Map038.json', ev: 2, target: 6, what: 'Bahay-Kubo narration -> the exit' },
    { file: 'Map044.json', ev: 2, target: 1, what: 'Mang Siko -> the door' },
    { file: 'Map047.json', ev: 5, target: 3, what: 'Veyra -> Bulwagan exit' },
    { file: 'Map048.json', ev: 1, target: 3, what: 'Kapitana Elena -> Bulwagan exit' }
];

for (const d of DEAD_ENDS) {
    const map = readMap(d.file);
    const ev = (map.events || []).find(e => e && e.id === d.ev);
    if (!ev) { fail(d.file + ' ev' + d.ev + ' is missing'); continue; }
    const all = [];
    (ev.pages || []).forEach(pg => (pg.list || []).forEach(c => all.push(c)));
    const hit = all.some((c, i) => isNav(c) && navTarget(c) === d.target &&
        cmTarget(all[i - 1] || {}) === d.target);
    if (hit) ok(d.what + ' now hands the player off with CM + NavArrow');
    else fail(d.what + ' still has no hand-off');
}

// 6. Map002 page 1: the panel and the arrow must agree
{
    const map = readMap('Map002.json');
    const ev = (map.events || []).find(e => e && e.id === 2);
    const list = ev.pages[0].list;
    const nav = list.find(c => isNav(c) && navTarget(c) === 1);
    const badCM = list.find(c => cmTarget(c) === 7 && /Tagapayo/i.test(cmText(c)));
    if (!nav) {
        fail('Map002 ev2 pg1 no longer points at the elder');
    } else if (badCM) {
        fail('Map002 ev2 pg1 still sets the mission to the cave (7) while the arrow points at the elder (1)');
    } else {
        const cm = list.find(c => cmTarget(c) === 1);
        if (!cm) fail('Map002 ev2 pg1 has no CM 1 mission');
        else ok('Map002 ev2 pg1: arrow and mission both point at the elder');
    }
}

console.log('');
if (failures) {
    console.log(failures + ' failure(s) out of ' + checks + ' check(s)');
    process.exit(1);
}
console.log('NAVIGATION OK (' + checks + ' checks)');
