/*:
 * @plugindesc [v1.0.0] Scales up the game UI (font, windows, padding) on mobile
 * devices so text is comfortably readable on small screens.
 * Place this plugin BELOW YEP_CoreEngine in the plugin list.
 * @author Harleythetech
 *
 * @param scale
 * @text Mobile UI Scale
 * @type number
 * @decimals 2
 * @min 1.00
 * @max 2.50
 * @default 1.40
 * @desc Multiplier applied to font size, line height, and padding on
 * touch/mobile devices. 1.0 = no change. 1.4 = 40% larger.
 *
 * @param minFontSize
 * @text Minimum Font Size
 * @type number
 * @min 16
 * @max 64
 * @default 32
 * @desc Scaled font size will never go below this value (safety floor).
 *
 * @param maxFontSize
 * @text Maximum Font Size
 * @type number
 * @min 24
 * @max 80
 * @default 52
 * @desc Scaled font size will never go above this value (safety ceiling).
 *
 * @param Debug Logging
 * @text Debug Logging
 * @type boolean
 * @on  Enable
 * @off Disable
 * @default false
 * @desc Log mobile detection and applied scale values to the console.
 *       Requires RPGReloaded Master Debug to also be ON.
 *
 * @help
 * ===========================================================================
 *  MobileUIScale
 * ===========================================================================
 *
 *  Automatically enlarges RPG Maker MV's window UI when running on a mobile
 *  or touch device.  Font size, line height, window padding, and text padding
 *  are all multiplied by the configured scale factor.
 *
 *  Place this plugin BELOW YEP_CoreEngine so it overrides YEP's values.
 *
 *  No plugin commands needed — it activates automatically on touch devices.
 *
 * ===========================================================================
 */

(() => {
    'use strict';

    const PLUGIN_NAME = 'MobileUIScale';
    const p = PluginManager.parameters(PLUGIN_NAME);
    const SCALE      = Number(p['scale'])       || 1.40;
    const MIN_FONT   = Number(p['minFontSize']) || 32;
    const MAX_FONT   = Number(p['maxFontSize']) || 52;

    // Expose the active factor so custom canvas-based HUDs can use the same
    // scaling as RPG Maker windows without duplicating device detection.
    window.MobileUIScale = window.MobileUIScale || {};
    window.MobileUIScale.scale = 1;

    // ── Device detection (mirrors KK_VirtualGamepad's logic) ──────────────────
    function isMobile() {
        var ua = navigator.userAgent || '';
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua)) return true;
        if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
        if (navigator.maxTouchPoints > 1) return true;
        if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
        return false;
    }

    // Don't touch anything on desktop
    if (!isMobile()) return;

    window.MobileUIScale.scale = SCALE;

    // ── Core scaling helpers ───────────────────────────────────────────────────
    // We patch Window_Base methods.  YEP_CoreEngine also patches these, so we
    // wrap the already-patched version to multiply its return value.

    var _standardFontSize = Window_Base.prototype.standardFontSize;
    Window_Base.prototype.standardFontSize = function () {
        var base = _standardFontSize.call(this);
        return Math.round(Math.min(MAX_FONT, Math.max(MIN_FONT, base * SCALE)));
    };

    var _lineHeight = Window_Base.prototype.lineHeight;
    Window_Base.prototype.lineHeight = function () {
        var base = _lineHeight.call(this);
        return Math.round(base * SCALE);
    };

    var _standardPadding = Window_Base.prototype.standardPadding;
    Window_Base.prototype.standardPadding = function () {
        var base = _standardPadding.call(this);
        return Math.round(base * SCALE);
    };

    var _textPadding = Window_Base.prototype.textPadding;
    Window_Base.prototype.textPadding = function () {
        var base = _textPadding.call(this);
        return Math.round(base * SCALE);
    };

    // ── Icon scaling ───────────────────────────────────────────────────────────
    // Icons are fixed at 32×32 by default.  Scale them so they don't look tiny
    // next to the larger text.

    var _iconWidth = Window_Base.prototype.iconWidth ||
        function () { return Window_Base._iconWidth  || 32; };
    var _iconHeight = Window_Base.prototype.iconHeight ||
        function () { return Window_Base._iconHeight || 32; };

    Window_Base.prototype.iconWidth  = function () {
        return Math.round(_iconWidth.call(this)  * SCALE);
    };
    Window_Base.prototype.iconHeight = function () {
        return Math.round(_iconHeight.call(this) * SCALE);
    };

    // drawIcon uses Window_Base._iconWidth / _iconHeight directly in MV core —
    // patch drawIcon to respect the new scaled values.
    var _drawIcon = Window_Base.prototype.drawIcon;
    Window_Base.prototype.drawIcon = function (iconIndex, x, y) {
        var iw = this.iconWidth  ? this.iconWidth()  : 32;
        var ih = this.iconHeight ? this.iconHeight() : 32;
        var bitmap = ImageManager.loadSystem('IconSet');
        var pw = Window_Base._iconWidth  || 32;
        var ph = Window_Base._iconHeight || 32;
        var sx = iconIndex % 16 * pw;
        var sy = Math.floor(iconIndex / 16) * ph;
        this.contents.blt(bitmap, sx, sy, pw, ph, x, y, iw, ih);
    };

    // ── Face image scaling ─────────────────────────────────────────────────────
    // Face images in message windows also look small — scale the draw size.
    var _faceWidth = Window_Base.prototype.faceWidth ||
        function () { return Window_Message._faceWidth || 144; };
    var _faceHeight = Window_Base.prototype.faceHeight ||
        function () { return Window_Message._faceHeight || 144; };

    // We scale the drawn face proportionally but keep the slot size so layout
    // doesn't break.  The face is drawn centered in its slot.
    var _drawActorFace = Window_Base.prototype.drawActorFace;
    Window_Base.prototype.drawActorFace = function (actor, x, y, width, height) {
        width  = width  || this.faceWidth  && this.faceWidth()  || 144;
        height = height || this.faceHeight && this.faceHeight() || 144;
        _drawActorFace.call(this, actor, x, y, width, height);
    };

    // ── Word wrap — self-contained implementation ──────────────────────────────
    //
    // Vanilla RPG Maker MV has no word wrap. Long lines just overflow.
    // We implement it by hooking Window_Message.startMessage to pre-process
    // the queued text and insert \n line breaks before words that would
    // overflow the window's content width at the current font size.

    var _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function () {
        _Scene_Boot_start.call(this);

        // ── windowHeight: always recompute from scaled metrics ─────────────────
        Window_Message.prototype.windowHeight = function () {
            var rows = this.numVisibleRows();
            return rows * this.lineHeight() + 2 * this.standardPadding();
        };

        // ── Pre-wrap text before the message window renders it ─────────────────
        var _startMessage = Window_Message.prototype.startMessage;
        Window_Message.prototype.startMessage = function () {
            _wrapMessageTexts(this);
            _startMessage.call(this);
        };
    };

    // Measure pixel width of a plain string at a given font size.
    // Uses an off-screen canvas — created once and reused.
    var _measureCanvas = document.createElement('canvas');
    var _measureCtx    = _measureCanvas.getContext('2d');

    function _measureText(text, fontSize, fontFace) {
        _measureCtx.font = fontSize + 'px ' + (fontFace || 'GameFont, sans-serif');
        return _measureCtx.measureText(text).width;
    }

    // Strip escape codes (e.g. \c[n], \i[n], \n[n]) from a string so they
    // don't skew the width measurement.
    function _stripEscapes(text) {
        return text.replace(/\\[A-Za-z]+\[\d+\]/g, '')
                   .replace(/\\[A-Za-z]/g, '');
    }

    // Insert word-wrap line breaks into a single message text string.
    function _wrapLine(text, maxWidth, fontSize, fontFace) {
        // Split on existing newlines first, wrap each segment independently.
        var segments = text.split('\n');
        var result   = [];

        for (var s = 0; s < segments.length; s++) {
            var words = segments[s].split(' ');
            var line  = '';

            for (var w = 0; w < words.length; w++) {
                var word    = words[w];
                var test    = line ? line + ' ' + word : word;
                var testW   = _measureText(_stripEscapes(test), fontSize, fontFace);

                if (testW > maxWidth && line !== '') {
                    result.push(line);
                    line = word;
                } else {
                    line = test;
                }
            }
            if (line) result.push(line);
        }

        return result.join('\n');
    }

    // Walk through $gameMessage._texts and wrap each entry.
    function _wrapMessageTexts(win) {
        if (!$gameMessage) return;
        var texts = $gameMessage._texts;
        if (!texts || !texts.length) return;

        var fontSize  = win.standardFontSize ? win.standardFontSize() : 28;
        var fontFace  = 'GameFont, sans-serif';
        var padX      = win.standardPadding  ? win.standardPadding()  : 18;
        var textPadX  = win.textPadding      ? win.textPadding()      : 6;

        // Account for face portrait column if one is shown
        var faceW     = ($gameMessage.faceName() !== '')
            ? (Window_Base._faceWidth || 144) + textPadX * 2
            : 0;

        var maxWidth  = win.contentsWidth
            ? win.contentsWidth() - faceW
            : win.width - padX * 2 - faceW;

        for (var i = 0; i < texts.length; i++) {
            texts[i] = _wrapLine(texts[i], maxWidth, fontSize, fontFace);
        }
    }

    // ── Message row count ──────────────────────────────────────────────────────
    // numVisibleRows is 4 by default. On mobile each row is ~40% taller after
    // scaling so reduce to 3 to keep the window from taking up too much screen.
    var _numVisibleRows = Window_Message.prototype.numVisibleRows;
    Window_Message.prototype.numVisibleRows = function () {
        return 3;
    };

})();
