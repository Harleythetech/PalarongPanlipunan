//=============================================================================
// main.js
//=============================================================================

// ─────────────────────────────────────────────────────────────────────────────
//  RPG RX — Debug Boot System
//  Hooks are installed HERE, before PluginManager.setup(), so every single
//  loadScript call is intercepted from the very first plugin onward.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
    'use strict';

    if (!window.console) return;  // silently no-op in environments with no console

    // ── Master debug guard ────────────────────────────────────────────────────
    // RPGReloaded.js runs AFTER main.js, so window.RPGRXMasterDebug is not yet
    // set when this IIFE executes.  We read the raw plugins.js array directly
    // instead so the boot logger can be suppressed even on the very first load.
    (function _applyMasterGuard() {
        if (typeof $plugins === 'undefined') return;
        for (var i = 0; i < $plugins.length; i++) {
            if ($plugins[i].name === 'RPGReloaded') {
                var debugParam = $plugins[i].parameters && $plugins[i].parameters['Debug'];
                if (String(debugParam) === 'false') {
                    // Master switch is OFF — suppress the entire boot logger.
                    window.RPGRXMasterDebug = false;
                    return;
                }
                break;
            }
        }
        window.RPGRXMasterDebug = true;
    })();

    if (window.RPGRXMasterDebug === false) return;

    var C          = window.console;
    var _bootStart = performance.now();

    // ── Tiny helpers ──────────────────────────────────────────────────────────
    function log(msg, style) {
        if (style !== undefined) C.log('%c' + msg, style);
        else                     C.log(msg);
    }
    function pad(s, n)  { s = String(s); while (s.length < n) s += ' '; return s; }
    function lpad(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
    function ms()       { return ((performance.now() - _bootStart) / 1000).toFixed(3); }

    var GOLD  = 'color:#FFD700;font-family:monospace;font-weight:bold';
    var CYAN  = 'color:#4fc3f7;font-family:monospace';
    var GREY  = 'color:#b0bec5;font-family:monospace';
    var GREEN = 'color:#69f0ae;font-family:monospace';
    var RED   = 'color:#ff5252;font-family:monospace';
    var DIM   = 'color:#546e7a;font-family:monospace';
    var YEL   = 'color:#ffca28;font-family:monospace';

    // ── ASCII Banner ──────────────────────────────────────────────────────────
    [
        '',
        '╔══════════════════════════════════════════════════════════════════════╗',
        '║                                                                      ║',
        '║   ██████╗ ██████╗  ██████╗     ██████╗ ██╗  ██╗                    ║',
        '║   ██╔══██╗██╔══██╗██╔════╝     ██╔══██╗╚██╗██╔╝                    ║',
        '║   ██████╔╝██████╔╝██║  ███╗    ██████╔╝ ╚███╔╝                     ║',
        '║   ██╔══██╗██╔═══╝ ██║   ██║    ██╔══██╗ ██╔██╗                     ║',
        '║   ██║  ██║██║     ╚██████╔╝    ██║  ██║██╔╝ ██╗                    ║',
        '║   ╚═╝  ╚═╝╚═╝      ╚═════╝     ╚═╝  ╚═╝╚═╝  ╚═╝                   ║',
        '║                                                                      ║',
        '║              R E L O A D E D  —  Debug Boot  v1.0.0                 ║',
        '║                       Palarong Panlipunan                            ║',
        '╚══════════════════════════════════════════════════════════════════════╝',
        '',
    ].forEach(function (l) { log(l, GOLD); });

    // ── System info ───────────────────────────────────────────────────────────
    var ua  = (navigator.userAgent || 'unknown').substring(0, 72);
    var eng = (typeof nw !== 'undefined')           ? 'NW.js  (Desktop / RPG Maker MV playtest)'
            : (typeof process !== 'undefined')       ? 'Node / Electron'
            : 'Web Browser';

    log('┌─ SYSTEM ─────────────────────────────────────────────────────────────┐', CYAN);
    log('│  Runtime    : ' + pad(eng,                                    55) + '│', CYAN);
    log('│  User Agent : ' + pad(ua,                                     55) + '│', CYAN);
    log('│  Resolution : ' + pad(window.innerWidth+'x'+window.innerHeight+' (viewport)', 55) + '│', CYAN);
    log('│  Plugin dir : ' + pad('js/plugins/',                          55) + '│', CYAN);
    log('└──────────────────────────────────────────────────────────────────────┘', CYAN);
    log('', CYAN);

    // ── Plugin table header ───────────────────────────────────────────────────
    log('┌─ PLUGIN LOAD SEQUENCE ───────────────────────────────────────────────┐', GREY);
    log('│  SEQ  NAME                              STATUS     TIME      SRC     │', GREY);
    log('├──────────────────────────────────────────────────────────────────────┤', GREY);

    // ── State ─────────────────────────────────────────────────────────────────
    var _seq      = 0;
    var _pending  = 0;
    var _ok       = 0;
    var _fail     = 0;
    var _disabled = 0;
    var _done     = false;   // set after setup() returns

    function _row(seq, name, status, time, note) {
        var style = status === 'OK'       ? GREEN
                  : status === 'FAIL'     ? RED
                  : status === 'DISABLED' ? DIM
                  : YEL;
        var s = '│  ' + lpad(seq, 3) + '  ' +
                pad(name.substring(0, 33), 33) + '  ' +
                pad('[' + status + ']', 10) + ' ' +
                lpad(time !== null ? time + 's' : '---', 8) +
                (note ? '  ' + note : '') +
                '  │';
        log(s, style);
    }

    function _summary() {
        var total = _ok + _fail + _disabled;
        log('├──────────────────────────────────────────────────────────────────────┤', GREY);
        log('│  RESULT  ok: ' + lpad(_ok,2) + '  fail: ' + lpad(_fail,2) +
            '  disabled: ' + lpad(_disabled,2) + '  total: ' + lpad(total,2) +
            '  elapsed: ' + lpad(ms()+'s', 9) + '                    │', GREY);
        log('└──────────────────────────────────────────────────────────────────────┘', GREY);
        if (_fail > 0) {
            C.warn('%c[RPG RX] ⚠  ' + _fail + ' plugin(s) FAILED to load.',
                'color:#ff5252;font-weight:bold;font-family:monospace');
        }
        log('[RPG RX] Boot sequence complete at ' + ms() + 's.', GOLD);
        log('');
    }

    // ── Hook: PluginManager.setup ─────────────────────────────────────────────
    var _origSetup = PluginManager.setup;
    PluginManager.setup = function (plugins) {
        // Print disabled entries inline in list order
        (plugins || []).forEach(function (p) {
            if (!p.status) {
                _seq++;
                _disabled++;
                _row(_seq, p.name, 'DISABLED', null, '');
            }
        });

        _origSetup.call(this, plugins);
        _done = true;

        // If every loadScript resolved synchronously (unlikely but safe)
        if (_pending === 0) _summary();
    };

    // ── Hook: PluginManager.loadScript ────────────────────────────────────────
    var _origLoad = PluginManager.loadScript;
    PluginManager.loadScript = function (name) {
        _seq++;
        _pending++;

        var seq     = _seq;
        var label   = name.replace(/\.js$/i, '');
        var t0      = performance.now();

        _origLoad.call(this, name);

        // Grab the <script> tag that was just appended
        var tags = document.body.querySelectorAll('script[src*="plugins"]');
        var tag  = tags[tags.length - 1];

        if (!tag) {
            _row(seq, label, 'PENDING', null, '(tag not found)');
            _pending--;
            if (_done && _pending === 0) _summary();
            return;
        }

        tag.addEventListener('load', function () {
            _ok++;
            _pending--;
            _row(seq, label, 'OK', ((performance.now() - t0) / 1000).toFixed(3), '');
            if (_done && _pending === 0) _summary();
        });

        tag.addEventListener('error', function () {
            _fail++;
            _pending--;
            _row(seq, label, 'FAIL', ((performance.now() - t0) / 1000).toFixed(3), '← load error');
            C.error('[RPG RX] Failed to load: js/plugins/' + name);
            if (_done && _pending === 0) _summary();
        });
    };

    log('[RPG RX] Hooks live. Calling PluginManager.setup()...', YEL);
    log('');

})();
// ─────────────────────────────────────────────────────────────────────────────
//  End RPG RX — normal boot resumes below
// ─────────────────────────────────────────────────────────────────────────────

PluginManager.setup($plugins);

window.onload = function() {
    SceneManager.run(Scene_Boot);
};
