/*:
 * @target MV MZ
 * @plugindesc [v1.0.0] Virtual gamepad for RPG Maker MV/MZ
 * @author Harleythetech
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
 * @param Debug Logging
 * @text Debug Logging
 * @type boolean
 * @on  Enable
 * @off Disable
 * @default false
 * @desc Log touch input events and gamepad state changes to the console.
 *       Requires RPGReloaded Master Debug to also be ON.
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

	const PLUGIN_NAME = "VirtualGamepad";
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
	// Adaptive resolution — two modes depending on device type:
	//
	// DESKTOP (no touch):
	//   Stretch ON  — canvas fills the full screen edge-to-edge on any
	//   aspect ratio.  The game's logical width is derived from the screen
	//   aspect ratio so no black bars appear and more map content is shown.
	//
	// MOBILE / TOUCH:
	//   Stretch OFF — the canvas keeps its configured aspect ratio (1280×720)
	//   and is letterboxed with black bars on the left and right sides.
	//   Those bars become the home for the virtual gamepad controls so they
	//   never overlap the game content.
	//
	// _defaultStretchMode() is called by Graphics.initialize() to set the
	// initial state, so we override it to apply the correct mode per device.
	//=========================================================================
	var _KK_BASE_HEIGHT = SceneManager._screenHeight || 720;

	Graphics._defaultStretchMode = function () {
		// Touch devices get letterbox bars; desktop gets full stretch.
		return !_isTouchDevice();
	};
	Graphics._stretchEnabled = Graphics._defaultStretchMode();

	// Adaptive _updateRealScale: only active in stretch mode (desktop).
	// In letterbox mode (mobile) the default MV behaviour (Math.min scale)
	// runs unchanged — we just skip our override.
	Graphics._updateRealScale = function () {
		if (this._stretchEnabled) {
			// Stretch mode: expand the game's logical width to match the
			// screen's aspect ratio so the canvas fills edge-to-edge.
			var baseH = Math.max(SceneManager._screenHeight || 720, _KK_BASE_HEIGHT);
			var targetW = Math.round(baseH * window.innerWidth / window.innerHeight);
			var targetH = baseH;

			if (this._width !== targetW || this._height !== targetH) {
				this._width     = targetW;
				this._height    = targetH;
				this._boxWidth  = targetW;
				this._boxHeight = targetH;
				SceneManager._screenWidth  = targetW;
				SceneManager._screenHeight = targetH;
				SceneManager._boxWidth     = targetW;
				SceneManager._boxHeight    = targetH;
				if (this._renderer) {
					this._renderer.resize(targetW, targetH);
				}
			}
			this._realScale = window.innerHeight / this._height;
		} else {
			// Letterbox mode: scale to fit height, keep aspect ratio.
			// MV's default uses Math.min(scaleX, scaleY) — replicate that.
			this._realScale = Math.min(
				window.innerWidth  / this._width,
				window.innerHeight / this._height
			);
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
	function _isTouchDevice() {
		var ua = navigator.userAgent || '';
		if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua)) return true;
		if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
		if (navigator.maxTouchPoints > 1) return true;
		if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
		return false;
	}

	var _deviceIsTouchCache = null;
	function isTouchDevice() {
		if (_deviceIsTouchCache === true) return true;
		_deviceIsTouchCache = _isTouchDevice();
		return _deviceIsTouchCache;
	}

	document.addEventListener('touchstart', function _onFirstTouch() {
		_deviceIsTouchCache = true;
		document.removeEventListener('touchstart', _onFirstTouch);
	}, { passive: true, once: true });

	(function() {
	})();

	function vibrate() {
		if (CFG.vibration && navigator.vibrate) {
			try { navigator.vibrate(CFG.vibrationDuration); } catch (e) {}
		}
	}

	function apiShow()    { _persistHide = false;     if (_activeGamepad) _activeGamepad.setVisible(true); }
	function apiHide()    { _persistHide = true;      if (_activeGamepad) _activeGamepad.setVisible(false); }
	function apiEnable()  { _persistDisabled = false; if (_activeGamepad) _activeGamepad.setDisabled(false); }
	function apiDisable() { _persistDisabled = true;  if (_activeGamepad) _activeGamepad.setDisabled(true); }

	//=========================================================================
	// KKGamepad — HTML canvas overlay
	//
	// Renders the GBA-style gamepad on a full-viewport <canvas> element that
	// sits on top of the RPG Maker canvas in the DOM.  Because it is a
	// separate DOM element it is never clipped by PIXI's renderer, so controls
	// drawn in the black side bars are always visible.
	//
	// Layout (letterbox / mobile):
	//
	//   ┌──────────┬─────────────────────┬──────────┐
	//   │          │                     │  [Menu]  │
	//   │  D-Pad / │   RPG Maker game    │          │
	//   │ Joystick │      canvas         │  [A] [B] │
	//   └──────────┴─────────────────────┴──────────┘
	//    left bar        game screen       right bar
	//
	// In stretch mode (desktop) there are no bars, so controls fall back to
	// corner positions overlaid on the game itself (same as original plugin).
	//=========================================================================
	function KKGamepad() {
		this._visible   = !_persistHide;
		this._disabled  = _persistDisabled;
		this._alpha     = (CFG.showOnDesktop || isTouchDevice()) ? CFG.opacity : 0;
		this._targetAlpha = this._alpha;

		// Input state
		this._joystickTouchId = -1;
		this._joystickDelta   = { x: 0, y: 0 };
		this._joystickKnobOff = { x: 0, y: 0 }; // knob offset from base (CSS px)
		this._buttonTouchIds  = {};               // name → pointerId
		this._dpadTouchIds    = {};               // dir  → pointerId

		// Positions in CSS viewport pixels (set by _layout())
		this._joystickBase = { x: 0, y: 0 };     // base centre
		this._btnPositions = {};                  // name → {x,y}
		this._dpadPositions = {};                 // dir  → {x,y}

		this._createOverlay();
		this._setupListeners();
		this._layout();
		this._boundResize = this._onResize.bind(this);
		window.addEventListener('resize', this._boundResize);

		// Kick off the draw loop
		this._rafId = null;
		this._scheduleRender();
	}

	// ── Overlay canvas ──────────────────────────────────────────────────────────
	KKGamepad.prototype._createOverlay = function () {
		var ov = document.createElement('canvas');
		ov.id = 'kk-gamepad-overlay';
		ov.style.cssText = [
			'position:fixed',
			'top:0', 'left:0',
			'width:100vw', 'height:100vh',
			'pointer-events:none',   // touch events handled by listeners below
			'z-index:9999',
			'image-rendering:pixelated',
		].join(';');
		document.body.appendChild(ov);
		this._overlay = ov;
		this._ctx     = ov.getContext('2d');
		this._resizeOverlay();
	};

	KKGamepad.prototype._resizeOverlay = function () {
		var dpr = window.devicePixelRatio || 1;
		this._dpr = dpr;
		this._overlay.width  = Math.round(window.innerWidth  * dpr);
		this._overlay.height = Math.round(window.innerHeight * dpr);
		this._overlay.style.width  = window.innerWidth  + 'px';
		this._overlay.style.height = window.innerHeight + 'px';
	};

	// ── Layout ──────────────────────────────────────────────────────────────────
	// All positions stored in CSS px (logical, not device pixels).
	KKGamepad.prototype._layout = function () {
		var vw = window.innerWidth;
		var vh = window.innerHeight;

		// Find the game canvas rect in CSS px
		var gameCanvas = Graphics._canvas;
		var gr = gameCanvas ? gameCanvas.getBoundingClientRect() : null;

		var barW = (gr && gr.left > 4) ? gr.left : 0; // left bar width in CSS px

		var hasBar = barW >= 40; // need at least 40px to be usable

		if (hasBar) {
			// ── BAR MODE (GBA style) ─────────────────────────────────────────────
			var lx = barW * 0.5;           // horizontal centre of left bar
			var rx = vw - barW * 0.5;      // horizontal centre of right bar
			var ctrlY  = vh * 0.72;        // main control row
			var btnTopY = vh * 0.58;       // A button row

			// Joystick / DPad
			this._joystickBase = { x: lx, y: ctrlY };
			var dOff = Math.min(barW * 0.30, 52);
			this._dpadPositions = {
				up:    { x: lx,        y: ctrlY - dOff },
				down:  { x: lx,        y: ctrlY + dOff },
				left:  { x: lx - dOff, y: ctrlY        },
				right: { x: lx + dOff, y: ctrlY        },
			};

			// Action buttons
			var bOff = Math.min(barW * 0.28, 38);
			this._btnPositions = {
				ok:     { x: rx + bOff, y: btnTopY        },
				cancel: { x: rx - bOff, y: ctrlY          },
				menu:   { x: rx,        y: vh * 0.18      },
			};
		} else {
			// ── CORNER MODE (no bars / desktop) ─────────────────────────────────
			var m = CFG.margin;
			this._joystickBase = { x: m + 60, y: vh - m - 60 };
			var dOff2 = 52;
			this._dpadPositions = {
				up:    { x: m + 60,          y: vh - m - 60 - dOff2 },
				down:  { x: m + 60,          y: vh - m - 60 + dOff2 },
				left:  { x: m + 60 - dOff2,  y: vh - m - 60         },
				right: { x: m + 60 + dOff2,  y: vh - m - 60         },
			};
			this._btnPositions = {
				ok:     { x: vw - m - 30,  y: vh - m - 100 },
				cancel: { x: vw - m - 80,  y: vh - m - 40  },
				menu:   { x: vw - m - 30,  y: m + 30       },
			};
		}
	};

	KKGamepad.prototype._onResize = function () {
		this._resizeOverlay();
		this._layout();
		// Reset joystick knob on resize
		this._joystickKnobOff = { x: 0, y: 0 };
	};

	// ── Rendering ───────────────────────────────────────────────────────────────
	KKGamepad.prototype._scheduleRender = function () {
		var self = this;
		this._rafId = requestAnimationFrame(function () {
			self._render();
			self._scheduleRender();
		});
	};

	KKGamepad.prototype._render = function () {
		var ctx = this._ctx;
		var dpr = this._dpr;
		var W   = this._overlay.width;
		var H   = this._overlay.height;

		ctx.clearRect(0, 0, W, H);

		// Compute current alpha (smooth fade)
		var showOnDevice = CFG.showOnDesktop || isTouchDevice();
		if (!this._visible || !showOnDevice) {
			this._targetAlpha = 0;
		} else if (this._disabled) {
			this._targetAlpha = CFG.opacity * 0.4;
		} else {
			this._targetAlpha = CFG.opacity;
		}
		if (this._alpha < this._targetAlpha) {
			this._alpha = Math.min(this._alpha + CFG.fadeSpeed, this._targetAlpha);
		} else if (this._alpha > this._targetAlpha) {
			this._alpha = Math.max(this._alpha - CFG.fadeSpeed, this._targetAlpha);
		}
		if (this._alpha <= 0.01) return;

		ctx.save();
		ctx.scale(dpr, dpr);
		ctx.globalAlpha = this._alpha;

		if (CFG.controlType === 'DPad') {
			this._drawDpad(ctx);
		} else {
			this._drawJoystick(ctx);
		}
		this._drawButtons(ctx);

		ctx.restore();
	};

	// Shared drawing helpers
	KKGamepad.prototype._drawCircle = function (ctx, x, y, r, fillStyle, strokeStyle, lineWidth) {
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		if (fillStyle)   { ctx.fillStyle = fillStyle; ctx.fill(); }
		if (strokeStyle) { ctx.strokeStyle = strokeStyle; ctx.lineWidth = lineWidth || 1.5; ctx.stroke(); }
	};

	KKGamepad.prototype._drawJoystick = function (ctx) {
		var bx = this._joystickBase.x;
		var by = this._joystickBase.y;
		var kx = bx + this._joystickKnobOff.x;
		var ky = by + this._joystickKnobOff.y;
		var range = CFG.joystickRange * (window.innerHeight / (Graphics.height || 720));

		// Outer ring — faint translucent circle showing movement area
		this._drawCircle(ctx, bx, by, range,
			'rgba(0,0,0,0.18)',
			'rgba(255,255,255,0.18)', 1.5);

		// Knob outer glow ring
		this._drawCircle(ctx, kx, ky, 26,
			null,
			'rgba(255,255,255,0.30)', 1.5);
		// Knob fill — translucent white
		this._drawCircle(ctx, kx, ky, 22,
			'rgba(255,255,255,0.15)',
			null);
		// Knob inner dot
		this._drawCircle(ctx, kx, ky, 8,
			'rgba(255,255,255,0.55)',
			null);
	};

	KKGamepad.prototype._drawDpad = function (ctx) {
		var dirs = ['up', 'down', 'left', 'right'];
		for (var i = 0; i < dirs.length; i++) {
			var dir = dirs[i];
			var pos = this._dpadPositions[dir];
			if (!pos) continue;
			var pressed = (this._dpadTouchIds[dir] !== undefined);
			this._drawDpadBtn(ctx, pos.x, pos.y, dir, pressed);
		}
	};

	KKGamepad.prototype._drawDpadBtn = function (ctx, x, y, dir, pressed) {
		var r = 28;

		// Circle background
		this._drawCircle(ctx, x, y, r,
			pressed ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.30)',
			'rgba(255,255,255,0.35)', 1.5);

		// Arrow — clean chevron
		ctx.save();
		ctx.translate(x, y);
		var rot = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
		ctx.rotate(rot[dir] || 0);
		ctx.beginPath();
		ctx.moveTo(0, -10);
		ctx.lineTo(7, 2);
		ctx.lineTo(0, -2);
		ctx.lineTo(-7, 2);
		ctx.closePath();
		ctx.fillStyle = pressed ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.80)';
		ctx.fill();
		ctx.restore();
	};

	// PPSSPP-style button config:
	// translucent dark fill + colored outline ring + letter label
	var BTN_COLORS = {
		ok:     { ring: 'rgba(100,220,100,0.90)', label: 'A', labelColor: 'rgba(120,255,120,1)'   },
		cancel: { ring: 'rgba(220,80,80,0.90)',   label: 'B', labelColor: 'rgba(255,110,110,1)'   },
		menu:   { ring: 'rgba(180,180,255,0.70)', label: '≡', labelColor: 'rgba(200,200,255,0.95)' },
	};

	KKGamepad.prototype._drawButtons = function (ctx) {
		var names = ['ok', 'cancel', 'menu'];
		for (var i = 0; i < names.length; i++) {
			var name = names[i];
			var pos  = this._btnPositions[name];
			if (!pos) continue;
			var pressed = (this._buttonTouchIds[name] !== undefined);
			var col = BTN_COLORS[name];
			var r = name === 'menu' ? 20 : 28;
			this._drawBtn(ctx, pos.x, pos.y, r, col, pressed);
		}
	};

	KKGamepad.prototype._drawBtn = function (ctx, x, y, r, col, pressed) {
		// Fill — dark translucent, slightly lighter when pressed
		this._drawCircle(ctx, x, y, r,
			pressed ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.35)',
			null);

		// Colored outer ring — thicker, glows on press
		ctx.beginPath();
		ctx.arc(x, y, r - 1, 0, Math.PI * 2);
		ctx.strokeStyle = col.ring;
		ctx.lineWidth = pressed ? 3 : 2;
		ctx.globalAlpha = pressed ? 1.0 : (this._alpha * 0.9);
		ctx.stroke();
		ctx.globalAlpha = this._alpha;

		// Label
		ctx.fillStyle = col.labelColor;
		ctx.font = 'bold ' + Math.round(r * 0.78) + 'px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(col.label, x, y + 1);
	};

	// ── Touch handling ───────────────────────────────────────────────────────────
	// Hit test in CSS px
	KKGamepad.prototype._hitRadius = function (name) {
		return name === 'menu' ? CFG.buttonHitRadius * 0.8 : CFG.buttonHitRadius;
	};

	KKGamepad.prototype._setupListeners = function () {
		var self = this;
		this._onDown   = function (e) { self._handleDown(e);   };
		this._onMove   = function (e) { self._handleMove(e);   };
		this._onUp     = function (e) { self._handleUp(e);     };
		document.addEventListener('pointerdown',   this._onDown,   { passive: false });
		document.addEventListener('pointermove',   this._onMove,   { passive: false });
		document.addEventListener('pointerup',     this._onUp,     { passive: false });
		document.addEventListener('pointercancel', this._onUp,     { passive: false });
	};

	KKGamepad.prototype._removeListeners = function () {
		document.removeEventListener('pointerdown',   this._onDown);
		document.removeEventListener('pointermove',   this._onMove);
		document.removeEventListener('pointerup',     this._onUp);
		document.removeEventListener('pointercancel', this._onUp);
	};

	// Convert a pointer event to CSS px position
	KKGamepad.prototype._pt = function (e) {
		return { x: e.clientX, y: e.clientY };
	};

	KKGamepad.prototype._dist = function (ax, ay, bx, by) {
		var dx = ax - bx, dy = ay - by;
		return Math.sqrt(dx * dx + dy * dy);
	};

	KKGamepad.prototype._handleDown = function (e) {
		if (!this._visible || this._alpha < 0.1 || this._disabled) return;
		var pt = this._pt(e);

		// Joystick
		if (CFG.controlType !== 'DPad' && this._joystickTouchId === -1) {
			var actR = CFG.joystickActivationRadius * (window.innerHeight / (Graphics.height || 720));
			if (this._dist(pt.x, pt.y, this._joystickBase.x, this._joystickBase.y) <= actR) {
				this._joystickTouchId = e.pointerId;
				this._updateJoystick(pt);
				e.preventDefault(); return;
			}
		}

		// DPad
		if (CFG.controlType === 'DPad') {
			var dirs = ['up','down','left','right'];
			for (var i = 0; i < dirs.length; i++) {
				var dir = dirs[i];
				if (this._dpadTouchIds[dir] !== undefined) continue;
				var dp = this._dpadPositions[dir];
				if (dp && this._dist(pt.x, pt.y, dp.x, dp.y) <= CFG.buttonHitRadius) {
					this._dpadTouchIds[dir] = e.pointerId;
					Input._currentState[dir] = true;
					vibrate();
					e.preventDefault(); return;
				}
			}
		}

		// Buttons
		var btnNames = ['ok','cancel','menu'];
		for (var j = 0; j < btnNames.length; j++) {
			var name = btnNames[j];
			if (this._buttonTouchIds[name] !== undefined) continue;
			var bp = this._btnPositions[name];
			if (bp && this._dist(pt.x, pt.y, bp.x, bp.y) <= this._hitRadius(name)) {
				this._buttonTouchIds[name] = e.pointerId;
				Input._currentState[name] = true;
				vibrate();
				e.preventDefault(); return;
			}
		}
	};

	KKGamepad.prototype._handleMove = function (e) {
		if (!this._visible || this._alpha < 0.1 || this._disabled) return;
		var pt = this._pt(e);

		if (e.pointerId === this._joystickTouchId) {
			this._updateJoystick(pt);
			e.preventDefault();
		}
	};

	KKGamepad.prototype._handleUp = function (e) {
		var id = e.pointerId;

		if (id === this._joystickTouchId) {
			this._releaseJoystick();
		}

		var dirs = ['up','down','left','right'];
		for (var i = 0; i < dirs.length; i++) {
			if (this._dpadTouchIds[dirs[i]] === id) {
				delete this._dpadTouchIds[dirs[i]];
				Input._currentState[dirs[i]] = false;
			}
		}

		var names = ['ok','cancel','menu'];
		for (var j = 0; j < names.length; j++) {
			if (this._buttonTouchIds[names[j]] === id) {
				delete this._buttonTouchIds[names[j]];
				Input._currentState[names[j]] = false;
			}
		}
	};

	KKGamepad.prototype._updateJoystick = function (pt) {
		var bx = this._joystickBase.x;
		var by = this._joystickBase.y;
		var dx = pt.x - bx;
		var dy = pt.y - by;
		var dist  = Math.sqrt(dx * dx + dy * dy);
		var angle = Math.atan2(dy, dx);

		// CSS-px joystick range (scale from game-px to CSS-px)
		var cssRange = CFG.joystickRange * (window.innerHeight / (Graphics.height || 720));
		var clamped  = Math.min(dist, cssRange);

		this._joystickKnobOff = {
			x: Math.cos(angle) * clamped,
			y: Math.sin(angle) * clamped,
		};

		// CSS-px dead zone
		var cssDeadZone = CFG.deadZone * (window.innerHeight / (Graphics.height || 720));
		if (dist > cssDeadZone) {
			var deg = angle * (180 / Math.PI);
			Input._currentState['right'] = deg >= -67.5  && deg <=  67.5;
			Input._currentState['left']  = deg >=  112.5 || deg <= -112.5;
			Input._currentState['down']  = deg >=  22.5  && deg <=  157.5;
			Input._currentState['up']    = deg >= -157.5 && deg <=  -22.5;
		} else {
			this._resetMoveInput();
		}
	};

	KKGamepad.prototype._releaseJoystick = function () {
		this._joystickTouchId = -1;
		this._joystickKnobOff = { x: 0, y: 0 };
		this._resetMoveInput();
	};

	KKGamepad.prototype._resetMoveInput = function () {
		Input._currentState['up']    = false;
		Input._currentState['down']  = false;
		Input._currentState['left']  = false;
		Input._currentState['right'] = false;
	};

	KKGamepad.prototype._forceResetAll = function () {
		this._releaseJoystick();
		var dirs  = ['up','down','left','right'];
		var names = ['ok','cancel','menu'];
		for (var i = 0; i < dirs.length;  i++) { delete this._dpadTouchIds[dirs[i]];   Input._currentState[dirs[i]]  = false; }
		for (var j = 0; j < names.length; j++) { delete this._buttonTouchIds[names[j]]; Input._currentState[names[j]] = false; }
	};

	// ── API ──────────────────────────────────────────────────────────────────────
	KKGamepad.prototype.setVisible = function (v) {
		this._visible = v;
		if (!v) this._forceResetAll();
	};

	KKGamepad.prototype.setDisabled = function (d) {
		this._disabled = d;
		if (d) this._forceResetAll();
	};

	// Called every frame by Scene_Base.update
	KKGamepad.prototype.update = function () {
		// Slide behaviour is handled visually via CSS transform if needed;
		// for now the overlay stays at fixed position.
		// (message slide was handled by the PIXI container.y trick — with the
		//  HTML overlay we skip it since controls in bars don't cover the game.)
	};

	KKGamepad.prototype.destroy = function () {
		this._removeListeners();
		if (this._boundResize) {
			window.removeEventListener('resize', this._boundResize);
			this._boundResize = null;
		}
		if (this._rafId) {
			cancelAnimationFrame(this._rafId);
			this._rafId = null;
		}
		if (this._overlay && this._overlay.parentNode) {
			this._overlay.parentNode.removeChild(this._overlay);
		}
		this._forceResetAll();
		_activeGamepad = null;
	};

	window.KK_VirtualGamepad = {
		show: apiShow,
		hide: apiHide,
		enable: apiEnable,
		disable: apiDisable,
		isVisible: function () {
			return _activeGamepad ? _activeGamepad._visible : false;
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

	// ── Scene hooks ──────────────────────────────────────────────────────────────
	// KKGamepad is now a plain JS object with an HTML canvas overlay — it does
	// not live in the PIXI scene graph.  We just create it once and keep it alive
	// across all scene changes.  Scene_Base.update still calls gamepad.update()
	// each frame so visibility / fade logic keeps running.

	var _Scene_Base_start = Scene_Base.prototype.start;
	Scene_Base.prototype.start = function () {
		_Scene_Base_start.call(this);
		if (!_activeGamepad) {
			_activeGamepad = new KKGamepad();
		}
		// Re-apply persist flags whenever a new scene starts
		_activeGamepad.setVisible(!_persistHide);
		_activeGamepad.setDisabled(_persistDisabled);
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
			if (_activeGamepad && _activeGamepad._visible && !_activeGamepad._disabled) {
				return;
			}
			_Scene_Map_processMapTouch.call(this);
		};
	}

	//=========================================================================
	// TouchInput suppression on mobile
	//
	// On touch devices the virtual gamepad handles all input.  Raw TouchInput
	// taps on the game canvas still fire isTriggered / isCancelled / isPressed
	// which cause unwanted NPC interactions, menu confirmations, and movement
	// when the player touches anywhere on the canvas instead of a button.
	//
	// Fix: when a touch device is detected and the gamepad is visible + enabled,
	// suppress TouchInput._triggered and TouchInput._cancelled so the engine
	// sees no tap input from the canvas.  The gamepad writes directly to
	// Input._currentState so button presses still work normally.
	//
	// We leave TouchInput._moved and _wheelScrolled alone so scroll / drag
	// behaviours that don't conflict with the gamepad still function.
	//=========================================================================
	if (isTouchDevice() || CFG.showOnDesktop) {
		var _TouchInput_update = TouchInput.update;
		TouchInput.update = function () {
			_TouchInput_update.call(this);
			if (_activeGamepad && _activeGamepad._visible && !_activeGamepad._disabled) {
				// Suppress raw taps in every scene, including battle. Virtual
				// gamepad buttons feed Input directly and remain functional.
				// _pressed is intentionally left alone — the engine uses it for
				// held-state detection unrelated to player touch input.
				TouchInput._triggered = false;
				TouchInput._cancelled = false;
			}
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
