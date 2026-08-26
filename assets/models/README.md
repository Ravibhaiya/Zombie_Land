# 📦 3D .GLB Model Assets

Place your `.glb` 3D models in this folder to customize the characters, weapons, and zombies in **Zombie Land**.

---

## 🎮 Supported Model Files

| Asset Filename | Description | Recommended Height |
|---|---|---|
| `player_survivor.glb` | Custom Player Character Model | ~1.85m |
| `zombie_walker.glb` | Walker Zombie Archetype | ~1.85m |
| `zombie_runner.glb` | Fast Agile Runner Zombie | ~1.75m |
| `zombie_brute.glb` | Giant Mutated Hulk Zombie | ~2.4m |
| `weapon_pistol.glb` | 9mm Combat Pistol | ~0.35m |
| `weapon_rifle.glb` | AR-15 / M4 Assault Rifle | ~0.85m |
| `weapon_shotgun.glb` | 12-Gauge Tactical Shotgun | ~0.95m |

---

## ⚙️ How It Works
1. When you place a `.glb` file in this directory with any of the matching filenames above, the game will **automatically load and render the 3D model** in real time.
2. If any `.glb` model is missing or loading over a slow network, the engine **seamlessly renders the ultra-realistic procedural 3D model as a zero-downtime fallback**.
3. All models are automatically normalized and scaled to fit the physics hitboxes and collision hulls.
