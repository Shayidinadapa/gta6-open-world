// Sunset Bay — player.js
// The on-foot hero: third-person movement, carjacking, and hitscan combat.
// Kai "Rook" Mercer, a driver-for-hire in Sunset Bay.
(function () {
  'use strict';

  var U = window.SB.util;

  /** Build the hero mesh: simple stylized figure (jacket, jeans, cap). */
  function makeHeroMesh() {
    var g = new THREE.Group();
    var jacket = new THREE.MeshLambertMaterial({ color: 0x27435f });
    var jeans = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
    var skin = new THREE.MeshLambertMaterial({ color: 0xc98e6a });
    var cap = new THREE.MeshLambertMaterial({ color: 0xc23b3b });
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), jacket);
    torso.position.y = 1.15;
    torso.castShadow = true;
    g.add(torso);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
    head.position.y = 1.72;
    head.castShadow = true;
    g.add(head);
    var capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.28, 0.1, 12), cap);
    capTop.position.y = 1.9;
    g.add(capTop);
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.78, 0.26), jeans);
    legL.position.set(-0.17, 0.39, 0);
    g.add(legL);
    var legR = legL.clone();
    legR.position.x = 0.17;
    g.add(legR);
    var armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), jacket);
    armL.position.set(-0.42, 1.15, 0);
    g.add(armL);
    var armR = armL.clone();
    armR.position.x = 0.42;
    g.add(armR);
    g.userData.legL = legL;
    g.userData.legR = legR;
    g.userData.armL = armL;
    g.userData.armR = armR;
    return g;
  }

  function Player(scene) {
    this.scene = scene;
    this.mesh = makeHeroMesh();
    scene.add(this.mesh);
    this.x = 0; this.z = 0;
    this.heading = 0;      // facing, radians
    this.camYaw = 0;       // camera orbit yaw
    this.speed = 0;
    this.vy = 0; this.y = 0; // jump physics
    this.onGround = true;
    this.health = 100;
    this.cash = 250;
    this.inCar = null;     // car state when driving
    this.shootCooldown = 0;
    this.hurtFlash = 0;
    this.walkPhase = 0;
    this.dead = false;
  }

  /** Move on foot: WASD relative to the camera yaw. Returns nothing. */
  Player.prototype.updateOnFoot = function (input, dt, colliders, cityHalf) {
    var run = input.shift ? 9.5 : 5.5;
    var fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    var rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    var mx = 0, mz = 0;
    if (input.up) { mx += fx; mz += fz; }
    if (input.down) { mx -= fx; mz -= fz; }
    if (input.left) { mx -= rx; mz -= rz; }
    if (input.right) { mx += rx; mz += rz; }
    var len = Math.sqrt(mx * mx + mz * mz);
    if (len > 0.01) {
      mx /= len; mz /= len;
      this.heading = U.angleLerp(this.heading, Math.atan2(mx, mz), Math.min(1, dt * 12));
      var nx = this.x + mx * run * dt;
      var nz = this.z + mz * run * dt;
      var blocked = false;
      for (var i = 0; i < colliders.length; i++) {
        var c = colliders[i];
        if (nx > c.minX - 0.5 && nx < c.maxX + 0.5 && nz > c.minZ - 0.5 && nz < c.maxZ + 0.5) { blocked = true; break; }
      }
      if (!blocked) {
        this.x = U.clamp(nx, -cityHalf - 30, cityHalf + 30);
        this.z = U.clamp(nz, -cityHalf - 30, cityHalf + 60);
      }
      this.speed = run;
      this.walkPhase += dt * run * 1.6;
    } else {
      this.speed = 0;
    }
    // Jump.
    if (input.jump && this.onGround) {
      this.vy = 6.5;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.vy -= 18 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.onGround = true; }
    }
    // Walk-cycle limb swing.
    var swing = this.speed > 0.1 ? Math.sin(this.walkPhase) * 0.55 : 0;
    this.mesh.userData.legL.rotation.x = swing;
    this.mesh.userData.legR.rotation.x = -swing;
    this.mesh.userData.armL.rotation.x = -swing * 0.8;
    this.mesh.userData.armR.rotation.x = swing * 0.8;
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.heading;
    this.mesh.visible = true;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
  };

  Player.prototype.hurt = function (amount) {
    if (this.dead) return;
    this.health -= amount;
    this.hurtFlash = 0.5;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  };

  Player.prototype.heal = function (dt) {
    if (!this.dead && this.health < 100 && this.shootCooldown <= 0) {
      this.health = Math.min(100, this.health + dt * 2.5);
    }
  };

  window.SB.player = { Player: Player, makeHeroMesh: makeHeroMesh };
})();
