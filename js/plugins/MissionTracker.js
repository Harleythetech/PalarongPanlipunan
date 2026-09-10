//=============================================================================
// MissionTracker.js — Compass HUD & Mission Objective Tracker
// Author  : Harleythetech
// Version : 1.0.0
//=============================================================================
/*:
 * @plugindesc v1.0 Displays a compass (N/NE/E/SE/S/SW/W/NW) at the top-center
 * of the screen and a mission objective panel on the left side, pointing the
 * player toward a target event and showing the distance in meters.
 *
 * @author Harleythetech
 *
 * ─── COMPASS APPEARANCE ──────────────────────────────────────────────────────
 * @param Compass Active Color
 * @text Active Direction Color
 * @type string
 * @desc CSS color for the highlighted (current) compass direction.
 * @default #FFD700
 *
 * @param Compass Inactive Color
 * @text Inactive Direction Color
 * @type string
 * @desc CSS color for non-active compass directions.
 * @default #AAAAAA
 *
 * @param Compass Font Size
 * @text Compass Font Size
 * @type number
 * @min 8
 * @max 32
 * @desc Font size (px) for compass direction labels.
 * @default 14
 *
 * @param Compass BG Color
 * @text Compass Background Color
 * @type string
 * @desc CSS color (with alpha) for the compass background pill.
 * @default rgba(0,0,0,0.55)
 *
 * @param Compass Y
 * @text Compass Y Position
 * @type number
 * @min 0
 * @max 400
 * @desc Y position (pixels from top) of the compass bar.
 * @default 8
 *
 * ─── MISSION PANEL APPEARANCE ───────────────────────────────────────────────
 * @param Panel BG Color
 * @text Panel Background Color
 * @type string
 * @desc CSS color (with alpha) for the mission panel background.
 * @default rgba(0,0,0,0.60)
 *
 * @param Panel Title Color
 * @text Panel Title Color
 * @type string
 * @desc CSS color for the "OBJECTIVE" label.
 * @default #FFD700
 *
 * @param Panel Text Color
 * @text Panel Objective Text Color
 * @type string
 * @desc CSS color for the objective text.
 * @default #FFFFFF
 *
 * @param Panel Distance Color
 * @text Panel Distance Color
 * @type string
 * @desc CSS color for the distance readout.
 * @default #AAFFAA
 *
 * @param Panel X
 * @text Panel X Position
 * @type number
 * @min 0
 * @max 600
 * @desc X position (pixels from left) of the mission panel.
 * @default 0
 *
 * @param Panel Y
 * @text Panel Y Position
 * @type number
 * @min 0
 * @max 500
 * @desc Y position (pixels from top) of the mission panel.
 * @default 210
 *
 * @param Panel Width
 * @text Panel Width
 * @type number
 * @min 100
 * @max 500
 * @desc Width (pixels) of the mission panel content area.
 * @default 380
 *
 * ─── DISTANCE SETTINGS ───────────────────────────────────────────────────────
 * @param Meters Per Tile
 * @text Meters Per Tile
 * @type number
 * @min 1
 * @max 100
 * @desc How many in-game meters one map tile represents.
 * @default 1
 *
 * ─── HELP ─────────────────────────────────────────────────────────────────────
 * @help
 * ============================================================================
 * MissionTracker — Compass HUD & Mission Objective Tracker  v1.0
 * ============================================================================
 *
 * Adds two persistent HUD elements to the map screen:
 *
 *   1. COMPASS BAR (top-center)
 *      Shows all 8 compass directions. The direction that best points toward
 *      the current mission target is highlighted in gold.
 *      When no mission is active the compass is still visible with no
 *      active highlight.
 *
 *   2. MISSION PANEL (left side)
 *      Shows the current objective text and the straight-line distance
 *      (in meters) to the target event.
 *      Hidden when no mission is active.
 *
 * ── PLUGIN COMMANDS ──────────────────────────────────────────────────────────
 *
 *   CM <eventId> <objectiveText>
 *     Set the current mission target to a specific event on the current map
 *     and display the provided objective text.
 *     The event ID and text are separated by a single space.
 *     Any spaces in the text are preserved.
 *
 *     Example:
 *       CM 7 Go to the Battle Field
 *       CM 3 Speak with the Village Elder
 *
 *   CM clear
 *     Clear the current mission (hides the panel, removes compass highlight).
 *
 * ── NOTES ─────────────────────────────────────────────────────────────────────
 *
 *   • Mission data is saved with the game and restored on load.
 *   • The HUD auto-hides when any message window is open.
 *   • If the target event does not exist on the current map the mission
 *     panel hides automatically (the compass stays visible, un-highlighted).
 *   • The compass is always visible on the map — even without an active
 *     mission — as a navigation aid.
 *
 * ============================================================================
 */

//=============================================================================
// Declare global before any hooks fire so DataManager can assign it safely.
//=============================================================================
var $gameMissionTracker = null;

(function () {
    'use strict';

    //=========================================================================
    // Parameter parsing
    //=========================================================================
    var _params = PluginManager.parameters('MissionTracker');

    var P = {
        compassActiveColor   : String(_params['Compass Active Color']   || '#FFD700'),
        compassInactiveColor : String(_params['Compass Inactive Color'] || '#AAAAAA'),
        compassFontSize      : Number(_params['Compass Font Size']      || 14),
        compassBgColor       : String(_params['Compass BG Color']       || 'rgba(0,0,0,0.55)'),
        compassY             : Number(_params['Compass Y']              || 8),

        panelBgColor         : String(_params['Panel BG Color']         || 'rgba(0,0,0,0.60)'),
        panelTitleColor      : String(_params['Panel Title Color']       || '#FFD700'),
        panelTextColor       : String(_params['Panel Text Color']        || '#FFFFFF'),
        panelDistanceColor   : String(_params['Panel Distance Color']    || '#AAFFAA'),
        panelX               : Number(_params['Panel X']                || 0),
        panelY               : Number(_params['Panel Y']                || 210),
        panelWidth           : Number(_params['Panel Width']            || 380),

        metersPerTile        : Number(_params['Meters Per Tile']        || 1)
    };

    // Compass direction labels in clockwise order starting from North.
    // Each entry: { label, angle (degrees, N=0, E=90) }
    var COMPASS_DIRS = [
        { label: 'N',  angle:   0 },
        { label: 'NE', angle:  45 },
        { label: 'E',  angle:  90 },
        { label: 'SE', angle: 135 },
        { label: 'S',  angle: 180 },
        { label: 'SW', angle: 225 },
        { label: 'W',  angle: 270 },
        { label: 'NW', angle: 315 }
    ];

    //=========================================================================
    // Game_MissionTracker — persistent state (saved with game)
    //=========================================================================
    function Game_MissionTracker() {
        this.initialize.apply(this, arguments);
    }

    Game_MissionTracker.prototype.initialize = function () {
        this._active        = false;
        this._eventId       = 0;
        this._objectiveText = '';
        this._prevDirection = 0;  // tracks last cardinal for diagonal detection
    };

    Game_MissionTracker.prototype.setMission = function (eventId, text) {
        this._active        = true;
        this._eventId       = eventId;
        this._objectiveText = text;
    };

    Game_MissionTracker.prototype.clearMission = function () {
        this._active        = false;
        this._eventId       = 0;
        this._objectiveText = '';
        this._prevDirection = 0;
    };

    Game_MissionTracker.prototype.isActive = function () {
        return this._active;
    };

    Game_MissionTracker.prototype.eventId = function () {
        return this._eventId;
    };

    Game_MissionTracker.prototype.objectiveText = function () {
        return this._objectiveText;
    };

    /**
     * Returns the target event on the current map, or null if not found.
     */
    Game_MissionTracker.prototype.targetEvent = function () {
        if (!this._active || !$gameMap) return null;
        return $gameMap.event(this._eventId) || null;
    };

    /**
     * Returns the straight-line distance in tiles from the player to the
     * target event, or -1 if no valid target.
     */
    Game_MissionTracker.prototype.distanceTiles = function () {
        var ev = this.targetEvent();
        if (!ev || !$gamePlayer) return -1;
        var dx = ev.x - $gamePlayer.x;
        var dy = ev.y - $gamePlayer.y;
        return Math.sqrt(dx * dx + dy * dy);
    };

    /**
     * Returns the bearing (degrees, N=0, clockwise) the player is currently
     * facing, derived from $gamePlayer.direction() and recent movement.
     *
     * RPG Maker MV directions:  2=S, 4=W, 6=E, 8=N
     * Diagonals are inferred by tracking the last two cardinal directions.
     * Returns null when the player hasn't moved yet.
     */
    Game_MissionTracker.prototype.directionAngle = function () {
        if (!$gamePlayer) return null;
        var d = $gamePlayer.direction();
        // Map the 4 cardinal RPG Maker directions to bearing degrees
        var cardinalMap = { 2: 180, 4: 270, 6: 90, 8: 0 };
        var deg = cardinalMap[d];
        if (deg === undefined) return null;

        // Blend with the previous cardinal for diagonal detection.
        // If the two most recent cardinals are perpendicular, we're diagonal.
        var prev = this._prevDirection;
        if (prev && prev !== d) {
            var prevDeg = cardinalMap[prev];
            if (prevDeg !== undefined) {
                // Only treat as diagonal when the two directions are 90° apart
                var diff = Math.abs(deg - prevDeg);
                if (diff === 90 || diff === 270) {
                    // Average the two angles (handle 270↔0 wrap correctly)
                    var a = deg;
                    var b = prevDeg;
                    if (Math.abs(a - b) > 180) {
                        if (a < b) a += 360; else b += 360;
                    }
                    deg = ((a + b) / 2) % 360;
                }
            }
        }
        this._prevDirection = d;
        return deg;
    };

    /**
     * Returns the index into COMPASS_DIRS of the direction the player is
     * currently facing, or -1 if no direction is known.
     */
    Game_MissionTracker.prototype.activeCompassIndex = function () {
        // Only highlight when a mission is active — otherwise all grey
        if (!this._active) return -1;
        var angle = this.directionAngle();
        if (angle === null) return -1;
        var best     = 0;
        var bestDiff = 999;
        for (var i = 0; i < COMPASS_DIRS.length; i++) {
            var d    = COMPASS_DIRS[i].angle;
            var diff = Math.abs(angle - d);
            if (diff > 180) diff = 360 - diff;
            if (diff < bestDiff) {
                bestDiff = diff;
                best     = i;
            }
        }
        return best;
    };

    //=========================================================================
    // Hook DataManager to create $gameMissionTracker and persist it
    //=========================================================================
    var _DataManager_createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function () {
        _DataManager_createGameObjects.call(this);
        $gameMissionTracker = new Game_MissionTracker();
    };

    var _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function () {
        var contents = _DataManager_makeSaveContents.call(this);
        contents.missionTracker = $gameMissionTracker;
        return contents;
    };

    var _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
        _DataManager_extractSaveContents.call(this, contents);
        if (contents.missionTracker) {
            $gameMissionTracker = contents.missionTracker;
            // Re-attach prototype in case it was stripped during JSON round-trip
            Object.setPrototypeOf(
                $gameMissionTracker,
                Game_MissionTracker.prototype
            );
            // Guard against saves that predate _prevDirection
            if (!$gameMissionTracker._prevDirection) {
                $gameMissionTracker._prevDirection = 0;
            }
        } else {
            $gameMissionTracker = new Game_MissionTracker();
        }
    };

    //=========================================================================
    // Plugin Command Handler
    //=========================================================================
    var _alias_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function (command, args) {
        _alias_pluginCommand.call(this, command, args);

        if (command.toUpperCase() !== 'CM') return;

        // 'CM clear' — remove mission
        if (args[0] && args[0].toLowerCase() === 'clear') {
            $gameMissionTracker.clearMission();
            return;
        }

        // 'CM <eventId> <objectiveText...>'
        var eventId = parseInt(args[0], 10);
        if (isNaN(eventId) || eventId <= 0) {
            console.warn('MissionTracker: invalid event ID "' + args[0] + '"');
            return;
        }

        // Objective text: everything after the first argument, joined back
        var text = args.slice(1).join(' ');
        if (!text) {
            console.warn('MissionTracker: no objective text provided');
            return;
        }

        $gameMissionTracker.setMission(eventId, text);

        // Refresh the HUD immediately if we're on the map
        if (SceneManager._scene instanceof Scene_Map) {
            SceneManager._scene.refreshMissionTrackerHUD();
        }
    };

    //=========================================================================
    // Utility: should we hide all HUD elements?
    //=========================================================================
    function _isHudSuppressed() {
        if (!$gameMessage) return false;
        return $gameMessage.isBusy();
    }

    //=========================================================================
    // Sprite_Compass — 8-direction compass bar drawn on a Bitmap
    //=========================================================================
    function Sprite_Compass() {
        this.initialize.apply(this, arguments);
    }

    Sprite_Compass.prototype = Object.create(Sprite.prototype);
    Sprite_Compass.prototype.constructor = Sprite_Compass;

    // Layout constants
    Sprite_Compass.ITEM_W    = 36;  // width per direction slot
    Sprite_Compass.PADDING_X = 10;  // horizontal padding inside background
    Sprite_Compass.PADDING_Y = 6;   // vertical padding inside background

    Sprite_Compass.prototype.initialize = function () {
        Sprite.prototype.initialize.call(this);

        this._lastActiveIndex = -2; // force first draw
        this._bitmapW = 0;
        this._bitmapH = 0;

        this._buildBitmap();
    };

    Sprite_Compass.prototype._calcDimensions = function () {
        var itemW   = Sprite_Compass.ITEM_W;
        var padX    = Sprite_Compass.PADDING_X;
        var padY    = Sprite_Compass.PADDING_Y;
        var fs      = P.compassFontSize;
        var itemH   = fs + 4;
        var totalW  = itemW * COMPASS_DIRS.length + padX * 2;
        var totalH  = itemH + padY * 2;
        return { totalW: totalW, totalH: totalH, itemW: itemW, itemH: itemH,
                 padX: padX, padY: padY, fs: fs };
    };

    Sprite_Compass.prototype._buildBitmap = function () {
        var d = this._calcDimensions();

        // Create or recreate bitmap if size changed
        if (this._bitmapW !== d.totalW || this._bitmapH !== d.totalH) {
            this._bitmapW = d.totalW;
            this._bitmapH = d.totalH;
            this.bitmap = new Bitmap(d.totalW, d.totalH);
        }

        var bmp = this.bitmap;
        var ctx = bmp._context;

        bmp.clear();

        // Background pill
        var radius = d.totalH / 2;
        ctx.save();
        ctx.fillStyle = P.compassBgColor;
        ctx.beginPath();
        ctx.moveTo(radius, 0);
        ctx.lineTo(d.totalW - radius, 0);
        ctx.arcTo(d.totalW, 0, d.totalW, radius, radius);
        ctx.lineTo(d.totalW, d.totalH - radius);
        ctx.arcTo(d.totalW, d.totalH, d.totalW - radius, d.totalH, radius);
        ctx.lineTo(radius, d.totalH);
        ctx.arcTo(0, d.totalH, 0, d.totalH - radius, radius);
        ctx.lineTo(0, radius);
        ctx.arcTo(0, 0, radius, 0, radius);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Direction labels
        var activeIdx = ($gameMissionTracker && $gameMissionTracker.isActive())
            ? $gameMissionTracker.activeCompassIndex()
            : -1;

        ctx.save();
        ctx.font = 'bold ' + d.fs + 'px GameFont, Arial, sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        for (var i = 0; i < COMPASS_DIRS.length; i++) {
            var cx = d.padX + i * d.itemW + d.itemW / 2;
            var cy = d.padY + d.itemH / 2;

            if (i === activeIdx) {
                // Active direction: dark circle background behind label
                ctx.fillStyle = '#000000';
                ctx.globalAlpha = 0.35;
                ctx.beginPath();
                ctx.arc(cx, cy, d.itemW * 0.42, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1.0;

                ctx.strokeStyle = P.compassActiveColor;
                ctx.lineWidth   = 1;
                ctx.beginPath();
                ctx.arc(cx, cy, d.itemW * 0.42, 0, Math.PI * 2);
                ctx.stroke();

                ctx.fillStyle   = P.compassActiveColor;
                ctx.shadowColor = P.compassActiveColor;
                ctx.shadowBlur  = 6;
            } else {
                ctx.fillStyle  = P.compassInactiveColor;
                ctx.shadowBlur = 0;
            }

            ctx.fillText(COMPASS_DIRS[i].label, cx, cy);
        }

        ctx.restore();
        bmp._setDirty();

        this._lastActiveIndex = activeIdx;
        // x/y are set every update() to keep centred regardless of resolution
        this._updatePosition();
    };

    Sprite_Compass.prototype._updatePosition = function () {
        var d = this._calcDimensions();
        // Graphics.boxWidth is the game's logical canvas width — always correct
        // whether running windowed or at any resolution/zoom.
        this.x = Math.floor((Graphics.boxWidth  - d.totalW) / 2);
        this.y = P.compassY;
    };

    Sprite_Compass.prototype.update = function () {
        Sprite.prototype.update.call(this);

        if (_isHudSuppressed()) {
            this.visible = false;
            return;
        }
        this.visible = true;

        // Recentre every frame (safe against any resolution changes)
        this._updatePosition();

        // Always call activeCompassIndex so _prevDirection is kept current
        // even when no mission is active (direction history stays warm).
        var currentActive = -1;
        if ($gameMissionTracker) {
            // directionAngle() has the side-effect of updating _prevDirection,
            // so call it unconditionally every frame.
            $gameMissionTracker.directionAngle();
            if ($gameMissionTracker.isActive()) {
                currentActive = $gameMissionTracker.activeCompassIndex();
            }
        }

        if (currentActive !== this._lastActiveIndex) {
            this._buildBitmap();
        }
    };

    //=========================================================================
    // Sprite_MissionPanel — left-side mission objective HUD
    // Uses a plain Sprite + Bitmap (no Window_Base) so it sits at exactly
    // P.panelX, P.panelY with zero internal margin.
    //=========================================================================
    function Sprite_MissionPanel() {
        this.initialize.apply(this, arguments);
    }

    Sprite_MissionPanel.prototype = Object.create(Sprite.prototype);
    Sprite_MissionPanel.prototype.constructor = Sprite_MissionPanel;

    // ── Scale helper ─────────────────────────────────────────────────────────
    Sprite_MissionPanel._scale = function () {
        var base    = Window_Base.prototype.standardFontSize
            ? Window_Base.prototype.standardFontSize()
            : 28;
        var bodyFs  = Math.max(14, Math.round(base * 0.65));
        var titleFs = Math.max(11, Math.round(base * 0.50));
        var distFs  = Math.max(13, Math.round(base * 0.60));
        var pad     = 8;
        return {
            titleFs  : titleFs,
            bodyFs   : bodyFs,
            distFs   : distFs,
            titleH   : titleFs + 8,
            lineH    : bodyFs  + 8,
            distH    : distFs  + 6,
            pad      : pad,
            radius   : 6,
            maxLines : 3
        };
    };

    Sprite_MissionPanel._calcHeight = function () {
        var s = Sprite_MissionPanel._scale();
        return s.pad * 2 + s.titleH + s.lineH * s.maxLines + s.distH + 4;
    };

    Sprite_MissionPanel.prototype.initialize = function () {
        Sprite.prototype.initialize.call(this);
        this._lastObjective = '';
        this._lastDistance  = -2;
        this.visible        = false;
        // Bitmap created lazily on first refresh
        this._panelW = 0;
        this._panelH = 0;
    };

    // ── Word-wrap ─────────────────────────────────────────────────────────────
    Sprite_MissionPanel.prototype._wrapText = function (text, ctx, maxW, fs) {
        var s     = Sprite_MissionPanel._scale();
        var words = text.split(' ');
        var lines = [];
        var cur   = '';
        ctx.save();
        ctx.font = 'normal ' + fs + 'px GameFont, Arial, sans-serif';
        for (var i = 0; i < words.length; i++) {
            var test = cur ? (cur + ' ' + words[i]) : words[i];
            if (ctx.measureText(test).width <= maxW) {
                cur = test;
            } else {
                if (cur) lines.push(cur);
                cur = words[i];
                if (lines.length >= s.maxLines) break;
            }
        }
        if (cur && lines.length < s.maxLines) lines.push(cur);
        ctx.restore();
        return lines.slice(0, s.maxLines);
    };

    // ── Draw ──────────────────────────────────────────────────────────────────
    Sprite_MissionPanel.prototype._rebuild = function (obj, meters) {
        var s = Sprite_MissionPanel._scale();
        var w = P.panelWidth;

        // ── Measure lines first so we can size the bitmap exactly ────────────
        // We need a canvas context to measure text — create a temporary one if
        // the bitmap doesn't exist yet, otherwise reuse the existing context.
        var tempBmp = this.bitmap || new Bitmap(w, 1);
        var maxW    = w - s.pad * 2;
        var lines   = this._wrapText(obj, tempBmp._context, maxW, s.bodyFs);
        var numLines = lines.length || 1;

        // Height = top pad + title + separator gap + body lines + dist + bottom pad
        var h = s.pad + s.titleH + 2 + numLines * s.lineH + s.distH + s.pad;

        // Re-create bitmap only if size changed
        if (this._panelW !== w || this._panelH !== h) {
            this._panelW = w;
            this._panelH = h;
            this.bitmap  = new Bitmap(w, h);
        }

        var bmp = this.bitmap;
        var ctx = bmp._context;
        bmp.clear();

        // Background rounded rect
        var r = s.radius;
        ctx.save();
        ctx.fillStyle = P.panelBgColor;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(w - r, 0);  ctx.arcTo(w, 0, w, r, r);
        ctx.lineTo(w, h - r);  ctx.arcTo(w, h, w - r, h, r);
        ctx.lineTo(r, h);      ctx.arcTo(0, h, 0, h - r, r);
        ctx.lineTo(0, r);      ctx.arcTo(0, 0, r, 0, r);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Gold separator line
        ctx.save();
        ctx.strokeStyle = P.panelTitleColor;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(s.pad, s.titleH + s.pad - 2);
        ctx.lineTo(w - s.pad, s.titleH + s.pad - 2);
        ctx.stroke();
        ctx.restore();

        // Helper to draw text with outline using raw canvas
        var drawLabel = function (text, x, y, fs, color, bold) {
            ctx.save();
            ctx.font         = (bold ? 'bold ' : 'normal ') + fs + 'px GameFont, Arial, sans-serif';
            ctx.textBaseline = 'top';
            ctx.strokeStyle  = 'rgba(0,0,0,0.85)';
            ctx.lineWidth    = Math.max(2, Math.round(fs * 0.22));
            ctx.lineJoin     = 'round';
            ctx.strokeText(text, x, y);
            ctx.fillStyle    = color;
            ctx.fillText(text, x, y);
            ctx.restore();
        };

        // "OBJECTIVE" title
        drawLabel('OBJECTIVE', s.pad, s.pad, s.titleFs, P.panelTitleColor, true);

        // Objective body text — word-wrapped (already computed above)
        for (var i = 0; i < lines.length; i++) {
            var yLine = s.pad + s.titleH + 2 + i * s.lineH;
            drawLabel(lines[i], s.pad, yLine, s.bodyFs, P.panelTextColor, false);
        }

        // Distance readout
        var yDist   = s.pad + s.titleH + 2 + lines.length * s.lineH + 2;
        var distStr = meters + ' m away';
        drawLabel(distStr, s.pad, yDist, s.distFs, P.panelDistanceColor, false);

        bmp._setDirty();

        // Position exactly at P.panelX, P.panelY — no auto-adjustment.
        this.x = P.panelX;
        this.y = P.panelY;
    };

    // ── Update ────────────────────────────────────────────────────────────────
    Sprite_MissionPanel.prototype.update = function () {
        Sprite.prototype.update.call(this);

        if (_isHudSuppressed() || !$gameMissionTracker) {
            this.visible = false;
            return;
        }

        var active = $gameMissionTracker.isActive()
            && $gameMissionTracker.targetEvent() !== null;

        if (!active) {
            this.visible = false;
            return;
        }

        this.visible = true;

        var dist    = $gameMissionTracker.distanceTiles();
        var meters  = Math.round(dist * P.metersPerTile);
        var obj     = $gameMissionTracker.objectiveText();

        if (obj !== this._lastObjective || meters !== this._lastDistance) {
            this._lastObjective = obj;
            this._lastDistance  = meters;
            this._rebuild(obj, meters);
        }
    };

    //=========================================================================
    // Scene_Map — inject HUD elements
    //=========================================================================

    /**
     * Create the compass sprite as a direct child of Scene_Map, NOT inside
     * Spriteset_Map. Spriteset_Map has a scroll/origin transform that would
     * offset the compass position. Scene_Map children always render in pure
     * screen-space, so centering with Graphics.boxWidth is always accurate.
     */
    var _alias_Scene_Map_createDisplayObjects = Scene_Map.prototype.createDisplayObjects;
    Scene_Map.prototype.createDisplayObjects = function () {
        _alias_Scene_Map_createDisplayObjects.call(this);
        // Both HUD sprites added here so they are direct Scene_Map children
        // with no parent transform — screen-space positioning is exact.
        this._compassSprite = new Sprite_Compass();
        this.addChild(this._compassSprite);
        this._missionPanel = new Sprite_MissionPanel();
        this.addChild(this._missionPanel);
    };

    /**
     * createAllWindows still aliased so the refresh helper can be called
     * from plugin commands that fire while already on the map.
     */
    var _alias_Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function () {
        _alias_Scene_Map_createAllWindows.call(this);
    };

    /**
     * Public refresh helper — forces a redraw on the next update cycle.
     */
    Scene_Map.prototype.refreshMissionTrackerHUD = function () {
        if (this._missionPanel) {
            this._missionPanel._lastObjective = '';
            this._missionPanel._lastDistance  = -2;
        }
    };

    /**
     * Reset mission if the target event does not exist on the new map.
     * (The compass stays visible; only the panel hides.)
     */
    var _alias_Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function () {
        _alias_Scene_Map_onMapLoaded.call(this);
        if ($gameMissionTracker && $gameMissionTracker.isActive()) {
            // If the event doesn't exist here, don't auto-clear — the event
            // may be on another map.  The panel simply won't show.
            // This keeps the mission state across map transfers.
        }
    };

})();
