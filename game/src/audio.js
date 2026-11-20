// Sunset Bay — audio.js
// All sound is synthesized with WebAudio: no audio files, no network.
// Engine hum, sirens, gunshots, collisions and mission jingles.
(function (global) {
  'use strict';
  var SB = global.SB;

  function AudioSys() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.noiseBuf = null;
  }

  AudioSys.prototype.ensure = function () {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // 1s of white noise, reused by gunshots / collisions.
      var len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var d = this.noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // Looping engine voice, silent until driving.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      // Police siren voice, silent until a chase.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      return true;
    } catch (e) { return false; }
  };

  AudioSys.prototype.setMuted = function (m) {
    this.muted = !!m;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
  };

  AudioSys.prototype.setEngine = function (speedNorm, driving) {
    if (!this.ctx || !this.engineGain) return;
    var t = this.ctx.currentTime;
    var target = driving ? 0.05 + 0.10 * speedNorm : 0.0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + 130 * speedNorm, t, 0.1);
  };

  AudioSys.prototype.setSiren = function (on, dt) {
    if (!this.ctx || !this.sirenGain) return;
    var t = this.ctx.currentTime;
    if (!on) { this.sirenGain.gain.setTargetAtTime(0, t, 0.1); return; }
    this.sirenTimer += dt;
    if (this.sirenTimer > 0.42) {
      this.sirenTimer = 0;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 950 : 680, t, 0.05);
    }
    this.sirenGain.gain.setTargetAtTime(0.045, t, 0.1);
  };

  AudioSys.prototype._burst = function (dur, filterFreq, gain, type) {
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    var src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    var f = this.ctx.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.value = filterFreq;
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.5, dur);
    src.stop(t + dur + 0.02);
  };

  AudioSys.prototype.shot = function () { this._burst(0.14, 1800, 0.5); };
  AudioSys.prototype.collision = function (hard) {
    this._burst(hard ? 0.3 : 0.16, hard ? 220 : 320, hard ? 0.6 : 0.3, 'lowpass');
  };
  AudioSys.prototype.pickup = function () {
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    [660, 880].forEach(function (freq, i) {
      var o = this.ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = freq;
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.35);
      o.connect(g); g.connect(this.master);
      o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.4);
    }, this);
  };
  AudioSys.prototype.jingle = function (good) {
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    var notes = good ? [523, 659, 784, 1046] : [392, 330, 262, 196];
    notes.forEach(function (freq, i) {
      var o = this.ctx.createOscillator();
      o.type = 'square'; o.frequency.value = freq;
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.3);
      o.connect(g); g.connect(this.master);
      o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.32);
    }, this);
  };
  AudioSys.prototype.click = function () {
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    var o = this.ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = 1200;
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.08);
  };

  SB.audio = new AudioSys();
})(window);
