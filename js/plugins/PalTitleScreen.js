//=============================================================================
// PalTitleScreen.js  —  RPG Maker MV  —  v1.2.0
//=============================================================================
// Compatibility confirmed with:
//   YEP_CoreEngine (1280x720, _updateRealScale snap), YEP_DynamicTitleImages
// Load order: place AFTER YEP_CoreEngine in plugins.js (i.e. lower in the list)
//=============================================================================

/*:
 * @plugindesc [v1.2.0] Custom Landing Page — animated floating buttons,
 * settings panel with sliders & checkboxes, exit confirmation (desktop),
 * custom background tint, logo image or text, version label, corner icons.
 * Compatible with YEP_CoreEngine.
 * @author Palarong Panlipunan Dev
 *
 * @param --- Background ---
 *
 * @param bgOverlayColor
 * @parent --- Background ---
 * @text Overlay Tint Color
 * @desc Semi-transparent CSS color layered over the title background.
 * Use "none" to disable. Example: rgba(0,0,20,0.45)
 * @default rgba(0,0,20,0.45)
 *
 * @param --- Logo ---
 *
 * @param logoImage
 * @parent --- Logo ---
 * @text Logo Image (img/titles2/)
 * @desc Filename (no extension) in img/titles2/ to use as the logo.
 * Leave blank to show Logo Text instead.
 * @default
 *
 * @param logoTextFallback
 * @parent --- Logo ---
 * @text Logo Text (fallback)
 * @desc Displayed when Logo Image is blank.
 * @default Palarong Panlipunan
 *
 * @param logoYPercent
 * @parent --- Logo ---
 * @text Logo Y (% of canvas height)
 * @desc How far from the top the logo sits, as a percentage.
 * @default 16
 *
 * @param --- Version ---
 *
 * @param showVersion
 * @parent --- Version ---
 * @text Show Version Label
 * @type boolean
 * @on Yes
 * @off No
 * @default true
 *
 * @param versionText
 * @parent --- Version ---
 * @text Version Text
 * @default v1.0.0
 *
 * @param versionColor
 * @parent --- Version ---
 * @text Version Color (CSS)
 * @default rgba(255,255,255,0.55)
 *
 * @param --- Buttons ---
 *
 * @param buttonAlign
 * @parent --- Buttons ---
 * @text Horizontal Alignment
 * @type select
 * @option center
 * @option left
 * @option right
 * @default center
 *
 * @param buttonYPercent
 * @parent --- Buttons ---
 * @text Button Group Y (% of canvas height)
 * @desc Vertical center of the whole button stack.
 * @default 68
 *
 * @param buttonWidth
 * @parent --- Buttons ---
 * @text Button Width (px)
 * @default 220
 *
 * @param buttonHeight
 * @parent --- Buttons ---
 * @text Button Height (px)
 * @default 44
 *
 * @param buttonSpacing
 * @parent --- Buttons ---
 * @text Gap Between Buttons (px)
 * @default 10
 *
 * @param buttonNormalColor
 * @parent --- Buttons ---
 * @text Button Background (idle)
 * @default rgba(10,20,50,0.72)
 *
 * @param buttonHoverColor
 * @parent --- Buttons ---
 * @text Button Background (hover)
 * @default rgba(255,210,60,0.15)
 *
 * @param buttonBorderColor
 * @parent --- Buttons ---
 * @text Button Border (idle)
 * @default rgba(255,255,255,0.20)
 *
 * @param buttonHoverBorderColor
 * @parent --- Buttons ---
 * @text Button Border (hover)
 * @default rgba(255,210,60,0.90)
 *
 * @param buttonTextColor
 * @parent --- Buttons ---
 * @text Button Text Color (idle)
 * @default rgba(255,255,255,0.92)
 *
 * @param buttonHoverTextColor
 * @parent --- Buttons ---
 * @text Button Text Color (hover)
 * @default #FFD700
 *
 * @param buttonFontSize
 * @parent --- Buttons ---
 * @text Button Font Size (px)
 * @default 19
 *
 * @param --- Corner Icons ---
 *
 * @param cornerIconsJson
 * @parent --- Corner Icons ---
 * @text Icons JSON
 * @desc JSON array. Each object: {"image":"file","tooltip":"text","url":""}
 * file = name inside img/system/ without extension.
 * @default [{"image":"MadeWithMv","tooltip":"Made with RPG Maker MV","url":""}]
 *
 * @param cornerIconSize
 * @parent --- Corner Icons ---
 * @text Icon Size (px)
 * @default 36
 *
 * @param cornerIconPadding
 * @parent --- Corner Icons ---
 * @text Padding from canvas edge (px)
 * @default 12
 *
 * @param --- Settings Panel ---
 *
 * @param settingsPanelWidth
 * @parent --- Settings Panel ---
 * @text Panel Width (px)
 * @default 480
 *
 * @param settingsPanelBg
 * @parent --- Settings Panel ---
 * @text Panel Background
 * @default rgba(5,10,30,0.94)
 *
 * @param settingsPanelBorder
 * @parent --- Settings Panel ---
 * @text Panel Border Color
 * @default rgba(255,210,60,0.45)
 *
 * @param settingsAccentColor
 * @parent --- Settings Panel ---
 * @text Accent Color
 * @default #FFD700
 *
 * @param --- Exit ---
 *
 * @param showExitButton
 * @parent --- Exit ---
 * @text Show Exit Button
 * @type boolean
 * @on Yes
 * @off No
 * @desc Only appears in NW.js / desktop builds.
 * @default true
 *
 * @param exitConfirmText
 * @parent --- Exit ---
 * @text Exit Confirm Message
 * @default Are you sure you want to exit the game?
 *
 * @help
 * ============================================================================
 * PalTitleScreen v1.2.0  —  RPG Maker MV  —  Custom Landing Page
 * ============================================================================
 * Place this plugin BELOW YEP_CoreEngine in the plugin list.
 *
 * The overlay is built as a <div> that exactly mirrors the game canvas
 * position and size (using Graphics._canvas.style values written by MV).
 * All buttons, logo, version label, and corner icons live inside this div
 * so they never bleed outside the canvas boundary.
 *
 * Logo: place PNG in img/titles2/ — set "Logo Image" to its filename.
 *       Leave blank for text fallback.
 * Corner icons: edit "Icons JSON" in Plugin Manager.
 *               image = filename in img/system/ (no extension).
 * ============================================================================
 */

(function () {
    "use strict";

    // =========================================================================
    // Parameters
    // =========================================================================

    var RAW = PluginManager.parameters("PalTitleScreen");

    function str(k, d)  { return (RAW[k] !== undefined && RAW[k] !== "") ? RAW[k] : d; }
    function num(k, d)  { var v = parseInt(RAW[k]); return isNaN(v) ? d : v; }
    function bool(k, d) {
        if (RAW[k] === "true")  return true;
        if (RAW[k] === "false") return false;
        return d;
    }
    function json(k, d) { try { return JSON.parse(RAW[k] || "[]"); } catch(e) { return d; } }

    var P = {
        bgOverlayColor:         str("bgOverlayColor",         "rgba(0,0,20,0.45)"),
        logoImage:              str("logoImage",               ""),
        logoTextFallback:       str("logoTextFallback",        "Palarong Panlipunan"),
        logoYPercent:           num("logoYPercent",            16),
        showVersion:            bool("showVersion",            true),
        versionText:            str("versionText",             "v1.0.0"),
        versionColor:           str("versionColor",            "rgba(255,255,255,0.55)"),
        buttonAlign:            str("buttonAlign",             "center"),
        buttonYPercent:         num("buttonYPercent",          68),
        buttonWidth:            num("buttonWidth",             220),
        buttonHeight:           num("buttonHeight",            44),
        buttonSpacing:          num("buttonSpacing",           10),
        buttonNormalColor:      str("buttonNormalColor",       "rgba(10,20,50,0.72)"),
        buttonHoverColor:       str("buttonHoverColor",        "rgba(255,210,60,0.15)"),
        buttonBorderColor:      str("buttonBorderColor",       "rgba(255,255,255,0.20)"),
        buttonHoverBorderColor: str("buttonHoverBorderColor",  "rgba(255,210,60,0.90)"),
        buttonTextColor:        str("buttonTextColor",         "rgba(255,255,255,0.92)"),
        buttonHoverTextColor:   str("buttonHoverTextColor",    "#FFD700"),
        buttonFontSize:         num("buttonFontSize",           19),
        cornerIcons:            json("cornerIconsJson",         []),
        cornerIconSize:         num("cornerIconSize",           36),
        cornerIconPadding:      num("cornerIconPadding",        12),
        settingsPanelWidth:     num("settingsPanelWidth",       480),
        settingsPanelBg:        str("settingsPanelBg",          "rgba(5,10,30,0.94)"),
        settingsPanelBorder:    str("settingsPanelBorder",      "rgba(255,210,60,0.45)"),
        settingsAccentColor:    str("settingsAccentColor",      "#FFD700"),
        showExitButton:         bool("showExitButton",          true),
        exitConfirmText:        str("exitConfirmText",          "Are you sure you want to exit the game?"),
    };

    // =========================================================================
    // Canvas rect helper
    // =========================================================================
    // MV's Graphics._centerElement() writes the final CSS left/top/width/height
    // onto each canvas element.  We read those values directly — no maths needed.

    function canvasRect() {
        var c = Graphics._canvas;
        if (c && c.style && c.style.width) {
            return {
                left:   parseFloat(c.style.left)   || 0,
                top:    parseFloat(c.style.top)     || 0,
                width:  parseFloat(c.style.width)   || window.innerWidth,
                height: parseFloat(c.style.height)  || window.innerHeight
            };
        }
        // Fallback before canvas is ready
        var scale = Graphics._realScale || 1;
        var w = (Graphics._width  || 816)  * scale;
        var h = (Graphics._height || 624)  * scale;
        return {
            left:   Math.floor((window.innerWidth  - w) / 2),
            top:    Math.floor((window.innerHeight - h) / 2),
            width:  w,
            height: h
        };
    }

    function syncOverlay() {
        var ov = document.getElementById("PalOverlay");
        if (!ov) return;
        var r = canvasRect();
        ov.style.left   = r.left   + "px";
        ov.style.top    = r.top    + "px";
        ov.style.width  = r.width  + "px";
        ov.style.height = r.height + "px";
    }

    // =========================================================================
    // CSS injection
    // =========================================================================

    function injectCSS() {
        if (document.getElementById("PalTitleCSS")) return;
        var ac = P.settingsAccentColor;
        var sb = P.settingsPanelBorder;

        var rules = [];

        // ── overlay container ────────────────────────────────────────────────
        rules.push(
            "#PalOverlay{" +
                "position:fixed;" +
                "margin:0;" +
                "overflow:hidden;" +
                "pointer-events:none;" +
                "z-index:9000;" +
                "box-sizing:border-box;" +
                "font-family:GameFont,Verdana,sans-serif;" +
            "}"
        );

        // ── background tint ──────────────────────────────────────────────────
        var tintBg = (P.bgOverlayColor === "none") ? "transparent" : P.bgOverlayColor;
        rules.push(
            "#PalBgTint{" +
                "position:absolute;top:0;left:0;right:0;bottom:0;" +
                "background:" + tintBg + ";" +
                "pointer-events:none;" +
            "}"
        );

        // ── logo — independent, absolutely positioned top-left ───────────────
        rules.push(
            "#PalLogo{" +
                "position:absolute;" +
                "pointer-events:none;" +
                "animation:palLogoIn 1.2s ease both;" +
            "}"
        );
        rules.push("#PalLogo img{display:block;max-width:100%;max-height:200px;}");
        rules.push(
            "#PalLogoText{" +
                "color:#fff;" +
                "font-weight:bold;" +
                "white-space:nowrap;" +
                "letter-spacing:2px;" +
                "font-size:52px;" +
                "text-shadow:0 0 18px rgba(255,220,80,.9),0 2px 6px rgba(0,0,0,.85);" +
            "}"
        );
        rules.push(
            "@keyframes palLogoIn{" +
                "from{opacity:0;transform:translateY(-14px)}" +
                "to  {opacity:1;transform:translateY(0)}" +
            "}"
        );

        // ── version ──────────────────────────────────────────────────────────
        rules.push(
            "#PalVersion{" +
                "position:absolute;" +
                "bottom:10px;" +
                "left:14px;" +
                "font-size:13px;" +
                "color:" + P.versionColor + ";" +
                "pointer-events:none;" +
                "letter-spacing:1px;" +
            "}"
        );

        // ── button group — independent, absolutely positioned ─────────────────
        rules.push(
            "#PalButtons{" +
                "position:absolute;" +
                "display:flex;" +
                "flex-direction:column;" +
                "align-items:flex-start;" +
                "gap:" + P.buttonSpacing + "px;" +
                "pointer-events:all;" +
                "animation:palBtnsIn 0.9s 0.15s ease both;" +
            "}"
        );
        rules.push(
            "@keyframes palBtnsIn{" +
                "from{opacity:0;transform:translateY(12px)}" +
                "to  {opacity:1;transform:translateY(0)}" +
            "}"
        );

        // ── individual button — wood plank style ──────────────────────────────
        rules.push(
            ".pal-btn{" +
                "width:" + P.buttonWidth + "px;" +
                "height:" + P.buttonHeight + "px;" +
                "background-image:url('img/pictures/btn_wood_tile.png');" +
                "background-repeat:repeat-x;" +
                "background-size:auto 100%;" +
                "border-top:3px solid #c8a44a;" +
                "border-left:3px solid #c8a44a;" +
                "border-right:3px solid #5a3a10;" +
                "border-bottom:3px solid #5a3a10;" +
                "border-radius:4px;" +
                "color:#ffffff;" +
                "font-family:inherit;" +
                "font-size:" + P.buttonFontSize + "px;" +
                "letter-spacing:2px;" +
                "text-shadow:2px 2px 0 #1a0800, 0 0 10px rgba(0,0,0,.9);" +
                "cursor:pointer;" +
                "outline:none;" +
                "position:relative;" +
                "overflow:hidden;" +
                "box-shadow:0 4px 0 #3a1a00, 0 6px 12px rgba(0,0,0,.6);" +
                "transition:" +
                    "filter 0.15s," +
                    "transform 0.18s cubic-bezier(.34,1.56,.64,1)," +
                    "box-shadow 0.18s;" +
            "}"
        );
        // top-edge highlight sheen
        rules.push(
            ".pal-btn::before{" +
                "content:'';" +
                "position:absolute;top:0;left:0;right:0;height:40%;" +
                "border-radius:inherit;" +
                "background:linear-gradient(180deg,rgba(255,255,255,.18) 0%,transparent 100%);" +
                "pointer-events:none;" +
            "}"
        );
        // hover — brighten + float up
        rules.push(
            ".pal-btn:hover{" +
                "filter:brightness(1.35) saturate(1.2);" +
                "color:#ffffff;" +
                "transform:translateY(-4px) scale(1.03);" +
                "box-shadow:0 8px 0 #3a1a00, 0 10px 20px rgba(255,180,40,.35), 0 0 0 2px #FFD700;" +
            "}"
        );
        // press down
        rules.push(
            ".pal-btn:active{" +
                "transform:translateY(2px) scale(.98);" +
                "box-shadow:0 2px 0 #3a1a00, 0 3px 6px rgba(0,0,0,.5);" +
                "filter:brightness(.9);" +
            "}"
        );
        rules.push(".pal-btn:disabled{opacity:.4;cursor:default;pointer-events:none;}");

        // ── corner icons ──────────────────────────────────────────────────────
        rules.push(
            "#PalCorner{" +
                "position:absolute;" +
                "bottom:" + P.cornerIconPadding + "px;" +
                "right:" + P.cornerIconPadding + "px;" +
                "display:flex;" +
                "flex-direction:row;" +
                "align-items:center;" +
                "gap:8px;" +
                "pointer-events:all;" +
            "}"
        );
        rules.push(
            ".pal-icon{" +
                "width:" + P.cornerIconSize + "px;" +
                "height:" + P.cornerIconSize + "px;" +
                "object-fit:contain;" +
                "opacity:.7;" +
                "cursor:default;" +
                "transition:opacity .18s,transform .18s;" +
            "}"
        );
        rules.push(".pal-icon:hover{opacity:1;transform:scale(1.12);}");
        rules.push(".pal-icon.link{cursor:pointer;}");

        // ── settings backdrop ─────────────────────────────────────────────────
        rules.push(
            "#PalSetBd{" +
                "position:fixed;top:0;left:0;right:0;bottom:0;" +
                "background:rgba(0,0,0,.6);" +
                "z-index:9100;" +
                "display:none;" +
                "align-items:center;" +
                "justify-content:center;" +
            "}"
        );
        rules.push("#PalSetBd.open{display:flex;}");

        // ── settings panel ────────────────────────────────────────────────────
        rules.push(
            "#PalSetPanel{" +
                "background:" + P.settingsPanelBg + ";" +
                "border:1.5px solid " + sb + ";" +
                "border-radius:10px;" +
                "width:" + P.settingsPanelWidth + "px;" +
                "max-width:96vw;" +
                "max-height:88vh;" +
                "overflow-y:auto;" +
                "padding:28px 32px 22px;" +
                "box-shadow:0 8px 40px rgba(0,0,0,.8);" +
                "font-family:GameFont,Verdana,sans-serif;" +
                "color:#fff;" +
                "box-sizing:border-box;" +
                "animation:palPanelIn .25s ease both;" +
            "}"
        );
        rules.push(
            "@keyframes palPanelIn{" +
                "from{opacity:0;transform:scale(.93) translateY(10px)}" +
                "to  {opacity:1;transform:scale(1)   translateY(0)}" +
            "}"
        );
        rules.push(
            "#PalSetPanel h2{" +
                "margin:0 0 20px;" +
                "font-size:19px;" +
                "color:" + ac + ";" +
                "letter-spacing:2px;" +
                "text-transform:uppercase;" +
                "border-bottom:1px solid " + sb + ";" +
                "padding-bottom:8px;" +
            "}"
        );
        rules.push(
            ".psr{display:flex;align-items:center;justify-content:space-between;margin-bottom:15px;}"
        );
        rules.push(".psl{font-size:14px;color:rgba(255,255,255,.86);min-width:145px;flex:0 0 auto;}");
        rules.push(".psc{flex:1 1 auto;display:flex;align-items:center;gap:10px;justify-content:flex-end;}");

        // slider
        rules.push(
            ".pslider{" +
                "-webkit-appearance:none;appearance:none;" +
                "width:160px;height:5px;" +
                "border-radius:3px;" +
                "background:rgba(255,255,255,.18);" +
                "outline:none;cursor:pointer;" +
            "}"
        );
        rules.push(
            ".pslider::-webkit-slider-thumb{" +
                "-webkit-appearance:none;" +
                "width:18px;height:18px;" +
                "border-radius:50%;" +
                "background:" + ac + ";" +
                "box-shadow:0 0 6px " + ac + ";" +
                "cursor:pointer;" +
                "transition:transform .14s;" +
            "}"
        );
        rules.push(".pslider::-webkit-slider-thumb:hover{transform:scale(1.2);}");
        rules.push(
            ".pslider::-moz-range-thumb{" +
                "width:18px;height:18px;" +
                "border-radius:50%;" +
                "background:" + ac + ";" +
                "border:none;cursor:pointer;" +
            "}"
        );
        rules.push(".psval{font-size:12px;color:" + ac + ";min-width:30px;text-align:right;}");

        // checkbox
        rules.push(".pscb{display:flex;align-items:center;gap:8px;cursor:pointer;}");
        rules.push(".pscb input{display:none;}");
        rules.push(
            ".pscbox{" +
                "width:22px;height:22px;" +
                "border:2px solid rgba(255,255,255,.3);" +
                "border-radius:4px;" +
                "background:rgba(255,255,255,.06);" +
                "display:flex;align-items:center;justify-content:center;" +
                "transition:border-color .16s,background .16s;" +
                "flex-shrink:0;" +
            "}"
        );
        rules.push(".pscb input:checked+.pscbox{border-color:" + ac + ";background:" + ac + "33;}");
        rules.push(".pscb input:checked+.pscbox::after{content:'✓';font-size:13px;color:" + ac + ";font-weight:bold;line-height:1;}");

        // divider
        rules.push(".psdiv{border:none;border-top:1px solid rgba(255,255,255,.1);margin:4px 0 16px;}");

        // settings action buttons
        rules.push(
            "#PalSetBtns{" +
                "display:flex;justify-content:flex-end;gap:10px;" +
                "margin-top:20px;" +
                "border-top:1px solid " + sb + ";" +
                "padding-top:15px;" +
            "}"
        );
        rules.push(
            ".psabtn{" +
                "padding:8px 24px;" +
                "border-radius:5px;" +
                "font-family:inherit;" +
                "font-size:14px;" +
                "cursor:pointer;" +
                "border:1.5px solid rgba(255,255,255,.2);" +
                "letter-spacing:1px;" +
                "transition:background .16s,border-color .16s,transform .14s;" +
            "}"
        );
        rules.push(".psabtn.save{background:" + ac + ";color:#111;border-color:" + ac + ";font-weight:bold;}");
        rules.push(".psabtn.save:hover{background:#fff;border-color:#fff;transform:translateY(-2px);}");
        rules.push(".psabtn.cancel{background:rgba(255,255,255,.07);color:rgba(255,255,255,.8);}");
        rules.push(".psabtn.cancel:hover{background:rgba(255,80,80,.18);border-color:rgba(255,80,80,.6);color:#fff;transform:translateY(-2px);}");

        // ── confirm backdrop + dialog ─────────────────────────────────────────
        rules.push(
            "#PalCfmBd{" +
                "position:fixed;top:0;left:0;right:0;bottom:0;" +
                "background:rgba(0,0,0,.65);" +
                "z-index:9200;" +
                "display:none;" +
                "align-items:center;" +
                "justify-content:center;" +
            "}"
        );
        rules.push("#PalCfmBd.open{display:flex;}");
        rules.push(
            "#PalCfmDlg{" +
                "background:" + P.settingsPanelBg + ";" +
                "border:1.5px solid " + sb + ";" +
                "border-radius:8px;" +
                "padding:28px 32px 20px;" +
                "max-width:380px;" +
                "text-align:center;" +
                "font-family:GameFont,Verdana,sans-serif;" +
                "color:#fff;" +
                "box-shadow:0 8px 40px rgba(0,0,0,.85);" +
                "animation:palPanelIn .2s ease both;" +
            "}"
        );
        rules.push("#PalCfmDlg p{font-size:15px;margin:0 0 20px;line-height:1.5;color:rgba(255,255,255,.9);}");
        rules.push("#PalCfmBtns{display:flex;justify-content:center;gap:12px;}");
        rules.push(
            ".pcbtn{" +
                "padding:8px 26px;" +
                "border-radius:5px;" +
                "font-family:inherit;" +
                "font-size:14px;" +
                "font-weight:bold;" +
                "cursor:pointer;" +
                "border:1.5px solid rgba(255,255,255,.2);" +
                "letter-spacing:1px;" +
                "transition:background .16s,transform .14s;" +
            "}"
        );
        rules.push(".pcbtn.yes{background:rgba(255,70,70,.82);color:#fff;border-color:rgba(255,70,70,.9);}");
        rules.push(".pcbtn.yes:hover{background:#ff3333;transform:translateY(-2px);}");
        rules.push(".pcbtn.no{background:rgba(255,255,255,.08);color:rgba(255,255,255,.82);}");
        rules.push(".pcbtn.no:hover{background:rgba(255,255,255,.18);transform:translateY(-2px);}");

        // ── toast ─────────────────────────────────────────────────────────────
        rules.push(
            "#PalToast{" +
                "position:fixed;" +
                "bottom:56px;" +
                "left:50%;" +
                "transform:translateX(-50%) translateY(18px);" +
                "background:rgba(10,20,50,.93);" +
                "border:1px solid " + ac + ";" +
                "border-radius:6px;" +
                "color:" + ac + ";" +
                "padding:9px 24px;" +
                "font-size:13px;" +
                "letter-spacing:1px;" +
                "z-index:9300;" +
                "opacity:0;" +
                "pointer-events:none;" +
                "transition:opacity .28s,transform .28s;" +
            "}"
        );
        rules.push("#PalToast.show{opacity:1;transform:translateX(-50%) translateY(0);}");

        var el = document.createElement("style");
        el.id  = "PalTitleCSS";
        el.textContent = rules.join("\n");
        document.head.appendChild(el);
    }

    // =========================================================================
    // HTML helpers
    // =========================================================================

    function sliderRow(label, id, min, max, val) {
        var d = document.createElement("div");
        d.className = "psr";
        d.innerHTML =
            '<span class="psl">' + label + '</span>' +
            '<div class="psc">' +
                '<input class="pslider" type="range" id="' + id + '" min="' + min + '" max="' + max + '" value="' + val + '">' +
                '<span class="psval" id="' + id + '_v">' + val + '</span>' +
            '</div>';
        return d;
    }

    function checkRow(label, id, checked) {
        var d = document.createElement("div");
        d.className = "psr";
        d.innerHTML =
            '<span class="psl">' + label + '</span>' +
            '<div class="psc">' +
                '<label class="pscb">' +
                    '<input type="checkbox" id="' + id + '"' + (checked ? " checked" : "") + '>' +
                    '<span class="pscbox"></span>' +
                '</label>' +
            '</div>';
        return d;
    }

    function wireSlider(id, cb) {
        var el = document.getElementById(id);
        var vl = document.getElementById(id + "_v");
        if (!el) return;
        el.addEventListener("input", function () {
            if (vl) vl.textContent = el.value;
            if (cb) cb(Number(el.value));
        });
    }

    // =========================================================================
    // Scene_Title overrides
    // =========================================================================

    // 1. Kill the canvas-drawn game title text
    Scene_Title.prototype.drawGameTitle = function () {};

    // 2. Banish the Window_TitleCommand off-screen + make invisible
    var _createCW = Scene_Title.prototype.createCommandWindow;
    Scene_Title.prototype.createCommandWindow = function () {
        _createCW.call(this);
        var w = this._commandWindow;
        w.x = -99999;
        w.y = -99999;
        w.opacity        = 0;
        w.contentsOpacity = 0;
        w.deactivate();
        w.close();
    };

    // 3. After create: hide title sprite, inject CSS, build DOM
    var _create = Scene_Title.prototype.create;
    Scene_Title.prototype.create = function () {
        _create.call(this);
        if (this._gameTitleSprite) this._gameTitleSprite.visible = false;
        injectCSS();
        this._palBuild();
    };

    // 4. After start: MV / YEP has finished centering the canvas — sync overlay
    var _start = Scene_Title.prototype.start;
    Scene_Title.prototype.start = function () {
        _start.call(this);
        syncOverlay();
    };

    // 5. Cleanup
    var _terminate = Scene_Title.prototype.terminate;
    Scene_Title.prototype.terminate = function () {
        this._palDestroy();
        _terminate.call(this);
    };

    // 6. Escape key closes open panels
    var _update = Scene_Title.prototype.update;
    Scene_Title.prototype.update = function () {
        _update.call(this);
        if (!Input.isTriggered("cancel")) return;
        var sbd = document.getElementById("PalSetBd");
        if (sbd && sbd.classList.contains("open")) {
            this._palCloseSettings(false); return;
        }
        var cbd = document.getElementById("PalCfmBd");
        if (cbd && cbd.classList.contains("open")) {
            SoundManager.playCancel();
            cbd.classList.remove("open");
        }
    };

    // =========================================================================
    // Build DOM
    // =========================================================================

    Scene_Title.prototype._palBuild = function () {
        this._palDestroy();
        var self = this;
        var r    = canvasRect();

        // ── Main overlay div ──────────────────────────────────────────────────
        var ov   = document.createElement("div");
        ov.id    = "PalOverlay";
        ov.style.left   = r.left   + "px";
        ov.style.top    = r.top    + "px";
        ov.style.width  = r.width  + "px";
        ov.style.height = r.height + "px";

        // background tint
        var tint = document.createElement("div");
        tint.id  = "PalBgTint";
        ov.appendChild(tint);

        // ── Logo — top-left, independently positioned ─────────────────────────
        var logoWrap = document.createElement("div");
        logoWrap.id  = "PalLogo";
        // Left-align at 8%, top at logoYPercent %
        var logoLeft = (P.buttonAlign === "center") ? "50%" :
                       (P.buttonAlign === "right")  ? "auto" : "8%";
        var logoRight = (P.buttonAlign === "right") ? "8%" : "auto";
        logoWrap.style.top   = P.logoYPercent + "%";
        logoWrap.style.left  = logoLeft;
        logoWrap.style.right = logoRight;
        if (P.logoImage) {
            var li = document.createElement("img");
            li.src = "img/titles2/" + P.logoImage + ".png";
            li.alt = P.logoTextFallback;
            logoWrap.appendChild(li);
        } else {
            var lt = document.createElement("div");
            lt.id  = "PalLogoText";
            lt.textContent = P.logoTextFallback;
            logoWrap.appendChild(lt);
        }
        ov.appendChild(logoWrap);

        // ── Buttons — independently vertically centered on left ───────────────
        var hasSave = DataManager.isAnySavefileExists();
        var defs    = this._palButtonDefs(hasSave);
        var totalH  = defs.length * P.buttonHeight + (defs.length - 1) * P.buttonSpacing;

        var bg = document.createElement("div");
        bg.id  = "PalButtons";
        // Vertically center the button stack at buttonYPercent of canvas height
        bg.style.top = "calc(" + P.buttonYPercent + "% - " + (totalH / 2) + "px)";

        if (P.buttonAlign === "right") {
            bg.style.right      = "8%";
            bg.style.alignItems = "flex-end";
        } else if (P.buttonAlign === "center") {
            bg.style.left      = "50%";
            bg.style.transform = "translateX(-50%)";
            bg.style.alignItems = "center";
        } else {
            // left
            bg.style.left       = "8%";
            bg.style.alignItems = "flex-start";
        }

        defs.forEach(function (def) {
            var btn = document.createElement("button");
            btn.className   = "pal-btn";
            btn.textContent = def.label;
            if (def.disabled) btn.disabled = true;
            btn.addEventListener("click", function () { self._palOnClick(def.action); });
            bg.appendChild(btn);
        });
        ov.appendChild(bg);

        // version
        if (P.showVersion) {
            var ver = document.createElement("div");
            ver.id  = "PalVersion";
            ver.textContent = P.versionText;
            ov.appendChild(ver);
        }

        // corner icons
        if (P.cornerIcons && P.cornerIcons.length > 0) {
            var ic = document.createElement("div");
            ic.id  = "PalCorner";
            P.cornerIcons.forEach(function (ico) {
                var img     = document.createElement("img");
                img.className = "pal-icon" + (ico.url ? " link" : "");
                img.src     = "img/system/" + ico.image + ".png";
                img.title   = ico.tooltip || "";
                if (ico.url) {
                    img.addEventListener("click", function () {
                        try { window.open(ico.url, "_blank"); } catch (e) {}
                    });
                }
                ic.appendChild(img);
            });
            ov.appendChild(ic);
        }

        document.body.appendChild(ov);

        // resize listener
        this._palOnResize = function () { syncOverlay(); };
        window.addEventListener("resize", this._palOnResize);

        // modals
        this._palBuildSettings();
        this._palBuildConfirm();

        // toast
        var toast = document.createElement("div");
        toast.id  = "PalToast";
        document.body.appendChild(toast);
    };

    Scene_Title.prototype._palDestroy = function () {
        if (this._palOnResize) {
            window.removeEventListener("resize", this._palOnResize);
            this._palOnResize = null;
        }
        ["PalOverlay","PalSetBd","PalCfmBd","PalToast"].forEach(function (id) {
            var el = document.getElementById(id);
            if (el && el.parentNode) el.parentNode.removeChild(el);
        });
    };

    // =========================================================================
    // Button definitions
    // =========================================================================

    Scene_Title.prototype._palButtonDefs = function (hasSave) {
        var d = [];
        d.push({ label: "New Game",  action: "newGame"  });
        if (hasSave) d.push({ label: "Continue",  action: "continue" });
        d.push({ label: "Settings",  action: "settings"  });
        if (P.showExitButton && Utils.isNwjs()) {
            d.push({ label: "Exit Game", action: "exit" });
        }
        return d;
    };

    // =========================================================================
    // Button actions
    // =========================================================================

    Scene_Title.prototype._palOnClick = function (action) {
        switch (action) {
        case "newGame":
            SoundManager.playOk();
            DataManager.setupNewGame();
            this._commandWindow.close();
            SceneManager.goto(Scene_Map);
            break;
        case "continue":
            SoundManager.playOk();
            this._commandWindow.close();
            SceneManager.push(Scene_Load);
            break;
        case "settings":
            this._palOpenSettings();
            break;
        case "exit":
            this._palConfirm(P.exitConfirmText, function () {
                if (SceneManager.exit) {
                    SceneManager.exit();
                } else if (typeof nw !== "undefined") {
                    nw.App.quit();
                } else {
                    window.close();
                }
            });
            break;
        }
    };

    // =========================================================================
    // Settings panel
    // =========================================================================

    Scene_Title.prototype._palBuildSettings = function () {
        var self = this;
        var cfg  = ConfigManager;
        var bd   = document.createElement("div");
        bd.id    = "PalSetBd";

        var panel = document.createElement("div");
        panel.id  = "PalSetPanel";

        var h2 = document.createElement("h2");
        h2.textContent = "\u2699  Settings";
        panel.appendChild(h2);

        // volume sliders
        panel.appendChild(sliderRow("BGM Volume", "ps_bgm", 0, 100, cfg.bgmVolume  !== undefined ? cfg.bgmVolume  : 100));
        panel.appendChild(sliderRow("BGS Volume", "ps_bgs", 0, 100, cfg.bgsVolume  !== undefined ? cfg.bgsVolume  : 100));
        panel.appendChild(sliderRow("ME Volume",  "ps_me",  0, 100, cfg.meVolume   !== undefined ? cfg.meVolume   : 100));
        panel.appendChild(sliderRow("SE Volume",  "ps_se",  0, 100, cfg.seVolume   !== undefined ? cfg.seVolume   : 100));

        var hr = document.createElement("hr");
        hr.className = "psdiv";
        panel.appendChild(hr);

        // toggles
        panel.appendChild(checkRow("Always Dash",       "ps_dash", cfg.alwaysDash      || false));
        panel.appendChild(checkRow("Remember Commands", "ps_cmd",  cfg.commandRemember || false));

        // action buttons
        var row = document.createElement("div");
        row.id  = "PalSetBtns";

        var cancelBtn = document.createElement("button");
        cancelBtn.className   = "psabtn cancel";
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", function () { self._palCloseSettings(false); });

        var saveBtn = document.createElement("button");
        saveBtn.className   = "psabtn save";
        saveBtn.textContent = "Save";
        saveBtn.addEventListener("click", function () { self._palCloseSettings(true); });

        row.appendChild(cancelBtn);
        row.appendChild(saveBtn);
        panel.appendChild(row);

        bd.appendChild(panel);
        document.body.appendChild(bd);

        bd.addEventListener("click", function (e) {
            if (e.target === bd) self._palCloseSettings(false);
        });
    };

    Scene_Title.prototype._palOpenSettings = function () {
        SoundManager.playOk();
        var bd = document.getElementById("PalSetBd");
        if (!bd) return;

        function setSlider(id, v) {
            var el = document.getElementById(id);
            var vl = document.getElementById(id + "_v");
            if (el) el.value = v;
            if (vl) vl.textContent = v;
        }
        function setCheck(id, v) {
            var el = document.getElementById(id);
            if (el) el.checked = !!v;
        }

        var c = ConfigManager;
        setSlider("ps_bgm", c.bgmVolume  !== undefined ? c.bgmVolume  : 100);
        setSlider("ps_bgs", c.bgsVolume  !== undefined ? c.bgsVolume  : 100);
        setSlider("ps_me",  c.meVolume   !== undefined ? c.meVolume   : 100);
        setSlider("ps_se",  c.seVolume   !== undefined ? c.seVolume   : 100);
        setCheck("ps_dash", c.alwaysDash      || false);
        setCheck("ps_cmd",  c.commandRemember || false);

        wireSlider("ps_bgm", function (v) { AudioManager.bgmVolume = v; });
        wireSlider("ps_bgs", function (v) { AudioManager.bgsVolume = v; });
        wireSlider("ps_me",  function (v) { AudioManager.meVolume  = v; });
        wireSlider("ps_se",  function (v) { AudioManager.seVolume  = v; });

        bd.classList.add("open");
    };

    Scene_Title.prototype._palCloseSettings = function (save) {
        var bd = document.getElementById("PalSetBd");
        if (!bd) return;

        if (save) {
            function gSlider(id) { var el = document.getElementById(id); return el ? Number(el.value) : null; }
            function gCheck(id)  { var el = document.getElementById(id); return el ? el.checked : null; }

            var bgm  = gSlider("ps_bgm"); var bgs = gSlider("ps_bgs");
            var me   = gSlider("ps_me");  var se  = gSlider("ps_se");
            var dash = gCheck("ps_dash"); var cmd = gCheck("ps_cmd");

            if (bgm  !== null) ConfigManager.bgmVolume       = bgm;
            if (bgs  !== null) ConfigManager.bgsVolume       = bgs;
            if (me   !== null) ConfigManager.meVolume        = me;
            if (se   !== null) ConfigManager.seVolume        = se;
            if (dash !== null) ConfigManager.alwaysDash      = dash;
            if (cmd  !== null) ConfigManager.commandRemember = cmd;

            ConfigManager.save();
            SoundManager.playSave();
            this._palToast("Settings saved!");
        } else {
            // Revert live audio changes
            var c = ConfigManager;
            AudioManager.bgmVolume = c.bgmVolume !== undefined ? c.bgmVolume : 100;
            AudioManager.bgsVolume = c.bgsVolume !== undefined ? c.bgsVolume : 100;
            AudioManager.meVolume  = c.meVolume  !== undefined ? c.meVolume  : 100;
            AudioManager.seVolume  = c.seVolume  !== undefined ? c.seVolume  : 100;
            SoundManager.playCancel();
        }

        bd.classList.remove("open");
    };

    // =========================================================================
    // Confirm dialog
    // =========================================================================

    Scene_Title.prototype._palBuildConfirm = function () {
        var bd  = document.createElement("div");
        bd.id   = "PalCfmBd";

        var dlg = document.createElement("div");
        dlg.id  = "PalCfmDlg";

        var msg = document.createElement("p");
        msg.id  = "PalCfmMsg";
        dlg.appendChild(msg);

        var row = document.createElement("div");
        row.id  = "PalCfmBtns";

        var yes = document.createElement("button");
        yes.id          = "PalCfmYes";
        yes.className   = "pcbtn yes";
        yes.textContent = "Yes, Exit";

        var no = document.createElement("button");
        no.className   = "pcbtn no";
        no.textContent = "Cancel";
        no.addEventListener("click", function () {
            SoundManager.playCancel();
            bd.classList.remove("open");
        });

        row.appendChild(yes);
        row.appendChild(no);
        dlg.appendChild(row);
        bd.appendChild(dlg);
        document.body.appendChild(bd);
    };

    Scene_Title.prototype._palConfirm = function (message, onYes) {
        SoundManager.playOk();
        var bd  = document.getElementById("PalCfmBd");
        var msg = document.getElementById("PalCfmMsg");
        var yes = document.getElementById("PalCfmYes");
        if (!bd || !msg || !yes) return;

        msg.textContent = message;
        var fresh = yes.cloneNode(true);
        yes.parentNode.replaceChild(fresh, yes);
        fresh.addEventListener("click", function () {
            SoundManager.playOk();
            bd.classList.remove("open");
            if (onYes) onYes();
        });
        bd.classList.add("open");
    };

    // =========================================================================
    // Toast
    // =========================================================================

    Scene_Title.prototype._palToast = function (text, ms) {
        ms = ms || 2200;
        var el = document.getElementById("PalToast");
        if (!el) return;
        el.textContent = text;
        el.classList.add("show");
        clearTimeout(this._palToastTid);
        this._palToastTid = setTimeout(function () {
            el.classList.remove("show");
        }, ms);
    };

})();
