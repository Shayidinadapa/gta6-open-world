// Sunset Bay — traffic.js
// Ambient traffic: cars cruising the road grid, turning at intersections,
// slowing for the car ahead, wrapping around the city edge.
(function () {
  'use strict';

  var U = window.SB.util;

  function Traffic(scene, city, rng, count) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cars = [];
    for (var i = 0; i < count; i++) this.spawnOne();
  }

  Traffic.prototype.spawnOne = function () {
    var rng = this.rng;
    var cars = window.SB.cars;
    var kind = rng() < 0.12 ? 'taxi' : (rng() < 0.12 ? 'truck' : 'sedan');
    var color = kind === 'taxi' ? 0xf2c200 : cars.CAR_COLORS[Math.floor(rng() * cars.CAR_COLORS.length)];
    var mesh = cars.makeCarMesh({ color: color, kind: kind });
    var state = cars.makeCarState(mesh, kind);
    var p = this.city.roadPoint(rng);
    state.x = p.x; state.z = p.z;
    state.name = cars.CAR_NAMES[Math.floor(rng() * cars.CAR_NAMES.length)];
    // Travel along the road the point sits on (x = const road runs along z).
    state.axis = (Math.abs(p.x % 52) < 1) ? 'x' : 'z';
    if (state.axis === 'x') {
      state.heading = rng() < 0.5 ? 0 : Math.PI;
    } else {
      state.heading = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    }
    state.lane = rng() < 0.5 ? 3.5 : -3.5;
    state.speed = 7 + rng() * 5;
    state.cruise = state.speed;
    state.mesh.position.set(state.x, 0, state.z);
    state.mesh.rotation.y = state.heading;
    this.scene.add(mesh);
    this.cars.push(state);
    return state;
  };

  Traffic.prototype.update = function (dt) {
    var centers = this.city.centers;
    var half = this.city.half;
    for (var i = 0; i < this.cars.length; i++) {
      var c = this.cars[i];
      // At an intersection, sometimes turn onto the crossing road.
      var nearX = false, nearZ = false;
      for (var k = 0; k < centers.length; k++) {
        if (Math.abs(c.x - centers[k]) < 2) nearX = true;
        if (Math.abs(c.z - centers[k]) < 2) nearZ = true;
      }
      if (nearX && nearZ && this.rng() < dt * 0.35) {
        c.axis = c.axis === 'x' ? 'z' : 'x';
        var dirs = c.axis === 'x' ? [0, Math.PI] : [Math.PI / 2, -Math.PI / 2];
        c.heading = dirs[Math.floor(this.rng() * 2)];
      }
      // Slow down for the car ahead on the same road.
      var slow = false;
      for (var j = 0; j < this.cars.length; j++) {
        if (j === i) continue;
        var o = this.cars[j];
        if (o.axis !== c.axis) continue;
        var dx = o.x - c.x, dz = o.z - c.z;
        var ahead = Math.sin(c.heading) * dx + Math.cos(c.heading) * dz;
        var side = Math.abs(Math.cos(c.heading) * dx - Math.sin(c.heading) * dz);
        if (ahead > 0 && ahead < 9 && side < 3) { slow = true; break; }
      }
      c.speed = U.lerp(c.speed, slow ? 2 : c.cruise, Math.min(1, dt * 1.5));
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      // Wrap around the city edge instead of despawning.
      if (c.x > half + 40 || c.x < -half - 40 || c.z > half + 60 || c.z < -half - 40) {
        var p = this.city.roadPoint(this.rng);
        c.x = p.x; c.z = p.z;
        c.axis = (Math.abs(p.x % 52) < 1) ? 'x' : 'z';
        c.heading = c.axis === 'x' ? (this.rng() < 0.5 ? 0 : Math.PI) : (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      }
      window.SB.cars.syncCarMesh(c, dt);
    }
  };

  window.SB.traffic = { Traffic: Traffic };
})();
