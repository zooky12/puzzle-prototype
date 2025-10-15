# Puzzle Level Maker — Project Reference

This document is a comprehensive reference for the repository. It describes core data structures, mechanics, and all exported/public functions across modules.

Sections
- Overview and Data Model
- Core Mechanics (movement, push, flight, fragile, goals)
- Core Modules API (`core/*`)
- Motion Modules API (`core/motion/*`)
- Engine Effects API (`core/engine/effects.js`)
- Solver Modules API (`solver/*`)
- Evaluator (Scoring) API (`solver/evaluator.js`)
- UI Modules API (`ui/*`)

## Overview and Data Model

State shape
- `state.size: { rows:number, cols:number }`
- `state.base: string[rows][cols]` — tile ids, default `'floor'`
- `state.entities: Array<{ type:string, x:number, y:number, state?:any, underTile?:string }>`
  - `type` is one of `EntityTypes` (see below)
  - Player entity (type `player`) uses `state: { mode:'free'|'inbox', entryDir:{dx:number,dy:number} }`

Tiles (`core/tiles.js`)
- Registry key → trait flags:
  - `floor` (no traits)
  - `wall` (blocks player/box, `isNotFly`)
  - `hole` (`isHoleForPlayer`, `isHoleForBox`)
  - `exit` (`isEnd`)
  - `spikes` (`isWallForBox`, `isStickOnFly`)
  - `grile` (`isHoleForPlayer`)
  - `pressurePlate` (`requiresBox`)
  - `holeSpikes` (`isWallForBox`, `isStickOnFly`, `isHoleForPlayer`)
  - `slimPathFloor` (`isWallForBox`)
  - `slimPathHole` (`isWallForBox`, `isHoleForPlayer`)
  - `fragileWall` (`isWallForPlayer`, `isWallForBox`, `isFragile`)

Entities (`core/entities.js`)
- `EntityTypes`: `player`, `box`, `heavyBox`, `fragileWall`
- Registry fields:
  - `drawColor` (UI hint)
  - `solid` (blocks other entities)
  - `pushable` (part of push chains)
  - `heavy` (heavy boxes trigger special rules)
  - `fragile` (breakable on flight)
  - `underTile` (for `fragileWall` entity only; base tile to restore upon breaking)

Effects (`core/engine/effects.js`)
- `entityMoved`: `{ type:'entityMoved', entityType, from:{x,y}, to:{x,y} }`
- `tileChanged`: `{ type:'tileChanged', pos:{x,y}, from, to }`
- `boxFell`: `{ type:'boxFell', pos:{x,y} }`

## Core Mechanics

Player modes
- `free`: normal walking. Blocked by `isWallForPlayer`. Holes end the game if entered.
- `inbox`: player is over a pushable entity (box/heavyBox). Movement actions move that entity forward if rules permit. Special reverse input triggers “flight”.

Push chains (boxes)
- If the front cell has a pushable chain, plan from front until an empty or pushable cell, checking walls-for-box and hard blocks.
- Apply chain back-to-front. If terminal cell is `isHoleForBox`, the last pushed entity falls and is removed (`boxFell`).

Flight
- Trigger: from `inbox` mode, pressing the reverse of `entryDir` into a passable cell that is not `isWallForPlayer`.
- Resolution scans forward until blocked by `isNotFly` or a fragile (entity or tile). On hitting fragile, the fragile entity is removed (and base tile optionally restored) and/or fragile tile is replaced with `floor` (`tileChanged`). Flight stops at the previous cell; mode becomes `free` (or stays `inbox` if landing over a box).

Fragile walls
- As entity: type `fragileWall` placed on top of a base tile. When broken (flight), entity is removed and base tile becomes `underTile` (default to the original base tile).
- As tile: tile id `fragileWall` with `isFragile` trait; breaks into `floor` when hit by flight.

Goals
- Win: player in `free` mode stands on `isEnd` tile, and `computeExitActive(state)` is true.
- Exit activation: `pressurePlate` tiles all need to be occupied by a box/heavyBox.
- Lose: player on illegal tile for current mode (hole for player in `free`, hole-for-box in `inbox`).

## Core Modules API

core/engine.js
- `stepMove(state, { dx, dy }) → { newState, effects, changed }`
  - Delegates to the player state machine. `changed` indicates if any movement happened.

core/player/stateMachine.js
- `stepPlayerMove(state, { dx, dy }) → { newState, effects, changed }`
  - Dispatch to handlers in order: `InboxHeavy`, `InboxBox`, `Free` by checking `canHandle`.

core/player/states/free.js
- `canHandle(state, player) → boolean` — `player.state.mode === 'free'`
- `handleInput(state, player, { dx, dy }) → { newState, effects, changed }`
  - Validates bounds and `isWallForPlayer`. If front is pushable, transitions to `inbox` and steps into it; otherwise walks if front is not solid.

core/player/states/inboxBox.js
- `canHandle(state, player, under) → boolean` — `mode==='inbox'` and `under.type==='box'`
- `handleInput(state, player, { dx, dy })`
  - Reverse into flight (see Flight). Otherwise, push front chain if possible; if front is hole-for-box, remove the box under player and move player; else slide box forward and follow.

core/player/states/inboxHeavy.js
- `canHandle(state, player, under) → boolean` — `mode==='inbox'` and `under.type==='heavyBox'`
- `handleInput(state, player, { dx, dy })`
  - Same reverse-to-flight as normal box. Heavy-specific behaviors:
    - When moving in `entryDir`, keeps `entryDir` until movement resolves; after moving without extra pushes, neutralizes `entryDir`.
    - When `entryDir` is neutral, the heavy cannot push another box: a pushable directly in front acts like a wall. If the front cell is empty (or a hole-for-box), the heavy moves forward and sets `entryDir = -dir` (falls if hole).
    - Push chains and hole-falls (when not neutral) behave like `box` otherwise.

core/state.js
- Construction and cloning:
  - `createEmptyState(rows, cols)`
  - `cloneState(state)` — deep-ish clone preserving entity states
- Grid resizing (immutable-return):
  - `addRow(state, position='bottom')|removeRow(state, position='bottom') → state|null`
  - `addColumn(state, position='right')|removeColumn(state, position='right') → state|null`
  - `compactState(state) → state|null` — remove empty border rows/cols
- Entities accessors/mutators:
  - `findPlayer(state) → entity|null`
  - `entitiesAt(state, x, y) → entity[]`
  - `firstEntityAt(state, x, y, predicate?) → entity|null`
  - `anyBoxAt(state, x, y) → {type}|null`
  - `removeEntityAt(state, x, y, predicate?)`
  - `moveEntity(state, entity, toX, toY)`
- Serialization:
  - `serializeState(state) → string`
  - `deserializeState(jsonOrObject) → state` (backward-compatible with older formats)
- Validation:
  - `ensurePlayerValidPosition(state) → state` — fixes illegal initial player placement by scanning for nearest legal cell

core/tiles.js
- `TileRegistry: Record<string, traits>`
- `getTileTraits(type) → traits`
- `isTrait(type, key) → boolean`

core/entities.js
- `EntityTypes` — constants
- `EntityRegistry` — draw/behavior flags
- Helpers: `isPushable(e)`, `isSolid(e)`, `isHeavy(e)`, `isFragile(e)`

core/goals.js
- `computeExitActive(state) → boolean` — all `pressurePlate` tiles pressed by boxes
- `isWinningState(state) → boolean`
- `isLosingState(state) → boolean`

## Motion Modules API

core/motion/push.js
- `planPushChain(state, x, y, dx, dy) → { ok:boolean, chain:entity[], end:{x,y}, endIsHole:boolean }`
- `applyPushChain(state, chain, dx, dy) → effects[]`
- `applyPushChainWithFall(state, chain, dx, dy) → effects[]` — removes last entity and emits `boxFell`

core/motion/flight.js
- `resolveFlight(state, px, py, fdx, fdy) → { x, y, mode:'free'|'inbox', entryDir?, effects[] }`
- `breakFragileEntityIfNeeded(state, x, y, effects)` — removes `fragileWall` entity and restores `underTile`
- `breakFragileTileIfNeeded(state, x, y, effects)` — replaces fragile tile with `floor`

## Engine Effects API

core/engine/effects.js
- `effectEntityMoved(entity, from, to)`
- `effectTileChanged(pos, from, to)`
- `effectBoxFell(pos)`

## Solver Modules API

solver/solver.js
- `runSolver(initialState, { maxDepth=100, maxNodes=200000, maxSolutions=50, onProgress } = {}) → Promise<{ solutions, deadEnds, stats, graph }>`
  - BFS over state space. Uses Zobrist hashing for dedup. Filters near-duplicate solutions.
  - `solutions: Array<{ moves:string, length:number }>` (filtered)
  - `deadEnds: Array<{ moves:string, length:number }>` (filtered by edit proximity)
  - `stats: { nodesExpanded, rawSolutions, rawDeadEnds }`
  - `graph: { startHash, processed:Set<string>, edges:Array<{parent,child,move,losing}>, adj:Map, rev:Map, depthByHash:Record<string,number>, goalHashes:Set<string> }`
- `cancelSolver()` — request cancelation (checked between batches)

solver/zobrist.js
- `initZobrist(rows, cols, entityTypes=[])`
- `hashState(state) → string` — returns a BigInt string hash; includes tiles positions (structure-only), player mode/dir, and entities.

solver/filters.js
- `filterNearDuplicates(solutions, maxEdits=2) → Array<{moves,length}>` — removes near-duplicates by bounded edit distance/one-edit-apart filter.

## Evaluator (Scoring) API

Heuristic keys: `U` (uniqueness), `D` (dead-end density), `Fr` (early frustration), `S` (solution depth window), `M` (mechanic diversity), `F` (flow arc), `Y` (symmetry).

solver/evaluator.js
- `computeMetrics({ initialState, solverGraph, solverResult, params, needKeys }) → Record<key, number>`
  - Uses solver summary to avoid recomputations.
  - `M` via tags along shortest path; `F` via correlation of difficulty proxies vs. sine ideal; `Y` symmetry on base grid.
- `passesDeadEndDepthConstraint(solverGraph, minDepth) → boolean` — minimum “dead-region depth” constraint.
- `computeAllowedDeadSetFromGraph(solverGraph, minSteps=0) → Set<string>` — dead-region states with depth ≥ `minSteps+1` (states).
- `applyBands(metrics, bands) → { ok:boolean, reason? }` — band-pass filter per metric.
- `combineScore(metrics, weights, { mapSigned=true }) → { score_signed, score01, breakdown }`
- `evaluateLevel({ initialState, solverResult, solverGraph, weights, bands, params, gcons, mapSigned }) → { discarded:boolean, discard_reason?, metrics?, score?, score_signed?, breakdown? }`

Supporting internals
- `simulatePathTags(initialState, moves) → string[]`
- `reconstructHashesAlongPath(solverGraph, moves) → string[]`
- `computeGridSymmetry(base, mode:'horizontal'|'vertical'|'rot180') → number`

## UI Modules API

ui/io.js
- `loadLevelList() → Promise<string[]>` — fetches `levels/index.json`
- `loadLevel(name) → Promise<state>` — fetches and deserializes a specific level JSON
- `exportLevel(state, name)` — triggers browser download
- `importLevel(file:File) → Promise<state>` — reads and deserializes a local file

ui/hud.js
- `setupHUD({ onToggleBuildMode, onUndo, onReset, onToggleSolver, onRefreshLevels, onLoadLevel, onExport, onImport, onRunSolver, onStopSolver, onPlaySolution, onExportSolution })`
  - Wires HUD buttons and solver controls. Expects external callbacks.

ui/canvas.js
- `initCanvas(canvasElement)`
- `draw(state)` — draws base grid, overlays, player/boxes/heavy/fragile entities; highlights exit activation.

ui/build.js
- `setupBuildUI({ canvasEl, getState, setState, onModified, onSnapshot, requestRedraw, isBuildMode })`
  - Painting tiles and toggling entities on the canvas.
  - Fill unreachable with walls (flood from player), clear map, directional resizing (add/remove rows/cols), compact borders.

ui/auto.js
- `setupAutoUI({ getState, setState, runSolver, onPlaySolution })` — Auto Creator panel
  - Presets: scoring weights/bands/params/global constraints
  - Parameters via form: attempts, max changes, allowed tile source/targets, entity mutation toggles; genetic options
  - Generates candidate levels by mutating tiles/entities (random or greedy), runs solver, scores with evaluator, keeps top N
  - Renders candidate list with Play/Use actions
- Helpers and key functions:
  - Parameters and UI
    - `readParams()` — read Auto Creator controls
    - `readScoringConfig()` — read scoring weights/bands/params/constraints/mapSigned
    - `buildMoveIndex(edges)` — fast lookup of next state by move char for a given parent hash
  - Candidate initialization
    - `ensurePlayer(state)` — place a player at a legal random cell if missing
    - `computePlayerReachable(state) → boolean[][]` — four-neighbor reachability (used in some flows)
  - Tile mutations
    - `mutateTiles(state, maxChanges, sourceAllowed?, targetAllowed?) → boolean` — random changes; `fragileWall` target places entity overlay
    - `mutateTilesOptimally(state, maxChanges, sourceAllowed?, targetAllowed?, runSolver, limits) → Promise<boolean>` — greedy one-change-at-a-time by score improvement
    - `simplifyTilesPreservingResult({ base, candidate, params, runSolver, prevResult })` — attempts to replace changed tiles with simpler equivalents preserving solver signature
  - Entity mutations
    - `mutateEntities(state, { movePlayer?, placeBoxes?, removeBoxes? }) → boolean`
    - `mutateEntitiesOptimally(state, opts, runSolver, limits) → Promise<boolean>` — greedy move/place to improve score
  - Validity and dedupe
    - `isValidInitialPositions(state) → boolean` — player not on exit/hole/wall, boxes on legal tiles, no overlapping conflicts
    - `attemptRelocateInvalid(state, maxAttempts=3) → boolean` — try to relocate invalid entities randomly to valid spots
    - `stateKey(state) → string` — Zobrist-like hash of tiles/entities/player mode for deduplication (uses `ensureZ`, `rndBig`, `dirKey`)
  - Simplification workflow
    - `simplifyLevel(inputState, { runSolver, params, preserveDeadEnds=true }) → Promise<state>` — tries trimming borders and simplifying tiles while preserving solver signature
    - `solverSignature(result) → { s:string[], d:string[] }`, `sameSignature(a,b,includeDeads=true)` — normalize solver outputs to compare

## Mechanics Reference Cheatsheet

Order of evaluation on a move
1) State machine picks handler by player mode and entity underfoot.
2) Free: blocks walls-for-player; steps onto pushable enters `inbox` with `entryDir` set to move dir; otherwise walks if front not solid.
3) Inbox (box or heavy):
   - Reverse into flight when allowed; resolve flight and update mode.
   - Else evaluate push rules: walls-for-box block; solid-only blocks unless pushable; plan/apply chain; holes cause tail fall.
   - Heavy specifics adjust `entryDir` as described and add `pushHeavyStraight` tag in evaluator when aligned and with side-effects.
4) Effects emitted for entity moves, tile breaking, and falls.
5) Goals: win/lose conditions check against resulting state.

Solver graph semantics
- `edges[].losing` marks transitions to immediate game-over states. Such edges are excluded from adjacency for scoring/graph analysis but are kept for dead-end reporting.

Scoring highlights (Evaluator)
- `U`: fewer solutions → higher
- `D`: more processed states outside solution-backward-closure → higher
- `Fr`: weights dead states earlier in depth more heavily
- `S`: target solution length window [L_min, L_max]
- `M`: entropy of step tags along a shortest solution
- `F`: correlation to an “ideal” arc; proxies combine local branching, remaining distance, and neighboring dead fraction
- `Y`: symmetry of base grid under chosen mirroring

## Notes
- All functions that return a new state clone immutably unless explicitly documented to mutate. Within handlers, the passed-in `state` is already a clone from the engine/state machine.
- UI modules are browser-side and expect DOM elements with specific ids/classes as used in `index.html`.
