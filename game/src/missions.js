// Sunset Bay — missions.js
// Story missions, objective tracking, and repeatable side jobs (taxi fares).
// Kai "Rook" Mercer works for Mara Voss, a fixer in Sunset Bay. Five story
// jobs, then free roam with fares. All names and story are original.
(function () {
  'use strict';

  var U = window.SB.util;

  var STORY = [
    {
      id: 'first-fare',
      title: 'First Fare',
      giver: 'Mara Voss',
      briefing: 'Mara needs a driver she can trust. Get in a car and take her client across town to the marina hotel.',
      steps: [
        { type: 'enterCar', text: 'Get in a car (walk up to one and press E)' },
        { type: 'driveTo', x: 104, z: 208, radius: 10, text: 'Drive the client to the Marina Hotel' }
      ],
      reward: 150
    },
    {
      id: 'hot-wheels',
      title: 'Hot Wheels',
      giver: 'Mara Voss',
      briefing: 'A Comet GT is parked outside the Uptown showroom. Take it — quietly — and bring it to the garage on Westside.',
      steps: [
        { type: 'stealCar', x: 156, z: -156, radius: 8, text: 'Steal the Comet GT (press E near it)' },
        { type: 'deliverCar', x: -156, z: 52, radius: 10, text: 'Deliver the Comet to the Westside garage' }
      ],
      reward: 300
    },
    {
      id: 'heat-wave',
      title: 'Heat Wave',
      giver: 'Mara Voss',
      briefing: 'The SBPD is onto you. Two stars. Lay low, break line of sight, and let the heat die down.',
      steps: [
        { type: 'evade', text: 'Lose the cops — stay out of sight until the wanted level clears' }
      ],
      reward: 250
    },
    {
      id: 'the-pickup',
      title: 'The Pickup',
      giver: 'Mara Voss',
      briefing: 'A package is waiting in Old Town. The Harbormen want it too — expect trouble. Grab it and bring it to Mara.',
      steps: [
        { type: 'goto', x: -156, z: -156, radius: 8, text: 'Reach the package in Old Town (on foot)' },
        { type: 'combat', text: 'Deal with the Harbormen' },
        { type: 'driveTo', x: 0, z: -52, radius: 10, text: 'Bring the package to Mara in Midtown' }
      ],
      reward: 500
    },
    {
      id: 'big-score',
      title: 'The Big Score',
      giver: 'Mara Voss',
      briefing: 'One last job: the vault money is in the trunk. Three stars and the whole SBPD on your tail. Get to the hideout in East End — fast.',
      steps: [
        { type: 'enterCar', text: 'Get in a car — any car' },
        { type: 'driveTo', x: 208, z: 0, radius: 10, text: 'Reach the East End hideout before the timer runs out', time: 150 }
      ],
      reward: 800
    }
  ];

  function Missions(rng) {
    this.rng = rng;
    this.index = 0;        // story mission index
    this.step = 0;         // step inside the mission
    this.state = 'idle';   // idle | active | done | freeroam
    this.timer = 0;        // per-step countdown (0 = none)
    this.fare = null;      // active side job
    this.faresDone = 0;
    this.xp = 0;           // experience: missions +100, fares +25
    this.onEvent = null;   // (event, data) — banner, sound, wanted hooks
  }

  /** Level from XP: every 300 XP is a level. */
  Missions.prototype.level = function () {
    return 1 + Math.floor(this.xp / 300);
  };

  Missions.prototype.current = function () {
    return this.index < STORY.length ? STORY[this.index] : null;
  };

  Missions.prototype.currentStep = function () {
    var m = this.current();
    return m ? m.steps[this.step] : null;
  };

  Missions.prototype.objective = function () {
    if (this.state === 'freeroam' && this.fare) return this.fare.step;
    var s = this.currentStep();
    return s || null;
  };

  Missions.prototype.start = function () {
    this.state = 'active';
    this.step = 0;
    this.timer = 0;
    var m = this.current();
    if (m) this.emit('briefing', m);
  };

  Missions.prototype.emit = function (event, data) {
    if (this.onEvent) this.onEvent(event, data);
  };

  /** Advance one step; complete the mission when the steps run out. */
  Missions.prototype.advance = function (ctx) {
    var m = this.current();
    if (!m) return;
    this.step++;
    this.timer = 0;
    window.SB.audio.chime();
    if (this.step >= m.steps.length) {
      ctx.player.cash += m.reward;
      this.xp += 100;
      this.emit('missionComplete', m);
      window.SB.audio.fanfare();
      this.index++;
      if (this.index >= STORY.length) {
        this.state = 'freeroam';
        this.emit('storyDone', null);
      } else {
        this.state = 'active';
        this.step = 0;
        this.emit('briefing', this.current());
      }
    } else {
      var s = m.steps[this.step];
      if (s.time) this.timer = s.time;
      this.emit('step', s);
    }
  };

  /**
   * Per-frame objective check. ctx: {player, wanted, rivalsAlive, time}.
   * Returns nothing; emits events and advances steps.
   */
  Missions.prototype.update = function (dt, ctx) {
    var step = this.objective();
    if (!step) return;
    if (step.time && this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.emit('failed', { reason: 'Out of time — the job fell through.' });
        this.timer = 0;
        // Retry the step instead of failing the whole mission.
        if (step.time) this.timer = step.time;
        return;
      }
    }
    var p = ctx.player;
    switch (step.type) {
      case 'enterCar':
        if (p.inCar) this.advance(ctx);
        break;
      case 'driveTo':
      case 'goto':
        if (U.dist2(p.x, p.z, step.x, step.z) < step.radius) this.advance(ctx);
        break;
      case 'stealCar':
        if (p.inCar && p.inCar.stolen) this.advance(ctx);
        break;
      case 'deliverCar':
        if (p.inCar && p.inCar.stolen && U.dist2(p.x, p.z, step.x, step.z) < step.radius) {
          p.inCar.stolen = false;
          this.advance(ctx);
        }
        break;
      case 'evade':
        if (ctx.wanted <= 0) this.advance(ctx);
        break;
      case 'combat':
        if (ctx.rivalsAlive <= 0) this.advance(ctx);
        break;
      default:
        break;
    }
    // Side fare: pick up the fare, then deliver them.
    if (this.state === 'freeroam' && this.fare) {
      var f = this.fare;
      if (!f.pickedUp && U.dist2(p.x, p.z, f.px, f.pz) < 6) {
        f.pickedUp = true;
        this.emit('farePickup', f);
        window.SB.audio.chime();
      } else if (f.pickedUp && U.dist2(p.x, p.z, f.dx, f.dz) < 8) {
        p.cash += f.pay;
        this.xp += 25;
        this.faresDone++;
        this.emit('fareDone', f);
        window.SB.audio.fanfare();
        this.fare = null;
      }
    }
  };

  /** Offer a new taxi fare somewhere in the city. */
  Missions.prototype.newFare = function (city) {
    var a = city.roadPoint(this.rng);
    var b = city.roadPoint(this.rng);
    this.fare = {
      px: a.x, pz: a.z, dx: b.x, dz: b.z,
      pay: 40 + Math.floor(this.rng() * 60),
      pickedUp: false,
      step: { type: 'fare', x: a.x, z: a.z, radius: 6, text: 'Pick up the fare' }
    };
    this.emit('fareNew', this.fare);
    return this.fare;
  };

  // ---------------------------------------------------------------- peds

  /** Pedestrians strolling the sidewalks; they flee gunfire. */
  function Pedestrians(scene, city, rng, count) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.list = [];
    var shirts = [0xd8d8d8, 0x3b7ac2, 0xc23b3b, 0x4a9a5a, 0xe8c23b, 0x8a5ac2, 0xdddddd];
    for (var i = 0; i < count; i++) {
      var mesh = new THREE.Group();
      var shirt = new THREE.MeshLambertMaterial({ color: shirts[i % shirts.length] });
      var pants = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
      var skin = new THREE.MeshLambertMaterial({ color: [0xc98e6a, 0x8a5a3b, 0xe8b88a][i % 3] });
      var torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), shirt);
      torso.position.y = 1.05;
      mesh.add(torso);
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
      head.position.y = 1.55;
      mesh.add(head);
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), pants);
      leg.position.set(-0.13, 0.35, 0);
      mesh.add(leg);
      var leg2 = leg.clone();
      leg2.position.x = 0.13;
      mesh.add(leg2);
      var p = city.roadPoint(rng);
      // Stand on a sidewalk next to the road.
      var px = p.x + (rng() < 0.5 ? 9 : -9);
      var pz = p.z;
      mesh.position.set(px, 0, pz);
      scene.add(mesh);
      this.list.push({
        mesh: mesh, x: px, z: pz, heading: rng() * Math.PI * 2,
        speed: 1 + rng() * 1.2, hp: 100, alive: true,
        fleeing: 0, phase: rng() * 6
      });
    }
  }

  Pedestrians.prototype.update = function (dt, danger) {
    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i];
      if (!p.alive) continue;
      if (danger) p.fleeing = 3;
      if (p.fleeing > 0) {
        p.fleeing -= dt;
        p.speed = 5.5;
      } else {
        p.speed = 1.4;
      }
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += Math.cos(p.heading) * p.speed * dt;
      // Turn at intersections or city edge.
      var onRoad = false;
      for (var k = 0; k < this.city.centers.length; k++) {
        if (Math.abs(p.x - this.city.centers[k]) < 3 || Math.abs(p.z - this.city.centers[k]) < 3) { onRoad = true; break; }
      }
      if (onRoad && this.rng() < dt * 0.4) p.heading += (this.rng() - 0.5) * 2.2;
      if (Math.abs(p.x) > this.city.cityHalf + 20 || Math.abs(p.z) > this.city.cityHalf + 20) {
        p.heading += Math.PI;
      }
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      p.phase += dt * p.speed * 2;
      p.mesh.children[2].rotation.x = Math.sin(p.phase) * 0.5;
      p.mesh.children[3].rotation.x = -Math.sin(p.phase) * 0.5;
    }
  };

  window.SB.missions = { Missions: Missions, STORY: STORY, Pedestrians: Pedestrians };
})();
