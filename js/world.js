'use strict';

var canvas = document.getElementById('gameCanvas');

var GFX_MOBILE = (('ontouchstart' in window) || ((typeof navigator !== 'undefined') && navigator.maxTouchPoints > 0)) ||
  (window.innerWidth <= 1024 && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
var GFX_CFG = (typeof CONFIG !== 'undefined' && CONFIG.GRAPHICS) ? CONFIG.GRAPHICS : {};
var MAX_DPR = GFX_MOBILE ? (GFX_CFG.MAX_DPR_MOBILE || 1.5) : (GFX_CFG.MAX_DPR_DESKTOP || 2);

var engine;
try {
  engine = new BABYLON.Engine(canvas, true, { stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
} catch (e) {
  document.getElementById('startHint').textContent = 'WEBGL IS REQUIRED TO PLAY';
  throw e;
}
try { engine.enableOfflineSupport = false; } catch (e) {}
var BASE_SCALE = 1 / Math.min(window.devicePixelRatio || 1, MAX_DPR);
engine.setHardwareScalingLevel(BASE_SCALE);

var W_CFG = (typeof CONFIG !== 'undefined' && CONFIG.WORLD) ? CONFIG.WORLD : {
  CLEAR_COLOR: [0.03, 0.06, 0.05, 1],
  FOG_COLOR: [0.04, 0.08, 0.06],
  FOG_DENSITY: 0.0038
};

var scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(W_CFG.CLEAR_COLOR[0], W_CFG.CLEAR_COLOR[1], W_CFG.CLEAR_COLOR[2], W_CFG.CLEAR_COLOR[3]);
scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
scene.fogColor = new BABYLON.Color3(W_CFG.FOG_COLOR[0], W_CFG.FOG_COLOR[1], W_CFG.FOG_COLOR[2]);
scene.fogDensity = W_CFG.FOG_DENSITY;
scene.skipPointerMovePicking = true;
scene.constantlyUpdateMeshUnderPointer = false;
scene.autoClear = true;
scene.blockfreeActiveMeshesAndRenderingGroups = false;

var camera = new BABYLON.FreeCamera('cam', new BABYLON.Vector3(0, 40, -90), scene);
camera.minZ = (typeof CONFIG !== 'undefined' && CONFIG.CAMERA && CONFIG.CAMERA.MIN_Z) ? CONFIG.CAMERA.MIN_Z : 0.2;
camera.maxZ = (typeof CONFIG !== 'undefined' && CONFIG.CAMERA && CONFIG.CAMERA.MAX_Z) ? CONFIG.CAMERA.MAX_Z : 1600;
camera.fov = (typeof CONFIG !== 'undefined' && CONFIG.CAMERA && CONFIG.CAMERA.BASE_FOV) ? CONFIG.CAMERA.BASE_FOV : 0.86;
camera.inertia = 0;
camera.angularSensibility = 2000;

// Bright Cartoon Ambient Lighting
var hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0.15, 1, 0.1), scene);
hemi.intensity = 0.65;
hemi.diffuse = new BABYLON.Color3(0.85, 0.82, 0.75);
hemi.groundColor = new BABYLON.Color3(0.45, 0.55, 0.35);
hemi.specular = BABYLON.Color3.Black();

var sunLight = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.75, -0.45, 0.35), scene);
sunLight.intensity = 1.05;
sunLight.diffuse = new BABYLON.Color3(1.0, 0.90, 0.65);
sunLight.specular = new BABYLON.Color3(0.18, 0.22, 0.24);
sunLight.shadowMinZ = 2;
sunLight.shadowMaxZ = 160;
sunLight.autoUpdateExtends = true;

// Glow layer for neon signs, safe rings, lanterns, and muzzle flash
var glowLayer = null;
try {
  var glowRatio = GFX_MOBILE ? 0.18 : (GFX_CFG.GLOW_TEXTURE_RATIO || 0.25);
  glowLayer = new BABYLON.GlowLayer('glow', scene, { mainTextureRatio: glowRatio });
  glowLayer.intensity = GFX_MOBILE ? (GFX_CFG.GLOW_INTENSITY_MOBILE || 0.25) : (GFX_CFG.GLOW_INTENSITY || 0.35);
  // Exclude sky dome, clouds, mountains, and ground to prevent any sky glowing
  glowLayer.customEmissiveColorSelector = function (mesh, subMesh, material, result) {
    if (!mesh || mesh.name === 'skyDome' || (mesh.name && mesh.name.indexOf('cl') === 0) || mesh.name === 'ground' || mesh.name === 'roads') {
      result.set(0, 0, 0, 0);
    } else if (material && material.emissiveColor) {
      result.set(material.emissiveColor.r, material.emissiveColor.g, material.emissiveColor.b, material.alpha !== undefined ? material.alpha : 1);
    } else {
      result.set(0, 0, 0, 0);
    }
  };
} catch (e) { glowLayer = null; }

// Real-time Shadow Generator — PCF on desktop, blur ESM on mobile
var shadowGen = null;
try {
  var shadowSize = GFX_MOBILE ? (GFX_CFG.SHADOW_MAP_SIZE_MOBILE || 512) : (GFX_CFG.SHADOW_MAP_SIZE_DESKTOP || 1024);
  shadowGen = new BABYLON.ShadowGenerator(shadowSize, sunLight);
  if (!GFX_MOBILE && shadowGen.usePercentageCloserFiltering !== undefined) {
    shadowGen.usePercentageCloserFiltering = true;
    if (BABYLON.ShadowGenerator.QUALITY_MEDIUM !== undefined) {
      shadowGen.filteringQuality = BABYLON.ShadowGenerator.QUALITY_MEDIUM;
    }
  } else {
    shadowGen.useBlurExponentialShadowMap = true;
    shadowGen.blurKernel = GFX_MOBILE ? 8 : (GFX_CFG.SHADOW_BLUR_KERNEL || 12);
  }
  shadowGen.bias = 0.0008;
  shadowGen.normalBias = 0.02;
  shadowGen.darkness = 0.28;
  if (shadowGen.getShadowMap()) {
    shadowGen.getShadowMap().refreshRate = GFX_MOBILE ? 2 : 1;
  }
} catch (e) { shadowGen = null; }

// Cartoon post-process: ACES tone map, clean soft vignette, subtle bloom
var gfxPipeline = null;
var UNFROZEN_MATS = [];
function applyImageProcessing(ip, exposure) {
  if (!ip) return;
  ip.contrast = GFX_CFG.CONTRAST || 1.08;
  ip.exposure = (exposure !== undefined) ? exposure : (GFX_CFG.EXPOSURE || 1.04);
  ip.toneMappingEnabled = true;
  if (BABYLON.ImageProcessingConfiguration) {
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES ||
      BABYLON.ImageProcessingConfiguration.TONEMAPPING_STANDARD;
  }
  ip.vignetteEnabled = true;
  ip.vignetteWeight = GFX_CFG.VIGNETTE_WEIGHT || 0.6;
  ip.vignetteStretch = 0.22;
  ip.vignetteColor = new BABYLON.Color4(0.01, 0.02, 0.04, 0);
}
function initGraphicsPipeline() {
  try {
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    applyImageProcessing(scene.imageProcessingConfiguration, GFX_CFG.EXPOSURE || 1.04);
  } catch (e) {}
  if (typeof BABYLON.DefaultRenderingPipeline !== 'function') return;
  try {
    var useHdr = !GFX_MOBILE && engine.webGLVersion >= 2;
    gfxPipeline = new BABYLON.DefaultRenderingPipeline('gfx', useHdr, scene, [camera]);
    gfxPipeline.fxaaEnabled = true;
    gfxPipeline.samples = 1;
    gfxPipeline.imageProcessingEnabled = true;
    applyImageProcessing(gfxPipeline.imageProcessing, GFX_CFG.EXPOSURE || 1.04);
    gfxPipeline.bloomEnabled = !GFX_MOBILE;
    gfxPipeline.bloomScale = 0.5;
    gfxPipeline.bloomKernel = 32;
    gfxPipeline.bloomWeight = GFX_CFG.BLOOM_WEIGHT || 0.08;
    gfxPipeline.bloomThreshold = 0.92;
    gfxPipeline.sharpenEnabled = false;
    gfxPipeline.grainEnabled = false;
    gfxPipeline.chromaticAberrationEnabled = false;
  } catch (e) {
    gfxPipeline = null;
    try {
      new BABYLON.FxaaPostProcess('fxaa', 1.0, camera);
    } catch (e2) {}
  }
}
initGraphicsPipeline();

function applyExposure(value) {
  try {
    if (gfxPipeline && gfxPipeline.imageProcessing) {
      gfxPipeline.imageProcessing.exposure = value;
    } else if (scene.imageProcessingConfiguration) {
      scene.imageProcessingConfiguration.exposure = value;
    }
  } catch (e) {}
}

function castShadow(node) {
  if (!shadowGen || !node) return;
  try {
    if (node.getChildMeshes) {
      var children = node.getChildMeshes();
      for (var i = 0; i < children.length; i++) {
        if (children[i].getTotalVertices && children[i].getTotalVertices() > 0) {
          shadowGen.addShadowCaster(children[i], false);
        }
      }
    } else if (node.getTotalVertices && node.getTotalVertices() > 0) {
      shadowGen.addShadowCaster(node, false);
    }
  } catch (e) {}
}

function removeShadow(node) {
  if (!shadowGen || !node) return;
  try {
    if (node.getChildMeshes) {
      var children = node.getChildMeshes();
      for (var i = 0; i < children.length; i++) {
        shadowGen.removeShadowCaster(children[i]);
      }
    } else {
      shadowGen.removeShadowCaster(node);
    }
  } catch (e) {}
}

function V(x, y, z) { return new BABYLON.Vector3(x, y, z); }

var DAY_NIGHT_SYSTEM = (function () {
  function getCfg() {
    var c = (typeof CONFIG !== 'undefined') ? CONFIG : (typeof window !== 'undefined' ? window.CONFIG : null);
    return (c && c.DAY_NIGHT) ? c.DAY_NIGHT : null;
  }

  var cfgInit = getCfg();
  var currentHour = (cfgInit && cfgInit.INITIAL_HOUR !== undefined) ? cfgInit.INITIAL_HOUR : 7.0;
  var currentPhaseName = 'morning';
  var cycleDuration = (cfgInit && cfgInit.CYCLE_DURATION_MINUTES) ? cfgInit.CYCLE_DURATION_MINUTES * 60 : 600;

  var curClear = new BABYLON.Color4(0.62, 0.48, 0.42, 1);
  var targetClear = new BABYLON.Color4(0.62, 0.48, 0.42, 1);
  var curFog = new BABYLON.Color3(0.68, 0.58, 0.52);
  var targetFog = new BABYLON.Color3(0.68, 0.58, 0.52);
  var curSunDir = new BABYLON.Vector3(-0.75, -0.45, 0.35);
  var targetSunDir = new BABYLON.Vector3(-0.75, -0.45, 0.35);
  var curSunCol = new BABYLON.Color3(1.0, 0.82, 0.60);
  var targetSunCol = new BABYLON.Color3(1.0, 0.82, 0.60);
  var curSunInt = 0.88, targetSunInt = 0.88;
  var curHemiCol = new BABYLON.Color3(0.65, 0.62, 0.58);
  var targetHemiCol = new BABYLON.Color3(0.65, 0.62, 0.58);
  var curHemiInt = 0.55, targetHemiInt = 0.55;
  var curFogDens = 0.0022, targetFogDens = 0.0022;
  var curLanternInt = 0.25, targetLanternInt = 0.25;
  var curExposure = 1.06, targetExposure = 1.06;

  var PHASES = ['morning', 'noon', 'dusk', 'night'];

  function determinePhase(hour) {
    if (hour >= 5.5 && hour < 10.0) return 'morning';
    if (hour >= 10.0 && hour < 17.5) return 'noon';
    if (hour >= 17.5 && hour < 21.0) return 'dusk';
    return 'night';
  }

  function applyProfile(pName, instant) {
    currentPhaseName = pName;
    var cfg = getCfg();
    if (!cfg || !cfg.PROFILES || !cfg.PROFILES[pName]) return;
    var p = cfg.PROFILES[pName];

    targetClear.set(p.clearColor[0], p.clearColor[1], p.clearColor[2], p.clearColor[3] || 1);
    targetFog.set(p.fogColor[0], p.fogColor[1], p.fogColor[2]);
    targetFogDens = p.fogDensity;
    targetSunDir.set(p.sunDir[0], p.sunDir[1], p.sunDir[2]);
    targetSunCol.set(p.sunColor[0], p.sunColor[1], p.sunColor[2]);
    targetSunInt = p.sunIntensity;
    targetHemiCol.set(p.hemiDiffuse[0], p.hemiDiffuse[1], p.hemiDiffuse[2]);
    targetHemiInt = p.hemiIntensity;
    targetLanternInt = p.lanternIntensity;
    targetExposure = (p.exposure !== undefined) ? p.exposure : 1.06;

    if (instant) {
      curClear.copyFrom(targetClear);
      curFog.copyFrom(targetFog);
      curFogDens = targetFogDens;
      curSunDir.copyFrom(targetSunDir);
      curSunCol.copyFrom(targetSunCol);
      curSunInt = targetSunInt;
      curHemiCol.copyFrom(targetHemiCol);
      curHemiInt = targetHemiInt;
      curLanternInt = targetLanternInt;
      curExposure = targetExposure;

      scene.clearColor.copyFrom(curClear);
      scene.fogColor.copyFrom(curFog);
      scene.fogDensity = curFogDens;
      sunLight.direction.copyFrom(curSunDir);
      sunLight.diffuse.copyFrom(curSunCol);
      sunLight.intensity = curSunInt;
      hemi.diffuse.copyFrom(curHemiCol);
      hemi.intensity = curHemiInt;
      if (typeof skyMat !== 'undefined' && skyMat) {
        skyMat.emissiveColor.set(curClear.r, curClear.g, curClear.b);
      }
      applyExposure(curExposure);
    }
  }

  function update(dt) {
    var cfg = getCfg();
    if (!cfg || !cfg.ENABLED) return;
    var hoursPerSec = 24 / cycleDuration;
    currentHour = (currentHour + dt * hoursPerSec) % 24;

    var newPhase = determinePhase(currentHour);
    if (newPhase !== currentPhaseName) {
      applyProfile(newPhase, false);
    }

    var k = Math.min(dt * 1.8, 1);
    BABYLON.Color4.LerpToRef(scene.clearColor, targetClear, k, scene.clearColor);
    BABYLON.Color3.LerpToRef(scene.fogColor, targetFog, k, scene.fogColor);
    scene.fogDensity += (targetFogDens - scene.fogDensity) * k;

    BABYLON.Vector3.LerpToRef(sunLight.direction, targetSunDir, k, sunLight.direction);
    sunLight.direction.normalize();
    BABYLON.Color3.LerpToRef(sunLight.diffuse, targetSunCol, k, sunLight.diffuse);
    sunLight.intensity += (targetSunInt - sunLight.intensity) * k;

    BABYLON.Color3.LerpToRef(hemi.diffuse, targetHemiCol, k, hemi.diffuse);
    hemi.intensity += (targetHemiInt - hemi.intensity) * k;

    curLanternInt += (targetLanternInt - curLanternInt) * k;
    curExposure += (targetExposure - curExposure) * k;
    if (typeof skyMat !== 'undefined' && skyMat) {
      skyMat.emissiveColor.set(scene.clearColor.r, scene.clearColor.g, scene.clearColor.b);
    }
    applyExposure(curExposure);
  }

  function setTimePhase(phaseName) {
    var targets = {
      morning: 7.0,
      noon: 12.0,
      dusk: 18.5,
      night: 23.0
    };
    if (targets[phaseName] !== undefined) {
      currentHour = targets[phaseName];
      applyProfile(phaseName, true);
    }
  }

  function cycleNextPhase() {
    var idx = PHASES.indexOf(currentPhaseName);
    var next = PHASES[(idx + 1) % PHASES.length];
    setTimePhase(next);
    return next;
  }

  function getTimeData() {
    var h = Math.floor(currentHour);
    var m = Math.floor((currentHour - h) * 60);
    var hStr = (h < 10 ? '0' : '') + h;
    var mStr = (m < 10 ? '0' : '') + m;
    var cfg = getCfg();
    var p = (cfg && cfg.PROFILES && cfg.PROFILES[currentPhaseName]) ? cfg.PROFILES[currentPhaseName] : { icon: '🌅', label: 'MORNING' };
    return {
      hour: currentHour,
      timeString: hStr + ':' + mStr,
      phase: currentPhaseName,
      label: p.label,
      icon: p.icon,
      formatted: p.icon + ' ' + hStr + ':' + mStr + ' ' + p.label
    };
  }

  // Initial setup
  applyProfile(determinePhase(currentHour), true);

  return {
    update: update,
    setTimePhase: setTimePhase,
    cycleNextPhase: cycleNextPhase,
    getTimeData: getTimeData,
    getHour: function () { return currentHour; },
    getPhase: function () { return currentPhaseName; },
    getLanternIntensity: function () { return curLanternInt; }
  };
})();

if (typeof window !== 'undefined') window.DAY_NIGHT_SYSTEM = DAY_NIGHT_SYSTEM;
if (typeof global !== 'undefined') global.DAY_NIGHT_SYSTEM = DAY_NIGHT_SYSTEM;

var seed = 20260825;
function srnd() {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function sr(a, b) { return a + srnd() * (b - a); }
function rand(a, b) { return a + Math.random() * (b - a); }

var MATS = {};
var ALL_MATS = [];
function mat(hex, o) {
  o = o || {};
  var key = hex + (o.e || '') + (o.a !== undefined ? o.a : '');
  if (MATS[key]) return MATS[key];
  var m = new BABYLON.StandardMaterial('m' + key, scene);
  m.diffuseColor = BABYLON.Color3.FromHexString(hex);
  m.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
  m.specularPower = 48;
  m.maxSimultaneousLights = GFX_MOBILE ? 4 : 6;
  if (o.e) m.emissiveColor = BABYLON.Color3.FromHexString(o.e);
  if (o.a !== undefined) m.alpha = o.a;
  ALL_MATS.push(m);
  MATS[key] = m;
  return m;
}
var vcMat = new BABYLON.StandardMaterial('vc', scene);
vcMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
vcMat.specularColor = new BABYLON.Color3(0.11, 0.11, 0.11);
vcMat.specularPower = 40;
vcMat.useVertexColors = true;
vcMat.maxSimultaneousLights = GFX_MOBILE ? 4 : 6;
ALL_MATS.push(vcMat);

function paint(mesh, hex) {
  var n = mesh.getTotalVertices();
  if (!n) return mesh;
  var c = BABYLON.Color3.FromHexString(hex);
  var arr = new Float32Array(n * 4);
  for (var i = 0; i < n; i++) {
    var h = Math.sin(i * 12.9898 + n * 0.17) * 43758.5453;
    h = h - Math.floor(h);
    var v = 0.9 + h * 0.2;
    arr[i * 4] = Math.min(1, c.r * v);
    arr[i * 4 + 1] = Math.min(1, c.g * v);
    arr[i * 4 + 2] = Math.min(1, c.b * v);
    arr[i * 4 + 3] = 1;
  }
  mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind, arr);
  return mesh;
}
function mergePainted(list) {
  if (!list || !list.length) return null;
  var m = BABYLON.Mesh.MergeMeshes(list, true, true, null, false, false);
  if (!m) return null;
  m.material = vcMat;
  m.receiveShadows = true;
  m.freezeWorldMatrix();
  return m;
}
function box(w, h, d, x, y, z, hex, parent, ry) {
  var b = BABYLON.MeshBuilder.CreateBox('', { width: w, height: h, depth: d }, scene);
  b.position.set(x, y, z);
  if (ry) b.rotation.y = ry;
  paint(b, hex);
  if (parent) b.parent = parent;
  return b;
}
function cyl(dBot, dTop, h, x, y, z, hex, parent, tess) {
  var c = BABYLON.MeshBuilder.CreateCylinder('', { diameterTop: dTop, diameterBottom: dBot, height: h, tessellation: tess || 14 }, scene);
  c.position.set(x, y, z);
  paint(c, hex);
  if (parent) c.parent = parent;
  return c;
}
function sph(d, x, y, z, hex, parent, seg) {
  var s = BABYLON.MeshBuilder.CreateSphere('', { diameter: d, segments: seg || 10 }, scene);
  s.position.set(x, y, z);
  paint(s, hex);
  if (parent) s.parent = parent;
  return s;
}
function discR(rad, x, z, y, hex, tess) {
  var d = BABYLON.MeshBuilder.CreateDisc('', { radius: rad, tessellation: tess || 16 }, scene);
  d.rotation.x = Math.PI / 2;
  d.position.set(x, y, z);
  paint(d, hex);
  return d;
}
function absPos(node) {
  node.computeWorldMatrix();
  return BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.Zero(), node.getWorldMatrix());
}

var COL = { rects: [], circles: [], safe: [] };
var PLATFORMS = [];
var WALLS3D = [];
var LADDERS = [];
var DOORS = [];
var LOOT_ITEMS = [];
var OCCLUDERS = [];
var SHADOWS = [];
var lanternLights = [];
var BOUND = 292;
var SAFE_R = 11;

function addPlatform(x1, x2, z1, z2, topY, type, name) {
  var minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  var minZ = Math.min(z1, z2), maxZ = Math.max(z1, z2);
  PLATFORMS.push({ x1: minX, x2: maxX, z1: minZ, z2: maxZ, topY: topY, type: type || 'ground', name: name || '' });
}

function addWall3D(cx, cz, w, d, y1, y2, pad) {
  pad = pad || 0;
  var minX = cx - w / 2 - pad, maxX = cx + w / 2 + pad;
  var minZ = cz - d / 2 - pad, maxZ = cz + d / 2 + pad;
  WALLS3D.push({ x1: minX, x2: maxX, z1: minZ, z2: maxZ, y1: y1, y2: y2 });
}

function addRotatedWall3D(cx, cz, w, d, y1, y2, ry, pad) {
  pad = pad || 0;
  var cw = Math.abs(Math.cos(ry)) * w + Math.abs(Math.sin(ry)) * d;
  var cd = Math.abs(Math.cos(ry)) * d + Math.abs(Math.sin(ry)) * w;
  WALLS3D.push({ x1: cx - cw / 2 - pad, x2: cx + cw / 2 + pad, z1: cz - cd / 2 - pad, z2: cz + cd / 2 + pad, y1: y1, y2: y2 });
}

function addInteractiveDoor(cx, cz, y, w, h, ry, isSafeHouse) {
  var hingeNode = new BABYLON.TransformNode('doorHinge', scene);
  var hingePos = rotPoint(-w / 2, 0, ry, cx, cz);
  hingeNode.position.set(hingePos[0], y, hingePos[1]);
  hingeNode.rotation.y = ry;
  
  // Door panel pivots on hinge:
  var panel = box(w, h, 0.16, w / 2, h / 2, 0, '#543d2b', hingeNode);
  var knob1 = cyl(0.08, 0.08, 0.22, w - 0.25, h / 2, 0.1, '#d4af37', hingeNode, 8);
  knob1.rotation.x = Math.PI / 2;
  var knob2 = cyl(0.08, 0.08, 0.22, w - 0.25, h / 2, -0.1, '#d4af37', hingeNode, 8);
  knob2.rotation.x = Math.PI / 2;
  
  var cw = Math.abs(Math.cos(ry)) * w + Math.abs(Math.sin(ry)) * 0.45;
  var cd = Math.abs(Math.cos(ry)) * 0.45 + Math.abs(Math.sin(ry)) * w;
  
  var door = {
    x: cx, z: cz, y: y, w: w, h: h, ry: ry,
    open: false,
    hinge: hingeNode,
    panel: panel,
    isSafeHouse: !!isSafeHouse,
    collider: { x1: cx - cw / 2 - 0.1, x2: cx + cw / 2 + 0.1, z1: cz - cd / 2 - 0.1, z2: cz + cd / 2 + 0.1, y1: y, y2: y + h }
  };
  DOORS.push(door);
  return door;
}

function getNearbyDoor(px, py, pz, maxDist) {
  maxDist = maxDist || 2.8;
  for (var i = 0; i < DOORS.length; i++) {
    var d = DOORS[i];
    var dx = px - d.x, dz = pz - d.z;
    if (dx * dx + dz * dz <= maxDist * maxDist && Math.abs(py - d.y) < d.h + 0.8) {
      return d;
    }
  }
  return null;
}

function toggleDoor(door) {
  if (!door) return;
  door.open = !door.open;
  if (door.open) {
    door.hinge.rotation.y = door.ry + Math.PI / 2;
    sfxDoorOpen();
  } else {
    door.hinge.rotation.y = door.ry;
    sfxDoorClose();
  }
}

function addLoot(type, x, y, z) {
  var node = new BABYLON.TransformNode('loot', scene);
  node.position.set(x, y, z);
  if (type === 'medkit') {
    box(0.52, 0.24, 0.36, 0, 0.12, 0, '#ffffff', node);
    box(0.32, 0.25, 0.1, 0, 0.125, 0, '#d93b3b', node);
    box(0.1, 0.25, 0.32, 0, 0.125, 0, '#d93b3b', node);
  } else if (type === 'ammo') {
    box(0.55, 0.35, 0.42, 0, 0.175, 0, '#3d4d35', node);
    box(0.56, 0.08, 0.43, 0, 0.36, 0, '#2c3826', node);
    box(0.14, 0.14, 0.04, 0, 0.2, 0.22, '#ffd34e', node);
  }
  LOOT_ITEMS.push({ type: type, x: x, y: y, z: z, node: node, baseY: y, taken: false, respawnT: 0 });
}

function updateLoot(dt) {
  for (var i = 0; i < LOOT_ITEMS.length; i++) {
    var item = LOOT_ITEMS[i];
    if (item.taken) {
      item.respawnT -= dt;
      if (item.respawnT <= 0) {
        item.taken = false;
        item.node.setEnabled(true);
      }
      continue;
    }
    item.node.rotation.y += dt * 1.6;
    item.node.position.y = item.baseY + Math.sin(tNow * 3.0 + i) * 0.08;
  }
}

function addLadder(x, z, r, yMin, yMax, facingYaw, topY) {
  LADDERS.push({ x: x, z: z, r: r || 0.95, yMin: yMin, yMax: yMax, facingYaw: facingYaw || 0, topY: topY !== undefined ? topY : yMax });
}

function getGroundHeight(px, pz, curY, playerR) {
  playerR = playerR || 0.35;
  var bestY = 0;
  for (var i = 0; i < PLATFORMS.length; i++) {
    var p = PLATFORMS[i];
    if (px >= p.x1 - playerR && px <= p.x2 + playerR && pz >= p.z1 - playerR && pz <= p.z2 + playerR) {
      if (p.topY <= curY + 0.55) {
        if (p.topY > bestY) bestY = p.topY;
      }
    }
  }
  return bestY;
}

function resolve3DCollisions(px, py, pz, r, height, isZombie) {
  var x = px, z = pz;
  var yMin = py, yMax = py + height;
  
  // Check static 3D walls
  for (var i = 0; i < WALLS3D.length; i++) {
    var w = WALLS3D[i];
    if (yMax <= w.y1 + 0.05 || yMin >= w.y2 - 0.05) continue;
    var cx = Math.max(w.x1, Math.min(x, w.x2));
    var cz = Math.max(w.z1, Math.min(z, w.z2));
    var dx = x - cx, dz = z - cz;
    var d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) {
        var d = Math.sqrt(d2);
        x = cx + dx / d * r;
        z = cz + dz / d * r;
      } else {
        var l = x - w.x1, ri = w.x2 - x, tt = z - w.z1, bb = w.z2 - z;
        var mn = Math.min(l, ri, tt, bb);
        if (mn === l) x = w.x1 - r;
        else if (mn === ri) x = w.x2 + r;
        else if (mn === tt) z = w.z1 - r;
        else z = w.z2 + r;
      }
    }
  }

  // Check closed doors (Zombies NEVER pass closed doors; Players can pass when open)
  for (var di = 0; di < DOORS.length; di++) {
    var dr = DOORS[di];
    if (dr.open) continue; // Door is open, pass freely
    var dw = dr.collider;
    if (yMax <= dw.y1 + 0.05 || yMin >= dw.y2 - 0.05) continue;
    var dcx = Math.max(dw.x1, Math.min(x, dw.x2));
    var dcz = Math.max(dw.z1, Math.min(z, dw.z2));
    var ddx = x - dcx, ddz = z - dcz;
    var dd2 = ddx * ddx + ddz * ddz;
    if (dd2 < r * r) {
      if (dd2 > 1e-6) {
        var dd = Math.sqrt(dd2);
        x = dcx + ddx / dd * r;
        z = dcz + ddz / dd * r;
      } else {
        var dl = x - dw.x1, dri = dw.x2 - x, dtt = z - dw.z1, dbb = dw.z2 - z;
        var dmn = Math.min(dl, dri, dtt, dbb);
        if (dmn === dl) x = dw.x1 - r;
        else if (dmn === dri) x = dw.x2 + r;
        else if (dmn === dtt) z = dw.z1 - r;
        else z = dw.z2 + r;
      }
    }
  }

  if (py < 4.0) {
    for (var j = 0; j < COL.circles.length; j++) {
      var c = COL.circles[j];
      var cdx = x - c.x, cdz = z - c.z;
      var rr = c.r + r;
      var cd2 = cdx * cdx + cdz * cdz;
      if (cd2 < rr * rr) {
        if (cd2 < 1e-6) { cdx = 1; cdz = 0; cd2 = 1; }
        var cd = Math.sqrt(cd2);
        x = c.x + (cdx / cd) * rr;
        z = c.z + (cdz / cd) * rr;
      }
    }
  }
  return [x, z];
}

function getLadderAt(px, py, pz, r) {
  r = r || 0.95;
  for (var i = 0; i < LADDERS.length; i++) {
    var l = LADDERS[i];
    var dx = px - l.x, dz = pz - l.z;
    if (dx * dx + dz * dz <= (l.r + r) * (l.r + r)) {
      if (py >= l.yMin - 0.6 && py <= l.yMax + 0.6) {
        return l;
      }
    }
  }
  return null;
}

function addCircle(x, z, r) { COL.circles.push({ x: x, z: z, r: r }); }

function inSafePoint(x, z, pad) {
  pad = pad || 0;
  for (var i = 0; i < COL.safe.length; i++) {
    var s = COL.safe[i];
    var dx = x - s.x, dz = z - s.z;
    if (dx * dx + dz * dz < (s.r + pad) * (s.r + pad)) return true;
  }
  return false;
}
function resolveCircles(px, pz, r) {
  var x = px, z = pz;
  for (var i = 0; i < COL.circles.length; i++) {
    var c = COL.circles[i];
    var dx = x - c.x, dz = z - c.z;
    var rr = c.r + r;
    var d2 = dx * dx + dz * dz;
    if (d2 < rr * rr) {
      if (d2 < 1e-6) { dx = 1; dz = 0; d2 = 1; }
      var d = Math.sqrt(d2);
      x = c.x + (dx / d) * rr;
      z = c.z + (dz / d) * rr;
    }
  }
  return [x, z];
}
function resolveRects(px, pz, r) {
  return resolve3DCollisions(px, 0, pz, r, 1.85);
}
function clampSafeOut(px, pz, r) {
  var x = px, z = pz, pushed = false;
  for (var i = 0; i < COL.safe.length; i++) {
    var s = COL.safe[i];
    var dx = x - s.x, dz = z - s.z;
    var rr = s.r + r;
    var d2 = dx * dx + dz * dz;
    if (d2 < rr * rr) {
      if (d2 < 1e-6) { dx = 1; dz = 0; d2 = 1; }
      var d = Math.sqrt(d2);
      x = s.x + (dx / d) * rr;
      z = s.z + (dz / d) * rr;
      pushed = true;
    }
  }
  return [x, z, pushed];
}
function pointFree(x, z, pad) {
  if (inSafePoint(x, z, 0)) return false;
  for (var i = 0; i < WALLS3D.length; i++) {
    var w = WALLS3D[i];
    if (x > w.x1 - pad && x < w.x2 + pad && z > w.z1 - pad && z < w.z2 + pad) return false;
  }
  for (var j = 0; j < COL.circles.length; j++) {
    var c = COL.circles[j];
    var dx = x - c.x, dz = z - c.z;
    var rr = c.r + pad;
    if (dx * dx + dz * dz < rr * rr) return false;
  }
  return true;
}
function lerpAng(a, b, t) {
  var d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}
function smooth(k, dt) { return 1 - Math.exp(-k * dt); }
function rotPoint(lx, lz, ry, cx, cz) {
  var cos = Math.cos(ry), sin = Math.sin(ry);
  return [cx + (lx * cos + lz * sin), cz + (-lx * sin + lz * cos)];
}

var shadowMaster = BABYLON.MeshBuilder.CreateDisc('shadowM', { radius: 1, tessellation: 20 }, scene);
shadowMaster.rotation.x = Math.PI / 2;
shadowMaster.material = mat('#10240f', { a: 0.38 });
shadowMaster.isVisible = false;
function makeShadow(r, follow) {
  var s = shadowMaster.createInstance('sh');
  s.scaling.set(r, r, 1);
  s.position.y = 0.03;
  SHADOWS.push({ m: s, f: follow });
  return s;
}

var audioReady = false, AC = null, masterG = null, noiseBuf = null;
function initAudio() {
  if (audioReady) return;
  audioReady = true;
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    AC = new Ctx();
    masterG = AC.createGain();
    masterG.gain.value = 0.5;
    masterG.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    var wind = AC.createBufferSource();
    wind.buffer = noiseBuf; wind.loop = true;
    var bp = AC.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 300; bp.Q.value = 0.5;
    var wg = AC.createGain(); wg.gain.value = 0.013;
    wind.connect(bp); bp.connect(wg); wg.connect(masterG);
    wind.start();
  } catch (e) { AC = null; }
}
function noiseHit(f, dur, vol, type) {
  if (!AC) return;
  var t = AC.currentTime;
  var src = AC.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = rand(0.85, 1.15);
  var fl = AC.createBiquadFilter();
  fl.type = type || 'lowpass'; fl.frequency.value = f;
  var g = AC.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(fl); fl.connect(g); g.connect(masterG);
  src.start(t); src.stop(t + dur + 0.02);
}
function tone(type, f0, f1, dur, vol, delay) {
  if (!AC) return;
  var t = AC.currentTime + (delay || 0);
  var o = AC.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  var g = AC.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(masterG);
  o.start(t); o.stop(t + dur + 0.02);
}
function sfxShot(kind) {
  if (kind === 'rifle') {
    noiseHit(2300, 0.09, 0.5); tone('square', 150, 55, 0.09, 0.22);
  } else if (kind === 'shotgun') {
    noiseHit(3600, 0.22, 0.9); tone('sine', 110, 30, 0.28, 0.85); tone('square', 190, 45, 0.16, 0.45);
  } else {
    noiseHit(2900, 0.13, 0.6); tone('square', 175, 50, 0.12, 0.3);
  }
}
function sfxPump() {
  tone('square', 600, 350, 0.05, 0.18); noiseHit(1800, 0.04, 0.15);
  setTimeout(function () {
    tone('square', 420, 780, 0.06, 0.2); noiseHit(2200, 0.05, 0.18);
  }, 220);
}
function sfxPop() { tone('sine', 270, 65, 0.2, 0.55); noiseHit(750, 0.16, 0.4); tone('square', 900, 200, 0.06, 0.12); }
function sfxTick() { tone('square', 1400, 1100, 0.035, 0.1); }
function sfxGrowl(vol) {
  if (!AC) return;
  var t = AC.currentTime;
  var o = AC.createOscillator();
  o.type = 'sawtooth';
  var f = rand(55, 95);
  o.frequency.setValueAtTime(f, t);
  o.frequency.linearRampToValueAtTime(f * rand(0.7, 0.9), t + 0.8);
  var lfo = AC.createOscillator();
  lfo.frequency.value = rand(4, 7);
  var lg = AC.createGain(); lg.gain.value = 18;
  lfo.connect(lg); lg.connect(o.detune);
  var fl = AC.createBiquadFilter();
  fl.type = 'lowpass'; fl.frequency.value = 280;
  var g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol * 0.5, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
  o.connect(fl); fl.connect(g); g.connect(masterG);
  o.start(t); lfo.start(t);
  o.stop(t + 0.9); lfo.stop(t + 0.9);
}
function sfxHurt() { tone('triangle', 120, 55, 0.25, 0.45); noiseHit(500, 0.12, 0.3); }
function sfxStep() { noiseHit(rand(380, 520), 0.05, 0.05); }
function sfxLadderStep() { tone('square', 460, 260, 0.04, 0.07); noiseHit(550, 0.03, 0.04); }
function sfxLand() { noiseHit(180, 0.16, 0.42); tone('triangle', 95, 45, 0.16, 0.32); }
function sfxShell() { tone('sine', 1600, 1950, 0.03, 0.04); }
function sfxSwap() { tone('square', 300, 430, 0.07, 0.12); }
function sfxDoorOpen() { tone('triangle', 180, 260, 0.18, 0.28); noiseHit(300, 0.08, 0.15); }
function sfxDoorClose() { noiseHit(220, 0.14, 0.48); tone('triangle', 150, 65, 0.14, 0.35); }
function sfxDoorBang() { noiseHit(280, 0.16, 0.55); tone('square', 140, 60, 0.12, 0.4); }
function sfxPickup() {
  tone('sine', 520, 880, 0.1, 0.35);
  setTimeout(function () { tone('sine', 880, 1320, 0.14, 0.4); }, 75);
}
function sfxHeartbeat() {
  if (!AC) return;
  tone('sine', 70, 36, 0.14, 0.7);
  setTimeout(function () {
    if (AC) tone('sine', 58, 30, 0.18, 0.6);
  }, 140);
}
function sfxZombieScreech() {
  if (!AC) return;
  var t = AC.currentTime;
  var o = AC.createOscillator();
  o.type = 'sawtooth';
  var f = rand(700, 950);
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.42, t + 0.55);
  var fl = AC.createBiquadFilter();
  fl.type = 'bandpass'; fl.frequency.value = 1500; fl.Q.value = 2.5;
  var g = AC.createGain();
  g.gain.setValueAtTime(0.01, t);
  g.gain.linearRampToValueAtTime(0.48, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.58);
  o.connect(fl); fl.connect(g); g.connect(masterG);
  o.start(t); o.stop(t + 0.6);
  noiseHit(2000, 0.3, 0.3, 'highpass');
}
function sfxBoneSnap() {
  noiseHit(1200, 0.08, 0.55);
  tone('square', 320, 80, 0.09, 0.4);
}
function sfxFlashlightClick() {
  tone('square', 1800, 2400, 0.02, 0.15);
  noiseHit(3200, 0.015, 0.1);
}

var POOLS = {
  blood: { items: [], grav: 15 },
  goo: { items: [], grav: 11 },
  dust: { items: [], grav: 2 },
  spark: { items: [], grav: 8 },
  wood: { items: [], grav: 10 },
  concrete: { items: [], grav: 12 },
  shell: { items: [], grav: 18 },
  shellRed: { items: [], grav: 18 },
  bone: { items: [], grav: 14 },
  meat: { items: [], grav: 16 }
};
(function () {
  var defs = [
    ['blood', '#22c55e'],
    ['goo', '#4ade80'],
    ['dust', '#fde047'],
    ['spark', '#facc15'],
    ['wood', '#ea580c'],
    ['concrete', '#94a3b8'],
    ['shell', '#facc15'],
    ['shellRed', '#ef4444'],
    ['bone', '#ffffff'],
    ['meat', '#a855f7']
  ];
  var counts = { blood: 28, goo: 18, dust: 18, spark: 14, wood: 12, concrete: 12, shell: 12, shellRed: 10, bone: 16, meat: 16 };
  defs.forEach(function (def) {
    var isSh = def[0] === 'shell' || def[0] === 'shellRed';
    var master = BABYLON.MeshBuilder.CreateBox('p_' + def[0], { size: isSh ? 0.09 : 0.15 }, scene);
    master.material = mat(def[1], { e: (def[0] === 'spark' || def[0] === 'shell') ? '#8a6d1f' : undefined });
    master.isVisible = false;
    for (var i = 0; i < counts[def[0]]; i++) {
      var inst = master.createInstance('pi_' + def[0]);
      inst.setEnabled(false);
      POOLS[def[0]].items.push({ m: inst, vx: 0, vy: 0, vz: 0, life: 0, size: 1 });
    }
  });
})();

function burst(pos, type, n, spd, upBias, life, smin, smax) {
  var pool = POOLS[type];
  if (!pool) return;
  var made = 0;
  for (var i = 0; i < pool.items.length && made < n; i++) {
    var p = pool.items[i];
    if (p.life > 0) continue;
    p.life = life * rand(0.6, 1.1);
    p.size = rand(smin, smax);
    p.m.position.copyFrom(pos);
    p.m.position.x += rand(-0.2, 0.2);
    p.m.position.y += rand(-0.1, 0.1);
    p.m.position.z += rand(-0.2, 0.2);
    var a = rand(0, Math.PI * 2);
    var r = rand(0.2, 1) * spd;
    p.vx = Math.cos(a) * r;
    p.vz = Math.sin(a) * r;
    p.vy = rand(0.4, 1) * spd * upBias;
    p.m.scaling.setAll(p.size);
    p.m.setEnabled(true);
    made++;
  }
}

function spawnShell(pos, dir) {
  var pool = POOLS.shell;
  for (var i = 0; i < pool.items.length; i++) {
    var p = pool.items[i];
    if (p.life > 0) continue;
    p.life = 0.9;
    p.size = 1;
    p.m.position.copyFrom(pos);
    p.vx = dir.x * rand(1.5, 2.5) + rand(-0.3, 0.3);
    p.vy = rand(1.8, 3.2);
    p.vz = dir.z * rand(1.5, 2.5) + rand(-0.3, 0.3);
    p.m.scaling.set(0.6, 1.2, 0.6);
    p.m.setEnabled(true);
    setTimeout(sfxShell, rand(120, 240));
    break;
  }
}

function spawnShellRed(pos, dir) {
  var pool = POOLS.shellRed;
  for (var i = 0; i < pool.items.length; i++) {
    var p = pool.items[i];
    if (p.life > 0) continue;
    p.life = 1.1;
    p.size = 1;
    p.m.position.copyFrom(pos);
    p.vx = dir.x * rand(1.6, 2.8) + rand(-0.35, 0.35);
    p.vy = rand(2.0, 3.6);
    p.vz = dir.z * rand(1.6, 2.8) + rand(-0.35, 0.35);
    p.m.scaling.set(0.8, 1.4, 0.8);
    p.m.setEnabled(true);
    setTimeout(sfxShell, rand(130, 260));
    break;
  }
}

function updParticles(dt) {
  for (var key in POOLS) {
    var pool = POOLS[key];
    for (var i = 0; i < pool.items.length; i++) {
      var p = pool.items[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.m.setEnabled(false); continue; }
      p.vy -= pool.grav * dt;
      p.m.position.x += p.vx * dt;
      p.m.position.y += p.vy * dt;
      p.m.position.z += p.vz * dt;
      var groundLvl = 0;
      if (!GFX_MOBILE || (i & 1) === 0) {
        groundLvl = getGroundHeight(p.m.position.x, p.m.position.z, p.m.position.y + 0.1);
      }
      if (p.m.position.y < groundLvl + 0.05) {
        p.m.position.y = groundLvl + 0.05;
        p.vy *= -0.3;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }
      var s = p.size * Math.min(1, p.life * 2.5);
      p.m.scaling.setAll(Math.max(s, 0.01));
    }
  }
}

var ROADS = [-150, -50, 50, 150];
var ROAD_W = 12;

function nearRoad(x, z) {
  for (var ii = 0; ii < ROADS.length; ii++) {
    if (Math.abs(x - ROADS[ii]) < ROAD_W / 2 + 1) return true;
    if (Math.abs(z - ROADS[ii]) < ROAD_W / 2 + 1) return true;
  }
  return false;
}

var WALL_PAL = ['#fed7aa', '#bae6fd', '#bbf7d0', '#fecdd3', '#fef08a', '#e9d5ff', '#ddd6fe', '#fbcfe8'];
var ROOF_PAL = ['#ea580c', '#2563eb', '#dc2626', '#059669', '#d97706', '#8b5cf6'];
var HOUSE_WALLS = ['#fed7aa', '#bae6fd', '#bbf7d0', '#fecdd3', '#fef08a', '#e9d5ff', '#ddd6fe', '#fbcfe8'];
var HOUSE_ROOFS = ['#f97316', '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];
var CAR_COLORS = ['#ef4444', '#3b82f6', '#eab308', '#10b981', '#a855f7', '#f97316', '#06b6d4'];
var LEAF_GREENS = ['#4ade80', '#22c55e', '#86efac', '#16a34a', '#a3e635'];

var waterMats = [];
var ringMats = [];
var emblems = [];
var clouds = [];

function makeProcTexture(size, fn) {
  try {
    var dt = new BABYLON.DynamicTexture('pt' + size + Math.random(), { width: size, height: size }, scene, false);
    var ctx = dt.getContext();
    if (!ctx || !ctx.createImageData) return null;
    var img = ctx.createImageData(size, size);
    var d = img.data;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var col = fn(x, y, size);
        var i = (y * size + x) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    dt.update(false);
    dt.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
    dt.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    dt.anisotropicFilteringLevel = GFX_MOBILE ? 2 : 8;
    return dt;
  } catch (e) {
    return null;
  }
}

function buildGroundAndRoads() {
  var ground = BABYLON.MeshBuilder.CreateGround('g', { width: 700, height: 700, subdivisions: GFX_MOBILE ? 1 : 4 }, scene);
  var grassMat = mat('#52c41a');
  grassMat.specularColor = new BABYLON.Color3(0.08, 0.12, 0.06);
  grassMat.specularPower = 32;
  var grassTex = makeProcTexture(GFX_MOBILE ? 128 : 256, function (x, y, size) {
    var n = Math.sin(x * 0.19) * Math.cos(y * 0.17) + Math.sin((x * 3.1 + y * 2.4) * 0.09) * 0.55;
    n += ((x * 13 + y * 7) % 11) / 11 * 0.4;
    var t = 0.5 + 0.5 * Math.sin(n * 1.4);
    var blade = ((x * 31 + y * 17) % 5) === 0 ? 25 : 0;
    return [78 + t * 65 + blade, 196 + t * 45, 42 + t * 32];
  });
  if (grassTex) {
    grassMat.diffuseTexture = grassTex;
    grassTex.uScale = 36;
    grassTex.vScale = 36;
  }
  ground.material = grassMat;
  ground.receiveShadows = true;
  ground.freezeWorldMatrix();

  var patchList = [];
  var patchCols = ['#73d13d', '#95de64', '#ff7875', '#ffd666', '#b37feb', '#5cdbd3', '#69c0ff'];
  for (var i = 0; i < 75; i++) {
    var a = sr(0, Math.PI * 2), r = sr(35, 330);
    patchList.push(discR(sr(4, 18), Math.cos(a) * r, Math.sin(a) * r, 0.012, patchCols[i % patchCols.length], 18));
  }
  for (var mh = 0; mh < 14; mh++) {
    var rc = ROADS[Math.floor(srnd() * 4)];
    var along = sr(-220, 220);
    if (srnd() > 0.5) patchList.push(discR(0.75, along, rc, 0.058, '#262f3d', 14));
    else patchList.push(discR(0.75, rc, along, 0.052, '#262f3d', 14));
  }
  mergePainted(patchList);

  var roadV = [], roadH = [], sideParts = [], dashParts = [];
  ROADS.forEach(function (c) {
    roadV.push(box(ROAD_W, 0.04, 640, c, 0.02, 0, '#334155'));
    roadH.push(box(640, 0.04, ROAD_W, 0, 0.032, c, '#334155'));
    var gaps = [-320];
    ROADS.forEach(function (rc2) { gaps.push(rc2 - 9, rc2 + 9); });
    gaps.push(320);
    for (var g = 0; g < gaps.length; g += 2) {
      var z0 = gaps[g], z1 = gaps[g + 1];
      if (z1 - z0 < 4) continue;
      sideParts.push(box(3, 0.14, z1 - z0, c + (ROAD_W / 2 + 1.5), 0.07, (z0 + z1) / 2, '#e2e8f0'));
      sideParts.push(box(3, 0.14, z1 - z0, c - (ROAD_W / 2 + 1.5), 0.07, (z0 + z1) / 2, '#e2e8f0'));
      sideParts.push(box(z1 - z0, 0.14, 3, (z0 + z1) / 2, 0.075, c + (ROAD_W / 2 + 1.5), '#e2e8f0'));
      sideParts.push(box(z1 - z0, 0.14, 3, (z0 + z1) / 2, 0.075, c - (ROAD_W / 2 + 1.5), '#e2e8f0'));
    }
    for (var z = -300; z <= 300; z += 4.6) {
      var nearH = false;
      ROADS.forEach(function (rc3) { if (Math.abs(z - rc3) < ROAD_W / 2 + 6) nearH = true; });
      if (!nearH) dashParts.push(box(0.38, 0.012, 2.2, c, 0.046, z, '#facc15'));
    }
    for (var x = -300; x <= 300; x += 4.6) {
      var nearV = false;
      ROADS.forEach(function (rc4) { if (Math.abs(x - rc4) < ROAD_W / 2 + 6) nearV = true; });
      if (!nearV) dashParts.push(box(2.2, 0.012, 0.38, x, 0.052, c, '#facc15'));
    }
  });
  ROADS.forEach(function (ix) {
    ROADS.forEach(function (iz) {
      if (Math.abs(ix) > 100 || Math.abs(iz) > 100) return;
      [1, -1].forEach(function (sgn) {
        for (var b = -2; b <= 2; b++) {
          dashParts.push(box(ROAD_W, 0.012, 1.1, ix, 0.056, iz + sgn * (ROAD_W / 2 + 4.5) + b * 2.2, '#ffffff'));
          dashParts.push(box(1.1, 0.012, ROAD_W, ix + sgn * (ROAD_W / 2 + 4.5) + b * 2.2, 0.056, iz, '#ffffff'));
        }
      });
    });
  });
  mergePainted(roadV.concat(roadH));
  mergePainted(sideParts);
  mergePainted(dashParts);
}

function addWindows(parts, parent, w, d, h) {
  var wh = 1.3, ww = 1.1;
  var floors = Math.floor(h / 2.9);
  for (var f = 0; f < floors; f++) {
    var y = 1.6 + f * 2.9;
    if (y + wh > h - 1) break;
    var cols = Math.max(2, Math.floor(w / 3.4));
    for (var ci = 0; ci < cols; ci++) {
      var fx = -w / 2 + (ci + 0.5) * (w / cols);
      if (srnd() < 0.18) continue;
      parts.push(box(ww + 0.12, wh + 0.12, 0.08, fx, y, d / 2 + 0.02, '#ffffff', parent));
      parts.push(box(ww, wh, 0.1, fx, y, d / 2 + 0.04, '#38bdf8', parent));
      if (srnd() < 0.22) {
        parts.push(box(ww + 0.18, 0.16, 0.12, fx, y + 0.25, d / 2 + 0.06, '#ea580c', parent, sr(-0.2, 0.2)));
        parts.push(box(ww + 0.18, 0.16, 0.12, fx, y + 0.8, d / 2 + 0.06, '#ea580c', parent, sr(-0.2, 0.2)));
      }
      if (srnd() < 0.5) {
        parts.push(box(ww + 0.12, wh + 0.12, 0.08, fx, y, -d / 2 - 0.02, '#ffffff', parent));
        parts.push(box(ww, wh, 0.1, fx, y, -d / 2 - 0.04, '#38bdf8', parent));
      }
    }
    for (var si = 0; si < 2; si++) {
      var fz = -d / 2 + (si + 0.5) * (d / 2);
      if (srnd() < 0.4) continue;
      parts.push(box(0.08, wh + 0.12, ww + 0.12, w / 2 + 0.02, y, fz, '#ffffff', parent));
      parts.push(box(0.1, wh, ww, w / 2 + 0.04, y, fz, '#38bdf8', parent));
    }
  }
}

function buildBuilding(cx, cz, w, dd, h, ry) {
  var root = new BABYLON.TransformNode('', scene);
  root.position.set(cx, 0, cz);
  root.rotation.y = ry;
  var parts = [];
  var wallHex = WALL_PAL[Math.floor(srnd() * WALL_PAL.length)];
  var doorW = 2.4, doorH = 3.0;

  // 1. Interior Wooden Floor (Walkable at y = 0)
  parts.push(box(w - 0.4, 0.08, dd - 0.4, 0, 0.04, 0, '#75583b', root));

  // 2. Perimeter Walls with Open Doorway Cutout
  // Back wall
  parts.push(box(w, h, 0.35, 0, h / 2, -dd / 2 + 0.175, wallHex, root));
  // Left wall
  parts.push(box(0.35, h, dd, -w / 2 + 0.175, h / 2, 0, wallHex, root));
  // Right wall
  parts.push(box(0.35, h, dd, w / 2 - 0.175, h / 2, 0, wallHex, root));
  // Front wall segments
  var fwW = (w - doorW) / 2;
  parts.push(box(fwW, h, 0.35, -w / 2 + fwW / 2, h / 2, dd / 2 - 0.175, wallHex, root));
  parts.push(box(fwW, h, 0.35, w / 2 - fwW / 2, h / 2, dd / 2 - 0.175, wallHex, root));
  // Front door lintel (above door)
  parts.push(box(doorW + 0.2, h - doorH, 0.38, 0, doorH + (h - doorH) / 2, dd / 2 - 0.175, '#ffffff', root));
  // Door frame side trims
  parts.push(box(0.14, doorH, 0.4, -doorW / 2, doorH / 2, dd / 2 - 0.175, '#ffffff', root));
  parts.push(box(0.14, doorH, 0.4, doorW / 2, doorH / 2, dd / 2 - 0.175, '#ffffff', root));

  // Windows with glossy cartoon glass
  addWindows(parts, root, w, dd, h);
  if (srnd() < 0.65) {
    var ivyH = sr(2, Math.min(h - 2, 7));
    parts.push(box(0.5, ivyH, 0.16, -w / 2 - 0.06, ivyH / 2 + 0.4, sr(-dd / 3, dd / 3), '#22c55e', root, sr(-0.2, 0.2)));
    parts.push(box(0.16, ivyH * 0.7, 0.5, sr(-w / 3, w / 3), ivyH * 0.35 + 0.3, dd / 2 + 0.07, '#4ade80', root));
  }

  // 3. Interior Living Room & Survivor Furniture
  // Cartoon living room couch
  parts.push(box(2.4, 0.75, 1.1, w / 4, 0.38, 0, '#3b82f6', root));
  parts.push(box(2.4, 0.9, 0.3, w / 4, 0.65, 0.45, '#2563eb', root));
  // Wooden dining / supply table
  parts.push(box(2.2, 0.85, 1.3, -w / 4, 0.42, 0, '#d97706', root));
  parts.push(box(0.5, 0.85, 0.5, -w / 4, 0.42, -1.1, '#f59e0b', root));
  // Kitchen counter / storage shelf
  parts.push(box(1.0, 0.95, dd / 2 - 1.2, -w / 2 + 0.7, 0.48, -dd / 4, '#e2e8f0', root));
  // Bookshelf / storage cupboard
  parts.push(box(1.8, 2.2, 0.5, 0, 1.1, -dd / 2 + 0.45, '#92400e', root));

  // 4. Interior Ceiling Lamp with Warm Glow
  parts.push(cyl(0.3, 0.1, 0.3, 0, h - 0.3, 0, '#e8c878', root, 8));
  var lampBulb = sph(0.16, 0, h - 0.45, 0, '#ffe082', root, 6);
  lampBulb.material = mat('#ffe082', { e: '#ffaa33' });
  parts.push(lampBulb);

  var lampPos = rotPoint(0, 0, ry, cx, cz);
  var lampLight = new BABYLON.PointLight('blamp' + cx + '_' + cz, new BABYLON.Vector3(lampPos[0], h - 0.6, lampPos[1]), scene);
  lampLight.diffuse = new BABYLON.Color3(1, 0.82, 0.45);
  lampLight.specular = new BABYLON.Color3(0.15, 0.1, 0.05);
  lampLight.range = 14;
  lampLight.intensity = 1.1;
  lanternLights.push(lampLight);

  // 5. Scavengeable Loot inside the House
  var loot1 = rotPoint(-w / 4, 0, ry, cx, cz);
  addLoot('medkit', loot1[0], 0.92, loot1[1]);
  var loot2 = rotPoint(-w / 2 + 0.7, -dd / 4, ry, cx, cz);
  addLoot('ammo', loot2[0], 1.02, loot2[1]);

  // 6. Rooftop Lookout Deck & Sandbags
  var roofTopH = h + 0.15;
  parts.push(box(w + 0.4, 0.3, dd + 0.4, 0, roofTopH, 0, '#594a3d', root));
  parts.push(box(w + 0.5, 0.75, 0.4, 0, h + 0.6, dd / 2 + 0.1, '#686058', root));
  parts.push(box(w + 0.5, 0.75, 0.4, 0, h + 0.6, -dd / 2 - 0.1, '#686058', root));
  parts.push(box(0.4, 0.75, dd + 0.5, w / 2 + 0.1, h + 0.6, 0, '#686058', root));
  parts.push(box(0.4, 0.75, dd + 0.5, -w / 2 - 0.1, h + 0.6, 0, '#686058', root));
  if (srnd() < 0.6) parts.push(cyl(1.8, 1.8, 2.2, sr(-w / 4, w / 4), h + 1.7, sr(-dd / 4, dd / 4), '#7d6b58', root));
  if (srnd() < 0.6) parts.push(box(1.6, 1.2, 1.6, sr(-w / 3, w / 3), h + 1.2, sr(-dd / 3, dd / 3), '#8f8f97', root));

  // 7. Exterior Ladder for Rooftop Access
  var ladX = w / 2 + 0.2, ladZ = 0;
  parts.push(cyl(0.06, 0.06, h + 1.2, ladX, (h + 1.2) / 2, ladZ - 0.35, '#3a3a40', root, 6));
  parts.push(cyl(0.06, 0.06, h + 1.2, ladX, (h + 1.2) / 2, ladZ + 0.35, '#3a3a40', root, 6));
  for (var rgh = 0.4; rgh <= h + 0.7; rgh += 0.34) {
    parts.push(box(0.08, 0.05, 0.66, ladX, rgh, ladZ, '#e5a535', root));
  }

  var merged = BABYLON.Mesh.MergeMeshes(parts, true, true, null, false, false);
  if (merged) {
    merged.material = vcMat;
    merged.freezeWorldMatrix();
    OCCLUDERS.push(merged);
    castShadow(merged);
  }
  root.dispose();

  var cw = Math.abs(Math.cos(ry)) * w + Math.abs(Math.sin(ry)) * dd;
  var cd = Math.abs(Math.cos(ry)) * dd + Math.abs(Math.sin(ry)) * w;

  // 8. Register Platforms (Interior Floor & Rooftop)
  addPlatform(cx - cw / 2 + 0.4, cx + cw / 2 - 0.4, cz - cd / 2 + 0.4, cz + cd / 2 - 0.4, 0, 'interior_floor', 'House Interior');
  addPlatform(cx - cw / 2, cx + cw / 2, cz - cd / 2, cz + cd / 2, roofTopH + 0.3, 'building_roof', 'Building Roof');

  // 9. Register 3D Walls for Perimeter (leaving Doorway open for entry)
  // Back wall
  var bwP = rotPoint(0, -dd / 2 + 0.175, ry, cx, cz);
  addRotatedWall3D(bwP[0], bwP[1], w, 0.35, 0, h, ry, 0.1);
  // Left wall
  var lwP = rotPoint(-w / 2 + 0.175, 0, ry, cx, cz);
  addRotatedWall3D(lwP[0], lwP[1], 0.35, dd, 0, h, ry, 0.1);
  // Right wall
  var rwP = rotPoint(w / 2 - 0.175, 0, ry, cx, cz);
  addRotatedWall3D(rwP[0], rwP[1], 0.35, dd, 0, h, ry, 0.1);
  // Front wall left segment
  var fwlP = rotPoint(-w / 2 + fwW / 2, dd / 2 - 0.175, ry, cx, cz);
  addRotatedWall3D(fwlP[0], fwlP[1], fwW, 0.35, 0, h, ry, 0.1);
  // Front wall right segment
  var fwrP = rotPoint(w / 2 - fwW / 2, dd / 2 - 0.175, ry, cx, cz);
  addRotatedWall3D(fwrP[0], fwrP[1], fwW, 0.35, 0, h, ry, 0.1);
  // Front door lintel (blocks only above doorH = 3.0)
  var fwdP = rotPoint(0, dd / 2 - 0.175, ry, cx, cz);
  addRotatedWall3D(fwdP[0], fwdP[1], doorW + 0.2, 0.38, doorH, h, ry, 0.1);

  // 10. Register Interactive Front Door
  var doorPos = rotPoint(0, dd / 2 - 0.175, ry, cx, cz);
  addInteractiveDoor(doorPos[0], doorPos[1], 0, doorW, doorH, ry, false);

  // 11. Register Rooftop Ladder
  var ladGlobal = rotPoint(ladX, ladZ, ry, cx, cz);
  addLadder(ladGlobal[0], ladGlobal[1], 1.1, 0, roofTopH + 0.3, ry + Math.PI, roofTopH + 0.3);

  return { w: cw, d: cd };
}

var SIGN_WORDS = ['MOTEL', 'DINER', 'MARKET', 'BOOKS', 'GARAGE', 'HOTEL', 'BAR'];
var signIdx = 0;
function addSign(cx, cz, ry, h) {
  if (signIdx >= SIGN_WORDS.length) return;
  signIdx++;
  var word = SIGN_WORDS[signIdx - 1];
  try {
    var dt = new BABYLON.DynamicTexture('sign', { width: 256, height: 96 }, scene, true);
    var ctx = dt.getContext();
    ctx.fillStyle = ['#3f5f7f', '#7f4f3f', '#4f7f5f', '#6f5f8f'][signIdx % 4];
    ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = '#e8e0cc';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, 244, 84);
    ctx.fillStyle = '#f2ecd8';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(word, 128, 52);
    dt.update();
    var sm = new BABYLON.StandardMaterial('sgn' + signIdx, scene);
    sm.diffuseTexture = dt;
    sm.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    sm.emissiveColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    var sy = Math.min(h - 2, 5.5);
    var plane = BABYLON.MeshBuilder.CreatePlane('signP' + signIdx, { width: 4.4, height: 1.65 }, scene);
    plane.material = sm;
    var ox = Math.sin(ry), oz = Math.cos(ry);
    plane.position.set(cx + ox * 8, sy, cz + oz * 8);
    plane.rotation.y = ry;
    plane.freezeWorldMatrix();
  } catch (e) {}
}

function buildSafeHouse(cx, cz, ry) {
  var root = new BABYLON.TransformNode('', scene);
  root.position.set(cx, 0, cz);
  root.rotation.y = ry;
  var parts = [];
  var wallHex = HOUSE_WALLS[Math.floor(srnd() * HOUSE_WALLS.length)];
  var roofHex = HOUSE_ROOFS[Math.floor(srnd() * HOUSE_ROOFS.length)];
  var w = 10, dd = 8.5, h = 4.2;

  // 1. Interior Floor
  parts.push(box(w - 0.4, 0.08, dd - 0.4, 0, 0.04, 0, '#785b3c', root));

  // 2. Exterior Walls (Accessible doorway at front)
  // Back wall
  parts.push(box(w, h, 0.3, 0, h / 2, -dd / 2 + 0.15, wallHex, root));
  // Left wall
  parts.push(box(0.3, h, dd, -w / 2 + 0.15, h / 2, 0, wallHex, root));
  // Right wall (with ladder clearance)
  parts.push(box(0.3, h, dd, w / 2 - 0.15, h / 2, 0, wallHex, root));
  // Front wall (Left & Right segments leaving 2.6m center doorway)
  var fwW = (w - 2.6) / 2;
  parts.push(box(fwW, h, 0.3, -w / 4 - 0.65, h / 2, dd / 2 - 0.15, wallHex, root));
  parts.push(box(fwW, h, 0.3, w / 4 + 0.65, h / 2, dd / 2 - 0.15, wallHex, root));
  // Front door lintel (top of door frame)
  parts.push(box(2.8, 1.0, 0.36, 0, h - 0.5, dd / 2 - 0.15, '#ffffff', root));
  // Decorative door trim
  parts.push(box(0.18, 3.2, 0.38, -1.35, 1.6, dd / 2 - 0.15, '#ffffff', root));
  parts.push(box(0.18, 3.2, 0.38, 1.35, 1.6, dd / 2 - 0.15, '#ffffff', root));

  // Windows with glass and shutters
  [-1, 1].forEach(function (s) {
    parts.push(box(1.6, 1.4, 0.16, s * 3.2, 2.2, dd / 2 - 0.12, '#38bdf8', root));
    parts.push(box(1.9, 0.16, 0.22, s * 3.2, 2.95, dd / 2 - 0.10, '#ffffff', root));
    parts.push(box(0.35, 1.5, 0.12, s * 3.2 - s * 0.95, 2.2, dd / 2 - 0.08, roofHex, root));
    parts.push(box(0.35, 1.5, 0.12, s * 3.2 + s * 0.95, 2.2, dd / 2 - 0.08, roofHex, root));
  });

  // 3. Covered Front Porch ("Under the House")
  // Porch deck (elevated at y = 0.35)
  parts.push(box(6.2, 0.35, 3.2, 0, 0.175, dd / 2 + 1.6, '#d97706', root));
  // Porch step (at y = 0.18)
  parts.push(box(6.2, 0.18, 0.8, 0, 0.09, dd / 2 + 3.4, '#f59e0b', root));
  // Porch support columns
  [-2.7, 2.7].forEach(function (px) {
    parts.push(cyl(0.22, 0.22, 3.0, px, 1.85, dd / 2 + 2.9, '#d97706', root, 8));
  });
  // Porch overhead awning roof (y = 3.35, so headroom is ~3.0m underneath)
  var awn = box(6.6, 0.2, 3.4, 0, 3.35, dd / 2 + 1.7, roofHex, root);
  awn.rotation.x = 0.08;
  parts.push(awn);

  // 4. Interior Shelter Furnishings & Warm Glow
  // Table
  parts.push(box(2.0, 0.9, 1.2, -w / 2 + 1.6, 0.45, -dd / 2 + 1.5, '#d97706', root));
  // First aid med-kit
  parts.push(box(0.6, 0.26, 0.4, -w / 2 + 1.3, 0.9 + 0.13, -dd / 2 + 1.4, '#ffffff', root));
  parts.push(box(0.35, 0.27, 0.1, -w / 2 + 1.3, 0.9 + 0.135, -dd / 2 + 1.4, '#ef4444', root));
  parts.push(box(0.1, 0.27, 0.35, -w / 2 + 1.3, 0.9 + 0.135, -dd / 2 + 1.4, '#ef4444', root));
  // Ammo crate & radio
  parts.push(box(0.7, 0.45, 0.5, -w / 2 + 2.1, 0.9 + 0.225, -dd / 2 + 1.5, '#10b981', root));
  parts.push(box(0.45, 0.35, 0.28, -w / 2 + 1.7, 0.9 + 0.175, -dd / 2 + 1.3, '#1e293b', root));
  parts.push(cyl(0.02, 0.01, 0.7, -w / 2 + 1.8, 0.9 + 0.6, -dd / 2 + 1.3, '#cbd5e1', root, 6));
  // Lantern on table
  parts.push(cyl(0.24, 0.18, 0.4, -w / 2 + 2.2, 0.9 + 0.2, -dd / 2 + 1.1, '#f59e0b', root, 8));
  var lanBulb = sph(0.16, -w / 2 + 2.2, 0.9 + 0.2, -dd / 2 + 1.1, '#fef08a', root, 6);
  lanBulb.material = mat('#fef08a', { e: '#fef08a' });
  parts.push(lanBulb);

  var lanWorldPos = rotPoint(-w / 2 + 2.2, -dd / 2 + 1.1, ry, cx, cz);
  var lanLight = new BABYLON.PointLight('lan' + cx, new BABYLON.Vector3(lanWorldPos[0], 1.4, lanWorldPos[1]), scene);
  lanLight.diffuse = new BABYLON.Color3(1, 0.85, 0.52);
  lanLight.specular = new BABYLON.Color3(0.2, 0.15, 0.05);
  lanLight.range = 14;
  lanLight.intensity = 1.3;
  lanternLights.push(lanLight);

  // 5. Rooftop Platform & Lookout (y = 4.5m)
  // Rooftop floor slab
  parts.push(box(w + 0.4, 0.3, dd + 0.4, 0, h + 0.15, 0, '#92400e', root));
  // Sandbag barricades along perimeter for sniper cover
  parts.push(box(w - 0.8, 0.75, 0.5, 0, h + 0.65, dd / 2 - 0.25, '#fde047', root)); // front
  parts.push(box(0.5, 0.75, dd - 0.8, -w / 2 + 0.25, h + 0.65, 0, '#fde047', root)); // left
  parts.push(box(w - 0.8, 0.75, 0.5, 0, h + 0.65, -dd / 2 + 0.25, '#fde047', root)); // back
  // Right wall sandbags (with gap for ladder entry)
  parts.push(box(0.5, 0.75, dd / 2 - 0.8, w / 2 - 0.25, h + 0.65, -dd / 4, '#fde047', root));
  parts.push(box(0.5, 0.75, dd / 4 - 0.4, w / 2 - 0.25, h + 0.65, dd / 2 - 0.6, '#fde047', root));
  // Rooftop lookout props
  parts.push(cyl(0.08, 0.04, 4.0, -w / 2 + 1.2, h + 2.3, -dd / 2 + 1.2, '#e2e8f0', root, 6)); // Radio mast
  var beacon = sph(0.3, -w / 2 + 1.2, h + 4.3, -dd / 2 + 1.2, '#ef4444', root, 6);
  beacon.material = mat('#ef4444', { e: '#ef4444' });
  parts.push(beacon);
  parts.push(box(1.2, 0.7, 0.8, 0, h + 0.65, -dd / 2 + 1.2, '#10b981', root)); // Sniper crate

  // 6. Exterior Ladder on Right Side
  var ladLocalX = w / 2 + 0.15;
  var ladLocalZ = dd / 4 - 0.2;
  // Side rails
  parts.push(cyl(0.06, 0.06, 5.4, ladLocalX, 2.7, ladLocalZ - 0.35, '#1e293b', root, 6));
  parts.push(cyl(0.06, 0.06, 5.4, ladLocalX, 2.7, ladLocalZ + 0.35, '#1e293b', root, 6));
  // Rungs
  for (var rg = 0.35; rg <= 4.5; rg += 0.32) {
    parts.push(box(0.08, 0.05, 0.66, ladLocalX, rg, ladLocalZ, '#f59e0b', root));
  }

  // Merge house meshes and add to occluders & shadow casters
  var merged = BABYLON.Mesh.MergeMeshes(parts, true, true, null, false, false);
  if (merged) {
    merged.material = vcMat;
    merged.freezeWorldMatrix();
    OCCLUDERS.push(merged);
    castShadow(merged);
  }
  root.dispose();

  // 7. Register 3D Platforms & Walls
  var roofTopY = 4.5;
  // Rooftop platform (global bounds)
  var rBoundW = Math.abs(Math.cos(ry)) * (w + 0.4) + Math.abs(Math.sin(ry)) * (dd + 0.4);
  var rBoundD = Math.abs(Math.cos(ry)) * (dd + 0.4) + Math.abs(Math.sin(ry)) * (w + 0.4);
  addPlatform(cx - rBoundW / 2, cx + rBoundW / 2, cz - rBoundD / 2, cz + rBoundD / 2, roofTopY, 'roof', 'Safehouse Rooftop');

  // Porch platform (y = 0.35)
  var pCenter = rotPoint(0, dd / 2 + 1.6, ry, cx, cz);
  var pBoundW = Math.abs(Math.cos(ry)) * 6.2 + Math.abs(Math.sin(ry)) * 3.2;
  var pBoundD = Math.abs(Math.cos(ry)) * 3.2 + Math.abs(Math.sin(ry)) * 6.2;
  addPlatform(pCenter[0] - pBoundW / 2, pCenter[0] + pBoundW / 2, pCenter[1] - pBoundD / 2, pCenter[1] + pBoundD / 2, 0.35, 'porch', 'Porch');

  // Porch step platform (y = 0.18)
  var sCenter = rotPoint(0, dd / 2 + 3.4, ry, cx, cz);
  var sBoundW = Math.abs(Math.cos(ry)) * 6.2 + Math.abs(Math.sin(ry)) * 0.8;
  var sBoundD = Math.abs(Math.cos(ry)) * 0.8 + Math.abs(Math.sin(ry)) * 6.2;
  addPlatform(sCenter[0] - sBoundW / 2, sCenter[0] + sBoundW / 2, sCenter[1] - sBoundD / 2, sCenter[1] + sBoundD / 2, 0.18, 'step', 'Porch Step');

  // 3D Walls for House:
  // Back wall
  var bwP = rotPoint(0, -dd / 2 + 0.15, ry, cx, cz);
  addRotatedWall3D(bwP[0], bwP[1], w, 0.35, 0, roofTopY, ry, 0.1);
  // Left wall
  var lwP = rotPoint(-w / 2 + 0.15, 0, ry, cx, cz);
  addRotatedWall3D(lwP[0], lwP[1], 0.35, dd, 0, roofTopY, ry, 0.1);
  // Right wall
  var rwP = rotPoint(w / 2 - 0.15, 0, ry, cx, cz);
  addRotatedWall3D(rwP[0], rwP[1], 0.35, dd, 0, roofTopY, ry, 0.1);
  // Front wall left segment
  var fwlP = rotPoint(-w / 4 - 0.65, dd / 2 - 0.15, ry, cx, cz);
  addRotatedWall3D(fwlP[0], fwlP[1], fwW, 0.35, 0, roofTopY, ry, 0.1);
  // Front wall right segment
  var fwrP = rotPoint(w / 4 + 0.65, dd / 2 - 0.15, ry, cx, cz);
  addRotatedWall3D(fwrP[0], fwrP[1], fwW, 0.35, 0, roofTopY, ry, 0.1);
  // Front door lintel (blocks above 3.2m only)
  var fwdP = rotPoint(0, dd / 2 - 0.15, ry, cx, cz);
  addRotatedWall3D(fwdP[0], fwdP[1], 2.8, 0.35, 3.2, roofTopY, ry, 0.1);

  // Register Interactive Front Door in Safehouse
  var doorPos = rotPoint(0, dd / 2 - 0.15, ry, cx, cz);
  addInteractiveDoor(doorPos[0], doorPos[1], 0, 2.6, 3.2, ry, true);
  // Register Scavengeable Loot in Safehouse
  var sLoot1 = rotPoint(-w / 2 + 1.3, -dd / 2 + 1.4, ry, cx, cz);
  addLoot('medkit', sLoot1[0], 0.95, sLoot1[1]);
  var sLoot2 = rotPoint(-w / 2 + 2.1, -dd / 2 + 1.5, ry, cx, cz);
  addLoot('ammo', sLoot2[0], 0.95, sLoot2[1]);

  // 8. Register Exterior Ladder
  var ladWorldPos = rotPoint(ladLocalX, ladLocalZ, ry, cx, cz);
  addLadder(ladWorldPos[0], ladWorldPos[1], 1.1, 0, roofTopY, ry + Math.PI, roofTopY);

  // 9. Safe Zone Beacon & Rings
  var ringMat = new BABYLON.StandardMaterial('ringM' + cx, scene);
  ringMat.emissiveColor = BABYLON.Color3.FromHexString('#59e3ff');
  ringMat.diffuseColor = BABYLON.Color3.FromHexString('#59e3ff');
  ringMat.alpha = 0.85;
  ringMat.disableLighting = true;
  ringMats.push(ringMat);
  var ring = BABYLON.MeshBuilder.CreateTorus('ring' + cx, { diameter: SAFE_R * 2, thickness: 0.32, tessellation: 32 }, scene);
  ring.position.set(cx, 0.1, cz);
  ring.material = ringMat;
  ring.freezeWorldMatrix();

  var fdMat = new BABYLON.StandardMaterial('fdm' + cx, scene);
  fdMat.emissiveColor = BABYLON.Color3.FromHexString('#59e3ff');
  fdMat.disableLighting = true;
  fdMat.alpha = 0.12;
  ALL_MATS.push(fdMat);
  var fadeDisc = BABYLON.MeshBuilder.CreateDisc('fdd' + cx, { radius: SAFE_R, tessellation: 28 }, scene);
  fadeDisc.position.set(cx, 0.05, cz);
  fadeDisc.rotation.x = Math.PI / 2;
  fadeDisc.material = fdMat;
  fadeDisc.freezeWorldMatrix();

  // Emblem Floating Beacon
  var emb = BABYLON.MeshBuilder.CreateCylinder('emb' + cx, { diameter: 1.8, height: 0.28, tessellation: 6 }, scene);
  emb.position.set(cx, 8.8, cz);
  var embM = new BABYLON.StandardMaterial('embm' + cx, scene);
  embM.diffuseColor = BABYLON.Color3.FromHexString('#f59e0b');
  embM.emissiveColor = BABYLON.Color3.FromHexString('#f59e0b');
  emb.material = embM;
  emblems.push(emb);

  // Dynamic warm lantern inside
  var lantern = new BABYLON.PointLight('safeLantern' + cx, new BABYLON.Vector3(cx, 3.2, cz), scene);
  lantern.diffuse = new BABYLON.Color3(1.0, 0.82, 0.52);
  lantern.range = 22.0;
  lantern.intensity = 1.6;
  lanternLights.push(lantern);
  COL.safe.push({ x: cx, z: cz, r: SAFE_R });
  return { w: rBoundW, d: rBoundD };
}

function buildVehicle(x, z, ry) {
  var root = new BABYLON.TransformNode('vehRoot', scene);
  var col = CAR_COLORS[Math.floor(srnd() * CAR_COLORS.length)];
  var vcMat = mat(col, { r: 0.25, m: 0.2 });

  var isTruck = srnd() < 0.28;
  var isVan = !isTruck && srnd() < 0.35;
  var W = isTruck ? 2.6 : (isVan ? 2.3 : 2.0);
  var L = isTruck ? 6.2 : (isVan ? 5.2 : 4.4);
  var H = isTruck ? 1.9 : (isVan ? 1.6 : 1.15);

  root.position.set(x, 0, z);
  root.rotation.y = ry;

  var parts = [];
  // Chassis / Lower Body
  parts.push(box(W, 0.65, L, 0, 0.58, 0, col, root));
  // Cabin & Roof
  if (isTruck) {
    parts.push(box(W, H, L * 0.42, 0, 0.58 + H / 2, L * 0.2, col, root));
    parts.push(box(W * 0.88, H * 0.82, L * 0.48, 0, 0.58 + H * 0.42, -L * 0.22, '#475569', root));
  } else {
    parts.push(box(W * 0.94, H, L * 0.64, 0, 0.58 + H / 2, -L * 0.05, col, root));
  }
  // Cartoon Sky-Blue Windows
  parts.push(box(W * 0.96, H * 0.48, L * 0.32, 0, 0.72 + H / 2, isTruck ? L * 0.22 : 0, '#38bdf8', root));
  // Wheels & Bumpers & Lights
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (wl) {
    var wheel = cyl(0.72, 0.72, 0.3, wl[0] * (W / 2 - 0.05), 0.42, wl[1] * L * 0.32, '#1e293b', root, 12);
    wheel.rotation.z = Math.PI / 2;
    parts.push(wheel);
  });
  parts.push(box(W, 0.28, 0.3, 0, 0.55, L / 2 + 0.02, '#e2e8f0', root));
  parts.push(box(W, 0.28, 0.3, 0, 0.55, -L / 2 - 0.02, '#e2e8f0', root));
  parts.push(box(0.4, 0.22, 0.1, W / 4, 0.78, L / 2 + 0.12, '#fef08a', root));
  parts.push(box(0.4, 0.22, 0.1, -W / 4, 0.78, L / 2 + 0.12, '#fef08a', root));
  parts.push(box(0.4, 0.22, 0.1, W / 4, 0.78, -L / 2 - 0.12, '#ef4444', root));
  parts.push(box(0.4, 0.22, 0.1, -W / 4, 0.78, -L / 2 - 0.12, '#ef4444', root));
  if (srnd() < 0.8) parts.push(box(sr(0.5, 1.1), sr(0.4, 0.7), 0.06, sr(-W / 3, W / 3), sr(0.7, 0.55 + H), W / 2 + 0.02, '#7d5a3f', root));
  var merged = BABYLON.Mesh.MergeMeshes(parts, true, true, null, false, false);
  if (merged) {
    merged.material = vcMat;
    merged.freezeWorldMatrix();
    OCCLUDERS.push(merged);
    castShadow(merged);
  }
  root.dispose();

  // Register vehicle roof as walkable platform & 3D obstacle
  var vehTopY = 0.55 + H;
  var vcw = Math.abs(Math.cos(ry)) * W + Math.abs(Math.sin(ry)) * L;
  var vcd = Math.abs(Math.cos(ry)) * L + Math.abs(Math.sin(ry)) * W;
  addPlatform(x - vcw / 2, x + vcw / 2, z - vcd / 2, z + vcd / 2, vehTopY, 'vehicle', 'Vehicle Roof');
  addRotatedWall3D(x, z, W, L, 0, vehTopY, ry, 0.1);
}

function buildTreeMasters() {
  function finish(parts) {
    var m = mergePainted(parts);
    if (m) m.isVisible = false;
    return m;
  }
  // 1. Cartoon Fluffy Oak Tree (Cloud Canopy)
  var t1 = finish([
    cyl(0.55, 0.42, 2.8, 0, 1.4, 0, '#854d0e'),
    sph(3.6, 0, 4.0, 0, '#22c55e', null, 8),
    sph(2.8, 1.3, 4.8, 0.6, '#4ade80', null, 7),
    sph(2.6, -1.2, 4.6, -0.6, '#16a34a', null, 7),
    sph(2.2, 0, 5.5, 0, '#86efac', null, 7),
    sph(2.0, -0.7, 3.4, 1.2, '#15803d', null, 6),
    sph(2.0, 0.8, 3.2, -1.0, '#15803d', null, 6)
  ]);
  // 2. Cartoon Stylized Pine Tree (Tiered Cones)
  var t2 = finish([
    cyl(0.45, 0.35, 2.0, 0, 1.0, 0, '#78350f'),
    cyl(3.2, 0.2, 2.4, 0, 3.0, 0, '#15803d', null, 8),
    cyl(2.5, 0.15, 2.0, 0, 4.4, 0, '#16a34a', null, 8),
    cyl(1.8, 0.1, 1.6, 0, 5.6, 0, '#22c55e', null, 8),
    cyl(1.1, 0.05, 1.2, 0, 6.5, 0, '#4ade80', null, 8)
  ]);
  // 3. Giant Stylized Apple / Willow Tree
  var t3 = finish([
    cyl(0.9, 0.65, 3.6, 0, 1.8, 0, '#854d0e'),
    sph(5.2, 0, 5.6, 0, '#22c55e', null, 8),
    sph(3.4, 1.8, 6.8, 1.0, '#4ade80', null, 7),
    sph(3.2, -1.8, 6.5, -0.9, '#16a34a', null, 7),
    sph(2.8, 0.5, 7.6, -1.3, '#86efac', null, 7),
    sph(2.6, -0.8, 7.4, 1.2, '#a3e635', null, 7),
    sph(0.4, 1.5, 5.2, 1.2, '#ef4444', null, 5),
    sph(0.4, -1.4, 4.9, -1.1, '#ef4444', null, 5),
    sph(0.4, 0.3, 6.1, 2.1, '#ef4444', null, 5),
    sph(0.4, -1.8, 5.8, 0.8, '#ef4444', null, 5)
  ]);
  return [t1, t2, t3];
}

var treeMasters;

function placeTree(master, x, z, s) {
  var inst = master.createInstance('');
  inst.position.set(x, 0, z);
  inst.rotation.y = rand(0, Math.PI * 2);
  inst.scaling.setAll(s);
  addCircle(x, z, 0.5 * s);
}

function scatterTrees() {
  var clusters = [];
  for (var i = 0; i < 10; i++) {
    var a = (i / 10) * Math.PI * 2 + sr(-0.25, 0.25);
    var r = sr(212, 268);
    clusters.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  clusters.push([-30, -95], [70, 40], [-90, 130], [130, -60], [-140, -20], [25, 155]);
  clusters.forEach(function (c) {
    var n = 12 + Math.floor(srnd() * 8);
    for (var t = 0; t < n; t++) {
      var x = c[0] + sr(-24, 24), z = c[1] + sr(-24, 24);
      if (Math.abs(x) > BOUND - 6 || Math.abs(z) > BOUND - 6) continue;
      if (!pointFree(x, z, 1)) continue;
      var roll = srnd();
      var m = roll < 0.5 ? treeMasters[0] : (roll < 0.78 ? treeMasters[1] : treeMasters[2]);
      placeTree(m, x, z, sr(0.85, 1.55));
    }
  });
  ROADS.forEach(function (c) {
    for (var k = 0; k < 12; k++) {
      var z = sr(-270, 270);
      if (ROADS.some(function (rr) { return Math.abs(z - rr) < 16; })) continue;
      var side = srnd() > 0.5 ? 1 : -1;
      var x = c + side * (ROAD_W / 2 + 4.2);
      if (!pointFree(x, z, 0.8)) continue;
      placeTree(treeMasters[srnd() < 0.7 ? 0 : 2], x, z, sr(0.7, 1.05));
    }
    for (var k2 = 0; k2 < 12; k2++) {
      var x2 = sr(-270, 270);
      if (ROADS.some(function (rr2) { return Math.abs(x2 - rr2) < 16; })) continue;
      var side2 = srnd() > 0.5 ? 1 : -1;
      var z2 = c + side2 * (ROAD_W / 2 + 4.2);
      if (!pointFree(x2, z2, 0.8)) continue;
      placeTree(treeMasters[srnd() < 0.7 ? 0 : 2], x2, z2, sr(0.7, 1.05));
    }
  });
}

function buildScatterMasters() {
  var tuftParts = [];
  for (var i = 0; i < 3; i++) {
    var blade = cyl(0.26, 0.02, sr(0.45, 0.75), sr(-0.18, 0.18), 0.28, sr(-0.18, 0.18), ['#5fb04a', '#4f9f3f', '#6fbf55'][i]);
    blade.rotation.z = sr(-0.35, 0.35);
    blade.rotation.x = sr(-0.35, 0.35);
    tuftParts.push(blade);
  }
  var tuftMaster = mergePainted(tuftParts);
  if (tuftMaster) tuftMaster.isVisible = false;

  var bushMaster = mergePainted([
    sph(1.7, 0, 0.55, 0, '#3f8f37', null, 8),
    sph(1.2, 0.6, 0.45, 0.3, '#4f9f3f', null, 7),
    sph(1.1, -0.5, 0.4, -0.3, '#377f30', null, 7)
  ]);
  if (bushMaster) bushMaster.isVisible = false;

  var rockMaster = mergePainted([sph(0.55, 0, 0.25, 0, '#8a8f95', null, 5)]);
  if (rockMaster) rockMaster.isVisible = false;

  var flowerColors = ['#ff8fb0', '#ffd34e', '#ffffff'];
  var flowerMasters = flowerColors.map(function (hex) {
    var fm = mergePainted([sph(0.3, 0, 0.3, 0, hex)]);
    if (fm) fm.isVisible = false;
    return fm;
  });

  function nearRoad(x, z) {
    for (var ii = 0; ii < ROADS.length; ii++) {
      if (Math.abs(x - ROADS[ii]) < ROAD_W / 2 + 1) return true;
      if (Math.abs(z - ROADS[ii]) < ROAD_W / 2 + 1) return true;
    }
    return false;
  }
  var tuftBuf = [], rockBuf = [], flowerBufs = [[], [], []];
  var tries = 0;
  while (tuftBuf.length < 640 * 16 && tries < 4000) {
    tries++;
    var x = sr(-285, 285), z = sr(-285, 285);
    if (nearRoad(x, z)) continue;
    if (inSafePoint(x, z, -4)) continue;
    var q = BABYLON.Quaternion.RotationYawPitchRoll(srnd() * 6.28, 0, 0);
    var sc = sr(0.8, 1.5);
    BABYLON.Matrix.Compose(new BABYLON.Vector3(sc, sc, sc), q, new BABYLON.Vector3(x, 0, z)).toArray(tuftBuf, tuftBuf.length);
  }
  tries = 0;
  while (rockBuf.length < 80 * 16 && tries < 600) {
    tries++;
    var rx = sr(-280, 280), rz = sr(-280, 280);
    if (nearRoad(rx, rz)) continue;
    if (inSafePoint(rx, rz, -3)) continue;
    var rq = BABYLON.Quaternion.RotationYawPitchRoll(srnd() * 6.28, sr(0, 0.4), sr(0, 0.4));
    var rs = sr(0.5, 1.4);
    BABYLON.Matrix.Compose(new BABYLON.Vector3(rs, rs * sr(0.5, 0.8), rs), rq, new BABYLON.Vector3(rx, 0.15, rz)).toArray(rockBuf, rockBuf.length);
  }
  tries = 0;
  while (flowerBufs[0].length + flowerBufs[1].length + flowerBufs[2].length < 260 * 16 && tries < 1200) {
    tries++;
    var fx = sr(-280, 280), fz = sr(-280, 280);
    if (nearRoad(fx, fz)) continue;
    if (inSafePoint(fx, fz, -4)) continue;
    if (Math.hypot(fx, fz) < 175 && !(Math.abs(fx) < 44 && Math.abs(fz) < 44) && srnd() < 0.72) continue;
    var fq = BABYLON.Quaternion.RotationYawPitchRoll(srnd() * 6.28, 0, 0);
    var fs = sr(0.7, 1.3);
    var bucket = Math.floor(srnd() * 3);
    BABYLON.Matrix.Compose(new BABYLON.Vector3(fs, fs, fs), fq, new BABYLON.Vector3(fx, 0, fz)).toArray(flowerBufs[bucket], flowerBufs[bucket].length);
  }
  function thinSet(master, buf) {
    if (!master || !buf.length) return;
    master.thinInstanceSetBuffer('matrix', new Float32Array(buf), 16, true);
    master.thinInstanceRefreshBoundingInfo();
  }
  thinSet(tuftMaster, tuftBuf);
  thinSet(rockMaster, rockBuf);
  flowerBufs.forEach(function (buf, bi) { thinSet(flowerMasters[bi], buf); });

  var bushCount = 0;
  if (bushMaster) {
    for (var b = 0; b < 120; b++) {
      var bx = sr(-260, 260), bz = sr(-260, 260);
      if (nearRoad(bx, bz) || inSafePoint(bx, bz, 3)) continue;
      var instB = bushMaster.createInstance('bush_' + bushCount);
      instB.position.set(bx, 0, bz);
      var bs = sr(0.7, 1.3);
      instB.scaling.setAll(bs);
      addCircle(bx, bz, 0.7 * bs);
      bushCount++;
    }
  }

  var logParts = [];
  for (var lg = 0; lg < 7; lg++) {
    var lx = sr(-260, 260), lz = sr(-260, 260);
    if (!pointFree(lx, lz, 2)) continue;
    var log = cyl(0.65, 0.6, sr(3.4, 5), lx, 0.42, lz, '#92400e');
    log.rotation.z = Math.PI / 2;
    log.rotation.y = sr(0, 6.28);
    logParts.push(log);
    addCircle(lx, lz, 1.1);
  }
  for (var st2 = 0; st2 < 9; st2++) {
    var sx = sr(-260, 260), sz = sr(-260, 260);
    if (!pointFree(sx, sz, 1)) continue;
    logParts.push(cyl(0.75, 0.85, 0.55, sx, 0.27, sz, '#b45309'));
    addCircle(sx, sz, 0.6);
  }
  mergePainted(logParts);
}

function buildStreetProps() {
  var poleParts = [], bulbParts = [], hydParts = [], benchParts = [], dumpParts = [], tlParts = [], tlBulbs = [];
  ROADS.forEach(function (c) {
    for (var z = -230; z <= 230; z += 46) {
      var side = (z / 46) % 2 === 0 ? 1 : -1;
      var x = c + side * (ROAD_W / 2 + 2.2);
      poleParts.push(cyl(0.16, 0.2, 5, x, 2.5, z, '#1e293b'));
      poleParts.push(box(1.1, 0.12, 0.12, x - side * 0.45, 4.95, z, '#1e293b'));
      bulbParts.push(sph(0.32, x - side * 0.9, 4.85, z, '#fef08a'));
      addCircle(x, z, 0.28);
    }
    for (var x2 = -230; x2 <= 230; x2 += 46) {
      var side2 = (x2 / 46) % 2 === 0 ? 1 : -1;
      var z2 = c + side2 * (ROAD_W / 2 + 2.2);
      poleParts.push(cyl(0.16, 0.2, 5, x2, 2.5, z2, '#1e293b'));
      poleParts.push(box(0.12, 0.12, 1.1, x2, 4.95, z2 - side2 * 0.45, '#1e293b'));
      bulbParts.push(sph(0.32, x2, 4.85, z2 - side2 * 0.9, '#fef08a'));
      addCircle(x2, z2, 0.28);
    }
  });
  for (var hh = 0; hh < 12; hh++) {
    var hc = ROADS[Math.floor(srnd() * 4)];
    var hz = sr(-200, 200);
    var hx = hc + (srnd() > 0.5 ? 1 : -1) * (ROAD_W / 2 + 2.6);
    if (!pointFree(hx, hz, 0.5)) continue;
    hydParts.push(cyl(0.34, 0.4, 0.75, hx, 0.37, hz, '#ef4444', null, 10));
    hydParts.push(sph(0.4, hx, 0.8, hz, '#ef4444', null, 8));
    addCircle(hx, hz, 0.35);
  }
  function benchAt(x, z, ry) {
    var seat = box(1.8, 0.12, 0.55, x, 0.55, z, '#f59e0b');
    seat.rotation.y = ry;
    benchParts.push(seat);
    var bk = box(1.8, 0.5, 0.12, x - Math.sin(ry) * 0.28, 0.85, z - Math.cos(ry) * 0.28, '#f59e0b');
    bk.rotation.y = ry;
    benchParts.push(bk);
    benchParts.push(box(0.14, 0.5, 0.5, x + Math.cos(ry) * 0.7, 0.3, z - Math.sin(ry) * 0.7, '#1e293b'));
    benchParts.push(box(0.14, 0.5, 0.5, x - Math.cos(ry) * 0.7, 0.3, z + Math.sin(ry) * 0.7, '#1e293b'));
    addCircle(x, z, 1);
  }
  for (var bn = 0; bn < 10; bn++) {
    var bc = ROADS[Math.floor(srnd() * 4)];
    var bz2 = sr(-190, 190);
    var bx2 = bc + (srnd() > 0.5 ? 1 : -1) * (ROAD_W / 2 + 3.6);
    if (pointFree(bx2, bz2, 1.2)) benchAt(bx2, bz2, srnd() > 0.5 ? 0 : Math.PI / 2);
  }
  for (var dm = 0; dm < 8; dm++) {
    var dcx = sr(-180, 180), dcz = sr(-180, 180);
    if (!pointFree(dcx, dcz, 1.6)) continue;
    var dump = box(2.4, 1.5, 1.4, dcx, 0.75, dcz, '#10b981');
    dump.rotation.y = sr(0, 6.28);
    dumpParts.push(dump);
    addCircle(dcx, dcz, 1.5);
  }
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (tl) {
    var tx = tl[0] * 60.5, tz = tl[1] * 60.5;
    tlParts.push(cyl(0.18, 0.22, 4.6, tx, 2.3, tz, '#0f172a'));
    tlParts.push(box(0.5, 1.3, 0.5, tx - tl[0] * 0.4, 4.4, tz - tl[1] * 0.4, '#0f172a'));
    tlBulbs.push(sph(0.26, tx - tl[0] * 0.4, 4.75, tz - tl[1] * 0.4, '#ef4444'));
    addCircle(tx, tz, 0.3);
  });
  mergePainted(poleParts);
  var bulbMesh = mergePainted(bulbParts);
  if (bulbMesh) {
    var bm = new BABYLON.StandardMaterial('bulb', scene);
    bm.emissiveColor = new BABYLON.Color3(0.98, 0.90, 0.60);
    bm.diffuseColor = new BABYLON.Color3(0.4, 0.35, 0.2);
    bm.specularColor = BABYLON.Color3.Black();
    ALL_MATS.push(bm);
    bulbMesh.material = bm;
  }
  mergePainted(hydParts);
  mergePainted(benchParts);
  mergePainted(dumpParts);
  mergePainted(tlParts);
  var lb = mergePainted(tlBulbs);
  if (lb) lb.material = mat('#ef4444', { e: '#ef4444' });

  [[-95, 152.2], [95, -152.2], [152.2, -40], [-152.2, 40]].forEach(function (bs) {
    var horiz = Math.abs(bs[1]) > 150;
    var px = bs[0], pz = bs[1];
    var ax = horiz ? 1 : 0, az = horiz ? 0 : 1;
    var stopParts = [];
    stopParts.push(cyl(0.14, 0.16, 3, px - ax * 2, 1.5, pz - az * 2, '#1e293b'));
    stopParts.push(cyl(0.14, 0.16, 3, px + ax * 2, 1.5, pz + az * 2, '#1e293b'));
    stopParts.push(horiz ? box(5.4, 0.18, 2.6, px, 3.05, pz, '#38bdf8') : box(2.6, 0.18, 5.4, px, 3.05, pz, '#38bdf8'));
    stopParts.push(horiz ? box(2, 1.2, 1.4, px + 2.2, 1.6, pz, '#f59e0b') : box(1.4, 1.2, 2, px, 1.6, pz + 2.2, '#f59e0b'));
    var bsm = mergePainted(stopParts);
    if (bsm) OCCLUDERS.push(bsm);
    addCircle(px - ax * 2, pz - az * 2, 0.25);
    addCircle(px + ax * 2, pz + az * 2, 0.25);
  });
}

function buildCentralPark() {
  var parts = [];
  parts.push(cyl(7, 7, 0.6, 0, 0.3, 0, '#9aa0a2'));
  parts.push(cyl(4.6, 4.6, 0.7, 0, 0.85, 0, '#8a9092'));
  parts.push(cyl(2.4, 2.4, 1.5, 0, 1.9, 0, '#9aa0a2'));
  parts.push(cyl(1, 1.3, 1.6, 0, 3.4, 0, '#8a9092'));
  var fm = new BABYLON.StandardMaterial('water', scene);
  fm.diffuseColor = BABYLON.Color3.FromHexString('#4fc3e8');
  fm.emissiveColor = BABYLON.Color3.FromHexString('#1a6a8a');
  fm.alpha = 0.8;
  fm.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
  var w1 = BABYLON.MeshBuilder.CreateDisc('w1', { radius: 2.1, tessellation: 24 }, scene);
  w1.rotation.x = Math.PI / 2;
  w1.position.y = 1.22;
  w1.material = fm;
  var w2 = BABYLON.MeshBuilder.CreateDisc('w2', { radius: 0.8, tessellation: 18 }, scene);
  w2.rotation.x = Math.PI / 2;
  w2.position.y = 4.25;
  w2.material = fm;
  waterMats.push(fm);
  var base = mergePainted(parts);
  if (base) OCCLUDERS.push(base);
  addCircle(0, 0, 3.8);

  var pond = BABYLON.MeshBuilder.CreateDisc('pond', { radius: 9, tessellation: 26 }, scene);
  pond.scaling.z = 0.68;
  pond.rotation.x = Math.PI / 2;
  pond.position.set(20, 0.03, 17);
  pond.material = fm;

  var pathParts = [];
  for (var a = 0; a < Math.PI * 2; a += Math.PI / 8) {
    pathParts.push(discR(1.5, Math.cos(a) * 13, Math.sin(a) * 13, 0.015, '#b59a6e', 10));
  }
  mergePainted(pathParts);

  for (var b = 0; b < 6; b++) {
    var ba = (b / 6) * Math.PI * 2 + 0.3;
    var bx = Math.cos(ba) * 8.5, bz = Math.sin(ba) * 8.5;
    var bp = [];
    var seat = box(1.8, 0.12, 0.55, bx, 0.55, bz, '#8a6b4a');
    seat.rotation.y = ba + Math.PI / 2;
    bp.push(seat);
    var bk = box(1.8, 0.5, 0.12, bx - Math.cos(ba) * 0.3, 0.85, bz - Math.sin(ba) * 0.3, '#8a6b4a');
    bk.rotation.y = ba + Math.PI / 2;
    bp.push(bk);
    bp.push(box(0.14, 0.5, 0.5, bx + 0.5, 0.3, bz + 0.5, '#3f4550'));
    bp.push(box(0.14, 0.5, 0.5, bx - 0.5, 0.3, bz - 0.5, '#3f4550'));
    mergePainted(bp);
    addCircle(bx, bz, 1);
  }

  for (var t = 0; t < 12; t++) {
    var ta = (t / 12) * Math.PI * 2 + sr(-0.15, 0.15);
    var tr = sr(24, 34);
    var tx = Math.cos(ta) * tr, tz = Math.sin(ta) * tr;
    placeTree(treeMasters[t % 2], tx, tz, sr(0.9, 1.4));
  }
  var bushP = [];
  for (var bs = 0; bs < 8; bs++) {
    var bsa = sr(0, 6.28), bsr = sr(16, 30);
    bushP.push(sph(sr(1.2, 1.9), Math.cos(bsa) * bsr, 0.5, Math.sin(bsa) * bsr, ['#3f8f37', '#4f9f3f', '#377f30'][bs % 3]));
  }
  mergePainted(bushP);
  var flowerP = [];
  for (var fl = 0; fl < 40; fl++) {
    var fla = sr(0, 6.28), flr = sr(10, 34);
    flowerP.push(sph(0.3, Math.cos(fla) * flr, 0.25, Math.sin(fla) * flr, ['#ff8fb0', '#ffd34e', '#ffffff'][fl % 3]));
  }
  mergePainted(flowerP);
}

function buildBlocks() {
  var GRID = [-190, -100, 0, 100, 190];
  var safeCells = { '100,100': 1, '-100,-100': 1, '100,-100': 1, '-100,100': 1, '0,-190': 1, '0,190': 1 };
  var lotCells = { '190,190': 1, '-190,-190': 1 };
  GRID.forEach(function (gx) {
    GRID.forEach(function (gz) {
      if (gx === 0 && gz === 0) return;
      var key = gx + ',' + gz;
      if (safeCells[key]) {
        var ry;
        if (gx === 0) ry = gz > 0 ? Math.PI : 0;
        else if (gz === 0) ry = gx > 0 ? -Math.PI / 2 : Math.PI / 2;
        else ry = Math.atan2(gx, gz) + Math.PI;
        buildSafeHouse(gx, gz, ry);
        for (var ft = 0; ft < 3; ft++) {
          var fx = gx + sr(-8, 8), fz = gz + sr(-8, 8);
          placeTree(treeMasters[0], fx, fz, sr(0.7, 1.1));
        }
        return;
      }
      if (lotCells[key]) {
        var lineParts = [box(56, 0.05, 44, gx, 0.025, gz, '#5a5a60')];
        for (var ln = 0; ln < 6; ln++) {
          lineParts.push(box(0.25, 0.012, 6, gx - 20 + ln * 8, 0.06, gz, '#c9c9c9'));
        }
        mergePainted(lineParts);
        for (var cv = 0; cv < 5; cv++) {
          buildVehicle(gx - 20 + (cv % 3) * 16, gz - 12 + Math.floor(cv / 3) * 22, sr(-0.12, 0.12) + (cv % 2 ? Math.PI : 0), Math.floor(srnd() * 4));
        }
        var lp = mergePainted([
          cyl(0.18, 0.22, 6, gx + 22, 3, gz + 16, '#3f4550'),
          box(1.2, 0.12, 0.12, gx + 21.4, 5.9, gz + 16, '#3f4550')
        ]);
        var blb = sph(0.34, gx + 20.8, 5.8, gz + 16, '#ffe9b0');
        blb.material = mat('#ffe9b0', { e: '#8a744a' });
        addCircle(gx + 22, gz + 16, 0.3);
        return;
      }
      var nBuild = 2 + Math.floor(srnd() * 2);
      var placed = [];
      var attempts = 0;
      while (placed.length < nBuild && attempts < 26) {
        attempts++;
        var bw = sr(12, 21), bd = sr(12, 20), bh = sr(7, 22);
        if (srnd() < 0.2) bh = sr(16, 27);
        var bx = gx + sr(-23, 23), bz = gz + sr(-23, 23);
        var ok = Math.abs(bx - gx) + bw / 2 <= 31 && Math.abs(bz - gz) + bd / 2 <= 31;
        for (var pi = 0; pi < placed.length; pi++) {
          if (Math.abs(bx - placed[pi][0]) < (bw + placed[pi][2]) / 2 + 5 && Math.abs(bz - placed[pi][1]) < (bd + placed[pi][3]) / 2 + 5) ok = false;
        }
        if (!ok) continue;
        var ry2;
        if (Math.abs(bx - gx) > Math.abs(bz - gz)) ry2 = bx > gx ? -Math.PI / 2 : Math.PI / 2;
        else ry2 = bz > gz ? Math.PI : 0;
        ry2 += sr(-0.05, 0.05);
        var res = buildBuilding(bx, bz, bw, bd, bh, ry2);
        placed.push([bx, bz, res.w, res.d]);
        if (signIdx < SIGN_WORDS.length && srnd() < 0.4 && placed.length === 1) {
          addSign(bx, bz, ry2, bh);
        }
      }
      for (var cr = 0; cr < 2; cr++) {
        if (srnd() >= 0.55) continue;
        var side = srnd() > 0.5 ? 1 : -1;
        var road = ROADS[Math.floor(srnd() * 4)];
        var alongR = sr(-160, 160);
        var vx, vz, vry;
        if (srnd() < 0.5) { vx = road + side * (ROAD_W / 2 + 2.4); vz = alongR; vry = Math.PI / 2 + sr(-0.15, 0.15); }
        else { vz = road + side * (ROAD_W / 2 + 2.4); vx = alongR; vry = sr(-0.15, 0.15); }
        if (Math.hypot(vx, vz) > 32 && pointFree(vx, vz, 2.6)) buildVehicle(vx, vz, vry, Math.floor(srnd() * 4));
      }
    });
  });
}

function buildRuins() {
  for (var i = 0; i < 7; i++) {
    var a = sr(0, 6.28), r = sr(205, 265);
    var cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    if (inSafePoint(cx, cz, 16)) continue;
    var parts = [];
    var w1 = box(sr(5, 8), sr(2, 3.4), 0.6, cx, 1.2, cz, WALL_PAL[i % WALL_PAL.length]);
    w1.rotation.y = sr(0, 6.28);
    w1.rotation.z = sr(-0.06, 0.06);
    parts.push(w1);
    var w2 = box(sr(3, 5), sr(1.2, 2.2), 0.6, cx + sr(-4, 4), 0.8, cz + sr(-4, 4), WALL_PAL[(i + 2) % WALL_PAL.length]);
    w2.rotation.y = sr(0, 6.28);
    w2.rotation.z = sr(-0.1, 0.1);
    parts.push(w2);
    for (var rb = 0; rb < 6; rb++) {
      var rs = sr(0.3, 0.9);
      var rk = sph(rs, cx + sr(-5, 5), rs * 0.4, cz + sr(-5, 5), ['#9aa0a6', '#8a8f95', '#aab0b5'][rb % 3], null, 5);
      rk.rotation.set(sr(0, 3), sr(0, 3), sr(0, 3));
      parts.push(rk);
    }
    var merged = mergePainted(parts);
    if (merged) OCCLUDERS.push(merged);
    addCircle(cx, cz, 3.4);
  }
}

var skyDome = null;
var skyMat = null;
function buildSky() {
  try {
    skyDome = BABYLON.MeshBuilder.CreateSphere('skyDome', {
      diameter: 1800,
      segments: GFX_MOBILE ? 10 : 16,
      sideOrientation: BABYLON.Mesh.BACKSIDE
    }, scene);
    skyMat = new BABYLON.StandardMaterial('skyMat', scene);
    skyMat.diffuseColor = BABYLON.Color3.Black();
    skyMat.specularColor = BABYLON.Color3.Black();
    skyMat.emissiveColor = scene.clearColor.toColor3 ? scene.clearColor.toColor3() : new BABYLON.Color3(scene.clearColor.r, scene.clearColor.g, scene.clearColor.b);
    skyMat.disableLighting = true;
    skyMat.backFaceCulling = false;
    skyDome.material = skyMat;
    skyDome.isPickable = false;
    skyDome.infiniteDistance = true;
    // Exclude sky dome from glow layer to prevent bloom/glow
    if (typeof glowLayer !== 'undefined' && glowLayer && glowLayer.addExcludedMesh) {
      glowLayer.addExcludedMesh(skyDome);
    }
    UNFROZEN_MATS.push(skyMat);
  } catch (e) {
    skyDome = null;
    skyMat = null;
  }
  for (var i = 0; i < 12; i++) {
    var parts = [];
    var n = 4 + Math.floor(srnd() * 3);
    for (var s = 0; s < n; s++) {
      var cl = BABYLON.MeshBuilder.CreateSphere('', { diameter: sr(10, 20), segments: 8 }, scene);
      cl.position.set(sr(-10, 10), sr(-1.5, 1.5), sr(-4, 4));
      cl.scaling.y = 0.45;
      paint(cl, '#ffffff');
      parts.push(cl);
    }
    var m = mergePainted(parts);
    if (!m) continue;
    var cm = new BABYLON.StandardMaterial('cl' + i, scene);
    cm.diffuseColor = new BABYLON.Color3(0.98, 0.98, 1.0);
    cm.emissiveColor = BABYLON.Color3.Black();
    cm.specularColor = BABYLON.Color3.Black();
    ALL_MATS.push(cm);
    m.material = cm;
    m.position.set(sr(-340, 340), sr(55, 90), sr(-340, 340));
    // Exclude clouds from glow layer to prevent unwanted bloom
    if (typeof glowLayer !== 'undefined' && glowLayer && glowLayer.addExcludedMesh) {
      glowLayer.addExcludedMesh(m);
    }
    clouds.push({ m: m, v: sr(0.8, 2.0) });
  }
  var mtnCols = ['#22c55e', '#16a34a', '#15803d', '#059669'];
  for (var mo = 0; mo < 12; mo++) {
    var ma = (mo / 12) * Math.PI * 2 + sr(-0.12, 0.12);
    var mr = sr(365, 430);
    var mx = Math.cos(ma) * mr, mz = Math.sin(ma) * mr;
    var mh = sr(60, 135);
    var mbase = sr(70, 130);
    var cone = cyl(mbase, 0, mh, mx, mh / 2 - 4, mz, mtnCols[mo % mtnCols.length], null, 7);
    cone.rotation.y = sr(0, 6.28);
    var snow = cyl(mbase * 0.3, 0, mh * 0.24, mx, mh - mh * 0.1, mz, '#ffffff', null, 7);
    snow.rotation.y = cone.rotation.y;
    mergePainted([cone, snow]);
  }
}

function buildBloodDecals() {
  // Cartoon green slime/goo splats instead of realistic blood
  var splatParts = [];
  var splatColors = ['#22c55e', '#4ade80', '#a3e635', '#84cc16'];
  for (var i = 0; i < 30; i++) {
    var bx = sr(-260, 260), bz = sr(-260, 260);
    if (nearRoad(bx, bz) || Math.hypot(bx, bz) < 22) {
      var rad = sr(0.5, 1.4);
      var col = splatColors[Math.floor(srnd() * splatColors.length)];
      var bDisc = discR(rad, bx, bz, 0.025, col, 10);
      splatParts.push(bDisc);
      for (var d = 0; d < 2; d++) {
        var dx = bx + sr(-rad * 1.2, rad * 1.2);
        var dz = bz + sr(-rad * 1.2, rad * 1.2);
        splatParts.push(discR(sr(0.1, 0.25), dx, dz, 0.028, col, 6));
      }
    }
  }
  mergePainted(splatParts);
}

function buildWorld() {
  buildGroundAndRoads();
  treeMasters = buildTreeMasters();
  buildCentralPark();
  buildBlocks();
  buildRuins();
  buildBloodDecals();
  scatterTrees();
  buildScatterMasters();
  buildStreetProps();
  buildSky();
}

buildWorld();

// Freeze all materials after first render frame (shaders must compile first)
var _matsFrozen = false;
function freezeAllMaterials() {
  if (_matsFrozen) return;
  _matsFrozen = true;
  for (var i = 0; i < ALL_MATS.length; i++) {
    if (UNFROZEN_MATS.indexOf(ALL_MATS[i]) >= 0) continue;
    try { ALL_MATS[i].freeze(); } catch (e) {}
  }
  try { scene.blockMaterialDirtyMechanism = true; } catch (e) {}
}
