// Sunset Bay — missions.js
// Five story missions from fixer Mara Voss, plus repeatable fares.
// Each mission is a small state machine with waypoints, a 3D beacon, and
// a GPS route on the minimap. Rewards pay money and XP.
(function (global) {
  'use strict';
  var SB = global.SB;
  var U = SB.util;
  var THREE = global.THREE;

  var STORY = [
    {
      id: 'm1', name: 'First Fare',
      brief: 'Mara Voss needs a driver. Pick up her contact at the plaza and drop him at the pier.',
      steps: [
        { type: 'goto', label: 'Pick up the contact at Meridian Plaza', x: 0, z: 24, radius: 6 },
        { type: 'goto', label: 'Drop him at Sunset Pier (south beach)', x: -120, z: 200, radius: 8 }
      ],
      reward: 350, xp: 120
    },
    {
      id: 'm2', name: 'The Drop',
      brief: 'A package waits at the docks. Grab it and deliver it to the neon district. Cops are watching — expect heat.',
      steps: [
        { type: 'goto', label: 'Collect the package at the docks', x: -168, z: -24, radius: 6 },
        { type: 'goto', label: 'Deliver to the Coral Club, neon district', x: 120, z: -72, radius: 8, heat: 2 }
      ],
      reward: 600, xp: 200
    },
    {
      id: 'm3', name: 'Shakedown',
      brief: 'Three thugs are shaking down Mara\'s warehouse. Go in on foot and clear them out.',
      steps: [
        { type: 'goto', label: 'Reach the warehouse on the west side', x: -144, z: 72, radius: 8 },
        { type: 'combat', label: 'Clear out the thugs (3)', x: -144, z: 72, radius: 16, count: 3 }
      ],
      reward: 800, xp: 260
    },
    {
      id: 'm4', name: 'Hot Wheels',
      brief: 'A crimson sports car is parked by the park. Steal it and bring it to the chop shop — the law will notice.',
      steps: [
        { type: 'steal', label: 'Steal the crimson sports car at the park', x: 144, z: -144, radius: 6 },
        { type: 'goto', label: 'Deliver it to the chop shop', x: -72, z: 168, radius: 8, heat: 3, needCar: true }
      ],
      reward: 1200, xp: 380
    },
    {
      id: 'm5', name: 'The Big One',
      brief: 'The Meridian Bank job. Grab the take, then lose a five-star chase and reach the safehouse.',
      steps: [
        { type: 'goto', label: 'Hit the Meridian Bank downtown', x: 24, z: 24, radius: 8 },
        { type: 'escape', label: 'Escape the chase and reach the safehouse', x: -168, z: 168, radius: 9, heat: 5 }
      ],
      reward: 3000, xp: 800
    }
  ];

  function Missions(scene, city, rng, bus) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.bus = bus;
    this.storyIndex = 0;
    this.active = null; // {def, step, target}
    this.fare = null;
    this.beacon = null;
    this.thugs = [];
    this.stolenCar = null;
    this.escapeTimer = 0;
  }

  Missions.prototype.currentDef = function () {
    return STORY[this.storyIndex] || null;
  };

  Missions.prototype.startStory = function () {
    var def = this.currentDef();
    if (!def) return false;
    this.active = { def: def, step: 0, kind: 'story' };
    this._showBeacon();
    this._applyStepHeat(this.currentStep());
    var first = this.currentStep();
    if (first && first.type === 'steal') this.spawnStolenCar(first.x, first.z);
    this.bus.emit('mission-start', { def: def });
    return true;
  };

  Missions.prototype.startFare = function (playerPos) {
    if (this.active) return false;
    var a = this.city.randomRoadPoint(this.rng);
    var b = this.city.randomRoadPoint(this.rng);
    while (U.dist2D(a.x, a.z, b.x, b.z) < 90) b = this.city.randomRoadPoint(this.rng);
    var fare = {
      def: {
        id: 'fare', name: 'Fare',
        brief: 'A rider needs a lift across town.',
        steps: [
          { type: 'goto', label: 'Pick up the rider', x: a.x, z: a.z, radius: 6 },
          { type: 'goto', label: 'Drop the rider off', x: b.x, z: b.z, radius: 8 }
        ],
        reward: U.randInt(this.rng, 120, 260), xp: 60
      },
      step: 0, kind: 'fare'
    };
    this.active = fare;
    this._showBeacon();
    this._applyStepHeat(this.currentStep());
    this.bus.emit('mission-start', { def: fare.def });
    return true;
  };

  Missions.prototype._showBeacon = function () {
    this._hideBeacon();
    var step = this.currentStep();
    if (!step) return;
    var geo = new THREE.CylinderGeometry(1.6, 1.6, 30, 12, 1, true);
    var mat = new THREE.MeshBasicMaterial({
      color: 0xffd23f, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false
    });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.position.set(step.x, 15, step.z);
    this.scene.add(this.beacon);
    var ring = new THREE.Mesh(
      new THREE.RingGeometry(3, 5, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(step.x, 0.1, step.z);
    this.scene.add(ring);
    this.beacon.userData.ring = ring;
  };

  Missions.prototype._hideBeacon = function () {
    if (!this.beacon) return;
    this.scene.remove(this.beacon);
    if (this.beacon.userData.ring) this.scene.remove(this.beacon.userData.ring);
    this.beacon = null;
  };

  Missions.prototype.currentStep = function () {
    if (!this.active) return null;
    return this.active.def.steps[this.active.step] || null;
  };

  Missions.prototype.objectiveText = function () {
    var step = this.currentStep();
    if (!step) return this.currentDef() ? 'Talk to Mara Voss — press N for the next job' : 'All story missions complete — fares pay the bills (N)';
    if (step.type === 'combat') {
      var left = step.count - (step.done || 0);
      return step.label + ' — ' + Math.max(0, left) + ' left';
    }
    return step.label;
  };

  Missions.prototype.targetPos = function () {
    var step = this.currentStep();
    return step ? { x: step.x, z: step.z } : null;
  };

  Missions.prototype.spawnThugs = function (x, z) {
    this.clearThugs();
    var skinMat = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
    var thugMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
    for (var i = 0; i < 3; i++) {
      var g = new THREE.Group();
      var body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.36), thugMat);
      body.position.y = 1.0;
      g.add(body);
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skinMat);
      head.position.y = 1.72;
      g.add(head);
      var tx = x + U.randRange(this.rng, -8, 8);
      var tz = z + U.randRange(this.rng, -8, 8);
      g.position.set(tx, 0, tz);
      this.scene.add(g);
      this.thugs.push({ mesh: g, x: tx, z: tz, hp: 3, alive: true });
    }
  };

  Missions.prototype.clearThugs = function () {
    for (var i = 0; i < this.thugs.length; i++) this.scene.remove(this.thugs[i].mesh);
    this.thugs = [];
  };

  Missions.prototype.spawnStolenCar = function (x, z) {
    if (this.stolenCar) return this.stolenCar;
    var mesh = SB.cars.makeCarMesh(U.pick(this.rng, SB.cars.SPORTS), { sport: true });
    this.scene.add(mesh);
    var car = new SB.cars.Car(mesh, { x: x, z: z, heading: 0, maxSpeed: 34, accel: 18 });
    this.stolenCar = car;
    return car;
  };

  // Heat is applied when a step becomes active (the chase starts while
  // you do the job, not after you finish it).
  Missions.prototype._applyStepHeat = function (step) {
    if (step && step.heat) this.bus.emit('crime', { amount: step.heat });
  };

  Missions.prototype._completeStep = function () {
    var step = this.currentStep();
    if (!step) return;
    this.active.step++;
    SB.audio.pickup();
    if (this.active.step >= this.active.def.steps.length) {
      this._completeMission();
    } else {
      this._showBeacon();
      var next = this.currentStep();
      this._applyStepHeat(next);
      if (next && next.type === 'combat') this.spawnThugs(next.x, next.z);
      if (next && next.type === 'steal') this.spawnStolenCar(next.x, next.z);
      this.bus.emit('mission-step', { def: this.active.def, step: this.active.step });
    }
  };

  Missions.prototype._completeMission = function () {
    var def = this.active.def;
    var kind = this.active.kind;
    this._hideBeacon();
    this.clearThugs();
    this.active = null;
    SB.audio.jingle(true);
    this.bus.emit('mission-complete', { def: def, reward: def.reward, xp: def.xp, kind: kind });
    if (kind === 'story') this.storyIndex++;
  };

  Missions.prototype.update = function (dt, player, playerCar) {
    if (this.beacon) this.beacon.rotation.y += dt * 1.5;
    var step = this.currentStep();
    if (!step) return;
    var px = playerCar ? playerCar.x : player.x;
    var pz = playerCar ? playerCar.z : player.z;
    var d = U.dist2D(px, pz, step.x, step.z);
    if (step.type === 'goto') {
      if (step.needCar && !playerCar) return;
      if (d < step.radius) this._completeStep();
    } else if (step.type === 'steal') {
      if (playerCar === this.stolenCar && d < step.radius) this._completeStep();
    } else if (step.type === 'combat') {
      // Completion is driven by combat.js via reportKill().
      if ((step.done || 0) >= step.count) this._completeStep();
    } else if (step.type === 'escape') {
      if (d < step.radius) {
        // Must arrive with heat mostly gone to count as escaped.
        if (SB.game && SB.game.police.wanted <= 1) this._completeStep();
      }
    }
  };

  Missions.prototype.reportKill = function () {
    var step = this.currentStep();
    if (!step || step.type !== 'combat') return;
    step.done = (step.done || 0) + 1;
    SB.audio.pickup();
  };

  Missions.prototype.reset = function () {
    this._hideBeacon();
    this.clearThugs();
    if (this.stolenCar) { this.scene.remove(this.stolenCar.mesh); this.stolenCar = null; }
    this.active = null;
    this.storyIndex = 0;
  };

  SB.missions = { Missions: Missions, STORY: STORY };
})(window);
