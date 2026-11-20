// Sunset Bay — util.js
// Small shared helpers: seeded random, math, canvas textures.
// Everything in this file is original code written for this game.
(function () {
  'use strict';

  /** Mulberry32 seeded PRNG: deterministic per seed, so the city is the same every load. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    return Math.sqrt(dx * dx + dz * dz);
  }
  /** Shortest signed angle difference, for smooth turning. */
  function angleDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function angleLerp(a, b, t) { return a + angleDiff(a, b) * clamp(t, 0, 1); }

  /** Build a canvas texture from a 2D drawing callback. */
  function canvasTexture(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Round a number to a fixed precision for HUD display. */
  function fmt(n, digits) {
    const p = Math.pow(10, digits || 0);
    return String(Math.round(n * p) / p);
  }

  window.SB = window.SB || {};
  window.SB.util = {
    mulberry32: mulberry32,
    clamp: clamp,
    lerp: lerp,
    dist2: dist2,
    angleDiff: angleDiff,
    angleLerp: angleLerp,
    canvasTexture: canvasTexture,
    fmt: fmt
  };
})();
