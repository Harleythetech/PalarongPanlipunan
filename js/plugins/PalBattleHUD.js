//=============================================================================
// PalBattleHUD.js
//=============================================================================
/*:
 * @plugindesc [v3.2.0] Custom battle HUD for Palarong Panlipunan.
 * Glass-card style matching MapStatusWindow_Reworked.
 *
 *   TOP-CENTER  — Scoreboard pill:  "Enemy: 0 | 0 :Party Name"
 *   LEFT PANEL  — Enemy HP bars (all troop members, 2-line name wrapping)
 *   RIGHT PANEL — Player HP bars (all battle members, 2-line name wrapping)
 *
 * @author Harleythetech
 *
 * @param partyLabel
 * @text Party Label
 * @type string
 * @default Harley's Party
 * @desc Party name shown on the right of the scoreboard pill.
 *
 * @param enemyLabel
 * @text Enemy Label
 * @type string
 * @default Enemy
 * @desc Label on the left of the scoreboard pill.
 *
 * @param scoreVariableId
 * @text Score Variable ID
 * @type variable
 * @default 1
 * @desc Game variable for the player score (right side of scoreboard).
 *
 * @param enemyScoreVariableId
 * @text Enemy Score Variable ID
 * @type variable
 * @default 2
 * @desc Game variable for the enemy score (left side of scoreboard).
 *
 * @param panelWidth
 * @text HP Panel Width (px)
 * @type number
 * @min 160
 * @max 600
 * @default 300
 * @desc Width of both HP panels.
 *
 * @param panelMargin
 * @text Panel Margin from edge (px)
 * @type number
 * @min 0
 * @max 40
 * @default 8
 * @desc Gap between each panel and the screen edge.
 *
 * @param panelY
 * @text HP Panel Y Position (px)
 * @type number
 * @min 0
 * @max 400
 * @default 8
 * @desc Y position of the left and right HP panels.
 *
 * @param scorebarY
 * @text Scoreboard Y Position (px)
 * @type number
 * @min 0
 * @max 200
 * @default 8
 * @desc Y position of the top-center scoreboard pill.
 *
 * @help
 * ============================================================================
 * Plugin Commands
 * ============================================================================
 *   PalBattleHUD show
 *   PalBattleHUD hide
 *   PalBattleHUD score set VALUE        — set player score variable
 *   PalBattleHUD score add VALUE        — add to player score variable
 *   PalBattleHUD enemyscore set VALUE   — set enemy score variable
 *   PalBattleHUD enemyscore add VALUE   — add to enemy score variable
 *
 * NOTE: The score defaults to whatever is in the chosen game variable.
 * If the score shows a wrong value at the start of a battle, reset the
 * variable to 0 in your "New Game" / battle-start common event.
 * ============================================================================
 */

(function () {
    'use strict';

    var PLUGIN_NAME = 'PalBattleHUD';
    var params      = PluginManager.parameters(PLUGIN_NAME);

    var CFG = {
        partyLabel:      String(params['partyLabel']           || "Harley's Party"),
        enemyLabel:      String(params['enemyLabel']           || 'Enemy'),
        scoreVarId:      Number(params['scoreVariableId']      || 1),
        enemyScoreVarId: Number(params['enemyScoreVariableId'] || 2),
        panelWidth:      Number(params['panelWidth']           || 300),
        panelMargin:     Number(params['panelMargin']          || 8),
        panelY:          Number(params['panelY']               || 8),
        scorebarY:       Number(params['scorebarY']            || 8),
    };

    // -------------------------------------------------------------------------
    // Resolve theme colours from a temporary Window_Base instance at boot.
    // This pulls the exact same colours MapStatusWindow_Reworked uses.
    // -------------------------------------------------------------------------
    var _COLORS_RESOLVED = false;
    var C = {
        // fallbacks — replaced once Window_Base is available
        hp1:     '#6fde6f',
        hp2:     '#46c046',
        crisis:  '#ffcc00',
        death:   '#808080',
        normal:  '#ffffff',
        system:  '#c0d0ff',
        outline: 'rgba(0,0,0,0.9)',
    };

    function _resolveColors() {
        if (_COLORS_RESOLVED) return;
        try {
            var tmp = new Window_Base(0, 0, 1, 1);
            C.hp1    = tmp.textColor(20);
            C.hp2    = tmp.textColor(21);
            C.crisis = tmp.textColor(17);
            C.death  = tmp.textColor(18);
            C.normal = tmp.textColor(0);
            C.system = tmp.textColor(16);
            tmp.hide();
            _COLORS_RESOLVED = true;
        } catch (e) { /* keep fallbacks */ }
    }

    // Glass-card constants matching MapStatusWindow_Reworked exactly
    var G = {
        cardBg:       'rgba(10, 14, 22, 0.65)',
        cardBorder:   'rgba(255, 255, 255, 0.12)',
        cardRadius:   10,
        gaugeBg:      'rgba(0, 0, 0, 0.65)',
        pillBg:       'rgba(10, 14, 22, 0.72)',
        pad:          8,
        innerPad:     8,
        outlineColor: 'rgba(0,0,0,0.9)',
        outlineW:     3,
    };

    var _base = 28;
    var FS = {
        title:  Math.max(11, Math.round(_base * 0.46)),  // 13 px — "ENEMIES/PARTY"
        name:   Math.max(12, Math.round(_base * 0.53)),  // 15 px — member name
        hp:     Math.max(11, Math.round(_base * 0.46)),  // 13 px — hp numbers
        score:  Math.max(16, Math.round(_base * 0.75)),  // 21 px — scorebar
    };
    var FONT = 'GameFont, Arial, sans-serif';

    // -------------------------------------------------------------------------
    // Draw helpers
    // -------------------------------------------------------------------------

    function _ctx(bmp) { return bmp._context; }

    function drawRoundedRect(ctx, x, y, w, h, r, fillColor, strokeColor, strokeW) {
        r = Math.min(r, w / 2, h / 2);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);     ctx.arcTo(x + w, y,     x + w, y + r,     r);
        ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);     ctx.arcTo(x,     y + h, x,     y + h - r, r);
        ctx.lineTo(x, y + r);         ctx.arcTo(x,     y,     x + r, y,          r);
        ctx.closePath();
        if (fillColor)   { ctx.fillStyle   = fillColor;           ctx.fill();   }
        if (strokeColor) { ctx.strokeStyle = strokeColor;
                           ctx.lineWidth   = strokeW || 1;         ctx.stroke(); }
        ctx.restore();
    }

    /** Outlined text — same as MissionTracker's drawLabel */
    function drawText(ctx, text, x, y, fs, color, bold) {
        ctx.save();
        ctx.font         = (bold ? 'bold ' : '') + fs + 'px ' + FONT;
        ctx.textBaseline = 'top';
        ctx.lineJoin     = 'round';
        ctx.strokeStyle  = G.outlineColor;
        ctx.lineWidth    = G.outlineW;
        ctx.strokeText(text, x, y);
        ctx.fillStyle    = color;
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    /** Measure text width with a given font size */
    function measureW(text, fs, bold) {
        var offCtx = document.createElement('canvas').getContext('2d');
        offCtx.font = (bold ? 'bold ' : '') + fs + 'px ' + FONT;
        return offCtx.measureText(text).width;
    }

    /**
     * Word-wrap text into at most maxLines lines fitting within maxW pixels.
     * Returns array of strings.
     */
    function wrapText(text, fs, maxW, maxLines) {
        var words  = text.split(' ');
        var lines  = [];
        var cur    = '';
        var offCtx = document.createElement('canvas').getContext('2d');
        offCtx.font = fs + 'px ' + FONT;
        for (var i = 0; i < words.length; i++) {
            var test = cur ? cur + ' ' + words[i] : words[i];
            if (offCtx.measureText(test).width <= maxW) {
                cur = test;
            } else {
                if (cur) lines.push(cur);
                cur = words[i];
                if (lines.length >= maxLines) break;
            }
        }
        if (cur && lines.length < maxLines) lines.push(cur);
        return lines.slice(0, maxLines);
    }

    /**
     * HP gauge bar — MapStatusWindow_Reworked style:
     *   black bg rect, then gradient fill, same as drawCustomHudBar.
     */
    function drawHpGauge(ctx, x, y, w, h, ratio, col1, col2) {
        // Track
        ctx.save();
        ctx.fillStyle = G.gaugeBg;
        ctx.fillRect(x, y, w, h);

        // Fill gradient
        var fw = Math.max(0, Math.floor((w - 2) * Math.min(1, ratio)));
        if (fw > 0) {
            var grad = ctx.createLinearGradient(x + 1, y, x + 1 + fw, y);
            grad.addColorStop(0, col1);
            grad.addColorStop(1, col2);
            ctx.fillStyle = grad;
            ctx.fillRect(x + 1, y + 1, fw, h - 2);
        }
        ctx.restore();
    }

    function hpBarColors(ratio, dead) {
        if (dead)         return [C.death,  C.death];
        if (ratio > 0.5)  return [C.hp1,    C.hp2];
        if (ratio > 0.25) return [C.crisis, C.crisis];
        return ['#cc2222', '#991111'];
    }

    function hpTextColor(ratio, dead) {
        if (dead)         return C.death;
        if (ratio > 0.5)  return C.normal;
        if (ratio > 0.25) return C.crisis;
        return '#ff6666';
    }

    // =========================================================================
    // Sprite_PalHPPanel — left (enemy) and right (player)
    // =========================================================================
    function Sprite_PalHPPanel(side) {
        this._side = side;
        Sprite.prototype.initialize.call(this);
        this._lastSnap = null;
        this.visible   = true;
    }
    Sprite_PalHPPanel.prototype = Object.create(Sprite.prototype);
    Sprite_PalHPPanel.prototype.constructor = Sprite_PalHPPanel;

    Sprite_PalHPPanel.prototype._members = function () {
        if (this._side === 'enemy') {
            return ($gameTroop && $gameTroop.members) ? $gameTroop.members() : [];
        }
        return ($gameParty && $gameParty.battleMembers) ? $gameParty.battleMembers() : [];
    };

    Sprite_PalHPPanel.prototype._snap = function (members) {
        return members.map(function (m) {
            return m.name() + ':' + m.hp + ':' + m.mhp + ':' + (m.isDead() ? 1 : 0);
        }).join('|');
    };

    Sprite_PalHPPanel.prototype._rebuild = function (members) {
        _resolveColors();

        var ip      = G.innerPad;          // inner padding
        var titleH  = FS.title + ip;       // title row height
        var nameFs  = FS.name;
        var hpFs    = FS.hp;
        var barH    = 14;                  // same as MapStatusWindow_Reworked gauge height
        var lineH   = nameFs + 4;          // single text line height
        var w       = CFG.panelWidth;
        var contentW = w - ip * 2;

        // Name column: ~45% of content width
        var nameColW = Math.floor(contentW * 0.44);
        var barX     = ip + nameColW + ip;
        var barW     = contentW - nameColW - ip - 52;  // leave 52px for hp text
        var numX     = barX + barW + 4;
        var numW     = w - numX - ip;

        // Pre-compute wrapped names to know row heights
        var rows = members.map(function (m) {
            var lines = wrapText(m.name(), nameFs, nameColW, 2);
            if (!lines.length) lines = [''];
            var textH  = lines.length * lineH;
            var rowH   = Math.max(textH, barH + ip) + ip;
            return { member: m, lines: lines, rowH: rowH, textH: textH };
        });

        // Total height
        var bodyH = 0;
        for (var ri = 0; ri < rows.length; ri++) bodyH += rows[ri].rowH;
        var h = ip + titleH + 4 + bodyH + ip;

        this.bitmap = new Bitmap(w, h);
        var bmp     = this.bitmap;
        var ctx     = _ctx(bmp);

        // Glass card background + border
        drawRoundedRect(ctx, 0, 0, w, h, G.cardRadius,
            G.cardBg, G.cardBorder, 1);

        // Title row: "ENEMIES" / "PARTY" — gold, bold
        var titleLabel = (this._side === 'enemy') ? 'ENEMIES' : 'PARTY';
        drawText(ctx, titleLabel, ip, ip, FS.title, '#FFD700', true);

        // Gold separator (same as MissionTracker)
        var sepY = ip + titleH;
        ctx.save();
        ctx.strokeStyle = '#FFD700';
        ctx.globalAlpha = 0.4;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(ip, sepY);
        ctx.lineTo(w - ip, sepY);
        ctx.stroke();
        ctx.restore();

        // Rows
        var curY = sepY + 4;

        for (var i = 0; i < rows.length; i++) {
            var r      = rows[i];
            var m      = r.member;
            var dead   = m.isDead();
            var ratio  = m.mhp > 0 ? m.hp / m.mhp : 0;
            var cols   = hpBarColors(ratio, dead);
            var rowH   = r.rowH;

            // Name lines — white, vertically centred in the row
            // For 1 line: text sits at same Y as bar centre minus half lineH
            // For 2 lines: block of 2 lines centred around bar centre
            var textBlockH  = r.lines.length * lineH;
            var rowCenter   = curY + Math.floor((rowH - ip) / 2);
            var textStartY  = rowCenter - Math.floor(textBlockH / 2);

            for (var li = 0; li < r.lines.length; li++) {
                drawText(ctx, r.lines[li],
                    ip, textStartY + li * lineH,
                    nameFs, '#ffffff', false);
            }

            // Gauge + HP text — vertically centered on the same row centre
            var barCenterY = rowCenter - Math.floor(barH / 2);

            if (!dead) {
                drawHpGauge(ctx, barX, barCenterY, barW, barH, ratio, cols[0], cols[1]);
                // HP text centred on same line as bar
                var hpStr = m.hp + '/' + m.mhp;
                drawText(ctx, hpStr, numX, barCenterY, hpFs,
                    hpTextColor(ratio, false), false);
            } else {
                drawText(ctx, 'KO', barX, barCenterY, hpFs, C.death, false);
            }

            curY += rowH;
        }

        bmp._setDirty();

        // Position with margin
        this.y = CFG.panelY;
        this.x = (this._side === 'enemy')
            ? CFG.panelMargin
            : Graphics.boxWidth - CFG.panelWidth - CFG.panelMargin;
    };

    Sprite_PalHPPanel.prototype.update = function () {
        Sprite.prototype.update.call(this);
        var members = this._members();
        var snap    = this._snap(members);
        if (snap !== this._lastSnap) {
            this._lastSnap = snap;
            this._rebuild(members);
        }
        // Keep pinned to right edge (adaptive resolution)
        if (this._side === 'player') {
            this.x = Graphics.boxWidth - CFG.panelWidth - CFG.panelMargin;
        }
    };

    // =========================================================================
    // Sprite_PalScorebar — top-center pill
    // "Enemy: <eScore>  |  <pScore> :Party Name"
    // =========================================================================
    function Sprite_PalScorebar() {
        Sprite.prototype.initialize.call(this);
        this._lastSnap = null;
        this.visible   = true;
    }
    Sprite_PalScorebar.prototype = Object.create(Sprite.prototype);
    Sprite_PalScorebar.prototype.constructor = Sprite_PalScorebar;

    Sprite_PalScorebar.prototype._snap = function () {
        var es = $gameVariables ? $gameVariables.value(CFG.enemyScoreVarId) : 0;
        var ps = $gameVariables ? $gameVariables.value(CFG.scoreVarId)      : 0;
        return es + '|' + ps;
    };

    Sprite_PalScorebar.prototype._rebuild = function () {
        _resolveColors();

        var eScore = $gameVariables ? $gameVariables.value(CFG.enemyScoreVarId) : 0;
        var pScore = $gameVariables ? $gameVariables.value(CFG.scoreVarId)      : 0;
        var fs     = FS.score;
        var padH   = G.innerPad;
        var padV   = Math.floor(G.innerPad * 0.75);

        // Pill parts — labels white, scores coloured
        var parts = [
            { text: CFG.enemyLabel + ': ', color: '#ffffff'  },
            { text: String(eScore),         color: '#ff6666' },
            { text: '  |  ',               color: '#888888' },
            { text: String(pScore),         color: C.hp1     },
            { text: '  :' + CFG.partyLabel, color: '#ffffff'  },
        ];

        // Measure using off-screen canvas
        var offCtx = document.createElement('canvas').getContext('2d');
        offCtx.font = 'bold ' + fs + 'px ' + FONT;
        var totalW = 0;
        for (var i = 0; i < parts.length; i++) {
            totalW += offCtx.measureText(parts[i].text).width;
        }

        var w = Math.ceil(totalW + padH * 2);
        var h = fs + padV * 2;

        this.bitmap = new Bitmap(w, h);
        var bmp     = this.bitmap;
        var ctx     = _ctx(bmp);

        // Pill background — same glass-card style
        var r = h / 2;
        ctx.save();
        ctx.fillStyle = G.pillBg;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(w - r, 0);     ctx.arcTo(w, 0, w, r, r);
        ctx.lineTo(w, h - r);     ctx.arcTo(w, h, w - r, h, r);
        ctx.lineTo(r, h);         ctx.arcTo(0, h, 0, h - r, r);
        ctx.lineTo(0, r);         ctx.arcTo(0, 0, r, 0, r);
        ctx.closePath();
        ctx.fill();
        // Border
        ctx.strokeStyle = G.cardBorder;
        ctx.lineWidth   = 1;
        ctx.stroke();
        ctx.restore();

        // Text parts
        var cx = padH;
        var ty = padV;
        ctx.save();
        ctx.font         = 'bold ' + fs + 'px ' + FONT;
        ctx.textBaseline = 'top';

        for (var j = 0; j < parts.length; j++) {
            ctx.lineJoin    = 'round';
            ctx.strokeStyle = G.outlineColor;
            ctx.lineWidth   = G.outlineW;
            ctx.strokeText(parts[j].text, cx, ty);
            ctx.fillStyle   = parts[j].color;
            ctx.fillText(parts[j].text, cx, ty);
            cx += offCtx.measureText(parts[j].text).width;
        }
        ctx.restore();

        bmp._setDirty();

        this.x = Math.floor((Graphics.boxWidth - w) / 2);
        this.y = CFG.scorebarY;
    };

    Sprite_PalScorebar.prototype.update = function () {
        Sprite.prototype.update.call(this);
        var snap = this._snap();
        if (snap !== this._lastSnap) {
            this._lastSnap = snap;
            this._rebuild();
        }
        // Always recentre (adaptive resolution)
        if (this.bitmap) {
            this.x = Math.floor((Graphics.boxWidth - this.bitmap.width) / 2);
        }
    };

    // =========================================================================
    // Scene_Battle — inject HUD sprites, suppress default windows
    // =========================================================================

    var _Scene_Battle_createAllWindows = Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function () {
        _Scene_Battle_createAllWindows.call(this);
        this._suppressDefaultBattleUI();
        // Add AFTER window layer so they render on top of everything
        this._palEnemyPanel  = new Sprite_PalHPPanel('enemy');
        this._palPlayerPanel = new Sprite_PalHPPanel('player');
        this._palScorebar    = new Sprite_PalScorebar();
        this.addChild(this._palEnemyPanel);
        this.addChild(this._palPlayerPanel);
        this.addChild(this._palScorebar);
    };

    // Reset both score variables to 0 at the start of every battle.
    // This is the only place the plugin writes to these variables.
    var _Scene_Battle_start = Scene_Battle.prototype.start;
    Scene_Battle.prototype.start = function () {
        _Scene_Battle_start.call(this);
        if ($gameVariables) {
            $gameVariables.setValue(CFG.scoreVarId,      0);
            $gameVariables.setValue(CFG.enemyScoreVarId, 0);
        }
    };
    Scene_Battle.prototype._suppressDefaultBattleUI = function () {
        var hide = function (win) {
            if (!win) return;
            win.opacity         = 0;
            win.contentsOpacity = 0;
            win.visible         = false;
        };
        hide(this._statusWindow);
        hide(this._partyCommandWindow);
        hide(this._actorCommandWindow);
        if (this._logWindow) {
            this._logWindow.opacity         = 0;
            this._logWindow.contentsOpacity = 0;
            if (this._logWindow._backSprite) {
                this._logWindow._backSprite.visible = false;
            }
        }
    };

    // Re-enforce each frame
    var _Scene_Battle_updateStatusWindow = Scene_Battle.prototype.updateStatusWindow;
    Scene_Battle.prototype.updateStatusWindow = function () {
        _Scene_Battle_updateStatusWindow.call(this);
        if (this._statusWindow) {
            this._statusWindow.visible         = false;
            this._statusWindow.contentsOpacity = 0;
        }
    };

    var _Scene_Battle_startPartyCommandSelection = Scene_Battle.prototype.startPartyCommandSelection;
    Scene_Battle.prototype.startPartyCommandSelection = function () {
        _Scene_Battle_startPartyCommandSelection.call(this);
        if (this._partyCommandWindow) {
            this._partyCommandWindow.opacity         = 0;
            this._partyCommandWindow.contentsOpacity = 0;
            this._partyCommandWindow.visible         = false;
        }
    };

    var _Scene_Battle_startActorCommandSelection = Scene_Battle.prototype.startActorCommandSelection;
    Scene_Battle.prototype.startActorCommandSelection = function () {
        _Scene_Battle_startActorCommandSelection.call(this);
        if (this._actorCommandWindow) {
            this._actorCommandWindow.opacity         = 0;
            this._actorCommandWindow.contentsOpacity = 0;
            this._actorCommandWindow.visible         = false;
        }
    };

    // =========================================================================
    // Plugin Commands
    // =========================================================================
    var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function (command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);
        if (command !== 'PalBattleHUD') return;

        var sub   = (args[0] || '').toLowerCase();
        var scene = SceneManager._scene;

        if (sub === 'show') {
            if (scene._palEnemyPanel)  scene._palEnemyPanel.visible  = true;
            if (scene._palPlayerPanel) scene._palPlayerPanel.visible = true;
            if (scene._palScorebar)    scene._palScorebar.visible    = true;
        } else if (sub === 'hide') {
            if (scene._palEnemyPanel)  scene._palEnemyPanel.visible  = false;
            if (scene._palPlayerPanel) scene._palPlayerPanel.visible = false;
            if (scene._palScorebar)    scene._palScorebar.visible    = false;
        } else if (sub === 'score') {
            var val = Number(args[2]) || 0;
            var op  = (args[1] || '').toLowerCase();
            if (op === 'set') {
                $gameVariables.setValue(CFG.scoreVarId, val);
            } else if (op === 'add') {
                $gameVariables.setValue(CFG.scoreVarId,
                    $gameVariables.value(CFG.scoreVarId) + val);
            }
        } else if (sub === 'enemyscore') {
            var val2 = Number(args[2]) || 0;
            var op2  = (args[1] || '').toLowerCase();
            if (op2 === 'set') {
                $gameVariables.setValue(CFG.enemyScoreVarId, val2);
            } else if (op2 === 'add') {
                $gameVariables.setValue(CFG.enemyScoreVarId,
                    $gameVariables.value(CFG.enemyScoreVarId) + val2);
            }
        }
    };

})();
