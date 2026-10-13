//=============================================================================
// MapGen.js — Dynamic Dungeon Generator for RPG Maker MV
// Author  : Custom
// Version : 2.0.0
//=============================================================================
/*:
 * @plugindesc v2.0 Procedurally generates a fully-playable dungeon on the
 * current map using BSP-tree room placement and recursive-backtracker (DFS)
 * corridor carving. Works on any map size; configurable via parameters.
 *
 * @author Custom
 *
 * ─── TILE IDs ────────────────────────────────────────────────────────────────
 * @param FloorTileId
 * @text Floor Tile (A2 base)
 * @type number
 * @min 2816
 * @max 4351
 * @desc Base A2 autotile ID for the walkable floor.
 *       RPG Maker resolves the correct shape variant from neighbours.
 *       Default matches the dungeon floor in Map003 (tilesetId 3).
 * @default 4064
 *
 * @param FloorAccentId
 * @text Floor Accent Tile (A2 base)
 * @type number
 * @min 2816
 * @max 4351
 * @desc Secondary A2 floor tile scattered randomly for texture variation.
 *       Set to the same value as FloorTileId to disable accents.
 * @default 4112
 *
 * @param WallTileId
 * @text Wall Tile (A4 base)
 * @type number
 * @min 5888
 * @max 8191
 * @desc Base A4 autotile ID for solid wall cells (layer 0).
 *       The engine resolves top/face variants automatically.
 * @default 5888
 *
 * @param PillarTileId
 * @text Pillar / Decoration Tile (B–E sheet)
 * @type number
 * @min 0
 * @max 1023
 * @desc Optional B-sheet tile placed as pillars inside large rooms.
 *       Set to 0 to skip pillar decoration entirely.
 * @default 0
 *
 * ─── BSP PARAMETERS ──────────────────────────────────────────────────────────
 * @param BSP_Depth
 * @text BSP Split Depth
 * @type number
 * @min 2
 * @max 8
 * @desc How many times to recursively halve the map.
 *       Depth 4 → ~16 leaves → up to 16 rooms on a 60×40 map.
 * @default 4
 *
 * @param BSP_MinLeafSize
 * @text BSP Minimum Leaf Size
 * @type number
 * @min 8
 * @max 30
 * @desc Smallest cell (in tiles) a leaf may be before splitting stops.
 * @default 10
 *
 * @param Room_MinSize
 * @text Room Minimum Size
 * @type number
 * @min 4
 * @max 15
 * @desc Minimum room width or height (tiles, inside walls).
 * @default 5
 *
 * @param Room_MaxPad
 * @text Room Maximum Padding
 * @type number
 * @min 1
 * @max 6
 * @desc Max random padding between a leaf boundary and the room edge.
 * @default 3
 *
 * @param AccentChance
 * @text Accent Tile Chance (0–100)
 * @type number
 * @min 0
 * @max 100
 * @desc Percentage chance for any floor tile to use the accent variant.
 * @default 12
 *
 * ─── CORRIDOR PARAMETERS ─────────────────────────────────────────────────────
 * @param CorridorWidth
 * @text Corridor Width
 * @type number
 * @min 1
 * @max 3
 * @desc Width in tiles for carved corridors. 1 = tight, 2 = comfortable.
 * @default 2
 *
 * ─── GENERATION CONTROL ──────────────────────────────────────────────────────
 * @param AutoGenerate
 * @text Auto-Generate on Map Load
 * @type boolean
 * @on Yes
 * @off No
 * @desc If ON, GenerateDungeon runs automatically when this map is loaded.
 *       Use the TargetMapIds parameter to restrict which maps auto-generate.
 * @default false
 *
 * @param TargetMapIds
 * @text Target Map IDs (comma list)
 * @type string
 * @desc Comma-separated map IDs that auto-generation should apply to.
 *       Leave blank to apply to every map when AutoGenerate is ON.
 * @default
 *
 * @param Seed
 * @text Fixed Seed (0 = random)
 * @type number
 * @min 0
 * @desc Set a non-zero integer to get a reproducible dungeon.
 *       Useful for debugging. 0 means a new dungeon every time.
 * @default 0
 *
 * ─── DEBUG ───────────────────────────────────────────────────────────────────
 * @param Debug Logging
 * @text Debug Logging
 * @type boolean
 * @on  Enable
 * @off Disable
 * @default false
 * @desc Log dungeon generation details (seed, room count, warnings) to the
 *       browser console. Requires RPGReloaded Master Debug to also be ON.
 *
 * ─── HELP ────────────────────────────────────────────────────────────────────
 * @help
 * ════════════════════════════════════════════════════════════════════
 *  MapGen — Dynamic Dungeon Generator  v2.0
 * ════════════════════════════════════════════════════════════════════
 *
 *  WHAT IT DOES
 *  ────────────
 *  Carves a unique dungeon into the current map every time you call it,
 *  using two well-known algorithms:
 *
 *    1. BSP Tree (Binary Space Partitioning)
 *       Recursively splits the map rectangle into smaller cells, then
 *       places one room inside each leaf cell with randomised padding.
 *       Guarantees no overlapping rooms and good spatial coverage.
 *
 *    2. Recursive Backtracker (DFS Maze) for Corridors
 *       Walks the BSP room graph depth-first, connecting rooms with
 *       L-shaped corridors. Every room is reachable — guaranteed.
 *       A small loop-back chance (15 %) adds shortcuts so the dungeon
 *       never feels like a boring spanning tree.
 *
 *  HOW TO USE
 *  ──────────
 *  ① In the Plugin Manager, enable MapGen.js and configure the
 *    parameters above to match your tileset.
 *
 *  ② Trigger dungeon generation with a Plugin Command:
 *
 *      GenerateDungeon
 *          Generates with the plugin Seed (random if 0).
 *
 *      GenerateDungeon [seed]
 *          Overrides the seed for this call only.
 *          Example:  GenerateDungeon 42
 *
 *      GenerateDungeon [seed] [enemyEventIds] [itemEventIds]
 *          Also scatters existing map events into random rooms.
 *          IDs are comma-separated.
 *          Example:  GenerateDungeon 0 1,2,3 4,5
 *
 *  ③ The player is automatically placed in the centre of the first room.
 *
 *  NOTES
 *  ─────
 *  • The plugin writes directly to $dataMap.data and then forces a full
 *    tilemap refresh, so you will see the dungeon immediately.
 *  • The map width and height are read from $dataMap at generation time,
 *    so resize the map in the editor to get a larger dungeon.
 *  • All six data layers are reset each time GenerateDungeon is called.
 *  • Region IDs written by the plugin (layer 5) are cleared to 0.
 *  • For best results use a map of at least 40×30 tiles.
 *
 * ════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    //  0.  Seeded PRNG  (mulberry32 — fast, good quality, fully reproducible)
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * Returns a closure that emits pseudo-random floats in [0, 1) for a given
     * 32-bit integer seed. Using a dedicated PRNG instead of Math.random()
     * makes every dungeon fully reproducible from its seed.
     * Based on the public-domain mulberry32 algorithm.
     * @param {number} seed - 32-bit integer
     * @returns {function(): number}
     */
    function makePRNG(seed) {
        var s = seed >>> 0;
        if (s === 0) s = 0xDEADBEEF; // never allow a zero state
        return function () {
            s |= 0;
            s = s + 0x6D2B79F5 | 0;
            var t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  1.  Parameter parsing
    // ─────────────────────────────────────────────────────────────────────────
    var _params = PluginManager.parameters('MapGen');

    var CFG = {
        floorId      : Number(_params['FloorTileId']    || 4064),
        accentId     : Number(_params['FloorAccentId']  || 4112),
        wallId       : Number(_params['WallTileId']     || 5888),
        pillarId     : Number(_params['PillarTileId']   || 0),
        bspDepth     : Number(_params['BSP_Depth']      || 4),
        bspMinLeaf   : Number(_params['BSP_MinLeafSize']|| 10),
        roomMin      : Number(_params['Room_MinSize']   || 5),
        roomPad      : Number(_params['Room_MaxPad']    || 3),
        accentChance : Number(_params['AccentChance']   || 12) / 100,
        corridorW    : Number(_params['CorridorWidth']  || 2),
        autoGen      : String(_params['AutoGenerate']   || 'false') === 'true',
        targetMaps   : String(_params['TargetMapIds']   || '').split(',').map(Number).filter(Boolean),
        fixedSeed    : Number(_params['Seed']           || 0)
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  2.  Plugin command
    // ─────────────────────────────────────────────────────────────────────────
    var _alias_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function (command, args) {
        _alias_pluginCommand.call(this, command, args);
        if (command === 'GenerateDungeon') {
            var seed       = args[0] ? Number(args[0]) : CFG.fixedSeed;
            var enemyIds   = args[1] ? args[1].split(',').map(Number).filter(Boolean) : [];
            var itemIds    = args[2] ? args[2].split(',').map(Number).filter(Boolean) : [];
            DungeonGen.generate(seed, enemyIds, itemIds);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  3.  Auto-generate hook
    // ─────────────────────────────────────────────────────────────────────────
    if (CFG.autoGen) {
        var _alias_onMapLoaded = Scene_Map.prototype.onMapLoaded;
        Scene_Map.prototype.onMapLoaded = function () {
            _alias_onMapLoaded.call(this);
            var mapId = $gameMap.mapId();
            if (CFG.targetMaps.length === 0 || CFG.targetMaps.indexOf(mapId) >= 0) {
                DungeonGen.generate(CFG.fixedSeed, [], []);
            }
        };
    }

    // =========================================================================
    //  DungeonGen  —  main namespace
    // =========================================================================
    var DungeonGen = {};

    // ─────────────────────────────────────────────────────────────────────────
    //  3.  Low-level tile helpers
    // ─────────────────────────────────────────────────────────────────────────

    /** Write a tile ID to layer z at map coordinate (x, y). */
    DungeonGen.setTile = function (x, y, z, id) {
        var w = $dataMap.width, h = $dataMap.height;
        if (x >= 0 && x < w && y >= 0 && y < h) {
            $dataMap.data[(z * h + y) * w + x] = id;
        }
    };

    /** Read the tile ID from layer z at map coordinate (x, y). */
    DungeonGen.getTile = function (x, y, z) {
        var w = $dataMap.width, h = $dataMap.height;
        if (x >= 0 && x < w && y >= 0 && y < h) {
            return $dataMap.data[(z * h + y) * w + x];
        }
        return 0;
    };

    /**
     * Wipe all 6 data layers to 0.
     * This is always the first step so previous dungeon data is gone.
     */
    DungeonGen.clearAllLayers = function () {
        var total = $dataMap.width * $dataMap.height * 6;
        for (var i = 0; i < total; i++) $dataMap.data[i] = 0;
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  4.  Seeded floor/accent helper
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * Carve (x, y) as a passable floor tile using the PRNG to
     * occasionally substitute the accent variant for visual variety.
     */
    DungeonGen.carveFloor = function (x, y, rng) {
        var id = (rng() < CFG.accentChance) ? CFG.accentId : CFG.floorId;
        this.setTile(x, y, 0, id);
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  5.  BSP Tree  —  room partitioning
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * A BSP leaf / node.
     * @typedef  {Object} BSPNode
     * @property {number} x,y,w,h - Bounding rectangle (leaf space)
     * @property {BSPNode|null} left,right - Children after split
     * @property {Rect|null}   room        - Room carved inside this leaf
     */

    /**
     * @typedef  {Object} Rect
     * @property {number} x,y,w,h - Position and size
     * @property {number} cx,cy   - Centre tile
     */

    /**
     * Build a BSP tree by recursively splitting `node` up to `depth` times.
     * @param {BSPNode} node
     * @param {number}  depth
     * @param {function} rng
     */
    DungeonGen.bspSplit = function (node, depth, rng) {
        if (depth === 0) return;

        var minLeaf = CFG.bspMinLeaf;

        // Decide split axis: prefer the longer axis, add a bit of randomness.
        var horizontal = (node.h > node.w) ? true
                       : (node.w > node.h) ? false
                       : (rng() < 0.5);

        var maxCut, cut;
        if (horizontal) {
            // Cannot split if the result would be too small.
            maxCut = node.h - minLeaf;
            if (maxCut <= minLeaf) return;
            cut = Math.floor(rng() * (maxCut - minLeaf + 1)) + minLeaf;
            node.left  = { x: node.x, y: node.y,      w: node.w, h: cut,           left: null, right: null, room: null };
            node.right = { x: node.x, y: node.y + cut, w: node.w, h: node.h - cut, left: null, right: null, room: null };
        } else {
            maxCut = node.w - minLeaf;
            if (maxCut <= minLeaf) return;
            cut = Math.floor(rng() * (maxCut - minLeaf + 1)) + minLeaf;
            node.left  = { x: node.x,      y: node.y, w: cut,           h: node.h, left: null, right: null, room: null };
            node.right = { x: node.x + cut, y: node.y, w: node.w - cut, h: node.h, left: null, right: null, room: null };
        }

        this.bspSplit(node.left,  depth - 1, rng);
        this.bspSplit(node.right, depth - 1, rng);
    };

    /**
     * Collect all leaf nodes of the BSP tree into an array.
     * @param {BSPNode} node
     * @param {BSPNode[]} out
     */
    DungeonGen.bspLeaves = function (node, out) {
        if (!node.left && !node.right) {
            out.push(node);
        } else {
            if (node.left)  this.bspLeaves(node.left,  out);
            if (node.right) this.bspLeaves(node.right, out);
        }
    };

    /**
     * Carve a room inside each BSP leaf.
     * The room is randomly padded inside the leaf boundary so rooms never
     * touch each other (the leaf itself acts as the buffer zone).
     * @param {BSPNode[]} leaves
     * @param {function}  rng
     * @returns {Rect[]} Array of room rectangles
     */
    DungeonGen.carveRooms = function (leaves, rng) {
        var rooms = [];
        var self  = this;

        leaves.forEach(function (leaf) {
            var pad  = Math.floor(rng() * CFG.roomPad) + 1;
            var minW = CFG.roomMin;
            var minH = CFG.roomMin;
            var maxW = leaf.w - pad * 2;
            var maxH = leaf.h - pad * 2;

            // Guard: leaf is too tiny to fit a room.
            if (maxW < minW || maxH < minH) return;

            var rw = Math.floor(rng() * (maxW - minW + 1)) + minW;
            var rh = Math.floor(rng() * (maxH - minH + 1)) + minH;
            var rx = leaf.x + pad + Math.floor(rng() * (maxW - rw + 1));
            var ry = leaf.y + pad + Math.floor(rng() * (maxH - rh + 1));

            var room = {
                x  : rx,
                y  : ry,
                w  : rw,
                h  : rh,
                cx : rx + Math.floor(rw / 2),
                cy : ry + Math.floor(rh / 2)
            };

            leaf.room = room;
            rooms.push(room);

            // Carve the floor tiles (leave a 1-tile wall border around each room).
            for (var ty = ry; ty < ry + rh; ty++) {
                for (var tx = rx; tx < rx + rw; tx++) {
                    self.carveFloor(tx, ty, rng);
                }
            }
        });

        return rooms;
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  6.  Corridor carving  —  L-shaped tunnels
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * Carve a horizontal strip of floor from x0 to x1 at row y.
     * Corridor width is expanded downward (or upward if near edge).
     */
    DungeonGen.carveH = function (x0, x1, y, rng) {
        var minX = Math.min(x0, x1);
        var maxX = Math.max(x0, x1);
        var cw   = CFG.corridorW;
        for (var tx = minX; tx <= maxX; tx++) {
            for (var dy = 0; dy < cw; dy++) {
                this.carveFloor(tx, y + dy, rng);
            }
        }
    };

    /**
     * Carve a vertical strip of floor from y0 to y1 at column x.
     * Corridor width is expanded rightward.
     */
    DungeonGen.carveV = function (x, y0, y1, rng) {
        var minY = Math.min(y0, y1);
        var maxY = Math.max(y0, y1);
        var cw   = CFG.corridorW;
        for (var ty = minY; ty <= maxY; ty++) {
            for (var dx = 0; dx < cw; dx++) {
                this.carveFloor(x + dx, ty, rng);
            }
        }
    };

    /**
     * Connect two rooms with an L-shaped corridor.
     * Randomly chooses which corner to bend at to keep tunnels varied.
     */
    DungeonGen.connectRooms = function (a, b, rng) {
        if (rng() < 0.5) {
            // Horizontal first, then vertical.
            this.carveH(a.cx, b.cx, a.cy, rng);
            this.carveV(b.cx, a.cy, b.cy, rng);
        } else {
            // Vertical first, then horizontal.
            this.carveV(a.cx, a.cy, b.cy, rng);
            this.carveH(a.cx, b.cx, b.cy, rng);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  7.  Recursive-backtracker corridor graph  (DFS over BSP tree)
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * Walk the BSP tree in DFS order and connect sibling rooms.
     * When two subtrees are merged, the "representative room" of each is
     * connected so every leaf is reachable.
     *
     * Additionally, with a small probability each pair also adds a
     * secondary loop corridor so the dungeon has multiple paths.
     *
     * Returns the representative room for `node` (the room closest to the
     * centre of the node, for natural-looking connections).
     *
     * @param {BSPNode}  node
     * @param {function} rng
     * @returns {Rect|null}
     */
    DungeonGen.dfsConnect = function (node, rng) {
        if (!node) return null;

        // Leaf: return its room directly.
        if (!node.left && !node.right) return node.room;

        var leftRoom  = this.dfsConnect(node.left,  rng);
        var rightRoom = this.dfsConnect(node.right, rng);

        if (leftRoom && rightRoom) {
            this.connectRooms(leftRoom, rightRoom, rng);

            // ~15 % chance: add an extra cross-corridor for loops.
            if (rng() < 0.15) {
                this.connectRooms(rightRoom, leftRoom, rng);
            }
        }

        // Return whichever room exists as the representative.
        return leftRoom || rightRoom;
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  8.  Wall fill pass
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * After all floor tiles are carved, paint every remaining empty tile
     * with the wall autotile.  RPG Maker MV's tilemap engine reads the
     * neighbours at render time and selects the right autotile shape,
     * so we only need to write the base tile ID.
     */
    DungeonGen.fillWalls = function () {
        var w = $dataMap.width, h = $dataMap.height;
        for (var y = 0; y < h; y++) {
            for (var x = 0; x < w; x++) {
                if (this.getTile(x, y, 0) === 0) {
                    this.setTile(x, y, 0, CFG.wallId);
                }
            }
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  9.  Room decoration  —  pillars
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * Place symmetric pillars near the corners of rooms that are large
     * enough to accommodate them.  Pillars are placed on layer 2 (object),
     * so they appear above the player.
     * Only active when CFG.pillarId > 0.
     */
    DungeonGen.decorateRooms = function (rooms, rng) {
        if (!CFG.pillarId) return;
        var self = this;
        rooms.forEach(function (room) {
            if (room.w < 8 || room.h < 7) return;
            // Inner corners, inset 2 tiles from each edge.
            var pts = [
                { x: room.x + 2,          y: room.y + 1          },
                { x: room.x + room.w - 3, y: room.y + 1          },
                { x: room.x + 2,          y: room.y + room.h - 2 },
                { x: room.x + room.w - 3, y: room.y + room.h - 2 }
            ];
            pts.forEach(function (pt) {
                // Only place if the tile below is floor (sanity check).
                if (self.getTile(pt.x, pt.y, 0) !== 0) {
                    self.setTile(pt.x, pt.y, 2, CFG.pillarId);
                }
            });
        });
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  10.  Event placement
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * Scatter a list of existing map events into random floor tiles across
     * all rooms except the first (the player's start room).
     *
     * @param {number[]} eventIds - Array of $gameMap event IDs
     * @param {Rect[]}   rooms    - Full room list
     * @param {Set}      usedKeys - Set of "x,y" strings already occupied
     * @param {function} rng
     */
    DungeonGen.scatterEvents = function (eventIds, rooms, usedKeys, rng) {
        if (!eventIds.length || rooms.length < 2) return;
        var self      = this;
        var spawnPool = rooms.slice(1); // skip player start room

        eventIds.forEach(function (id) {
            var ev = $gameMap.event(id);
            if (!ev) return;

            // Try up to 50 random positions before giving up.
            for (var attempt = 0; attempt < 50; attempt++) {
                var room = spawnPool[Math.floor(rng() * spawnPool.length)];
                var tx   = room.x + 1 + Math.floor(rng() * (room.w - 2));
                var ty   = room.y + 1 + Math.floor(rng() * (room.h - 2));
                var key  = tx + ',' + ty;
                var tile = self.getTile(tx, ty, 0);

                if (!usedKeys.has(key) && tile !== 0 && tile !== CFG.wallId) {
                    usedKeys.add(key);
                    ev.locate(tx, ty);
                    ev.refresh();
                    return;
                }
            }
        });
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  11.  Tilemap refresh
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * Force the visible tilemap to rebuild from $dataMap.data.
     * Without this step the screen would still show the old tiles.
     */
    DungeonGen.refreshTilemap = function () {
        // $gameMap caches tile data — clear it.
        if ($gameMap._tileEventsCache) $gameMap._tileEventsCache = {};

        var scene = SceneManager._scene;
        if (scene && scene._spriteset && scene._spriteset._tilemap) {
            var tm = scene._spriteset._tilemap;
            tm.refresh();          // MV v1.6+: marks all chunks dirty
            tm._needsRepaint = true; // belt-and-suspenders
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  12.  Master generate function
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * Main entry point.  Runs the full pipeline:
     *   clear → BSP build → room carve → corridor DFS → wall fill
     *   → decorate → place player → scatter events → refresh
     *
     * @param {number}   seed      - PRNG seed (0 = random)
     * @param {number[]} enemyIds  - Event IDs to scatter as enemies
     * @param {number[]} itemIds   - Event IDs to scatter as items/chests
     */
    DungeonGen.generate = function (seed, enemyIds, itemIds) {
        if (!$dataMap || !$dataMap.data) {
            if (window.RPGRXDebug && window.RPGRXDebug('MapGen')) {
                console.warn('[MapGen] No $dataMap available. Call GenerateDungeon from an event on the map.');
            }
            return;
        }

        // ── 12-a. Seed ──────────────────────────────────────────────────────
        if (!seed || seed === 0) seed = Math.floor(Math.random() * 0xFFFFFFFF) + 1;
        var rng = makePRNG(seed);
        if (window.RPGRXDebug && window.RPGRXDebug('MapGen')) {
            console.log('[MapGen] Generating dungeon — seed: ' + seed +
                        ', map: ' + $dataMap.width + '×' + $dataMap.height);
        }

        // ── 12-b. Clear ─────────────────────────────────────────────────────
        this.clearAllLayers();

        // ── 12-c. BSP split ─────────────────────────────────────────────────
        var root = {
            x: 1, y: 1,
            w: $dataMap.width  - 2,
            h: $dataMap.height - 2,
            left: null, right: null, room: null
        };
        // Clamp BSP depth based on map size so tiny maps don't explode.
        var maxDepth = CFG.bspDepth;
        var minDim   = Math.min(root.w, root.h);
        while (maxDepth > 1 && Math.pow(2, maxDepth) * CFG.bspMinLeaf > minDim) {
            maxDepth--;
        }
        this.bspSplit(root, maxDepth, rng);

        // ── 12-d. Collect leaves and carve rooms ────────────────────────────
        var leaves = [];
        this.bspLeaves(root, leaves);

        var rooms = this.carveRooms(leaves, rng);
        if (rooms.length === 0) {
            if (window.RPGRXDebug && window.RPGRXDebug('MapGen')) {
                console.warn('[MapGen] No rooms were generated. Map may be too small.');
            }
            return;
        }

        // ── 12-e. Connect rooms with DFS corridors ──────────────────────────
        this.dfsConnect(root, rng);

        // ── 12-f. Fill remaining tiles as walls ─────────────────────────────
        this.fillWalls();

        // ── 12-g. Decorate (optional pillars) ───────────────────────────────
        this.decorateRooms(rooms, rng);

        // ── 12-h. Place player in centre of first room ──────────────────────
        var startRoom = rooms[0];
        $gamePlayer.locate(startRoom.cx, startRoom.cy);
        $gamePlayer.center(startRoom.cx, startRoom.cy);
        $gamePlayer.refresh();

        // ── 12-i. Scatter events ────────────────────────────────────────────
        var usedKeys = new Set();
        usedKeys.add(startRoom.cx + ',' + startRoom.cy);
        this.scatterEvents(enemyIds, rooms, usedKeys, rng);
        this.scatterEvents(itemIds,  rooms, usedKeys, rng);

        // ── 12-j. Rebuild the tilemap ────────────────────────────────────────
        this.refreshTilemap();

        if (window.RPGRXDebug && window.RPGRXDebug('MapGen')) {
            console.log('[MapGen] Done — ' + rooms.length + ' rooms generated.');
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  13.  Expose to window for debugging / external scripts
    // ─────────────────────────────────────────────────────────────────────────
    window.DungeonGen = DungeonGen;

})();
