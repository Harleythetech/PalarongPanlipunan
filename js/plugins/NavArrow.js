//=============================================================================
// NavArrow.js — Visual Navigation Arrow for RPG Maker MV
// Author  : Harleythetech
// Version : 1.1.0
//=============================================================================
/*:
 * @plugindesc v1.1 Displays a visual arrow on screen that points the player
 * toward a target map coordinate or event. Auto-hides on map transfer,
 * during cutscenes/messages, and during scene transitions.
 *
 * @author Harleythetech
 *
 * ─── APPEARANCE ──────────────────────────────────────────────────────────────
 * @param Arrow Color
 * @text Arrow Color
 * @type string
 * @desc CSS color string for the arrow fill. Supports hex, rgb(), etc.
 * @default #FFD700
 *
 * @param Arrow Size
 * @text Arrow Size
 * @type number
 * @min 16
 * @max 128
 * @desc Size of the arrow in pixels (tip to base).
 * @default 40
 *
 * @param Arrow Outline Color
 * @text Arrow Outline Color
 * @type string
 * @desc CSS color string for the arrow border / outline.
 * @default #000000
 *
 * @param Arrow Outline Width
 * @text Arrow Outline Width
 * @type number
 * @min 0
 * @max 10
 * @desc Thickness of the arrow outline in pixels. 0 to disable.
 * @default 3
 *
 * @param Arrow Opacity
 * @text Arrow Opacity
 * @type number
 * @min 0
 * @max 255
 * @desc Default opacity of the arrow (0–255).
 * @default 220
 *
 * @param Orbit Radius
 * @text Orbit Radius
 * @type number
 * @min 20
 * @max 300
 * @desc Distance (in pixels) from the player's screen center the arrow orbits.
 * @default 64
 *
 * @param Bounce Amount
 * @text Bounce Amount
 * @type number
 * @min 0
 * @max 30
 * @desc How many pixels the arrow bounces outward rhythmically. 0 to disable.
 * @default 8
 *
 * @param Bounce Speed
 * @text Bounce Speed
 * @type number
 * @min 1
 * @max 20
 * @desc Speed of the bounce animation (higher = faster).
 * @default 4
 *
 * @param Hide When Close
 * @text Hide When Close (tiles)
 * @type number
 * @min 0
 * @max 20
 * @desc Auto-hide the arrow when the player is this many tiles away from
 *       the target. Set to 0 to never auto-hide.
 * @default 2
 *
 * ─── HELP ─────────────────────────────────────────────────────────────────────
 * @help
 * ============================================================================
 * NavArrow — Visual Navigation Arrow  v1.1
 * ============================================================================
 * Draws an animated arrow that orbits the player and points toward a target.
 *
 * KEY BEHAVIOURS
 * • Arrow is RESET (hidden) automatically on every map transfer.
 *   It will not appear on a new map unless an event on that map explicitly
 *   calls a NavArrow show/event command.
 * • Arrow is HIDDEN automatically during cutscenes (any active event with
 *   messages, scene transfers, or screen fades) and reappears when the
 *   cutscene ends.
 * • Arrow is HIDDEN while any message window is open.
 *
 * ── PLUGIN COMMANDS ─────────────────────────────────────────────────────────
 *
 *   NavArrow show X Y
 *     Point the arrow toward tile coordinates (X, Y) on the current map.
 *     Example:  NavArrow show 15 8
 *
 *   NavArrow event EVENTID
 *     Point the arrow toward a specific event by its ID.
 *     Example:  NavArrow event 4
 *
 *   NavArrow hide
 *     Hide the navigation arrow.
 *
 *   NavArrow color COLOR
 *     Change the arrow fill color at runtime.
 *     Example:  NavArrow color #FF4444
 *
 *   NavArrow opacity VALUE
 *     Change arrow opacity at runtime (0–255).
 *     Example:  NavArrow opacity 128
 *
 * ============================================================================
 */

(function () {
    'use strict';

    //=========================================================================
    // Parameter parsing
    //=========================================================================
    var params      = PluginManager.parameters('NavArrow');
    var DEF_COLOR   = String(params['Arrow Color']         || '#FFD700');
    var DEF_SIZE    = Number(params['Arrow Size']          || 40);
    var DEF_OUTLINE = String(params['Arrow Outline Color'] || '#000000');
    var DEF_OW      = Number(params['Arrow Outline Width'] || 3);
    var DEF_OPACITY = Number(params['Arrow Opacity']       || 220);
    var DEF_ORBIT   = Number(params['Orbit Radius']        || 64);
    var DEF_BOUNCE  = Number(params['Bounce Amount']       || 8);
    var DEF_BSPEED  = Number(params['Bounce Speed']        || 4);
    var DEF_CLOSE   = Number(params['Hide When Close']     || 2);

    //=========================================================================
    // Runtime state  — reset on every map transfer
    //=========================================================================
    var _state = {
        active:  false,
        mode:    'coord',
        targetX: 0,
        targetY: 0,
        eventId: 0,
        color:   DEF_COLOR,
        opacity: DEF_OPACITY
    };

    /** Called whenever the player transfers to a new map. Clears the arrow. */
    function _resetState() {
        _state.active  = false;
        _state.mode    = 'coord';
        _state.targetX = 0;
        _state.targetY = 0;
        _state.eventId = 0;
        // colour and opacity intentionally kept so they don't need to be
        // re-specified every map if you want a consistent look.
    }

    //=========================================================================
    // Hook into map transfer — reset arrow on every new map
    //=========================================================================
    var _alias_Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function () {
        _alias_Scene_Map_onMapLoaded.call(this);
        _resetState();
    };

    //=========================================================================
    // Cutscene / busy detection helpers
    //=========================================================================
    /**
     * Returns true when the arrow should be suppressed regardless of _state.
     * Covers:
     *   - Any message window open ($gameMessage.isBusy)
     *   - Any interpreter that is NOT a Parallel/trigger-4 process running
     *     (i.e. a foreground cutscene event is active)
     *   - Screen is fading ($gameScreen is in a fade)
     */
    function _isCutscene() {
        // Message window open
        if ($gameMessage && $gameMessage.isBusy()) return true;

        // Foreground event interpreter is running (not auto-parallel)
        if ($gameMap && $gameMap._interpreter) {
            var interp = $gameMap._interpreter;
            if (interp.isRunning()) {
                // trigger 4 = parallel; we want to suppress for all others
                var ev = $gameMap.event(interp._eventId);
                if (ev) {
                    var page = ev.page();
                    if (page && page.trigger !== 4) return true;
                }
                // eventId 0 = common event or scene-level; suppress too
                if (interp._eventId === 0) return true;
            }
        }

        // Screen is mid-fade (e.g. transfer fadeout/in)
        if ($gameScreen && $gameScreen._brightness < 255 && $gameScreen._fadeOutDuration > 0) {
            return true;
        }

        return false;
    }

    //=========================================================================
    // Plugin Command handler
    //=========================================================================
    var _alias_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function (command, args) {
        _alias_pluginCommand.call(this, command, args);
        if (command.toLowerCase() !== 'navarrow') return;

        var sub = (args[0] || '').toLowerCase();

        switch (sub) {
            case 'show':
                _state.active  = true;
                _state.mode    = 'coord';
                _state.targetX = parseInt(args[1]) || 0;
                _state.targetY = parseInt(args[2]) || 0;
                break;

            case 'event':
                _state.active  = true;
                _state.mode    = 'event';
                _state.eventId = parseInt(args[1]) || 0;
                break;

            case 'hide':
                _state.active = false;
                break;

            case 'color':
                _state.color = args.slice(1).join(' ');
                break;

            case 'opacity':
                _state.opacity = Math.min(255, Math.max(0, parseInt(args[1]) || 255));
                break;
        }
    };

    //=========================================================================
    // Sprite_NavArrow
    //=========================================================================
    function Sprite_NavArrow() {
        this.initialize.apply(this, arguments);
    }

    Sprite_NavArrow.prototype = Object.create(Sprite.prototype);
    Sprite_NavArrow.prototype.constructor = Sprite_NavArrow;

    Sprite_NavArrow.prototype.initialize = function () {
        Sprite.prototype.initialize.call(this);
        this._size     = DEF_SIZE;
        this._bounceT  = 0;
        this._orbitR   = DEF_ORBIT;
        this._bAmount  = DEF_BOUNCE;
        this._bSpeed   = DEF_BSPEED;
        this._closeT   = DEF_CLOSE;
        this.anchor.x  = 0.5;
        this.anchor.y  = 1.0;
        this._buildBitmap();
    };

    Sprite_NavArrow.prototype._buildBitmap = function () {
        var s   = this._size;
        var ow  = DEF_OW;
        var pad = ow + 2;
        var bw  = (s * 0.7 + pad * 2) | 0;
        var bh  = (s       + pad * 2) | 0;

        this.bitmap  = new Bitmap(bw, bh);
        var ctx = this.bitmap._context;

        var cx   = bw / 2;
        var tip  = pad;
        var base = bh - pad;
        var hw   = bw / 2 - pad;

        ctx.beginPath();
        ctx.moveTo(cx,      tip);
        ctx.lineTo(cx + hw, base);
        ctx.lineTo(cx,      base - s * 0.3);
        ctx.lineTo(cx - hw, base);
        ctx.closePath();

        if (ow > 0) {
            ctx.strokeStyle = DEF_OUTLINE;
            ctx.lineWidth   = ow * 2;
            ctx.lineJoin    = 'round';
            ctx.stroke();
        }

        ctx.fillStyle = _state.color;
        ctx.fill();

        this.bitmap._setDirty();
    };

    Sprite_NavArrow.prototype._syncColor = function () {
        if (this._lastColor !== _state.color) {
            this._lastColor = _state.color;
            this._buildBitmap();
        }
    };

    Sprite_NavArrow.prototype._getTargetTile = function () {
        if (_state.mode === 'event') {
            var ev = $gameMap.event(_state.eventId);
            if (ev) return { x: ev.x, y: ev.y };
        }
        return { x: _state.targetX, y: _state.targetY };
    };

    Sprite_NavArrow.prototype.update = function () {
        Sprite.prototype.update.call(this);

        // Hide if not active OR if we're in a cutscene/message
        if (!_state.active || _isCutscene()) {
            this.visible = false;
            return;
        }

        this._syncColor();

        var target = this._getTargetTile();
        var px     = $gamePlayer.x;
        var py     = $gamePlayer.y;
        var dx     = target.x - px;
        var dy     = target.y - py;
        var dist   = Math.sqrt(dx * dx + dy * dy);

        // Auto-hide when close enough
        if (this._closeT > 0 && dist <= this._closeT) {
            this.visible = false;
            return;
        }

        var angle = Math.atan2(dy, dx) + Math.PI / 2;

        this._bounceT += this._bSpeed;
        var bounce = this._bAmount * Math.abs(Math.sin(this._bounceT * Math.PI / 180));
        var orbit  = this._orbitR + bounce;

        var th   = $gameMap.tileHeight();
        var mapX = $gamePlayer.screenX();
        var mapY = $gamePlayer.screenY() - th / 2;

        this.x        = mapX + orbit * Math.sin(angle);
        this.y        = mapY - orbit * Math.cos(angle);
        this.rotation = angle;
        this.opacity  = _state.opacity;
        this.visible  = true;
    };

    //=========================================================================
    // Spriteset_Map — inject arrow into HUD layer
    //=========================================================================
    var _alias_Spriteset_Map_createUpperLayer =
        Spriteset_Map.prototype.createUpperLayer;

    Spriteset_Map.prototype.createUpperLayer = function () {
        _alias_Spriteset_Map_createUpperLayer.call(this);
        this._navArrow = new Sprite_NavArrow();
        this.addChild(this._navArrow);
    };

})();
