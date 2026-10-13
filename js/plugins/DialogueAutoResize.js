/*:
 * @plugindesc [v2.0] Adds true word-wrap to dialogue and auto-resizes the
 * window to fit all lines. Combines all editor lines into flowing paragraphs.
 * @author Harleythetech
 *
 * @param Max Rows
 * @text Max Rows
 * @type number
 * @min 3
 * @max 20
 * @default 10
 * @desc Maximum number of rows the dialogue window is allowed to grow to.
 *
 * @help
 * ============================================================================
 * DialogueAutoResize  v2.0
 * ============================================================================
 * RPG Maker MV has no built-in word-wrap. This plugin adds it by rewriting
 * the text string right before the engine renders it.
 *
 * HOW IT WORKS
 * - All \n line breaks in the current page are removed and the text is
 *   treated as one continuous paragraph.
 * - The paragraph is then re-broken at word boundaries to fit the window
 *   content width, inserting \n at the correct positions.
 * - The window height is then set to exactly fit the resulting line count.
 *
 * This means you don't need to manually break lines in the editor at all.
 * Just write naturally and the plugin handles the layout.
 *
 * Page breaks (\f) are preserved — each Show Text "page" is still separate.
 *
 * MINIMUM HEIGHT: 3 rows (matches RPG Maker MV face portrait height).
 * MAXIMUM HEIGHT: Max Rows parameter (default 10).
 * ============================================================================
 */

(function () {
    'use strict';

    var params   = PluginManager.parameters('DialogueAutoResize');
    var MAX_ROWS = Math.max(3, Number(params['Max Rows'] || 10));

    // -------------------------------------------------------------------------
    // Word-wrap a pre-converted text string (escape codes already replaced with
    // \x1b sequences) to fit within maxWidth pixels, using the window's own
    // contents bitmap for accurate measurement.
    //
    // Strategy: split on existing \n to get hard lines, then within each hard
    // line split on spaces and greedily pack words until measureTextWidth says
    // the line would overflow, inserting \n at that point.
    //
    // Escape sequences (\x1b...) are skipped during measurement since they
    // produce no visible glyphs.
    // -------------------------------------------------------------------------
    function wordWrap(text, win, maxWidth) {
        // Split pages on \f — process each page independently
        var pages = text.split('\f');
        for (var p = 0; p < pages.length; p++) {
            pages[p] = wordWrapPage(pages[p], win, maxWidth);
        }
        return pages.join('\f');
    }

    function wordWrapPage(pageText, win, maxWidth) {
        // Join all hard-broken lines into one paragraph first, then re-wrap.
        // This ensures text written with manual breaks in the old 3-row style
        // flows naturally in the resized window.
        var combined = pageText.split('\n').join(' ');

        // Split into tokens: either an escape sequence or a regular word chunk.
        // We keep escape sequences as atomic tokens so we don't break inside one.
        var tokenRe = /(\x1b[^\x1b\n]*?(?:[A-Z\$\.\|\^!><\{\}\\]|\[\d+\]))|(\S+)/gi;
        var spaceRe = /\s+/;

        // Rebuild as individual words (spaces are separators, not tokens)
        // We need to split on spaces but preserve escape sequences intact.
        var words = [];
        var plain = combined;

        // Simpler: split on whitespace, keeping escape sequences attached to
        // their preceding/following word is fine since they have zero width.
        words = combined.split(/\s+/).filter(function (w) { return w.length > 0; });

        if (words.length === 0) return pageText;

        var lines   = [];
        var curLine = '';

        for (var i = 0; i < words.length; i++) {
            var word     = words[i];
            var testLine = curLine === '' ? word : curLine + ' ' + word;

            // Measure visible width (strip escape sequences for measurement)
            var visibleTest = stripEscapesForMeasure(testLine);
            var testWidth   = win.contents.measureTextWidth(visibleTest);

            if (testWidth > maxWidth && curLine !== '') {
                // Current line is full — push it and start a new one
                lines.push(curLine);
                curLine = word;
            } else {
                curLine = testLine;
            }
        }
        if (curLine !== '') lines.push(curLine);

        return lines.join('\n');
    }

    // Strip \x1b escape sequences for width measurement only.
    // These are already-converted codes (\x1bC[n], \x1bI[n], etc.)
    function stripEscapesForMeasure(text) {
        return text
            .replace(/\x1b[A-Z]\[\d+\]/gi, '')   // \x1bC[n], \x1bI[n], etc.
            .replace(/\x1b[\$\.\|\^!><\{\}\\]/g, '') // single-char codes
            .replace(/\x1b./g, '');               // anything else
    }

    // -------------------------------------------------------------------------
    // Count lines in a page string (number of \n + 1).
    // -------------------------------------------------------------------------
    function countLines(pageText) {
        return pageText.split('\n').length;
    }

    // -------------------------------------------------------------------------
    // numVisibleRows — returns _dynamicRows while a message is active.
    // -------------------------------------------------------------------------
    Window_Message.prototype.numVisibleRows = function () {
        return (this._dynamicRows !== undefined) ? this._dynamicRows : 3;
    };

    // -------------------------------------------------------------------------
    // Patch startMessage.
    //
    // Execution order:
    //   1. Call _orig_startMessage — this sets _textState.text from allText()
    //      and calls newPage(). At this point the text is unconverted (still
    //      has \\ escapes). We need it post-convertEscapeCharacters.
    //
    // Actually: startMessage does:
    //   _textState.text = this.convertEscapeCharacters($gameMessage.allText())
    // So _textState.text is the converted string. We intercept AFTER that by
    // overriding the whole function and re-doing what the original does, giving
    // us access to _textState.text before newPage() runs.
    // -------------------------------------------------------------------------
    var _orig_startMessage = Window_Message.prototype.startMessage;

    Window_Message.prototype.startMessage = function () {
        // Step 1: let the full original chain run first.
        // This includes PalDialogueDim and any other startMessage patches,
        // plus the real engine logic: sets _textState.text, calls newPage,
        // updatePlacement, updateBackground, and opens the window.
        _orig_startMessage.call(this);

        // Step 2: _textState.text is now the converted string — word-wrap it.
        if (this._textState) {
            var padding  = this.standardPadding ? this.standardPadding() : 18;
            var faceW    = $gameMessage.faceName() !== '' ? (Window_Base._faceWidth || 144) + 24 : 0;
            var contentW = this.width - padding * 2 - faceW;
            if (contentW <= 0) contentW = this.width - padding * 2;

            this._textState.text = wordWrap(this._textState.text, this, contentW);

            // Step 3: count lines in the first page, resize window to fit.
            var firstPage     = this._textState.text.split('\f')[0];
            var lines         = countLines(firstPage);
            this._dynamicRows = Math.min(MAX_ROWS, Math.max(3, lines));
            var newHeight     = this.fittingHeight(this._dynamicRows);

            if (this.height !== newHeight) {
                this.height = newHeight;
                this.createContents();
                // Re-run newPage so the canvas resets to the new height
                this._textState.index = 0;
                this.newPage(this._textState);
                // Re-apply placement after resize
                this.updatePlacement();
                // Re-apply the background that the full chain already set
                // (don't call updateBackground() — it re-reads $gameMessage
                // which returns the raw event value before DialogueDim fixes it)
                this.setBackgroundType(this._background);
            }
        }
    };

    // -------------------------------------------------------------------------
    // terminateMessage — reset to 3-row default on close.
    // -------------------------------------------------------------------------
    var _orig_terminateMessage = Window_Message.prototype.terminateMessage;
    Window_Message.prototype.terminateMessage = function () {
        _orig_terminateMessage.call(this);
        this._dynamicRows = undefined;
        this.height = this.fittingHeight(3);
        this.createContents();
    };

})();
