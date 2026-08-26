# 🧟 Zombie Land — Open World Survival 3D

An open-world third-person 3D zombie survival game built using **Babylon.js** and WebGL, supporting `.glb` 3D model imports and optimized for Vercel deployment.

---

## 🚀 Deploy to Vercel

This project is pre-configured with `vercel.json` for one-click deployment to Vercel:

1. **Push your code to GitHub / GitLab**.
2. **Import the repository into Vercel**.
3. **Deploy** — Vercel will automatically configure the correct `model/gltf-binary` MIME types, global CORS headers, and immutable asset caching!

Or deploy via the Vercel CLI:
```bash
npm i -g vercel
vercel
```

---

## 📦 Importing Custom 3D `.glb` Models

You can drop your own realistic 3D `.glb` models into `assets/models/`:

| Filename | Purpose | Height |
|---|---|---|
| `player_survivor.glb` | Custom Player Character Model | ~1.85m |
| `zombie_walker.glb` | Walker Zombie Archetype | ~1.85m |
| `zombie_runner.glb` | Fast Agile Runner Zombie | ~1.75m |
| `zombie_brute.glb` | Giant Mutated Hulk Zombie | ~2.4m |
| `weapon_pistol.glb` | 9mm Combat Pistol | ~0.35m |
| `weapon_rifle.glb` | AR-15 / M4 Assault Rifle | ~0.85m |
| `weapon_shotgun.glb` | 12-Gauge Tactical Shotgun | ~0.95m |

> **Note**: If any `.glb` model is not present, the game automatically uses its ultra-realistic procedural 3D model with zero downtime or errors.

---

## 🎮 Gameplay Controls

### PC (Keyboard & Mouse)
- **W, A, S, D** — Move forward, left, backward, right
- **Shift** — Sprint (faster movement speed)
- **Space** — Jump / Climb Ladder upward
- **Mouse Movement** — 360° Third-Person Camera Aiming
- **Left Mouse Button (LMB)** — Fire Weapon
- **Right Mouse Button (RMB)** — Aim Down Sights (ADS) for precision accuracy
- **E** — Open / Close Doors
- **T** — Switch Time of Day (Morning ➔ Noon ➔ Dusk ➔ Midnight)
- **1 / 2 / 3** or **Mouse Wheel** — Swap Weapon (Pistol ↔ Assault Rifle ↔ Shotgun)

### Mobile & Touch Devices (Landscape Mode)
- **Left Virtual Joystick** — Analog Character Movement
- **Right Screen Drag** — Camera Aiming
- **[FIRE]** — Shoot Weapon
- **[AIM]** — Toggle Aim-Down-Sights Zoom
- **[DOOR]** — Open / Close Doors
- **[JUMP]** — Jump / Climb
- **[SWAP]** — Cycle Weapons (Pistol ➔ Rifle ➔ Shotgun)

---

## 🏙️ Features & Mechanics

1. **Every House is Enterable**:
   - All buildings and suburban houses have walkable interiors, wooden flooring, furniture (tables, sofas, counters, bookshelves), and ceiling lamps.
   - **Interactive Doors**: Press **[E]** to open or close doors.

2. **Zombie Door Inability & AI Realism**:
   - Zombies lack the intelligence and fine motor skills to turn doorknobs or operate doors.
   - When a door is closed, zombies gather outside, furiously banging their fists on the wooden door panels with realistic sound effects and splinter particles, unable to enter until the door is opened.

3. **Scavengeable Loot & Supplies**:
   - **First Aid Medkits (+40 HP)** scattered inside houses.
   - **Ammo Crates (Supply Refills)** scattered on counters and floors.
   - Pickups automatically respawn after 45 seconds to encourage exploration.

4. **Tactical Flashlight & Laser Sights**:
   - Real-time weapon flashlight piercing through midnight mist.
   - Active red laser sight on the Assault Rifle.

5. **Headshot Decapitation & Visceral Gore**:
   - Headshots trigger instant skull rupture with bone shards, meat chunks, and blood mist.

---

## 📁 File Structure

```
Zombie land/
├── vercel.json          # Vercel routing, CORS & .glb MIME type headers
├── index.html           # Main HTML entry point & UI overlays
├── style.css            # HUD, loading screen, crosshair & mobile UI styles
├── package.json         # Project metadata & test scripts
├── .editorconfig        # Formatting and indentation standards
├── ARCHITECTURE.md      # Technical architecture and extension guide
├── README.md            # Documentation and deployment instructions
├── assets/
│   └── models/          # Drop custom .glb 3D models here
├── tests/
│   └── game.test.js     # Automated test suite (run with `npm test`)
└── js/
    ├── babylon.js       # Core 3D WebGL engine
    ├── config.js        # Centralized constants (physics, weapons, zombies, loot)
    ├── models.js        # .GLB 3D model loader & normalization pipeline
    ├── world.js         # Map builder, collision system, materials, audio & lighting
    └── main.js          # Player controller, zombie AI, combat, camera & render loop
```

---

## 🧪 Running Automated Tests

```bash
npm test
# or
node tests/game.test.js
```
