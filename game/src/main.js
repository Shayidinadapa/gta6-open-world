// Sunset Bay — main.js
// Game bootstrap: renderer, input, state machine (menu / playing /
// paused / busted / wasted), save/load, collisions, smoke particles,
// and the ?shot= staging used for deterministic screenshots.
(function (global) {
  'use strict';
  var SB = global.SB;
  var U = SB.util;
  var THREE = global.THREE;

  SB.bus = SB.bus || U.Bus();

  function params() {
    var q = new URLSearchParams(global.location.search);
    return {
      seed: parseInt(q.get('seed') || '20261120', 10),
      shot: q.get('shot') || null
    };
  }

  function Game() {
    this.p = params();
    this.rng = U.mulberry32(this.p.seed);
    this.state = 'menu';
    this.money = 500;
    this.xp = 0;
    this.level = 1;
    this.health = 100;
    this.lastHurt = -99;
    this.timeOfDay = 10;
    this.elapsed = 0;
    this.playerCar = null; // the car the player owns / last drove
    this.smoke = [];
    this.input = { up: false, down: false, left: false, right: false, shift: false };
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.shotStaged = false;
  }

  Game.prototype.xpNeeded = function () { return 100 * this.level; };

  Game.prototype.addXp = function (n) {
    this.xp += n;
    while (this.xp >= this.xpNeeded()) {
      this.xp -= this.xpNeeded();
      this.level++;
      this.hud.toast('Level up! You are now LV ' + this.level);
      SB.audio.jingle(true);
    }
  };

  Game.prototype.save = function () {
    try {
      global.localStorage.setItem('sunsetbay-save-v1', JSON.stringify({
        money: this.money, xp: this.xp, level: this.level,
        storyIndex: this.missions.storyIndex
      }));
    } catch (e) { /* storage unavailable (private mode, etc.) */ }
  };

  Game.prototype.load = function () {
    try {
      var raw = global.localStorage.getItem('sunsetbay-save-v1');
      if (!raw) return;
      var s = JSON.parse(raw);
      if (typeof s.money === 'number') this.money = s.money;
      if (typeof s.xp === 'number') this.xp = s.xp;
      if (typeof s.level === 'number') this.level = s.level;
      if (typeof s.storyIndex === 'number') this.missions.storyIndex = s.storyIndex;
    } catch (e) { /* corrupt save: start fresh */ }
  };

  Game.prototype.init = function () {
    var canvas = U.el('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    this.renderer.setSize(global.innerWidth, global.innerHeight);
    this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9db8cc);
    this.camera = new THREE.PerspectiveCamera(62, global.innerWidth / global.innerHeight, 0.1, 900);
    this.camera.position.set(0, 8, -14);

    this.city = new SB.city.City(this.scene, this.rng);
    this.traffic = new SB.traffic.Traffic(this.scene, this.city, this.rng);
    this.player = new SB.player.Player(this.scene, this.city, { x: 0, z: 34, heading: Math.PI });
    this.police = new SB.police.Police(this.scene, this.city, this.rng);
    this.missions = new SB.missions.Missions(this.scene, this.city, this.rng, SB.bus);
    this.combat = new SB.combat.Combat(this.scene, this.camera);
    this.hud = new SB.hud.HUD();
    SB.game = { player: this.player, police: this.police, missions: this.missions, traffic: this.traffic, city: this.city, game: this };

    // Starting car parked by the plaza so the player can drive right away.
    var startMesh = SB.cars.makeCarMesh(0x2980b9, {});
    this.scene.add(startMesh);
    this.playerCar = new SB.cars.Car(startMesh, { x: 10, z: 34, heading: Math.PI / 2, maxSpeed: 27, accel: 15 });
    this.playerCar.taken = true;

    this._bindInput();
    this._bindBus();
    this._bindButtons();
    this.load();
    this.city.update(this.timeOfDay);
    this.hud.showMenu('menu-start');
    this._makeSmokePool();

    var self = this;
    global.addEventListener('resize', function () {
      self.camera.aspect = global.innerWidth / global.innerHeight;
      self.camera.updateProjectionMatrix();
      self.renderer.setSize(global.innerWidth, global.innerHeight);
    });
    this._loop();
  };

  Game.prototype._makeSmokePool = function () {
    for (var i = 0; i < 36; i++) {
      var m = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0 })
      );
      m.visible = false;
      this.scene.add(m);
      this.smoke.push({ mesh: m, life: 0 });
    }
  };

  Game.prototype._spawnSmoke = function (x, y, z) {
    for (var i = 0; i < this.smoke.length; i++) {
      var s = this.smoke[i];
      if (s.life <= 0) {
        s.life = 0.9;
        s.mesh.visible = true;
        s.mesh.position.set(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5));
        s.mesh.scale.setScalar(0.7);
        return;
      }
    }
  };

  Game.prototype._updateSmoke = function (dt) {
    for (var i = 0; i < this.smoke.length; i++) {
      var s = this.smoke[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      s.mesh.position.y += dt * 1.6;
      s.mesh.scale.setScalar(s.mesh.scale.x + dt * 1.4);
      s.mesh.material.opacity = Math.max(0, s.life / 0.9) * 0.55;
    }
  };

  Game.prototype._bindBus = function () {
    var self = this;
    SB.bus.on('mission-complete', function (data) {
      self.money += data.reward;
      self.addXp(data.xp);
      self.hud.toast(data.def.name + ' complete! +' + U.fmtMoney(data.reward) + '  +' + data.xp + ' XP');
      self.save();
    });
    SB.bus.on('mission-start', function (data) {
      self.hud.toast(data.def.name + ' — ' + data.def.brief);
    });
    SB.bus.on('collision', function (data) {
      SB.audio.collision(data.hard);
    });
    SB.bus.on('player-hit', function (data) {
      self.hurt(data.amount);
    });
    SB.bus.on('wanted', function (data) {
      if (data.wanted > 0) self.hud.toast('Wanted level ' + data.wanted + ' — lose the cops!');
    });
    SB.bus.on('wreck', function (data) {
      self.hud.toast('Car wrecked!');
      SB.audio.collision(true);
    });
  };

  Game.prototype.hurt = function (amount) {
    if (this.state !== 'playing') return;
    this.health = Math.max(0, this.health - amount);
    this.lastHurt = this.elapsed;
    if (this.health <= 0) this._wasted();
  };

  Game.prototype._bindButtons = function () {
    var self = this;
    var start = U.el('btn-start');
    if (start) start.addEventListener('click', function () { SB.audio.ensure(); SB.audio.click(); self.startGame(); });
    var resume = U.el('btn-resume');
    if (resume) resume.addEventListener('click', function () { SB.audio.click(); self.setState('playing'); });
    var rb = U.el('btn-retry-busted');
    if (rb) rb.addEventListener('click', function () { SB.audio.click(); self._respawn('busted'); });
    var rw = U.el('btn-retry-wasted');
    if (rw) rw.addEventListener('click', function () { SB.audio.click(); self._respawn('wasted'); });
  };

  Game.prototype.startGame = function () {
    if (this.state === 'playing') return;
    this.setState('playing');
    SB.audio.ensure();
  };

  Game.prototype.setState = function (s) {
    this.state = s;
    if (s === 'playing') this.hud.hideMenus();
    else if (s === 'paused') this.hud.showMenu('menu-pause');
    else if (s === 'busted') this.hud.showMenu('menu-busted');
    else if (s === 'wasted') this.hud.showMenu('menu-wasted');
  };

  Game.prototype._respawn = function (kind) {
    if (this.player.inCar) this.player.exitCar();
    this.player.x = kind === 'busted' ? 12 : -12;
    this.player.z = 34;
    this.player.heading = Math.PI;
    this.player.mesh.position.set(this.player.x, 0, this.player.z);
    this.health = 100;
    this.police.reset();
    if (kind === 'busted') {
      var fine = Math.min(this.money, 200);
      this.money -= fine;
      this.hud.toast('Busted! Fine ' + U.fmtMoney(fine));
    } else {
      this.money = Math.floor(this.money / 2);
      this.hud.toast('Wasted! The hospital took half your cash.');
    }
    this.save();
    this.setState('playing');
  };

  Game.prototype._wasted = function () {
    SB.audio.jingle(false);
    this.setState('wasted');
  };

  Game.prototype._bindInput = function () {
    var self = this;
    var keyMap = {
      KeyW: 'up', ArrowUp: 'up',
      KeyS: 'down', ArrowDown: 'down',
      KeyA: 'left', ArrowLeft: 'left',
      KeyD: 'right', ArrowRight: 'right',
      ShiftLeft: 'shift', ShiftRight: 'shift'
    };
    global.addEventListener('keydown', function (e) {
      if (keyMap[e.code] !== undefined) {
        self.input[keyMap[e.code]] = true;
        e.preventDefault();
      }
      if (e.repeat) return;
      if (e.code === 'KeyE') self._tryEnterExitCar();
      if (e.code === 'KeyN') self._nextJob();
      if (e.code === 'KeyM') {
        SB.audio.ensure();
        SB.audio.setMuted(!SB.audio.muted);
        self.hud.toast(SB.audio.muted ? 'Sound off' : 'Sound on');
      }
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (self.state === 'playing') self.setState('paused');
        else if (self.state === 'paused') self.setState('playing');
      }
      if (e.code === 'Enter' && self.state === 'menu') self.startGame();
    });
    global.addEventListener('keyup', function (e) {
      if (keyMap[e.code] !== undefined) self.input[keyMap[e.code]] = false;
    });
    var canvas = U.el('game-canvas');
    canvas.addEventListener('mousedown', function (e) {
      self.dragging = true;
      self.lastX = e.clientX; self.lastY = e.clientY;
      self.downX = e.clientX; self.downY = e.clientY;
      self.downTime = performance.now();
    });
    global.addEventListener('mousemove', function (e) {
      if (!self.dragging) return;
      var dx = e.clientX - self.lastX;
      var dy = e.clientY - self.lastY;
      self.lastX = e.clientX; self.lastY = e.clientY;
      self.player.camYaw -= dx * 0.005;
      self.player.camPitch = U.clamp(self.player.camPitch + dy * 0.003, 0.06, 1.05);
    });
    global.addEventListener('mouseup', function (e) {
      // A quick click shoots (on foot); a drag only orbits the camera.
      if (self.dragging && self.downTime) {
        var quick = performance.now() - self.downTime < 250;
        var still = Math.abs(e.clientX - self.downX) < 6 && Math.abs(e.clientY - self.downY) < 6;
        if (quick && still && self.state === 'playing' && !self.player.inCar) self._shoot();
      }
      self.dragging = false;
    });
  };

  Game.prototype._shoot = function () {
    var self = this;
    var origin = this.camera.position.clone();
    var targets = [];
    // Thugs.
    for (var i = 0; i < this.missions.thugs.length; i++) {
      var t = this.missions.thugs[i];
      if (t.alive) {
        targets.push({
          mesh: t.mesh, hp: t.hp, alive: true, kind: 'thug', ref: t,
          onKill: function (hit) {
            hit.ref.alive = false;
            hit.ref.mesh.visible = false;
            SB.bus.emit('crime', { amount: 1 });
            self.missions.reportKill();
          }
        });
      }
    }
    // Police cruisers.
    for (var j = 0; j < this.police.cruisers.length; j++) {
      var c = this.police.cruisers[j];
      if (!c.wrecked) {
        targets.push({
          mesh: c.mesh, hp: c.hp || 4, alive: true, kind: 'cop', ref: c,
          onHit: function (hit) { hit.ref.hp = hit.hp; },
          onKill: function (hit) {
            hit.ref.addDamage(100);
            SB.bus.emit('crime', { amount: 2 });
            self.hud.toast('Cop down — heat up!');
          }
        });
      }
    }
    // Pedestrians (shooting one is a crime).
    for (var k = 0; k < this.traffic.peds.length; k++) {
      var p = this.traffic.peds[k];
      if (!p.hit) {
        targets.push({
          mesh: p.mesh, hp: 1, alive: true, kind: 'ped', ref: p,
          onKill: function (hit) {
            hit.ref.hit = true;
            hit.ref.mesh.rotation.x = -Math.PI / 2;
            SB.bus.emit('crime', { amount: 1 });
            self.hud.toast('Pedestrian down! The city saw that.');
          }
        });
      }
    }
    var hit = this.combat.shoot(targets, origin);
    if (!hit) {
      // Firing in public still draws attention.
      if (this.police.wanted < 1) SB.bus.emit('crime', { amount: 1 });
    }
  };

  Game.prototype._tryEnterExitCar = function () {
    if (this.state !== 'playing') return;
    SB.audio.ensure();
    if (this.player.inCar) {
      this.player.exitCar();
      return;
    }
    var px = this.player.x, pz = this.player.z;
    var best = null, bd = 4.6;
    var cands = [];
    for (var i = 0; i < this.traffic.cars.length; i++) {
      if (!this.traffic.cars[i].taken) cands.push({ car: this.traffic.cars[i], stolen: true });
    }
    if (this.missions.stolenCar && !this.missions.stolenCar.taken) {
      cands.push({ car: this.missions.stolenCar, stolen: false });
    }
    if (this.playerCar && !this.playerCar.wrecked && this.playerCar !== this.player.inCar) {
      cands.push({ car: this.playerCar, stolen: false });
    }
    for (var j = 0; j < cands.length; j++) {
      var d = U.dist2D(px, pz, cands[j].car.x, cands[j].car.z);
      if (d < bd) { bd = d; best = cands[j]; }
    }
    if (!best) return;
    best.car.taken = true;
    this.playerCar = best.car;
    this.player.enterCar(best.car);
    SB.audio.pickup();
    if (best.stolen) {
      SB.bus.emit('crime', { amount: 1 });
      this.hud.toast('Car stolen! Wanted level up.');
    }
  };

  Game.prototype._nextJob = function () {
    if (this.state !== 'playing') return;
    if (this.missions.active) {
      this.hud.toast('Finish the current job first: ' + this.missions.objectiveText());
      return;
    }
    if (this.missions.currentDef()) {
      this.missions.startStory();
    } else {
      this.missions.startFare(this.player);
    }
  };

  Game.prototype._collideCars = function (dt) {
    var pc = this.player.inCar;
    if (!pc || pc.wrecked) return;
    // Player car vs traffic.
    for (var i = 0; i < this.traffic.cars.length; i++) {
      var t = this.traffic.cars[i];
      if (t.taken || t.wrecked) continue;
      var d = U.dist2D(pc.x, pc.z, t.x, t.z);
      if (d < 3.4 && d > 0.01) {
        var push = (3.4 - d) / 2;
        var nx = (pc.x - t.x) / d, nz = (pc.z - t.z) / d;
        pc.x += nx * push; pc.z += nz * push;
        t.x -= nx * push; t.z -= nz * push;
        var impact = Math.abs(pc.speed) + Math.abs(t.speed);
        if (impact > 6) {
          pc.addDamage(impact * 0.55);
          t.addDamage(impact * 0.8);
          SB.audio.collision(impact > 18);
        }
        pc.speed *= 0.6;
        t.speed *= 0.5;
      }
    }
    // Player car vs pedestrians.
    for (var j = 0; j < this.traffic.peds.length; j++) {
      var p = this.traffic.peds[j];
      if (p.hit) continue;
      var dp = U.dist2D(pc.x, pc.z, p.x, p.z);
      if (dp < 2.3 && Math.abs(pc.speed) > 3) {
        p.hit = true;
        p.mesh.rotation.x = -Math.PI / 2;
        SB.bus.emit('crime', { amount: 1 });
        SB.audio.collision(false);
        this.hud.toast('You hit a pedestrian!');
      }
    }
    // Player car vs police cruisers.
    for (var k = 0; k < this.police.cruisers.length; k++) {
      var c = this.police.cruisers[k];
      if (c.wrecked) continue;
      var dc = U.dist2D(pc.x, pc.z, c.x, c.z);
      if (dc < 3.4 && dc > 0.01) {
        var px2 = (pc.x - c.x) / dc, pz2 = (pc.z - c.z) / dc;
        pc.x += px2 * 0.5; pc.z += pz2 * 0.5;
        pc.addDamage(4);
        c.addDamage(6);
      }
    }
  };

  Game.prototype._stageShot = function () {
    var shot = this.p.shot;
    if (!shot || this.shotStaged) return;
    this.shotStaged = true;
    this.state = 'playing';
    this.hud.hideMenus();
    if (shot === 'vista') {
      this.timeOfDay = 10;
      // On the plaza road looking west: the road stretches ahead, the
      // mission beacon stands mid-distance, and the skyline frames it —
      // instead of standing 10u from the beacon with it filling the lens.
      this.player.x = 24; this.player.z = 24; this.player.heading = -Math.PI / 2;
      this.player.camYaw = Math.PI / 2;
      // Low pitch: a near-horizontal view down the road at the beacon and
      // the skyline, not a top-down shot of the asphalt.
      this.player.camPitch = 0.28;
      this.missions.startStory();
    } else if (shot === 'chase') {
      this.timeOfDay = 16;
      var mesh = SB.cars.makeCarMesh(0xff2d55, { sport: true });
      this.scene.add(mesh);
      var car = new SB.cars.Car(mesh, { x: 0, z: -24, heading: Math.PI / 2, maxSpeed: 34, accel: 18 });
      car.taken = true;
      this.playerCar = car;
      this.player.enterCar(car);
      car.speed = 24;
      this.police.wanted = 3;
      this.police.spawnCruiser(car.x, car.z);
      this.police.spawnCruiser(car.x, car.z);
    } else if (shot === 'mission') {
      this.timeOfDay = 13;
      this.missions.storyIndex = 1;
      this.missions.startStory();
      var m2 = SB.cars.makeCarMesh(0x27ae60, {});
      this.scene.add(m2);
      // Drive WEST toward the docks beacon so the beacon stays ahead in
      // frame (heading east drives away from it and it leaves the shot).
      var car2 = new SB.cars.Car(m2, { x: -150, z: -24, heading: -Math.PI / 2, maxSpeed: 27, accel: 15 });
      car2.taken = true;
      this.playerCar = car2;
      this.player.enterCar(car2);
      car2.speed = 12;
    } else if (shot === 'night') {
      this.timeOfDay = 22;
      this.player.x = 118; this.player.z = -60; this.player.heading = Math.PI / 2;
      this.player.camYaw = -Math.PI / 2;
    }
    this.city.update(this.timeOfDay);
  };

  Game.prototype._loop = function () {
    var self = this;
    var last = performance.now();
    function frame(now) {
      requestAnimationFrame(frame);
      var dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      self._tick(dt);
    }
    requestAnimationFrame(frame);
  };

  Game.prototype._tick = function (dt) {
    this._stageShot();
    if (this.state === 'playing') {
      this.elapsed += dt;
      this.timeOfDay = (this.timeOfDay + dt / 600) % 24;
      this.city.update(this.timeOfDay);
      var car = this.player.inCar;
      if (car) {
        var throttle = (this.input.up ? 1 : 0) + (this.input.down ? -1 : 0);
        var steer = (this.input.left ? -1 : 0) + (this.input.right ? 1 : 0);
        car.drive(throttle, steer, dt, this.city);
        var puff = car.smokeTick(dt);
        if (puff) this._spawnSmoke(puff.x, puff.y, puff.z);
        SB.audio.setEngine(Math.abs(car.speed) / car.maxSpeed, true);
      } else {
        this.player.updateOnFoot(this.input, dt);
        SB.audio.setEngine(0, false);
      }
      var danger = car ? { x: car.x, z: car.z } : { x: this.player.x, z: this.player.z };
      this.traffic.update(dt, car, danger);
      var res = this.police.update(dt, this.player, car);
      SB.audio.setSiren(this.police.cruisers.length > 0, dt);
      this.missions.update(dt, this.player, car);
      this.combat.update(dt);
      this._collideCars(dt);
      this._updateSmoke(dt);
      // Health regen after 6s without damage.
      if (this.elapsed - this.lastHurt > 6 && this.health < 100) {
        this.health = Math.min(100, this.health + 2 * dt);
      }
      if (res.busted) {
        SB.audio.jingle(false);
        this.setState('busted');
      }
      this.player.updateCamera(this.camera, dt);
      this.hud.update({
        wanted: this.police.wanted,
        money: this.money,
        level: this.level,
        xpInLevel: this.xp,
        health: this.health,
        objective: this.missions.objectiveText(),
        inCar: !!car,
        speed: car ? car.speed : 0,
        carDamage: car ? car.damage : 0,
        px: car ? car.x : this.player.x,
        pz: car ? car.z : this.player.z,
        heading: car ? car.heading : this.player.heading,
        camYaw: this.player.camYaw,
        target: this.missions.targetPos(),
        traffic: this.traffic.cars,
        police: this.police.cruisers
      });
    } else {
      // Menus still render the city behind them.
      this.city.update(this.timeOfDay);
      this.player.updateCamera(this.camera, dt);
      this.traffic.update(dt, null, null);
    }
    this.renderer.render(this.scene, this.camera);
  };

  // Debug / playtest hook (also lets the screenshot script drive the game).
  Game.prototype.snapshot = function () {
    var car = this.player.inCar;
    return {
      state: this.state,
      x: car ? car.x : this.player.x,
      z: car ? car.z : this.player.z,
      inCar: !!car,
      speed: car ? car.speed : this.player.speed,
      wanted: this.police.wanted,
      health: this.health,
      money: this.money,
      mission: this.missions.active ? this.missions.active.def.id + ':' + this.missions.active.step : null,
      objective: this.missions.objectiveText(),
      target: this.missions.targetPos(),
      heading: car ? car.heading : this.player.heading,
      camYaw: this.player.camYaw,
      cruisers: this.police.cruisers.length,
      timeOfDay: this.timeOfDay
    };
  };

  global.addEventListener('DOMContentLoaded', function () {
    try {
      var game = new Game();
      game.init();
      global.__game = game;
      global.__snapshot = function () { return game.snapshot(); };
    } catch (e) {
      document.body.innerHTML += '<pre id="fatal" style="color:#f00">FATAL: ' + e.message + '</pre>';
      global.__fatal = String(e && e.stack || e);
    }
  });
})(window);
