//=============================================================================
// Yanfly Engine Plugins - Map Status Window
// YEP_MapStatusWindow.js
// Dual-Window Edition (Right-Aligned Rounded Glass Card Layout)
//=============================================================================

var Imported = Imported || {};
Imported.YEP_MapStatusWindow = true;

var Yanfly = Yanfly || {};
Yanfly.MapStatus = Yanfly.MapStatus || {};
Yanfly.MapStatus.version = 3.4;

/*:
 * @plugindesc v3.40 Dual-window HUD with rounded translucent glass cards.
 * @author Yanfly Engine Plugins / Reworked HUD
 *
 * @param Window X
 * @desc X position of the HUD. Use a formula or number.
 * @default Graphics.boxWidth - 330 - 16
 *
 * @param Window Y
 * @desc Y position (pixels from top) of the HUD.
 * @default 10
 *
 * @param Window Width
 * @desc Width in pixels of the status windows.
 * @default 330
 *
 * @help
 * ============================================================================
 * Plugin Commands
 * ============================================================================
 * OpenMapStatusWindow      - Opens the HUDs.
 * CloseMapStatusWindow     - Closes the HUDs.
 * ToggleMapStatusWindow    - Toggles the HUDs.
 * RefreshMapStatusWindow   - Refreshes both HUDs immediately.
 */

Yanfly.Parameters = PluginManager.parameters("MapStatusWindow_Reworked");
Yanfly.Param = Yanfly.Param || {};

Yanfly.Param.MapStatusWinX     = String(Yanfly.Parameters["Window X"]     || "Graphics.boxWidth - 330 - 16");
Yanfly.Param.MapStatusWinY     = Number(Yanfly.Parameters["Window Y"]     || 10);
Yanfly.Param.MapStatusWinWidth = Number(Yanfly.Parameters["Window Width"] || 330);
Yanfly.Param.MapStatusAutoOpen = true;

//=============================================================================
// Canvas Helpers: Rounded Rectangles
//=============================================================================
Bitmap.prototype.fillRoundedRect = function (
  x,
  y,
  width,
  height,
  radius,
  color,
) {
  var ctx = this._context;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  this._setDirty();
};

Bitmap.prototype.strokeRoundedRect = function (
  x,
  y,
  width,
  height,
  radius,
  strokeColor,
  lineWidth,
) {
  var ctx = this._context;
  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth || 1;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  this._setDirty();
};

//=============================================================================
// Game_System
//=============================================================================
Yanfly.MapStatus.Game_System_initialize = Game_System.prototype.initialize;
Game_System.prototype.initialize = function () {
  Yanfly.MapStatus.Game_System_initialize.call(this);
  this.initMapStatusWindowSettings();
};

Game_System.prototype.initMapStatusWindowSettings = function () {
  // No per-save overrides — position is always driven by plugin params.
};

Game_System.prototype.getMapStatusWindowY = function () {
  return Yanfly.Param.MapStatusWinY;
};

Game_System.prototype.setMapStatusWindowY = function (val) {
  // No-op: Y is controlled by plugin param only.
};

//=============================================================================
// Auto-Refresh Hooks
//=============================================================================
Game_BattlerBase.prototype.isUpdateMapStatus = function () {
  if (!this.isActor()) return false;
  if (SceneManager._scene instanceof Scene_Map) {
    var scene = SceneManager._scene;
    return scene._statusWindow && scene._statusWindow.isOpen();
  }
  return false;
};

Yanfly.MapStatus.Game_BattlerBase_setHp = Game_BattlerBase.prototype.setHp;
Game_BattlerBase.prototype.setHp = function (hp) {
  Yanfly.MapStatus.Game_BattlerBase_setHp.call(this, hp);
  if (this.isUpdateMapStatus()) SceneManager._scene.refreshMapStatusWindow();
};

Yanfly.MapStatus.Game_BattlerBase_setMp = Game_BattlerBase.prototype.setMp;
Game_BattlerBase.prototype.setMp = function (mp) {
  Yanfly.MapStatus.Game_BattlerBase_setMp.call(this, mp);
  if (this.isUpdateMapStatus()) SceneManager._scene.refreshMapStatusWindow();
};

//=============================================================================
// Plugin Commands
//=============================================================================
Yanfly.MapStatus.Game_Interpreter_pluginCommand =
  Game_Interpreter.prototype.pluginCommand;
Game_Interpreter.prototype.pluginCommand = function (command, args) {
  Yanfly.MapStatus.Game_Interpreter_pluginCommand.call(this, command, args);
  if (command === "OpenMapStatusWindow") {
    if (SceneManager._scene instanceof Scene_Map)
      SceneManager._scene.openMapStatusWindow();
  } else if (command === "CloseMapStatusWindow") {
    if (SceneManager._scene instanceof Scene_Map)
      SceneManager._scene.closeMapStatusWindow();
  } else if (command === "ToggleMapStatusWindow") {
    if (SceneManager._scene instanceof Scene_Map)
      SceneManager._scene.toggleMapStatusWindow();
  } else if (command === "RefreshMapStatusWindow") {
    if (SceneManager._scene instanceof Scene_Map)
      SceneManager._scene.refreshMapStatusWindow();
  }
};



//=============================================================================
// Helper: Draw Custom Gauge with Embedded Text
//=============================================================================
Window_Base.prototype.drawCustomHudBar = function (
  x,
  y,
  width,
  height,
  current,
  max,
  color1,
  color2,
  label,
) {
  this.contents.fillRect(x, y, width, height, "rgba(0, 0, 0, 0.65)");

  var rate = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  var fillW = Math.floor((width - 2) * rate);
  if (fillW > 0) {
    this.contents.gradientFillRect(
      x + 1,
      y + 1,
      fillW,
      height - 2,
      color1,
      color2,
    );
  }

  this.contents.fontSize = 11;
  var textY = y - 9;

  this.changeTextColor(this.systemColor());
  this.drawText(label, x + 4, textY, 24, "left");

  this.changeTextColor(this.normalColor());
  this.drawText(
    String(current) + " / " + String(max),
    x,
    textY,
    width - 4,
    "right",
  );
};

//=============================================================================
// Window 1: Leader Status Window
//=============================================================================
function Window_MapStatusHUD() {
  this.initialize.apply(this, arguments);
}

Window_MapStatusHUD.prototype = Object.create(Window_Base.prototype);
Window_MapStatusHUD.prototype.constructor = Window_MapStatusHUD;

Window_MapStatusHUD.prototype.initialize = function () {
  Window_Base.prototype.initialize.call(
    this,
    0,
    0,
    Yanfly.Param.MapStatusWinWidth,
    94,
  );
  this.openness = 0;
  this.opacity = 0;
  this._lastHp = -1;
  this._lastMp = -1;
  this.refresh();
};

Window_MapStatusHUD.prototype.standardPadding = function () {
  return 8;
};

Window_MapStatusHUD.prototype.actor = function () {
  return $gameParty ? $gameParty.leader() : null;
};

Window_MapStatusHUD.prototype.update = function () {
  Window_Base.prototype.update.call(this);
  var actor = this.actor();
  if (!actor) return;
  if (actor.hp !== this._lastHp || actor.mp !== this._lastMp) {
    this.refresh();
  }
};

Window_MapStatusHUD.prototype.refresh = function () {
  this.contents.clear();
  this.resetFontSettings();
  var actor = this.actor();
  if (!actor) return;

  this._lastHp = actor.hp;
  this._lastMp = actor.mp;

  var w = this.contents.width;
  var h = this.contents.height;
  var cornerRadius = 10;

  // Draw rounded card background & subtle outline
  this.contents.fillRoundedRect(
    0,
    0,
    w,
    h,
    cornerRadius,
    "rgba(10, 14, 22, 0.65)",
  );
  this.contents.strokeRoundedRect(
    0.5,
    0.5,
    w - 1,
    h - 1,
    cornerRadius,
    "rgba(255, 255, 255, 0.12)",
    1,
  );

  this.contents.outlineWidth = 3;
  this.contents.outlineColor = "rgba(0, 0, 0, 0.9)";

  // Inner layout padding
  var innerPadX = 8;
  var faceSize = 54;
  var faceX = innerPadX;
  var faceY = Math.floor((h - faceSize) / 2);

  var faceOffset = faceX + faceSize + 10;
  var contentWidth = w - faceOffset - innerPadX;

  // Face
  this.drawMiniFace(actor, faceX, faceY, faceSize, faceSize);

  // Name & Level
  this.contents.fontSize = 16;
  this.changeTextColor(this.hpColor(actor));
  this.drawText(actor.name(), faceOffset, -6, contentWidth - 52, "left");

  this.changeTextColor(this.systemColor());
  this.contents.fontSize = 12;
  this.drawText(
    TextManager.levelA,
    faceOffset + contentWidth - 48,
    -4,
    20,
    "left",
  );
  this.changeTextColor(this.normalColor());
  this.drawText(
    String(actor.level),
    faceOffset + contentWidth - 28,
    -4,
    28,
    "right",
  );

  // Gauges
  this.drawCustomHudBar(
    faceOffset,
    25,
    contentWidth,
    16,
    actor.hp,
    actor.mhp,
    this.textColor(20),
    this.textColor(21),
    TextManager.hpA,
  );
  this.drawCustomHudBar(
    faceOffset,
    48,
    contentWidth,
    16,
    actor.mp,
    actor.mmp,
    this.textColor(22),
    this.textColor(23),
    TextManager.mpA,
  );
};

Window_MapStatusHUD.prototype.drawMiniFace = function (actor, x, y, dw, dh) {
  var bitmap = ImageManager.loadFace(actor.faceName());
  if (!bitmap.isReady()) {
    var self = this;
    bitmap.addLoadListener(function () {
      self.refresh();
    });
    return;
  }
  var faceIndex = actor.faceIndex();
  var sw = Window_Base._faceWidth;
  var sh = Window_Base._faceHeight;
  var sx = (faceIndex % 4) * sw;
  var sy = Math.floor(faceIndex / 4) * sh;
  this.contents.blt(bitmap, sx, sy, sw, sh, x, y, dw, dh);
};

//=============================================================================
// Window 2: Companion Status Window
//=============================================================================
function Window_MapCompanionHUD() {
  this.initialize.apply(this, arguments);
}

Window_MapCompanionHUD.prototype = Object.create(Window_Base.prototype);
Window_MapCompanionHUD.prototype.constructor = Window_MapCompanionHUD;

Window_MapCompanionHUD.prototype.initialize = function () {
  Window_Base.prototype.initialize.call(
    this,
    0,
    0,
    Yanfly.Param.MapStatusWinWidth,
    64,
  );
  this.openness = 0;
  this.opacity = 0;
  this._lastHp = -1;
  this.refresh();
};

Window_MapCompanionHUD.prototype.standardPadding = function () {
  return 8;
};

Window_MapCompanionHUD.prototype.companion = function () {
  if (!$gameParty) return null;
  var members = $gameParty.battleMembers();
  return members.length > 1 ? members[1] : null;
};

Window_MapCompanionHUD.prototype.update = function () {
  Window_Base.prototype.update.call(this);
  var comp = this.companion();
  if (!comp) {
    if (this.isOpen()) this.close();
    return;
  }
  if (comp.hp !== this._lastHp) {
    this.refresh();
  }
};

Window_MapCompanionHUD.prototype.refresh = function () {
  this.contents.clear();
  this.resetFontSettings();
  var comp = this.companion();
  if (!comp) return;

  this._lastHp = comp.hp;

  var w = this.contents.width;
  var h = this.contents.height;
  var cornerRadius = 10;

  // Draw rounded card background & subtle outline
  this.contents.fillRoundedRect(
    0,
    0,
    w,
    h,
    cornerRadius,
    "rgba(10, 14, 22, 0.65)",
  );
  this.contents.strokeRoundedRect(
    0.5,
    0.5,
    w - 1,
    h - 1,
    cornerRadius,
    "rgba(255, 255, 255, 0.12)",
    1,
  );

  this.contents.outlineWidth = 3;
  this.contents.outlineColor = "rgba(0, 0, 0, 0.9)";

  // Inner layout padding
  var innerPadX = 8;
  var faceSize = 38;
  var faceX = innerPadX;
  var faceY = Math.floor((h - faceSize) / 2);

  var faceOffset = faceX + faceSize + 10;
  var contentWidth = w - faceOffset - innerPadX;

  var bitmap = ImageManager.loadFace(comp.faceName());
  if (!bitmap.isReady()) {
    var self = this;
    bitmap.addLoadListener(function () {
      self.refresh();
    });
  } else {
    var faceIndex = comp.faceIndex();
    var sw = Window_Base._faceWidth;
    var sh = Window_Base._faceHeight;
    var sx = (faceIndex % 4) * sw;
    var sy = Math.floor(faceIndex / 4) * sh;
    this.contents.blt(bitmap, sx, sy, sw, sh, faceX, faceY, faceSize, faceSize);
  }

  this.contents.fontSize = 14;
  this.changeTextColor(this.hpColor(comp));
  this.drawText(comp.name(), faceOffset, -7, contentWidth - 60, "left");

  this.changeTextColor(this.systemColor());
  this.contents.fontSize = 11;
  this.drawText("Kasama", faceOffset + contentWidth - 50, -6, 50, "right");

  this.drawCustomHudBar(
    faceOffset,
    20,
    contentWidth,
    16,
    comp.hp,
    comp.mhp,
    this.textColor(20),
    this.textColor(21),
    TextManager.hpA,
  );
};

//=============================================================================
// Scene_Map Integration
//=============================================================================
Yanfly.MapStatus.Scene_Map_createAllWindows =
  Scene_Map.prototype.createAllWindows;
Scene_Map.prototype.createAllWindows = function () {
  Yanfly.MapStatus.Scene_Map_createAllWindows.call(this);
  this.createMapStatusWindow();
};

Scene_Map.prototype.createMapStatusWindow = function () {
  if (this._statusWindow) return;

  this._statusWindow = new Window_MapStatusHUD();
  this.addWindow(this._statusWindow);

  this._companionWindow = new Window_MapCompanionHUD();
  this.addWindow(this._companionWindow);

  this.updateHUDPositions();
};

Scene_Map.prototype.updateHUDPositions = function () {
  var posX = Graphics.boxWidth - Yanfly.Param.MapStatusWinWidth - 16;
  var posY = Yanfly.Param.MapStatusWinY;

  try { posX = eval(Yanfly.Param.MapStatusWinX); } catch (e) {}
  if (this._statusWindow) {
    this._statusWindow.x = posX;
    this._statusWindow.y = posY;
  }
  if (this._companionWindow && this._statusWindow) {
    this._companionWindow.x = posX;
    this._companionWindow.y = posY + this._statusWindow.height + 6;
  }
};

Scene_Map.prototype.openMapStatusWindow = function () {
  if (!this._statusWindow) this.createMapStatusWindow();
  this.updateHUDPositions();
  this._statusWindow.refresh();
  this._statusWindow.open();

  if ($gameParty && $gameParty.battleMembers().length > 1) {
    this._companionWindow.refresh();
    this._companionWindow.open();
  }
};

Scene_Map.prototype.closeMapStatusWindow = function () {
  if (this._statusWindow) this._statusWindow.close();
  if (this._companionWindow) this._companionWindow.close();
};

Scene_Map.prototype.toggleMapStatusWindow = function () {
  if (!this._statusWindow) this.createMapStatusWindow();
  if (this._statusWindow.isOpen()) {
    this.closeMapStatusWindow();
  } else {
    this.openMapStatusWindow();
  }
};

Scene_Map.prototype.refreshMapStatusWindow = function () {
  if (this._statusWindow) this._statusWindow.refresh();
  if (this._companionWindow) this._companionWindow.refresh();
};

Yanfly.MapStatus.Scene_Map_update = Scene_Map.prototype.update;
Scene_Map.prototype.update = function () {
  Yanfly.MapStatus.Scene_Map_update.call(this);

  if (
    this._statusWindow &&
    Yanfly.Param.MapStatusAutoOpen &&
    !this._mapStatusAutoOpened
  ) {
    this._mapStatusAutoOpened = true;
    this.openMapStatusWindow();
  }

  if (
    this._companionWindow &&
    this._statusWindow &&
    this._statusWindow.isOpen()
  ) {
    var hasCompanion = $gameParty && $gameParty.battleMembers().length > 1;
    if (hasCompanion && !this._companionWindow.isOpen()) {
      this._companionWindow.refresh();
      this._companionWindow.open();
    } else if (!hasCompanion && this._companionWindow.isOpen()) {
      this._companionWindow.close();
    }
  }
};

Yanfly.MapStatus.Scene_Map_terminate = Scene_Map.prototype.terminate;
Scene_Map.prototype.terminate = function () {
  if (this._statusWindow) this._statusWindow.visible = false;
  if (this._companionWindow) this._companionWindow.visible = false;
  Yanfly.MapStatus.Scene_Map_terminate.call(this);
};
