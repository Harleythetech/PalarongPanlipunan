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
 *   PalSupport quizdone <total> <pass>
 *       Evaluates the quiz. Injected automatically by PalQuiz at the end of
 *       the shuffled question chain. Passing zeroes the troop's HP so the
 *       engine ends the battle through the normal victory path; failing knocks
 *       the party out so the engine runs its normal defeat path, then restores
 *       the HP the party had earned. The damage from wrong answers is therefore
 *       permanent, like a normal battle — including through the map's own
 *       "Recover All" in the battle's win/lose branch, which is capped at max HP
 *       minus this quiz's damage. A wiped party loses even if the score passes,
 *       and a member knocked out during a won quiz gets up at 1 HP.
 *
 *   PalSupport hint
 *       Charges one hint to the player. Injected automatically by PalQuiz at
 *       the end of every hint branch.
 *
 *   PalSupport points add|set <n>
 *   PalSupport support add|set <n>
 *   PalSupport candy <n>
 *
 * HEALTH
 *   A wrong answer costs HP through the troop page's own Change HP command, so
 *   the party bars drop during the quiz and the cost is announced as "-N HP".
 *   Answers are always judged honestly: health is the stake, not the scorer.
 *   A Potion (item 1) heals normally and is never touched by this bookkeeping.
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

    // The HP each member has earned by the time the quiz ends. Play is scored by
    // health now, so this is the value the player must walk away with: a wrong
    // answer costs HP and that cost is kept after the quiz, won or lost.
    //
    // Recorded at quizdone and applied once the battle is over. The map's own
    // post-battle branch usually calls Recover All, which would silently erase
    // the damage again, so the same values are re-applied once if that happens.
    var resultHp = null;

    // The map event interpreter that started the battle. Its "If Win" / "If Lose"
    // branch is the only heal that belongs to the battle's aftermath; an inn or a
    // story heal runs on a different interpreter and must never be capped.
    var quizBattleInterpreter = null;

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
    // Health feedback
    // -------------------------------------------------------------------------
    //
    // A quiz that runs on health only reads as one if the player can see what an
    // answer cost. The troop page applies its own Change HP command and only
    // then calls the score command, so the difference between this answer and the
    // previous one is exactly that answer's damage. Nothing is hard-coded here:
    // whatever the branch did to the bars is what gets reported.
    var lastHpSnap = null;

    function hpSnapshot() {
        return partyList().map(function (m) { return m ? m.hp : 0; });
    }

    // Largest single drop since the last answer, because the authored command
    // hits every member with the same value. Returns the amount lost.
    function reportHpCost() {
        var now = hpSnapshot();
        if (!lastHpSnap) { lastHpSnap = now; return 0; }
        var lost = 0, gained = 0;
        for (var i = 0; i < now.length && i < lastHpSnap.length; i++) {
            var d = (now[i] || 0) - (lastHpSnap[i] || 0);   // positive = healed
            if (d < 0 && -d > lost) lost = -d;
            if (d > 0 && d > gained) gained = d;
        }
        if (lost > 0) {
            pop('-' + lost + ' HP', '#FF6B6B');
        } else if (gained > 0) {
            pop('+' + gained + ' HP', '#7CFC8A');
        }
        lastHpSnap = now;
        return lost;
    }

    // -------------------------------------------------------------------------
    // Support / point pipelines
    // -------------------------------------------------------------------------

    function onCorrect() {
        addv(C.correctVar, 1);
        var streak = gv(C.streakVar) + 1;
        sv(C.streakVar, streak);

        // A correct answer should never cost health, but report it if a troop
        // page ever is authored that way.
        reportHpCost();

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

        // What the branch's own Change HP command just took off the party.
        var hpLost = reportHpCost();

        var st = refreshState();
        var dmg = st.support > 0 ? Math.min(st.support, C.wrongSupport) : 0;
        sv(C.supportVar, clamp(st.support - C.wrongSupport, 0, st.maxHp));
        refreshState();
        updateAccuracy();

        sound(false);
        flash(false);
        pop('Arkin -' + C.wrongSupport, '#FFB86B');
        log('wrong', 'hp', -hpLost, 'support damage', dmg, 'support', gv(C.supportVar));
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

    function onQuizDone(total, pass) {
        var correct = gv(C.correctVar);
        var wrong   = gv(C.wrongVar);
        total = Math.max(1, Number(total) || 0, correct + wrong);

        // PalQuiz injects the number of correct answers this quiz needs. Fall
        // back to half the questions when it is missing (older saves, manual
        // testing), so the command always has a usable threshold.
        var need = Number(pass);
        if (!(need > 0)) need = Math.ceil(total / 2);
        need = Math.min(total, Math.max(1, Math.round(need)));

        refreshState();
        updateAccuracy();

        // Snapshot what the quiz cost before anything below changes HP. The
        // snapshot is what the player walks away with: the quiz's own mistakes
        // are spent, whatever the map does afterwards.
        recordResultHp();

        // A wiped party cannot win, however many right answers came after it
        // happened. Damage carries over between battles now, so it is possible
        // to walk into a quiz at low HP and be knocked out mid-round. The quiz
        // still runs to the end (MV does not check the party while a troop
        // event is running), so this is the point where the loss is decided.
        var wiped = false;
        try { wiped = !!($gameParty && $gameParty.isAllDead && $gameParty.isAllDead()); }
        catch (e) { wiped = false; }

        if (correct >= need && !wiped) {
            // Enough right answers: finish the enemy so the engine runs its own
            // victory path (the same route the old 100-damage finisher used).
            // This happens here, not on the individual answer, because MV ends
            // the battle the moment the last enemy dies and that would cut the
            // quiz short.
            try {
                if ($gameTroop && $gameTroop.members) {
                    $gameTroop.members().forEach(function (m) {
                        if (m && !m.isDead()) m.gainHp(-m.hp);
                    });
                }
            } catch (e) { log('victory finisher failed', e); }

            // Anyone knocked out during the quiz gets back up at 1 HP. A normal
            // victory would leave them dead on the map, and outside the tutorial
            // no map heals and no shop sells a revive item, so a dead member
            // would be stranded for good. The 1 HP is the consequence. Only
            // members who walked into the battle alive are stood back up.
            try {
                (resultHp || []).forEach(function (e) {
                    if (!e || !e.actor || e.enter <= 0) return;
                    if (e.actor.isDead && e.actor.isDead() && e.actor.setHp) e.actor.setHp(1);
                });
            } catch (e) { log('victory revive failed', e); }

            // Keep the snapshot honest about anyone who just stood back up.
            syncResultHp();
            pop('PANALO!', '#FFD700');
            log('quiz done', correct + '/' + total, 'victory (needed ' + need + ')');
            return;
        }

        // Failed round. The quiz is finished, so the fight has to end — and it
        // has to end with the party actually knocked out, so the player sees a
        // real defeat instead of a fight that stops with everyone standing.
        // The snapshot above already holds the HP they earned; the knockout ends
        // the battle, not the damage. The tutorial's "Game Over" command is
        // stripped by PalQuiz.

        // The quiz itself decides the loss, so never let it fall through to the
        // game over screen even if the map event was authored without
        // "can lose". With canLose the engine revives the party and pops back to
        // the map; the restore below then applies the HP they earned.
        try { BattleManager._canLose = true; } catch (e) { /* ignore */ }

        try {
            $gameParty.members().forEach(function (m) {
                if (m && !m.isDead()) m.gainHp(-m.hp);
            });
        } catch (e) { log('defeat push failed', e); }

        pop(wiped ? 'BUMIGAY!' : 'KULANG PA', '#FF8A8A');
        log('quiz done', correct + '/' + total,
            wiped ? 'defeat (party was wiped out)' : 'defeat (needed ' + need + ')');
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

            // Baseline for the quiz damage: the HP the player walked in with.
            recordEnterHp();
            lastHpSnap = hpSnapshot();

            // Per-battle counters
            sv(C.correctVar, 0);
            sv(C.wrongVar, 0);
            sv(C.streakVar, 0);
            sv(C.accuracyVar, 0);
            resultHp = null;
            quizBattleInterpreter = null;

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

    // HP at the start of the battle, in party order. The quiz damage is measured
    // from here, so the cost of a wrong answer is exactly what the player
    // watched come off the bar.
    var enterHp = null;

    // The actors that actually took part in the battle. Reserves did not, and a
    // member who was already dead before the fight must stay dead.
    function partyList() {
        try {
            if ($gameParty && $gameParty.battleMembers) return $gameParty.battleMembers();
            if ($gameParty && $gameParty.members) return $gameParty.members();
        } catch (e) { /* fall through */ }
        return [];
    }

    function recordEnterHp() {
        enterHp = null;
        try {
            enterHp = partyList().map(function (m) { return { actor: m, hp: m ? m.hp : 0 }; });
        } catch (e) { enterHp = null; }
    }

    // HP the actor walked into the battle with. Identity based, so a party that
    // changed shape during the battle cannot shift the numbers onto the wrong
    // member.
    function enterHpFor(m) {
        if (!enterHp) return m.hp;
        for (var i = 0; i < enterHp.length; i++) {
            if (enterHp[i].actor === m) return enterHp[i].hp;
        }
        return m.hp;
    }

    // Remember the HP each member has earned by the end of the quiz, and how
    // much of it the quiz itself took. The knockout on a lost round happens
    // after this, so the numbers survive it. `loss` is what a later heal has to
    // leave spent.
    function recordResultHp() {
        resultHp = [];
        try {
            partyList().forEach(function (m) {
                if (!m) return;
                var start = enterHpFor(m);
                var hp = Math.max(0, Math.min(m.mhp, m.hp || 0));
                resultHp.push({
                    actor: m,
                    enter: start,
                    hp: hp,
                    loss: Math.max(0, start - Math.max(hp, 1))
                });
            });
        } catch (e) { resultHp = null; }
    }

    // After a won quiz, anyone who was knocked out has just been stood back up
    // at 1 HP. Keep the snapshot in step so the map sees the same number.
    function syncResultHp() {
        (resultHp || []).forEach(function (e) {
            if (!e || !e.actor || e.enter <= 0) return;
            e.hp = Math.max(1, Math.min(e.actor.mhp, e.actor.hp || 0));
        });
    }

    // Put every member back on the HP they earned. Floored at 1: 0 HP on the map
    // is the game over screen, and nobody is left dead by a quiz. A member who
    // was already dead before the battle is left exactly as they were.
    function applyResultHp() {
        (resultHp || []).forEach(function (e) {
            if (!e || !e.actor || !e.actor.setHp) return;
            if (e.enter <= 0) return;
            e.actor.setHp(Math.max(1, Math.min(e.actor.mhp, e.hp)));
        });
    }

    // Used when the map heals the party straight after the battle. The heal is
    // allowed to do its job, but the mistakes of the quiz that just ended are
    // already spent: the member ends on max HP minus what the quiz cost, and
    // never on less than they had earned. So a party that enters at 100 and
    // takes 50 damage leaves at 50 even if the map says "Recover All", while a
    // party that entered at 40 still gets the authored top-up.
    function applyResultHpAfterHeal() {
        (resultHp || []).forEach(function (e) {
            if (!e || !e.actor || !e.actor.setHp) return;
            if (e.enter <= 0) return;
            var mhp = e.actor.mhp;
            var target = mhp - (e.loss || 0);
            if (target < e.hp) target = e.hp;      // never below the unhealed value
            e.actor.setHp(Math.max(1, Math.min(mhp, target)));
        });
    }

    function clearResultHp() {
        resultHp = null;
        quizBattleInterpreter = null;
    }

    // A quiz that is lost knocks the party out so the engine runs its normal
    // defeat path (defeat ME + defeat message + the map's "If Lose" branch). The
    // knockout must not erase the damage: once the engine is done with the
    // battle, each member goes back to the HP they had earned.
    //
    // Applied here, after the engine has finished with the battle, so the HUD
    // still shows the party dead for the whole defeat message.
    var _BattleManager_updateBattleEnd = BattleManager.updateBattleEnd;
    BattleManager.updateBattleEnd = function () {
        _BattleManager_updateBattleEnd.apply(this, arguments);
        try {
            if (disabled() || !resultHp) return;
            applyResultHp();
            log('quiz result: party keeps the HP it earned');
        } catch (e) { log('post-battle restore failed', e); }
    };

    // Remember which event ran the battle, so only that event's own aftermath
    // heal is treated as part of the battle.
    var _Game_Interpreter_command301 = Game_Interpreter.prototype.command301;
    Game_Interpreter.prototype.command301 = function () {
        var ok = _Game_Interpreter_command301.apply(this, arguments);
        try {
            // BattleManager.setup() puts the phase on 'start'. A no-op call (one
            // made while a battle is already running) leaves it alone.
            if (BattleManager._phase === 'start') quizBattleInterpreter = this;
        } catch (e) { log('battle interpreter capture failed', e); }
        return ok;
    };

    // The map event that started the battle continues straight into its
    // "If Win" / "If Lose" branch, and both of the tutorial's branches call
    // Recover All. That heal is the only recovery in the whole project, so it
    // cannot simply be blocked — but it must not hand back the damage the quiz
    // just cost either. The branch's heal is capped at "max HP minus this quiz's
    // mistakes"; any other heal is untouched.
    var _Game_Interpreter_command314 = Game_Interpreter.prototype.command314;
    Game_Interpreter.prototype.command314 = function () {
        var ok = _Game_Interpreter_command314.apply(this, arguments);
        try {
            if (disabled() || !resultHp) return ok;
            if (this !== quizBattleInterpreter) return ok;

            // Only the run that actually fought the battle can have its aftermath
            // heal capped. Once that event has finished, the snapshot is stale and
            // a later heal on this interpreter is a real heal.
            if (quizBattleInterpreter.isRunning && !quizBattleInterpreter.isRunning()) {
                clearResultHp();
                return ok;
            }

            // Only a party-wide Recover All is the authored post-battle heal.
            // A heal aimed at one actor is left completely alone.
            var params = this._params || [];
            var wholeParty = (params.length === 0) || (Number(params[1]) === 0);
            if (!wholeParty) return ok;

            applyResultHpAfterHeal();
            clearResultHp();
            log('post-battle Recover All: quiz damage kept');
        } catch (e) { log('recover guard failed', e); }
        return ok;
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

            if (a0 === 'quizdone') { onQuizDone(Number(args && args[1]), Number(args && args[2])); return; }
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
