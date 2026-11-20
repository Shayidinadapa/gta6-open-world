// Sunset Bay — hud.js
// DOM HUD: wanted stars, health, money, level/XP, speedometer, mission
// objective, a live minimap with a GPS route, toasts, and the menus
// (start / pause / busted / wasted). Pure presentation, no game logic.
(function (global) {
  'use strict';
  var SB = global.SB;
  var U = SB.util;

  function HUD() {
    this.map = U.el('minimap');
    this.mapCtx = this.map ? this.map.getContext('2d') : null;
    this.toastTimer = null;
    this.lastStars = -1;
  }

  HUD.prototype._setText = function (id, text) {
    var e = U.el(id);
    if (e && e.textContent !== text) e.textContent = text;
  };

  HUD.prototype.update = function (s) {
    // Wanted stars.
    if (s.wanted !== this.lastStars) {
      this.lastStars = s.wanted;
      var stars = '';
      for (var i = 0; i < 5; i++) stars += i < s.wanted ? '★' : '☆';
      this._setText('stars', stars);
      var sw = U.el('stars');
      if (sw) sw.className = 'stars' + (s.wanted >= 4 ? ' hot' : s.wanted > 0 ? ' warm' : '');
    }
    this._setText('money', U.fmtMoney(s.money));
    this._setText('level', 'LV ' + s.level);
    this._setText('objective', s.objective || '');
    var hp = U.el('health-fill');
    if (hp) hp.style.width = U.clamp(s.health, 0, 100) + '%';
    var xp = U.el('xp-fill');
    if (xp) xp.style.width = U.clamp(s.xpInLevel / 100, 0, 1) * 100 + '%';
    var sp = U.el('speed');
    if (sp) sp.textContent = s.inCar ? Math.round(Math.abs(s.speed) * 3.6) + ' km/h' : '';
    var vig = U.el('vignette');
    if (vig) vig.style.opacity = s.health < 35 ? String((35 - s.health) / 55) : '0';
    if (s.inCar) {
      var dmg = U.el('cardamage');
      if (dmg) {
        dmg.style.width = U.clamp(s.carDamage || 0, 0, 100) + '%';
        dmg.parentElement.style.display = 'block';
      }
    } else {
      var cd = U.el('cardamage');
      if (cd) cd.parentElement.style.display = 'none';
    }
    this.drawMinimap(s);
  };

  HUD.prototype.drawMinimap = function (s) {
    var ctx = this.mapCtx;
    if (!ctx) return;
    var W = this.map.width, H = this.map.height;
    var scale = W / 420; // world units -> px, centred on the player
    var toX = function (x) { return W / 2 + (x - s.px) * scale; };
    var toZ = function (z) { return H / 2 + (z - s.pz) * scale; };
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#10151c';
    ctx.fillRect(0, 0, W, H);
    // Roads.
    ctx.strokeStyle = '#4a5058';
    ctx.lineWidth = 5;
    var roads = SB.city.ROAD_COORDS;
    for (var i = 0; i < roads.length; i++) {
      ctx.beginPath(); ctx.moveTo(toX(roads[i]), toZ(-210)); ctx.lineTo(toX(roads[i]), toZ(210)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(toX(-210), toZ(roads[i])); ctx.lineTo(toX(210), toZ(roads[i])); ctx.stroke();
    }
    // Beach + water.
    ctx.fillStyle = '#c9b078';
    ctx.fillRect(0, toZ(196), W, H - toZ(196));
    ctx.fillStyle = '#1d6f8f';
    ctx.fillRect(0, toZ(285), W, H - toZ(285));
    // GPS route to the mission target (Manhattan along the road grid).
    if (s.target) {
      var zRoad = this._nearestRoad(s.pz);
      var xRoad = this._nearestRoad(s.target.x);
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(toX(s.px), toZ(s.pz));
      ctx.lineTo(toX(s.px), toZ(zRoad));
      ctx.lineTo(toX(xRoad), toZ(zRoad));
      ctx.lineTo(toX(xRoad), toZ(s.target.z));
      ctx.lineTo(toX(s.target.x), toZ(s.target.z));
      ctx.stroke();
      // Target marker.
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(toX(s.target.x), toZ(s.target.z), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Traffic dots.
    ctx.fillStyle = '#f1c40f';
    for (var t = 0; t < (s.traffic || []).length; t++) {
      ctx.beginPath();
      ctx.arc(toX(s.traffic[t].x), toZ(s.traffic[t].z), 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police: flashing dots.
    var flash = Math.floor(performance.now() / 300) % 2 === 0;
    ctx.fillStyle = flash ? '#ff3333' : '#3388ff';
    for (var p = 0; p < (s.police || []).length; p++) {
      ctx.beginPath();
      ctx.arc(toX(s.police[p].x), toZ(s.police[p].z), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow, rotated to heading.
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-s.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#9aa5b1';
    ctx.font = 'bold 10px Arial';
    ctx.fillText('N', W / 2 - 3, 12);
  };

  HUD.prototype._nearestRoad = function (v) {
    var roads = SB.city.ROAD_COORDS;
    var best = roads[0], bd = 1e9;
    for (var i = 0; i < roads.length; i++) {
      var d = Math.abs(v - roads[i]);
      if (d < bd) { bd = d; best = roads[i]; }
    }
    return best;
  };

  HUD.prototype.toast = function (text, ms) {
    var t = U.el('toast');
    if (!t) return;
    t.textContent = text;
    t.style.opacity = '1';
    if (this.toastTimer) clearTimeout(this.toastTimer);
    var self = this;
    this.toastTimer = setTimeout(function () { t.style.opacity = '0'; }, ms || 3200);
  };

  HUD.prototype.showMenu = function (name) {
    var names = ['menu-start', 'menu-pause', 'menu-busted', 'menu-wasted'];
    for (var i = 0; i < names.length; i++) {
      var e = U.el(names[i]);
      if (e) e.style.display = names[i] === name ? 'flex' : 'none';
    }
    var hud = U.el('hud');
    if (hud) hud.style.display = name ? 'none' : 'block';
  };

  HUD.prototype.hideMenus = function () { this.showMenu(null); };

  SB.hud = { HUD: HUD };
})(window);
