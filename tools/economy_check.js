//=============================================================================
// tools/economy_check.js
//
// Proves that the health economy of the six quiz battles still lets a player
// finish the game, and that the rewards are actually visible.
//
// Everything here is read from the real project data:
//   - data/Troops.json      how many questions each quiz has, and its enemies
//   - data/Enemies.json     which items the enemy drop table grants
//   - data/Map*.json        the explicit rewards in each battle's If Win branch
//   - data/Actors.json      the party and their max HP
//   - js/plugins/PalQuiz.js the real damage formula (not a copy)
//
// The scenario is the pessimistic-but-passing player: the most wrong answers
// they can give and still pass every quiz, never drinking a potion during a
// battle (the quiz never hands control to the player), and using potions only
// between battles, always on the weaker member.
//
// Usage:  node tools/economy_check.js
//=============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const core = require('../js/plugins/PalQuiz.js');

const ROOT = path.join(__dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));

const POTION = 1;
const CANDY = 6;

const troops = read('Troops.json');
const enemies = read('Enemies.json');
const actors = read('Actors.json');
const classes = read('Classes.json');
const armors = read('Armors.json');
const weapons = read('Weapons.json');
const system = read('System.json');

let failures = 0;
const fail = msg => { console.error('  FAIL ' + msg); failures++; };
const ok = msg => console.log('  ok   ' + msg);

// ---------------------------------------------------------------------------
// Party max HP, read the way the engine reads it
// ---------------------------------------------------------------------------
// Game_Actor.paramBase indexes params[paramId] by level directly (no -1), then
// equipment is added on top.
function partyMaxHp() {
    return system.partyMembers
        .map(id => actors[id])
        .filter(Boolean)
        .map(a => {
            const cls = classes[a.classId];
            if (!cls) return 0;
            let hp = cls.params[0][a.initialLevel] || 0;
            (a.equips || []).forEach((eq, i) => {
                if (!eq) return;
                const item = i === 0 ? weapons[eq] : armors[eq];
                if (item && item.params) hp += item.params[0] || 0;
            });
            return hp;
        });
}

const memberHp = partyMaxHp();
const partyMax = memberHp.length ? Math.min(...memberHp) : 100;

// ---------------------------------------------------------------------------
// Quiz shape, read from the troop pages
// ---------------------------------------------------------------------------
function questionCount(troop) {
    let n = 0;
    (troop.pages[0].list || []).forEach(c => {
        if (c.code === 118 && /^Q\d+$/.test(String(c.parameters[0]))) n++;
    });
    return n;
}

function troopEnemyHp(troop) {
    let max = 1;
    (troop.members || []).forEach(m => {
        const e = enemies[m.enemyId];
        if (e && e.params) max = Math.max(max, Number(e.params[0]) || 0);
    });
    return max;
}

// Guaranteed drops only: a denominator of 1 means the item is always granted.
function troopDrops(troop) {
    const out = { potions: 0, candy: 0 };
    (troop.members || []).forEach(m => {
        const e = enemies[m.enemyId];
        if (!e) return;
        (e.dropItems || []).forEach(d => {
            if (d.kind !== 1 || d.denominator !== 1) return;
            if (d.dataId === POTION) out.potions++;
            if (d.dataId === CANDY) out.candy++;
        });
    });
    return out;
}

// ---------------------------------------------------------------------------
// Explicit rewards, read from the map events
// ---------------------------------------------------------------------------
const IF_WIN = 601;
const IF_LOSE = 603;
const END_BRANCH = 604;
const GAIN_ITEM = 126;

function winRange(list) {
    const start = list.findIndex(c => c.code === IF_WIN);
    if (start < 0) return null;
    let end = list.findIndex((c, i) => i > start && (c.code === IF_LOSE || c.code === END_BRANCH));
    if (end < 0) end = list.length;
    return [start, end];
}

function loseRange(list) {
    const start = list.findIndex(c => c.code === IF_LOSE);
    if (start < 0) return null;
    let end = list.findIndex((c, i) => i > start && (c.code === END_BRANCH || c.code === IF_WIN));
    if (end < 0) end = list.length;
    return [start, end];
}

// A reward counts as announced when a Show Text command follows it, because the
// battle log (where MV prints "Obtained ...!") is invisible: BattleHUD sets the
// log window's opacity and contentsOpacity to 0.
function scanRewards(list) {
    const range = winRange(list);
    if (!range) return null;
    const out = { potions: 0, candy: 0, announced: false, at: -1 };
    for (let i = range[0]; i < range[1]; i++) {
        const c = list[i];
        if (c.code !== GAIN_ITEM) continue;
        if (c.parameters[0] === POTION) { out.potions += c.parameters[3] || 0; out.at = i; }
        if (c.parameters[0] === CANDY) { out.candy += c.parameters[3] || 0; out.at = i; }
    }
    if (out.at >= 0) {
        for (let i = out.at + 1; i < Math.min(out.at + 4, range[1]); i++) {
            if (list[i].code === 101) out.announced = true;
        }
    }
    return out;
}

function scanLosses(list) {
    const range = loseRange(list);
    if (!range) return { potions: 0, candy: 0 };
    const out = { potions: 0, candy: 0 };
    for (let i = range[0]; i < range[1]; i++) {
        const c = list[i];
        if (c.code !== GAIN_ITEM) continue;
        if (c.parameters[0] === POTION) out.potions += c.parameters[3] || 0;
        if (c.parameters[0] === CANDY) out.candy += c.parameters[3] || 0;
    }
    return out;
}

const mapFiles = fs.readdirSync(path.join(ROOT, 'data'))
    .filter(f => /^Map\d+\.json$/.test(f))
    .sort();

const battles = [];   // { file, event, troopId, rewards, loss }
for (const file of mapFiles) {
    const map = read(file);
    (map.events || []).forEach(ev => {
        if (!ev) return;
        (ev.pages || []).forEach(pg => {
            const list = pg.list || [];
            const at = list.findIndex(c => c.code === 301);
            if (at < 0) return;
            const troopId = Number(list[at].parameters[1]);
            battles.push({
                file, event: ev.id, troopId,
                rewards: scanRewards(list),
                loss: scanLosses(list)
            });
        });
    });
}

console.log('Palarong Panlipunan — health economy of the quiz campaign\n');
console.log('party: ' + memberHp.map((hp, i) => {
    const a = actors[system.partyMembers[i]];
    return (a ? a.name : '?') + ' ' + hp + ' HP';
}).join(', ') + '   (frailest ' + partyMax + ' HP)\n');

// ---------------------------------------------------------------------------
// Shape of every quiz
// ---------------------------------------------------------------------------
const quiz = {};
for (let id = 1; id <= 6; id++) {
    const troop = troops[id];
    if (!troop) continue;
    const n = questionCount(troop);
    if (n < 1) { fail('troop ' + id + ' has no labelled questions'); continue; }
    const plan = core.damagePlan(n, {
        enemyMaxHp: troopEnemyHp(troop),
        partyMaxHp: partyMax,
        passRatio: 0.5,
        wrongDamageShare: 0.5
    });
    const drops = troopDrops(troop);
    const found = battles.filter(b => b.troopId === id);
    if (!found.length) { fail('troop ' + id + ' is never started by a map event'); continue; }

    // Every copy of the same fight must carry the same reward, otherwise the
    // payout would depend on which tile the player stepped on.
    const rewards = found.map(b => b.rewards || { potions: 0, candy: 0, announced: false });
    const key = r => r.potions + '/' + r.candy;
    const same = rewards.every(r => key(r) === key(rewards[0]));
    if (!same) fail('troop ' + id + ': copies of the fight give different rewards (' +
        rewards.map(key).join(' vs ') + ')');

    found.forEach(b => {
        if (b.loss.potions || b.loss.candy) {
            fail(b.file + ' ev' + b.event + ': a reward is granted in the If Lose branch — losing could be farmed');
        }
        if (!b.rewards || (b.rewards.potions + b.rewards.candy) === 0) {
            fail(b.file + ' ev' + b.event + ' (troop ' + id + '): no reward in the If Win branch');
        } else if (!b.rewards.announced) {
            fail(b.file + ' ev' + b.event + ' (troop ' + id + '): reward is not announced by a Show Text, ' +
                'and the battle log is hidden, so the player would never see it');
        }
    });

    quiz[id] = { n, plan, drops, explicit: rewards[0], where: found.map(b => b.file + ' ev' + b.event) };
}

// ---------------------------------------------------------------------------
// Simulation: the player who scrapes a pass at every quiz
// ---------------------------------------------------------------------------
const hp = memberHp.slice();
let stock = 0;
const rows = [];

for (const id of Object.keys(quiz).map(Number).sort((a, b) => a - b)) {
    const q = quiz[id];
    // The most wrong answers that still passes.
    const mistakes = q.n - q.plan.steps;
    const dmg = mistakes * q.plan.party;

    for (let i = 0; i < hp.length; i++) hp[i] = Math.max(0, hp[i] - dmg);
    const bothDown = hp.every(h => h <= 0);
    if (bothDown) {
        fail('troop ' + id + ': the party is wiped at quizdone on the worst passing path');
        break;
    }

    // Between battles: drink until nobody is hurt, weakest first.
    let drank = 0;
    while (stock > 0) {
        let worst = -1;
        for (let i = 0; i < hp.length; i++) {
            if (hp[i] < memberHp[i] && (worst < 0 || hp[i] < hp[worst])) worst = i;
        }
        if (worst < 0) break;
        hp[worst] = memberHp[worst];       // Potion heals +500, a full heal at these levels
        stock--; drank++;
    }

    const gained = q.explicit.potions + q.drops.potions;
    stock += gained;

    rows.push({
        id, n: q.n, steps: q.plan.steps, mistakes,
        per: q.plan.party, dmg,
        hp: hp.slice(), drank, gained, stock,
        candy: q.explicit.candy + q.drops.candy
    });
}

console.log('worst passing path (the most wrong answers that still passes):\n');
console.log('  battle  quiz   pass    wrong   cost   HP after        potions        candy');
console.log('  ------  -----  ------  ------  -----  --------------  -------------  -----');
let totalCandy = 0;
for (const r of rows) {
    totalCandy += r.candy;
    console.log('  ' + String(r.id).padEnd(6) +
        '  ' + (r.n + 'q').padEnd(5) +
        '  ' + (r.steps + '/' + r.n).padEnd(6) +
        '  ' + String(r.mistakes).padEnd(6) +
        '  ' + String(r.dmg).padEnd(5) +
        '  ' + r.hp.join(' / ').padEnd(14) +
        '  +' + String(r.gained).padEnd(3) + ' (' + r.drank + ' used)'.padEnd(4) +
        '  +' + r.candy);
}

const last = rows[rows.length - 1];
if (last && last.hp.every(h => h > 0)) {
    ok('a player who scrapes a pass in every quiz reaches the last battle alive (' +
        last.hp.join('/') + ' HP)');
} else if (last) {
    fail('the scraped-pass run does not survive the last quiz');
}

if (last && stock > 0) {
    ok('spare potions left over: ' + stock + ' — the reward curve is not razor-thin');
}

// Stakes: a fully failed quiz has to hurt, or the answers would not matter.
{
    const q = quiz[1];
    const cost = q.n * q.plan.party;
    if (cost < partyMax * 0.25) {
        fail('a fully failed quiz costs only ' + cost + '/' + partyMax + ' HP — the stakes are too small');
    } else {
        ok('a fully failed quiz costs ' + cost + '/' + partyMax + ' HP');
    }
}

// Candy is the other half of the reward: it has to be able to buy a rank.
// Battle branches are already summed above. Anything else that grants candy —
// the Mang Isko mini-game — is non-battle content, so count it separately and
// add it, or this total would understate what the player can earn.
let questCandy = 0;
const questCandySources = [];
for (const file of mapFiles) {
    const map = read(file);
    (map.events || []).forEach(ev => {
        if (!ev) return;
        // Skip battle events: their reward was counted by scanRewards.
        const isBattleEvent = (ev.pages || []).some(pg => (pg.list || []).some(c => c.code === 301));
        if (isBattleEvent) return;
        (ev.pages || []).forEach(pg => {
            (pg.list || []).forEach(c => {
                if (c.code === GAIN_ITEM && c.parameters[0] === CANDY && c.parameters[3] > 0) {
                    questCandy += c.parameters[3];
                    questCandySources.push(file + ' ev' + ev.id + ' "' + String(ev.name).trim() + '"');
                }
            });
        });
    });
}

{
    const total = totalCandy + questCandy;
    const points = total * 10;
    ok('candy handed out by the campaign: ' + total + ' (' + points + ' Candy Points)  [' +
        totalCandy + ' from battles + ' + questCandy + ' from quests]');
    if (questCandy > 0) {
        ok('  non-battle candy comes from: ' + [...new Set(questCandySources)].join(', '));
    }
    if (points < 100) {
        fail('the campaign awards only ' + points + ' points, short of the 100 needed for rank 2');
    } else {
        ok('that is enough for rank 2 (Gabay, 100 points) and ' +
            Math.min(100, Math.round((points - 100) / 150 * 100)) + '% of the way to rank 3 (Sandigan, 250)');
    }
}

// ---------------------------------------------------------------------------
// The reward items themselves have to do what the reward promises
// ---------------------------------------------------------------------------
{
    const items = read('Items.json');

    const potion = items[POTION];
    if (!potion) {
        fail('item ' + POTION + ' (Potion) does not exist, so a battle reward would grant nothing');
    } else {
        const heal = (potion.effects || []).find(e => e.code === 11);
        if (!heal || !(heal.value2 > 0)) {
            fail('Potion has no HP recovery effect, so the reward would not heal');
        } else {
            ok('Potion heals +' + heal.value2 + ' HP (usable: occasion ' + potion.occasion + ')');
        }
        if (potion.occasion !== 0) {
            fail('Potion is not usable everywhere (occasion ' + potion.occasion + ')');
        }
    }

    const candy = items[CANDY];
    if (!candy) {
        fail('item ' + CANDY + ' (candy) does not exist');
    } else {
        const note = /<CandyPoint(?::\s*(\d+))?>/i.exec(candy.note || '');
        if (!note) {
            fail('candy has no <CandyPoint:N> note, so PalSupport would award no points for it');
        } else {
            ok('candy awards ' + (note[1] || '?') + ' Candy Points each through the PalSupport gainItem hook');
        }
        if (candy.consumable) {
            fail('candy is consumable, so the player could waste the currency');
        }
    }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\nrewards granted on victory:\n');
for (const id of Object.keys(quiz).map(Number).sort((a, b) => a - b)) {
    const q = quiz[id];
    const ex = q.explicit;
    console.log('  troop ' + id + '  ' + q.n + ' questions  ' +
        'explicit: ' + ex.potions + ' Potion + ' + ex.candy + ' candy  ' +
        'drops: ' + q.drops.potions + ' Potion + ' + q.drops.candy + ' candy  ' +
        '  [' + q.where.join(', ') + ']');
}

console.log('');
if (failures) {
    console.log(failures + ' failure(s)');
    process.exit(1);
}
console.log('ECONOMY OK');
console.log('note: drops are granted invisibly by the engine (BattleHUD hides the battle log);');
console.log('      only the explicit rewards are announced to the player.');
