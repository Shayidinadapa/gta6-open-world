// Sunset Bay — main.js
// Boot, render loop, camera, input, wanted level, police, save/load and the
// screenshot staging modes (?shot=start|drive|chase|mission).
// An original open-world crime game: Kai "Rook" Mercer drives for Mara Voss.
(function () {
  'use strict';

  var U = window.SB.util;

  var SAVE_KEY = 'sunsetbay-save-v1';

  function params() {
    var q = {};
    window.location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
      var p = kv.split('=');
      if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    return q;
  }

  var Game = {
    state: 'menu', // menu | playing | paused | busted | wasted
    seed: 20261120,
    shot: null,
    wanted: 0,
    wantedTimer: 0,
    seenTimer: 0,
    bustTimer: 0,
    time: 0,
    camYaw: 0,
    camPitch: 0.32,
    camDist: 8,
    shake: 0,
    rivals: [],
    parked: [],
    dangerPulse: 0
  };

  var renderer, scene, camera, city, traffic, police, peds, player, missions, hud, rivals;
  var beacon, beaconRing, tracer, tracerLife = 0, muzzle;
  var keys = {};
  var dragging = false, dragMoved = 0, dragStart = 0, lastPX = 0, lastPY = 0;
  var rng;

  function init() {
    var q = params();
    Game.seed = parseInt(q.seed || '20261120', 10) || 20261120;
    Game.shot = q.shot || null;
    rng = U.mulberry32(Game.seed);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game').appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8fc3e8);
    scene.fog = new THREE.Fog(0xe8c49a, 140, 720);

    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
    camera.position.set(0, 8, -14);

    var hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5c, 1.0);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xffe0b3, 1.4);
    sun.position.set(140, 220, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
    sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
    sun.shadow.camera.far = 700;
    scene.add(sun);

    city = window.SB.city.buildCity(scene, Game.seed, { night: Game.shot === 'night' });
    traffic = new window.SB.traffic.Traffic(scene, city, U.mulberry32(Game.seed + 7), 14);
    police = new window.SB.police.Police(scene, city, U.mulberry32(Game.seed + 13));
    peds = new window.SB.missions.Pedestrians(scene, city, U.mulberry32(Game.seed + 21), 22);
    player = new window.SB.player.Player(scene);
    rivals = new window.SB.combat.Rivals(scene, U.mulberry32(Game.seed + 41));
    missions = new window.SB.missions.Missions(U.mulberry32(Game.seed + 31));
    hud = new window.SB.hud.HUD();

    // Objective beacon: glowing column + ground ring at the target.
    beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23b, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
    );
    beacon.position.y = 30;
    beacon.visible = false;
    scene.add(beacon);
    beaconRing = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23b, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    beaconRing.rotation.x = -Math.PI / 2;
    beaconRing.position.y = 0.15;
    beaconRing.visible = false;
    scene.add(beaconRing);

    // Shot tracer line + muzzle flash light.
    var tracerGeo = new THREE.BufferGeometry();
    tracerGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    tracer.visible = false;
    tracer.frustumCulled = false;
    scene.add(tracer);
    muzzle = new THREE.PointLight(0xffc866, 0, 18);
    scene.add(muzzle);

    spawnParkedCars();
    wireMissions();
    wireInput();
    wireButtons();
    loadSavePreview();
    makeClouds();
    applyTimeOfDay();

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Screenshot staging: pre-configure the world before the first frame.
    if (Game.shot) stageShot(Game.shot);
    if (Game.shot && Game.shot !== 'start') Game.snapCamera = true;
    if (Game.shot === 'start') {
      hud.showMenu(false);
    } else if (Game.shot) {
      startGame(false);
    } else {
      hud.showMenu(false);
    }

    requestAnimationFrame(loop);
  }

  /** Parked cars the player can steal, including the mission Comet GT. */
  function spawnParkedCars() {
    var spots = [
      { x: 0, z: -104, kind: 'sedan', color: 0x3b7ac2 },
      { x: -52, z: 52, kind: 'sedan', color: 0xe8e8e8 },
      { x: 104, z: 0, kind: 'truck', color: 0x4a9a5a },
      { x: 52, z: -156, kind: 'sedan', color: 0xc2703b },
      { x: 156, z: -156, kind: 'sport', color: 0xc23b3b, comet: true }
    ];
    spots.forEach(function (s) {
      var mesh = window.SB.cars.makeCarMesh({ color: s.color, kind: s.kind });
      var car = window.SB.cars.makeCarState(mesh, s.kind);
      car.x = s.x; car.z = s.z;
      car.heading = (rng() < 0.5 ? 0 : Math.PI / 2);
      car.name = s.comet ? 'Comet GT' : window.SB.cars.CAR_NAMES[Math.floor(rng() * 9)];
      car.parked = true;
      car.comet = !!s.comet;
      window.SB.cars.syncCarMesh(car, 0);
      scene.add(mesh);
      Game.parked.push(car);
    });
    // Player starts on foot near the marina hotel.
    player.x = 96; player.z = 190;
    player.camYaw = Math.PI;
    Game.camYaw = Math.PI;
  }

  function wireMissions() {
    missions.onEvent = function (event, data) {
      if (event === 'briefing') {
        if (!Game.suppressBanner) hud.banner(data.title, data.giver + ': ' + data.briefing, 4200);
        hud.feed('New job: ' + data.title);
        if (data.id === 'heat-wave') setWanted(2);
        if (data.id === 'big-score') setWanted(3);
        if (data.id === 'the-pickup') rivals.spawn(-156, -156, 3);
      } else if (event === 'missionComplete') {
        hud.banner('Job Complete', data.title + ' — $' + data.reward + ' earned', 3200);
        hud.feed('+$' + data.reward + ' — ' + data.title);
      } else if (event === 'storyDone') {
        hud.banner('Sunset Bay Is Yours', 'Story complete. Free roam — fares keep coming.', 4200);
        missions.newFare(city);
      } else if (event === 'failed') {
        hud.banner('Job Failed', data.reason, 3000);
      } else if (event === 'fareNew') {
        hud.feed('New fare: pick up the passenger ($' + data.pay + ')');
      } else if (event === 'farePickup') {
        hud.feed('Fare aboard — deliver them to the marker');
      } else if (event === 'fareDone') {
        hud.banner('Fare Complete', '$' + data.pay + ' earned', 2200);
        setTimeout(function () { missions.newFare(city); }, 4000);
      }
    };
  }

  function setWanted(n) {
    Game.wanted = Math.max(0, Math.min(5, n));
    Game.wantedTimer = 0;
    hud.setStars(Game.wanted);
  }

  function addWanted(n) {
    setWanted(Game.wanted + n);
    Game.seenTimer = 0;
  }

  function wireInput() {
    window.addEventListener('keydown', function (e) {
      if (e.code === 'Escape') {
        if (Game.state === 'playing') pauseGame(true);
        else if (Game.state === 'paused') pauseGame(false);
        return;
      }
      keys[e.code] = true;
      if (e.code === 'Space') e.preventDefault();
      if (e.code === 'KeyE' && Game.state === 'playing') tryEnterExitCar();
      if (e.code === 'KeyM') {
        window.SB.audio.muted = !window.SB.audio.muted;
        if (window.SB.audio.master) window.SB.audio.master.gain.value = window.SB.audio.muted ? 0 : 0.35;
      }
      if (e.code === 'KeyF' && Game.state === 'playing' && !player.inCar) doShoot();
    });
    window.addEventListener('keyup', function (e) { keys[e.code] = false; });
    var el = renderer.domElement;
    el.addEventListener('pointerdown', function (e) {
      dragging = true; dragMoved = 0; dragStart = performance.now();
      lastPX = e.clientX; lastPY = e.clientY;
    });
    el.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastPX, dy = e.clientY - lastPY;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      lastPX = e.clientX; lastPY = e.clientY;
      Game.camYaw -= dx * 0.005;
      Game.camPitch = U.clamp(Game.camPitch + dy * 0.004, 0.05, 1.1);
    });
    el.addEventListener('pointerup', function (e) {
      var quick = performance.now() - dragStart < 350 && dragMoved < 6;
      dragging = false;
      if (quick && Game.state === 'playing' && !player.inCar) doShoot();
    });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('blur', function () { keys = {}; dragging = false; });
  }

  function inputState() {
    return {
      up: !!(keys.KeyW || keys.ArrowUp),
      down: !!(keys.KeyS || keys.ArrowDown),
      left: !!(keys.KeyA || keys.ArrowLeft),
      right: !!(keys.KeyD || keys.ArrowRight),
      shift: !!keys.ShiftLeft || !!keys.ShiftRight,
      jump: !!keys.Space
    };
  }

  /** E: get into the nearest car, or step out of the one you drive. */
  function tryEnterExitCar() {
    if (player.inCar) {
      var car = player.inCar;
      player.inCar = null;
      player.x = car.x + Math.cos(car.heading + Math.PI / 2) * 3;
      player.z = car.z - Math.sin(car.heading + Math.PI / 2) * 3;
      player.mesh.visible = true;
      car.parked = true;
      if (Game.parked.indexOf(car) < 0) Game.parked.push(car);
      return;
    }
    var best = null, bestD = 4.5;
    var all = Game.parked.concat(traffic.cars);
    for (var i = 0; i < all.length; i++) {
      var c = all[i];
      var d = U.dist2(player.x, player.z, c.x, c.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best) return;
    if (best.parked) {
      var pi = Game.parked.indexOf(best);
      if (pi >= 0) Game.parked.splice(pi, 1);
    } else {
      var ti = traffic.cars.indexOf(best);
      if (ti >= 0) {
        traffic.cars.splice(ti, 1);
        best.stolen = true;
        addWanted(1);
        hud.feed('You stole the ' + best.name + '! The SBPD noticed.');
      }
    }
    best.parked = false;
    player.inCar = best;
    player.mesh.visible = false;
    window.SB.audio.chime();
  }

  function doShoot() {
    var targets = [];
    // Wrappers mirror ped/rival hp; death effects run once in the sync below.
    peds.list.forEach(function (p) {
      targets.push({ x: p.x, z: p.z, hp: p.hp, alive: p.alive, onDeath: null });
    });
    rivals.list.forEach(function (r) {
      targets.push({ x: r.x, z: r.z, hp: r.hp, alive: r.alive, onDeath: null });
    });
    // Sync hp back: the shoot() helper mutates the wrapper objects.
    var res = window.SB.combat.fireShot(player, camera, targets);
    if (!res) return;
    // Write the wrappers' hp/alive back to the real peds and rivals.
    for (var i = 0; i < peds.list.length; i++) {
      peds.list[i].hp = targets[i].hp;
      if (!targets[i].alive && peds.list[i].alive) {
        peds.list[i].alive = false;
        peds.list[i].mesh.rotation.x = -Math.PI / 2;
        addWanted(1);
      }
    }
    for (var j = 0; j < rivals.list.length; j++) {
      var w = targets[peds.list.length + j];
      rivals.list[j].hp = w.hp;
      if (!w.alive && rivals.list[j].alive) {
        rivals.list[j].alive = false;
        rivals.list[j].mesh.rotation.x = -Math.PI / 2;
      }
    }
    // Tracer + muzzle flash.
    var pos = tracer.geometry.attributes.position;
    pos.setXYZ(0, res.from.x, res.from.y, res.from.z);
    pos.setXYZ(1, res.to.x, res.to.y, res.to.z);
    pos.needsUpdate = true;
    tracer.visible = true;
    tracerLife = 0.07;
    muzzle.position.copy(res.from);
    muzzle.intensity = 14;
    Game.shake = Math.max(Game.shake, 0.12);
    peds.update(0, true); // nearby peds flee the gunfire
  }

  function wireButtons() {
    document.getElementById('btn-start').addEventListener('click', function () {
      window.SB.audio.unlock();
      startGame(true);
    });
    document.getElementById('btn-continue').addEventListener('click', function () {
      window.SB.audio.unlock();
      startGame(false);
    });
    document.getElementById('btn-resume').addEventListener('click', function () { pauseGame(false); });
    document.getElementById('btn-restart').addEventListener('click', function () {
      localStorage.removeItem(SAVE_KEY);
      window.location.reload();
    });
    document.getElementById('btn-busted').addEventListener('click', function () {
      hud.hideEnd();
      respawnAfterBust();
    });
    document.getElementById('btn-wasted').addEventListener('click', function () {
      hud.hideEnd();
      respawnAfterWasted();
    });
  }

  function startGame(fresh) {
    hud.hideMenu();
    hud.hideEnd();
    Game.state = 'playing';
    if (fresh) {
      missions.start();
    } else if (missions.state === 'idle') {
      missions.start();
    }
    hud.setObjective(missionText(), 0);
  }

  function pauseGame(on) {
    Game.state = on ? 'paused' : 'playing';
    hud.showPause(on);
  }

  function missionText() {
    if (Game.debugObjective && Game.debugObjective.text) return Game.debugObjective.text;
    var s = missions.objective();
    if (!s) return 'Free roam — explore Sunset Bay.';
    return s.text;
  }

  function respawnAfterBust() {
    player.cash = Math.max(0, player.cash - 100);
    setWanted(0);
    police.ensure(0);
    player.health = 100;
    player.dead = false;
    player.x = 0; player.z = -190;
    if (player.inCar) { player.inCar = null; player.mesh.visible = true; }
    Game.state = 'playing';
    hud.feed('Busted. $100 fine. The SBPD let you off with a warning.');
  }

  function respawnAfterWasted() {
    player.cash = Math.max(0, player.cash - 150);
    setWanted(0);
    police.ensure(0);
    player.health = 100;
    player.dead = false;
    player.x = 0; player.z = -190;
    if (player.inCar) { player.inCar = null; player.mesh.visible = true; }
    Game.state = 'playing';
    hud.feed('You woke up at St. Marina Hospital. -$150.');
  }

  // ---------------------------------------------------------------- save

  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: Math.floor(player.cash),
        xp: missions.xp,
        mission: missions.index,
        fares: missions.faresDone,
        x: player.x, z: player.z
      }));
    } catch (e) { /* storage unavailable */ }
  }

  function loadSavePreview() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s && typeof s.cash === 'number') {
        player.cash = s.cash;
        missions.xp = s.xp || 0;
        missions.index = s.mission || 0;
        missions.faresDone = s.fares || 0;
        if (missions.index >= 5) missions.state = 'freeroam';
        player.x = s.x || player.x;
        player.z = s.z || player.z;
        document.getElementById('btn-continue').style.display = 'inline-block';
      }
    } catch (e) { /* ignore bad saves */ }
  }

  // ---------------------------------------------------------------- loop

  var smokePuffs = [];
  var smokeTex = null;
  var clouds = null;
  var saveTimer = 0;
  var firstFrame = true;

  function makeSmokeTexture() {
    return U.canvasTexture(64, 64, function (g, w, h) {
      var grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
      grad.addColorStop(0, 'rgba(60,60,60,0.85)');
      grad.addColorStop(1, 'rgba(60,60,60,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    });
  }

  function spawnSmoke(x, y, z) {
    if (!smokeTex) smokeTex = makeSmokeTexture();
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.7, depthWrite: false }));
    s.position.set(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5));
    s.scale.set(1.5, 1.5, 1);
    s.userData.life = 1.2;
    scene.add(s);
    smokePuffs.push(s);
    if (smokePuffs.length > 24) {
      var old = smokePuffs.shift();
      scene.remove(old);
    }
  }

  function updateSmoke(dt) {
    for (var i = smokePuffs.length - 1; i >= 0; i--) {
      var s = smokePuffs[i];
      s.userData.life -= dt;
      s.position.y += dt * 2.2;
      s.scale.x += dt * 2; s.scale.y += dt * 2;
      s.material.opacity = Math.max(0, s.userData.life / 1.2) * 0.7;
      if (s.userData.life <= 0) {
        scene.remove(s);
        smokePuffs.splice(i, 1);
      }
    }
  }

  /** Soft drifting cloud billboards high above the city (day only). */
  function makeClouds() {
    var tex = U.canvasTexture(128, 64, function (g, w, h) {
      for (var i = 0; i < 9; i++) {
        var grad = g.createRadialGradient(20 + i * 10, 32, 2, 20 + i * 10, 32, 18);
        grad.addColorStop(0, 'rgba(255,255,255,0.55)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
      }
    });
    clouds = new THREE.Group();
    for (var i = 0; i < 10; i++) {
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false }));
      sp.position.set((rng() - 0.5) * 700, 130 + rng() * 60, (rng() - 0.5) * 700);
      sp.scale.set(90 + rng() * 90, 28 + rng() * 18, 1);
      sp.userData.speed = 1 + rng() * 1.5;
      clouds.add(sp);
    }
    scene.add(clouds);
  }

  /** Day or night lighting. Night: dark sky, dim sun, lit windows, beams on. */
  function applyTimeOfDay() {
    var night = Game.shot === 'night';
    if (night) {
      scene.background = new THREE.Color(0x0b1026);
      scene.fog = new THREE.Fog(0x0b1026, 100, 520);
      scene.children.forEach(function (c) {
        if (c.isDirectionalLight) { c.intensity = 0.22; c.color.setHex(0x8aa0ff); }
        if (c.isHemisphereLight) c.intensity = 0.25;
      });
    }
    if (clouds) clouds.visible = !night;
  }

  function updateWanted(dt) {
    var wantCount = Game.wanted === 0 ? 0 : Game.wanted <= 2 ? 1 : Game.wanted === 3 ? 2 : Game.wanted === 4 ? 3 : 4;
    police.ensure(wantCount);
    // Seen: any cruiser close by keeps the heat on.
    var seen = false;
    for (var i = 0; i < police.cars.length; i++) {
      if (U.dist2(player.x, player.z, police.cars[i].x, police.cars[i].z) < 55) { seen = true; break; }
    }
    if (Game.wanted > 0) {
      if (seen) Game.seenTimer = 0;
      else {
        Game.seenTimer += dt;
        if (Game.seenTimer > 12) {
          Game.seenTimer = 0;
          setWanted(Game.wanted - 1);
        }
      }
    }
    // Roadblocks at wanted 4-5, refreshed when the level changes.
    var wantBlocks = Game.wanted >= 4 ? Game.wanted - 3 : 0;
    if (wantBlocks !== Game.roadblockLevel) {
      Game.roadblockLevel = wantBlocks;
      var target = player.inCar || { x: player.x, z: player.z, heading: player.heading };
      police.setRoadblocks(wantBlocks, target);
      if (wantBlocks > 0) hud.feed('SBPD roadblock ahead!');
    }
    // Busted: a cruiser sits on you while you are slow.
    if (Game.wanted > 0 && Game.state === 'playing') {
      var near = false;
      for (var j = 0; j < police.cars.length; j++) {
        if (U.dist2(player.x, player.z, police.cars[j].x, police.cars[j].z) < 4.5) { near = true; break; }
      }
      var spd = player.inCar ? Math.abs(player.inCar.speed) : player.speed;
      if (near && spd < 3) {
        Game.bustTimer += dt;
        if (Game.bustTimer > 2.5) {
          Game.bustTimer = 0;
          Game.state = 'busted';
          hud.showEnd('busted', 'The SBPD caught you. $100 fine.');
          window.SB.audio.siren(false);
        }
      } else {
        Game.bustTimer = 0;
      }
    }
  }

  /** Player car vs traffic + peds + roadblocks. */
  function updateCarContacts(dt) {
    var car = player.inCar;
    if (!car) return;
    for (var i = 0; i < traffic.cars.length; i++) {
      var o = traffic.cars[i];
      var d = U.dist2(car.x, car.z, o.x, o.z);
      if (d < 4.4 && d > 0.01) {
        var push = (4.4 - d) * 0.5;
        var nx = (car.x - o.x) / d, nz = (car.z - o.z) / d;
        car.x += nx * push; car.z += nz * push;
        var hard = Math.abs(car.speed) > 10;
        car.speed *= 0.55;
        car.damage += hard ? 6 : 2;
        if (hard) {
          window.SB.audio.crash(true);
          Game.shake = Math.max(Game.shake, 0.35);
          hud.feed('You hit traffic!');
        }
      }
    }
    for (var j = 0; j < peds.list.length; j++) {
      var p = peds.list[j];
      if (!p.alive) continue;
      if (U.dist2(car.x, car.z, p.x, p.z) < 2.2 && Math.abs(car.speed) > 3) {
        p.alive = false;
        p.mesh.rotation.x = -Math.PI / 2;
        addWanted(1);
        window.SB.audio.crash(true);
        hud.feed('You hit a pedestrian! The SBPD noticed.');
      }
    }
    // Damage smoke from the hood.
    if (car.damage > 50) {
      Game.smokeTimer = (Game.smokeTimer || 0) - dt;
      if (Game.smokeTimer <= 0) {
        Game.smokeTimer = 0.14;
        var hx = car.x + Math.sin(car.heading) * 2;
        var hz = car.z + Math.cos(car.heading) * 2;
        spawnSmoke(hx, 1.4, hz);
      }
    }
    if (car.damage >= 100) {
      hud.feed('Your car is wrecked!');
      car.damage = 0;
      car.speed = 0;
      tryEnterExitCar();
    }
  }

  function updateCamera(dt) {
    var target, dist, height, lookY;
    if (Game.state === 'menu') {
      var t = performance.now() / 1000;
      var a = t * 0.05;
      camera.position.set(Math.sin(a) * 190, 70, Math.cos(a) * 190);
      camera.lookAt(0, 10, 0);
      return;
    }
    if (player.inCar) {
      var car = player.inCar;
      target = car;
      dist = Game.camDist || 11; height = Game.camHeight || 4.6; lookY = 2;
      // Chase cam: look along the car's heading, camera behind it.
      var wantYaw = car.heading;
      Game.camYaw = U.angleLerp(Game.camYaw, wantYaw, Math.min(1, dt * 2.2));
    } else {
      target = player;
      dist = Game.camDist || 7.5; height = Game.camHeight || 3.2; lookY = 1.6;
      Game.camYaw = U.angleLerp(Game.camYaw, player.camYaw, Math.min(1, dt * 6));
    }
    var cx = target.x - Math.sin(Game.camYaw) * dist;
    var cz = target.z - Math.cos(Game.camYaw) * dist;
    var cy = height + Math.sin(Game.camPitch) * dist * 0.45;
    var k = Math.min(1, dt * 6);
    if (Game.snapCamera) {
      // Staged shots (and the first frame after a teleport): put the
      // camera exactly where it belongs instead of flying there.
      camera.position.set(cx, cy, cz);
      Game.snapCamera = false;
    } else {
      camera.position.x = U.lerp(camera.position.x, cx, k);
      camera.position.y = U.lerp(camera.position.y, cy, k);
      camera.position.z = U.lerp(camera.position.z, cz, k);
    }
    // Anti-clip: never let the camera sit inside a building.
    for (var ci = 0; ci < city.colliders.length; ci++) {
      var cc = city.colliders[ci];
      if (camera.position.x > cc.minX - 1 && camera.position.x < cc.maxX + 1 &&
          camera.position.z > cc.minZ - 1 && camera.position.z < cc.maxZ + 1) {
        camera.position.y = Math.max(camera.position.y, 16);
        break;
      }
    }
    if (Game.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * Game.shake;
      camera.position.y += (Math.random() - 0.5) * Game.shake;
      Game.shake = Math.max(0, Game.shake - dt * 1.4);
    }
    camera.lookAt(target.x, lookY, target.z);
    // Speed FOV kick while driving.
    var wantFov = 62;
    if (player.inCar) wantFov = 62 + U.clamp(Math.abs(player.inCar.speed) / 34, 0, 1) * 10;
    if (Math.abs(camera.fov - wantFov) > 0.1) {
      camera.fov = U.lerp(camera.fov, wantFov, Math.min(1, dt * 3));
      camera.updateProjectionMatrix();
    }
  }

  function updateBeacon(dt) {
    var obj = Game.debugObjective || missions.objective();
    var show = !!obj && obj.x !== undefined && Game.state === 'playing';
    beacon.visible = show;
    beaconRing.visible = show;
    if (show) {
      beacon.position.set(obj.x, 30, obj.z);
      beaconRing.position.set(obj.x, 0.15, obj.z);
      var s = 1 + Math.sin(performance.now() / 300) * 0.12;
      beaconRing.scale.set(s, s, 1);
    }
  }

  function updateHUD(dt) {
    hud.setStars(Game.wanted);
    hud.setCash(player.cash);
    hud.setLevel(missions.level(), missions.xp);
    hud.setHealth(player.health);
    hud.setSpeed(player.inCar ? Math.abs(player.inCar.speed) * 3.6 : 0, !!player.inCar);
    hud.setDistrict(city.districtAt(player.x, player.z));
    hud.setObjective(missionText(), missions.timer);
    hud.setCrosshair(!player.inCar && Game.state === 'playing');
    hud.setVignette(player.hurtFlash > 0 ? 0.45 : (Game.wanted >= 3 ? 0.12 : 0));
    hud.tick(dt);
    window.SB.hud.drawMinimap(hud.minimap, city, {
      player: player,
      traffic: traffic.cars,
      police: police.cars,
      objective: Game.debugObjective || missions.objective()
    });
  }

  var clock = { last: 0 };

  function loop(t) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (t - clock.last) / 1000 || 0.016);
    clock.last = t;
    Game.time += dt;

    if (Game.state === 'playing') {
      var input = inputState();
      if (player.inCar) {
        var car = player.inCar;
        var colliders = city.colliders.concat(police.roadblockColliders());
        var crashed = window.SB.cars.driveCar(car, input, dt, colliders, city.cityHalf);
        if (crashed && Math.abs(car.speed) > 6) {
          window.SB.audio.crash(true);
          Game.shake = Math.max(Game.shake, 0.3);
        }
        window.SB.cars.syncCarMesh(car, dt);
        player.x = car.x; player.z = car.z;
        player.heading = car.heading;
        window.SB.audio.engine(U.clamp(Math.abs(car.speed) / car.topSpeed, 0, 1), true);
        updateCarContacts(dt);
      } else {
        player.updateOnFoot(input, dt, city.colliders, city.cityHalf);
        player.camYaw = Game.camYaw;
        window.SB.audio.engine(0, false);
      }
      traffic.update(dt);
      peds.update(dt, false);
      var rivalsAlive = rivals.update(dt, player, function (dmg) {
        player.hurt(dmg);
        if (player.dead) {
          Game.state = 'wasted';
          hud.showEnd('wasted', 'The Harbormen got you. $150 hospital bill.');
        }
      });
      missions.update(dt, { player: player, wanted: Game.wanted, rivalsAlive: rivalsAlive, time: Game.time });
      updateWanted(dt);
      police.update(dt, player, city.colliders);
      player.heal(dt);
      if (tracerLife > 0) {
        tracerLife -= dt;
        if (tracerLife <= 0) tracer.visible = false;
      }
      if (muzzle.intensity > 0) muzzle.intensity = Math.max(0, muzzle.intensity - dt * 90);
      window.SB.audio.siren(Game.wanted > 0);
      updateBeacon(dt);
      updateSmoke(dt);
      if (clouds) {
        clouds.children.forEach(function (c) {
          c.position.x += c.userData.speed * dt;
          if (c.position.x > 420) c.position.x = -420;
        });
      }
      saveTimer += dt;
      if (saveTimer > 10) { saveTimer = 0; saveGame(); }
    } else if (Game.state === 'menu') {
      traffic.update(dt);
      peds.update(dt, false);
    }
    updateCamera(dt);
    updateHUD(dt);
    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      window.__SB__ = {
        ready: true,
        game: Game,
        player: player,
        missions: missions,
        camera: camera,
        police: police,
        traffic: traffic,
        state: function () {
          return {
            state: Game.state,
            wanted: Game.wanted,
            cash: Math.floor(player.cash),
            xp: missions.xp,
            level: missions.level(),
            mission: missions.index,
            step: missions.step,
            inCar: !!player.inCar,
            speed: player.inCar ? Math.abs(player.inCar.speed) : player.speed,
            health: Math.round(player.health),
            x: Math.round(player.x), z: Math.round(player.z),
            traffic: traffic.cars.length,
            police: police.cars.length,
            rivalsAlive: rivals.list.filter(function (r) { return r.alive; }).length
          };
        }
      };
    }
  }

  // ---------------------------------------------------------------- shots

  /**
   * Screenshot staging (?shot=...): pre-configure a real gameplay state so
   * each screenshot shows the game at its best. All states are genuine:
   * the world keeps simulating from here.
   */
  function stageShot(mode) {
    if (mode === 'start') return; // menu attract mode
    if (mode === 'vista') {
      // Cover: on foot mid-block on the main avenue, looking north up the
      // street between the downtown towers — traffic, beacon ahead,
      // HUD + minimap live.
      player.x = 0; player.z = 78;
      player.heading = Math.PI;
      player.camYaw = Math.PI;
      Game.camYaw = Math.PI;
      Game.camPitch = 0.28;
      Game.camDist = 9; Game.camHeight = 3.8;
      Game.suppressBanner = true;
      Game.debugObjective = { x: 0, z: -104, text: 'Explore Sunset Bay — Downtown ahead' };
      // Traffic on the same avenue so the street feels alive.
      if (traffic.cars[0]) {
        traffic.cars[0].x = 3.5; traffic.cars[0].z = 60; traffic.cars[0].axis = 'x';
        traffic.cars[0].heading = Math.PI; traffic.cars[0].speed = 9; traffic.cars[0].lane = 3.5;
      }
      if (traffic.cars[1]) {
        traffic.cars[1].x = -3.5; traffic.cars[1].z = 45; traffic.cars[1].axis = 'x';
        traffic.cars[1].heading = Math.PI; traffic.cars[1].speed = 8; traffic.cars[1].lane = -3.5;
      }
      setWanted(0);
      return;
    }
    if (mode === 'chase') {
      // Wanted 3 getaway: player in the Comet GT, two cruisers on the tail.
      var comet = null;
      for (var i = 0; i < Game.parked.length; i++) {
        if (Game.parked[i].comet) { comet = Game.parked[i]; break; }
      }
      if (comet) {
        Game.parked.splice(Game.parked.indexOf(comet), 1);
        comet.parked = false;
        comet.x = 0; comet.z = 120; comet.heading = Math.PI; comet.speed = 24;
        player.inCar = comet;
        player.mesh.visible = false;
        player.x = comet.x; player.z = comet.z; player.heading = Math.PI;
      }
      Game.camYaw = Math.PI;
      Game.camPitch = 0.32;
      Game.camDist = 9; Game.camHeight = 4.2;
      missions.index = 4; missions.step = 1; missions.state = 'active'; missions.timer = 150;
      setWanted(3);
      police.ensure(2);
      // Cruisers right on the tail, inside the frame: flanking the player
      // car just behind it, so the chase reads at a glance. Slow them down
      // for the shot so they stay glued to the player car.
      police.cars[0].topSpeed = 14;
      police.cars[0].x = -5; police.cars[0].z = 117; police.cars[0].heading = Math.PI; police.cars[0].speed = 14;
      if (police.cars[1]) { police.cars[1].topSpeed = 14; police.cars[1].x = 5.5; police.cars[1].z = 118.5; police.cars[1].heading = Math.PI; police.cars[1].speed = 14; }
      // Two traffic cars ahead on the same road, so the road is alive.
      if (traffic.cars[0]) {
        traffic.cars[0].x = 3.5; traffic.cars[0].z = 80; traffic.cars[0].axis = 'x';
        traffic.cars[0].heading = Math.PI; traffic.cars[0].speed = 9; traffic.cars[0].lane = 3.5;
      }
      if (traffic.cars[1]) {
        traffic.cars[1].x = -3.5; traffic.cars[1].z = 55; traffic.cars[1].axis = 'x';
        traffic.cars[1].heading = Math.PI; traffic.cars[1].speed = 8; traffic.cars[1].lane = -3.5;
      }
      return;
    }
    if (mode === 'mission') {
      // Mission 4, "The Pickup": on foot ON the road in Old Town, facing
      // the package at the intersection, Harbormen guarding it, wanted 1.
      missions.index = 3; missions.step = 0; missions.state = 'active';
      player.x = -156; player.z = -138;
      player.heading = Math.PI;
      player.camYaw = Math.PI;
      Game.camYaw = Math.PI;
      Game.camPitch = 0.3;
      Game.camDist = 8; Game.camHeight = 3.4;
      rivals.spawn(-156, -156, 3);
      setWanted(1);
      return;
    }
    if (mode === 'night') {
      // Neon downtown at night: player driving south through the towers,
      // one cruiser behind, headlight beams on.
      var sedan = null;
      for (var j = 0; j < Game.parked.length; j++) {
        if (Game.parked[j].kind === 'sedan') { sedan = Game.parked[j]; break; }
      }
      if (sedan) {
        Game.parked.splice(Game.parked.indexOf(sedan), 1);
        sedan.parked = false;
        sedan.x = 0; sedan.z = -40; sedan.heading = 0; sedan.speed = 16;
        player.inCar = sedan;
        player.mesh.visible = false;
        player.x = sedan.x; player.z = sedan.z; player.heading = 0;
        window.SB.cars.setBeams(sedan, true);
      }
      traffic.cars.forEach(function (c) { window.SB.cars.setBeams(c, true); });
      Game.camYaw = 0;
      Game.camPitch = 0.3;
      Game.camDist = 10; Game.camHeight = 4.4;
      Game.suppressBanner = true;
      Game.debugObjective = { x: 52, z: -156, text: 'Reach the Neon District' };
      setWanted(1);
      police.ensure(1);
      // Cruiser tucked behind the player car, inside the frame.
      police.cars[0].x = -3.5; police.cars[0].z = -46; police.cars[0].heading = 0; police.cars[0].speed = 15;
      return;
    }
  }

  // Boot the game.
  init();
})();
