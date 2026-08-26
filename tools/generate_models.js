/**
 * Binary .GLB (glTF 2.0) 3D Model Asset Generator
 * Generates valid binary .glb 3D models with geometry, materials, and vertex attributes.
 */

const fs = require('fs');
const path = require('path');

function createGLB(meshName, boxes) {
  // Combine all boxes into a single mesh
  let allPositions = [];
  let allNormals = [];
  let allColors = [];
  let allIndices = [];
  let vertexOffset = 0;

  boxes.forEach(box => {
    const { minX, minY, minZ, maxX, maxY, maxZ, color } = box;
    const r = color[0], g = color[1], b = color[2], a = color[3] || 1.0;

    // 6 faces * 4 vertices = 24 vertices per box
    const faces = [
      // Front (+Z)
      { v: [[minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]], n: [0, 0, 1] },
      // Back (-Z)
      { v: [[maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ]], n: [0, 0, -1] },
      // Top (+Y)
      { v: [[minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ]], n: [0, 1, 0] },
      // Bottom (-Y)
      { v: [[minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ]], n: [0, -1, 0] },
      // Right (+X)
      { v: [[maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ]], n: [1, 0, 0] },
      // Left (-X)
      { v: [[minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ]], n: [-1, 0, 0] }
    ];

    faces.forEach(face => {
      face.v.forEach(pt => {
        allPositions.push(...pt);
        allNormals.push(...face.n);
        allColors.push(r, g, b, a);
      });
      allIndices.push(
        vertexOffset, vertexOffset + 1, vertexOffset + 2,
        vertexOffset, vertexOffset + 2, vertexOffset + 3
      );
      vertexOffset += 4;
    });
  });

  const posBuffer = Buffer.from(new Float32Array(allPositions).buffer);
  const normBuffer = Buffer.from(new Float32Array(allNormals).buffer);
  const colBuffer = Buffer.from(new Float32Array(allColors).buffer);
  const indBuffer = Buffer.from(new Uint16Array(allIndices).buffer);

  // Pad each buffer to 4-byte alignment
  function pad(buf) {
    const padLen = (4 - (buf.length % 4)) % 4;
    return padLen > 0 ? Buffer.concat([buf, Buffer.alloc(padLen)]) : buf;
  }

  const paddedPos = pad(posBuffer);
  const paddedNorm = pad(normBuffer);
  const paddedCol = pad(colBuffer);
  const paddedInd = pad(indBuffer);

  const binBuffer = Buffer.concat([paddedPos, paddedNorm, paddedCol, paddedInd]);

  // Compute min/max for position accessor
  let minPos = [Infinity, Infinity, Infinity];
  let maxPos = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < allPositions.length; i += 3) {
    minPos[0] = Math.min(minPos[0], allPositions[i]);
    minPos[1] = Math.min(minPos[1], allPositions[i + 1]);
    minPos[2] = Math.min(minPos[2], allPositions[i + 2]);
    maxPos[0] = Math.max(maxPos[0], allPositions[i]);
    maxPos[1] = Math.max(maxPos[1], allPositions[i + 1]);
    maxPos[2] = Math.max(maxPos[2], allPositions[i + 2]);
  }

  const posOffset = 0;
  const normOffset = paddedPos.length;
  const colOffset = normOffset + paddedNorm.length;
  const indOffset = colOffset + paddedCol.length;

  const numVertices = allPositions.length / 3;
  const numIndices = allIndices.length;

  const gltf = {
    asset: { version: '2.0', generator: 'Zombie Land 3D Model Pipeline' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: meshName, mesh: 0 }],
    meshes: [{
      name: meshName,
      primitives: [{
        attributes: {
          POSITION: 0,
          NORMAL: 1,
          COLOR_0: 2
        },
        indices: 3,
        material: 0
      }]
    }],
    materials: [{
      name: 'Mat_' + meshName,
      pbrMetallicRoughness: {
        metallicFactor: 0.35,
        roughnessFactor: 0.65
      }
    }],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: numVertices, type: 'VEC3', min: minPos, max: maxPos }, // POSITION (Float)
      { bufferView: 1, byteOffset: 0, componentType: 5126, count: numVertices, type: 'VEC3' },                           // NORMAL (Float)
      { bufferView: 2, byteOffset: 0, componentType: 5126, count: numVertices, type: 'VEC4' },                           // COLOR_0 (Float)
      { bufferView: 3, byteOffset: 0, componentType: 5123, count: numIndices, type: 'SCALAR', min: [0], max: [numVertices - 1] } // INDICES (Uint16)
    ],
    bufferViews: [
      { buffer: 0, byteOffset: posOffset, byteLength: posBuffer.length, target: 34962 },
      { buffer: 0, byteOffset: normOffset, byteLength: normBuffer.length, target: 34962 },
      { buffer: 0, byteOffset: colOffset, byteLength: colBuffer.length, target: 34962 },
      { buffer: 0, byteOffset: indOffset, byteLength: indBuffer.length, target: 34963 }
    ],
    buffers: [{ byteLength: binBuffer.length }]
  };

  const jsonStr = JSON.stringify(gltf);
  let jsonBuffer = Buffer.from(jsonStr, 'utf8');
  const jsonPad = (4 - (jsonBuffer.length % 4)) % 4;
  if (jsonPad > 0) {
    jsonBuffer = Buffer.concat([jsonBuffer, Buffer.from(' '.repeat(jsonPad), 'utf8')]);
  }

  // GLB Header (12 bytes)
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);          // version 2
  const totalLength = 12 + 8 + jsonBuffer.length + 8 + binBuffer.length;
  header.writeUInt32LE(totalLength, 8);

  // JSON Chunk Header (8 bytes)
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuffer.length, 0);
  jsonHeader.writeUInt32LE(0x4E4F534A, 4); // 'JSON'

  // BIN Chunk Header (8 bytes)
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binBuffer.length, 0);
  binHeader.writeUInt32LE(0x004E4942, 4); // 'BIN\0'

  return Buffer.concat([header, jsonHeader, jsonBuffer, binHeader, binBuffer]);
}

// -------------------------------------------------------------
// Helper to construct box parts
// -------------------------------------------------------------
function b(cx, cy, cz, sx, sy, sz, color) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  return {
    minX: cx - hx, maxX: cx + hx,
    minY: cy - hy, maxY: cy + hy,
    minZ: cz - hz, maxZ: cz + hz,
    color: color
  };
}

const outDir = path.join(__dirname, '../assets/models');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// 1. Tactical 9mm Pistol (.glb)
const pistolBoxes = [
  b(0, 0.08, 0, 0.05, 0.07, 0.28, [0.12, 0.14, 0.15]),     // Slide
  b(0, 0.03, -0.04, 0.04, 0.14, 0.07, [0.18, 0.15, 0.12]),  // Grip
  b(0, 0.04, 0.05, 0.04, 0.04, 0.16, [0.1, 0.1, 0.12]),     // Frame
  b(0, 0.12, 0.12, 0.012, 0.015, 0.015, [0.0, 1.0, 0.3]),   // Tritium Front Sight (Glowing Green)
  b(-0.018, 0.12, -0.12, 0.01, 0.015, 0.01, [0.0, 1.0, 0.3]), // Tritium Rear Left
  b(0.018, 0.12, -0.12, 0.01, 0.015, 0.01, [0.0, 1.0, 0.3]),  // Tritium Rear Right
  b(0, 0.01, 0.10, 0.03, 0.03, 0.08, [0.15, 0.15, 0.16])    // Tactical Light Module
];
fs.writeFileSync(path.join(outDir, 'weapon_pistol.glb'), createGLB('weapon_pistol', pistolBoxes));

// 2. AR-15 / M4 Assault Rifle (.glb)
const rifleBoxes = [
  b(0, 0.06, 0, 0.06, 0.09, 0.32, [0.15, 0.16, 0.18]),      // Upper/Lower Receiver
  b(0, 0.06, 0.28, 0.045, 0.045, 0.34, [0.1, 0.12, 0.12]),  // Quad Rail Handguard
  b(0, 0.06, 0.48, 0.025, 0.025, 0.14, [0.2, 0.22, 0.24]),  // Barrel & Flash Hider
  b(0, 0.06, -0.28, 0.05, 0.12, 0.26, [0.12, 0.13, 0.14]),  // Crane Stock
  b(0, -0.02, -0.06, 0.04, 0.15, 0.06, [0.18, 0.16, 0.14]), // Pistol Grip
  b(0, -0.06, 0.06, 0.035, 0.22, 0.09, [0.22, 0.22, 0.25]), // 30-round Mag
  b(0, 0.14, 0.02, 0.045, 0.065, 0.12, [0.08, 0.08, 0.08]), // Holographic Sight
  b(0, 0.15, 0.02, 0.03, 0.04, 0.01, [0.0, 1.0, 0.5]),      // Glowing Reticle Lens
  b(0, -0.02, 0.30, 0.035, 0.12, 0.045, [0.1, 0.1, 0.1])    // Vertical Foregrip
];
fs.writeFileSync(path.join(outDir, 'weapon_rifle.glb'), createGLB('weapon_rifle', rifleBoxes));

// 3. 12-Gauge Tactical Shotgun (.glb)
const shotgunBoxes = [
  b(0, 0.05, 0, 0.06, 0.08, 0.34, [0.16, 0.17, 0.19]),       // Receiver
  b(0, 0.07, 0.35, 0.035, 0.035, 0.46, [0.22, 0.24, 0.25]),  // Barrel
  b(0, 0.03, 0.32, 0.03, 0.03, 0.40, [0.18, 0.18, 0.18]),    // Magazine Tube
  b(0, 0.03, 0.26, 0.055, 0.055, 0.22, [0.12, 0.12, 0.14]),  // Pump Forearm
  b(0, 0.03, -0.28, 0.05, 0.11, 0.28, [0.14, 0.13, 0.12]),   // Stock
  b(0, -0.03, -0.04, 0.04, 0.12, 0.06, [0.18, 0.16, 0.15])   // Grip
];
fs.writeFileSync(path.join(outDir, 'weapon_shotgun.glb'), createGLB('weapon_shotgun', shotgunBoxes));

// 4. Survivor Player Character (.glb)
const survivorBoxes = [
  b(0, 1.68, 0, 0.24, 0.26, 0.24, [0.88, 0.68, 0.52]),     // Head
  b(0, 1.76, 0.04, 0.26, 0.12, 0.32, [0.22, 0.28, 0.24]),   // Ballistic Cap
  b(0, 1.25, 0, 0.48, 0.60, 0.32, [0.28, 0.36, 0.30]),     // Tactical Torso / Flak Jacket
  b(0, 1.25, 0.14, 0.44, 0.38, 0.10, [0.18, 0.22, 0.19]),  // MOLLE Mag Pouches
  b(0, 1.30, -0.20, 0.40, 0.46, 0.22, [0.35, 0.28, 0.20]), // Survival Backpack
  b(-0.32, 1.25, 0, 0.16, 0.58, 0.16, [0.28, 0.36, 0.30]), // Left Arm
  b(0.32, 1.25, 0, 0.16, 0.58, 0.16, [0.28, 0.36, 0.30]),  // Right Arm
  b(-0.16, 0.50, 0, 0.18, 0.88, 0.18, [0.18, 0.22, 0.20]), // Left Leg
  b(0.16, 0.50, 0, 0.18, 0.88, 0.18, [0.18, 0.22, 0.20]),  // Right Leg
  b(-0.16, 0.08, 0.04, 0.20, 0.16, 0.28, [0.12, 0.12, 0.14]), // Combat Boot Left
  b(0.16, 0.08, 0.04, 0.20, 0.16, 0.28, [0.12, 0.12, 0.14])   // Combat Boot Right
];
fs.writeFileSync(path.join(outDir, 'player_survivor.glb'), createGLB('player_survivor', survivorBoxes));

// 5. Realistic Walker Zombie (.glb)
const zombieBoxes = [
  b(0, 1.66, 0, 0.24, 0.26, 0.24, [0.35, 0.44, 0.32]),      // Infected Rotten Head
  b(-0.06, 1.70, 0.13, 0.04, 0.04, 0.02, [0.95, 0.85, 0.1]), // Glowing Infected Eye Left
  b(0.06, 1.70, 0.13, 0.04, 0.04, 0.02, [0.95, 0.85, 0.1]),  // Glowing Infected Eye Right
  b(0, 1.25, 0, 0.46, 0.58, 0.28, [0.28, 0.26, 0.32]),      // Tattered Shirt
  b(0, 1.20, 0.12, 0.22, 0.26, 0.06, [0.45, 0.08, 0.08]),   // Bloody Chest Wound
  b(-0.32, 1.25, 0.20, 0.15, 0.56, 0.15, [0.35, 0.44, 0.32]), // Reaching Out Arm Left
  b(0.32, 1.25, 0.20, 0.15, 0.56, 0.15, [0.35, 0.44, 0.32]),  // Reaching Out Arm Right
  b(-0.16, 0.50, 0, 0.18, 0.88, 0.18, [0.20, 0.22, 0.24]),  // Ragged Pants Left
  b(0.16, 0.50, 0, 0.18, 0.88, 0.18, [0.20, 0.22, 0.24])    // Ragged Pants Right
];
fs.writeFileSync(path.join(outDir, 'zombie_walker.glb'), createGLB('zombie_walker', zombieBoxes));

console.log('✔ Successfully generated binary .GLB 3D models in assets/models/');
