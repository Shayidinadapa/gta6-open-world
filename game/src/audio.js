// Sunset Bay — audio.js
// All sound is synthesized live with WebAudio: no audio files are shipped.
// Engine hum, police siren, gunshots, pickups and UI jingles.
(function () {
  'use strict';

  const U = window.SB.util;

  function AudioEngine() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.enabled = false;
    this.muted = false;
  }

  /** Create the context on a user gesture (browsers block audio before one). */
  AudioEngine.prototype.unlock = function () {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      // Engine: two detuned sawtooths through a lowpass, pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const engineFilter = this.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      this.engineOsc.connect(engineFilter);
      engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      // Siren: triangle wave wobbling between two notes.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.enabled = true;
    } catch (e) {
      this.enabled = false;
    }
  };

  /** speed01: 0..1 of top speed. Call every frame while driving. */
  AudioEngine.prototype.engine = function (speed01, on) {
    if (!this.enabled || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, t, 0.08);
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.06 : 0.0, t, 0.1);
  };

  AudioEngine.prototype.siren = function (on) {
    if (!this.enabled || !this.sirenOsc) return;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0.0, t, 0.2);
    if (on) {
      // Two-tone wobble: flip the note twice a second.
      const now = Math.floor(t * 2) % 2;
      this.sirenOsc.frequency.setTargetAtTime(now === 0 ? 700 : 950, t, 0.05);
    }
  };

  /** Short filtered-noise burst for a gunshot. */
  AudioEngine.prototype.shot = function () {
    if (!this.enabled) return;
    try {
      const dur = 0.12;
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 900;
      const g = this.ctx.createGain();
      g.gain.value = 0.5;
      src.connect(filter); filter.connect(g); g.connect(this.master);
      src.start();
    } catch (e) { /* ignore */ }
  };

  /** Low thud for a crash. */
  AudioEngine.prototype.crash = function (hard) {
    if (!this.enabled) return;
    try {
      const dur = hard ? 0.25 : 0.12;
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300;
      const g = this.ctx.createGain();
      g.gain.value = hard ? 0.8 : 0.35;
      src.connect(filter); filter.connect(g); g.connect(this.master);
      src.start();
    } catch (e) { /* ignore */ }
  };

  /** Two-note chime for pickups and mission steps. */
  AudioEngine.prototype.chime = function () {
    if (!this.enabled) return;
    try {
      const t0 = this.ctx.currentTime;
      [660, 880].forEach(function (freq, i) {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0 + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.09 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.09 + 0.35);
        o.connect(g); g.connect(this.master);
        o.start(t0 + i * 0.09);
        o.stop(t0 + i * 0.09 + 0.4);
      }, this);
    } catch (e) { /* ignore */ }
  };

  /** Little rising jingle for a mission completed. */
  AudioEngine.prototype.fanfare = function () {
    if (!this.enabled) return;
    try {
      const t0 = this.ctx.currentTime;
      [523, 659, 784, 1047].forEach(function (freq, i) {
        const o = this.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = freq;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0 + i * 0.11);
        g.gain.exponentialRampToValueAtTime(0.22, t0 + i * 0.11 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.11 + 0.4);
        o.connect(g); g.connect(this.master);
        o.start(t0 + i * 0.11);
        o.stop(t0 + i * 0.11 + 0.45);
      }, this);
    } catch (e) { /* ignore */ }
  };

  window.SB.audio = new AudioEngine();
})();
