/**
 * Zombie Land — Automated Regression Test Suite
 * Run with: node tests/game.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

console.log('\x1b[36m================================================\x1b[0m');
console.log('\x1b[36m   ZOMBIE LAND — AUTOMATED TEST SUITE          \x1b[0m');
console.log('\x1b[36m================================================\x1b[0m\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(` \x1b[32m✔ PASS\x1b[0m  ${name}`);
    passedTests++;
  } catch (err) {
    console.error(` \x1b[31m✖ FAIL\x1b[0m  ${name}`);
    console.error(`   Error: ${err.message}\n`);
  }
}

// 1. Load Configuration
const config = require('../js/config.js');

test('Configuration: Required structure & valid bounds', () => {
  assert(config.WORLD, 'WORLD config must exist');
  assert(config.WORLD.BOUND > 100, 'Map BOUND must be > 100');
  assert(config.PLAYER, 'PLAYER config must exist');
  assert(config.PLAYER.WALK_SPEED > 0, 'Walk speed must be positive');
  assert(config.PLAYER.SPRINT_SPEED > config.PLAYER.WALK_SPEED, 'Sprint speed must exceed walk speed');
  assert(config.WEAPONS.pistol && config.WEAPONS.rifle && config.WEAPONS.shotgun, 'Pistol, Rifle, and Shotgun must be defined');
  assert(config.WEAPONS.pistol.damageHead === 100, 'Headshot damage must be 100');
  assert(config.WEAPONS.shotgun.pellets === 8, 'Shotgun must fire 8 buckshot pellets');
  assert(config.ZOMBIES.TYPES.walker && config.ZOMBIES.TYPES.runner && config.ZOMBIES.TYPES.brute, 'All 3 zombie types must be defined');
});

// 2. Test Vercel Configuration & Routing
test('Vercel Config: Valid JSON, headers, and GLB MIME types', () => {
  const vercelRaw = fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8');
  const vercel = JSON.parse(vercelRaw);
  assert(vercel.outputDirectory === '.', 'vercel.json outputDirectory must be set to .');
  assert(vercel.headers && vercel.headers.length > 0, 'vercel.json must define headers');
  const glbRule = vercel.headers.find(h => h.source.includes('.glb'));
  assert(glbRule, 'Must contain header rule for .glb files');
  const glbMime = glbRule.headers.find(h => h.key === 'Content-Type');
  assert(glbMime && glbMime.value === 'model/gltf-binary', '.glb MIME type must be model/gltf-binary');
});

// 3. Headless Babylon Sandbox Setup
const BABYLON = require('../js/babylon.js');

const sandbox = {
  BABYLON: BABYLON,
  document: {
    getElementById: (id) => ({
      addEventListener: () => {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {} },
      style: {},
      textContent: '',
      className: '',
      offsetWidth: 100,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 })
    }),
    body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
    addEventListener: () => {},
    pointerLockElement: null,
    createElement: () => ({
      getContext: () => ({
        fillRect: () => {},
        strokeRect: () => {},
        fillText: () => {},
        drawImage: () => {},
        measureText: () => ({ width: 10 })
      }),
      width: 256,
      height: 96
    })
  },
  window: {
    addEventListener: () => {},
    matchMedia: () => ({ matches: false }),
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1
  },
  navigator: { maxTouchPoints: 0 },
  Float32Array: Float32Array,
  Math: Math,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  console: console
};
sandbox.window.window = sandbox.window;
sandbox.window.document = sandbox.document;
sandbox.window.CONFIG = config;
sandbox.CONFIG = config;

const ctx = vm.createContext(sandbox);

// 4. Test Models System, Procedural Fallbacks & Binary GLB Integrity
test('Model Loader: GLB pipeline, binary integrity & procedural fallback', () => {
  const modelsCode = fs.readFileSync(path.join(__dirname, '../js/models.js'), 'utf8');
  vm.runInContext(modelsCode, ctx);

  assert(ctx.MODEL_LOADER, 'MODEL_LOADER must be defined');
  assert(typeof ctx.MODEL_LOADER.loadGLB === 'function', 'loadGLB method must exist');
  assert(typeof ctx.MODEL_LOADER.instantiate === 'function', 'instantiate method must exist');
  assert(typeof ctx.MODEL_LOADER.preloadAll === 'function', 'preloadAll method must exist');
  assert(ctx.MODEL_LOADER.has('non_existent') === false, 'has() should return false for missing models');

  // Verify physical binary .glb files
  const glbFiles = ['weapon_pistol.glb', 'weapon_rifle.glb', 'weapon_shotgun.glb', 'player_survivor.glb', 'zombie_walker.glb'];
  glbFiles.forEach(file => {
    const filePath = path.join(__dirname, '../assets/models', file);
    assert(fs.existsSync(filePath), `Asset ${file} must exist in assets/models/`);
    const buf = fs.readFileSync(filePath);
    assert(buf.length > 20, `${file} must have valid byte length`);
    const magic = buf.readUInt32LE(0);
    assert(magic === 0x46546C67, `${file} must start with glTF magic header (0x46546C67)`);
    const version = buf.readUInt32LE(4);
    assert(version === 2, `${file} must be glTF version 2`);
  });
});

// 5. Load & Initialize World Generation & Day/Night System
test('World Generation & Day/Night: Builds houses, doors, loot & 4-phase cycle', () => {
  const worldCode = fs.readFileSync(path.join(__dirname, '../js/world.js'), 'utf8')
    .replace("new BABYLON.Engine(canvas, true, { stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' })", 'new BABYLON.NullEngine()');

  vm.runInContext(worldCode, ctx);

  assert(ctx.PLATFORMS.length > 20, `Expected >20 platforms, got ${ctx.PLATFORMS.length}`);
  assert(ctx.WALLS3D.length > 50, `Expected >50 3D walls, got ${ctx.WALLS3D.length}`);
  assert(ctx.LADDERS.length >= 8, `Expected >=8 ladders, got ${ctx.LADDERS.length}`);
  assert(ctx.DOORS.length >= 8, `Expected >=8 enterable doors, got ${ctx.DOORS.length}`);
  assert(ctx.LOOT_ITEMS.length >= 10, `Expected >=10 scavengeable loot spawns, got ${ctx.LOOT_ITEMS.length}`);
  assert(ctx.vcMat.useVertexColors === true, 'vcMat must have useVertexColors = true');

  // Verify Day / Night System
  assert(ctx.DAY_NIGHT_SYSTEM, 'DAY_NIGHT_SYSTEM must exist');
  assert(typeof ctx.DAY_NIGHT_SYSTEM.setTimePhase === 'function', 'setTimePhase must exist');
  assert(typeof ctx.DAY_NIGHT_SYSTEM.cycleNextPhase === 'function', 'cycleNextPhase must exist');

  // Test cycling through phases
  const phases = ['morning', 'noon', 'dusk', 'night'];
  phases.forEach(p => {
    ctx.DAY_NIGHT_SYSTEM.setTimePhase(p);
    assert(ctx.DAY_NIGHT_SYSTEM.getPhase() === p, `Phase should be ${p}`);
    const td = ctx.DAY_NIGHT_SYSTEM.getTimeData();
    assert(td.icon && td.label, `Phase ${p} must have icon and label`);
  });
});

// 4. Test 3D Physics, Platform Elevation & Collision Resolution
test('Physics: Platform height lookup & wall collisions', () => {
  // Ground level test
  const groundY = ctx.getGroundHeight(0, 0, 0, 0.45);
  assert(groundY === 0, `Ground Y should be 0 at origin, got ${groundY}`);

  // Wall collision sliding
  const testWall = ctx.WALLS3D[0];
  const midX = (testWall.x1 + testWall.x2) / 2;
  const midZ = (testWall.z1 + testWall.z2) / 2;
  const insideY = (testWall.y1 + testWall.y2) / 2;
  
  // A point trying to penetrate wall should be pushed out
  const resolved = ctx.resolve3DCollisions(midX, insideY, midZ, 0.5, 1.85);
  assert(resolved[0] !== midX || resolved[1] !== midZ, 'Collision solver must displace penetrating entity');
});

// 5. Test Door Mechanics & Zombie Blocking
test('Doors: Toggle state & zombie blocking', () => {
  const door = ctx.DOORS[0];
  assert(door.open === false, 'Door must start closed');

  // Toggle open
  ctx.toggleDoor(door);
  assert(door.open === true, 'Door should be open after toggle');

  // Toggle closed
  ctx.toggleDoor(door);
  assert(door.open === false, 'Door should be closed after second toggle');

  // Test collision: closed door must block entity at door position
  const resolvedDoor = ctx.resolve3DCollisions(door.x, door.y, door.z, 0.5, 1.85, true);
  const dist = Math.hypot(resolvedDoor[0] - door.x, resolvedDoor[1] - door.z);
  assert(dist > 0.01, 'Closed door must block entity from standing inside doorway');
});

// 6. Test Main Game Logic & Render Loop
test('Main Game: Player, Zombies, Gunplay & 60-Frame Render Loop', () => {
  const mainCode = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');
  vm.runInContext(mainCode, ctx);

  assert(ctx.player, 'Player object must exist');
  assert(ctx.player.hp === 100, 'Player initial HP must be 100');
  assert(ctx.ZOMBIES.length > 0, 'Zombies must be populated');

  ctx.begin();
  assert(ctx.state === 'playing', 'Game state must transition to playing on begin()');

  // Test weapon switching
  ctx.switchWeapon('shotgun');
  assert(ctx.player.cur === 'shotgun', 'Player should equip shotgun');
  ctx.cycleNextWeapon();
  assert(ctx.player.cur === 'pistol', 'Cycle next weapon from shotgun should return to pistol');

  // Test player respawn resets all movement flags
  ctx.player.onLadder = true;
  ctx.player.climbStep = 0.5;
  ctx.player.sprinting = true;
  ctx.adsHeld = true;
  ctx.wantJump = true;
  ctx.respawn();
  assert(ctx.player.onLadder === false, 'Respawn must reset player.onLadder');
  assert(ctx.player.climbStep === 0, 'Respawn must reset player.climbStep');
  assert(ctx.player.sprinting === false, 'Respawn must reset player.sprinting');
  assert(ctx.adsHeld === false, 'Respawn must reset adsHeld');
  assert(ctx.wantJump === false, 'Respawn must reset wantJump');
  assert(ctx.player.hp === 100, 'Respawn must restore player HP to 100');

  // Test GlowLayer sky exclusion (prevents glowing sky issue)
  if (ctx.glowLayer && ctx.glowLayer.customEmissiveColorSelector) {
    const fakeResult = { set: (r, g, b, a) => { fakeResult.r = r; fakeResult.g = g; fakeResult.b = b; } };
    ctx.glowLayer.customEmissiveColorSelector({ name: 'skyDome' }, null, null, fakeResult);
    assert(fakeResult.r === 0 && fakeResult.g === 0 && fakeResult.b === 0, 'SkyDome must be zeroed out in GlowLayer');
  }

  // Simulate 60 frames
  for (let i = 0; i < 60; i++) {
    ctx.scene.render();
  }
});

console.log('\n------------------------------------------------');
console.log(`Results: ${passedTests} of ${totalTests} tests passed.`);
if (passedTests === totalTests) {
  console.log('\x1b[32m✔ All tests passed successfully! Zero regressions.\x1b[0m\n');
  process.exit(0);
} else {
  console.error('\x1b[31m✖ Some tests failed. Please review errors above.\x1b[0m\n');
  process.exit(1);
}
