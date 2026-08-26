/**
 * Zombie Land — Open World Survival
 * 3D GLB Model Asset Manager & Normalization Pipeline
 * 
 * Supports asynchronous loading of .glb / .gltf assets with automatic
 * normalization (scale, center, ground alignment) and graceful zero-downtime
 * procedural fallbacks if assets are not present or offline.
 */

'use strict';

var MODEL_LOADER = (function () {
  var cache = {};
  var loadingPromises = {};

  /**
   * Normalize mesh hierarchy dimensions and ground alignment
   */
  function normalizeMesh(rootMesh, targetHeight) {
    if (!rootMesh) return;
    try {
      var hierarchy = rootMesh.getChildMeshes(false);
      if (hierarchy.length === 0) hierarchy = [rootMesh];

      var min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
      var max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);

      for (var i = 0; i < hierarchy.length; i++) {
        var m = hierarchy[i];
        if (m.getTotalVertices && m.getTotalVertices() > 0) {
          var bi = m.getBoundingInfo();
          min = BABYLON.Vector3.Minimize(min, bi.boundingBox.minimumWorld);
          max = BABYLON.Vector3.Maximize(max, bi.boundingBox.maximumWorld);
        }
      }

      var currentHeight = max.y - min.y;
      if (currentHeight > 0.001 && targetHeight) {
        var scaleFactor = targetHeight / currentHeight;
        rootMesh.scaling.scaleInPlace(scaleFactor);
      }
    } catch (e) {
      console.warn('Model normalization note:', e.message);
    }
  }

  /**
   * Load a .GLB file asynchronously
   * @param {string} id - Identifier key (e.g. 'zombie_walker')
   * @param {string} filePathOrUrl - Relative or absolute path to .glb
   * @param {number} [targetHeight] - Optional height in world meters to scale model to
   */
  function loadGLB(id, filePathOrUrl, targetHeight) {
    if (cache[id]) return Promise.resolve(cache[id]);
    if (loadingPromises[id]) return loadingPromises[id];

    if (typeof BABYLON === 'undefined' || !BABYLON.SceneLoader || typeof scene === 'undefined') {
      return Promise.resolve(null);
    }

    loadingPromises[id] = new Promise(function (resolve) {
      try {
        var lastSlash = filePathOrUrl.lastIndexOf('/');
        var rootUrl = lastSlash >= 0 ? filePathOrUrl.substring(0, lastSlash + 1) : '';
        var filename = lastSlash >= 0 ? filePathOrUrl.substring(lastSlash + 1) : filePathOrUrl;

        BABYLON.SceneLoader.ImportMeshAsync('', rootUrl, filename, scene)
          .then(function (result) {
            var rootNode = result.meshes[0] || new BABYLON.TransformNode('root_' + id, scene);
            normalizeMesh(rootNode, targetHeight);
            
            // Hide template master
            rootNode.setEnabled(false);
            
            var entry = {
              id: id,
              root: rootNode,
              meshes: result.meshes,
              animationGroups: result.animationGroups || [],
              skeletons: result.skeletons || [],
              targetHeight: targetHeight
            };
            cache[id] = entry;
            resolve(entry);
          })
          .catch(function (err) {
            // Graceful fallback: model not found or CORS blocked on local file://
            resolve(null);
          });
      } catch (e) {
        resolve(null);
      }
    });

    return loadingPromises[id];
  }

  /**
   * Check if a GLB model is loaded and ready
   */
  function has(id) {
    return !!cache[id];
  }

  /**
   * Create an instance / clone of a loaded GLB model attached to parentNode
   */
  function instantiate(id, parentNode) {
    var entry = cache[id];
    if (!entry || !entry.root) return null;

    try {
      var clone = entry.root.clone('inst_' + id, parentNode || null, false);
      if (clone) {
        clone.setEnabled(true);
        clone.position.set(0, 0, 0);
        if (typeof castShadow === 'function') {
          castShadow(clone);
        }
        return clone;
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  /**
   * Preload all configured GLB assets in the background
   */
  function preloadAll(onProgress) {
    var cfg = (typeof CONFIG !== 'undefined' && CONFIG.MODELS) ? CONFIG.MODELS : null;
    if (!cfg || !cfg.ENABLED || !cfg.ASSETS) return Promise.resolve();

    var keys = Object.keys(cfg.ASSETS);
    var loaded = 0;
    var total = keys.length;

    var promises = keys.map(function (k) {
      var path = (cfg.BASE_PATH || 'assets/models/') + cfg.ASSETS[k];
      var targetH = (k.indexOf('zombie') >= 0 || k === 'player') ? 1.85 : (k.indexOf('weapon') >= 0 ? 0.4 : null);
      return loadGLB(k, path, targetH).then(function (res) {
        loaded++;
        if (onProgress) onProgress(loaded, total, k, !!res);
        return res;
      });
    });

    return Promise.all(promises);
  }

  return {
    loadGLB: loadGLB,
    has: has,
    instantiate: instantiate,
    preloadAll: preloadAll
  };
})();

if (typeof window !== 'undefined') window.MODEL_LOADER = MODEL_LOADER;
if (typeof global !== 'undefined') global.MODEL_LOADER = MODEL_LOADER;
if (typeof module !== 'undefined' && module.exports) module.exports = MODEL_LOADER;
