// Sunset Bay — police.js
// SBPD pursuit: cruisers that chase and ram, with flashing light bars,
// plus roadblocks that appear at wanted level 4 and 5.
(function () {
  'use strict';

  var U = window.SB.util;

  function Police(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cars = [];
    this.roadblocks = [];
  }

  Police.prototype.ensure = function (count) {
    while (this.cars.length < count) {
      var mesh = window.SB.cars.makeCarMesh({ color: 0x1c1c22, kind: 'police' });
      var state = window.SB.cars.makeCarState(mesh, 'police');
      state.topSpeed = 31;
      var edge = this.rng() < 0.5 ? -this.city.half : this.city.half;
      state.x = edge;
      state.z = (this.rng() * 2 - 1) * this.city.half;
      state.heading = 0;
      state.name = 'SBPD Cruiser';
      this.scene.add(mesh);
      this.cars.push(state);
    }
    while (this.cars.length > count) {
      var gone = this.cars.pop();
      this.scene.remove(gone.mesh);
    }
  };

  Police.prototype.update = function (dt, target, colliders) {
    var flash = Math.floor(performance.now() / 180) % 2 === 0;
    for (var i = 0; i < this.cars.length; i++) {
      var c = this.cars[i];
      var dx = target.x - c.x, dz = target.z - c.z;
      var want = Math.atan2(dx, dz);
      c.heading = U.angleLerp(c.heading, want, Math.min(1, dt * 1.6));
      c.speed = U.lerp(c.speed, c.topSpeed, Math.min(1, dt * 0.8));
      var crashed = window.SB.cars.driveCar(
        c, { up: true, down: false, left: false, right: false },
        dt, colliders, this.city.cityHalf
      );
      if (crashed) c.speed *= 0.6;
      window.SB.cars.syncCarMesh(c, dt);
      if (c.mesh.userData.lightRed) c.mesh.userData.lightRed.visible = flash;
      if (c.mesh.userData.lightBlue) c.mesh.userData.lightBlue.visible = !flash;
    }
  };

  /** Roadblock: two cruisers parked across a road ahead of the player. */
  Police.prototype.setRoadblocks = function (count, target) {
    // Remove old ones.
    while (this.roadblocks.length > 0) {
      var old = this.roadblocks.pop();
      this.scene.remove(old.mesh);
    }
    if (count <= 0) return;
    for (var i = 0; i < count; i++) {
      var mesh = window.SB.cars.makeCarMesh({ color: 0x1c1c22, kind: 'police' });
      var state = window.SB.cars.makeCarState(mesh, 'police');
      // Place ahead of the player along their heading, on the nearest road.
      var ahead = 55 + i * 30;
      var bx = target.x + Math.sin(target.heading || 0) * ahead;
      var bz = target.z + Math.cos(target.heading || 0) * ahead;
      // Snap to the nearest road center so the block sits across a road.
      var best = this.city.centers[0], bestD = 1e9;
      for (var k = 0; k < this.city.centers.length; k++) {
        var d = Math.abs(bx - this.city.centers[k]);
        if (d < bestD) { bestD = d; best = this.city.centers[k]; }
      }
      state.x = best;
      state.z = bz;
      state.heading = Math.PI / 2;
      state.speed = 0;
      state.mesh.position.set(state.x, 0, state.z);
      state.mesh.rotation.y = state.heading;
      this.scene.add(mesh);
      this.roadblocks.push(state);
    }
  };

  /** Roadblock cars count as solid obstacles for the player's car. */
  Police.prototype.roadblockColliders = function () {
    var out = [];
    for (var i = 0; i < this.roadblocks.length; i++) {
      var c = this.roadblocks[i];
      out.push({ minX: c.x - 3.5, maxX: c.x + 3.5, minZ: c.z - 1.6, maxZ: c.z + 1.6 });
    }
    return out;
  };

  window.SB.police = { Police: Police };
})();
