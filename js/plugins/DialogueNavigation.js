/*:
 * @plugindesc v1.3 Adds Susunod/Bumalik navigation to map and battle dialogue pages.
 * @author Harleythetech
 *
 * @param Next Label
 * @desc Label used to advance through a dialogue page.
 * @default Susunod
 *
 * @param Back Label
 * @desc Label used to redisplay the previous text page.
 * @default Bumalik
 *
 * @param Battle Dialogue
 * @type boolean
 * @desc Enable navigation for dialogue displayed during battle.
 * @default true
 *
 * @param Map Dialogue
 * @type boolean
 * @desc Enable navigation for dialogue displayed on maps.
 * @default true
 *
 * @param Debug Logging
 * @type boolean
 * @desc Log navigation choices and dialogue/interpreter state to the console.
 * @default false
 *
 * @help
 * Adds a navigation choice to eligible Show Text commands on maps. Susunod
 * continues the event. Bumalik redisplays the previous text without rerunning
 * event commands. Battle dialogue is left unchanged.
 *
 * Existing choices, number input, and item selection immediately after Show
 * Text are preserved. Other scenes and scrolling text are unchanged.
 */
(function() {
    'use strict';

    var parameters = PluginManager.parameters('PalConversationNavigation');
    var NEXT_LABEL = String(parameters['Next Label'] || 'Susunod');
    var BACK_LABEL = String(parameters['Back Label'] || 'Bumalik');
    var ENABLE_MAP = String(parameters['Map Dialogue'] || 'true') === 'true';
    var ENABLE_BATTLE = String(parameters['Battle Dialogue'] || 'true') === 'true';
    // DEBUG_LOGGING: prefer window.RPGRXDebug so the master switch is respected.
    // Falls back to the local param when RPGReloaded is not present.
    function _debugEnabled() {
        if (window.RPGRXDebug) return window.RPGRXDebug('DialogueNavigation');
        return String(parameters['Debug Logging'] || 'false') === 'true';
    }

    var histories = [];
    var activeNavigation = null;
    var pendingReplay = null;

    function enabledInCurrentScene() {
        if (SceneManager._scene instanceof Scene_Map) return ENABLE_MAP;
        if (SceneManager._scene instanceof Scene_Battle) return false;
        return false;
    }

    function logNavigation(action, interpreter, history, page, choiceIndex) {
        if (!_debugEnabled() || !window.console || !console.log) return;
        console.log('[PalConversationNavigation]', {
            action: action,
            scene: SceneManager._scene && SceneManager._scene.constructor.name,
            mapId: $gameMap ? $gameMap.mapId() : null,
            eventId: interpreter ? interpreter._eventId : null,
            interpreterIndex: interpreter ? interpreter._index : null,
            commandIndex: page ? page.commandIndex : null,
            currentHistoryIndex: history ? history.currentIndex : null,
            historyLength: history ? history.pages.length : null,
            choiceIndex: choiceIndex,
            text: page ? page.texts.join('\n') : ''
        });
    }

    function historyFor(interpreter) {
        for (var i = 0; i < histories.length; i++) {
            if (histories[i].interpreter === interpreter) return histories[i];
        }
        var history = { interpreter: interpreter, pages: [], currentIndex: -1 };
        histories.push(history);
        return history;
    }

    function removeHistory(interpreter) {
        for (var i = histories.length - 1; i >= 0; i--) {
            if (!interpreter || histories[i].interpreter === interpreter) {
                histories.splice(i, 1);
            }
        }
    }

    function capturePage(message, commandIndex) {
        return {
            commandIndex: commandIndex,
            texts: message._texts.slice(),
            faceName: message._faceName,
            faceIndex: message._faceIndex,
            background: message._background,
            positionType: message._positionType
        };
    }

    function restorePage(message, page) {
        message._texts = page.texts.slice();
        message._faceName = page.faceName;
        message._faceIndex = page.faceIndex;
        message._background = page.background;
        message._positionType = page.positionType;
    }

    function installNavigationChoice(interpreter, history) {
        var choices = [NEXT_LABEL];
        if (history.currentIndex > 0) choices.push(BACK_LABEL);
        $gameMessage.setChoices(choices, 0, -1);
        $gameMessage.setChoicePositionType(1);
        $gameMessage.setChoiceBackground(0);
        activeNavigation = { interpreter: interpreter, history: history };
        logNavigation('choices shown', interpreter, history,
            history.pages[history.currentIndex]);
        $gameMessage.setChoiceCallback(function(choiceIndex) {
            logNavigation(choiceIndex === 1 ? 'Bumalik selected' : 'Susunod selected',
                interpreter, history, history.pages[history.currentIndex], choiceIndex);
            if (choiceIndex === 1 && history.currentIndex > 0) {
                history.currentIndex--;
                pendingReplay = {
                    interpreter: interpreter,
                    history: history,
                    page: history.pages[history.currentIndex]
                };
                logNavigation('replay queued', interpreter, history, pendingReplay.page);
            } else {
                if (history.currentIndex < history.pages.length - 1) {
                    var nextPage = history.pages[history.currentIndex + 1];
                    history.currentIndex++;
                    if (nextPage && interpreter._index > nextPage.commandIndex) {
                        interpreter._index = nextPage.commandIndex;
                        interpreter.setWaitMode('');
                    }
                    logNavigation('advance after replay', interpreter, history, nextPage);
                }
                activeNavigation = null;
            }
        });
    }

    var _Game_Interpreter_command101 = Game_Interpreter.prototype.command101;
    Game_Interpreter.prototype.command101 = function() {
        if (!enabledInCurrentScene() || $gameMessage.isBusy()) {
            return _Game_Interpreter_command101.call(this);
        }

        var history = historyFor(this);
        var commandIndex = this._index;
        if (history.currentIndex < history.pages.length - 1) {
            history.currentIndex = history.pages.length - 1;
        }
        var nextIndex = commandIndex + 1;
        while (this._list[nextIndex] && this._list[nextIndex].code === 401) {
            nextIndex++;
        }
        var nextCommand = this._list[nextIndex];
        var hasAuthoredInput = nextCommand &&
            (nextCommand.code === 102 || nextCommand.code === 103 ||
             nextCommand.code === 104);

        var result = _Game_Interpreter_command101.call(this);
        if (result === false && $gameMessage.hasText() && !hasAuthoredInput) {
            var page = capturePage($gameMessage, commandIndex);
            var knownPage = history.pages[history.pages.length - 1];
            if (!knownPage || knownPage.commandIndex !== commandIndex) {
                if (history.currentIndex < history.pages.length - 1) {
                    history.pages = history.pages.slice(0, history.currentIndex + 1);
                }
                history.pages.push(page);
                logNavigation('new dialogue page captured', this, history, page);
            } else {
                history.pages[history.pages.length - 1] = page;
                logNavigation('current dialogue page recaptured', this, history, page);
            }
            history.currentIndex = history.pages.length - 1;
            installNavigationChoice(this, history);
        }
        return result;
    };

    var _Window_Message_startMessage = Window_Message.prototype.startMessage;
    Window_Message.prototype.startMessage = function() {
        if (pendingReplay) {
            logNavigation('replay restored before message start',
                pendingReplay.interpreter, pendingReplay.history, pendingReplay.page);
            restorePage($gameMessage, pendingReplay.page);
            activeNavigation = {
                interpreter: pendingReplay.interpreter,
                history: pendingReplay.history
            };
            installNavigationChoice(activeNavigation.interpreter, activeNavigation.history);
            pendingReplay = null;
        }
        if (activeNavigation) {
            var choices = $gameMessage._choices;
            var defaultType = $gameMessage._choiceDefaultType;
            var cancelType = $gameMessage._choiceCancelType;
            var choiceBackground = $gameMessage._choiceBackground;
            var choicePositionType = $gameMessage._choicePositionType;
            $gameMessage._choices = [];
            _Window_Message_startMessage.call(this);
            $gameMessage._choices = choices;
            $gameMessage._choiceDefaultType = defaultType;
            $gameMessage._choiceCancelType = cancelType;
            $gameMessage._choiceBackground = choiceBackground;
            $gameMessage._choicePositionType = choicePositionType;
            return;
        }
        _Window_Message_startMessage.call(this);
    };

    var _Window_ChoiceList_callOkHandler = Window_ChoiceList.prototype.callOkHandler;
    Window_ChoiceList.prototype.callOkHandler = function() {
        if (activeNavigation && $gameMessage._choiceCallback &&
                $gameMessage.choices()[0] === NEXT_LABEL) {
            logNavigation('navigation choice confirmed', activeNavigation.interpreter,
                activeNavigation.history,
                activeNavigation.history.pages[activeNavigation.history.currentIndex], this.index());
            var callback = $gameMessage._choiceCallback;
            callback(this.index());
            $gameMessage._choiceCallback = null;
            this._messageWindow.terminateMessage();
            this.close();
            return;
        }
        _Window_ChoiceList_callOkHandler.call(this);
    };

    var _Game_Message_clear = Game_Message.prototype.clear;
    Game_Message.prototype.clear = function() {
        _Game_Message_clear.call(this);
        activeNavigation = null;
        if (pendingReplay) {
            restorePage(this, pendingReplay.page);
        }
    };

    var _Game_Interpreter_terminate = Game_Interpreter.prototype.terminate;
    Game_Interpreter.prototype.terminate = function() {
        removeHistory(this);
        if (pendingReplay && pendingReplay.interpreter === this) pendingReplay = null;
        _Game_Interpreter_terminate.call(this);
    };

    var _Game_Map_setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        removeHistory();
        pendingReplay = null;
        _Game_Map_setup.call(this, mapId);
    };

    var _BattleManager_startBattle = BattleManager.startBattle;
    BattleManager.startBattle = function() {
        removeHistory();
        pendingReplay = null;
        _BattleManager_startBattle.call(this);
    };
})();
