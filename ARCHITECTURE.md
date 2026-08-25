# 🏛️ Architecture & Extension Guide

This document describes the architectural standards, coordinate systems, material rules, and collision protocols to ensure future changes do not introduce regressions.

---

## 1. Material & Shader Architecture

### `vcMat` (Vertex-Colored Merged Meshes)
- All static world geometry (buildings, houses, roads, scatter props, vehicles) are merged into single draw calls using `mergePainted(meshList)`.
- `vcMat` uses per-vertex color (`VertexBuffer.ColorKind`) with `vcMat.useVertexColors = true`.
- **CRITICAL RULE**: Never freeze materials synchronously before the first scene render. Material freezing is handled by `freezeAllMaterials()` after frame 3 once shaders have compiled on the GPU.

### Shadow Generator Safety
- When registering shadow casters via `castShadow(node)`, pass only `AbstractMesh` instances (or nodes with `getChildMeshes()`). `TransformNode` objects lack `getBoundingInfo` and will throw inside Babylon's shadow projection matrix calculation. Use the helper `castShadow(node)` which performs safe child mesh traversal.

---

## 2. Collision & Physics Hierarchy

The physics pipeline uses a layered 3D spatial query model:

1. **`PLATFORMS[]` (Ground & Elevation Levels)**:
   - Stores `{ x1, x2, z1, z2, topY, type, name }`.
   - `getGroundHeight(px, pz, curY, playerR)` finds the highest platform beneath the entity.

2. **`WALLS3D[]` (Perimeter & Interior Obstacles)**:
   - Stores bounding volumes `{ x1, x2, z1, z2, y1, y2 }`.
   - `resolve3DCollisions(px, py, pz, r, height, isZombie)` resolves 2D sliding vectors against all active walls and closed doors.

3. **`DOORS[]` (Dynamic Interactive Portals)**:
   - Stores `{ x, z, y, w, h, ry, open, hinge, panel, collider }`.
   - Closed doors are included in collision checks for both players and zombies.
   - When a door is opened with `toggleDoor(door)`, its collider is bypassed.

4. **`LADDERS[]` (Vertical Ascent & Rooftop Access)**:
   - Stores `{ x, z, r, yMin, yMax, facingYaw, topY }`.
   - `getLadderAt(px, py, pz, r)` activates ladder climbing when the player moves toward it.

---

## 3. Zombie AI State Machine

Zombies transition between the following states:

```
[ rise ] ➔ [ wander ] ➔ [ aggro ] ➔ [ attack ] / [ banging ]
                             │
                             ▼
                         [ dead ] ➔ [ despawn ]
```

- **`wander`**: Random waypoint patrol around city blocks.
- **`aggro`**: Chases player within detection radius (`z.sense`).
- **`attack`**: Melee strike within `z.reach` (1.8m).
- **`banging`**: Activated when chasing player but blocked by a closed door (`distance < 2.5m`). Zombie beats on the door, triggers `sfxDoorBang()`, and spawns wood splinters without passing through.
- **`dead`**: Disables head hitbox, plays directional death fall animation, fades out mesh, and cleans up shadow casters in `disposeZombie()`.

---

## 4. How to Add New Content Safely

### Adding a New Weapon
1. Open `js/config.js`.
2. Add a new definition under `CONFIG.WEAPONS`:
   ```js
   shotgun: {
     label: 'SHOTGUN',
     auto: false,
     rps: 1.2,
     spread: 0.08,
     spreadAds: 0.04,
     kick: 0.09,
     flash: 22,
     damageHead: 100,
     damageBody: 70
   }
   ```
3. In `js/main.js`, construct the 3D gun model in `buildPlayer()` under `wpnNodes.shotgun`.

### Adding a New Zombie Type
1. In `js/config.js`, add under `CONFIG.ZOMBIES.TYPES`:
   ```js
   spitter: {
     label: 'Spitter',
     scl: [1.0, 1.1],
     speed: [3.2, 3.8],
     sense: 42,
     dmg: [12, 16],
     thin: 0.9,
     armW: 0.0,
     spawnWeight: 0.15
   }
   ```

### Verification
Run `npm test` or `node tests/game.test.js` after making modifications to verify zero regressions.
