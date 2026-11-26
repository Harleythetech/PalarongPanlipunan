//=============================================================================
// PalSupport.js
//=============================================================================
/*:
 * @plugindesc [v1.0.0] Candy Points, Arkin support gauge and answer feedback
 * for Palarong Panlipunan quiz battles.
 *
 * Hooks the PalBattleHUD score commands that every quiz branch already calls,
 * so no troop page has to be edited.
 *
 * @author Harleythetech
 *
 * @param pointsVarId
 * @default 5
 *
 * @param correctVarId
 * @default 6
 *
 * @param wrongVarId
 * @default 7
 *
 * @param supportVarId
 * @default 8
 *
 * @param rankVarId
 * @default 9
 *
 * @param streakVarId
 * @default 10
 *
 * @param hintVarId
 * @default 11
 *
 * @param accuracyVarId
 * @default 12
 *
 * @param hintGateVarId
 * @default 15
 *
 * @param lostSwitchId
 * @default 23
 *
 * @param supportSwitchId
 * @default 31
 *
 * @param correctPoints
 * @default 10
 *
 * @param wrongSupportDamage
 * @default 15
 *
 * @param correctSupportGain
 * @default 5
 *
 * @param hintPointCost
 * @default 10
 *
 * @param hintSupportCost
 * @default 10
 *
 * @param streakBonus
 * @default 5
 *
 * @param streakLength
 * @default 3
 *
 * @param candyPointPerItem
 * @default 10
 *
 * @param Debug Logging
 * @default false
 *
 * @help
 * ============================================================================
 * PalSupport — rewards, support and feedback
 * ============================================================================
 *
 * PLUGIN COMMANDS
 *
 *   PalSupport quizdone <total>
 *       Evaluates the quiz. Injected automatically by PalQuiz at the end of
 *       the shuffled question chain. Passing zeroes the troop's HP so the
 *       engine ends the battle through the normal victory path.
 *
 *   PalSupport hint
 *       Charges one hint to the player. Injected automatically by PalQuiz at
 *       the end of every hint branch.
 *
 *   PalSupport points add|set <n>
 *   PalSupport support add|set <n>
 *   PalSupport candy <n>
 *
 * KILL SWITCH
 *   Switch 31 (PalSupport_Disabled) ON turns the whole plugin off.
 *   Switch 30 (QuizShuffle_Disabled) ON turns the PalQuiz shuffler off.
 *
 * All hooks are wrapped in try/catch. A failure logs to the console and lets
 * the engine continue as if the plugin were not installed.
 */
(function () {
    'use strict';

    var NAME = 'PalSupport';
    var p = PluginManager.parameters(NAME);
    var num = function (k, d) { var v = Number(p[k]); return isNaN(v) ? d : v; };
    var bool = function (k, d) {
        if (p[k] === undefined) return d;
        return String(p[k]).toLowerCase() === 'true';
    };

    var C = {
        pointsVar:   num('pointsVarId', 5),
        correctVar:  num('correctVarId', 6),
        wrongVar:    num('wrongVarId', 7),
        supportVar:  num('supportVarId', 8),
        rankVar:     num('rankVarId', 9),
        streakVar:   num('streakVarId', 10),
        hintVar:     num('hintVarId', 11),
        accuracyVar: num('accuracyVarId', 12),
        hintGateVar: num('hintGateVarId', 15),
        lostSwitch:  num('lostSwitchId', 23),
        supportSwitch: num('supportSwitchId', 31),

        correctPoints: num('correctPoints', 10),
        wrongSupport:  num('wrongSupportDamage', 15),
        correctSupport: num('correctSupportGain', 5),
        hintPointCost: num('hintPointCost', 10),
        hintSupportCost: num('hintSupportCost', 10),
        streakBonus:   num('streakBonus', 5),
        streakLength:  num('streakLength', 3),
        candyPerItem:  num('candyPointPerItem', 10),
        debug:         bool('Debug Logging', false)
    };

    var RANKS = [
        { min: 0,   max: 100, hp: 100, hints: 2, name: 'Kasama'   },
        { min: 100, max: 250, hp: 120, hints: 3, name: 'Gabay'    },
        { min: 250, max: 500, hp: 150, hints: 4, name: 'Sandigan' },
        { min: 500, max: Infinity, hp: 200, hints: 5, name: 'Katuwang' }
    ];

    // Set when the quiz was failed and the party was knocked out on purpose so
    // the normal "If Lose" path runs. Cleared by the endBattle hook, which also
    // restores the party so they are not left dead on the map.
    var quizDefeat = false;

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function disabled() {
        try {
            return $gameSwitches && $gameSwitches.value(C.supportSwitch) === true;
        } catch (e) { return true; }
    }

    function log() {
        if (!C.debug) return;
        try {
            if (typeof RPGReloadedLog === 'function') {
                RPGReloadedLog(NAME, Array.prototype.slice.call(arguments));
            } else {
                console.log.apply(console, [NAME].concat([].slice.call(arguments)));
            }
        } catch (e) { /* ignore */ }
    }

    function gv(id)      { return $gameVariables ? Number($gameVariables.value(id)) || 0 : 0; }
    function sv(id, v)   { if ($gameVariables) $gameVariables.setValue(id, v); }
    function addv(id, n) { sv(id, gv(id) + n); }

    function rankFor(points) {
        for (var i = RANKS.length - 1; i >= 0; i--) {
            if (points >= RANKS[i].min) return i;
        }
        return 0;
    }

    function rankData(points) { return RANKS[rankFor(points)]; }

    function supportMax(points) { return rankData(points).hp; }

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    /** Sync rank variable and the lost switch from current points/support. */
    function refreshState() {
        var points  = gv(C.pointsVar);
        var rank    = rankFor(points);
        var support = gv(C.supportVar);
        var maxHp   = RANKS[rank].hp;

        if (support > maxHp) { support = maxHp; sv(C.supportVar, support); }
        sv(C.rankVar, rank + 1);

        if (support <= 0) {
            // Exhausted: no hint charges until the next battle.
            sv(C.hintVar, 0);
            sv(C.hintGateVar, 0);
            if ($gameSwitches) $gameSwitches.setValue(C.lostSwitch, true);
        } else if ($gameSwitches && $gameSwitches.value(C.lostSwitch)) {
            $gameSwitches.setValue(C.lostSwitch, false);
        }
        return { points: points, rank: rank, support: support, maxHp: maxHp };
    }

    function updateAccuracy() {
        var c = gv(C.correctVar), w = gv(C.wrongVar), t = c + w;
        sv(C.accuracyVar, t > 0 ? Math.round((c / t) * 100) : 0);
    }

    // -------------------------------------------------------------------------
    // Feedback layer
    // -------------------------------------------------------------------------

    function flash(correct) {
        try {
            if (!$gameScreen) return;
            if (correct) {
                $gameScreen.startFlash([140, 255, 150, 110], 16);
            } else {
                $gameScreen.startFlash([255, 120, 120, 120], 16);
                $gameScreen.startShake(4, 4, 12);
            }
        } catch (e) { log('flash failed', e); }
    }

    function sound(correct) {
        try {
            if (correct) SoundManager.playItem();
            else         SoundManager.playBuzzer();
        } catch (e) { log('sound failed', e); }
    }

    function pop(text, color) {
        try {
            var scene = SceneManager._scene;
            if (scene && scene._palSupportLayer) {
                scene._palSupportLayer.push(text, color || '#ffffff');
            }
        } catch (e) { log('pop failed', e); }
    }

    // -------------------------------------------------------------------------
    // Support / point pipelines
    // -------------------------------------------------------------------------

    function onCorrect() {
        addv(C.correctVar, 1);
        var streak = gv(C.streakVar) + 1;
        sv(C.streakVar, streak);

        var gained = C.correctPoints;
        var bonus  = 0;
        if (C.streakLength > 0 && streak % C.streakLength === 0) {
            bonus = C.streakBonus;
        }
        addv(C.pointsVar, gained + bonus);

        var st = refreshState();
        sv(C.supportVar, clamp(st.support + C.correctSupport, 0, st.maxHp));
        refreshState();
        updateAccuracy();

        sound(true);
        flash(true);
        pop('+' + (gained + bonus), '#7CFC8A');
        if (bonus) pop('Streak +' + bonus, '#FFD700');
        log('correct', gained + bonus, 'points', gv(C.pointsVar));
    }

    function onWrong() {
        addv(C.wrongVar, 1);
        sv(C.streakVar, 0);

        var st = refreshState();
        var dmg = st.support > 0 ? Math.min(st.support, C.wrongSupport) : 0;
        sv(C.supportVar, clamp(st.support - C.wrongSupport, 0, st.maxHp));
        refreshState();
        updateAccuracy();

        sound(false);
        flash(false);
        pop('-' + C.wrongSupport, '#FF6B6B');
        log('wrong', 'support damage', dmg, 'support', gv(C.supportVar));
    }

    function onHint() {
        var st = refreshState();
        if (st.support <= 0) return;   // exhausted: the event already blocks the hint

        // The event's own Control Variables already decremented the visible
        // counter; mirror our charge count onto it so both stay in step.
        var charges = Math.max(0, gv(C.hintVar) - 1);
        sv(C.hintVar, charges);
        sv(C.hintGateVar, charges);

        addv(C.pointsVar, -C.hintPointCost);
        if (gv(C.pointsVar) < 0) sv(C.pointsVar, 0);

        var st2 = refreshState();
        sv(C.supportVar, clamp(st2.support - C.hintSupportCost, 0, st2.maxHp));
        refreshState();

        try { SoundManager.playCursor(); } catch (e) { /* ignore */ }
        pop('-' + C.hintPointCost, '#FFB266');
        pop('Pahiwatig', '#FFD700');
        log('hint used', 'points', gv(C.pointsVar), 'support', gv(C.supportVar));
    }

    function onQuizDone(total) {
        var correct = gv(C.correctVar);
        var wrong   = gv(C.wrongVar);
        total = Math.max(1, Number(total) || 0, correct + wrong);

        refreshState();
        updateAccuracy();

        var dead = false;
        try {
            dead = !!($gameTroop && $gameTroop.isAllDead && $gameTroop.isAllDead());
        } catch (e) { dead = false; }

        // Each correct answer already deals lethal damage inside the troop
        // event, so a living troop means the round was failed completely.
        if (dead) {
            pop('PANALO!', '#FFD700');
            log('quiz done', correct + '/' + total, 'victory');
            return;
        }

        // Never leave the player inside a battle whose command windows are
        // hidden. Force the engine's own defeat path; the map's If Lose branch
        // and the endBattle hook below take it from there.
        quizDefeat = true;
        try {
            $gameParty.members().forEach(function (m) {
                if (m && !m.isDead()) m.gainHp(-m.hp);
            });
        } catch (e) { log('defeat push failed', e); }

        pop('KULANG PA', '#FF8A8A');
        log('quiz done', correct + '/' + total, 'forced defeat');
    }

    // -------------------------------------------------------------------------
    // HUD card
    // -------------------------------------------------------------------------

    var G = {
        bg:      'rgba(10, 14, 22, 0.65)',
        border:  'rgba(255, 255, 255, 0.12)',
        gaugeBg: 'rgba(0, 0, 0, 0.65)',
        gold:    '#FFD700'
    };
    var FONT = 'GameFont, Arial, sans-serif';

    function ctxOf(bmp) { return bmp._context; }

    function roundRect(ctx, x, y, w, h, r, fill, stroke) {
        r = Math.min(r, w / 2, h / 2);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);     ctx.arcTo(x + w, y,     x + w, y + r,     r);
        ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);     ctx.arcTo(x,     y + h, x,     y + h - r, r);
        ctx.lineTo(x, y + r);         ctx.arcTo(x,     y,     x + r, y,         r);
        ctx.closePath();
        if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
        ctx.restore();
    }

    function text(ctx, str, x, y, size, color, bold) {
        ctx.save();
        ctx.font = (bold ? 'bold ' : '') + size + 'px ' + FONT;
        ctx.textBaseline = 'top';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.lineWidth = 3;
        ctx.strokeText(str, x, y);
        ctx.fillStyle = color;
        ctx.fillText(str, x, y);
        ctx.restore();
    }

    function gauge(ctx, x, y, w, h, ratio, c1, c2) {
        ctx.save();
        ctx.fillStyle = G.gaugeBg;
        ctx.fillRect(x, y, w, h);
        var fw = Math.max(0, Math.floor((w - 2) * clamp(ratio, 0, 1)));
        if (fw > 0) {
            var grad = ctx.createLinearGradient(x + 1, y, x + 1 + fw, y);
            grad.addColorStop(0, c1);
            grad.addColorStop(1, c2);
            ctx.fillStyle = grad;
            ctx.fillRect(x + 1, y + 1, fw, h - 2);
        }
        ctx.restore();
    }

    function Sprite_PalSupportCard() {
        Sprite.prototype.initialize.call(this);
        this._snap = null;
        this.visible = true;
    }
    Sprite_PalSupportCard.prototype = Object.create(Sprite.prototype);
    Sprite_PalSupportCard.prototype.constructor = Sprite_PalSupportCard;

    Sprite_PalSupportCard.prototype.snapshot = function () {
        return [
            gv(C.pointsVar), gv(C.supportVar), gv(C.rankVar),
            gv(C.hintVar), gv(C.correctVar), gv(C.wrongVar), gv(C.accuracyVar),
            $gameSwitches ? ($gameSwitches.value(C.lostSwitch) ? 1 : 0) : 0
        ].join('|');
    };

    Sprite_PalSupportCard.prototype.rebuild = function () {
        var points  = gv(C.pointsVar);
        var rank    = rankFor(points);
        var info    = RANKS[rank];
        var maxHp   = info.hp;
        var support = clamp(gv(C.supportVar), 0, maxHp);
        var lost    = support <= 0;

        var w = 300, pad = 10;
        var titleFs = 15, nameFs = 15, smallFs = 13;
        var h = pad + titleFs + 8 + nameFs + 8 + 14 + 8 + smallFs + 8 + smallFs + pad;

        this.bitmap = new Bitmap(w, h);
        var bmp = this.bitmap;
        var ctx = ctxOf(bmp);

        roundRect(ctx, 0, 0, w, h, 10, G.bg, G.border);

        text(ctx, 'ARKIN', pad, pad, titleFs, G.gold, true);

        var label = info.name.toUpperCase();
        ctx.save();
        ctx.font = 'bold ' + titleFs + 'px ' + FONT;
        var lw = ctx.measureText(label).width;
        ctx.restore();
        text(ctx, label, w - pad - lw, pad, titleFs,
             lost ? '#808080' : '#C0D0FF', true);

        var y = pad + titleFs + 8;

        if (lost) {
            text(ctx, 'WALA', pad, y, nameFs, '#FF6B6B', true);
            text(ctx, 'Naubos ang lakas ni Arkin', pad, y + nameFs + 6, smallFs, '#AAAAAA');
        } else {
            text(ctx, 'SUPORTA', pad, y, smallFs, '#FFFFFF');
            var hpStr = support + ' / ' + maxHp;
            ctx.save();
            ctx.font = 'bold ' + smallFs + 'px ' + FONT;
            var hw = ctx.measureText(hpStr).width;
            ctx.restore();
            text(ctx, hpStr, w - pad - hw, y, smallFs, '#FFFFFF', true);
            var gy = y + 16;
            var ratio = maxHp > 0 ? support / maxHp : 0;
            gauge(ctx, pad, gy, w - pad * 2, 10, ratio, '#6FDE6F', '#46C046');
            y = gy + 10 + 8;
        }

        // Footer: hints + candy + score
        var hintTxt = 'Pahiwatig ' + gv(C.hintVar) + '/' + info.hints;
        text(ctx, hintTxt, pad, y, smallFs, gv(C.hintVar) > 0 ? '#FFFFFF' : '#888888');

        var candyTxt = 'Kendi ' + points;
        ctx.save();
        ctx.font = 'bold ' + smallFs + 'px ' + FONT;
        var cw = ctx.measureText(candyTxt).width;
        ctx.restore();
        text(ctx, candyTxt, w - pad - cw, y, smallFs, G.gold, true);

        // Running tally for the current battle.
        y += smallFs + 6;
        var acc = gv(C.accuracyVar);
        var tally = 'Tama ' + gv(C.correctVar) + '   Mali ' + gv(C.wrongVar) + '   ' + acc + '%';
        text(ctx, tally, pad, y, smallFs, acc >= 60 ? '#9FE6A0' : '#F0B0B0');

        bmp._setDirty();

        // Sit under the right-hand party panel, never over the dialogue box.
        var scene = SceneManager._scene;
        this.x = Graphics.boxWidth - this.bitmap.width - 8;
        var py = 8;
        try {
            if (scene && scene._palPlayerPanel && scene._palPlayerPanel.bitmap) {
                py = scene._palPlayerPanel.y + scene._palPlayerPanel.bitmap.height + 6;
            }
        } catch (e) { /* fall back to the top edge */ }
        this.y = py;
    };

    Sprite_PalSupportCard.prototype.update = function () {
        Sprite.prototype.update.call(this);
        var snap = this.snapshot();
        if (snap !== this._snap) {
            this._snap = snap;
            this.rebuild();
        }
    };

    // -------------------------------------------------------------------------
    // Floating score pops
    // -------------------------------------------------------------------------

    function Sprite_PalPop(str, color) {
        Sprite.prototype.initialize.call(this);
        this._life = 70;
        this._age = 0;
        this.bitmap = new Bitmap(240, 48);
        var ctx = this.bitmap._context;
        text(ctx, str, 0, 0, 26, color, true);
        var w = ctx.measureText(str).width;
        this.bitmap = new Bitmap(Math.max(60, Math.ceil(w) + 16), 44);
        text(this.bitmap._context, str, 8, 4, 26, color, true);
        this.bitmap._setDirty();
        this.x = Graphics.boxWidth / 2 - this.bitmap.width / 2;
        this.y = Graphics.boxHeight * 0.45;
        this.opacity = 0;
        this._slot = Sprite_PalPop._slot = (Sprite_PalPop._slot || 0) + 1;
    }
    Sprite_PalPop.prototype = Object.create(Sprite.prototype);
    Sprite_PalPop.prototype.constructor = Sprite_PalPop;

    Sprite_PalPop.prototype.update = function () {
        Sprite.prototype.update.call(this);
        this._age++;
        var t = this._age;
        this.opacity = t < 10 ? Math.round(255 * (t / 10))
                     : t > 45 ? Math.round(255 * (1 - (t - 45) / 25))
                     : 255;
        this.y -= 0.9;
        if (t >= this._life) this.visible = false;
    };

    function Sprite_PalSupportLayer() {
        this.initialize.apply(this, arguments);
    }
    Sprite_PalSupportLayer.prototype = Object.create(Sprite.prototype);
    Sprite_PalSupportLayer.prototype.constructor = Sprite_PalSupportLayer;
    Sprite_PalSupportLayer.prototype.initialize = function () {
        Sprite.prototype.initialize.call(this);
        this._pending = [];
    };
    Sprite_PalSupportLayer.prototype.push = function (str, color, delay) {
        this._pending.push({ str: str, color: color, delay: delay || 0 });
    };
    Sprite_PalSupportLayer.prototype.update = function () {
        Sprite.prototype.update.call(this);
        if (!this._pending.length) return;
        for (var i = 0; i < this._pending.length; i++) {
            var item = this._pending[i];
            if (item.delay > 0) { item.delay--; continue; }
            this.addChild(new Sprite_PalPop(item.str, item.color));
            this._pending.splice(i, 1);
            i--;
        }
    };

    // -------------------------------------------------------------------------
    // Scene_Battle integration
    // -------------------------------------------------------------------------

    var _Scene_Battle_createDisplayObjects = Scene_Battle.prototype.createDisplayObjects;
    Scene_Battle.prototype.createDisplayObjects = function () {
        _Scene_Battle_createDisplayObjects.call(this);
        try {
            if (disabled()) return;
            this._palSupportCard = new Sprite_PalSupportCard();
            this._palSupportLayer = new Sprite_PalSupportLayer();
            this.addChild(this._palSupportCard);
            this.addChild(this._palSupportLayer);
        } catch (e) { log('scene hook failed', e); }
    };

    // -------------------------------------------------------------------------
    // Battle lifecycle
    // -------------------------------------------------------------------------

    var _BattleManager_setup = BattleManager.setup;
    BattleManager.setup = function (troopId, canEscape, canLose) {
        _BattleManager_setup.apply(this, arguments);
        try {
            if (disabled()) return;

            // Per-battle counters
            sv(C.correctVar, 0);
            sv(C.wrongVar, 0);
            sv(C.streakVar, 0);
            sv(C.accuracyVar, 0);
            quizDefeat = false;

            var points = gv(C.pointsVar);
            var rank   = rankFor(points);
            var info   = RANKS[rank];
            var sup    = gv(C.supportVar);

            // Rank is 0 only until the first battle of a new game (or an old
            // save). Treat that as "never initialised" so Arkin starts at full
            // support instead of being mistaken for an exhausted 0.
            var fresh = gv(C.rankVar) === 0;

            if (fresh) {
                sup = info.hp;
            } else if (sup <= 0) {
                sup = 25;                        // recovered a little between battles
            }
            if (sup > info.hp) sup = info.hp;
            sv(C.supportVar, sup);
            sv(C.rankVar, rank + 1);
            sv(C.hintVar, info.hints);
            sv(C.hintGateVar, info.hints);
            refreshState();
            log('battle setup rank=' + (rank + 1), 'support=' + sup, 'hints=' + info.hints);
        } catch (e) { log('battle setup failed', e); }
    };

    // A failed quiz knocks the party out so the engine runs the normal defeat
    // path. Restore them immediately afterwards: the existing If Lose branches
    // do not heal, which would leave the player walking around with 0 HP.
    var _BattleManager_endBattle = BattleManager.endBattle;
    BattleManager.endBattle = function (result) {
        _BattleManager_endBattle.apply(this, arguments);
        try {
            if (!quizDefeat) return;
            quizDefeat = false;
            $gameParty.members().forEach(function (m) {
                m.setHp(m.mhp);
                m.setMp(m.mmp);
            });
            log('quiz defeat: party restored');
        } catch (e) { log('post-defeat heal failed', e); }
    };

    // -------------------------------------------------------------------------
    // Candy item pickups
    // -------------------------------------------------------------------------

    var _Game_Party_gainItem = Game_Party.prototype.gainItem;
    Game_Party.prototype.gainItem = function (item, amount, includeEquip) {
        _Game_Party_gainItem.call(this, item, amount, includeEquip);
        try {
            if (disabled() || !item || !amount || amount <= 0) return;
            var note = item.note || '';
            var m = note.match(/<CandyPoint(?::\s*(\d+))?\s*>/i);
            if (m) {
                var per = (m[1] === undefined) ? C.candyPerItem : Number(m[1]);
                addv(C.pointsVar, per * amount);
                refreshState();
                log('candy picked', item.name, '+' + (per * amount));
            }
        } catch (e) { log('gainItem hook failed', e); }
    };

    // -------------------------------------------------------------------------
    // Plugin commands
    // -------------------------------------------------------------------------

    var _pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function (command, args) {
        _pluginCommand.call(this, command, args);
        try {
            var cmd = String(command || '').toLowerCase();

            // Intercept the score commands BattleHUD already handles.
            if (cmd === 'battlehud' || cmd === 'palbattlehud') {
                if (disabled()) return;
                var sub = String((args && args[0]) || '').toLowerCase();
                var op  = String((args && args[1]) || '').toLowerCase();
                if (sub === 'score'      && op === 'add') { onCorrect(); return; }
                if (sub === 'enemyscore' && op === 'add') { onWrong();   return; }
                return;
            }

            if (cmd !== 'palsupport') return;
            if (disabled()) return;

            var a0 = String((args && args[0]) || '').toLowerCase();
            var a1 = String((args && args[1]) || '').toLowerCase();
            var n  = Number(args && args[2]);

            if (a0 === 'quizdone') { onQuizDone(n); return; }
            if (a0 === 'hint')     { onHint(); return; }

            if (a0 === 'points') {
                if (a1 === 'add') addv(C.pointsVar, n || 0);
                else if (a1 === 'set') sv(C.pointsVar, n || 0);
                refreshState();
                return;
            }
            if (a0 === 'support') {
                if (a1 === 'add') addv(C.supportVar, n || 0);
                else if (a1 === 'set') sv(C.supportVar, n || 0);
                refreshState();
                return;
            }
            if (a0 === 'candy') {
                addv(C.pointsVar, n || 0);
                refreshState();
                return;
            }
        } catch (e) { log('pluginCommand failed', e); }
    };

})();
