# 🧟 Zombie Land — Open World Survival 3D

An open-world third-person 3D zombie survival game built using **Babylon.js** and WebGL.

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
- **1 / 2** or **Mouse Wheel** — Swap Weapon (Pistol ↔ Automatic Rifle)

### Mobile & Touch Devices
- **Left Virtual Joystick** — Analog Character Movement
- **Right Screen Drag** — Camera Aiming
- **[FIRE]** — Shoot Weapon
- **[ADS]** — Precision Aiming
- **[DOOR]** — Open / Close Doors
- **[JUMP]** — Jump / Climb
- **[SWAP]** — Swap Weapons

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

4. **3D Platforming & Rooftop Sniping**:
   - Exterior fire escapes and ladders allow climbing to rooftop sniper vantage points.
   - Rooftops feature sandbag cover and sniper crates for elevated defense.

5. **Headshot Mechanics**:
   - Zombies take **1-shot instant kill** on headshots.
   - Body shots stagger and damage zombies based on weapon caliber.

---

## 📁 File Structure

```
Zombie land/
├── index.html           # Main HTML entry point & UI overlays
├── style.css            # HUD, loading screen, crosshair & mobile UI styles
├── package.json         # Project metadata & test scripts
├── .editorconfig        # Formatting and indentation standards
├── ARCHITECTURE.md      # Technical architecture and extension guide
├── tests/
│   └── game.test.js     # Automated headless test suite (run with `npm test`)
└── js/
    ├── babylon.js       # Core 3D WebGL engine
    ├── config.js        # Centralized constants (physics, weapons, zombies, loot)
    ├── world.js         # Map builder, collision system, materials, audio & lighting
    └── main.js          # Player controller, zombie AI, combat, camera & render loop
```

---

## 🧪 Running Automated Tests

To test the entire game engine, physics, collision detection, door mechanics, and headless 60-frame render loop:

```bash
npm test
# or
node tests/game.test.js
```

---

## 🛠️ How to Customize & Extend

All gameplay tuning parameters are centralized in `js/config.js`:
- **Add New Weapons**: Add an entry under `CONFIG.WEAPONS`.
- **Tune Zombie Archetypes**: Adjust speed, damage, health, or scale under `CONFIG.ZOMBIES.TYPES`.
- **Adjust Player Physics**: Tune jump height, walk/sprint speeds, or gravity in `CONFIG.PLAYER`.
- **Graphics & Shadows**: Adjust shadow map sizes and particle pools in `CONFIG.GRAPHICS`.
