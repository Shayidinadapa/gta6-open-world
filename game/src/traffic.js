// Sunset Bay — traffic.js
// Ambient life: cars cruising the road grid and pedestrians on the
// sidewalks. Traffic follows lanes, turns at intersections, and brakes
// for the car ahead. Pedestrians stroll and flee from danger.
(function (global) {
  'use strict';
  var SB = global.SB;
  var U = SB.util;
  var THREE = global.THREE;
  var ROAD = SB.city.ROAD_COORDS;

  function Traffic(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cars = [];
    this.peds = [];
    this.pedGeoBody = new THREE.BoxGeometry(0.5, 0.9, 0.3);
    this.pedGeoHead = new THREE.SphereGeometry(0.22, 8, 6);
    this.pedMats = [0xd94f4f, 0x4f7dd9, 0x4fd97a, 0xd9c14f, 0x9b59b6, 0xe67e22].map(function (c) {
      return new THREE.MeshLambertMaterial({ color: c });
    });
    this.skinMat = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
    this.spawnCars(16);
    this.spawnPeds(22);
  }

  Traffic.prototype.spawnCars = function (n) {
    for (var i = 0; i < n; i++) {
      var p = this.city.randomRoadPoint(this.rng);
      var color = U.pick(this.rng, SB.cars.PALETTE);
      var mesh = SB.cars.makeCarMesh(color, {});
      this.scene.add(mesh);
      var heading = p.axis === 'x' ? (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2)
        : (this.rng() < 0.5 ? 0 : Math.PI);
      var car = new SB.cars.Car(mesh, { x: p.x, z: p.z, heading: heading, maxSpeed: U.randRange(this.rng, 9, 14), accel: 8 });
      car.speed = car.maxSpeed * 0.7;
      car.cruise = car.maxSpeed;
      car.axis = p.axis;
      this.cars.push(car);
    }
  };

  Traffic.prototype.spawnPeds = function (n) {
    for (var i = 0; i < n; i++) {
      var p = this.city.randomRoadPoint(this.rng);
      var g = new THREE.Group();
      var body = new THREE.Mesh(this.pedGeoBody, U.pick(this.rng, this.pedMats));
      body.position.y = 0.85;
      g.add(body);
      var head = new THREE.Mesh(this.pedGeoHead, this.skinMat);
      head.position.y = 1.5;
      g.add(head);
      this.scene.add(g);
      this.peds.push({
        mesh: g,
        x: p.x + (this.rng() < 0.5 ? -8 : 8),
        z: p.z + (this.rng() < 0.5 ? -8 : 8),
        heading: this.rng() * Math.PI * 2,
        speed: U.randRange(this.rng, 1.2, 2.4),
        flee: 0,
        retarget: 0
      });
    }
  };

  Traffic.prototype._carAhead = function (car, dist) {
    var f = car.forward();
    for (var i = 0; i < this.cars.length; i++) {
      var o = this.cars[i];
      if (o === car) continue;
      var dx = o.x - car.x, dz = o.z - car.z;
      var along = dx * f.x + dz * f.z;
      if (along > 0 && along < dist && Math.abs(dx * f.z - dz * f.x) < 2.6) return o;
    }
    return null;
  };

  Traffic.prototype.updateCars = function (dt, playerCar) {
    for (var i = 0; i < this.cars.length; i++) {
      var car = this.cars[i];
      var f = car.forward();
      // At an intersection, sometimes turn onto the crossing road.
      var nearCross = false;
      for (var r = 0; r < ROAD.length; r++) {
        var cross = car.axis === 'x' ? Math.abs(car.z - ROAD[r]) : Math.abs(car.x - ROAD[r]);
        if (cross < 1.2 && this.rng() < 0.012) { nearCross = true; break; }
      }
      if (nearCross) {
        car.axis = car.axis === 'x' ? 'z' : 'x';
        var turn = this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        car.heading += turn;
        var nf = car.forward();
        if (car.axis === 'x') car.z = this.city.nearestRoadCoord(car.z) + (nf.x > 0 ? -3 : 3);
        else car.x = this.city.nearestRoadCoord(car.x) + (nf.z > 0 ? -3 : 3);
      }
      // Brake for the car ahead (or the player's car).
      var blocked = this._carAhead(car, 9);
      var target = blocked ? 0 : car.cruise;
      if (playerCar && !playerCar.wrecked) {
        var dx = playerCar.x - car.x, dz = playerCar.z - car.z;
        var along = dx * f.x + dz * f.z;
        if (along > 0 && along < 8 && Math.abs(dx * f.z - dz * f.x) < 2.8) target = 0;
      }
      car.speed = U.damp(car.speed, target, 1.6, dt);
      car.drive(car.speed > 0.1 ? 0.4 : 0, 0, dt, this.city);
      // Nudge back onto the lane if drifted.
      if (car.axis === 'x') car.z = U.damp(car.z, this.city.nearestRoadCoord(car.z) + (f.x > 0 ? -3 : 3), 2, dt);
      else car.x = U.damp(car.x, this.city.nearestRoadCoord(car.x) + (f.z > 0 ? -3 : 3), 2, dt);
    }
  };

  Traffic.prototype.updatePeds = function (dt, danger) {
    for (var i = 0; i < this.peds.length; i++) {
      var p = this.peds[i];
      p.retarget -= dt;
      if (danger) {
        var dd = U.dist2D(p.x, p.z, danger.x, danger.z);
        if (dd < 26) {
          p.flee = 2.5;
          p.heading = Math.atan2(p.x - danger.x, p.z - danger.z);
        }
      }
      if (p.flee > 0) {
        p.flee -= dt;
      } else if (p.retarget <= 0) {
        p.retarget = U.randRange(this.rng, 2, 6);
        // Keep walking along sidewalks: pick a nearby road, walk parallel.
        var c = this.city.nearestRoadCoord(this.rng() < 0.5 ? p.x : p.z);
        if (Math.abs(p.x - c) < Math.abs(p.z - c)) {
          p.heading = (this.rng() < 0.5 ? 0 : Math.PI) + U.randRange(this.rng, -0.2, 0.2);
          p.x = c + (this.rng() < 0.5 ? -8 : 8);
        } else {
          p.heading = (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) + U.randRange(this.rng, -0.2, 0.2);
          p.z = c + (this.rng() < 0.5 ? -8 : 8);
        }
      }
      var sp = p.flee > 0 ? p.speed * 2.6 : p.speed;
      p.x += Math.sin(p.heading) * sp * dt;
      p.z += Math.cos(p.heading) * sp * dt;
      p.x = U.clamp(p.x, -185, 185);
      p.z = U.clamp(p.z, -185, 230);
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      // Simple walk bob.
      p.mesh.position.y = Math.abs(Math.sin(performance.now() * 0.006 + i * 1.7)) * 0.06;
    }
  };

  Traffic.prototype.update = function (dt, playerCar, danger) {
    this.updateCars(dt, playerCar);
    this.updatePeds(dt, danger);
  };

  // A parked car the player can steal: returns the nearest stealable car.
  Traffic.prototype.nearestCar = function (x, z, maxDist) {
    var best = null, bd = maxDist;
    for (var i = 0; i < this.cars.length; i++) {
      var c = this.cars[i];
      var d = U.dist2D(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };

  SB.traffic = { Traffic: Traffic };
})(window);
