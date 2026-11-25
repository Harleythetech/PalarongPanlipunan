/*:
 * @plugindesc [v1.0] Clique sur événements avec commentaire /KasclickEvent pour les déclencher
 * @author Kasbak
 */

(function() {

    // Surcharge Game_Temp pour déclencher l'événement si c'est un événement cliquable
    var _Game_Temp_setDestination = Game_Temp.prototype.setDestination;
    Game_Temp.prototype.setDestination = function(x, y) {
        if (!this.isKasClickEventAtXy(x, y)) {
            _Game_Temp_setDestination.call(this, x, y);
        }
    };

    Game_Temp.prototype.isKasClickEventAtXy = function(x, y) {
        var events = $gameMap.eventsXy(x, y);
        for (var i = 0; i < events.length; i++) {
            var ev = events[i];
            if (ev && ev.isKasClickTriggered()) {
                ev.onKasMouseClickTrigger();
                return true;
            }
        }
        return false;
    };

    // Game_Event : vérifie le commentaire /KasclickEvent
    Game_Event.prototype.isKasClickTriggered = function() {
        if (this._isKasClickTriggerable === undefined) {
            this.setupKasClickCommentTag();
        }
        return this._isKasClickTriggerable;
    };

    var _Game_Event_setupPage = Game_Event.prototype.setupPage;
    Game_Event.prototype.setupPage = function() {
        _Game_Event_setupPage.call(this);
        this.setupKasClickCommentTag();
    };

    Game_Event.prototype.setupKasClickCommentTag = function() {
        if (!this.page()) return;
        this._isKasClickTriggerable = false;
        var list = this.list();
        for (var i = 0; i < list.length; i++) {
            var command = list[i];
            if ([108, 408].contains(command.code)) { // commentaire
                if (command.parameters[0].match(/\/KasclickEvent/i)) {
                    this._isKasClickTriggerable = true;
                }
            }
        }
    };

    Game_Event.prototype.onKasMouseClickTrigger = function() {
        if (this.isKasClickTriggered()) {
            $gameTemp.clearDestination();
            this.start(); // déclenche l'événement comme si on avait appuyé sur Entrée
        }
    };

})();