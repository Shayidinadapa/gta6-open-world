// Sunset Bay — hud.js
// DOM HUD: wanted stars, cash, health, speed, district, objective text,
// message feed, banners, menus, and the live 2D minimap canvas.
(function () {
  'use strict';

  var U = window.SB.util;

  function el(id) { return document.getElementById(id); }

  /** Draw the top-down minimap: roads, blocks, marina, player, cars, police, target. */
  function drawMinimap(canvas, city, state) {
    var g = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var range = city.cityHalf + 60;
    var scale = W / (range * 2);
    function X(x) { return (x + range) * scale; }
    function Z(z) { return (z + range) * scale; }
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#10151d';
    g.fillRect(0, 0, W, H);
    // Marina water at the south edge.
    g.fillStyle = '#1d5a78';
    g.fillRect(0, Z(city.cityHalf + 10), W, H - Z(city.cityHalf + 10));
    // Blocks.
    g.fillStyle = '#2a2f38';
    for (var ix = 0; ix < city.centers.length - 1; ix++) {
      for (var iz = 0; iz < city.centers.length - 1; iz++) {
        var x0 = city.centers[ix] + city.roadWidth / 2;
        var z0 = city.centers[iz] + city.roadWidth / 2;
        g.fillRect(X(x0), Z(z0), (city.pitch - city.roadWidth) * scale, (city.pitch - city.roadWidth) * scale);
      }
    }
    // Roads.
    g.strokeStyle = '#565d68';
    g.lineWidth = Math.max(2, city.roadWidth * scale);
    city.centers.forEach(function (c) {
      g.beginPath(); g.moveTo(X(c), 0); g.lineTo(X(c), H); g.stroke();
      g.beginPath(); g.moveTo(0, Z(c)); g.lineTo(W, Z(c)); g.stroke();
    });
    // Mission target blip (pulsing yellow).
    var obj = state.objective;
    if (obj && obj.x !== undefined) {
      // GPS route: dashed line from the player to the target, routed
      // along the road grid (Manhattan path), like a sat-nav.
      g.strokeStyle = '#ffd23b';
      g.lineWidth = 2;
      g.setLineDash([5, 4]);
      g.beginPath();
      g.moveTo(X(state.player.x), Z(state.player.z));
      g.lineTo(X(obj.x), Z(state.player.z));
      g.lineTo(X(obj.x), Z(obj.z));
      g.stroke();
      g.setLineDash([]);
      var pulse = 5 + Math.sin(performance.now() / 200) * 2;
      g.fillStyle = '#ffd23b';
      g.beginPath(); g.arc(X(obj.x), Z(obj.z), pulse, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff2b0';
      g.lineWidth = 2;
      g.beginPath(); g.arc(X(obj.x), Z(obj.z), pulse + 4, 0, Math.PI * 2); g.stroke();
    }
    // Traffic dots.
    g.fillStyle = '#e8c23b';
    (state.traffic || []).forEach(function (c) {
      g.fillRect(X(c.x) - 1.5, Z(c.z) - 1.5, 3, 3);
    });
    // Police dots (flashing blue/red).
    var flash = Math.floor(performance.now() / 250) % 2 === 0;
    g.fillStyle = flash ? '#3b7aff' : '#ff3b3b';
    (state.police || []).forEach(function (c) {
      g.beginPath(); g.arc(X(c.x), Z(c.z), 3, 0, Math.PI * 2); g.fill();
    });
    // Player arrow (white, rotated by heading).
    var px = X(state.player.x), pz = Z(state.player.z);
    g.save();
    g.translate(px, pz);
    g.rotate(Math.PI - state.player.heading);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath();
    g.fill();
    g.restore();
    // North marker.
    g.fillStyle = '#9aa5b1';
    g.font = 'bold 11px sans-serif';
    g.fillText('N', 6, 13);
  }

  function HUD() {
    this.minimap = el('minimap');
    this.bannerTimer = 0;
    this.feedTimer = 0;
  }

  HUD.prototype.setStars = function (n) {
    var s = '';
    for (var i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    el('wanted').textContent = s;
    el('wanted').className = n >= 3 ? 'wanted hot' : 'wanted';
  };

  HUD.prototype.setCash = function (cash) {
    el('cash').textContent = '$' + Math.floor(cash).toLocaleString('en-US');
  };

  HUD.prototype.setLevel = function (level, xp) {
    el('level').textContent = 'LV ' + level + ' · ' + xp + ' XP';
  };

  HUD.prototype.setHealth = function (hp) {
    el('health-fill').style.width = hp + '%';
    el('health-fill').style.background = hp > 50 ? '#4a9a5a' : hp > 25 ? '#e8c23b' : '#c23b3b';
    el('health-num').textContent = Math.ceil(hp);
  };

  HUD.prototype.setSpeed = function (kmh, inCar) {
    el('speed').textContent = inCar ? Math.round(kmh) + ' km/h' : '';
    el('speed').style.display = inCar ? 'block' : 'none';
  };

  HUD.prototype.setDistrict = function (name) {
    el('district').textContent = name;
  };

  HUD.prototype.setObjective = function (text, timer) {
    el('objective-text').textContent = text || '';
    el('timer').textContent = timer > 0 ? Math.ceil(timer) + 's' : '';
  };

  HUD.prototype.feed = function (msg) {
    var f = el('msg-feed');
    var div = document.createElement('div');
    div.textContent = msg;
    f.appendChild(div);
    while (f.children.length > 3) f.removeChild(f.firstChild);
    this.feedTimer = 5;
  };

  HUD.prototype.banner = function (title, sub, ms) {
    el('banner-title').textContent = title;
    el('banner-sub').textContent = sub || '';
    el('banner').classList.add('show');
    this.bannerTimer = (ms || 2600) / 1000;
  };

  HUD.prototype.tick = function (dt) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) el('banner').classList.remove('show');
    }
    if (this.feedTimer > 0) {
      this.feedTimer -= dt;
      if (this.feedTimer <= 0) el('msg-feed').innerHTML = '';
    }
  };

  HUD.prototype.setCrosshair = function (show) {
    el('crosshair').style.display = show ? 'block' : 'none';
  };

  HUD.prototype.setVignette = function (amount) {
    el('vignette').style.opacity = U.clamp(amount, 0, 0.85);
  };

  HUD.prototype.showMenu = function (isContinue) {
    el('menu').classList.remove('hidden');
    el('btn-continue').style.display = isContinue ? 'inline-block' : 'none';
  };

  HUD.prototype.hideMenu = function () {
    el('menu').classList.add('hidden');
  };

  HUD.prototype.showPause = function (show) {
    el('pause').classList.toggle('hidden', !show);
  };

  HUD.prototype.showEnd = function (kind, text) {
    var box = el(kind === 'busted' ? 'busted' : 'wasted');
    box.querySelector('p').textContent = text;
    box.classList.remove('hidden');
  };

  HUD.prototype.hideEnd = function () {
    el('busted').classList.add('hidden');
    el('wasted').classList.add('hidden');
  };

  window.SB.hud = { HUD: HUD, drawMinimap: drawMinimap };
})();
