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
 * @param Debug Logging
 * @text Debug Logging
 * @type boolean
 * @on  Enable
 * @off Disable
 * @default false
 * @desc Log HUD refresh and layout events to the console.
 *       Requires RPGReloaded Master Debug to also be ON.
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

  this.contents.fontSize = Math.max(9, Math.round((this.standardFontSize ? this.standardFontSize() : 28) * 0.39));
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
  var _fs = Math.max(1, Window_Base.prototype.standardFontSize
      ? Window_Base.prototype.standardFontSize() : 28);
  var _innerPadY   = 6;
  var _nameFs      = Math.max(12, Math.round(_fs * 0.57));
  var _gaugeH      = Math.max(10, Math.round(_fs * 0.46));
  var _gaugeLblH   = Math.max(9,  Math.round(_fs * 0.39));
  var _rowGap      = 4;
  var _labelAbove  = _gaugeLblH + 2;
  var _neededH     = _innerPadY + _nameFs + _rowGap + _labelAbove + _gaugeH +
                     _rowGap + _labelAbove + _gaugeH + _innerPadY;
  var _winPad      = Window_Base.prototype.standardPadding
      ? Window_Base.prototype.standardPadding() : 18;
  var _leaderH     = _neededH + _winPad * 2;
  Window_Base.prototype.initialize.call(
    this,
    0,
    0,
    Yanfly.Param.MapStatusWinWidth,
    _leaderH,
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

  var _base       = this.standardFontSize ? this.standardFontSize() : 28;
  var innerPadX   = 8;
  var innerPadY   = 6;
  var nameFs      = Math.max(12, Math.round(_base * 0.57));
  var levelFs     = Math.max(10, Math.round(_base * 0.43));
  var gaugeH      = Math.max(10, Math.round(_base * 0.46));
  var gaugeLabelH = Math.max(9,  Math.round(_base * 0.39)); // font used inside drawCustomHudBar
  var rowGap      = 4;   // gap between gauge rows
  var labelAbove  = gaugeLabelH + 2; // drawCustomHudBar draws label at y-9; we give it space

  // Vertical layout (top to bottom inside contents area):
  //   innerPadY
  //   name row          (nameFs tall)
  //   rowGap
  //   labelAbove        (space for HP label drawn above bar)
  //   HP gauge          (gaugeH tall)
  //   rowGap
  //   labelAbove        (space for MP label drawn above bar)
  //   MP gauge          (gaugeH tall)
  //   innerPadY
  var nameY   = innerPadY;
  var hpLblY  = nameY + nameFs + rowGap;
  var hpY     = hpLblY + labelAbove;
  var mpLblY  = hpY + gaugeH + rowGap;
  var mpY     = mpLblY + labelAbove;
  var neededH = mpY + gaugeH + innerPadY;

  // Face: sized to fill the full needed height minus padding
  var faceSize   = neededH - innerPadY * 2;
  var faceX      = innerPadX;
  var faceY      = innerPadY;
  var faceOffset = faceX + faceSize + 10;
  var contentW   = w - faceOffset - innerPadX;

  // Face
  this.drawMiniFace(actor, faceX, faceY, faceSize, faceSize);

  // Name
  this.contents.fontSize = nameFs;
  this.changeTextColor(this.hpColor(actor));
  this.drawText(actor.name(), faceOffset, nameY, contentW - 52, "left");

  // Level (right-aligned on same row as name)
  this.changeTextColor(this.systemColor());
  this.contents.fontSize = levelFs;
  this.drawText(TextManager.levelA, faceOffset + contentW - 48, nameY + 2, 20, "left");
  this.changeTextColor(this.normalColor());
  this.drawText(String(actor.level), faceOffset + contentW - 28, nameY + 2, 28, "right");

  // HP gauge
  this.drawCustomHudBar(
    faceOffset, hpY, contentW, gaugeH,
    actor.hp, actor.mhp,
    this.textColor(20), this.textColor(21), TextManager.hpA
  );

  // MP gauge
  this.drawCustomHudBar(
    faceOffset, mpY, contentW, gaugeH,
    actor.mp, actor.mmp,
    this.textColor(22), this.textColor(23), TextManager.mpA
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
  var _fs2 = Math.max(1, Window_Base.prototype.standardFontSize
      ? Window_Base.prototype.standardFontSize() : 28);
  var _nameFs2     = Math.max(12, Math.round(_fs2 * 0.50));
  var _gaugeH2     = Math.max(10, Math.round(_fs2 * 0.46));
  var _gaugeLblH2  = Math.max(9,  Math.round(_fs2 * 0.39));
  var _pad2        = Window_Base.prototype.standardPadding
      ? Window_Base.prototype.standardPadding() : 18;
  var _neededH2    = 6 + _nameFs2 + 4 + (_gaugeLblH2 + 2) + _gaugeH2 + 6;
  var _companionH  = _neededH2 + _pad2 * 2;
  Window_Base.prototype.initialize.call(
    this,
    0,
    0,
    Yanfly.Param.MapStatusWinWidth,
    _companionH,
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

  var _base2      = this.standardFontSize ? this.standardFontSize() : 28;
  var innerPadX   = 8;
  var innerPadY   = 6;
  var nameFs2     = Math.max(12, Math.round(_base2 * 0.50));
  var gaugeH2     = Math.max(10, Math.round(_base2 * 0.46));
  var gaugeLblH2  = Math.max(9,  Math.round(_base2 * 0.39));
  var rowGap2     = 4;
  var labelAbove2 = gaugeLblH2 + 2;

  // Vertical flow: innerPadY → name → rowGap → labelAbove → gauge → innerPadY
  var nameY2  = innerPadY;
  var hpLblY2 = nameY2 + nameFs2 + rowGap2;
  var hpY2    = hpLblY2 + labelAbove2;

  var faceSize2   = hpY2 + gaugeH2 + innerPadY;
  var faceX2      = innerPadX;
  var faceY2      = innerPadY;
  var faceOffset2 = faceX2 + faceSize2 + 10;
  var contentW2   = w - faceOffset2 - innerPadX;

  var bitmap = ImageManager.loadFace(comp.faceName());
  if (!bitmap.isReady()) {
    var self = this;
    bitmap.addLoadListener(function () { self.refresh(); });
  } else {
    var faceIndex = comp.faceIndex();
    var sw = Window_Base._faceWidth;
    var sh = Window_Base._faceHeight;
    var sx = (faceIndex % 4) * sw;
    var sy = Math.floor(faceIndex / 4) * sh;
    this.contents.blt(bitmap, sx, sy, sw, sh, faceX2, faceY2, faceSize2, faceSize2);
  }

  // Name
  this.contents.fontSize = nameFs2;
  this.changeTextColor(this.hpColor(comp));
  this.drawText(comp.name(), faceOffset2, nameY2, contentW2 - 52, "left");

  // "Kasama" label — right-aligned on the name row
  this.changeTextColor(this.systemColor());
  this.contents.fontSize = gaugeLblH2;
  this.drawText("Kasama", faceOffset2 + contentW2 - 54, nameY2 + 2, 54, "right");

  // HP gauge
  this.drawCustomHudBar(
    faceOffset2, hpY2, contentW2, gaugeH2,
    comp.hp, comp.mhp,
    this.textColor(20), this.textColor(21), TextManager.hpA
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
