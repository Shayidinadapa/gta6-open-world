// Sunset Bay — police.js
// Wanted level 1-5, cruiser pursuit AI, roadblocks at high heat, and the
// busted state. Heat rises with crime and cools off when the player hides.
(function (global) {
  'use strict';
  var SB = global.SB;
  var U = SB.util;
  var THREE = global.THREE;

  function Police(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cruisers = [];
    this.roadblocks = [];
    this.wanted = 0;
    this.heatTimer = 0;
    this.coolTimer = 0;
    this.flashTimer = 0;
    this.bustedTimer = 0;
    this.spawnTimer = 0;
    SB.bus.on('crime', this.addHeat.bind(this));
  }

  Police.prototype.addHeat = function (data) {
    var amount = (data && data.amount) || 1;
    this.wanted = U.clamp(this.wanted + amount, 0, 5);
    this.coolTimer = 0;
    this.heatTimer = 0;
    SB.bus.emit('wanted', { wanted: this.wanted });
  };

  Police.prototype.wantedCount = function () {
    return [0, 1, 2, 3, 3, 4][this.wanted];
  };

  Police.prototype.spawnCruiser = function (nearX, nearZ) {
    var p = this.city.randomRoadPoint(this.rng);
    // Spawn on a road some distance from the player, not on top of them.
    var tries = 0;
    while (U.dist2D(p.x, p.z, nearX, nearZ) < 55 && tries++ < 8) {
      p = this.city.randomRoadPoint(this.rng);
    }
    var mesh = SB.cars.makePoliceMesh();
    this.scene.add(mesh);
    var heading = Math.atan2(nearX - p.x, nearZ - p.z);
    var car = new SB.cars.Car(mesh, { x: p.x, z: p.z, heading: heading, maxSpeed: 30, accel: 17 });
    car.isPolice = true;
    this.cruisers.push(car);
    return car;
  };

  Police.prototype.spawnRoadblock = function (px, pz, heading) {
    var group = new THREE.Group();
    var f = { x: Math.sin(heading), z: Math.cos(heading) };
    var r = { x: f.z, z: -f.x };
    for (var i = -1; i <= 1; i++) {
      var mesh = SB.cars.makePoliceMesh();
      mesh.position.set(px + r.x * i * 4.4, 0, pz + r.z * i * 4.4);
      mesh.rotation.y = heading + Math.PI / 2;
      group.add(mesh);
    }
    var barrier = new THREE.Mesh(
      new THREE.BoxGeometry(12, 1.1, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xff7b00, emissive: 0x552200, emissiveIntensity: 0.5 })
    );
    barrier.position.set(px + f.x * 3, 0.55, pz + f.z * 3);
    barrier.rotation.y = heading;
    group.add(barrier);
    this.scene.add(group);
    var col = this.city.addCollider(px, pz, 12, 3);
    this.roadblocks.push({ group: group, x: px, z: pz, heading: heading, collider: col });
  };

  Police.prototype.clearRoadblocks = function () {
    for (var i = 0; i < this.roadblocks.length; i++) {
      this.scene.remove(this.roadblocks[i].group);
      if (this.roadblocks[i].collider) this.city.removeCollider(this.roadblocks[i].collider);
    }
    this.roadblocks = [];
  };

  Police.prototype.update = function (dt, player, playerCar) {
    var px = playerCar ? playerCar.x : player.x;
    var pz = playerCar ? playerCar.z : player.z;
    var moving = playerCar ? Math.abs(playerCar.speed) : player.speed;
    // Wanted decay: no crime for a while and no cruiser nearby.
    if (this.wanted > 0) {
      this.coolTimer += dt;
      var nearest = 1e9;
      for (var i = 0; i < this.cruisers.length; i++) {
        nearest = Math.min(nearest, U.dist2D(px, pz, this.cruisers[i].x, this.cruisers[i].z));
      }
      if (this.coolTimer > 25 && nearest > 60) {
        this.wanted--;
        this.coolTimer = 0;
        SB.bus.emit('wanted', { wanted: this.wanted });
      }
    }
    // Keep the right number of cruisers on the street.
    var want = this.wantedCount();
    this.spawnTimer -= dt;
    if (this.cruisers.length < want && this.spawnTimer <= 0) {
      this.spawnCruiser(px, pz);
      this.spawnTimer = 2.5;
    }
    if (this.cruisers.length > want) {
      var extra = this.cruisers.pop();
      this.scene.remove(extra.mesh);
    }
    // Roadblocks at wanted 4-5, one ahead of the player.
    if (this.wanted >= 4 && this.roadblocks.length === 0) {
      var hd = playerCar ? playerCar.heading : player.heading;
      var f = { x: Math.sin(hd), z: Math.cos(hd) };
      this.spawnRoadblock(px + f.x * 46, pz + f.z * 46, hd);
    }
    if (this.wanted < 4 && this.roadblocks.length > 0) {
      this.clearRoadblocks();
    }
    // Pursuit: steer toward the player, ram on contact.
    for (var j = 0; j < this.cruisers.length; j++) {
      var c = this.cruisers[j];
      var targetHeading = Math.atan2(px - c.x, pz - c.z);
      var steer = U.clamp(U.angleDiff(c.heading, targetHeading) * 1.6, -1, 1);
      var throttle = 1;
      var d = U.dist2D(px, pz, c.x, c.z);
      if (d < 7 && moving < 2) throttle = 0.3;
      c.drive(throttle, steer, dt, this.city);
      // Ram damage.
      if (d < 3.4) {
        if (playerCar) {
          playerCar.addDamage(6 * dt * 10);
          SB.bus.emit('collision', { hard: false, x: px, z: pz });
        } else {
          SB.bus.emit('player-hit', { amount: 14 * dt });
        }
      }
      // Flashing light bar.
      this.flashTimer += dt;
      var phase = Math.floor(this.flashTimer * 6) % 2 === 0;
      if (c.mesh.userData.barR) {
        c.mesh.userData.barR.material.emissiveIntensity = phase ? 2.2 : 0.2;
        c.mesh.userData.barB.material.emissiveIntensity = phase ? 0.2 : 2.2;
      }
    }
    // Busted: a cruiser sits on a slow, exposed player.
    var busted = false;
    if (this.wanted > 0 && !playerCar && moving < 1) {
      for (var k = 0; k < this.cruisers.length; k++) {
        if (U.dist2D(px, pz, this.cruisers[k].x, this.cruisers[k].z) < 5) {
          this.bustedTimer += dt;
          if (this.bustedTimer > 1.6) busted = true;
          break;
        }
      }
      if (!busted) this.bustedTimer = Math.max(0, this.bustedTimer - dt);
    } else {
      this.bustedTimer = 0;
    }
    return { busted: busted };
  };

  Police.prototype.reset = function () {
    for (var i = 0; i < this.cruisers.length; i++) this.scene.remove(this.cruisers[i].mesh);
    this.cruisers = [];
    this.clearRoadblocks();
    this.wanted = 0;
    this.bustedTimer = 0;
    this.coolTimer = 0;
  };

  SB.police = { Police: Police };
})(window);
