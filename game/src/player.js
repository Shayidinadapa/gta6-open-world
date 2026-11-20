// Sunset Bay — player.js
// Kai "Rook" Mercer on foot: WASD movement, sprint, third-person camera,
// and entering / exiting cars. The camera also serves driving.
(function (global) {
  'use strict';
  var SB = global.SB;
  var U = SB.util;
  var THREE = global.THREE;

  function makePlayerMesh() {
    var g = new THREE.Group();
    var jacket = new THREE.MeshLambertMaterial({ color: 0x27364f });
    var pants = new THREE.MeshLambertMaterial({ color: 0x222222 });
    var skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.36), jacket);
    body.position.y = 1.0;
    g.add(body);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
    head.position.y = 1.72;
    g.add(head);
    var cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.5), new THREE.MeshLambertMaterial({ color: 0xc0392b }));
    cap.position.y = 1.92;
    g.add(cap);
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.26), pants);
    legL.position.set(-0.16, 0.38, 0);
    g.add(legL);
    var legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.26), pants);
    legR.position.set(0.16, 0.38, 0);
    g.add(legR);
    var armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), jacket);
    armL.position.set(-0.42, 1.05, 0);
    g.add(armL);
    var armR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), jacket);
    armR.position.set(0.42, 1.05, 0);
    g.add(armR);
    g.userData.legL = legL;
    g.userData.legR = legR;
    return g;
  }

  function Player(scene, city, startPos) {
    this.scene = scene;
    this.city = city;
    this.mesh = makePlayerMesh();
    scene.add(this.mesh);
    this.x = startPos.x;
    this.z = startPos.z;
    this.heading = startPos.heading || 0;
    this.speed = 0;
    this.inCar = null; // Car instance when driving
    // Camera sits BEHIND the player: camYaw = heading + PI, so W walks
    // along the facing from the very first frame (not backwards).
    this.camYaw = this.heading + Math.PI;
    this.camPitch = 0.32;
    this.camDist = 9;
    this.walkPhase = 0;
    this.mesh.position.set(this.x, 0, this.z);
  }

  Player.prototype.enterCar = function (car) {
    if (!car || car.wrecked) return false;
    this.inCar = car;
    this.mesh.visible = false;
    SB.bus.emit('enter-car', { car: car });
    return true;
  };

  Player.prototype.exitCar = function () {
    if (!this.inCar) return;
    var car = this.inCar;
    this.inCar = null;
    var f = car.forward();
    this.x = car.x - f.x * 2.6;
    this.z = car.z - f.z * 2.6;
    this.heading = car.heading;
    this.camYaw = this.heading + Math.PI;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    SB.bus.emit('exit-car', { car: car });
  };

  Player.prototype.updateOnFoot = function (input, dt) {
    var sprint = input.shift ? 1.7 : 1;
    var moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    var moveZ = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    var moving = moveX !== 0 || moveZ !== 0;
    if (moving) {
      // Movement is camera-relative: up = away from camera.
      // Camera sits at target + (sin(camYaw), cos(camYaw)) * dist, so the
      // on-screen forward is (-sin(camYaw), -cos(camYaw)) and right is
      // (cos(camYaw), -sin(camYaw)).
      var camSin = Math.sin(this.camYaw), camCos = Math.cos(this.camYaw);
      var wx = -camSin * moveZ + camCos * moveX;
      var wz = -camCos * moveZ - camSin * moveX;
      var len = Math.sqrt(wx * wx + wz * wz) || 1;
      wx /= len; wz /= len;
      var targetHeading = Math.atan2(wx, wz);
      this.heading = U.angleLerp(this.heading, targetHeading, 12 * dt);
      this.speed = U.damp(this.speed, 5.2 * sprint, 8, dt);
      this.walkPhase += dt * this.speed * 2.2;
    } else {
      this.speed = U.damp(this.speed, 0, 10, dt);
    }
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    var tmp = { x: this.x, z: this.z };
    if (this.city.resolveCircle(tmp, 0.6)) {
      this.x = tmp.x; this.z = tmp.z;
      this.speed *= 0.5;
    }
    this.x = U.clamp(this.x, -285, 285);
    this.z = U.clamp(this.z, -285, 285);
    this.mesh.position.set(this.x, Math.abs(Math.sin(this.walkPhase)) * 0.05, this.z);
    this.mesh.rotation.y = this.heading;
    var swing = moving ? Math.sin(this.walkPhase) * 0.5 : 0;
    this.mesh.userData.legL.rotation.x = swing;
    this.mesh.userData.legR.rotation.x = -swing;
  };

  // Third-person camera: follows behind the player or the car.
  Player.prototype.updateCamera = function (camera, dt) {
    var tx, tz, ty;
    if (this.inCar) {
      var car = this.inCar;
      // The camera trails behind the car; slow enough not to fight steering.
      this.camYaw = U.angleLerp(this.camYaw, car.heading + Math.PI, 2 * dt);
      tx = car.x; tz = car.z; ty = 1.2;
      this.camDist = U.damp(this.camDist, 11.5, 3, dt);
    } else {
      // On foot the camera yaw is mouse-controlled ONLY. An auto-follow
      // here fights every drag: it pulls the camera back toward
      // heading+PI while the player stands still, so a dragged aim never
      // sticks and the player can never walk toward a dragged target.
      tx = this.x; tz = this.z; ty = 1.5;
      this.camDist = U.damp(this.camDist, 8, 3, dt);
    }
    var cx = tx + Math.sin(this.camYaw) * this.camDist;
    var cz = tz + Math.cos(this.camYaw) * this.camDist;
    var cy = ty + this.camDist * Math.tan(this.camPitch);
    camera.position.set(
      U.damp(camera.position.x, cx, 8, dt),
      U.damp(camera.position.y, cy, 8, dt),
      U.damp(camera.position.z, cz, 8, dt)
    );
    camera.lookAt(tx, ty, tz);
  };

  SB.player = { Player: Player, makePlayerMesh: makePlayerMesh };
})(window);
