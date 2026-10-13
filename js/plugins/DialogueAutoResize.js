/*:
 * @plugindesc [v1.0] Dynamically resizes the dialogue window to fit all text
 * lines, including word-wrapped lines. No other plugins required.
 * @author Harleythetech
 *
 * @param Max Rows
 * @text Max Rows
 * @type number
 * @min 4
 * @max 20
 * @default 10
 * @desc Maximum number of rows the dialogue window is allowed to grow to.
 *
 * @help
 * ============================================================================
 * DialogueAutoResize
 * ============================================================================
 * Automatically expands (or shrinks) the dialogue window so that all visible
 * text lines fit without being clipped.
 *
 * Word-wrapped lines are each counted individually, so a single long sentence
 * that wraps to 3 visual lines correctly reserves 3 rows instead of 1.
 *
 * The window will never shrink below 4 rows (RPG Maker MV's face portrait is
 * exactly 4 rows tall, so this also prevents faces from being cut off).
 * The window will never exceed Max Rows (default 10) to avoid going off-screen.
 *
 * No other plugins required. No plugin commands.
 * ============================================================================
 */

(function () {
    'use strict';

    var params   = PluginManager.parameters('DialogueAutoResize');
    var MAX_ROWS = Math.max(4, Number(params['Max Rows'] || 10));

    // Off-screen canvas reused for all measurements
    var _offCtx = document.createElement('canvas').getContext('2d');

    // -------------------------------------------------------------------------
    // Strip RPG Maker escape codes that don't add printed characters so that
    // text-width measurement is reasonably accurate.
    // -------------------------------------------------------------------------
    function stripEscapes(text) {
        return text
            .replace(/\\V\[\d+\]/gi,  '0')      // \V[n]  → single digit
            .replace(/\\N\[\d+\]/gi,  'Name')    // \N[n]  → actor name placeholder
            .replace(/\\P\[\d+\]/gi,  'Name')    // \P[n]  → party actor name
            .replace(/\\G/gi,         '$')       // \G     → currency symbol
            .replace(/\\C\[\d+\]/gi,  '')        // \C[n]  → colour (no width)
            .replace(/\\I\[\d+\]/gi,  '  ')      // \I[n]  → icon (~2 spaces wide)
            .replace(/\\\{/g,         '')        // \{     → font size up
            .replace(/\\}/g,          '')        // \}     → font size down
            .replace(/\\!/g,          '')        // \!     → wait for input
            .replace(/\\\./g,         '')        // \.     → wait 1/4 sec
            .replace(/\\\|/g,         '')        // \|     → wait 1 sec
            .replace(/\\>/g,          '')        // \>     → fast text on
            .replace(/\\</g,          '')        // \<     → fast text off
            .replace(/\\\^/g,         '')        // \^     → no-wait
            .replace(/\\\\/g,         '\\');     // \\     → literal backslash
    }

    // -------------------------------------------------------------------------
    // Count how many visual lines `text` needs when word-wrapped to maxWidth px.
    // Hard newlines (\n) are honoured as explicit line breaks.
    // -------------------------------------------------------------------------
    function countVisualLines(text, font, maxWidth) {
        _offCtx.font = font;
        var hardLines = text.split(/\n|\r\n|\r/);
        var total = 0;
        for (var h = 0; h < hardLines.length; h++) {
            var words     = stripEscapes(hardLines[h]).split(' ');
            var lineCount = 1;
            var cur       = '';
            for (var w = 0; w < words.length; w++) {
                var test = cur ? cur + ' ' + words[w] : words[w];
                if (_offCtx.measureText(test).width > maxWidth && cur !== '') {
                    lineCount++;
                    cur = words[w];
                } else {
                    cur = test;
                }
            }
            total += lineCount;
        }
        return Math.max(1, total);
    }

    // -------------------------------------------------------------------------
    // Calculate the number of rows needed for the pending message texts.
    // Falls back to 4 if anything goes wrong.
    // -------------------------------------------------------------------------
    function calcRequiredRows(win) {
        try {
            var texts = $gameMessage._texts;
            if (!texts || texts.length === 0) return 4;

            // Content width: full window width minus padding on both sides,
            // minus the face image column when a face is shown.
            var padding  = win.standardPadding ? win.standardPadding() : 18;
            var faceW    = ($gameMessage.faceName() !== '') ? (Window_Base._faceWidth || 144) + 24 : 0;
            var contentW = win.width - padding * 2 - faceW;
            if (contentW <= 0) contentW = win.width - padding * 2;

            // Font that the window will use
            var fontSize = (win.contents && win.contents.fontSize) ? win.contents.fontSize : 28;
            var fontFace = 'GameFont, Arial, sans-serif';
            var font     = fontSize + 'px ' + fontFace;

            var totalLines = 0;
            for (var i = 0; i < texts.length; i++) {
                totalLines += countVisualLines(texts[i], font, contentW);
            }

            // Never go below the number of raw text entries (minimum 1 row each)
            totalLines = Math.max(texts.length, totalLines);

            // Always show at least 4 rows — keeps the face portrait fully visible
            // (RPG Maker MV's face image is exactly 4 rows tall) and gives
            // short messages breathing room.
            totalLines = Math.max(4, totalLines);

            return Math.min(MAX_ROWS, totalLines);
        } catch (e) {
            return 4;
        }
    }

    // -------------------------------------------------------------------------
    // Override numVisibleRows — vanilla base always returns 4.
    // We store the computed value on the instance so windowHeight() picks it up
    // consistently during the startMessage resize cycle.
    // -------------------------------------------------------------------------
    var _orig_numVisibleRows = Window_Message.prototype.numVisibleRows;
    Window_Message.prototype.numVisibleRows = function () {
        if (this._dynamicRows !== undefined) return this._dynamicRows;
        return _orig_numVisibleRows.call(this);
    };

    // -------------------------------------------------------------------------
    // Override startMessage — this fires right before the window opens.
    // We measure the text, set _dynamicRows, then resize the window to match
    // the new height before the base method runs (which calls updatePlacement).
    // -------------------------------------------------------------------------
    var _orig_startMessage = Window_Message.prototype.startMessage;
    Window_Message.prototype.startMessage = function () {
        this._dynamicRows = calcRequiredRows(this);

        // Resize height and recreate the drawing surface to match
        var newHeight = this.fittingHeight(this._dynamicRows);
        if (this.height !== newHeight) {
            this.height = newHeight;
            this.createContents();
        }

        _orig_startMessage.call(this);
        this._dynamicRows = undefined;
    };

    // -------------------------------------------------------------------------
    // Override terminateMessage — reset height to the default 4-row size when
    // the dialogue closes so nothing lingers between messages.
    // -------------------------------------------------------------------------
    var _orig_terminateMessage = Window_Message.prototype.terminateMessage;
    Window_Message.prototype.terminateMessage = function () {
        _orig_terminateMessage.call(this);
        this._dynamicRows = undefined;
        var defaultHeight = this.fittingHeight(4);
        if (this.height !== defaultHeight) {
            this.height = defaultHeight;
            this.createContents();
        }
    };

})();
