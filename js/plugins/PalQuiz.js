//=============================================================================
// PalQuiz.js
//=============================================================================
/*:
 * @plugindesc [v1.0.0] In-memory question and answer shuffler for quiz battles.
 *
 * Never writes data/Troops.json. The permutation is applied to the runtime copy
 * of the troop page at BattleManager.setup, validated, and silently abandoned
 * when any structural check fails.
 *
 * @author Harleythetech
 *
 * @param enabledSwitchId
 * @default 30
 *
 * @param shuffleQuestions
 * @default true
 *
 * @param shuffleAnswers
 * @default true
 *
 * @param neutralizeOrdinals
 * @default true
 *
 * @param softenGameOver
 * @default true
 *
 * @param Debug Logging
 * @default false
 *
 * @help
 * ============================================================================
 * PalQuiz — question shuffling without touching the project data
 * ============================================================================
 *
 * HOW A BATTLE EVENT IS STRUCTURED
 *
 *   Each question is a block chained by labels:
 *
 *     Label Q1
 *       Show Text  (question)
 *       Show Choices [a, b, c, Hint]
 *         When 0 / 1 / 2  -> feedback ... Jump to Label Q2
 *         When 3 (Hint)   -> Arkin hint ... Jump to Label Q1
 *     Label Q2
 *       ...
 *
 *   The last block's answer branches fall through to the end instead of
 *   jumping, and its Hint branch jumps back to itself.
 *
 * WHAT THIS PLUGIN DOES
 *
 *   1. Splits the list into question blocks at indent-0 labels.
 *   2. Validates the chain (one Show Choices, one End Choices, branch count
 *      matches choice count, every Jump to Label targets this block or the
 *      next one). Anything unexpected -> the original list is used.
 *   3. Permutes the block bodies and rewrites every label and jump so the
 *      chain is still Q1 -> Q2 -> ... -> Qn -> end.
 *   4. Shuffles the answer options (the Hint option always stays last) and
 *      moves each branch body together with its own choice text, so a correct
 *      answer can never be paired with the wrong branch.
 *   5. Removes the "Ikalawang katanungan." style filler lines and the
 *      "// Question 3" editor comments, which would otherwise be wrong.
 *   6. Appends "PalSupport quizdone <n>" so PalSupport can score the round.
 *
 *   The permutation is re-drawn from a pristine copy on every battle, so a
 *   retry never repeats the same order. Nothing is persisted.
 *
 * KILL SWITCH
 *   Switch 30 (QuizShuffle_Disabled) ON turns the shuffler off.
 */
var PalQuizCore = (function () {
    'use strict';

    // Filler lines that only make sense in the original order. These appear
    // both bare ("Huling tanong.") and prefixed with a speaker ("Fanatio:" ...").
    var ORDINAL_RE = [
        /^(ikalawang|ikatlong|ika-apat|ikalima|ika-anim|ika-pito)(\s+na)?\s+katanungan\.?$/i,
        /^huling\s+tanong\.?$/i,
        /^(para\s+(naman\s+)?sa\s+)?(pangalawa|pangatlo|pang-apat|panglima|pang-anim)ng?\s+tanong\.?$/i,
        /^(second|third|fourth|fifth|sixth|seventh|last)\s+(question|katanungan)\.?$/i
    ];
    var SPEAKER_RE = /^[^:\n]{1,24}:\s*["'\u201c\u201d]?\s*/;
    var COMMENT_RE = /^\/\/\s*(first|second|third|fourth|fifth|sixth|seventh|last|question|unang|ikalawa|ikatlo)/i;

    function clone(cmd) {
        return {
            code: cmd.code,
            indent: cmd.indent,
            parameters: JSON.parse(JSON.stringify(cmd.parameters || []))
        };
    }

    function isOrdinal(str) {
        if (typeof str !== 'string') return false;
        var s = str.trim().replace(SPEAKER_RE, '').replace(/^["'\u201c\u201d\s]+|["'\u201c\u201d\s]+$/g, '');
        for (var i = 0; i < ORDINAL_RE.length; i++) {
            if (ORDINAL_RE[i].test(s)) return true;
        }
        return false;
    }

    function isJump(cmd)   { return cmd.code === 119; }
    function isLabel(cmd)  { return cmd.code === 118 && cmd.indent === 0; }
    function isShowChoices(cmd) { return cmd.code === 102 && cmd.indent === 0; }
    function isWhen(cmd)   { return cmd.code === 402 && cmd.indent === 0; }
    function isEndChoices(cmd)  { return cmd.code === 404 && cmd.indent === 0; }
    function isShowText(cmd){ return cmd.code === 101; }
    function isTextLine(cmd){ return cmd.code === 401; }
    function isComment(cmd){ return cmd.code === 108 && cmd.indent === 0; }

    // -------------------------------------------------------------------------
    // Split the event list into prefix / question blocks / suffix
    // -------------------------------------------------------------------------
    function splitBlocks(list) {
        var labels = [];
        for (var i = 0; i < list.length; i++) {
            if (isLabel(list[i])) labels.push({ index: i, name: list[i].parameters[0] });
        }
        if (!labels.length) return null;

        // The engine's terminating "0" command (if handled as a command) and any
        // trailing indentation-0 zeroes belong to the suffix, not to a block.
        var tailEnd = list.length;
        while (tailEnd > labels[labels.length - 1].index + 1 &&
               list[tailEnd - 1].code === 0 && list[tailEnd - 1].indent === 0) {
            tailEnd--;
        }

        var prefix = list.slice(0, labels[0].index).map(clone);
        var blocks = [];
        for (var k = 0; k < labels.length; k++) {
            var start = labels[k].index;
            var end = (k + 1 < labels.length) ? labels[k + 1].index : tailEnd;
            blocks.push({
                label: labels[k].name,
                cmds: list.slice(start, end).map(clone)
            });
        }
        return {
            prefix: prefix,
            blocks: blocks,
            suffix: list.slice(tailEnd).map(clone)
        };
    }

    // -------------------------------------------------------------------------
    // Split one block into head (up to and including Show Choices) and branches
    // -------------------------------------------------------------------------
    function splitBranches(cmds) {
        var i102 = -1;
        for (var i = 0; i < cmds.length; i++) {
            if (isShowChoices(cmds[i])) { i102 = i; break; }
        }
        if (i102 < 0) return null;

        var head = cmds.slice(0, i102 + 1);
        var branches = [];
        var cur = null;

        for (var j = i102 + 1; j < cmds.length; j++) {
            var c = cmds[j];
            if (isWhen(c)) {
                cur = { sel: c.parameters[0], cmds: [c] };
                branches.push(cur);
            } else if (isEndChoices(c)) {
                return { head: head, branches: branches, tail: cmds.slice(j) };
            } else if (cur) {
                cur.cmds.push(c);
            }
        }
        return null; // no End Choices found
    }

    // -------------------------------------------------------------------------
    // Structural validation
    // -------------------------------------------------------------------------
    function validateBlocks(blocks) {
        if (!blocks || !blocks.length) return false;
        for (var k = 0; k < blocks.length; k++) {
            var b = blocks[k];
            if (!/^Q\d+$/.test(b.label)) return false;
            if (!splitBranches(b.cmds)) return false;

            var n102 = 0, n404 = 0, n402 = 0;
            var nextLabel = (k + 1 < blocks.length) ? blocks[k + 1].label : null;

            for (var i = 0; i < b.cmds.length; i++) {
                var c = b.cmds[i];
                if (isShowChoices(c)) n102++;
                if (isEndChoices(c)) n404++;
                if (isWhen(c)) n402++;
                if (isJump(c)) {
                    var t = c.parameters[0];
                    if (t !== b.label && t !== nextLabel) return false;
                }
            }
            if (n102 !== 1 || n404 !== 1) return false;

            var choices = null;
            for (var x = 0; x < b.cmds.length; x++) {
                if (isShowChoices(b.cmds[x])) { choices = b.cmds[x].parameters[0]; break; }
            }
            if (!choices || n402 !== choices.length) return false;
        }
        return true;
    }

    // -------------------------------------------------------------------------
    // Fisher-Yates
    // -------------------------------------------------------------------------
    function shuffled(arr, rng) {
        var out = arr.slice();
        for (var i = out.length - 1; i > 0; i--) {
            var j = Math.floor(rng() * (i + 1));
            var t = out[i]; out[i] = out[j]; out[j] = t;
        }
        return out;
    }

    // -------------------------------------------------------------------------
    // Remove filler text and stale editor comments
    // -------------------------------------------------------------------------
    function stripOrdinals(cmds) {
        var out = [];
        for (var i = 0; i < cmds.length; i++) {
            var c = cmds[i];

            if (isComment(c) && COMMENT_RE.test(String(c.parameters[0] || ''))) continue;

            // A Show Text whose every line is an ordinal filler gets removed whole.
            if (isShowText(c)) {
                var j = i + 1, lines = [];
                while (j < cmds.length && isTextLine(cmds[j])) { lines.push(String(cmds[j].parameters[0] || '')); j++; }
                if (lines.length && lines.every(isOrdinal)) { i = j - 1; continue; }
            }
            out.push(c);
        }
        return out;
    }

    // -------------------------------------------------------------------------
    // Rewrite one block for a new position
    // -------------------------------------------------------------------------
    function rebuildBlock(block, oldIndex, newIndex, total, opts, rng) {
        var oldSelf = block.label;
        var oldAdvance = (oldIndex + 1 < total) ? ('Q' + (oldIndex + 2)) : null;

        var newSelf = 'Q' + (newIndex + 1);
        var newAdvance = (newIndex + 1 < total) ? ('Q' + (newIndex + 2)) : null;

        var parts = splitBranches(block.cmds);
        if (!parts) return null;

        var head = parts.head.map(clone);
        var tail = parts.tail.map(clone);

        // The block's own label has to move with it, otherwise the chain is
        // labelled Q1,Q3,Q2 while the jumps point at the new positions.
        if (!head.length || !isLabel(head[0])) return null;
        head[0].parameters = [newSelf];

        var branches = parts.branches.map(function (br) {
            var cmds = br.cmds.map(clone);
            var hasJump = false;
            var kept = [];

            for (var i = 0; i < cmds.length; i++) {
                var c = cmds[i];
                if (isJump(c)) {
                    var t = c.parameters[0];
                    if (t === oldSelf) {
                        c.parameters[0] = newSelf;
                        kept.push(c);
                        hasJump = true;
                    } else if (t === oldAdvance) {
                        if (newAdvance) {
                            c.parameters[0] = newAdvance;
                            kept.push(c);
                            hasJump = true;
                        }
                        // otherwise drop the jump: this block is now last and
                        // must fall through to the end of the event.
                    } else {
                        // Unknown target: refuse the whole permutation.
                        return null;
                    }
                } else {
                    kept.push(c);
                }
            }

            // The original last block had no advance jump. If it moved earlier,
            // every branch needs one or the event would end early.
            if (!hasJump && newAdvance) {
                // Insert before the branch terminator: the last indent-1 zero.
                var at = -1;
                for (var m = 0; m < kept.length; m++) {
                    if (kept[m].code === 0 && kept[m].indent === 1) at = m;
                }
                if (at < 0) {
                    kept.push({ code: 119, indent: 1, parameters: [newAdvance] });
                } else {
                    kept.splice(at, 0, { code: 119, indent: 1, parameters: [newAdvance] });
                }
            }

            return { sel: br.sel, cmds: kept };
        });

        for (var b = 0; b < branches.length; b++) {
            if (!branches[b]) return null;
        }

        // ---- answer-option shuffle -------------------------------------------
        var choicesCmd = null;
        for (var h = 0; h < head.length; h++) {
            if (isShowChoices(head[h])) { choicesCmd = head[h]; break; }
        }
        var choices = choicesCmd.parameters[0];
        var lastIsHint = /humingi ng pahiwatig/i.test(String(choices[choices.length - 1] || ''));

        if (opts.shuffleAnswers && lastIsHint && choices.length > 2) {
            var movable = [];
            for (var q = 0; q < choices.length - 1; q++) movable.push(q);
            var order = shuffled(movable, rng);

            var newChoices = [];
            var newBranches = [];
            for (var r = 0; r < order.length; r++) {
                newChoices.push(choices[order[r]]);
                newBranches.push(branches[order[r]]);
            }
            newChoices.push(choices[choices.length - 1]);          // hint stays last
            newBranches.push(branches[branches.length - 1]);

            choicesCmd.parameters[0] = newChoices;
            branches = newBranches;
        }

        // Read back the (possibly reordered) choice list before renumbering.
        choices = choicesCmd.parameters[0];

        // Renumber the When selectors to their new slots.
        for (var s = 0; s < branches.length; s++) {
            branches[s].cmds[0].parameters[0] = s;
            branches[s].cmds[0].parameters[1] = choices[s];
        }

        // ---- hint charge ------------------------------------------------------
        var hintBranch = branches[branches.length - 1];
        if (opts.injectHint && hintBranch) {
            for (var z = 0; z < hintBranch.cmds.length; z++) {
                var hc = hintBranch.cmds[z];
                if (hc.code === 122 && hc.parameters[0] <= 15 && hc.parameters[1] >= 15) {
                    hintBranch.cmds.splice(z + 1, 0, {
                        code: 356, indent: hc.indent,
                        // MV's command356 does params[0].split(" "), so the whole
                        // command has to live in a single string.
                        parameters: ['PalSupport hint']
                    });
                    break;
                }
            }
        }

        var out = head.map(clone);
        for (var bb = 0; bb < branches.length; bb++) {
            out = out.concat(branches[bb].cmds);
        }
        return out.concat(tail);
    }

    // -------------------------------------------------------------------------
    // Semantic fingerprint used before/after
    // -------------------------------------------------------------------------
    function fingerprint(list) {
        var f = { score: 0, enemy: 0, choices: 0, whens: 0, ends: 0, blocks: 0 };
        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            if (c.code === 102 && c.indent === 0) f.choices++;
            if (c.code === 402 && c.indent === 0) f.whens++;
            if (c.code === 404 && c.indent === 0) f.ends++;
            if (c.code === 118 && c.indent === 0) f.blocks++;
            if (c.code === 356) {
                var txt = (c.parameters || []).join(' ').toLowerCase();
                if (/score add/.test(txt)) f.score++;
                if (/enemyscore add/.test(txt)) f.enemy++;
            }
        }
        return f;
    }

    function allJumpTargetsResolve(list) {
        var labels = {};
        for (var i = 0; i < list.length; i++) {
            if (list[i].code === 118 && list[i].indent === 0) labels[list[i].parameters[0]] = true;
        }
        for (var j = 0; j < list.length; j++) {
            var c = list[j];
            if (c.code === 119) {
                if (!labels[c.parameters[0]]) return false;
            }
        }
        return true;
    }

    // -------------------------------------------------------------------------
    // Public entry point
    // -------------------------------------------------------------------------
    function transform(list, rng, opts) {
        rng = rng || Math.random;
        opts = opts || {};

        var parsed = splitBlocks(list);
        if (!parsed) return null;
        if (!validateBlocks(parsed.blocks)) return null;

        var blocks = parsed.blocks;
        var total = blocks.length;
        if (total < 2) return null;

        var identity = [];
        for (var i = 0; i < total; i++) identity.push(i);

        var order = opts.shuffleQuestions === false ? identity : shuffled(identity, rng);
        // Avoid a visibly identical order when there is room to differ.
        for (var attempt = 0; attempt < 8 && total > 2; attempt++) {
            var same = true;
            for (var s = 0; s < total; s++) if (order[s] !== s) { same = false; break; }
            if (!same) break;
            order = shuffled(identity, rng);
        }

        var result = parsed.prefix.map(clone);

        for (var p = 0; p < total; p++) {
            var block = blocks[order[p]];
            var rebuilt = rebuildBlock(block, order[p], p, total, opts, rng);
            if (!rebuilt) return null;
            if (opts.neutralizeOrdinals !== false) rebuilt = stripOrdinals(rebuilt);
            result = result.concat(rebuilt);
        }

        result = result.concat(parsed.suffix.map(clone));

        // A wrong answer on the tutorial's last question ends its branch with a
        // "Game Over" event command (Troops.json 1, two of them). That command
        // fires BEFORE the injected quizdone, so it would hard-reset the run to
        // the title screen and the map's own "If Lose" branch could never run.
        // Drop it from the runtime copy only; the file on disk is untouched.
        if (opts.softenGameOver !== false) {
            result = result.filter(function (c) { return c.code !== 353; });
        }

        // quizdone goes just before the terminating command.
        var insertAt = result.length;
        while (insertAt > 0 && result[insertAt - 1].code === 0) insertAt--;
        result.splice(insertAt, 0, {
            code: 356, indent: 0,
            parameters: ['PalSupport quizdone ' + total]
        });

        // ---- post-conditions --------------------------------------------------
        var before = fingerprint(list);
        var after = fingerprint(result);

        if (after.choices !== before.choices) return null;
        if (after.whens !== before.whens) return null;
        if (after.ends !== before.ends) return null;
        if (after.blocks !== before.blocks) return null;
        if (after.score !== before.score) return null;
        if (after.enemy !== before.enemy) return null;
        if (!allJumpTargetsResolve(result)) return null;
        var reparsed = splitBlocks(result);
        if (!reparsed || !validateBlocks(reparsed.blocks)) return null;

        return result;
    }

    return {
        splitBlocks: splitBlocks,
        splitBranches: splitBranches,
        validateBlocks: validateBlocks,
        fingerprint: fingerprint,
        stripOrdinals: stripOrdinals,
        isOrdinal: isOrdinal,
        allJumpTargetsResolve: allJumpTargetsResolve,
        transform: transform
    };
})();

//=============================================================================
// Runtime integration (browser only)
//=============================================================================
(function () {
    if (typeof PluginManager === 'undefined') return; // Node: pure module only

    var NAME = 'PalQuiz';
    var p = PluginManager.parameters(NAME);
    var num = function (k, d) { var v = Number(p[k]); return isNaN(v) ? d : v; };
    var bool = function (k, d) {
        if (p[k] === undefined) return d;
        return String(p[k]).toLowerCase() === 'true';
    };

    var C = {
        disableSwitch: num('enabledSwitchId', 30),
        shuffleQuestions: bool('shuffleQuestions', true),
        shuffleAnswers: bool('shuffleAnswers', true),
        neutralizeOrdinals: bool('neutralizeOrdinals', true),
        softenGameOver: bool('softenGameOver', true),
        debug: bool('Debug Logging', false)
    };

    var pristine = {};

    function disabled() {
        try { return $gameSwitches && $gameSwitches.value(C.disableSwitch) === true; }
        catch (e) { return true; }
    }

    function log() {
        if (!C.debug) return;
        console.log.apply(console, [NAME].concat([].slice.call(arguments)));
    }

    function deepCopy(list) { return JSON.parse(JSON.stringify(list || [])); }

    function prepare(troopId) {
        try {
            if (disabled()) return;
            var troop = $dataTroops && $dataTroops[troopId];
            if (!troop || !troop.pages) return;

            if (!pristine[troopId]) {
                pristine[troopId] = troop.pages.map(function (pg) { return deepCopy(pg.list); });
            }

            for (var i = 0; i < troop.pages.length; i++) {
                var src = pristine[troopId][i];
                if (!src || !src.length) continue;

                var out = PalQuizCore.transform(src, Math.random, {
                    shuffleQuestions: C.shuffleQuestions,
                    shuffleAnswers: C.shuffleAnswers,
                    neutralizeOrdinals: C.neutralizeOrdinals,
                    softenGameOver: C.softenGameOver,
                    injectHint: true
                });

                if (out) {
                    troop.pages[i].list = out;
                } else {
                    troop.pages[i].list = deepCopy(src);
                    log('troop ' + troopId + ' page ' + i + ': kept original order');
                }
            }
        } catch (e) {
            log('prepare failed', e);
            try {
                if (pristine[troopId] && $dataTroops[troopId]) {
                    $dataTroops[troopId].pages.forEach(function (pg, idx) {
                        pg.list = deepCopy(pristine[troopId][idx]);
                    });
                }
            } catch (e2) { /* give up quietly */ }
        }
    }

    var _setup = BattleManager.setup;
    BattleManager.setup = function (troopId) {
        _setup.apply(this, arguments);
        prepare(troopId);
    };

    // Expose for console debugging during the demo.
    window.PalQuiz = { prepare: prepare, core: PalQuizCore };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PalQuizCore;
}
