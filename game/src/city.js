// Sunset Bay — city.js
// The fictional coastal city: road grid, buildings, beach, neon district,
// streetlights, palms, and the day/night cycle. Exposes colliders and the
// road graph that traffic, police and missions drive on.
(function (global) {
  'use strict';
  var SB = global.SB;
  var U = SB.util;
  var THREE = global.THREE;

  var ROAD_COORDS = [-168, -120, -72, -24, 24, 72, 120, 168];
  var ROAD_HALF = 6;
  var BLOCK_CENTERS = [-144, -96, -48, 0, 48, 96, 144];
  var CITY_HALF = 192;

  function makeCanvas(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function buildingTextures(rng) {
    var out = [];
    for (var v = 0; v < 3; v++) {
      var tex = makeCanvas(128, 256, function (g, w, h) {
        g.fillStyle = ['#5a6068', '#6b5a52', '#4e5a68'][v];
        g.fillRect(0, 0, w, h);
        for (var y = 8; y < h - 8; y += 18) {
          for (var x = 8; x < w - 8; x += 16) {
            var lit = rng() < 0.42;
            g.fillStyle = lit ? '#ffd98a' : '#20262e';
            g.fillRect(x, y, 10, 12);
          }
        }
      });
      out.push(tex);
    }
    return out;
  }

  function roadTexture() {
    return makeCanvas(128, 128, function (g, w, h) {
      g.fillStyle = '#2b2e33';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#3a3d42';
      for (var i = 0; i < 400; i++) {
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      g.fillStyle = '#d8c95a';
      g.fillRect(w / 2 - 2, 0, 4, 34);
      g.fillRect(w / 2 - 2, 64, 4, 34);
      g.fillStyle = '#c8c8c8';
      g.fillRect(4, 0, 3, h);
      g.fillRect(w - 7, 0, 3, h);
    });
  }

  function neonTexture(text, color) {
    return makeCanvas(256, 96, function (g, w, h) {
      g.fillStyle = '#0a0a12';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = color;
      g.lineWidth = 4;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.font = 'bold 44px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = color;
      g.shadowBlur = 18;
      g.fillStyle = color;
      g.fillText(text, w / 2, h / 2 + 2);
    });
  }

  function City(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = []; // {minX,maxX,minZ,maxZ}
    this.neonMats = [];
    this.windowMats = [];
    this.lampMats = [];
    this.sun = null;
    this.hemi = null;
    this.water = null;
    this.build();
  }

  City.prototype.addCollider = function (x, z, w, d) {
    var b = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
    this.colliders.push(b);
    return b;
  };

  City.prototype.removeCollider = function (b) {
    var i = this.colliders.indexOf(b);
    if (i >= 0) this.colliders.splice(i, 1);
  };

  City.prototype.collides = function (x, z, r) {
    var c = this.colliders;
    for (var i = 0; i < c.length; i++) {
      var b = c[i];
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return b;
    }
    return null;
  };

  // Push a circle out of any building AABB it overlaps.
  City.prototype.resolveCircle = function (pos, r) {
    var b = this.collides(pos.x, pos.z, r);
    if (!b) return false;
    var dxl = pos.x - (b.minX - r), dxr = (b.maxX + r) - pos.x;
    var dzl = pos.z - (b.minZ - r), dzr = (b.maxZ + r) - pos.z;
    var m = Math.min(dxl, dxr, dzl, dzr);
    if (m === dxl) pos.x = b.minX - r;
    else if (m === dxr) pos.x = b.maxX + r;
    else if (m === dzl) pos.z = b.minZ - r;
    else pos.z = b.maxZ + r;
    return true;
  };

  City.prototype.isOnRoad = function (x, z) {
    for (var i = 0; i < ROAD_COORDS.length; i++) {
      if (Math.abs(x - ROAD_COORDS[i]) < ROAD_HALF + 1) return true;
      if (Math.abs(z - ROAD_COORDS[i]) < ROAD_HALF + 1) return true;
    }
    return false;
  };

  City.prototype.nearestRoadCoord = function (v) {
    var best = ROAD_COORDS[0], bd = 1e9;
    for (var i = 0; i < ROAD_COORDS.length; i++) {
      var d = Math.abs(v - ROAD_COORDS[i]);
      if (d < bd) { bd = d; best = ROAD_COORDS[i]; }
    }
    return best;
  };

  City.prototype.randomRoadPoint = function (rng) {
    var c = U.pick(rng, ROAD_COORDS);
    var along = U.randRange(rng, -CITY_HALF + 8, CITY_HALF - 8);
    if (rng() < 0.5) return { x: c + (rng() < 0.5 ? -3 : 3), z: along, axis: 'z' };
    return { x: along, z: c + (rng() < 0.5 ? -3 : 3), axis: 'x' };
  };

  City.prototype.build = function () {
    var scene = this.scene, rng = this.rng;
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshLambertMaterial({ color: 0x3d4a38 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    scene.add(ground);

    // Roads: dark strips with dashed centre lines, one plane per road line.
    var rTex = roadTexture();
    rTex.wrapS = rTex.wrapT = THREE.RepeatWrapping;
    var roadMat = new THREE.MeshLambertMaterial({ map: rTex });
    var roadGeoX = new THREE.PlaneGeometry(CITY_HALF * 2 + 24, ROAD_HALF * 2);
    var roadGeoZ = new THREE.PlaneGeometry(ROAD_HALF * 2, CITY_HALF * 2 + 24);
    for (var i = 0; i < ROAD_COORDS.length; i++) {
      var c = ROAD_COORDS[i];
      var rx = new THREE.Mesh(roadGeoX, roadMat);
      rx.rotation.x = -Math.PI / 2;
      rx.position.set(0, 0.02, c);
      scene.add(rx);
      var rz = new THREE.Mesh(roadGeoZ, roadMat);
      rz.rotation.x = -Math.PI / 2;
      rz.position.set(c, 0.02, 0);
      scene.add(rz);
    }

    // Sidewalk slabs around each block.
    var walkMat = new THREE.MeshLambertMaterial({ color: 0x8a8d90 });
    var walkGeo = new THREE.PlaneGeometry(36, 36);
    for (var bi = 0; bi < BLOCK_CENTERS.length; bi++) {
      for (var bj = 0; bj < BLOCK_CENTERS.length; bj++) {
        var bx = BLOCK_CENTERS[bi], bz = BLOCK_CENTERS[bj];
        if (bx === 0 && bz === 0) continue; // central plaza handled below
        var w = new THREE.Mesh(walkGeo, walkMat);
        w.rotation.x = -Math.PI / 2;
        w.position.set(bx, 0.01, bz);
        scene.add(w);
      }
    }

    // Central plaza: fountain + open space.
    var plaza = new THREE.Mesh(
      new THREE.CircleGeometry(15, 24),
      new THREE.MeshLambertMaterial({ color: 0x7d9db5 })
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0.03, 0);
    scene.add(plaza);
    var plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 4, 2.5, 12),
      new THREE.MeshLambertMaterial({ color: 0xb8b0a0 })
    );
    plinth.position.set(0, 1.25, 0);
    scene.add(plinth);
    this.addCollider(0, 0, 9, 9);

    // Buildings, one or four per block. Downtown (near centre) runs taller.
    var texs = buildingTextures(rng);
    var winMats = texs.map(function (t) {
      return new THREE.MeshLambertMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0 });
    });
    this.windowMats = winMats;
    var boxGeo = new THREE.BoxGeometry(1, 1, 1);
    var neonNames = ['PALMS', 'CORAL', 'TIDE', 'NEON', 'HOTEL', 'BAR', 'LUNA', 'REEF'];
    var neonColors = ['#ff2d78', '#22d3ee', '#facc15', '#a78bfa', '#34d399'];
    for (var bi2 = 0; bi2 < BLOCK_CENTERS.length; bi2++) {
      for (var bj2 = 0; bj2 < BLOCK_CENTERS.length; bj2++) {
        var bx2 = BLOCK_CENTERS[bi2], bz2 = BLOCK_CENTERS[bj2];
        if (bx2 === 0 && bz2 === 0) continue;
        if (bx2 === -144 && bz2 === 144) continue; // beach parking lot
        if (bx2 === 144 && bz2 === -144) continue; // park
        var distC = Math.abs(bx2) + Math.abs(bz2);
        var isNeon = bx2 >= 96 && bz2 <= -48 && bz2 >= -144;
        var count = rng() < 0.45 ? 1 : 4;
        for (var k = 0; k < count; k++) {
          var ox = count === 1 ? 0 : (k % 2 === 0 ? -8 : 8);
          var oz = count === 1 ? 0 : (k < 2 ? -8 : 8);
          var bw = count === 1 ? 26 : 13;
          var bd = count === 1 ? 26 : 13;
          var bh = U.randRange(rng, 8, distC < 100 ? 42 : 22);
          if (isNeon) bh = U.randRange(rng, 12, 30);
          var mat = winMats[Math.floor(rng() * winMats.length)];
          var b = new THREE.Mesh(boxGeo, mat);
          b.scale.set(bw, bh, bd);
          b.position.set(bx2 + ox, bh / 2, bz2 + oz);
          scene.add(b);
          this.addCollider(bx2 + ox, bz2 + oz, bw, bd);
          if (isNeon && rng() < 0.6) {
            var signTex = neonTexture(U.pick(rng, neonNames), U.pick(rng, neonColors));
            var signMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true });
            this.neonMats.push(signMat);
            var sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.8), signMat);
            sign.position.set(bx2 + ox, Math.min(bh - 2, 14), bz2 + oz + bd / 2 + 0.15);
            scene.add(sign);
          }
        }
      }
    }

    // Park block: trees + pond.
    var parkMat = new THREE.MeshLambertMaterial({ color: 0x2f6b2f });
    var park = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), parkMat);
    park.rotation.x = -Math.PI / 2;
    park.position.set(144, 0.02, -144);
    scene.add(park);
    this._trees(144, -144, 8, rng);

    // Beach + water to the south.
    var sand = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 90),
      new THREE.MeshLambertMaterial({ color: 0xd9c28a })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.01, 240);
    scene.add(sand);
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 300),
      new THREE.MeshLambertMaterial({ color: 0x1d6f8f, transparent: true, opacity: 0.92 })
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, 0.0, 430);
    scene.add(this.water);
    this._trees(-140, 215, 10, rng);

    // Streetlights at every other intersection.
    var poleMat = new THREE.MeshLambertMaterial({ color: 0x30343a });
    var lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 0 });
    this.lampMats = [lampMat];
    var poleGeo = new THREE.CylinderGeometry(0.18, 0.22, 7, 6);
    var lampGeo = new THREE.SphereGeometry(0.55, 8, 6);
    for (var li = 0; li < ROAD_COORDS.length; li += 2) {
      for (var lj = 0; lj < ROAD_COORDS.length; lj += 2) {
        var lx = ROAD_COORDS[li] + 8, lz = ROAD_COORDS[lj] + 8;
        var pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(lx, 3.5, lz);
        scene.add(pole);
        var lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(lx, 7.1, lz);
        scene.add(lamp);
      }
    }

    // Lights: sun + sky.
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
    this.sun.position.set(120, 180, 60);
    scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a3f35, 0.75);
    scene.add(this.hemi);
    scene.fog = new THREE.Fog(0x9db8cc, 180, 620);
  }

  City.prototype._trees = function (cx, cz, n, rng) {
    var trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    var leafMat = new THREE.MeshLambertMaterial({ color: 0x2f7d33 });
    for (var i = 0; i < n; i++) {
      var x = cx + U.randRange(rng, -14, 14);
      var z = cz + U.randRange(rng, -14, 14);
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 4, 6), trunkMat);
      trunk.position.set(x, 2, z);
      this.scene.add(trunk);
      var leaves = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 7), leafMat);
      leaves.position.set(x, 6, z);
      this.scene.add(leaves);
      this.addCollider(x, z, 1, 1);
    }
  };

  // 0 = deep night, 1 = midday. Drives sun, sky, windows, neon, lamps.
  City.prototype.nightFactor = function (timeOfDay) {
    var t = timeOfDay % 24;
    if (t >= 7 && t <= 17) return 0;
    if (t >= 19 || t <= 5) return 1;
    if (t > 17) return (t - 17) / 2;
    return (7 - t) / 2;
  };

  City.prototype.update = function (timeOfDay) {
    var night = this.nightFactor(timeOfDay);
    var day = 1 - night;
    var sun = this.sun;
    var ang = ((timeOfDay - 6) / 12) * Math.PI;
    sun.position.set(Math.cos(ang) * 180, Math.sin(ang) * 180 + 20, 60);
    sun.intensity = 0.25 + 1.45 * day;
    sun.color.setHex(night > 0.6 ? 0x8fa8ff : 0xfff2d8);
    this.hemi.intensity = 0.3 + 0.5 * day;
    var sky = new THREE.Color().setHSL(0.58, 0.45, 0.18 + 0.5 * day);
    this.scene.background = sky;
    this.scene.fog.color.copy(sky);
    var winGlow = night * 0.9;
    for (var i = 0; i < this.windowMats.length; i++) {
      this.windowMats[i].emissiveIntensity = winGlow;
    }
    for (var j = 0; j < this.lampMats.length; j++) {
      this.lampMats[j].emissiveIntensity = night * 1.6;
    }
    for (var k = 0; k < this.neonMats.length; k++) {
      this.neonMats[k].color.setScalar(0.55 + 0.45 * night);
    }
  };

  SB.city = {
    ROAD_COORDS: ROAD_COORDS,
    CITY_HALF: CITY_HALF,
    City: City
  };
})(window);
