// Sunset Bay — combat.js
// On-foot combat: hitscan shooting with a crosshair ray, rival gunmen who
// shoot back, and the tracer data the renderer draws.
(function () {
  'use strict';

  /**
   * Hitscan shot from the camera through the screen center.
   * targets: [{x, z, hp, alive, onDeath}] — wrappers the caller syncs back.
   * Returns {from, to, hit} or null when the weapon is cooling down.
   */
  function fireShot(player, camera, targets) {
    if (player.shootCooldown > 0 || player.inCar) return null;
    player.shootCooldown = 0.28;
    window.SB.audio.shot();
    var dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    var origin = camera.position.clone();
    var best = null, bestD = 70;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (!t.alive) continue;
      var to = new THREE.Vector3(t.x - origin.x, 1.2 - origin.y, t.z - origin.z);
      var d = to.length();
      if (d > 70 || d < 0.5) continue;
      to.normalize();
      if (to.dot(dir) < 0.965) continue; // must be near the crosshair
      if (d < bestD) { bestD = d; best = t; }
    }
    var end = origin.clone().add(dir.clone().multiplyScalar(best ? bestD : 60));
    if (best) {
      best.hp -= 34;
      if (best.hp <= 0) {
        best.alive = false;
        if (best.onDeath) best.onDeath();
      }
    }
    return { from: origin, to: end, hit: best };
  }

  /** Armed rivals: Harbormen gunmen who take cover and shoot at the player. */
  function Rivals(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.list = [];
  }

  Rivals.prototype.spawn = function (x, z, count) {
    for (var i = 0; i < count; i++) {
      var mesh = window.SB.player.makeHeroMesh();
      // Dark jackets for the Harbormen.
      mesh.traverse(function (c) {
        if (c.isMesh && c.material && c.material.color && c.material.color.getHex() === 0x27435f) {
          c.material = c.material.clone();
          c.material.color.setHex(0x3a3a3a);
        }
        if (c.isMesh && c.material && c.material.color && c.material.color.getHex() === 0xc23b3b) {
          c.material = c.material.clone();
          c.material.color.setHex(0x1c1c1c);
        }
      });
      var rx = x + (this.rng() - 0.5) * 14;
      var rz = z + (this.rng() - 0.5) * 14;
      mesh.position.set(rx, 0, rz);
      this.scene.add(mesh);
      this.list.push({
        mesh: mesh, x: rx, z: rz, hp: 100, alive: true,
        shootTimer: 1 + this.rng() * 2
      });
    }
  };

  /** Rivals strafe toward the player and fire wild shots that can hurt. */
  Rivals.prototype.update = function (dt, player, onPlayerHit) {
    var alive = 0;
    for (var i = 0; i < this.list.length; i++) {
      var r = this.list[i];
      if (!r.alive) continue;
      alive++;
      var dx = player.x - r.x, dz = player.z - r.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d > 26) {
        // Close the distance.
        r.x += (dx / d) * 3.2 * dt;
        r.z += (dz / d) * 3.2 * dt;
      } else if (d < 8) {
        // Back off a little.
        r.x -= (dx / d) * 2 * dt;
        r.z -= (dz / d) * 2 * dt;
      }
      r.mesh.position.set(r.x, 0, r.z);
      r.mesh.rotation.y = Math.atan2(dx, dz);
      r.shootTimer -= dt;
      if (r.shootTimer <= 0 && d < 40 && !player.inCar) {
        r.shootTimer = 1.4 + this.rng() * 1.2;
        window.SB.audio.shot();
        // Wild aim: roughly one in three shots lands.
        if (this.rng() < 0.34) onPlayerHit(6 + this.rng() * 6);
      }
    }
    return alive;
  };

  Rivals.prototype.clear = function () {
    for (var i = 0; i < this.list.length; i++) this.scene.remove(this.list[i].mesh);
    this.list = [];
  };

  window.SB.combat = { fireShot: fireShot, Rivals: Rivals };
})();
