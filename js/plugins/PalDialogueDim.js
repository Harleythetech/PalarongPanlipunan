/*:
 * @plugindesc Forces all Show Text dialogue windows to use the Dim background.
 * @author Harleythetech
 *
 * @help
 * Overrides the background setting saved on Show Text event commands so all
 * dialogue windows use the built-in Dim style. Choice windows are unchanged.
 */
(function() {
    'use strict';

    var _Window_Message_startMessage = Window_Message.prototype.startMessage;
    Window_Message.prototype.startMessage = function() {
        _Window_Message_startMessage.call(this);
        this._background = 1;
        this.setBackgroundType(1);
    };
})();
