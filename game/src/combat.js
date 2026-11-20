// Sunset Bay — combat.js
// On-foot shooting: hitscan raycast from the camera, muzzle flash, and
// damage to thugs, police and pedestrians. Firing in public raises heat.
(function (global) {
  'use strict';
  var SB = global.SB;
  var U = SB.util;
  var THREE = global.THREE;

  function Combat(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.flash = new THREE.PointLight(0xffcc66, 0, 18);
    this.scene.add(this.flash);
    this.flashTimer = 0;
    this.cooldown = 0;
    this.shotsFired = 0;
  }

  Combat.prototype.canShoot = function () {
    return this.cooldown <= 0;
  };

  // Fires one hitscan shot from the camera centre. targets is a list of
  // {mesh, x, z, hp, alive, onHit, onKill} entries. Returns what was hit.
  Combat.prototype.shoot = function (targets, origin) {
    if (this.cooldown > 0) return null;
    this.cooldown = 0.22;
    this.shotsFired++;
    SB.audio.shot();
    this.flash.position.copy(origin);
    this.flash.intensity = 3;
    this.flashTimer = 0.06;
    var dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.raycaster.set(origin, dir);
    this.raycaster.far = 90;
    var meshes = [];
    for (var i = 0; i < targets.length; i++) {
      if (targets[i].alive) meshes.push(targets[i].mesh);
    }
    var hits = this.raycaster.intersectObjects(meshes, true);
    if (hits.length === 0) return null;
    var hitObj = hits[0].object;
    var hit = null;
    for (var j = 0; j < targets.length; j++) {
      var t = targets[j];
      if (!t.alive) continue;
      var cur = t.mesh;
      var found = false;
      cur.traverse(function (o) { if (o === hitObj) found = true; });
      if (found || cur === hitObj) { hit = t; break; }
    }
    if (hit) {
      hit.hp -= 1;
      if (hit.onHit) hit.onHit(hit);
      if (hit.hp <= 0) {
        hit.alive = false;
        if (hit.onKill) hit.onKill(hit);
      }
    }
    return hit;
  };

  Combat.prototype.update = function (dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.intensity = 0;
    }
  };

  SB.combat = { Combat: Combat };
})(window);
