'use strict';

var MOBILE = (('ontouchstart' in window) || (navigator.maxTouchPoints > 0)) && window.matchMedia('(pointer: coarse)').matches;
if (MOBILE) document.body.classList.add('mobile');

var elHP = document.getElementById('hpFill');
var elKills = document.getElementById('killsVal');
var elWpn = document.getElementById('wpnLabel');
var elMsg = document.getElementById('msg');
var elSub = document.getElementById('subMsg');
var elVig = document.getElementById('vignette');
var elCH = document.getElementById('crosshair');
var elResume = document.getElementById('resumeHint');
var elClimb = document.getElementById('climbHint');
var elDoor = document.getElementById('doorHint');
var elDeath = document.getElementById('deathOverlay');
var elDeathText = document.getElementById('respawnText');
var elStart = document.getElementById('startOverlay');
var elStartHint = document.getElementById('startHint');
var elJoy = document.getElementById('joy');
var elKnob = document.getElementById('joyKnob');
var btnFire = document.getElementById('btnFire');
var btnJump = document.getElementById('btnJump');
var btnDoor = document.getElementById('btnDoor');
var btnSwap = document.getElementById('btnSwap');

elStartHint.textContent = MOBILE ? 'TAP TO ENTER THE CITY' : 'CLICK TO ENTER THE CITY';

var tNow = 0;
var state = 'menu';
var started = false;
var kills = 0;

var camYaw = Math.PI;
var camPitch = 0.32;
var recoil = 0;
var adsAmt = 0;
var adsHeld = false;
var camDistCur = 9.4;
var shake = 0;
var introT = 0;
var startPos = null;
var startTarget = null;

var triggerDown = false;
var fireLatch = true;
var cool = 0;
var wantJump = false;

var keys = {};
var joyX = 0, joyY = 0;
var joyId = null, lookId = null;
var lookLast = [0, 0];

var ZOMBIES = [];
var zombieParts = [], zombieKinds = [], zombieOwners = [];
var TARGET_ALIVE = MOBILE ? 16 : 26;
var spawnTimer = 0;
var growlTimer = 2;

var msgTimer = null, subTimer = null;
var lastBodyWarn = -99;
var chTimers = {};
var deathT = 0;

function msg(text, dur, cls) {
  elMsg.textContent = text;
  elMsg.className = cls || '';
  elMsg.style.opacity = 1;
  if (msgTimer) clearTimeout(msgTimer);
  msgTimer = setTimeout(function () { elMsg.style.opacity = 0; }, (dur || 1.6) * 1000);
}
function subMsg(text, dur) {
  elSub.textContent = text;
  elSub.style.opacity = 1;
  if (subTimer) clearTimeout(subTimer);
  subTimer = setTimeout(function () { elSub.style.opacity = 0; }, (dur || 2.2) * 1000);
}
function chFlash(cls, dur) {
  elCH.classList.add(cls);
  if (chTimers[cls]) clearTimeout(chTimers[cls]);
  chTimers[cls] = setTimeout(function () { elCH.classList.remove(cls); }, dur);
}

var player = {
  root: null, body: null, legL: null, legR: null,
  gunAnchor: null, weapons: {}, muzzle: {}, cur: 'pistol',
  hp: 100, vy: 0, grounded: true, phase: 0, stepAcc: 0,
  lastDmg: -99, invuln: 0, kb: { x: 0, z: 0 },
  vx: 0, vz: 0, sprinting: false, meshes: [], gunDip: 0, gunKick: 0
};

function limb(parent, x, y, z, w, len, hex) {
  var piv = new BABYLON.TransformNode('', scene);
  piv.parent = parent;
  piv.position.set(x, y, z);
  var m = box(w, len, w, 0, -len / 2, 0, hex, piv);
  return { p: piv, m: m };
}

function buildWeaponModels() {
  var ga = player.gunAnchor;
  var pistol = new BABYLON.TransformNode('pistol', scene);
  pistol.parent = ga;
  box(0.09, 0.12, 0.4, 0, 0, 0.14, '#3a3f45', pistol);
  var grip = box(0.085, 0.2, 0.11, 0, -0.13, -0.02, '#5f3f2f', pistol);
  grip.rotation.x = 0.3;
  var pb = cyl(0.05, 0.05, 0.1, 0, 0.01, 0.37, '#2c3036', pistol, 8);
  pb.rotation.x = Math.PI / 2;
  box(0.03, 0.03, 0.06, 0, 0.075, 0.02, '#2c3036', pistol);

  var rifle = new BABYLON.TransformNode('rifle', scene);
  rifle.parent = ga;
  box(0.09, 0.14, 0.66, 0, 0, 0.18, '#3a4046', rifle);
  box(0.08, 0.16, 0.24, 0, -0.02, -0.26, '#5f4a33', rifle);
  var mag = box(0.07, 0.22, 0.12, 0, -0.17, 0.08, '#2c3036', rifle);
  mag.rotation.x = 0.15;
  box(0.07, 0.1, 0.09, 0, -0.12, 0.36, '#2c3036', rifle);
  var rb = cyl(0.045, 0.045, 0.28, 0, 0.02, 0.63, '#2c3036', rifle, 8);
  rb.rotation.x = Math.PI / 2;
  box(0.04, 0.06, 0.12, 0, 0.115, 0.05, '#2c3036', rifle);

  var pm = new BABYLON.TransformNode('muzP', scene);
  pm.parent = pistol;
  pm.position.set(0, 0.01, 0.44);
  var rm = new BABYLON.TransformNode('muzR', scene);
  rm.parent = rifle;
  rm.position.set(0, 0.02, 0.79);

  player.weapons.pistol = pistol;
  player.weapons.rifle = rifle;
  player.muzzle.pistol = pm;
  player.muzzle.rifle = rm;
  rifle.setEnabled(false);
}

var WPN = {
  pistol: { label: 'PISTOL', auto: false, rps: 3.6, spread: 0.011, spreadAds: 0.002, kick: 0.05, flash: 15 },
  rifle: { label: 'RIFLE', auto: true, rps: 9, spread: 0.034, spreadAds: 0.009, kick: 0.024, flash: 11 }
};

function switchWeapon(name) {
  if (name === player.cur || state === 'dead') return;
  player.weapons[player.cur].setEnabled(false);
  player.weapons[name].setEnabled(true);
  player.cur = name;
  player.gunDip = 1;
  sfxSwap();
  elWpn.textContent = WPN[name].label;
}

function buildPlayer() {
  var root = new BABYLON.TransformNode('playerRoot', scene);
  var body = new BABYLON.TransformNode('playerBody', scene);
  body.parent = root;
  box(0.58, 0.72, 0.36, 0, 1.2, 0, '#3f7fbf', body);
  box(0.54, 0.22, 0.34, 0, 0.86, 0, '#35455f', body);
  box(0.4, 0.5, 0.2, 0, 1.24, -0.27, '#c96a3f', body);
  sph(0.5, 0, 1.78, 0, '#f0c49a', body, 12);
  var cap = sph(0.5, 0, 1.87, -0.02, '#d9483f', body, 10);
  cap.scaling.y = 0.55;
  box(0.4, 0.06, 0.26, 0, 1.84, 0.24, '#d9483f', body);
  sph(0.1, -0.1, 1.8, 0.21, '#ffffff', body, 7);
  sph(0.1, 0.1, 1.8, 0.21, '#ffffff', body, 7);
  sph(0.05, -0.1, 1.8, 0.252, '#222222', body, 6);
  sph(0.05, 0.1, 1.8, 0.252, '#222222', body, 6);
  var armL = limb(body, -0.36, 1.44, 0, 0.17, 0.62, '#f0c49a');
  var armR = limb(body, 0.36, 1.44, 0, 0.17, 0.62, '#f0c49a');
  armL.p.rotation.x = -1.32; armL.p.rotation.z = 0.42;
  armR.p.rotation.x = -1.2; armR.p.rotation.z = -0.1;
  var legL = limb(body, -0.15, 0.82, 0, 0.19, 0.76, '#35455f');
  var legR = limb(body, 0.15, 0.82, 0, 0.19, 0.76, '#35455f');
  box(0.21, 0.12, 0.32, 0, -0.76, 0.05, '#33393f', legL.p);
  box(0.21, 0.12, 0.32, 0, -0.76, 0.05, '#33393f', legR.p);

  player.root = root;
  player.body = body;
  player.legL = legL.p;
  player.legR = legR.p;
  player.gunAnchor = new BABYLON.TransformNode('gunAnchor', scene);
  player.gunAnchor.parent = body;
  player.gunAnchor.position.set(0.34, 1.3, 0.34);
  buildWeaponModels();
  player.meshes = root.getChildMeshes();
  makeShadow(0.55, root);
  castShadow(root);
  root.position.set(0, 0, 181);
  root.rotation.y = Math.PI;
}

var flashLight = new BABYLON.PointLight('flash', V(0, -50, 0), scene);
flashLight.intensity = 0;
flashLight.diffuse = new BABYLON.Color3(1, 0.85, 0.5);
flashLight.range = 18;
var flashMesh = BABYLON.MeshBuilder.CreateSphere('flashM', { diameter: 0.32, segments: 6 }, scene);
var flashMat = new BABYLON.StandardMaterial('flashMat', scene);
flashMat.emissiveColor = new BABYLON.Color3(1, 0.85, 0.45);
flashMat.disableLighting = true;
ALL_MATS.push(flashMat);
flashMesh.material = flashMat;
flashMesh.isVisible = false;

function tracer(a, b) {
  var line = BABYLON.MeshBuilder.CreateLines('tr', { points: [a, b] }, scene);
  line.color = new BABYLON.Color3(1, 0.95, 0.75);
  line.alpha = 0.75;
  line.isPickable = false;
  setTimeout(function () { line.dispose(); }, 70);
}

var ZSKINS = ['#7fbf4d', '#6aa84f', '#8fbf6a', '#5f9e4a'];
var ZSHIRTS = ['#5b5b6b', '#7a5c48', '#4a6b5b', '#6b4a5b', '#55606e'];
var ZPANTS = ['#3f4a41', '#4a4438', '#39424f'];
var ZTYPES = {
  walker: { scl: [0.95, 1.08], speed: [2.2, 3.0], sense: 38, dmg: [8, 11], thin: 1, armW: 0 },
  runner: { scl: [0.88, 0.96], speed: [4.4, 5.2], sense: 46, dmg: [6, 8], thin: 0.78, armW: -0.03 },
  brute: { scl: [1.28, 1.42], speed: [1.7, 2.1], sense: 34, dmg: [15, 20], thin: 1.08, armW: 0.05 }
};

function spawnZombie(x, z, typeName, rise) {
  var T = ZTYPES[typeName];
  var scl = rand(T.scl[0], T.scl[1]);
  var skin = ZSKINS[Math.floor(Math.random() * ZSKINS.length)];
  var shirt = ZSHIRTS[Math.floor(Math.random() * ZSHIRTS.length)];
  var pants = ZPANTS[Math.floor(Math.random() * ZPANTS.length)];
  var root = new BABYLON.TransformNode('z', scene);
  var body = new BABYLON.TransformNode('', scene);
  body.parent = root;
  var torso = box(0.74, 0.92, 0.46, 0, 1.22, 0, shirt, body);
  box(0.52, 0.24, 0.48, 0, 0.84, 0, skin, body);
  box(0.62, 0.26, 0.42, 0, 0.78, 0, pants, body);
  var head = sph(0.68, 0, 1.94, 0, skin, body, 10);
  head.rotation.z = rand(-0.14, 0.14);
  var bandMat = new BABYLON.StandardMaterial('band' + Math.random(), scene);
  bandMat.diffuseColor = BABYLON.Color3.FromHexString('#232830');
  bandMat.specularColor = BABYLON.Color3.Black();
  var band = box(0.46, 0.15, 0.1, 0, 0.06, 0.3, '#232830', head);
  band.material = bandMat;
  box(0.28, 0.1, 0.06, 0, -0.19, 0.31, '#2d2320', head);
  box(0.16, 0.05, 0.03, 0, -0.135, 0.315, '#e8e4d0', head);
  var armL = limb(body, -0.47, 1.52, 0, 0.17 + T.armW, 0.66, skin);
  var armR = limb(body, 0.47, 1.52, 0, 0.17 + T.armW, 0.66, skin);
  armL.p.rotation.x = -1.32; armR.p.rotation.x = -1.32;
  armL.p.rotation.z = 0.1; armR.p.rotation.z = -0.1;
  var legL = limb(body, -0.16, 0.84, 0, 0.19, 0.8, pants);
  var legR = limb(body, 0.16, 0.84, 0, 0.19, 0.8, pants);
  root.scaling.set(scl * T.thin, scl, scl * T.thin);
  root.position.set(x, rise ? -1.8 : 0, z);
  var sh = makeShadow(0.8 * scl, root);
  castShadow(root);
  var zb = {
    root: root, body: body, head: head, bandMat: bandMat,
    armL: armL.p, armR: armR.p, legL: legL.p, legR: legR.p,
    shadow: sh, type: typeName, scl: scl,
    speed: rand(T.speed[0], T.speed[1]), dmg: rand(T.dmg[0], T.dmg[1]),
    sense: T.sense, reach: 1.5 + 0.7 * scl, rad: 0.55 * scl,
    state: rise ? 'rise' : 'wander', t: 0, wt: null, wT: 0,
    atkT: -1, flinch: 0, enrage: 0, flashT: 0, lostT: 0, aggro: false,
    dirY: rand(0, 6.28), phase: rand(0, 6), holdSide: Math.random() < 0.5 ? 1 : -1,
    deadT: 0, fallDir: Math.random() < 0.5 ? 1 : -1, parts: null, kinds: null
  };
  zb.parts = [torso, head, armL.m, armR.m, legL.m, legR.m];
  zb.kinds = ['body', 'head', 'body', 'body', 'body', 'body'];
  ZOMBIES.push(zb);
  rebuildHitLists();
  if (rise) burst(V(x, 0.2, z), 'dust', 8, 4, 1, 0.8, 0.6, 1.4);
  return zb;
}

function rebuildHitLists() {
  zombieParts.length = 0; zombieKinds.length = 0; zombieOwners.length = 0;
  for (var i = 0; i < ZOMBIES.length; i++) {
    var z = ZOMBIES[i];
    if (z.state === 'dead') continue;
    for (var j = 0; j < z.parts.length; j++) {
      zombieParts.push(z.parts[j]);
      zombieKinds.push(z.kinds[j]);
      zombieOwners.push(z);
    }
  }
}

function disposeZombie(z) {
  removeShadow(z.root);
  z.root.getChildMeshes().forEach(function (m) { m.dispose(); });
  z.root.dispose();
  z.bandMat.dispose();
  z.shadow.dispose();
  for (var i = 0; i < SHADOWS.length; i++) {
    if (SHADOWS[i].m === z.shadow) { SHADOWS.splice(i, 1); break; }
  }
}

function killZombie(z, pt) {
  if (z.state === 'dead') return;
  z.state = 'dead';
  z.deadT = 0;
  z.head.setEnabled(false);
  burst(pt, 'goo', 10, 7, 1, 0.9, 0.5, 1.4);
  burst(pt, 'blood', 12, 8, 1, 0.7, 0.4, 1);
  kills++;
  elKills.textContent = kills;
  var hs = ['HEADSHOT!', 'BOOM!', 'SPLAT!', 'NICE SHOT!', 'DOWN!'];
  msg(hs[Math.floor(Math.random() * hs.length)], 1.2, 'hs gold');
  chFlash('hs', 220);
  chFlash('kick', 120);
  shake = Math.max(shake, 0.28);
  sfxPop();
  rebuildHitLists();
}

function damagePlayer(dmg, srcX, srcZ) {
  if (state !== 'playing' || player.invuln > 0) return;
  player.hp -= dmg;
  player.lastDmg = tNow;
  var dx = player.root.position.x - srcX, dz = player.root.position.z - srcZ;
  var d = Math.max(Math.hypot(dx, dz), 0.01);
  player.kb.x += dx / d * 5;
  player.kb.z += dz / d * 5;
  shake = Math.max(shake, 0.5);
  sfxHurt();
  elVig.classList.remove('lowhp');
  elVig.style.transition = 'none';
  elVig.style.opacity = 0.85;
  void elVig.offsetWidth;
  elVig.style.transition = 'opacity 0.45s ease-out';
  elVig.style.opacity = 0;
  if (player.hp <= 0) {
    player.hp = 0;
    killPlayer();
  }
}

function killPlayer() {
  state = 'dead';
  deathT = 3.2;
  triggerDown = false;
  elDeath.classList.add('show');
  for (var i = 0; i < ZOMBIES.length; i++) ZOMBIES[i].aggro = false;
}

function respawn() {
  var s = COL.safe[Math.floor(Math.random() * COL.safe.length)];
  var px = s.x, pz = s.z;
  for (var a = 0; a < 16; a++) {
    var ang = rand(0, 6.28), rr = rand(3.5, 8.5);
    var tx = s.x + Math.cos(ang) * rr, tz = s.z + Math.sin(ang) * rr;
    if (pointFree(tx, tz, 0.6)) { px = tx; pz = tz; break; }
  }
  player.root.position.set(px, 0, pz);
  player.hp = 100;
  player.vy = 0;
  player.vx = 0; player.vz = 0;
  player.kb.x = 0; player.kb.z = 0;
  player.invuln = 2.5;
  for (var i = 0; i < ZOMBIES.length; i++) {
    var z = ZOMBIES[i];
    if (z.state === 'dead') continue;
    var zd = Math.hypot(z.root.position.x - s.x, z.root.position.z - s.z);
    if (zd < SAFE_R + 14) {
      var ang2 = rand(0, 6.28);
      var nr = SAFE_R + rand(3, 8);
      z.root.position.set(s.x + Math.cos(ang2) * nr, 0, s.z + Math.sin(ang2) * nr);
      z.aggro = false;
      z.state = 'wander';
      z.wt = null;
    }
  }
  elDeath.classList.remove('show');
  state = 'playing';
  msg('BACK IN ACTION', 1.4, 'gold');
}

function updatePlayer(dt) {
  var p = player;
  p.invuln -= dt;
  if (tNow - p.lastDmg > 5 && p.hp < 100 && state === 'playing') {
    p.hp = Math.min(100, p.hp + 9 * dt);
  }
  var ix = 0, iy = 0;
  if (state === 'playing') {
    if (keys.KeyW || keys.ArrowUp) iy += 1;
    if (keys.KeyS || keys.ArrowDown) iy -= 1;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;
    ix += joyX; iy += -joyY;
  }
  var mag = Math.hypot(ix, iy);
  if (mag > 1) { ix /= mag; iy /= mag; }
  var sprint = (keys.Shift || keys.ShiftLeft || keys.ShiftRight || Math.hypot(joyX, joyY) > 0.93) && mag > 0.1;
  p.sprinting = sprint && state === 'playing';
  var spd = sprint ? 10 : 6.3;
  var fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  var rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
  var wx = (fx * iy + rx * ix) * spd;
  var wz = (fz * iy + rz * ix) * spd;
  var k = smooth(12, dt);
  p.vx += (wx - p.vx) * k;
  p.vz += (wz - p.vz) * k;
  var kd = Math.exp(-6 * dt);
  p.kb.x *= kd; p.kb.z *= kd;
  var pos = p.root.position;
  var nx = pos.x + (p.vx + p.kb.x) * dt;
  var nz = pos.z + (p.vz + p.kb.z) * dt;
  
  // 3D Collision Resolution with Walls and Obstacles
  var res = resolve3DCollisions(nx, pos.y, nz, 0.55, 1.85);
  nx = Math.max(-BOUND, Math.min(BOUND, res[0]));
  nz = Math.max(-BOUND, Math.min(BOUND, res[1]));
  
  for (var i = 0; i < ZOMBIES.length; i++) {
    var z = ZOMBIES[i];
    if (z.state === 'dead' || z.state === 'rise') continue;
    var dx = nx - z.root.position.x, dz = nz - z.root.position.z;
    var dd = Math.hypot(dx, dz);
    var minD = z.rad + 0.5;
    if (dd < minD && dd > 0.001 && Math.abs(pos.y - z.root.position.y) < 1.8) {
      nx = z.root.position.x + dx / dd * minD;
      nz = z.root.position.z + dz / dd * minD;
    }
  }
  pos.x = nx; pos.z = nz;

  // Ladder Proximity & Climbing Physics
  var nearLadder = getLadderAt(pos.x, pos.y, pos.z, 0.88);
  if (elClimb) elClimb.classList.toggle('show', !!nearLadder && !p.onLadder && state === 'playing');
  if (nearLadder && state === 'playing') {
    var climbInput = 0;
    if (keys.KeyW || keys.ArrowUp) climbInput += 1;
    if (keys.KeyS || keys.ArrowDown) climbInput -= 1;
    if (wantJump || keys.Space) climbInput += 1;
    
    if (climbInput !== 0 || p.onLadder) {
      p.onLadder = true;
      p.grounded = false;
      p.vy = 0;
      
      // Smoothly center onto ladder
      pos.x += (nearLadder.x - pos.x) * smooth(12, dt);
      pos.z += (nearLadder.z - pos.z) * smooth(12, dt);
      pos.y += climbInput * 4.4 * dt;
      
      if (climbInput !== 0) {
        p.climbStep = (p.climbStep || 0) + Math.abs(climbInput) * dt * 4.5;
        if (p.climbStep > 0.38) {
          p.climbStep = 0;
          sfxLadderStep();
        }
      }
      
      if (pos.y >= nearLadder.topY) {
        pos.y = nearLadder.topY;
        p.onLadder = false;
        p.grounded = true;
        var rAngle = nearLadder.facingYaw || camYaw;
        pos.x += Math.cos(rAngle) * 0.7;
        pos.z += Math.sin(rAngle) * 0.7;
        msg('REACHED ROOFTOP — HIGH GROUND VANTAGE', 1.8, 'gold');
      } else if (pos.y <= nearLadder.yMin) {
        pos.y = nearLadder.yMin;
        p.onLadder = false;
        p.grounded = true;
      }
      wantJump = false;
    }
  } else {
    p.onLadder = false;
  }

  // Door Proximity & Hint
  var nearD = getNearbyDoor(pos.x, pos.y, pos.z, 2.8);
  if (elDoor) {
    if (nearD && state === 'playing') {
      elDoor.textContent = nearD.open ? (MOBILE ? 'TAP [DOOR] TO CLOSE' : 'PRESS [E] TO CLOSE DOOR') : (MOBILE ? 'TAP [DOOR] TO OPEN' : 'PRESS [E] TO OPEN DOOR');
      elDoor.classList.add('show');
    } else {
      elDoor.classList.remove('show');
    }
  }

  // Scavengeable Loot Pickups (Medkits, Ammo Crates)
  for (var li = 0; li < LOOT_ITEMS.length; li++) {
    var item = LOOT_ITEMS[li];
    if (!item.taken) {
      var ldx = pos.x - item.x, ldz = pos.z - item.z;
      if (ldx * ldx + ldz * ldz < 1.6 * 1.6 && Math.abs(pos.y - item.y) < 1.8) {
        item.taken = true;
        item.respawnT = 45;
        item.node.setEnabled(false);
        sfxPickup();
        if (item.type === 'medkit') {
          p.hp = Math.min(100, p.hp + 40);
          msg('+40 HP FIRST AID MEDKIT', 1.5, 'green');
          burst(V(item.x, item.y + 0.3, item.z), 'spark', 8, 4, 1, 0.4, 0.2, 0.5);
        } else if (item.type === 'ammo') {
          msg('AMMO SUPPLY CRATE RECOVERED', 1.5, 'gold');
          burst(V(item.x, item.y + 0.3, item.z), 'spark', 8, 4, 1, 0.4, 0.2, 0.5);
        }
      }
    }
  }

  // Ground Elevation, Step Climbing & 3D Gravity
  if (!p.onLadder) {
    var targetG = getGroundHeight(pos.x, pos.z, pos.y, 0.45);
    
    // Smooth step-up for curbs, porch steps, debris
    if (p.grounded && targetG > pos.y && targetG - pos.y <= 0.48) {
      pos.y += (targetG - pos.y) * smooth(24, dt);
    }
    
    // Jump
    if (wantJump && p.grounded && state === 'playing') {
      p.vy = 8.6;
      p.grounded = false;
      sfxStep();
    }
    wantJump = false;
    
    // Apply gravity
    if (!p.grounded || pos.y > targetG + 0.05) {
      p.vy -= 24 * dt;
      pos.y += p.vy * dt;
    }
    
    // Landing detection
    if (pos.y <= targetG) {
      if (!p.grounded && p.vy < -7) {
        sfxLand();
        shake = Math.max(shake, Math.min(0.35, -p.vy * 0.025));
        burst(V(pos.x, pos.y + 0.1, pos.z), 'dust', 6, 3.5, 0.6, 0.5, 0.3, 0.8);
      } else if (!p.grounded) {
        sfxStep();
      }
      pos.y = targetG;
      p.grounded = true;
      p.vy = 0;
    } else if (pos.y > targetG + 0.1) {
      p.grounded = false;
    }
  }

  p.root.rotation.y = camYaw;
  var hs = Math.hypot(p.vx, p.vz);
  p.phase += hs * dt * 1.55;
  var ampFrac = Math.min(hs / 9, 1);
  var swing = Math.sin(p.phase) * 0.7 * ampFrac;
  p.legL.rotation.x = swing;
  p.legR.rotation.x = -swing;
  p.body.position.y = Math.abs(Math.sin(p.phase)) * 0.06 * ampFrac;
  p.body.rotation.x = ampFrac * 0.12;
  p.stepAcc += hs * dt;
  if (p.stepAcc > 2.4 && p.grounded && !p.onLadder) { p.stepAcc = 0; sfxStep(); }
  p.gunDip = Math.max(0, p.gunDip - dt * 5);
  p.gunKick = Math.max(0, p.gunKick - dt * 7);
  p.gunAnchor.position.y = 1.3 - p.gunDip * 0.35 + Math.sin(p.phase * 0.5) * 0.012 * ampFrac;
  p.gunAnchor.rotation.x = -p.gunKick * 0.35;
  var vis = p.invuln > 0 ? (Math.sin(tNow * 28) > 0 ? 1 : 0.35) : 1;
  if (camDistCur < 2.6) vis = 0;
  for (var m = 0; m < p.meshes.length; m++) p.meshes[m].visibility = vis;
}

var RING_BASE = BABYLON.Color3.FromHexString('#59e3ff');

function updateWorldFX(dt) {
  updateLoot(dt);
  for (var i = 0; i < clouds.length; i++) {
    var c = clouds[i];
    c.m.position.x += c.v * dt;
    if (c.m.position.x > 340) c.m.position.x = -340;
  }
  for (var r = 0; r < ringMats.length; r++) {
    var pulse = 0.72 + 0.28 * Math.sin(tNow * 2.2 + r * 1.3);
    ringMats[r].alpha = 0.55 + 0.35 * pulse;
    ringMats[r].emissiveColor.copyFrom(RING_BASE).scaleInPlace(pulse);
  }
  for (var e = 0; e < emblems.length; e++) {
    emblems[e].rotation.y += dt * 1.2;
    emblems[e].position.y = 8.8 + Math.sin(tNow * 1.6 + e) * 0.3;
  }
  for (var w = 0; w < waterMats.length; w++) {
    waterMats[w].alpha = 0.74 + 0.08 * Math.sin(tNow * 3 + w);
  }
  for (var l = 0; l < lanternLights.length; l++) {
    lanternLights[l].intensity = 1.25 + 0.16 * Math.sin(tNow * 13 + l * 3.7) + 0.05 * (Math.random() - 0.5);
  }
  if (flashLight.intensity > 0.01) {
    flashLight.intensity *= Math.exp(-26 * dt);
    flashMesh.isVisible = true;
    flashMesh.visibility = Math.min(1, flashLight.intensity / 8);
    flashMesh.position.copyFrom(flashLight.position);
  } else {
    flashMesh.isVisible = false;
  }
}

function updateZombies(dt) {
  var pp = player.root.position;
  var playerAlive = state === 'playing';
  var playerSafe = inSafePoint(pp.x, pp.z, 0);
  var removals = [];
  for (var i = 0; i < ZOMBIES.length; i++) {
    var z = ZOMBIES[i];
    var zp = z.root.position;
    if (z.state === 'dead') {
      z.deadT += dt;
      z.root.rotation.x = lerpAng(z.root.rotation.x, z.fallDir * 1.52, smooth(7, dt));
      if (z.deadT > 1.7) zp.y -= dt * 0.9;
      var fade = z.deadT > 2.1 ? Math.max(0, 1 - (z.deadT - 2.1) * 2) : 1;
      z.body.getChildMeshes().forEach(function (m) { m.visibility = fade; });
      z.shadow.scaling.setAll(Math.max(0.01, 0.8 * z.scl * fade));
      if (z.deadT > 2.7) removals.push(z);
      continue;
    }
    if (z.state === 'rise') {
      z.t += dt;
      var rk = Math.min(z.t / 0.8, 1);
      zp.y = -1.8 * (1 - rk);
      if (rk >= 1) { z.state = 'wander'; zp.y = 0; }
      continue;
    }
    var dx = pp.x - zp.x, dz = pp.z - zp.z;
    var dist = Math.hypot(dx, dz);
    if (!playerAlive) z.aggro = false;
    else if (dist < z.sense) { z.aggro = true; z.lostT = 0; }
    else if (z.aggro) {
      z.lostT += dt;
      if (z.lostT > 5 || dist > 70) z.aggro = false;
    }
    z.flinch = Math.max(0, z.flinch - dt);
    z.enrage = Math.max(0, z.enrage - dt);
    z.flashT = Math.max(0, z.flashT - dt * 1.4);
    z.bandMat.emissiveColor.set(z.flashT * 0.9, z.flashT * 0.08, 0);
    var spdMul = (z.enrage > 0 ? 1.45 : 1) * (z.flinch > 0 ? 0.12 : 1);
    var mvx = 0, mvz = 0, faceTo = null, moving = false;
    var chaseSpeed = z.speed * spdMul;

    if (z.aggro && !playerSafe) {
      faceTo = Math.atan2(dx, dz);
      if (dist > z.reach) {
        mvx = dx / dist; mvz = dz / dist;
        moving = true;
      } else if (z.atkT < 0) {
        z.atkT = 0;
      }
    } else if (z.aggro && playerSafe) {
      var bestZone = null, bestD = Infinity;
      for (var s = 0; s < COL.safe.length; s++) {
        var zn = COL.safe[s];
        var zd0 = Math.hypot(zp.x - zn.x, zp.z - zn.z);
        if (zd0 < bestD) { bestD = zd0; bestZone = zn; }
      }
      var ringD = bestZone.r + z.rad + 0.5;
      if (bestD > ringD) {
        faceTo = Math.atan2(bestZone.x - zp.x, bestZone.z - zp.z);
        var bd = Math.max(bestD, 0.01);
        mvx = (bestZone.x - zp.x) / bd; mvz = (bestZone.z - zp.z) / bd;
        moving = true;
      } else {
        if (Math.random() < dt * 0.25) z.holdSide *= -1;
        var tx = -(bestZone.z - zp.z) / Math.max(bestD, 0.01) * z.holdSide;
        var tz = (bestZone.x - zp.x) / Math.max(bestD, 0.01) * z.holdSide;
        mvx = tx; mvz = tz;
        faceTo = Math.atan2(tx, tz);
        moving = true;
        chaseSpeed *= 0.45;
      }
    } else {
      z.wT -= dt;
      if (!z.wt || z.wT <= 0 || Math.hypot(z.wt[0] - zp.x, z.wt[1] - zp.z) < 1.5) {
        var found = false;
        for (var att = 0; att < 6; att++) {
          var wa = rand(0, 6.28), wr = rand(6, 20);
          var cx2 = zp.x + Math.cos(wa) * wr, cz2 = zp.z + Math.sin(wa) * wr;
          if (pointFree(cx2, cz2, 0.8) && !inSafePoint(cx2, cz2, 1)) {
            z.wt = [cx2, cz2];
            found = true;
            break;
          }
        }
        if (!found) z.wt = null;
        z.wT = rand(4, 9);
      }
      if (z.wt) {
        var wx = z.wt[0] - zp.x, wz = z.wt[1] - zp.z;
        var wd = Math.hypot(wx, wz);
        if (wd > 0.5) {
          mvx = wx / wd; mvz = wz / wd;
          faceTo = Math.atan2(wx, wz);
          moving = true;
          chaseSpeed = z.speed * 0.42;
        }
      }
    }

    var stepX = mvx * chaseSpeed * dt;
    var stepZ = mvz * chaseSpeed * dt;
    var cand = resolve3DCollisions(zp.x + stepX, zp.y, zp.z + stepZ, z.rad, 1.85, true);
    var clamped = clampSafeOut(cand[0], cand[1], z.rad);
    zp.x = Math.max(-BOUND, Math.min(BOUND, clamped[0]));
    zp.z = Math.max(-BOUND, Math.min(BOUND, clamped[1]));
    zp.y = getGroundHeight(zp.x, zp.z, zp.y + 0.2);

    // Zombie Door Inability: Cannot open doors, furiously bangs on closed doors!
    var nearClosedDoor = null;
    if (z.aggro) {
      for (var di = 0; di < DOORS.length; di++) {
        var dr = DOORS[di];
        if (!dr.open) {
          var dxDoor = zp.x - dr.x, dzDoor = zp.z - dr.z;
          if (dxDoor * dxDoor + dzDoor * dzDoor < 2.5 * 2.5 && Math.abs(zp.y - dr.y) < 2.2) {
            nearClosedDoor = dr;
            break;
          }
        }
      }
    }

    if (nearClosedDoor && z.aggro && dist > z.reach) {
      z.banging = true;
      faceTo = Math.atan2(nearClosedDoor.x - zp.x, nearClosedDoor.z - zp.z);
      moving = false;
      z.bangTimer = (z.bangTimer || 0) + dt;
      if (z.bangTimer > 0.42) {
        z.bangTimer = 0;
        sfxDoorBang();
        burst(V(nearClosedDoor.x, nearClosedDoor.y + 1.4, nearClosedDoor.z), 'wood', 4, 3, 0.6, 0.4, 0.2, 0.5);
      }
    } else {
      z.banging = false;
    }

    if (faceTo !== null) z.dirY = lerpAng(z.dirY, faceTo, smooth(8, dt));
    z.root.rotation.y = z.dirY;

    var actualSpd = moving ? chaseSpeed : 0;
    z.phase += actualSpd * dt * 2.2;
    var zamp = Math.min(actualSpd / 4, 1) * 0.55;
    var zsw = Math.sin(z.phase);
    z.legL.rotation.x = zsw * zamp;
    z.legR.rotation.x = -zsw * zamp;
    var armBase = -1.32 + Math.sin(z.phase * 0.5) * 0.08;
    var lean = z.aggro ? 0.14 : 0.04;
    if (z.banging) {
      var armBang = -1.2 + Math.sin(tNow * 16 + z.phase) * 0.7;
      z.armL.rotation.x = armBang;
      z.armR.rotation.x = -1.2 + Math.sin(tNow * 16 + z.phase + Math.PI) * 0.7;
      lean = 0.16;
    } else if (z.atkT >= 0) {
      z.atkT += dt;
      var at = z.atkT;
      var armRot;
      if (at < 0.25) armRot = -1.32 - (at / 0.25) * 1.0;
      else if (at < 0.4) armRot = -2.32 + ((at - 0.25) / 0.15) * 1.5;
      else armRot = -0.82 + Math.min((at - 0.4) / 0.35, 1) * -0.5;
      z.armL.rotation.x = armRot;
      z.armR.rotation.x = armRot - 0.08;
      if (!z.hitDone && at >= 0.32) {
        z.hitDone = true;
        if (playerAlive && Math.hypot(pp.x - zp.x, pp.z - zp.z) < z.reach + 0.5 && Math.abs(pp.y - zp.y) < 1.6) {
          damagePlayer(z.dmg, zp.x, zp.z);
        }
      }
      if (at > 0.75) { z.atkT = -1; z.hitDone = false; }
      lean = 0.05 + Math.sin(Math.min(at / 0.65, 1) * Math.PI) * 0.18;
    } else {
      z.armL.rotation.x = armBase + zsw * zamp * 0.25;
      z.armR.rotation.x = armBase - zsw * zamp * 0.25;
    }
    z.body.rotation.x = lean - z.flinch * 1.2;
  }
  for (var a = 0; a < ZOMBIES.length; a++) {
    var za = ZOMBIES[a];
    if (za.state === 'dead' || za.state === 'rise') continue;
    for (var b = a + 1; b < ZOMBIES.length; b++) {
      var zb2 = ZOMBIES[b];
      if (zb2.state === 'dead' || zb2.state === 'rise') continue;
      var ddx = zb2.root.position.x - za.root.position.x;
      var ddz = zb2.root.position.z - za.root.position.z;
      var ddd = Math.hypot(ddx, ddz);
      var minDD = (za.rad + zb2.rad) * 0.9;
      if (ddd < minDD && ddd > 0.001) {
        var push = (minDD - ddd) / 2;
        var ux = ddx / ddd, uz = ddz / ddd;
        za.root.position.x -= ux * push; za.root.position.z -= uz * push;
        zb2.root.position.x += ux * push; zb2.root.position.z += uz * push;
      }
    }
  }
  for (var rm = 0; rm < removals.length; rm++) {
    var zz = removals[rm];
    disposeZombie(zz);
    var idx = ZOMBIES.indexOf(zz);
    if (idx >= 0) ZOMBIES.splice(idx, 1);
  }
  if (removals.length) rebuildHitLists();
}

function director(dt) {
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = 1.1;
    var aliveCount = 0;
    for (var i = 0; i < ZOMBIES.length; i++) if (ZOMBIES[i].state !== 'dead') aliveCount++;
    if (aliveCount < TARGET_ALIVE) {
      var pp = player.root.position;
      for (var att = 0; att < 14; att++) {
        var ang = rand(0, 6.28), d = rand(60, 130);
        var x = pp.x + Math.cos(ang) * d, z = pp.z + Math.sin(ang) * d;
        if (Math.abs(x) > BOUND - 5 || Math.abs(z) > BOUND - 5) continue;
        if (!pointFree(x, z, 0.9)) continue;
        var roll = Math.random();
        var tn = roll < 0.22 ? 'runner' : (roll < 0.34 ? 'brute' : 'walker');
        spawnZombie(x, z, tn, true);
        break;
      }
    }
  }
  for (var j = ZOMBIES.length - 1; j >= 0; j--) {
    var zz = ZOMBIES[j];
    if (zz.state === 'dead') continue;
    var dd2 = Math.hypot(zz.root.position.x - player.root.position.x, zz.root.position.z - player.root.position.z);
    if (dd2 > 185) {
      disposeZombie(zz);
      ZOMBIES.splice(j, 1);
    }
  }
  growlTimer -= dt;
  if (growlTimer <= 0) {
    growlTimer = rand(2, 4.5);
    var cands = [];
    for (var g = 0; g < ZOMBIES.length; g++) {
      var zg = ZOMBIES[g];
      if (zg.state === 'dead' || zg.state === 'rise') continue;
      var gd = Math.hypot(zg.root.position.x - player.root.position.x, zg.root.position.z - player.root.position.z);
      if (gd < 42) cands.push([zg, gd]);
    }
    if (cands.length) {
      var pick = cands[Math.floor(Math.random() * cands.length)];
      sfxGrowl(Math.max(0.1, 1 - pick[1] / 42) * 0.9);
    }
  }
}

function handleFire(dt) {
  cool -= dt;
  if (state !== 'playing') return;
  var w = WPN[player.cur];
  var want = triggerDown && (w.auto || !fireLatch);
  if (want && cool <= 0) {
    fireLatch = true;
    fireShot();
  }
}

function fireShot() {
  var w = WPN[player.cur];
  cool = 1 / w.rps;
  var spread = w.spread * (1 - adsAmt) + w.spreadAds * adsAmt;
  var effPitch = Math.max(-0.5, Math.min(1.25, camPitch + recoil));
  var cp = Math.cos(effPitch);
  var dir = V(Math.sin(camYaw) * cp, -Math.sin(effPitch), Math.cos(camYaw) * cp);
  var rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
  var upv = BABYLON.Vector3.Cross(dir, V(rx, 0, rz)).normalize();
  var g1 = (Math.random() + Math.random() - 1) * spread;
  var g2 = (Math.random() + Math.random() - 1) * spread;
  dir = dir.add(V(rx * g1, 0, rz * g1)).add(upv.scale(g2)).normalize();
  var origin = camera.position.clone();
  var ray = new BABYLON.Ray(origin, dir, 320);

  var envMin = Infinity, envPoint = null;
  for (var o = 0; o < OCCLUDERS.length; o++) {
    var oi = ray.intersectsMesh(OCCLUDERS[o]);
    if (oi && oi.hit && oi.distance < envMin) {
      envMin = oi.distance;
      if (oi.pickedPoint) envPoint = oi.pickedPoint.clone();
    }
  }
  var headMin = Infinity, headPt = null, headZ = null;
  var bodyMin = Infinity, bodyPt = null, bodyZ = null;
  for (var i = 0; i < zombieParts.length; i++) {
    var zi = ray.intersectsMesh(zombieParts[i]);
    if (!zi || !zi.hit) continue;
    if (zombieKinds[i] === 'head') {
      if (zi.distance < headMin) {
        headMin = zi.distance; headPt = zi.pickedPoint ? zi.pickedPoint.clone() : null; headZ = zombieOwners[i];
      }
    } else if (zi.distance < bodyMin) {
      bodyMin = zi.distance; bodyPt = zi.pickedPoint ? zi.pickedPoint.clone() : null; bodyZ = zombieOwners[i];
    }
  }

  var muzzleAbs = absPos(player.muzzle[player.cur]);
  var endPoint = null, result = 'miss';
  if (headMin < Infinity && headMin < envMin + 0.001 && (bodyMin === Infinity || headMin <= bodyMin + 0.45)) {
    result = 'head'; endPoint = headPt;
  } else if (bodyMin < Infinity && bodyMin < envMin + 0.001) {
    result = 'body'; endPoint = bodyPt;
  } else if (envMin < Infinity) {
    result = 'env'; endPoint = envPoint;
  }
  if (!endPoint) endPoint = origin.add(dir.scale(90));

  tracer(muzzleAbs, endPoint);
  flashLight.position.copyFrom(muzzleAbs);
  flashLight.intensity = w.flash;
  recoil += w.kick;
  player.gunKick = 1;
  chFlash('kick', 90);
  sfxShot(player.cur);

  // Eject realistic brass bullet shell
  var rDir = V(Math.cos(camYaw + 0.35), 0.2, -Math.sin(camYaw + 0.35));
  spawnShell(muzzleAbs, rDir);

  if (result === 'head' && headZ) {
    killZombie(headZ, headPt || endPoint);
  } else if (result === 'body' && bodyZ) {
    bodyZ.flinch = 0.25;
    bodyZ.enrage = 4;
    bodyZ.flashT = 1;
    if (bodyZ.state !== 'rise') { bodyZ.aggro = true; bodyZ.lostT = 0; }
    if (bodyPt) burst(bodyPt, 'blood', 6, 5, 1, 0.5, 0.3, 0.7);
    sfxTick();
    chFlash('hit', 140);
    if (tNow - lastBodyWarn > 2.5) {
      lastBodyWarn = tNow;
      subMsg('BODY HITS ONLY ANGER THEM - AIM FOR THE HEAD!', 2.4);
    }
  } else if (result === 'env' && endPoint) {
    burst(endPoint, 'dust', 5, 3.5, 1, 0.5, 0.3, 0.8);
    burst(endPoint, 'spark', 4, 4.5, 1, 0.3, 0.2, 0.5);
    burst(endPoint, 'concrete', 4, 3, 1, 0.4, 0.2, 0.6);
    burst(endPoint, 'wood', 4, 3, 1, 0.4, 0.2, 0.6);
    sfxWoodHit();
  }
}

function updateCamera(dt) {
  var adsTarget = (adsHeld && !MOBILE && state === 'playing') ? 1 : 0;
  adsAmt += (adsTarget - adsAmt) * smooth(12, dt);
  recoil *= Math.exp(-9 * dt);
  elCH.classList.toggle('ads', adsAmt > 0.5);
  var fovT = 0.9 + (player.sprinting ? 0.06 : 0) - adsAmt * 0.33;
  camera.fov += (fovT - camera.fov) * smooth(10, dt);

  var pos = player.root.position;
  var effPitch = Math.max(-0.5, Math.min(1.25, camPitch + recoil));
  var cp = Math.cos(effPitch);
  var dirFull = V(Math.sin(camYaw) * cp, -Math.sin(effPitch), Math.cos(camYaw) * cp);
  var rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
  var target = V(pos.x + rx * 0.52 * (1 - adsAmt * 0.4), pos.y + 1.78, pos.z + rz * 0.52 * (1 - adsAmt * 0.4));

  var desiredDist = 9.4 - 2.6 * adsAmt;
  var back = dirFull.scale(-1);
  var probeRay = new BABYLON.Ray(target, back, desiredDist + 0.6);
  var maxAllowed = desiredDist;
  var checkDistSq = (desiredDist + 18) * (desiredDist + 18);
  for (var o = 0; o < OCCLUDERS.length; o++) {
    var occ = OCCLUDERS[o];
    var b = occ.getBoundingInfo().boundingSphere;
    var cdx = b.centerWorld.x - target.x, cdz = b.centerWorld.z - target.z;
    if (cdx * cdx + cdz * cdz > checkDistSq + b.radius * b.radius) continue;
    var oi = probeRay.intersectsMesh(occ, false);
    if (oi && oi.hit && oi.distance - 0.4 < maxAllowed) maxAllowed = Math.max(1.4, oi.distance - 0.4);
  }
  var rate = maxAllowed < camDistCur ? 24 : 6;
  camDistCur += (maxAllowed - camDistCur) * smooth(rate, dt);

  var gamePos = target.add(back.scale(camDistCur));
  var gameTarget = target;
  if (introT > 0) {
    introT -= dt / 1.1;
    var kk = 1 - Math.max(introT, 0);
    var e = kk * kk * (3 - 2 * kk);
    camera.position.copyFrom(BABYLON.Vector3.Lerp(startPos, gamePos, e));
    camera.setTarget(BABYLON.Vector3.Lerp(startTarget, gameTarget, e));
  } else {
    camera.position.copyFrom(gamePos);
    camera.setTarget(gameTarget);
  }
  if (shake > 0.002) {
    camera.position.x += rand(-1, 1) * shake * 0.35;
    camera.position.y += rand(-1, 1) * shake * 0.3;
    camera.position.z += rand(-1, 1) * shake * 0.35;
    shake *= Math.exp(-7 * dt);
  }

  // Real-time Shadow Elevation Update
  for (var s = 0; s < SHADOWS.length; s++) {
    var sh = SHADOWS[s];
    var fp = sh.f.position;
    var sG = getGroundHeight(fp.x, fp.z, fp.y + 0.1);
    sh.m.position.set(fp.x, sG + 0.03, fp.z);
  }
}

function refreshHUD() {
  elHP.style.width = Math.max(0, player.hp) + '%';
  elHP.classList.toggle('hurt', player.hp < 35);
  var low = player.hp < 30 && state !== 'menu';
  elVig.classList.toggle('lowhp', low);
  if (!low && parseFloat(elVig.style.opacity || 0) === 0) {
    elVig.style.boxShadow = '';
  }
}

var perfAcc = 0;
var curScale = BASE_SCALE;
function perfTick(dt) {
  perfAcc += dt;
  if (perfAcc < 3.5) return;
  perfAcc = 0;
  var fps = engine.getFps();
  var maxScale = MOBILE ? BASE_SCALE * 2.4 : BASE_SCALE * 1.8;
  var lowThresh = MOBILE ? 24 : 28;
  var highThresh = MOBILE ? 52 : 50;
  if (fps < lowThresh && curScale < maxScale) {
    curScale *= 1.15;
    engine.setHardwareScalingLevel(curScale);
  } else if (fps > highThresh && curScale > BASE_SCALE) {
    curScale = Math.max(BASE_SCALE, curScale * 0.94);
    engine.setHardwareScalingLevel(curScale);
  }
}

function menuCam(t) {
  var a = t * 0.12;
  camera.position.set(Math.sin(a) * 62, 27, Math.cos(a) * 62);
  camera.setTarget(V(0, 6, 0));
}

function begin() {
  if (started && state === 'playing') return;
  started = true;
  initAudio();
  if (AC && AC.resume) {
    try { AC.resume(); } catch (e) {}
  }
  elStart.classList.add('hidden');
  elStart.style.display = 'none';
  state = 'playing';
  startPos = camera.position.clone();
  startTarget = V(0, 6, 0);
  introT = 0.8;
  if (!MOBILE) {
    try {
      var pl = canvas.requestPointerLock();
      if (pl && pl.catch) pl.catch(function () {});
    } catch (e) {}
  }
  msg('FIND SAFE HOUSES - THEY KEEP THE DEAD OUT', 3, 'gold');
}

var lastMouseX = null, lastMouseY = null;

function bindInput() {
  window.addEventListener('keydown', function (e) {
    var c = e.code, k = (e.key || '').toLowerCase();
    keys[c] = true;
    if (c === 'KeyW' || k === 'w' || c === 'ArrowUp' || k === 'z') keys.KeyW = true;
    if (c === 'KeyS' || k === 's' || c === 'ArrowDown') keys.KeyS = true;
    if (c === 'KeyA' || k === 'a' || c === 'ArrowLeft' || k === 'q') keys.KeyA = true;
    if (c === 'KeyD' || k === 'd' || c === 'ArrowRight') keys.KeyD = true;
    if (c === 'Space' || k === ' ') wantJump = true;
    if (c === 'ShiftLeft' || c === 'ShiftRight' || k === 'shift') keys.Shift = true;
    if (c === 'Digit1' || k === '1') switchWeapon('pistol');
    if (c === 'Digit2' || k === '2') switchWeapon('rifle');
    if (c === 'KeyE' || k === 'e') {
      var nearD = getNearbyDoor(player.root.position.x, player.root.position.y, player.root.position.z, 3.2);
      if (nearD) {
        toggleDoor(nearD);
        msg(nearD.open ? 'DOOR OPENED' : 'DOOR CLOSED & LATCHED', 1.2, 'green');
      }
    }
    
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].indexOf(c) >= 0) e.preventDefault();
    if (state !== 'playing') begin();
    if (elResume) elResume.classList.remove('show');
  });

  window.addEventListener('keyup', function (e) {
    var c = e.code, k = (e.key || '').toLowerCase();
    keys[c] = false;
    if (c === 'KeyW' || k === 'w' || c === 'ArrowUp' || k === 'z') keys.KeyW = false;
    if (c === 'KeyS' || k === 's' || c === 'ArrowDown') keys.KeyS = false;
    if (c === 'KeyA' || k === 'a' || c === 'ArrowLeft' || k === 'q') keys.KeyA = false;
    if (c === 'KeyD' || k === 'd' || c === 'ArrowRight') keys.KeyD = false;
    if (c === 'ShiftLeft' || c === 'ShiftRight' || k === 'shift') keys.Shift = false;
  });

  window.addEventListener('blur', function () {
    keys = {};
    triggerDown = false;
    adsHeld = false;
    lastMouseX = null;
    lastMouseY = null;
  });

  function onPointerDown(e) {
    if (state !== 'playing') {
      begin();
      return;
    }
    if (elResume) elResume.classList.remove('show');
    if (MOBILE) {
      var w = window.innerWidth, h = window.innerHeight;
      if (e.clientX < w * 0.42 && e.clientY > h * 0.4 && joyId === null) {
        joyId = e.pointerId;
      } else if (lookId === null) {
        lookId = e.pointerId;
        lookLast = [e.clientX, e.clientY];
      }
      return;
    }

    if (document.pointerLockElement !== canvas) {
      try {
        var pl = canvas.requestPointerLock();
        if (pl && pl.catch) pl.catch(function () {});
      } catch (err) {}
    }
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    if (e.button === 0) { triggerDown = true; fireLatch = false; }
    if (e.button === 2) adsHeld = true;
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('mousedown', onPointerDown);

  function onPointerMove(e) {
    if (MOBILE) {
      if (e.pointerId === joyId) {
        var rect = elJoy.getBoundingClientRect();
        var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        var dx = e.clientX - cx, dy = e.clientY - cy;
        var d = Math.hypot(dx, dy);
        var max = rect.width / 2 - 12;
        if (d > max) { dx = dx / d * max; dy = dy / d * max; }
        elKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        joyX = dx / max; joyY = dy / max;
      } else if (e.pointerId === lookId) {
        var mx = e.clientX - lookLast[0], my = e.clientY - lookLast[1];
        lookLast = [e.clientX, e.clientY];
        if (state === 'playing') {
          camYaw += mx * 0.0045;
          camPitch = Math.max(-0.5, Math.min(1.25, camPitch + my * 0.0045));
        }
      }
      return;
    }

    if (state !== 'playing') return;
    var locked = document.pointerLockElement === canvas;
    var sens = 0.0024 * (1 - adsAmt * 0.45);
    var mx = 0, my = 0;
    if (locked) {
      mx = (e.movementX !== undefined) ? e.movementX : 0;
      my = (e.movementY !== undefined) ? e.movementY : 0;
    } else {
      if (lastMouseX !== null && lastMouseY !== null) {
        mx = e.clientX - lastMouseX;
        my = e.clientY - lastMouseY;
      }
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    }
    camYaw += mx * sens;
    camPitch = Math.max(-0.5, Math.min(1.25, camPitch + my * sens));
  }

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('mousemove', onPointerMove);

  function releasePointer(e) {
    if (MOBILE) {
      if (e.pointerId === joyId) {
        joyId = null; joyX = 0; joyY = 0;
        elKnob.style.transform = 'translate(0,0)';
      }
      if (e.pointerId === lookId) lookId = null;
    }
  }
  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);
  window.addEventListener('mouseup', function (e) {
    if (e.button === 0) triggerDown = false;
    if (e.button === 2) adsHeld = false;
  });
  window.addEventListener('wheel', function () {
    if (state === 'playing') switchWeapon(player.cur === 'pistol' ? 'rifle' : 'pistol');
  }, { passive: true });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  document.addEventListener('pointerlockchange', function () {
    var locked = document.pointerLockElement === canvas;
    if (elResume && !MOBILE) elResume.classList.toggle('show', !locked && state === 'playing' && started);
  });

  elStart.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    begin();
  });
  elStart.addEventListener('click', function (e) {
    e.preventDefault();
    begin();
  });

  function pressBtn(el, down, up) {
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('pressed');
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      down();
    });
    function end(e2) {
      el.classList.remove('pressed');
      if (up) up();
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  if (MOBILE) {
    pressBtn(btnFire, function () { if (state === 'playing') { triggerDown = true; fireLatch = false; } },
      function () { triggerDown = false; });
    pressBtn(btnJump, function () { wantJump = true; });
    pressBtn(btnDoor, function () {
      var nearD = getNearbyDoor(player.root.position.x, player.root.position.y, player.root.position.z, 3.4);
      if (nearD) {
        toggleDoor(nearD);
        msg(nearD.open ? 'DOOR OPENED' : 'DOOR CLOSED & LATCHED', 1.2, 'green');
      }
    });
    pressBtn(btnSwap, function () { switchWeapon(player.cur === 'pistol' ? 'rifle' : 'pistol'); });
  }

  window.addEventListener('resize', function () { engine.resize(); });
  document.addEventListener('visibilitychange', function () {
    if (!AC) return;
    if (document.hidden) AC.suspend(); else AC.resume();
  });
  window.addEventListener('gesturestart', function (e) { e.preventDefault(); });
}

buildPlayer();

(function populate() {
  var pp = player.root.position;
  var n = 0, tries = 0;
  while (n < TARGET_ALIVE && tries < 400) {
    tries++;
    var x = rand(-270, 270), z = rand(-270, 270);
    if (!pointFree(x, z, 1)) continue;
    if (Math.hypot(x - pp.x, z - pp.z) < 50) continue;
    var roll = Math.random();
    var tn = roll < 0.22 ? 'runner' : (roll < 0.34 ? 'brute' : 'walker');
    spawnZombie(x, z, tn, false);
    n++;
  }
})();

bindInput();
elWpn.textContent = WPN.pistol.label;

var _frameCount = 0;
engine.runRenderLoop(function () {
  var dt = Math.min(engine.getDeltaTime() / 1000, 0.05) || 0.016;
  tNow += dt;
  updateWorldFX(dt);
  if (state === 'menu') {
    menuCam(tNow);
  } else {
    updatePlayer(dt);
    updateZombies(dt);
    director(dt);
    handleFire(dt);
    updateCamera(dt);
    if (state === 'dead') {
      deathT -= dt;
      elDeathText.textContent = 'RESPAWNING IN ' + Math.ceil(Math.max(deathT, 0)) + '...';
      if (deathT <= 0) respawn();
    }
  }
  updParticles(dt);
  refreshHUD();
  perfTick(dt);
  scene.render();
  _frameCount++;
  if (_frameCount === 1) {
    var prog = document.getElementById('loadProgress');
    if (prog) prog.style.width = '100%';
    var stat = document.getElementById('loadStatus');
    if (stat) stat.textContent = 'World Ready!';
    var ls = document.getElementById('loadingScreen');
    if (ls) {
      ls.style.opacity = '0';
      setTimeout(function () { if (ls) ls.style.display = 'none'; }, 600);
    }
  }
  // After 3 frames, freeze all materials (shaders compiled by now)
  if (_frameCount === 3) freezeAllMaterials();
});
