// Sunset Bay — city.js
// Procedural sun-soaked coastal city: road grid, buildings with lit windows,
// sidewalks, lamps, trees and props. All geometry is generated from a seed,
// so every load of the same seed shows the same city. Original art, no
// assets from any other game.
(function () {
  'use strict';

  var U = window.SB.util;

  // City layout constants.
  var PITCH = 52;        // distance between road center lines
  var ROAD_W = 14;       // road width
  var GRID = 9;          // roads per axis (centers at -208..208)
  var HALF = 208;        // farthest road center from origin
  var CITY_HALF = 234;   // outer edge of the outermost blocks

  function roadCenters() {
    var arr = [];
    for (var i = 0; i < GRID; i++) arr.push(-HALF + i * PITCH);
    return arr;
  }

  /** Canvas texture for a building facade: windows in a warm sunset palette. */
  function facadeTexture(rng, base, lit) {
    return U.canvasTexture(128, 256, function (g, w, h) {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      // Subtle vertical shading.
      var grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.25)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
      grad.addColorStop(1, 'rgba(0,0,0,0.25)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      // Window grid, some lit warm yellow.
      var cols = 6, rows = 12;
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var wx = 8 + x * 19, wy = 10 + y * 20;
          if (rng() < lit) {
            g.fillStyle = rng() < 0.5 ? '#ffd98a' : '#ffe9b8';
          } else {
            g.fillStyle = 'rgba(20,30,50,0.85)';
          }
          g.fillRect(wx, wy, 12, 12);
        }
      }
    });
  }

  /** Canvas texture for a road strip: asphalt with a dashed center line. */
  function roadTexture() {
    return U.canvasTexture(128, 128, function (g, w, h) {
      g.fillStyle = '#41444d';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      for (var i = 0; i < 40; i++) {
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      g.fillStyle = '#d8c25a';
      g.fillRect(w / 2 - 2, 0, 4, 34);
      g.fillRect(w / 2 - 2, 64, 4, 34);
    });
  }

  function buildCity(scene, seed, opts) {
    opts = opts || {};
    var night = !!opts.night;
    var rng = U.mulberry32(seed);
    var group = new THREE.Group();
    group.name = 'Sunset Bay city';
    var colliders = [];
    var centers = roadCenters();
    var roadTex = roadTexture();
    roadTex.wrapS = THREE.RepeatWrapping;
    roadTex.wrapT = THREE.RepeatWrapping;

    // Ground: warm sand-colored base under everything.
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY_HALF * 2 + 120, CITY_HALF * 2 + 120),
      new THREE.MeshLambertMaterial({ color: 0x9a8a68 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    group.add(ground);

    // Roads: long strips along each center line, both axes.
    centers.forEach(function (c) {
      var mat = new THREE.MeshLambertMaterial({ map: roadTex.clone() });
      mat.map.needsUpdate = true;
      mat.map.repeat.set(1, 18);
      var rx = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2 + 60, ROAD_W), mat);
      rx.rotation.x = -Math.PI / 2;
      rx.rotation.z = Math.PI / 2;
      rx.position.set(c, 0.0, 0);
      rx.receiveShadow = true;
      group.add(rx);
      var mat2 = mat.clone();
      mat2.map = roadTex.clone();
      mat2.map.needsUpdate = true;
      mat2.map.repeat.set(18, 1);
      var rz = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2 + 60, ROAD_W), mat2);
      rz.rotation.x = -Math.PI / 2;
      rz.position.set(0, 0.01, c);
      rz.receiveShadow = true;
      group.add(rz);
    });

    // Sidewalk blocks + buildings between the roads.
    var palette = ['#b98a5e', '#7e93a8', '#a87f6d', '#8fa08a', '#c2a06a', '#96708a', '#6d8a9c', '#b5b0a0'];
    var facades = palette.map(function (c) { return facadeTexture(rng, c, night ? 0.65 : 0.28); });
    var towers = []; // tall downtown buildings, for neon signs at night
    var blocks = [];
    for (var ix = 0; ix < GRID - 1; ix++) {
      for (var iz = 0; iz < GRID - 1; iz++) {
        var x0 = centers[ix] + ROAD_W / 2;
        var z0 = centers[iz] + ROAD_W / 2;
        var w = PITCH - ROAD_W, d = PITCH - ROAD_W;
        var cx = x0 + w / 2, cz = z0 + d / 2;
        // Sidewalk slab.
        var slab = new THREE.Mesh(
          new THREE.BoxGeometry(w, 0.3, d),
          new THREE.MeshLambertMaterial({ color: 0x9a938a })
        );
        slab.position.set(cx, 0.15, cz);
        slab.receiveShadow = true;
        group.add(slab);
        blocks.push({ x: cx, z: cz, w: w, d: d });
        // 1-3 buildings per block, placed on a sub-grid with gaps.
        // Height follows the district: downtown towers, low residential
        // houses near the edges, low marina blocks in the south.
        var downtown = Math.abs(cx) < 104 && cz < 0;
        var residential = Math.abs(cx) > 130 || cz > 130;
        var n = 1 + Math.floor(rng() * 3);
        for (var b = 0; b < n; b++) {
          var bw = 10 + rng() * 12, bd = 10 + rng() * 12;
          var bx = cx + (rng() - 0.5) * (w - bw - 4);
          var bz = cz + (rng() - 0.5) * (d - bd - 4);
          var bh = downtown ? 18 + rng() * rng() * 38
            : residential ? 6 + rng() * 10
            : 9 + rng() * rng() * 30;
          var tex = facades[Math.floor(rng() * facades.length)];
          var mats = [];
          for (var f = 0; f < 6; f++) {
            // Facade on the four sides (+x,-x,+z,-z); plain roof and floor.
            var isSide = (f === 0 || f === 1 || f === 4 || f === 5);
            mats.push(new THREE.MeshLambertMaterial({
              color: isSide ? 0xffffff : 0x555049,
              map: isSide ? tex : null
            }));
          }
          var bmesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mats);
          bmesh.position.set(bx, 0.3 + bh / 2, bz);
          bmesh.castShadow = true;
          bmesh.receiveShadow = true;
          group.add(bmesh);
          colliders.push({ minX: bx - bw / 2, maxX: bx + bw / 2, minZ: bz - bd / 2, maxZ: bz + bd / 2 });
          // Rooftop box (AC unit / water tank) on tall buildings.
          if (bh > 22 && rng() < 0.6) {
            var roof = new THREE.Mesh(
              new THREE.BoxGeometry(4, 2.4, 4),
              new THREE.MeshLambertMaterial({ color: 0x6a655c })
            );
            roof.position.set(bx + bw / 4, 0.3 + bh + 1.2, bz - bd / 4);
            group.add(roof);
          }
          if (downtown && bh > 26) towers.push({ x: bx, z: bz, h: bh, w: bw, d: bd });
        }
      }
    }

    // Neon signs on downtown towers (night mode): glowing original signs.
    if (night) {
      var NEON = [
        { text: 'SUNSET', color: '#ff5ad0' },
        { text: 'NEON BAY', color: '#37e0ff' },
        { text: 'HOTEL', color: '#ffd23b' },
        { text: '24H TACOS', color: '#ff7a3b' },
        { text: 'BAR', color: '#7dff5a' },
        { text: 'CASINO', color: '#c05aff' }
      ];
      towers.slice(0, 8).forEach(function (t, i) {
        var spec = NEON[i % NEON.length];
        var tex = U.canvasTexture(256, 64, function (g, w, h) {
          g.fillStyle = '#0a0a14';
          g.fillRect(0, 0, w, h);
          g.font = 'bold 40px sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.shadowColor = spec.color;
          g.shadowBlur = 18;
          g.fillStyle = spec.color;
          g.fillText(spec.text, w / 2, h / 2);
        });
        var sign = new THREE.Mesh(
          new THREE.PlaneGeometry(10, 2.5),
          new THREE.MeshBasicMaterial({ map: tex })
        );
        // Face the nearest road (south face for simplicity).
        sign.position.set(t.x, Math.min(t.h * 0.7, 34), t.z + t.d / 2 + 0.15);
        group.add(sign);
      });
    }

    // Street lamps along the roads.
    var lampMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
    var lampGlow = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    centers.forEach(function (c) {
      for (var k = -HALF; k <= HALF; k += PITCH) {
        [[c + ROAD_W / 2 + 1, k], [c - ROAD_W / 2 - 1, k]].forEach(function (p) {
          var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), lampMat);
          pole.position.set(p[0], 3, p[1]);
          group.add(pole);
          var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampGlow);
          bulb.position.set(p[0], 6.1, p[1]);
          group.add(bulb);
        });
      }
    });

    // Palm trees on random blocks: trunk + crossed frond planes.
    var trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
    var frondMat = new THREE.MeshLambertMaterial({ color: 0x3f7a3a, side: THREE.DoubleSide });
    blocks.forEach(function (blk) {
      if (rng() < 0.55) {
        var n = 1 + Math.floor(rng() * 3);
        for (var t = 0; t < n; t++) {
          var tx = blk.x + (rng() - 0.5) * (blk.w - 8);
          var tz = blk.z + (rng() - 0.5) * (blk.d - 8);
          var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 5, 6), trunkMat);
          trunk.position.set(tx, 0.3 + 2.5, tz);
          trunk.castShadow = true;
          group.add(trunk);
          for (var f = 0; f < 5; f++) {
            var frond = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), frondMat);
            frond.position.set(tx, 0.3 + 5.1, tz);
            frond.rotation.y = (f / 5) * Math.PI * 2;
            frond.rotation.z = 0.5;
            frond.translateY(0.4);
            group.add(frond);
          }
        }
      }
    });

    // Marina strip on the south edge: water plane + pier + boats.
    var water = new THREE.Mesh(
      new THREE.PlaneGeometry(320, 60),
      new THREE.MeshLambertMaterial({ color: 0x2e6f8e })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.02, CITY_HALF + 42);
    group.add(water);
    var pier = new THREE.Mesh(
      new THREE.BoxGeometry(120, 0.6, 8),
      new THREE.MeshLambertMaterial({ color: 0x8a6a44 })
    );
    pier.position.set(-40, 0.3, CITY_HALF + 14);
    group.add(pier);
    for (var s = 0; s < 5; s++) {
      var hull = new THREE.Mesh(
        new THREE.BoxGeometry(7, 1.6, 2.6),
        new THREE.MeshLambertMaterial({ color: [0xe8e8e8, 0xc23b3b, 0x3b7ac2, 0xe8c23b, 0x4a9a5a][s] })
      );
      hull.position.set(-90 + s * 26, 0.4, CITY_HALF + 34 + (s % 2) * 8);
      hull.rotation.y = (rng() - 0.5) * 0.3;
      group.add(hull);
    }

    scene.add(group);

    // District names by quadrant, for the HUD minimap flavor.
    function districtAt(x, z) {
      if (z > CITY_HALF) return 'Marina';
      if (x < -80 && z < -80) return 'Old Town';
      if (x > 80 && z < -80) return 'Uptown';
      if (x < -80) return 'Westside';
      if (x > 80) return 'East End';
      if (z < -80) return 'Downtown';
      if (z > 80) return 'South Beach';
      return 'Midtown';
    }

    // A point on a road, for spawning cars and the player.
    function roadPoint(rngFn) {
      var c = centers[Math.floor(rngFn() * centers.length)];
      var along = (rngFn() * 2 - 1) * HALF;
      if (rngFn() < 0.5) return { x: c, z: along };
      return { x: along, z: c };
    }

    return {
      group: group,
      colliders: colliders,
      centers: centers,
      pitch: PITCH,
      roadWidth: ROAD_W,
      half: HALF,
      cityHalf: CITY_HALF,
      districtAt: districtAt,
      roadPoint: roadPoint
    };
  }

  window.SB.city = { buildCity: buildCity, PITCH: PITCH, ROAD_W: ROAD_W, GRID: GRID, HALF: HALF, CITY_HALF: CITY_HALF };
})();
