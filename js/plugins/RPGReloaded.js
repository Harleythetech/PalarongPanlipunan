/*:
 * @plugindesc [v1.1.0] RPG RX — Debug Boot System & per-plugin debug controller.
 * Place FIRST in the Plugin Manager.
 * @author Harleythetech
 *
 * @param Debug
 * @text Master Debug Switch
 * @type boolean
 * @on  Enable (development)
 * @off Disable (production)
 * @default true
 * @desc Master switch for ALL plugin debug logging.
 *       false = every plugin's Debug Logging is silenced, regardless of their
 *       individual setting. Flip this to false before shipping.
 *
 * @help
 * ============================================================================
 *  RPG RX — Debug Boot System  v1.1.0
 * ============================================================================
 *
 *  MASTER DEBUG SWITCH
 *  ───────────────────
 *  The "Master Debug Switch" parameter above controls ALL plugin logging in
 *  one place.
 *
 *    true  → per-plugin "Debug Logging" flags are respected normally
 *    false → ALL plugin debug output is suppressed, regardless of per-plugin
 *            settings (safe for production / release builds)
 *
 *  PER-PLUGIN SWITCHES
 *  ───────────────────
 *  Each custom plugin has its own "Debug Logging" parameter in the Plugin
 *  Manager.  Both the master switch AND the plugin's own switch must be true
 *  before any debug messages appear for that plugin.
 *
 *  FOR PLUGIN AUTHORS
 *  ───────────────────
 *  Use the global helper anywhere inside a plugin:
 *
 *      if (window.RPGRXDebug('MyPlugin')) {
 *          console.log('[MyPlugin] something happened', data);
 *      }
 *
 *  RPGRXDebug reads the per-plugin "Debug Logging" parameter automatically
 *  and also checks the master switch, so you never need to maintain two
 *  separate flags.
 *
 *  The actual boot logger lives in main.js so it can hook
 *  PluginManager.setup and loadScript before any plugin is loaded.
 *  This plugin file exists only so RPG RX itself appears as [OK] in the
 *  boot table, and to publish the master Debug parameter to the
 *  Plugin Manager UI.
 * ============================================================================
 */
(function () {
    'use strict';

    var _p      = PluginManager.parameters('RPGReloaded');
    var _master = String(_p['Debug'] || 'true') === 'true';

    /**
     * window.RPGRXDebug(pluginName)
     *
     * Returns true when BOTH the master debug switch (RPGReloaded > Debug) AND
     * the given plugin's own "Debug Logging" parameter are set to true.
     *
     * Usage inside any plugin:
     *   if (window.RPGRXDebug('MapGen')) { console.log('[MapGen] ...'); }
     *
     * @param  {string} pluginName  - Exact plugin name string (as in Plugin Manager)
     * @returns {boolean}
     */
    window.RPGRXDebug = function (pluginName) {
        if (!_master) return false;
        var params = PluginManager.parameters(pluginName);
        if (!params) return false;
        return String(params['Debug Logging'] || 'false') === 'true';
    };

    // Also expose the master flag directly for boot-logger use in main.js.
    window.RPGRXMasterDebug = _master;

})();
