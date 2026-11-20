// Sunset Bay — cars.js
// Low-poly car factory plus arcade driving physics shared by the player,
// traffic and police. Damage shows as smoke; wrecks stop moving.
(function (global) {
  'use strict';
  var SB = global.SB;
  var U = SB.util;
  var THREE = global.THREE;

  var PALETTE = [0xc0392b, 0x2980b9, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22, 0xecf0f1, 0x2c3e50, 0x16a085, 0xd35400];
  var SPORTS = [0xff2d55, 0x00e5ff, 0xffe600];

  function makeCarMesh(color, opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: color });
    var glassMat = new THREE.MeshLambertMaterial({ color: 0x101418 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.3), bodyMat);
    body.position.y = 0.55;
    g.add(body);
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), glassMat);
    cabin.position.set(0, 1.05, -0.2);
    g.add(cabin);
    if (opts.sport) {
      var spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.4), bodyMat);
      spoiler.position.set(0, 1.0, -2.0);
      g.add(spoiler);
    }
    var wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
    var wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
    var wheelPos = [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]];
    var wheels = [];
    for (var i = 0; i < 4; i++) {
      var w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wheelPos[i][0], 0.36, wheelPos[i][1]);
      g.add(w);
      wheels.push(w);
    }
    var lampMat = new THREE.MeshLambertMaterial({ color: 0xfff6c0, emissive: 0xffe9a0, emissiveIntensity: 0.7 });
    var lampGeo = new THREE.BoxGeometry(0.34, 0.16, 0.08);
    var l1 = new THREE.Mesh(lampGeo, lampMat);
    l1.position.set(-0.6, 0.62, 2.16);
    g.add(l1);
    var l2 = new THREE.Mesh(lampGeo, lampMat);
    l2.position.set(0.6, 0.62, 2.16);
    g.add(l2);
    var tailMat = new THREE.MeshLambertMaterial({ color: 0xaa1111, emissive: 0x550000, emissiveIntensity: 0.6 });
    var t1 = new THREE.Mesh(lampGeo, tailMat);
    t1.position.set(-0.6, 0.62, -2.16);
    g.add(t1);
    var t2 = new THREE.Mesh(lampGeo, tailMat);
    t2.position.set(0.6, 0.62, -2.16);
    g.add(t2);
    g.userData.wheels = wheels;
    g.userData.bodyMat = bodyMat;
    return g;
  }

  function makePoliceMesh() {
    var g = makeCarMesh(0x111418, {});
    var whiteMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    var door = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.4, 1.6), whiteMat);
    door.position.set(0, 0.62, 0.1);
    g.add(door);
    var redMat = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1 });
    var blueMat = new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0022ff, emissiveIntensity: 1 });
    var barR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), redMat);
    barR.position.set(-0.4, 1.42, -0.2);
    g.add(barR);
    var barB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), blueMat);
    barB.position.set(0.4, 1.42, -0.2);
    g.add(barB);
    g.userData.barR = barR;
    g.userData.barB = barB;
    return g;
  }

  // Arcade car: heading + speed, steering scales with speed, gentle drift.
  function Car(mesh, opts) {
    opts = opts || {};
    this.mesh = mesh;
    this.x = opts.x || 0;
    this.z = opts.z || 0;
    this.heading = opts.heading || 0;
    this.speed = 0;
    this.maxSpeed = opts.maxSpeed || 26;
    this.accel = opts.accel || 14;
    this.brake = opts.brake || 30;
    this.damage = 0; // 0..100, smoke above 55, wrecked at 100
    this.wrecked = false;
    this.steer = 0;
    this.smokeTimer = 0;
  }

  Car.prototype.forward = function () {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  };

  Car.prototype.drive = function (throttle, steerInput, dt, city) {
    if (this.wrecked) { this.speed = U.damp(this.speed, 0, 4, dt); }
    else if (throttle > 0) this.speed += this.accel * throttle * dt;
    else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= this.brake * dt;
      else this.speed -= this.accel * 0.55 * dt; // reverse
    } else {
      this.speed = U.damp(this.speed, 0, 0.9, dt);
    }
    this.speed = U.clamp(this.speed, -9, this.maxSpeed * (1 - this.damage / 260));
    var steerAuthority = U.clamp(Math.abs(this.speed) / 8, 0, 1) * (this.speed >= 0 ? 1 : -1);
    this.steer = U.damp(this.steer, steerInput, 8, dt);
    this.heading += this.steer * 1.9 * steerAuthority * dt;
    var f = this.forward();
    var nx = this.x + f.x * this.speed * dt;
    var nz = this.z + f.z * this.speed * dt;
    // Building collision: slide along the wall, lose speed, take damage.
    var before = { x: nx, z: nz };
    var tmp = { x: nx, z: nz };
    if (city.resolveCircle(tmp, 1.5)) {
      var hitSpeed = Math.abs(this.speed);
      nx = tmp.x; nz = tmp.z;
      this.speed *= 0.45;
      if (hitSpeed > 6) {
        this.addDamage(hitSpeed * 0.9);
        SB.bus.emit('collision', { hard: hitSpeed > 14, x: nx, z: nz });
      }
    }
    this.x = U.clamp(nx, -285, 285);
    this.z = U.clamp(nz, -285, 285);
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    var wheels = this.mesh.userData.wheels;
    if (wheels) {
      for (var i = 0; i < wheels.length; i++) {
        wheels[i].rotation.x += this.speed * dt * 2.2;
      }
    }
  };

  Car.prototype.addDamage = function (amount) {
    if (this.wrecked) return;
    this.damage = Math.min(100, this.damage + amount);
    if (this.damage >= 100) {
      this.wrecked = true;
      SB.bus.emit('wreck', { car: this });
    }
  };

  // Returns a smoke puff position when damaged, else null.
  Car.prototype.smokeTick = function (dt) {
    if (this.damage < 55 || this.wrecked) return null;
    this.smokeTimer -= dt;
    if (this.smokeTimer > 0) return null;
    this.smokeTimer = 0.12;
    return { x: this.x, y: 1.2, z: this.z };
  };

  SB.cars = {
    PALETTE: PALETTE,
    SPORTS: SPORTS,
    makeCarMesh: makeCarMesh,
    makePoliceMesh: makePoliceMesh,
    Car: Car
  };
})(window);
