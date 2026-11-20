// Sunset Bay — util.js
// Small shared helpers: seeded RNG, math, and tiny DOM/event utilities.
// No game logic lives here; every other module builds on these.
(function (global) {
  'use strict';

  // Mulberry32 — small deterministic PRNG. Seed it per run so screenshots
  // and playtests are reproducible; gameplay reseeds from Date.now().
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function damp(current, target, lambda, dt) {
    return lerp(current, target, 1 - Math.exp(-lambda * dt));
  }
  // Shortest signed angle difference, in radians.
  function angleDiff(a, b) {
    var d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function angleLerp(a, b, t) { return a + angleDiff(a, b) * clamp(t, 0, 1); }
  function dist2D(ax, az, bx, bz) {
    var dx = ax - bx, dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function randRange(rng, lo, hi) { return lo + rng() * (hi - lo); }
  function randInt(rng, lo, hi) { return Math.floor(randRange(rng, lo, hi + 1)); }

  function el(id) { return document.getElementById(id); }
  function fmtMoney(n) {
    n = Math.max(0, Math.floor(n));
    return '$' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  // Tiny pub/sub so modules stay decoupled.
  function Bus() {
    var map = {};
    return {
      on: function (ev, fn) { (map[ev] = map[ev] || []).push(fn); },
      emit: function (ev, data) {
        var list = map[ev] || [];
        for (var i = 0; i < list.length; i++) {
          try { list[i](data); } catch (e) { /* never break the loop on a listener */ }
        }
      }
    };
  }

  global.SB = global.SB || {};
  global.SB.util = {
    mulberry32: mulberry32,
    clamp: clamp,
    lerp: lerp,
    damp: damp,
    angleDiff: angleDiff,
    angleLerp: angleLerp,
    dist2D: dist2D,
    pick: pick,
    randRange: randRange,
    randInt: randInt,
    el: el,
    fmtMoney: fmtMoney,
    fmtTime: fmtTime,
    Bus: Bus
  };
})(window);
