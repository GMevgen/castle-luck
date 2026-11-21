/* Процедурные звуки на WebAudio — без звуковых файлов. */
(function (root) {
  'use strict';
  var CL = root.CL = root.CL || {};
  var ctx = null, master = null, enabled = true;
  function ac() {
    if (!ctx) {
      var C = root.AudioContext || root.webkitAudioContext; if (!C) return null;
      ctx = new C(); master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type, vol, delay, slide) {
    var c = ac(); if (!c || !enabled) return;
    var t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, delay, hp) {
    var c = ac(); if (!c || !enabled) return;
    var len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len); // Math.random — только для звука, не для игры
    var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime + (delay || 0);
    f.type = 'highpass'; f.frequency.value = hp || 800; g.gain.value = vol || 0.2;
    s.buffer = buf; s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }
  /* iOS Safari: звук разрешён только после жеста пользователя. На первом (и каждом следующем, если
     контекст «уснул» после звонка/сворачивания) касании создаём/будим контекст и проигрываем тишину. */
  var unlocked = false;
  function unlock() {
    var c = ac(); if (!c) return;
    if (!unlocked) {
      try { var b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (e) { }
      unlocked = true;
    }
    if (c.state !== 'running' && c.resume) c.resume();
  }
  if (root.document) {
    ['touchend', 'pointerdown', 'keydown'].forEach(function (t) {
      root.document.addEventListener(t, function () { if (!ctx || ctx.state !== 'running') unlock(); }, { capture: true, passive: true });
    });
    root.document.addEventListener('visibilitychange', function () { if (!root.document.hidden && ctx && ctx.state !== 'running' && unlocked) try { ctx.resume(); } catch (e) { } });
  }
  CL.Sfx = {
    setEnabled: function (v) { enabled = !!v; },
    unlock: unlock,
    click: function () { tone(660, 0.05, 'triangle', 0.15); },
    tick: function () { noise(0.03, 0.08, 0, 2500); },
    stop: function (i) { tone(140 - i * 10, 0.12, 'square', 0.12); noise(0.06, 0.12, 0, 1200); },
    win: function () { [523, 659, 784].forEach(function (f, i) { tone(f, 0.18, 'triangle', 0.22, i * 0.07); }); },
    bigWin: function () { [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(f, 0.3, 'triangle', 0.25, i * 0.09); tone(f / 2, 0.3, 'sine', 0.12, i * 0.09); }); },
    coin: function () { tone(1318, 0.07, 'square', 0.08); tone(1760, 0.12, 'square', 0.07, 0.05); },
    card: function () { noise(0.12, 0.15, 0, 3000); tone(880, 0.15, 'sine', 0.15, 0.05, 1320); },
    chest: function () { tone(196, 0.2, 'sawtooth', 0.12); [392, 523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.25, 'triangle', 0.2, 0.15 + i * 0.06); }); },
    level: function () { [392, 523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.35, 'triangle', 0.25, i * 0.11); }); },
    spell: function () { tone(300, 0.6, 'sine', 0.2, 0, 1200); tone(450, 0.6, 'sine', 0.12, 0.05, 1800); noise(0.5, 0.06, 0, 4000); },
    build: function () { [0, 0.12, 0.24].forEach(function (d) { noise(0.08, 0.25, d, 400); tone(110, 0.1, 'square', 0.12, d); }); tone(784, 0.3, 'triangle', 0.2, 0.4); },
    error: function () { tone(220, 0.15, 'square', 0.12); tone(180, 0.2, 'square', 0.12, 0.12); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
