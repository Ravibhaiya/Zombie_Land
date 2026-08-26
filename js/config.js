/**
 * Zombie Land — Open World Survival
 * Centralized Game Configuration & Constants
 * 
 * To modify gameplay parameters (weapon stats, zombie speeds, player physics, etc.),
 * edit the values in this file rather than modifying core engine logic.
 */

'use strict';

var CONFIG = {
  // World & Map Architecture
  WORLD: {
    BOUND: 292,
    ROAD_WIDTH: 12,
    ROADS: [-150, -50, 50, 150],
    SAFE_RADIUS: 11,
    SAFE_HOUSE_GRID: [-190, -100, 0, 100, 190],
    CLEAR_COLOR: [0.03, 0.06, 0.05, 1], // Pitch midnight horror sky
    FOG_COLOR: [0.04, 0.08, 0.06],      // Deep ominous green-black mist
    FOG_DENSITY: 0.0038
  },

  // Dynamic Day / Night Cycle Engine
  DAY_NIGHT: {
    ENABLED: true,
    CYCLE_DURATION_MINUTES: 10,
    INITIAL_HOUR: 7.0,
    PROFILES: {
      morning: {
        label: 'MORNING',
        icon: '🌅',
        startHour: 5.5,
        clearColor: [0.98, 0.85, 0.72, 1],
        fogColor: [0.95, 0.82, 0.70],
        fogDensity: 0.0016,
        sunDir: [-0.75, -0.45, 0.35],
        sunColor: [1.0, 0.90, 0.65],
        sunIntensity: 1.05,
        hemiDiffuse: [0.85, 0.82, 0.75],
        hemiGround: [0.45, 0.55, 0.35],
        hemiIntensity: 0.65,
        lanternIntensity: 0.25,
        flashlightActive: false,
        exposure: 1.08
      },
      noon: {
        label: 'NOON',
        icon: '☀️',
        startHour: 10.0,
        clearColor: [0.35, 0.75, 0.98, 1],
        fogColor: [0.55, 0.85, 0.98],
        fogDensity: 0.0010,
        sunDir: [-0.25, -0.92, 0.28],
        sunColor: [1.0, 0.98, 0.90],
        sunIntensity: 1.25,
        hemiDiffuse: [0.90, 0.96, 0.98],
        hemiGround: [0.40, 0.65, 0.30],
        hemiIntensity: 0.85,
        lanternIntensity: 0.0,
        flashlightActive: false,
        exposure: 1.15
      },
      dusk: {
        label: 'DUSK',
        icon: '🌇',
        startHour: 17.5,
        clearColor: [0.85, 0.35, 0.52, 1],
        fogColor: [0.92, 0.45, 0.40],
        fogDensity: 0.0018,
        sunDir: [0.85, -0.32, -0.42],
        sunColor: [1.0, 0.55, 0.25],
        sunIntensity: 0.98,
        hemiDiffuse: [0.65, 0.45, 0.55],
        hemiGround: [0.35, 0.25, 0.30],
        hemiIntensity: 0.55,
        lanternIntensity: 0.85,
        flashlightActive: true,
        exposure: 1.02
      },
      night: {
        label: 'MIDNIGHT',
        icon: '🌑',
        startHour: 21.0,
        clearColor: [0.10, 0.08, 0.24, 1],
        fogColor: [0.12, 0.10, 0.26],
        fogDensity: 0.0026,
        sunDir: [-0.45, -0.85, 0.35],
        sunColor: [0.65, 0.55, 0.95],
        sunIntensity: 0.65,
        hemiDiffuse: [0.30, 0.28, 0.45],
        hemiGround: [0.15, 0.18, 0.15],
        hemiIntensity: 0.45,
        lanternIntensity: 1.4,
        flashlightActive: true,
        exposure: 0.84
      }
    }
  },

  // Tactical Weapon Light / Flashlight
  FLASHLIGHT: {
    RANGE: 35.0,
    ANGLE: 0.65,
    EXPONENT: 2.5,
    INTENSITY: 2.4,
    COLOR: [1.0, 0.96, 0.85]
  },

  // Player Character & Movement Physics
  PLAYER: {
    MAX_HP: 100,
    WALK_SPEED: 6.3,
    SPRINT_SPEED: 10.0,
    JUMP_VELOCITY: 8.6,
    GRAVITY: 24.0,
    RADIUS: 0.55,
    HEIGHT: 1.85,
    STEP_ASSIST_HEIGHT: 0.48, // Max obstacle height player automatically steps up
    ACCELERATION_RATE: 14.0,
    KNOCKBACK_DAMPING: 6.0,
    HEALTH_REGEN_DELAY: 5.0,  // Seconds after damage before auto-regen kicks in
    HEALTH_REGEN_RATE: 9.0,   // HP per second
    INVULNERABILITY_TIME: 2.5 // Seconds of invulnerability on respawn
  },

  // Third-Person & ADS Camera
  CAMERA: {
    MIN_Z: 0.2,
    MAX_Z: 1600,
    BASE_FOV: 0.86,
    ADS_FOV_REDUCTION: 0.33,
    SPRINT_FOV_BOOST: 0.05,
    BASE_DISTANCE: 9.0,
    ADS_DISTANCE: 6.4,
    MIN_ALLOWED_DISTANCE: 1.4,
    COLLISION_PROBE_PADDING: 0.4,
    MOUSE_SENSITIVITY: 0.0024,
    ADS_SENSITIVITY_MULT: 0.55,
    TOUCH_LOOK_SENSITIVITY: 0.0038,
    FOLLOW_SMOOTH: 16.0,
    FOLLOW_SMOOTH_ADS: 22.0,
    PITCH_MIN: -0.5,
    PITCH_MAX: 1.25
  },

  // Arsenal & Weapon Balance
  WEAPONS: {
    pistol: {
      label: 'PISTOL',
      auto: false,
      rps: 3.6,           // Rounds per second
      spread: 0.011,      // Hipfire spread
      spreadAds: 0.002,   // Aim-down-sights spread
      kick: 0.05,         // Camera recoil per shot
      flash: 15,          // Muzzle flash light intensity
      damageHead: 100,    // One-shot kill on headshot
      damageBody: 25
    },
    rifle: {
      label: 'RIFLE',
      auto: true,
      rps: 9.0,
      spread: 0.034,
      spreadAds: 0.009,
      kick: 0.024,
      flash: 11,
      damageHead: 100,
      damageBody: 35
    },
    shotgun: {
      label: 'SHOTGUN',
      auto: false,
      rps: 1.15,
      pellets: 8,
      spread: 0.072,
      spreadAds: 0.038,
      kick: 0.11,
      flash: 26,
      damageHead: 100,
      damageBody: 28
    }
  },

  // Zombie Archetypes & Behaviors
  ZOMBIES: {
    TARGET_ALIVE_DESKTOP: 26,
    TARGET_ALIVE_MOBILE: 16,
    DESPAWN_DISTANCE: 185,
    GROWL_INTERVAL_MIN: 2.0,
    GROWL_INTERVAL_MAX: 4.5,
    DOOR_BANG_INTERVAL: 0.42, // Rate at which zombies beat on closed doors
    DOOR_DETECTION_DIST: 2.5,
    TYPES: {
      walker: {
        label: 'Walker',
        scl: [0.95, 1.08],
        speed: [2.2, 3.0],
        sense: 38,
        dmg: [8, 11],
        thin: 1.0,
        armW: 0.0,
        spawnWeight: 0.66
      },
      runner: {
        label: 'Runner',
        scl: [0.88, 0.96],
        speed: [4.4, 5.2],
        sense: 46,
        dmg: [6, 8],
        thin: 0.78,
        armW: -0.03,
        spawnWeight: 0.22
      },
      brute: {
        label: 'Brute',
        scl: [1.28, 1.42],
        speed: [1.7, 2.1],
        sense: 34,
        dmg: [15, 20],
        thin: 1.08,
        armW: 0.05,
        spawnWeight: 0.12
      }
    }
  },

  // Interactive Doors & Enterable Buildings
  DOORS: {
    DEFAULT_WIDTH: 2.4,
    DEFAULT_HEIGHT: 3.0,
    INTERACT_DISTANCE: 3.2,
    OPEN_ANGLE: Math.PI / 2
  },

  // Scavengeable Loot & Supplies
  LOOT: {
    RESPAWN_TIME: 45.0,   // Seconds before medkit/ammo reappears in house
    PICKUP_RADIUS: 1.6,
    MEDKIT_HEAL: 40,
    AMMO_REFILL: true
  },

  // Graphics & Rendering Pipeline
  GRAPHICS: {
    SHADOW_MAP_SIZE: 512,
    SHADOW_MAP_SIZE_DESKTOP: 1024,
    SHADOW_MAP_SIZE_MOBILE: 512,
    SHADOW_BLUR_KERNEL: 12,
    GLOW_TEXTURE_RATIO: 0.25,
    GLOW_INTENSITY: 0.7,
    GLOW_INTENSITY_MOBILE: 0.45,
    FPS_LOW_THRESHOLD_DESKTOP: 28,
    FPS_HIGH_THRESHOLD_DESKTOP: 50,
    FPS_LOW_THRESHOLD_MOBILE: 24,
    FPS_HIGH_THRESHOLD_MOBILE: 52,
    MAX_DPR_DESKTOP: 2,
    MAX_DPR_MOBILE: 1.5,
    CONTRAST: 1.14,
    EXPOSURE: 1.06,
    VIGNETTE_WEIGHT: 1.28,
    BLOOM_WEIGHT: 0.16
  },

  // Audio Engine
  AUDIO: {
    MASTER_VOLUME: 0.5,
    WIND_VOLUME: 0.013,
    SFX_VOLUME: 0.8
  },

  // 3D GLB Asset Models (External Assets with Procedural Fallbacks)
  MODELS: {
    ENABLED: true,
    BASE_PATH: 'assets/models/',
    ASSETS: {
      player: 'player_survivor.glb',
      zombie_walker: 'zombie_walker.glb',
      zombie_runner: 'zombie_runner.glb',
      zombie_brute: 'zombie_brute.glb',
      weapon_pistol: 'weapon_pistol.glb',
      weapon_rifle: 'weapon_rifle.glb',
      weapon_shotgun: 'weapon_shotgun.glb'
    }
  }
};

if (typeof window !== 'undefined') window.CONFIG = CONFIG;
if (typeof global !== 'undefined') global.CONFIG = CONFIG;
if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
