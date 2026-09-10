/*:
 * @target MV MZ
 * @plugindesc [v1.0.0] Virtual gamepad for RPG Maker MV/MZ
 * @author KaguraRPG
 * @url https://kagurarpg.com/
 *
 * @param controlType
 * @text Control Type
 * @type select
 * @option Joystick
 * @option DPad
 * @default Joystick
 * @desc Movement control style. Joystick = analog stick, DPad = 4 arrow buttons.
 *
 * @param deadZone
 * @text Dead Zone
 * @type number
 * @min 5
 * @max 50
 * @default 15
 * @desc Minimum joystick distance (px) before input registers. Joystick only.
 *
 * @param joystickRange
 * @text Joystick Range
 * @type number
 * @min 30
 * @max 120
 * @default 60
 * @desc Maximum knob travel distance from center (px). Joystick only.
 *
 * @param joystickActivationRadius
 * @text Joystick Activation Radius
 * @type number
 * @min 60
 * @max 200
 * @default 120
 * @desc Touch radius around joystick center that activates it (px). Joystick only.
 *
 * @param buttonHitRadius
 * @text Button Hit Radius
 * @type number
 * @min 25
 * @max 80
 * @default 44
 * @desc Touch hit area radius for all buttons (px).
 *
 * @param opacity
 * @text Opacity
 * @type number
 * @min 10
 * @max 100
 * @default 100
 * @desc Maximum opacity when visible (10-100%).
 *
 * @param fadeSpeed
 * @text Fade Speed
 * @type number
 * @min 1
 * @max 20
 * @default 10
 * @desc Fade in/out speed per frame (1 = slow, 20 = instant).
 *
 * @param margin
 * @text Edge Margin
 * @type number
 * @min 20
 * @max 200
 * @default 80
 * @desc Distance from screen edges for joystick/button placement (px).
 *
 * @param hideOnEvent
 * @text Hide During Events
 * @type boolean
 * @default true
 * @desc Auto-hide gamepad during events and messages. Turn off to control manually.
 *
 * @param disableTapToMove
 * @text Disable Tap-to-Move
 * @type boolean
 * @default true
 * @desc Suppress RPG Maker's default tap-on-map-to-walk when controls are active.
 *
 * @param vibration
 * @text Vibration
 * @type boolean
 * @default true
 * @desc Vibrate the device on button press (requires device support).
 *
 * @param vibrationDuration
 * @text Vibration Duration
 * @type number
 * @min 5
 * @max 200
 * @default 30
 * @desc Vibration pulse length in milliseconds.
 *
 * @param showOnDesktop
 * @text Show On Desktop
 * @type boolean
 * @default false
 * @desc Show the gamepad on desktop/mouse devices (for testing).
 *
 * @command show
 * @text Show Gamepad
 * @desc Make the gamepad visible.
 *
 * @command hide
 * @text Hide Gamepad
 * @desc Hide the gamepad.
 *
 * @command enable
 * @text Enable Gamepad
 * @desc Enable gamepad input processing.
 *
 * @command disable
 * @text Disable Gamepad
 * @desc Disable gamepad input (dims the gamepad).
 *
 * @help
 * ===========================================================================
 *  KK_VirtualGamepad - by KaguraRPG
 * ===========================================================================
 *
 *  Adds a virtual gamepad overlay for mobile/touch devices:
 *
 *    - Analog joystick and DPad choices
 *    - A (confirm) and B (cancel) action buttons
 *    - Full multi-touch support (move + press simultaneously)
 *    - Haptic vibration feedback on button press
 *    - Smooth fade transitions based on scene context
 *    - Optional Auto-hide during events, messages, and non-map scenes
 *    - Optional tap-to-move suppression
 *    - Plugin commands for dynamic UI control
 *
 * ===========================================================================
 *  Plugin Commands (MZ)
 * ===========================================================================
 *
 *  Show Gamepad    - Make the gamepad visible
 *  Hide Gamepad    - Hide the gamepad
 *  Enable Gamepad  - Enable input processing
 *  Disable Gamepad - Disable input (dims gamepad)
 *
 * ===========================================================================
 *  Script Calls (MV)
 * ===========================================================================
 *
 *  KK_VirtualGamepad.show()
 *  KK_VirtualGamepad.hide()
 *  KK_VirtualGamepad.enable()
 *  KK_VirtualGamepad.disable()
 *  KK_VirtualGamepad.isVisible()
 *  KK_VirtualGamepad.isEnabled()
 *
 * ===========================================================================
 *  Terms of Use
 * ===========================================================================
 *
 *  Free for use in commercial and non-commercial RPG Maker MV/MZ projects.
 *  Feel free to credit KaguraRPG in your game credits if you'd like.
 *  Do not redistribute or claim as your own work.
 *
 */

(() => {
	"use strict";

	const PLUGIN_NAME = "KK_VirtualGamepad";
	const params = PluginManager.parameters(PLUGIN_NAME);
	const CFG = {
		controlType: params["controlType"] || "Joystick",
		deadZone: Number(params["deadZone"]) || 15,
		joystickRange: Number(params["joystickRange"]) || 60,
		joystickActivationRadius: Number(params["joystickActivationRadius"]) || 120,
		buttonHitRadius: Number(params["buttonHitRadius"]) || 44,
		opacity: (Number(params["opacity"]) || 100) / 100,
		fadeSpeed: (Number(params["fadeSpeed"]) || 10) / 100,
		margin: Number(params["margin"]) || 80,
		hideOnEvent: params["hideOnEvent"] !== "false",
		disableTapToMove: params["disableTapToMove"] !== "false",
		vibration: params["vibration"] !== "false",
		vibrationDuration: Number(params["vibrationDuration"]) || 30,
		showOnDesktop: params["showOnDesktop"] === "true",
	};

	//=========================================================================
	// Adaptive resolution — fills the full screen on any aspect ratio.
	//
	// Instead of letterboxing (Math.min scale), we resize the game's logical
	// canvas to exactly match the screen's aspect ratio at the configured
	// base resolution. This shows more map content on wide screens rather
	// than cropping or leaving black bars.
	//
	// The base height is kept from YEP_CoreEngine (720px). Width is derived
	// from the actual screen aspect ratio so it fills edge-to-edge on any
	// device — 16:9, 19.5:9, 4:3, etc.
	//
	// NOTE: Graphics.initialize() resets _stretchEnabled via _defaultStretchMode()
	// which returns false on desktop browsers. We override _defaultStretchMode
	// so stretch stays enabled after initialize().
	//=========================================================================
	var _KK_BASE_HEIGHT = SceneManager._screenHeight || 720;

	// Override _defaultStretchMode so Graphics.initialize() doesn't reset stretch.
	Graphics._defaultStretchMode = function () { return true; };
	Graphics._stretchEnabled = true;

	// Adapt the game's logical resolution to match screen aspect ratio,
	// then scale 1:1 (realScale = 1 since canvas fills exactly).
	Graphics._updateRealScale = function () {
		if (this._stretchEnabled) {
			// Use the taller of SceneManager height or _KK_BASE_HEIGHT,
			// resolved lazily so YEP_CoreEngine's 720 is picked up correctly.
			var baseH = Math.max(SceneManager._screenHeight || 720, _KK_BASE_HEIGHT);
			// Compute what the logical width should be for this screen's aspect ratio
			var targetW = Math.round(baseH * window.innerWidth / window.innerHeight);
			var targetH = baseH;

			// Only resize if changed (avoid redundant renderer rebuilds)
			if (this._width !== targetW || this._height !== targetH) {
				this._width    = targetW;
				this._height   = targetH;
				this._boxWidth  = targetW;
				this._boxHeight = targetH;
				// Keep SceneManager in sync
				SceneManager._screenWidth  = targetW;
				SceneManager._screenHeight = targetH;
				SceneManager._boxWidth     = targetW;
				SceneManager._boxHeight    = targetH;
				// Rebuild renderer at new size if it already exists
				if (this._renderer) {
					this._renderer.resize(targetW, targetH);
				}
			}
			// Canvas CSS fills the viewport exactly
			this._realScale = window.innerHeight / this._height;
		} else {
			this._realScale = this._scale;
		}
		if (this._canvas) this._updateCanvas();
	};

	var _activeGamepad = null;
	var _persistHide = false;
	var _persistDisabled = false;

	function pageToGame(pageX, pageY) {
		var canvas = Graphics._canvas;
		if (!canvas) return null;
		var r = canvas.getBoundingClientRect();
		if (r.width === 0 || r.height === 0) return null;
		return {
			x: (pageX - r.left) * (Graphics.width / r.width),
			y: (pageY - r.top) * (Graphics.height / r.height),
		};
	}

	// ── Device detection ────────────────────────────────────────────────────────
	// Three-signal detection covers phones, tablets, and iPadOS 13+.
	// A fourth signal — actual touchstart event — is used as a runtime fallback:
	// if any touch fires, the device is definitely touch-capable regardless of UA.
	function _isTouchDevice() {
		var ua = navigator.userAgent || '';

		// Explicit mobile/tablet UA keywords
		if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua)) {
			return true;
		}

		// iPadOS 13+ identifies as "Macintosh" in UA but has touch points
		if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) {
			return true;
		}

		// Generic touch-capable browser (Windows tablets, etc.)
		if (navigator.maxTouchPoints > 1) {
			return true;
		}

		// Pointer coarse = touch screen (CSS media query equivalent)
		if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
			return true;
		}

		return false;
	}

	var _deviceIsTouchCache = null;
	function isTouchDevice() {
		// Never cache — re-evaluate every call so the touchstart fallback
		// takes effect on the very next frame after the first touch fires.
		if (_deviceIsTouchCache === true) return true;
		_deviceIsTouchCache = _isTouchDevice();
		return _deviceIsTouchCache;
	}

	// Runtime fallback: first real touch permanently marks this as a touch device.
	document.addEventListener('touchstart', function _onFirstTouch() {
		_deviceIsTouchCache = true;
		console.log('[KK_VirtualGamepad] touchstart fired — device marked as touch');
		document.removeEventListener('touchstart', _onFirstTouch);
	}, { passive: true, once: true });

	// Diagnostic: log detection results once at startup
	(function() {
		var ua = navigator.userAgent || '';
		var mtp = navigator.maxTouchPoints;
		var coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : 'N/A';
		console.log('[KK_VirtualGamepad] UA:', ua);
		console.log('[KK_VirtualGamepad] maxTouchPoints:', mtp);
		console.log('[KK_VirtualGamepad] pointer:coarse:', coarse);
		console.log('[KK_VirtualGamepad] isTouchDevice():', _isTouchDevice());
	})();

	function vibrate() {
		if (CFG.vibration && navigator.vibrate) {
			try {
				navigator.vibrate(CFG.vibrationDuration);
			} catch (e) {}
		}
	}

	function apiShow() {
		_persistHide = false;
		if (_activeGamepad) _activeGamepad._manualHide = false;
	}

	function apiHide() {
		_persistHide = true;
		if (_activeGamepad) _activeGamepad._manualHide = true;
	}

	function apiEnable() {
		_persistDisabled = false;
		if (_activeGamepad) _activeGamepad._disabled = false;
	}

	function apiDisable() {
		_persistDisabled = true;
		if (_activeGamepad) {
			_activeGamepad._disabled = true;
			_activeGamepad._forceResetAll();
		}
	}

	function KKGamepad() {
		this.initialize.apply(this, arguments);
	}

	KKGamepad.prototype = Object.create(PIXI.Container.prototype);
	KKGamepad.prototype.constructor = KKGamepad;

	KKGamepad._textureFrom = PIXI.Texture.from
		? function (canvas) {
				return PIXI.Texture.from(canvas);
			}
		: function (canvas) {
				return PIXI.Texture.fromCanvas(canvas);
			};

	KKGamepad._fontFamily =
		typeof Utils !== "undefined" && Utils.RPGMAKER_NAME === "MZ" ? "rmmz-mainfont, sans-serif" : "GameFont, sans-serif";

	KKGamepad.prototype.initialize = function () {
		PIXI.Container.call(this);
		this._targetOpacity = 0;
		this._manualHide = _persistHide;
		this._disabled = _persistDisabled;
		this._joystickBase = null;
		this._joystickKnob = null;
		this._joystickHalo = null;
		this._buttons = {};
		this._dpadButtons = {};
		this._textures = {};

		this._joystickTouchId = -1;
		this._joystickDelta = { x: 0, y: 0 };
		this._buttonTouchIds = {};
		this._boundHandlers = {};

		this.z = 1000;
		// Start fully visible if on a touch device — don't wait for fade-in
		this.alpha = (CFG.showOnDesktop || isTouchDevice()) ? CFG.opacity : 0;
		this.visible = this.alpha > 0;

		this._initTextures();
		this._createElements();
		this._setupTouchListeners();
	};

	KKGamepad.prototype._initTextures = function () {
		var haloCanvas = document.createElement("canvas");
		haloCanvas.width = 160;
		haloCanvas.height = 160;
		var hCtx = haloCanvas.getContext("2d");
		var hGrad = hCtx.createRadialGradient(80, 80, 0, 80, 80, 80);
		hGrad.addColorStop(0, "rgba(255, 255, 255, 0.15)");
		hGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.05)");
		hGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
		hCtx.fillStyle = hGrad;
		hCtx.fillRect(0, 0, 160, 160);
		this._textures.halo = KKGamepad._textureFrom(haloCanvas);

		var capCanvas = document.createElement("canvas");
		capCanvas.width = 80;
		capCanvas.height = 80;
		var cCtx = capCanvas.getContext("2d");
		var cGrad = cCtx.createLinearGradient(0, 0, 0, 80);
		cGrad.addColorStop(0, "#32323a");
		cGrad.addColorStop(1, "#1e1e24");
		cCtx.fillStyle = cGrad;
		cCtx.beginPath();
		cCtx.arc(40, 40, 40, 0, Math.PI * 2);
		cCtx.fill();
		this._textures.cap = KKGamepad._textureFrom(capCanvas);

		var kCanvas = document.createElement("canvas");
		kCanvas.width = 60;
		kCanvas.height = 60;
		var kCtx = kCanvas.getContext("2d");
		var kGrad = kCtx.createLinearGradient(0, 0, 30, 60);
		kGrad.addColorStop(0, "#4a4a54");
		kGrad.addColorStop(0.5, "#2a2a32");
		kGrad.addColorStop(1, "#1a1a20");
		kCtx.fillStyle = kGrad;
		kCtx.beginPath();
		kCtx.arc(30, 30, 30, 0, Math.PI * 2);
		kCtx.fill();
		kCtx.lineWidth = 2;
		kCtx.strokeStyle = "rgba(255,255,255,0.1)";
		kCtx.stroke();
		this._textures.knob = KKGamepad._textureFrom(kCanvas);

		var RS = 2;

		var bhCanvas = document.createElement("canvas");
		bhCanvas.width = 80 * RS; bhCanvas.height = 80 * RS;
		var bhCtx = bhCanvas.getContext("2d");
		bhCtx.scale(RS, RS);
		bhCtx.fillStyle = "rgba(0,0,0,0.3)";
		bhCtx.beginPath(); bhCtx.arc(42, 42, 38, 0, Math.PI * 2); bhCtx.fill();
		bhCtx.fillStyle = "rgba(8,8,10,0.8)";
		bhCtx.beginPath(); bhCtx.arc(40, 40, 36, 0, Math.PI * 2); bhCtx.fill();
		bhCtx.strokeStyle = "rgba(255,255,255,0.1)"; bhCtx.lineWidth = 1; bhCtx.stroke();
		this._textures.buttonHousing = KKGamepad._textureFrom(bhCanvas);

		var dhCanvas = document.createElement("canvas");
		dhCanvas.width = 72 * RS; dhCanvas.height = 72 * RS;
		var dhCtx = dhCanvas.getContext("2d");
		dhCtx.scale(RS, RS);
		dhCtx.fillStyle = "rgba(0,0,0,0.3)";
		dhCtx.beginPath(); dhCtx.arc(38, 38, 34, 0, Math.PI * 2); dhCtx.fill();
		dhCtx.fillStyle = "rgba(8,8,10,0.8)";
		dhCtx.beginPath(); dhCtx.arc(36, 36, 32, 0, Math.PI * 2); dhCtx.fill();
		dhCtx.strokeStyle = "rgba(255,255,255,0.1)"; dhCtx.lineWidth = 1; dhCtx.stroke();
		this._textures.dpadHousing = KKGamepad._textureFrom(dhCanvas);

		var jbCanvas = document.createElement("canvas");
		jbCanvas.width = 150 * RS; jbCanvas.height = 150 * RS;
		var jbCtx = jbCanvas.getContext("2d");
		jbCtx.scale(RS, RS);
		jbCtx.fillStyle = "rgba(0,0,0,0.25)";
		jbCtx.beginPath(); jbCtx.arc(75, 75, 72, 0, Math.PI * 2); jbCtx.fill();
		jbCtx.fillStyle = "rgba(8,8,10,0.9)";
		jbCtx.beginPath(); jbCtx.arc(75, 75, 65, 0, Math.PI * 2); jbCtx.fill();
		jbCtx.strokeStyle = "rgba(255,255,255,0.08)"; jbCtx.lineWidth = 2; jbCtx.stroke();
		jbCtx.fillStyle = "rgba(0,0,0,0.4)";
		jbCtx.beginPath(); jbCtx.arc(75, 75, 30, 0, Math.PI * 2); jbCtx.fill();
		this._textures.joystickBase = KKGamepad._textureFrom(jbCanvas);

		var ksCanvas = document.createElement("canvas");
		ksCanvas.width = 64 * RS; ksCanvas.height = 64 * RS;
		var ksCtx = ksCanvas.getContext("2d");
		ksCtx.scale(RS, RS);
		ksCtx.fillStyle = "rgba(0,0,0,0.5)";
		ksCtx.beginPath(); ksCtx.arc(35, 36, 30, 0, Math.PI * 2); ksCtx.fill();
		this._textures.knobShadow = KKGamepad._textureFrom(ksCanvas);
	};

	KKGamepad.prototype._createElements = function () {
		var m = CFG.margin;

		if (CFG.controlType === "DPad") {
			this._createDpad(m);
		} else {
			this._createJoystick(m);
		}

		var bx = Graphics.width - m - 40;
		var by = Graphics.height - m - 40;
		this._createButton("ok", bx + 30, by - 60, "A");
		this._createButton("cancel", bx - 40, by, "B");
	};

	KKGamepad.prototype._createJoystick = function (m) {
		this._joystickBase = new PIXI.Container();

		var baseSprite = new PIXI.Sprite(this._textures.joystickBase || PIXI.Texture.EMPTY);
		baseSprite.anchor.set(0.5);
		baseSprite.width = 150;
		baseSprite.height = 150;
		this._joystickBase.addChild(baseSprite);

		this._joystickHalo = new PIXI.Sprite(this._textures.halo || PIXI.Texture.EMPTY);
		this._joystickHalo.anchor.set(0.5);
		this._joystickHalo.alpha = 0;
		this._joystickBase.addChild(this._joystickHalo);

		this._joystickBase.x = m + 40;
		this._joystickBase.y = Graphics.height - m - 40;
		this.addChild(this._joystickBase);

		this._joystickKnob = new PIXI.Container();

		var knobShadow = new PIXI.Sprite(this._textures.knobShadow || PIXI.Texture.EMPTY);
		knobShadow.anchor.set(0.5);
		knobShadow.width = 64;
		knobShadow.height = 64;
		this._joystickKnob.addChild(knobShadow);

		var knobSprite = new PIXI.Sprite(this._textures.knob || PIXI.Texture.EMPTY);
		knobSprite.anchor.set(0.5);
		knobSprite.width = 60;
		knobSprite.height = 60;
		this._joystickKnob.addChild(knobSprite);

		this._joystickKnob.x = this._joystickBase.x;
		this._joystickKnob.y = this._joystickBase.y;
		this.addChild(this._joystickKnob);
	};

	KKGamepad.prototype._createDpad = function (m) {
		var cx = m + 55;
		var cy = Graphics.height - m - 55;
		var offset = 48;

		this._createDpadButton("up", cx, cy - offset, 0);
		this._createDpadButton("down", cx, cy + offset, Math.PI);
		this._createDpadButton("left", cx - offset, cy, -Math.PI / 2);
		this._createDpadButton("right", cx + offset, cy, Math.PI / 2);
	};

	KKGamepad.prototype._createDpadButton = function (dir, x, y, rotation) {
		var btn = new PIXI.Container();

		var housing = new PIXI.Sprite(this._textures.dpadHousing || PIXI.Texture.EMPTY);
		housing.anchor.set(0.5);
		housing.width = 72;
		housing.height = 72;
		btn.addChild(housing);

		var cap = new PIXI.Sprite(this._textures.cap || PIXI.Texture.EMPTY);
		cap.anchor.set(0.5);
		cap.scale.set(0.7);
		btn.addChild(cap);

		var arrow = new PIXI.Graphics();
		arrow.beginFill(0xffffff, 0.9);
		arrow.moveTo(0, -10);
		arrow.lineTo(7, 4);
		arrow.lineTo(-7, 4);
		arrow.closePath();
		arrow.endFill();
		arrow.rotation = rotation;
		btn.addChild(arrow);

		btn.x = x;
		btn.y = y;
		this.addChild(btn);

		this._dpadButtons[dir] = {
			container: btn,
			cap: cap,
			pressed: false,
			inputName: dir,
		};
	};

	KKGamepad.prototype._createButton = function (name, x, y, label) {
		var btn = new PIXI.Container();

		var housing = new PIXI.Sprite(this._textures.buttonHousing || PIXI.Texture.EMPTY);
		housing.anchor.set(0.5);
		housing.width = 80;
		housing.height = 80;
		btn.addChild(housing);

		var cap = new PIXI.Sprite(this._textures.cap || PIXI.Texture.EMPTY);
		cap.anchor.set(0.5);
		cap.scale.set(0.8);
		btn.addChild(cap);

		if (label) {
			var text = new PIXI.Text(label, {
				fontFamily: KKGamepad._fontFamily,
				fontSize: 26,
				fontWeight: "bold",
				fill: 0xffffff,
				dropShadow: true,
				dropShadowDistance: 1,
				dropShadowAlpha: 0.5,
				padding: 4,
			});
			text.anchor.set(0.5);
			btn.addChild(text);
		}

		btn.x = x;
		btn.y = y;
		this.addChild(btn);
		this._buttons[name] = {
			container: btn,
			cap: cap,
			pressed: false,
		};
	};

	KKGamepad.prototype._setupTouchListeners = function () {
		this._boundHandlers.start = this._onTouchStart.bind(this);
		this._boundHandlers.move = this._onTouchMove.bind(this);
		this._boundHandlers.end = this._onTouchEnd.bind(this);

		document.addEventListener("pointerdown", this._boundHandlers.start, { passive: false });
		document.addEventListener("pointermove", this._boundHandlers.move, { passive: false });
		document.addEventListener("pointerup", this._boundHandlers.end, { passive: false });
		document.addEventListener("pointercancel", this._boundHandlers.end, { passive: false });
	};

	KKGamepad.prototype._removeTouchListeners = function () {
		document.removeEventListener("pointerdown", this._boundHandlers.start);
		document.removeEventListener("pointermove", this._boundHandlers.move);
		document.removeEventListener("pointerup", this._boundHandlers.end);
		document.removeEventListener("pointercancel", this._boundHandlers.end);
	};

	KKGamepad.prototype._onTouchStart = function (e) {
		if (this._disabled) return;
		// Allow the touch through even if fading in — this lets the touchstart
		// fallback fire and isTouchDevice() flip to true on the very first touch.
		var pt = pageToGame(e.pageX, e.pageY);
		if (!pt) return;
		if (!this.visible || this.alpha < 0.1) return; // no input when hidden
		// Adjust for container Y offset (used when sliding up during messages)
		var lpt = { x: pt.x, y: pt.y - this.y };
		if (this._tryClaimJoystick(e.pointerId, lpt)) { e.preventDefault(); return; }
		if (this._tryClaimDpad(e.pointerId, lpt)) { e.preventDefault(); return; }
		if (this._tryClaimButton(e.pointerId, lpt)) { e.preventDefault(); return; }
	};

	KKGamepad.prototype._onTouchMove = function (e) {
		if (!this.visible || this.alpha < 0.1 || this._disabled) return;
		if (e.pointerId === this._joystickTouchId) {
			var pt = pageToGame(e.pageX, e.pageY);
			if (pt) this._updateJoystickFromTouch({ x: pt.x, y: pt.y - this.y });
			e.preventDefault();
			return;
		}
		if (CFG.controlType === "DPad") {
			var pt2 = pageToGame(e.pageX, e.pageY);
			if (!pt2) return;
			var lpt2 = { x: pt2.x, y: pt2.y - this.y };
			for (var dir in this._dpadButtons) {
				var dbtn = this._dpadButtons[dir];
				if (dbtn._touchId !== e.pointerId) continue;
				var dx = lpt2.x - dbtn.container.x;
				var dy = lpt2.y - dbtn.container.y;
				if (Math.sqrt(dx * dx + dy * dy) > CFG.buttonHitRadius) {
					this._releaseDpadButton(dir);
					this._tryClaimDpad(e.pointerId, lpt2);
				}
				return;
			}
		}
	};

	KKGamepad.prototype._onTouchEnd = function (e) {
		var id = e.pointerId;
		if (id === this._joystickTouchId) this._releaseJoystick();
		for (var name in this._buttonTouchIds) {
			if (this._buttonTouchIds[name] === id) this._releaseButton(name);
		}
		for (var dir in this._dpadButtons) {
			if (this._dpadButtons[dir]._touchId === id) this._releaseDpadButton(dir);
		}
	};

	KKGamepad.prototype._tryClaimJoystick = function (touchId, pt) {
		if (CFG.controlType === "DPad") return false;
		if (this._joystickTouchId !== -1) return false;
		var dx = pt.x - this._joystickBase.x;
		var dy = pt.y - this._joystickBase.y;
		if (Math.sqrt(dx * dx + dy * dy) > CFG.joystickActivationRadius) return false;
		this._joystickTouchId = touchId;
		this._updateJoystickFromTouch(pt);
		return true;
	};

	KKGamepad.prototype._updateJoystickFromTouch = function (pt) {
		var dx = pt.x - this._joystickBase.x;
		var dy = pt.y - this._joystickBase.y;
		var dist = Math.sqrt(dx * dx + dy * dy);
		var angle = Math.atan2(dy, dx);
		var clampedDist = Math.min(dist, CFG.joystickRange);

		this._joystickKnob.x = this._joystickBase.x + Math.cos(angle) * clampedDist;
		this._joystickKnob.y = this._joystickBase.y + Math.sin(angle) * clampedDist;

		var t = clampedDist / CFG.joystickRange;
		this._joystickHalo.alpha = t * 0.8;
		this._joystickHalo.scale.set(1.0 + t * 0.2);

		this._joystickDelta.x = dx;
		this._joystickDelta.y = dy;

		if (dist > CFG.deadZone) {
			var deg = angle * (180 / Math.PI);
			Input._currentState["right"] = deg >= -67.5 && deg <= 67.5;
			Input._currentState["left"] = deg >= 112.5 || deg <= -112.5;
			Input._currentState["down"] = deg >= 22.5 && deg <= 157.5;
			Input._currentState["up"] = deg >= -157.5 && deg <= -22.5;
		} else {
			this._resetMoveInput();
		}
	};

	KKGamepad.prototype._releaseJoystick = function () {
		this._joystickTouchId = -1;
		this._joystickDelta.x = 0;
		this._joystickDelta.y = 0;
		if (this._joystickKnob && this._joystickBase) {
			this._joystickKnob.x = this._joystickBase.x;
			this._joystickKnob.y = this._joystickBase.y;
		}
		if (this._joystickHalo) {
			this._joystickHalo.alpha = 0;
		}
		this._resetMoveInput();
	};

	KKGamepad.prototype._tryClaimDpad = function (touchId, pt) {
		if (CFG.controlType !== "DPad") return false;
		for (var dir in this._dpadButtons) {
			var dbtn = this._dpadButtons[dir];
			if (dbtn._touchId !== undefined) continue;
			var dx = pt.x - dbtn.container.x;
			var dy = pt.y - dbtn.container.y;
			if (Math.sqrt(dx * dx + dy * dy) > CFG.buttonHitRadius) continue;
			dbtn._touchId = touchId;
			dbtn.pressed = true;
			Input._currentState[dir] = true;
			dbtn.cap.scale.set(0.63);
			dbtn.cap.alpha = 0.7;
			vibrate();
			return true;
		}
		return false;
	};

	KKGamepad.prototype._releaseDpadButton = function (dir) {
		var dbtn = this._dpadButtons[dir];
		if (!dbtn) return;
		delete dbtn._touchId;
		dbtn.pressed = false;
		Input._currentState[dir] = false;
		dbtn.cap.scale.set(0.7);
		dbtn.cap.alpha = 1.0;
	};

	KKGamepad.prototype._tryClaimButton = function (touchId, pt) {
		for (var name in this._buttons) {
			if (this._buttonTouchIds[name] !== undefined) continue;
			var btn = this._buttons[name];
			var dx = pt.x - btn.container.x;
			var dy = pt.y - btn.container.y;
			if (Math.sqrt(dx * dx + dy * dy) > CFG.buttonHitRadius) continue;
			this._buttonTouchIds[name] = touchId;
			btn.pressed = true;
			Input._currentState[name] = true;
			btn.cap.scale.set(0.72);
			btn.cap.alpha = 0.7;
			vibrate();
			return true;
		}
		return false;
	};

	KKGamepad.prototype._releaseButton = function (name) {
		delete this._buttonTouchIds[name];
		var btn = this._buttons[name];
		if (!btn) return;
		btn.pressed = false;
		Input._currentState[name] = false;
		btn.cap.scale.set(0.8);
		btn.cap.alpha = 1.0;
	};

	KKGamepad.prototype._resetMoveInput = function () {
		Input._currentState["up"] = false;
		Input._currentState["down"] = false;
		Input._currentState["left"] = false;
		Input._currentState["right"] = false;
	};

	KKGamepad.prototype._forceResetAll = function () {
		if (this._joystickTouchId !== -1) this._releaseJoystick();
		for (var name in this._buttons) {
			if (this._buttonTouchIds[name] !== undefined) {
				this._releaseButton(name);
			}
		}
		for (var dir in this._dpadButtons) {
			if (this._dpadButtons[dir]._touchId !== undefined) {
				this._releaseDpadButton(dir);
			}
		}
	};

	KKGamepad.prototype.update = function () {
		this._updateVisibility();
	};

	KKGamepad.prototype._updateVisibility = function () {
		var showOnDevice = CFG.showOnDesktop || isTouchDevice();
		var msgBusy = $gameMessage && $gameMessage.isBusy();

		if (this._manualHide || !showOnDevice) {
			this._targetOpacity = 0;
		} else if (this._disabled) {
			this._targetOpacity = CFG.opacity * 0.4;
		} else {
			this._targetOpacity = CFG.opacity;
		}

		if (this._targetOpacity === 0 && this.alpha > 0) {
			this._forceResetAll();
		}

		if (this.alpha < this._targetOpacity) {
			this.alpha = Math.min(this.alpha + CFG.fadeSpeed, this._targetOpacity);
		} else if (this.alpha > this._targetOpacity) {
			this.alpha = Math.max(this.alpha - CFG.fadeSpeed, this._targetOpacity);
		}

		this.visible = this.alpha > 0;

		// Slide the whole gamepad up when a message/choice window is open so
		// it doesn't cover the text — but stays fully functional for choices.
		var MSG_WIN_H  = 168; // RPG Maker MV default message window height
		var targetY    = msgBusy ? -(MSG_WIN_H + 8) : 0;
		if (this.y !== targetY) {
			var step = 12;
			if (Math.abs(this.y - targetY) <= step) {
				this.y = targetY;
			} else {
				this.y += (targetY > this.y ? step : -step);
			}
		}
	};

	KKGamepad.prototype.isPressed = function () {
		if (!this.visible || this.alpha < 0.5 || this._disabled) return false;
		if (this._joystickTouchId !== -1) return true;
		if (Object.keys(this._buttonTouchIds).length > 0) return true;
		for (var dir in this._dpadButtons) {
			if (this._dpadButtons[dir]._touchId !== undefined) return true;
		}
		return false;
	};

	KKGamepad.prototype.destroy = function (options) {
		this._removeTouchListeners();
		this._forceResetAll();
		if (this._textures) {
			for (var key in this._textures) {
				if (this._textures[key]) this._textures[key].destroy(true);
			}
			this._textures = null;
		}
		_activeGamepad = null;
		PIXI.Container.prototype.destroy.call(this, options);
	};

	window.KK_VirtualGamepad = {
		show: apiShow,
		hide: apiHide,
		enable: apiEnable,
		disable: apiDisable,
		isVisible: function () {
			return _activeGamepad ? _activeGamepad.visible : false;
		},
		isEnabled: function () {
			return _activeGamepad ? !_activeGamepad._disabled : false;
		},
		isTouchDevice: isTouchDevice,
	};

	if (PluginManager.registerCommand) {
		PluginManager.registerCommand(PLUGIN_NAME, "show", apiShow);
		PluginManager.registerCommand(PLUGIN_NAME, "hide", apiHide);
		PluginManager.registerCommand(PLUGIN_NAME, "enable", apiEnable);
		PluginManager.registerCommand(PLUGIN_NAME, "disable", apiDisable);
	}

	// ── Global gamepad — lives on the PIXI stage across ALL scenes ──────────────
	// One KKGamepad instance re-parented to each new scene so it renders on top.
	// Shows on title, menus, in-game menus, text input — everywhere.

	// Hook Scene_Base.create — fires for every scene.
	// Hook Scene_Base.start — runs after create() and after all scene children
	// have been added, so addChild here puts the gamepad truly on top.
	var _Scene_Base_start = Scene_Base.prototype.start;
	Scene_Base.prototype.start = function () {
		_Scene_Base_start.call(this);
		if (!_activeGamepad) {
			_activeGamepad = new KKGamepad();
		}
		// addChild appends to end = highest draw order = on top of everything.
		this.addChild(_activeGamepad);
		_activeGamepad._manualHide = _persistHide;
		_activeGamepad._disabled   = _persistDisabled;
	};

	var _Scene_Base_create = Scene_Base.prototype.create;
	Scene_Base.prototype.create = function () {
		_Scene_Base_create.call(this);
	};

	// Update every scene.
	var _Scene_Base_update = Scene_Base.prototype.update;
	Scene_Base.prototype.update = function () {
		_Scene_Base_update.call(this);
		if (_activeGamepad) {
			_activeGamepad.update();
		}
	};

	// Tap-to-move suppression (map only).
	if (CFG.disableTapToMove) {
		var _Scene_Map_processMapTouch = Scene_Map.prototype.processMapTouch;
		Scene_Map.prototype.processMapTouch = function () {
			if (_activeGamepad && _activeGamepad.visible && !_activeGamepad._disabled) {
				return;
			}
			_Scene_Map_processMapTouch.call(this);
		};
	}

	//=========================================================================
	// WASD navigation
	// W/A/S/D map to up/left/down/right, replacing their old bindings.
	// Q and W previously mapped to pageup/pagedown — those are moved to
	// Page Up / Page Down keys which already exist in the keyMapper.
	// Arrow keys continue to work alongside WASD.
	//=========================================================================
	Input.keyMapper[87] = 'up';     // W  (was pagedown)
	Input.keyMapper[65] = 'left';   // A
	Input.keyMapper[83] = 'down';   // S
	Input.keyMapper[68] = 'right';  // D
	// Remap pageup/pagedown to Q/E since W is taken
	Input.keyMapper[81] = 'pageup'; // Q  (unchanged — was already pageup)
	Input.keyMapper[69] = 'pagedown'; // E  (replaces W for pagedown)

	//=========================================================================
	// Name input fixes
	//
	// 1. Backspace (keycode 8) maps to a custom 'backspace' action so it
	//    triggers erase only in Window_NameInput, without making Backspace
	//    act as Escape/Cancel everywhere else in the game.
	//
	// 2. The on-screen keyboard has no Back/erase button — players on mobile
	//    have no way to delete a character. The rarely-used space slot
	//    (index 87 in the Latin tables) is replaced with a 'Back' button.
	//=========================================================================
	Input.keyMapper[8] = 'backspace'; // Backspace key — custom action name

	// Extend Window_NameInput.processHandling to fire processBack on Backspace.
	var _NameInput_processHandling = Window_NameInput.prototype.processHandling;
	Window_NameInput.prototype.processHandling = function () {
		_NameInput_processHandling.call(this);
		if (this.isOpen() && this.active) {
			if (Input.isRepeated('backspace')) {
				this.processBack();
			}
		}
	};

	// Replace the space character at index 87 with 'Back' in all Latin tables.
	// character() already returns '' for index >= 88; we make index 87 also
	// return '' so 'Back' is never added as a literal character.
	Window_NameInput.LATIN1[87] = 'Back';
	Window_NameInput.LATIN2[87] = 'Back';

	Window_NameInput.prototype.isBack = function () {
		return this._index === 87;
	};

	var _NameInput_processOk = Window_NameInput.prototype.processOk;
	Window_NameInput.prototype.processOk = function () {
		if (this.isBack()) {
			this.processBack();
		} else {
			_NameInput_processOk.call(this);
		}
	};

	var _NameInput_character = Window_NameInput.prototype.character;
	Window_NameInput.prototype.character = function () {
		if (this._index === 87) return ''; // Back button — not a character
		return _NameInput_character.call(this);
	};

})();
