// Sunset Bay — cars.js
// Box-built cars (no external models) and arcade driving physics.
// Every car in the game — traffic, police, parked, and the player's —
// is built by makeCarMesh and driven by driveCar.
(function () {
  'use strict';

  var U = window.SB.util;

  var CAR_COLORS = [0xc23b3b, 0x3b7ac2, 0xe8c23b, 0x4a9a5a, 0xe8e8e8, 0x2e3138, 0x8a5ac2, 0xc2703b, 0x3ba8a0];
  var CAR_NAMES = ['Comet', 'Stallion', 'Voyager', 'Bison', 'Falcon', 'Hustler', 'Dune', 'Phantom', 'Civic'];

  /** Build a low-poly car from boxes and cylinders. Returns a THREE.Group. */
  function makeCarMesh(opts) {
    opts = opts || {};
    var color = opts.color !== undefined ? opts.color : 0xc23b3b;
    var kind = opts.kind || 'sedan';
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: color });
    var glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
    var darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

    var bodyLen = kind === 'truck' ? 5.6 : kind === 'sport' ? 4.2 : 4.6;
    var bodyW = 2.0, bodyH = 0.75;
    var body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyLen), bodyMat);
    body.position.y = 0.55;
    body.castShadow = true;
    g.add(body);
    // Cabin.
    var cabinLen = kind === 'truck' ? 1.6 : 1.6;
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(bodyW - 0.3, 0.62, cabinLen), glassMat);
    cabin.position.set(0, 1.2, kind === 'truck' ? 0.9 : -0.2);
    cabin.castShadow = true;
    g.add(cabin);
    if (kind === 'truck') {
      var bed = new THREE.Mesh(new THREE.BoxGeometry(bodyW - 0.2, 0.5, 2.4), darkMat);
      bed.position.set(0, 0.95, -1.2);
      g.add(bed);
    }
    // Wheels.
    var wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    var wheelPos = [
      [-bodyW / 2, 0.36, bodyLen / 2 - 0.9], [bodyW / 2, 0.36, bodyLen / 2 - 0.9],
      [-bodyW / 2, 0.36, -bodyLen / 2 + 0.9], [bodyW / 2, 0.36, -bodyLen / 2 + 0.9]
    ];
    var wheels = [];
    wheelPos.forEach(function (p) {
      var w = new THREE.Mesh(wheelGeo, darkMat);
      w.position.set(p[0], p[1], p[2]);
      w.castShadow = true;
      g.add(w);
      wheels.push(w);
    });
    // Headlights and taillights.
    var lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    [-0.6, 0.6].forEach(function (x) {
      var hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.08), lightMat);
      hl.position.set(x, 0.62, bodyLen / 2 + 0.01);
      g.add(hl);
    });
    var tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    [-0.6, 0.6].forEach(function (x) {
      var tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.08), tailMat);
      tl.position.set(x, 0.62, -bodyLen / 2 - 0.01);
      g.add(tl);
    });
    // Headlight beams (visible at night): faint translucent cones.
    var beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: 0.07,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    // Cone axis is Y (apex +Y); rotate so the apex sits at the headlight
    // and the cone opens forward (+z, the car's front).
    var beamGeo = new THREE.ConeGeometry(0.7, 7, 8, 1, true);
    beamGeo.rotateX(-Math.PI / 2);
    beamGeo.translate(0, 0, 3.5);
    [-0.6, 0.6].forEach(function (x) {
      var beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(x, 0.6, bodyLen / 2);
      beam.visible = false;
      g.add(beam);
      (g.userData.beams = g.userData.beams || []).push(beam);
    });
    if (kind === 'taxi') {
      var sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4),
        new THREE.MeshBasicMaterial({ color: 0xffe14a }));
      sign.position.set(0, 1.62, -0.2);
      g.add(sign);
    }
    if (kind === 'police') {
      var bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.4),
        new THREE.MeshLambertMaterial({ color: 0x111111 }));
      bar.position.set(0, 1.58, -0.2);
      g.add(bar);
      var red = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.42),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      red.position.set(-0.3, 1.6, -0.2);
      g.add(red);
      var blue = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.42),
        new THREE.MeshBasicMaterial({ color: 0x2244ff }));
      blue.position.set(0.3, 1.6, -0.2);
      g.add(blue);
      g.userData.lightRed = red;
      g.userData.lightBlue = blue;
    }
    g.userData.wheels = wheels;
    g.userData.bodyLen = bodyLen;
    return g;
  }

  /** Arcade car state: position, heading, speed; updated by driveCar(). */
  function makeCarState(mesh, kind) {
    return {
      mesh: mesh, kind: kind || 'sedan',
      x: 0, z: 0, heading: 0, speed: 0,
      topSpeed: kind === 'sport' ? 34 : kind === 'truck' ? 24 : 28,
      accel: kind === 'sport' ? 18 : 13,
      steer: 0, damage: 0, name: 'car', lane: 0, cruise: 9
    };
  }

  /**
   * Arcade driving: forward/reverse, steering scaled by speed, simple
   * building collision (slide along walls) and world bounds.
   * input: {up, down, left, right}; colliders: city AABBs.
   * Returns true when the car crashed into something this frame.
   */
  function driveCar(car, input, dt, colliders, cityHalf) {
    var maxSteer = 0.55;
    var targetSteer = 0;
    if (input.left) targetSteer += maxSteer;
    if (input.right) targetSteer -= maxSteer;
    car.steer = U.lerp(car.steer, targetSteer, Math.min(1, dt * 8));
    var speedFactor = U.clamp(Math.abs(car.speed) / 8, 0, 1);
    car.heading += car.steer * speedFactor * (car.speed >= 0 ? 1 : -1) * dt * 1.9;

    if (input.up) car.speed += car.accel * dt;
    else if (input.down) {
      if (car.speed > 0.5) car.speed -= car.accel * 1.6 * dt;
      else car.speed -= car.accel * 0.55 * dt;
    } else {
      car.speed -= car.speed * 1.4 * dt;
    }
    car.speed = U.clamp(car.speed, -10, car.topSpeed);

    var nx = car.x + Math.sin(car.heading) * car.speed * dt;
    var nz = car.z + Math.cos(car.heading) * car.speed * dt;
    var hit = false;
    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      if (nx > c.minX - 1.3 && nx < c.maxX + 1.3 && nz > c.minZ - 1.3 && nz < c.maxZ + 1.3) {
        hit = true;
        break;
      }
    }
    if (hit) {
      var slideX = true, slideZ = true;
      for (var j = 0; j < colliders.length; j++) {
        var cc = colliders[j];
        if (nx > cc.minX - 1.3 && nx < cc.maxX + 1.3 && car.z > cc.minZ - 1.3 && car.z < cc.maxZ + 1.3) slideX = false;
        if (car.x > cc.minX - 1.3 && car.x < cc.maxX + 1.3 && nz > cc.minZ - 1.3 && nz < cc.maxZ + 1.3) slideZ = false;
      }
      if (slideX) car.x = nx;
      if (slideZ) car.z = nz;
      if (!slideX && !slideZ) {
        car.damage += Math.abs(car.speed) * 0.6;
        car.speed *= -0.25;
        return true;
      }
      car.damage += Math.abs(car.speed) * 0.15;
      car.speed *= 0.55;
      return true;
    }
    car.x = U.clamp(nx, -cityHalf - 30, cityHalf + 30);
    car.z = U.clamp(nz, -cityHalf - 30, cityHalf + 60);
    return false;
  }

  /** Sync a car state's mesh transform (and spin its wheels). */
  function syncCarMesh(car, dt) {
    var lat = car.lane || 0;
    var px = car.x + Math.cos(car.heading) * lat;
    var pz = car.z - Math.sin(car.heading) * lat;
    car.mesh.position.set(px, 0, pz);
    car.mesh.rotation.y = car.heading;
    var spin = car.speed * dt * 2.2;
    (car.mesh.userData.wheels || []).forEach(function (w) { w.rotation.x += spin; });
  }

  /** Show or hide the headlight beams (night driving). */
  function setBeams(car, on) {
    (car.mesh.userData.beams || []).forEach(function (b) { b.visible = on; });
  }

  window.SB.cars = {
    makeCarMesh: makeCarMesh,
    makeCarState: makeCarState,
    driveCar: driveCar,
    syncCarMesh: syncCarMesh,
    setBeams: setBeams,
    CAR_COLORS: CAR_COLORS,
    CAR_NAMES: CAR_NAMES
  };
})();
