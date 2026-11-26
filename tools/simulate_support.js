//=============================================================================
// tools/simulate_support.js
//
// Headless test of PalSupport + PalQuiz against a minimal RPG Maker MV stub.
//
// It exercises the behaviour that cannot be verified by reading JSON:
//   - a correct answer awards points and support
//   - three in a row pay the streak bonus
//   - 100 points rank Arkin up and raise the hint allowance
//   - wrong answers drain support, and 0 support disables hints
//   - a hint costs points and support
//   - a failed quiz knocks the party out and the endBattle hook restores them
//   - a won quiz does not touch the party
//   - candy items add Candy Points
//   - Conversation_Count / Material_Count are never touched
//   - PalQuiz.prepare produces a structurally valid, shuffled troop page
//
// Usage:  node tools/simulate_support.js
//=============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let failures = 0;
function check(name, cond, extra) {
    if (cond) {
        console.log('  ok   ' + name);
    } else {
        failures++;
        console.log('  FAIL ' + name + (extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
    }
}
function eq(name, actual, expected) {
    check(name + ' (expected ' + JSON.stringify(expected) + ')', actual === expected, actual);
}

// -----------------------------------------------------------------------------
// Minimal MV runtime
// -----------------------------------------------------------------------------

function makeRuntime(pluginParams) {
    const vars = {};
    const sws = {};
    const soundLog = [];
    const flashLog = [];

    const stubLayer = { pushes: [], push(t, c) { this.pushes.push([t, c]); } };

    const party = {
        members() { return this._m; },
        _m: [
            { hp: 100, mhp: 100, mp: 10, mmp: 10, isDead() { return this.hp === 0; }, gainHp(n) { this.hp += n; }, setHp(n) { this.hp = n; }, setMp(n) { this.mp = n; }, recoverAll() { this.hp = this.mhp; this.mp = this.mmp; } },
            { hp: 80, mhp: 80, mp: 10, mmp: 10, isDead() { return this.hp === 0; }, gainHp(n) { this.hp += n; }, setHp(n) { this.hp = n; }, setMp(n) { this.mp = n; }, recoverAll() { this.hp = this.mhp; this.mp = this.mmp; } }
        ]
    };

    let troopInterpreterCleared = false;
    const troopMembers = [{
        hp: 100,
        isDead() { return this.hp === 0; },
        gainHp(n) { this.hp = Math.min(this.hp + n, 100); }
    }];
    const troop = {
        _dead: false,
        _interpreter: { clear() { troopInterpreterCleared = true; } },
        members() { return troopMembers; },
        isAllDead() { return this._dead || troopMembers.every(m => m.isDead()); }
    };

    const BattleManager = {
        _phase: 'start',
        _result: null,
        _canLose: false,
        gameover: false,
        pops: 0,
        setup(troopId, canEscape, canLose) {
            this._phase = 'start';
            this._result = null;
            this._canLose = canLose === true;
        },
        endBattle(result) { this._result = result; this._phase = 'battleEnd'; },
        // Mirrors MV: a dead party is either revived (canLose) or sent to the
        // game over screen, then the scene pops.
        updateBattleEnd() {
            const dead = party.members().every(m => m.isDead());
            if (this._result !== 1 && dead) {
                if (this._canLose) {
                    party.members().forEach(m => { if (m.isDead()) m.setHp(1); });
                } else {
                    this.gameover = true;
                }
            }
            this.pops++;
            this._phase = null;
        }
    };

    const sandbox = {
        console,
        PluginManager: { parameters: name => pluginParams[name] || {} },
        $gameVariables: {
            value: id => (vars[id] === undefined ? 0 : vars[id]),
            setValue: (id, v) => { vars[id] = v; }
        },
        $gameSwitches: {
            value: id => sws[id] === true,
            setValue: (id, v) => { sws[id] = v; }
        },
        $gameParty: party,
        $gameTroop: troop,
        $gameSystem: { _palSeen: {} },
        $gameTemp: {},
        $dataTroops: JSON.parse(read('data/Troops.json')),
        $dataItems: JSON.parse(read('data/Items.json')),
        $gameScreen: {
            startFlash(a, d) { flashLog.push(['flash', a]); },
            startShake(p, s, d) { flashLog.push(['shake', p]); }
        },
        SoundManager: {
            playItem() { soundLog.push('item'); },
            playBuzzer() { soundLog.push('buzzer'); },
            playCursor() { soundLog.push('cursor'); }
        },
        SceneManager: { _scene: { _palSupportLayer: stubLayer } },
        Graphics: { boxWidth: 1280, boxHeight: 720 },
        Bitmap: function (w, h) {
            this.width = w; this.height = h;
            this._context = {
                save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {},
                closePath() {}, fill() {}, stroke() {}, fillRect() {}, clearRect() {},
                fillText() {}, strokeText() {}, measureText: () => ({ width: 40 }),
                createLinearGradient: () => ({ addColorStop() {} })
            };
            this._setDirty = function () {};
        },
        Sprite: function () { this.initialize.apply(this, arguments); },
        Scene_Battle: function () {},
        BattleManager,
        Game_Interpreter: function () {},
        Game_Party: function () {},
        Window_Base: function () {},
        window: {}
    };

    sandbox.Sprite.prototype.initialize = function () {};
    sandbox.Sprite.prototype.update = function () {};
    sandbox.Scene_Battle.prototype.createDisplayObjects = function () {};
    sandbox.Game_Interpreter.prototype.pluginCommand = function () {};
    sandbox.Game_Party.prototype.gainItem = function () {};

    const context = vm.createContext(sandbox);
    vm.runInContext(read('js/plugins/PalSupport.js'), context, { filename: 'PalSupport.js' });
    vm.runInContext(read('js/plugins/PalQuiz.js'), context, { filename: 'PalQuiz.js' });

    // The plugin patched Game_Party.prototype.gainItem; make the fake party
    // inherit it so the candy hook is actually exercised.
    Object.setPrototypeOf(party, sandbox.Game_Party.prototype);

    // A Game_Interpreter that forwards commands exactly the way MV does.
    const interpreter = {
        cmd(command, ...args) {
            sandbox.Game_Interpreter.prototype.pluginCommand.call(this, command, args);
        },
        // Mirrors command356: a single string, split on spaces.
        line(str) {
            const parts = String(str).split(' ');
            const command = parts.shift();
            sandbox.Game_Interpreter.prototype.pluginCommand.call(this, command, parts);
        }
    };

    return { sandbox, vars, sws, party, troop, interpreter, BattleManager, soundLog, flashLog, stubLayer, troopCleared: () => troopInterpreterCleared };
}

const PARAMS = {
    PalSupport: {
        pointsVarId: '5', correctVarId: '6', wrongVarId: '7', supportVarId: '8',
        rankVarId: '9', streakVarId: '10', hintVarId: '11', accuracyVarId: '12',
        hintGateVarId: '15', lostSwitchId: '23', supportSwitchId: '31',
        correctPoints: '10', wrongSupportDamage: '15', correctSupportGain: '5',
        hintPointCost: '10', hintSupportCost: '10', streakBonus: '5',
        streakLength: '3', candyPointPerItem: '10', 'Debug Logging': 'false'
    },
    PalQuiz: {
        enabledSwitchId: '30', shuffleQuestions: 'true', shuffleAnswers: 'true',
        'Debug Logging': 'false'
    }
};

console.log('PalSupport — answer pipeline');
{
    const R = makeRuntime(PARAMS);
    R.BattleManager.setup(1, false, true);

    eq('battle start support', R.vars[8], 100);
    eq('battle start hint charges', R.vars[11], 2);
    eq('battle start visible hint counter', R.vars[15], 2);
    eq('battle start rank', R.vars[9], 1);

    R.BattleManager.endBattle(0);

    const R2 = makeRuntime(PARAMS);
    R2.BattleManager.setup(1, false, true);

    // three correct answers
    for (let i = 0; i < 3; i++) R2.interpreter.cmd('PalBattleHUD', 'score', 'add', '1');

    eq('correct count', R2.vars[6], 3);
    eq('streak', R2.vars[10], 3);
    eq('accuracy', R2.vars[12], 100);
    // 10 + 10 + (10 + 5 streak) = 35
    eq('points after 3 correct', R2.vars[5], 35);
    // 100 + 5*3, capped at rank-1 max 100
    eq('support capped at rank max', R2.vars[8], 100);
    check('correct sound played', R2.soundLog.filter(s => s === 'item').length === 3, R2.soundLog);
    check('floating text pushed', R2.stubLayer.pushes.length >= 3, R2.stubLayer.pushes.length);

    eq('story Conversation_Count untouched', R2.vars[1] || 0, 0);
    eq('story Material_Count untouched', R2.vars[2] || 0, 0);
}

console.log('\nPalSupport — rank unlock at 100 points');
{
    const R = makeRuntime(PARAMS);
    R.BattleManager.setup(1, false, true);
    R.vars[5] = 95;                       // 95 points, one answer away
    R.interpreter.cmd('PalBattleHUD', 'score', 'add', '1');

    eq('points', R.vars[5], 105);
    eq('rank becomes 2 (Gabay)', R.vars[9], 2);
    eq('support max raised to 120', R.vars[8], 105);
    eq('hint allowance still the battle-start value', R.vars[11], 2);
}

console.log('\nPalSupport — wrong answers drain support');
{
    const R = makeRuntime(PARAMS);
    R.BattleManager.setup(1, false, true);

    R.interpreter.cmd('PalBattleHUD', 'enemyscore', 'add', '1');
    eq('wrong count', R.vars[7], 1);
    eq('support after one wrong', R.vars[8], 85);
    eq('streak reset after a wrong answer', R.vars[10], 0);

    for (let i = 0; i < 6; i++) R.interpreter.cmd('PalBattleHUD', 'enemyscore', 'add', '1');
    eq('support floor', R.vars[8], 0);
    eq('lost switch on', R.sws[23], true);
    eq('hints cleared when exhausted', R.vars[11], 0);
    eq('visible hint counter cleared', R.vars[15], 0);
    check('buzzer sound played', R.soundLog.includes('buzzer'), R.soundLog);

    // Next battle gives him a little strength back.
    R.BattleManager.setup(1, false, true);
    eq('support restored between battles', R.vars[8], 25);
    eq('lost switch cleared', R.sws[23], false);
    eq('hints refilled', R.vars[11], 2);
}

console.log('\nPalSupport — hint cost');
{
    const R = makeRuntime(PARAMS);
    R.BattleManager.setup(1, false, true);
    R.vars[5] = 40;
    R.interpreter.cmd('PalSupport', 'hint');
    eq('points after hint', R.vars[5], 30);
    eq('hint charges', R.vars[11], 1);
    eq('visible hint counter', R.vars[15], 1);
    eq('support after hint', R.vars[8], 90);
}

console.log('\nPalSupport — quiz outcome');
{
    // Passed: enough right answers. quizdone applies the killing blow so the
    // engine's own victory path runs, and the party is left alone.
    const W = makeRuntime(PARAMS);
    W.BattleManager.setup(4, false, true);
    W.vars[6] = 4;                                  // Quiz_Correct
    W.vars[7] = 3;                                  // Quiz_Wrong
    W.interpreter.cmd('PalSupport', 'quizdone', '7', '4');
    check('passed quiz kills the troop', W.troop.isAllDead(), W.troop.members()[0].hp);
    eq('passed quiz leaves party alive', W.party._m[0].hp, 100);
    eq('passed quiz does not end the battle itself', W.BattleManager._result, null);
    W.BattleManager.endBattle(0);
    eq('passed quiz is never healed over by the defeat hook', W.party._m[0].hp, 100);

    // Failed: fewer right answers than the threshold.
    const L = makeRuntime(PARAMS);
    L.BattleManager.setup(4, false, true);
    L.troop._dead = false;
    L.vars[6] = 1;
    L.vars[7] = 6;
    L.party._m[0].hp = 30;                        // damaged by the quiz's own commands
    L.party._m[1].hp = 55;
    L.interpreter.cmd('PalSupport', 'quizdone', '7', '4');

    eq('failed quiz knocks the party out so the engine sees a defeat', L.party._m[0].hp, 0);
    eq('second member is knocked out too', L.party._m[1].hp, 0);
    eq('failed quiz does not end the battle itself (engine does)', L.BattleManager._result, null);

    // The engine's defeat path then calls endBattle(2) and updateBattleEnd().
    L.BattleManager.endBattle(2);
    check('the death is still on screen while the defeat message plays',
        L.party._m[0].isDead() && L.party._m[1].isDead());
    L.BattleManager.updateBattleEnd();
    eq('wrong answers leave a real health cost after the defeat', L.party._m[0].hp, 30);
    eq('the second member keeps its damage too', L.party._m[1].hp, 55);
    check('nothing is left dead on the map after the defeat',
        !L.party._m[0].isDead() && !L.party._m[1].isDead());
    check('the battle exited normally, no game over', L.BattleManager.gameover === false && L.BattleManager.pops === 1);

    // Someone already knocked out mid-quiz must come back at 1, never 0:
    // 0 HP on the map is the game over screen.
    eq('a knocked-out member is revived to 1 HP, not left dead', (function () {
        const Z = makeRuntime(PARAMS);
        Z.BattleManager.setup(4, false, true);
        Z.vars[6] = 1;
        Z.vars[7] = 6;
        Z.party._m[0].hp = 7;
        Z.party._m[1].hp = 0;                     // died on a wrong answer mid-quiz
        Z.interpreter.cmd('PalSupport', 'quizdone', '7', '4');
        Z.BattleManager.endBattle(2);
        Z.BattleManager.updateBattleEnd();
        return Z.party._m[1].hp;
    })(), 1);

    // And the damage must survive to the map for a survivor as usual.
    eq('the survivor still keeps its own HP', (function () {
        const Z = makeRuntime(PARAMS);
        Z.BattleManager.setup(4, false, true);
        Z.vars[6] = 1;
        Z.vars[7] = 6;
        Z.party._m[0].hp = 7;
        Z.party._m[1].hp = 0;
        Z.interpreter.cmd('PalSupport', 'quizdone', '7', '4');
        Z.BattleManager.endBattle(2);
        Z.BattleManager.updateBattleEnd();
        return Z.party._m[0].hp;
    })(), 7);

    // A quiz authored without "can lose" must still never reach game over.
    const V = makeRuntime(PARAMS);
    V.BattleManager.setup(4, false, false);       // canLose = false
    V.vars[6] = 0;
    V.interpreter.cmd('PalSupport', 'quizdone', '7', '4');
    check('a quiz loss forces canLose so the game over screen is unreachable',
        V.BattleManager._canLose === true);
    V.BattleManager.endBattle(2);
    V.BattleManager.updateBattleEnd();
    check('no game over is reached', V.BattleManager.gameover === false);
    check('the party is alive again after the exit', !V.party._m[0].isDead());

    eq('a won fight is never touched by the defeat hook', (function () {
        const W2 = makeRuntime(PARAMS);
        W2.BattleManager.setup(1, false, true);
        W2.interpreter.cmd('PalBattleHUD', 'score', 'add', '1');
        W2.party._m[0].hp = 37;
        W2.BattleManager.endBattle(0);
        W2.BattleManager.updateBattleEnd();
        return W2.party._m[0].hp;
    })(), 37);

    // A decided quiz cannot be replayed into the hook: setup clears it.
    eq('a stale defeat never leaks into the next battle', (function () {
        const N = makeRuntime(PARAMS);
        N.BattleManager.setup(4, false, true);
        N.vars[6] = 0;
        N.interpreter.cmd('PalSupport', 'quizdone', '7', '4');
        N.party._m[0].hp = 80;                    // hypothetically healed between fights
        N.BattleManager.setup(4, false, true);    // next battle starts
        N.BattleManager.endBattle(2);
        N.BattleManager.updateBattleEnd();
        return N.party._m[0].hp;
    })(), 80);

    // Without the injected threshold the command still has a safe default.
    const D = makeRuntime(PARAMS);
    D.BattleManager.setup(4, false, true);
    D.vars[6] = 3;                                  // half of 6
    D.interpreter.cmd('PalSupport', 'quizdone', '6');
    check('quizdone without a threshold defaults to half the questions',
        D.troop.isAllDead(), D.troop.members()[0].hp);
    eq('default threshold leaves the party alive', D.party._m[0].hp, 100);
}

console.log('\nPalSupport — the tutorial Game Over command is neutralised');
{
    // Troop 1 ends its final wrong branches with a "Game Over" event command.
    // It must be gone from the runtime page, or the run resets to the title.
    const R = makeRuntime(PARAMS);
    const core = R.sandbox.window.PalQuiz.core;
    const src = R.sandbox.$dataTroops[1].pages[0].list;
    check('the untouched troop page really contains Game Over',
        src.some(c => c.code === 353));

    const out = core.transform(src, Math.random, {
        shuffleQuestions: true, shuffleAnswers: true,
        neutralizeOrdinals: true, softenGameOver: true, injectHint: true
    });
    check('transformed page has no Game Over command',
        !out.some(c => c.code === 353));
    check('transformed page still ends with quizdone',
        out.some(c => c.code === 356 && /quizdone/i.test(String(c.parameters[0]))));

    // Off switch keeps the original behaviour.
    const kept = core.transform(src, Math.random, {
        shuffleQuestions: true, shuffleAnswers: true,
        neutralizeOrdinals: true, softenGameOver: false, injectHint: true
    });
    check('softenGameOver=false keeps the Game Over command',
        kept.some(c => c.code === 353));
}

console.log('\nPalSupport — candy items');
{
    const R = makeRuntime(PARAMS);
    const candy = R.sandbox.$dataItems.find(i => i && i.id === 6);
    check('candy has a point note', /<CandyPoint:10>/i.test(candy.note), candy.note);
    check('candy has an icon', candy.iconIndex > 0, candy.iconIndex);

    R.BattleManager.setup(1, false, true);
    R.party.gainItem(candy, 2, false);
    eq('two candies add 20 points', R.vars[5], 20);
}

console.log('\nPalSupport — kill switch');
{
    const R = makeRuntime(PARAMS);
    R.sws[31] = true;                     // PalSupport_Disabled
    R.BattleManager.setup(1, false, true);
    R.interpreter.cmd('PalBattleHUD', 'score', 'add', '1');
    eq('disabled plugin does not award points', R.vars[5] || 0, 0);
    eq('disabled plugin does not count correct', R.vars[6] || 0, 0);
}

console.log('\nPalQuiz — runtime shuffle');
{
    const R = makeRuntime(PARAMS);
    const core = R.sandbox.window.PalQuiz.core;
    const before = JSON.parse(JSON.stringify(R.sandbox.$dataTroops[3].pages[0].list));

    let changed = false;
    for (let i = 0; i < 20 && !changed; i++) {
        R.BattleManager.setup(3, false, true);
        const after = R.sandbox.$dataTroops[3].pages[0].list;
        if (JSON.stringify(after) !== JSON.stringify(before)) changed = true;
    }
    check('battle setup rewrites the troop page in memory', changed);

    const after = R.sandbox.$dataTroops[3].pages[0].list;
    check('still has 7 labels', after.filter(c => c.code === 118 && c.indent === 0).length === 7);
    check('every jump resolves', core.allJumpTargetsResolve(after));
    check('structure still valid', core.validateBlocks(core.splitBlocks(after).blocks));
    check('quizdone appended', after.some(c => c.code === 356 && /palsupport quizdone/i.test((c.parameters || []).join(' '))));

    // And the on-disk file must be untouched.
    const disk = JSON.parse(read('data/Troops.json'));
    check('data/Troops.json unchanged on disk',
        JSON.stringify(disk[3].pages[0].list) === JSON.stringify(before));

    // Kill switch off.
    const D = makeRuntime(PARAMS);
    D.sws[30] = true;                     // QuizShuffle_Disabled
    const raw = JSON.parse(JSON.stringify(D.sandbox.$dataTroops[4].pages[0].list));
    D.BattleManager.setup(4, false, true);
    check('disabled shuffler leaves the page alone',
        JSON.stringify(D.sandbox.$dataTroops[4].pages[0].list) === JSON.stringify(raw));

    // PalSupport kill switch on: damage must stay as authored, because the old
    // last-question 100 is what ends the battle when quizdone is ignored.
    const S = makeRuntime(PARAMS);
    S.sws[31] = true;                     // PalSupport_Disabled
    S.BattleManager.setup(1, false, true);
    const dmg = S.sandbox.$dataTroops[1].pages[0].list
        .filter(c => c.code === 331).map(c => c.parameters[3]);
    check('with PalSupport off, authored damage is kept so the battle can end',
        dmg.includes(100), dmg);
}

console.log('\nPalQuiz — injected command shape');
{
    const R = makeRuntime(PARAMS);
    const core = R.sandbox.window.PalQuiz.core;
    const out = core.transform(R.sandbox.$dataTroops[1].pages[0].list, Math.random, {
        shuffleQuestions: true, shuffleAnswers: true, neutralizeOrdinals: true, injectHint: true
    });

    const hints = out.filter(c => c.code === 356 && /^palsupport hint$/i.test(String(c.parameters[0] || '')));
    const done = out.filter(c => c.code === 356 && /^palsupport quizdone/i.test(String(c.parameters[0] || '')));

    // MV's command356 does params[0].split(" "), so the whole command must be
    // ONE string. Storing ['PalSupport','hint'] silently does nothing at runtime.
    check('hint command is one MV string (3 blocks)',
        hints.length === 3 && hints.every(c => c.parameters.length === 1),
        hints.map(c => c.parameters));
    check('quizdone command is one MV string',
        done.length === 1 && done[0].parameters.length === 1,
        done.map(c => c.parameters));

    // And it must actually dispatch through the engine's parser.
    const before = R.vars[11];
    R.BattleManager.setup(1, false, true);
    R.vars[6] = 0;                                   // 0 correct -> quiz failed
    R.interpreter.line(String(done[0].parameters[0]));
    check('quizdone knocks the party out for the engine defeat path',
        R.party._m[0].hp === 0, R.party._m[0].hp);
    check('hint charges still sane', R.vars[11] === before || R.vars[11] === 2, R.vars[11]);

    // Same command, passing score: the troop must die instead.
    const P = makeRuntime(PARAMS);
    const pout = core.transform(P.sandbox.$dataTroops[1].pages[0].list, Math.random, {
        shuffleQuestions: true, shuffleAnswers: true, neutralizeOrdinals: true, injectHint: true
    });
    const pdone = pout.filter(c => c.code === 356 && /^palsupport quizdone/i.test(String(c.parameters[0] || '')));
    P.BattleManager.setup(1, false, true);
    P.vars[6] = 2;                                   // 2 of 3 is a pass
    P.interpreter.line(String(pdone[0].parameters[0]));
    check('quizdone finishes the enemy when the score passes', P.troop.isAllDead(), P.troop.members()[0].hp);
    eq('quizdone leaves the party alive when the score passes', P.party._m[0].hp, 100);
    check('the injected command carries the pass threshold',
        /\s3\s2$/.test(String(pdone[0].parameters[0])), pdone[0].parameters[0]);
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
