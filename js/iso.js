/* Замок удачи v3 — изометрическая карта замка на canvas 2D.
   Только отрисовка и ввод (пан, щипок, колесо, тап по спрайту). Игровая логика — в engine.js/ui.js.
   Координаты мира = пиксели исходной карты 1024×1024; камера: центр (x, y) и масштаб z (css-px на пиксель карты). */
(function (root) {
  'use strict';
  var CL = root.CL, D = CL.Data;
  var ISO = D.ISO, SPR = CL.IsoSpr || {};
  var imgs = {}, masks = {};
  function img(name) {
    var im = imgs[name];
    if (!im) { im = new Image(); im.decoding = 'async'; im.src = name === 'map' ? ISO.map : 'img/iso/' + name + '.webp'; imgs[name] = im; }
    return im;
  }
  function ok(im) { return im.complete && im.naturalWidth > 0; }
  /* маска попадания (битовая, из tools/v3_masks.py) — без getImageData, т.к. в WebView file:// холст «заражается» */
  function hitMask(name, u, v) {
    var s = SPR[name]; if (!s) return u >= 0 && u <= 1 && v >= 0 && v <= 1;
    var m = masks[name];
    if (!m) { var b = atob(s.m), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); m = masks[name] = a; }
    var x = Math.floor(u * s.mw), y = Math.floor(v * s.mh);
    if (x < 0 || y < 0 || x >= s.mw || y >= s.mh) return false;
    var k = y * s.mw + x; return (m[k >> 3] >> (7 - (k & 7))) & 1;
  }
  function preload() {
    var list = ['map', 'ruins', 'scaffold', 'orchard', 'garden', 'v0', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'];
    D.BUILDINGS.forEach(function (b) { for (var t = 1; t <= 3; t++) list.push(b.id + '_' + t); });
    list.forEach(img);
  }
  function lerpPath(path, loop, u) {
    var segs = [], tot = 0, i, n = path.length;
    for (i = 0; i < n - 1 + (loop ? 1 : 0); i++) { var a = path[i], b = path[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push([a, b, l]); tot += l; }
    var d = u * tot;
    for (i = 0; i < segs.length; i++) { if (d <= segs[i][2] || i === segs.length - 1) { var s = segs[i], k = s[2] ? Math.min(1, d / s[2]) : 0; return [s[0][0] + (s[1][0] - s[0][0]) * k, s[0][1] + (s[1][1] - s[0][1]) * k, s[1][0] - s[0][0], tot]; } d -= segs[i][2]; }
    return [path[0][0], path[0][1], 1, tot];
  }

  function create(host, api) {
    preload();
    var cv = document.createElement('canvas'); cv.className = 'iso-cv'; cv.setAttribute('aria-label', 'Карта замка'); host.appendChild(cv);
    var ctx = cv.getContext('2d', { alpha: false });
    var W = 0, H = 0, dpr = 1, model = [], alive = true, raf = 0, last = 0, T = 0;
    var cam = { x: ISO.home[0], y: ISO.home[1], z: 1 }, inited = false, vel = { x: 0, y: 0 }, anim = null;
    var parts = [], press = {}, rects = [], emitT = {}, stats = { frames: 0, dts: [] };
    var birds = [0, 1, 2, 3].map(function (i) { return newBird(i * 0.31); });
    var walkers = (ISO.walks || []).map(function (w, i) { return { w: w, u: w.ph || (i * 0.23) % 1, dir: 1 }; });

    function newBird(ph) { var y = 120 + Math.random() * 500, l2r = Math.random() < 0.5; return { x: l2r ? -60 - ph * 900 : 1090 + ph * 900, y: y, vx: (l2r ? 1 : -1) * (26 + Math.random() * 14), vy: -3 + Math.random() * 6, f: Math.random() * 6, s: 0.8 + Math.random() * 0.5 }; }
    function minZ() { var b = ISO.bounds; return Math.max(W / (b[2] - b[0]), H / (b[3] - b[1])); }
    function maxZ() { return Math.max(2.4, minZ() * 1.6); }
    function clamp() {
      var b = ISO.bounds; cam.z = Math.min(maxZ(), Math.max(minZ(), cam.z));
      var hw = W / 2 / cam.z, hh = H / 2 / cam.z;
      cam.x = b[2] - b[0] <= 2 * hw ? (b[0] + b[2]) / 2 : Math.min(b[2] - hw, Math.max(b[0] + hw, cam.x));
      cam.y = b[3] - b[1] <= 2 * hh ? (b[1] + b[3]) / 2 : Math.min(b[3] - hh, Math.max(b[1] + hh, cam.y));
    }
    function home() { cam.x = ISO.home[0]; cam.y = ISO.home[1]; cam.z = Math.max(minZ(), 0.95); clamp(); }
    function resize() {
      var r = host.getBoundingClientRect(), nd = Math.min(2, root.devicePixelRatio || 1);
      if (r.width < 2 || r.height < 2) return false;
      if (r.width !== W || r.height !== H || nd !== dpr) {
        W = r.width; H = r.height; dpr = nd;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
        if (!inited) { inited = true; home(); } else clamp();
      }
      return true;
    }
    function toWorld(sx, sy) { return [cam.x + (sx - W / 2) / cam.z, cam.y + (sy - H / 2) / cam.z]; }
    function toScreen(wx, wy) { return [(wx - cam.x) * cam.z + W / 2, (wy - cam.y) * cam.z + H / 2]; }

    /* ---------- отрисовка ---------- */
    function placeSprite(name, plot, scale) {
      var s = SPR[name]; if (!s) return null;
      var k = plot.w * (scale || 1.1) / s.dw;
      return { name: name, x: plot.x - s.ax * k, y: plot.y - s.ay * k, w: s.w * k, h: s.h * k, k: k };
    }
    function drawSpr(r, alpha) {
      var im = img(r.name); if (!ok(im)) return;
      if (alpha != null) ctx.globalAlpha = alpha;
      ctx.drawImage(im, r.x, r.y, r.w, r.h);
      if (alpha != null) ctx.globalAlpha = 1;
    }
    function diamond(p, grow) { var hw = p.w / 2 * (grow || 1), hh = p.w * 0.31 * (grow || 1); ctx.beginPath(); ctx.moveTo(p.x, p.y - hh); ctx.lineTo(p.x + hw, p.y); ctx.lineTo(p.x, p.y + hh); ctx.lineTo(p.x - hw, p.y); ctx.closePath(); }
    function puff(x, y, kind) {
      if (parts.length > 260) return;
      if (kind === 'smoke') parts.push({ x: x, y: y, vx: 2 + Math.random() * 3, vy: -9 - Math.random() * 4, r: 2.5, gr: 3.2, life: 0, max: 3.6, a: 0.42, c: '236,232,226' });
      else if (kind === 'dust') parts.push({ x: x, y: y, vx: (Math.random() - 0.5) * 10, vy: -4 - Math.random() * 6, r: 2, gr: 4.5, life: 0, max: 1.6, a: 0.5, c: '196,164,120' });
      else if (kind === 'spark') parts.push({ x: x, y: y, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 20, r: 1.1, gr: -0.4, life: 0, max: 0.45, a: 1, c: '255,214,110', g: 60 });
    }
    function drawBuilding(m, now) {
      var p = ISO.plots[m.id]; if (!p) return;
      var name = (m.locked || m.lvl <= 0) ? 'ruins' : D.bldSprite(m.id, m.lvl);
      var pr = press[m.id], bump = pr ? Math.max(0, 1 - (T - pr) / 0.35) : 0;
      var r = placeSprite(name, p, 1.1 * (name === 'ruins' ? 0.95 : 1) * (1 + 0.05 * Math.sin(bump * Math.PI)));
      if (!r) return;
      if (m.can && !m.job && !m.locked) { // золотая подсветка участка: можно улучшить
        diamond(p, 1.02 + 0.03 * Math.sin(T * 3)); ctx.fillStyle = 'rgba(255,214,90,' + (0.18 + 0.12 * Math.sin(T * 3)).toFixed(3) + ')'; ctx.fill();
      }
      drawSpr(r, m.locked ? 0.82 : null);
      var hit = [r];
      if (m.job) {
        var sr = placeSprite('scaffold', p, m.lvl > 0 ? 0.9 : 0.86);
        if (sr) {
          if (m.lvl > 0) { sr.y -= r.h * 0.06; }
          drawSpr(sr, 0.96); hit.push(sr);
        }
        if (m.job.active) {
          var hw = p.w / 2, hh = p.w * 0.31, key = 'b_' + m.id;
          if ((emitT[key] || 0) < T) { emitT[key] = T + 0.09; var u = Math.random(), side = Math.random() < 0.5 ? -1 : 1; puff(p.x + side * hw * (1 - u), p.y + hh * u * 0.95, 'dust'); }
          // строители: один стучит молотком, другой ходит с доской вдоль фасада
          var hb = Math.abs(Math.sin(T * 6.5 + p.x)), bx = p.x - hw * 0.52, by = p.y + hh * 0.55;
          drawWalker('v0', bx, by, 1, 30, -0.18 + hb * 0.3);
          if (hb > 0.97 && (emitT['s_' + m.id] || 0) < T) { emitT['s_' + m.id] = T + 0.2; for (var q = 0; q < 4; q++) puff(bx + 9, by - 16, 'spark'); }
          var wu = (Math.sin(T * 0.7 + p.y) + 1) / 2;
          drawWalker('v1', p.x + hw * (0.15 + 0.45 * wu), p.y + hh * (0.85 - 0.45 * wu), Math.cos(T * 0.7 + p.y) > 0 ? -1 : 1, 28, Math.sin(T * 9) * 0.05, Math.abs(Math.sin(T * 9)) * 1.5);
        }
      }
      rects.push({ id: m.id, plot: p, r: hit });
    }
    function drawWalker(name, x, y, face, hpx, rot, bob) {
      var s = SPR[name], im = img(name); if (!s || !ok(im)) return;
      var h = hpx, w = s.w / s.h * h;
      ctx.save(); ctx.translate(x, y - (bob || 0)); if (rot) ctx.rotate(rot); if (face < 0) ctx.scale(-1, 1);
      ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore();
    }
    var FACE = { v0: 1, v1: 1, v2: 1, v3: -1, v4: 1, v5: 1, v6: 1, v7: 1 };
    function draw(now) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#f7f3e8'; ctx.fillRect(0, 0, cv.width, cv.height);
      var z = cam.z * dpr;
      ctx.setTransform(z, 0, 0, z, dpr * (W / 2 - cam.x * cam.z), dpr * (H / 2 - cam.y * cam.z));
      ctx.imageSmoothingEnabled = true; try { ctx.imageSmoothingQuality = 'high'; } catch (e) { }
      var map = img('map'); if (ok(map)) ctx.drawImage(map, 0, 0, ISO.size, ISO.size);
      // вода: блики на пруду и реке
      var pd = ISO.pond; ctx.fillStyle = '#ffffff';
      for (var i = 0; i < 6; i++) { var a = T * 0.6 + i * 1.7; ctx.globalAlpha = 0.25 + 0.25 * Math.sin(T * 2 + i); ctx.fillRect(pd[0] + Math.cos(a) * pd[2] * 0.6 - 4, pd[1] + Math.sin(a * 1.3) * pd[3] * 0.5, 8, 1.4); }
      for (i = 0; i < 16; i++) { var pt = lerpPath(ISO.river, false, ((T * 0.018 + i / 16) % 1)); ctx.globalAlpha = 0.3 + 0.3 * Math.sin(T * 3 + i * 2); ctx.fillRect(pt[0] - 5 + (i % 3) * 6, pt[1] + ((i * 7) % 11) - 5, 10, 1.6); }
      ctx.globalAlpha = 1;
      // сортировка по глубине (y)
      rects = [];
      var list = [];
      model.forEach(function (m) { var p = ISO.plots[m.id]; if (p) list.push({ y: p.y, b: m }); });
      (ISO.decor || []).forEach(function (d) { list.push({ y: d.y, d: d }); });
      walkers.forEach(function (w) {
        var p = lerpPath(w.w.path, w.w.loop, w.u); list.push({ y: p[1], wk: w, p: p });
      });
      list.sort(function (a, b) { return a.y - b.y; });
      list.forEach(function (it) {
        if (it.b) drawBuilding(it.b, now);
        else if (it.d) { var r = placeSprite(it.d.spr, it.d, 1.05); if (r) drawSpr(r); }
        else { var w = it.wk, dx = it.p[2] * w.dir; drawWalker(w.w.spr, it.p[0], it.p[1], (dx < 0 ? -1 : 1) * FACE[w.w.spr], 24, Math.sin(T * 8 + w.u * 50) * 0.04, Math.abs(Math.sin(T * 8 + w.u * 50)) * 1.2); }
      });
      // дым из труб
      model.forEach(function (m) {
        if (m.locked || m.lvl <= 0) return;
        var name = D.bldSprite(m.id, m.lvl), ch = ISO.smoke[name]; if (!ch) return;
        var r = placeSprite(name, ISO.plots[m.id], 1.1);
        ch.forEach(function (c, j) { var key = name + j; if ((emitT[key] || 0) < T) { emitT[key] = T + 0.32 + Math.random() * 0.2; puff(r.x + r.w * c[0], r.y + r.h * c[1], 'smoke'); } });
      });
      parts.forEach(function (p) {
        var k = p.life / p.max, al = p.a * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
        ctx.globalAlpha = Math.max(0, al); ctx.fillStyle = 'rgb(' + p.c + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.3, p.r + p.gr * p.life), 0, 6.283); ctx.fill();
      });
      ctx.globalAlpha = 1;
      // фонари: тёплое мерцание
      ctx.globalCompositeOperation = 'lighter';
      ISO.lamps.forEach(function (l, j) {
        var f = 0.55 + 0.25 * Math.sin(T * 2.3 + j * 1.9) + 0.08 * Math.sin(T * 11 + j);
        var g = ctx.createRadialGradient(l[0], l[1], 0, l[0], l[1], 22);
        g.addColorStop(0, 'rgba(255,210,120,' + (0.55 * f).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,170,60,0)');
        ctx.fillStyle = g; ctx.fillRect(l[0] - 22, l[1] - 22, 44, 44);
      });
      ctx.globalCompositeOperation = 'source-over';
      // птицы
      ctx.strokeStyle = 'rgba(60,48,40,.75)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      birds.forEach(function (b) {
        var f = Math.sin(b.f) * 4 * b.s, s = 6 * b.s;
        ctx.beginPath(); ctx.moveTo(b.x - s, b.y - f); ctx.quadraticCurveTo(b.x - s / 2, b.y - 2 - f / 2, b.x, b.y); ctx.quadraticCurveTo(b.x + s / 2, b.y - 2 - f / 2, b.x + s, b.y - f); ctx.stroke();
      });
      drawLabels(now);
    }
    function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    function drawLabels(now) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      var fs = Math.round(Math.min(14, Math.max(11, 9 + cam.z * 3)));
      model.forEach(function (m) {
        var p = ISO.plots[m.id]; if (!p) return;
        var s = toScreen(p.x, p.y + p.w * 0.3); if (s[0] < -80 || s[0] > W + 80 || s[1] < -40 || s[1] > H + 60) return;
        var t = m.locked ? '🔒 ' + m.name : m.name + (m.lvl ? ' · ' + m.lvl : ''), sub = null;
        if (m.locked) sub = 'Откроется на ' + m.unlock + ' ур.';
        else if (m.job && !m.job.active) sub = 'в очереди → ' + m.job.to;
        else if (!m.job && m.lvl <= 0) sub = m.can ? 'Можно построить' : 'Не построено';
        ctx.font = '800 ' + fs + 'px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
        var w = ctx.measureText(t).width + 18 + (m.can && !m.job && !m.locked ? 18 : 0), h = fs + 10, x = s[0] - w / 2, y = s[1];
        rr(x, y, w, h, h / 2); ctx.fillStyle = m.locked ? 'rgba(70,58,46,.82)' : 'rgba(251,244,228,.94)'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = m.job ? '#3f7fae' : m.can && !m.locked ? '#5aa04a' : '#d9a441'; ctx.stroke();
        ctx.fillStyle = m.locked ? '#fff3dc' : '#4a2f1c';
        ctx.fillText(t, s[0] - (m.can && !m.job && !m.locked ? 9 : 0), y + h / 2 + 0.5);
        if (m.can && !m.job && !m.locked) { ctx.beginPath(); ctx.arc(x + w - 13, y + h / 2, 7, 0, 6.283); ctx.fillStyle = '#5aa04a'; ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '900 9px sans-serif'; ctx.fillText('▲', x + w - 13, y + h / 2 + 0.5); }
        var yy = y + h + 3;
        if (m.job && m.job.active) {
          var k = Math.min(1, Math.max(0, (now - m.job.start) / Math.max(1, m.job.end - m.job.start))), bw = Math.max(64, w * 0.8);
          rr(s[0] - bw / 2, yy, bw, 7, 3.5); ctx.fillStyle = 'rgba(40,30,20,.55)'; ctx.fill();
          rr(s[0] - bw / 2 + 1, yy + 1, Math.max(5, (bw - 2) * k), 5, 2.5); ctx.fillStyle = '#7cc4ff'; ctx.fill();
          sub = '🔨 → ' + m.job.to + ' · ' + api.fmtTime(m.job.end - now); yy += 10;
        }
        if (sub) {
          ctx.font = '700 ' + (fs - 1) + 'px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
          var sw = ctx.measureText(sub).width + 12; rr(s[0] - sw / 2, yy, sw, fs + 4, 6); ctx.fillStyle = 'rgba(30,22,14,.6)'; ctx.fill();
          ctx.fillStyle = '#fff6e2'; ctx.fillText(sub, s[0], yy + (fs + 4) / 2 + 0.5);
        }
      });
    }

    /* ---------- обновление ---------- */
    function update(dt) {
      T += dt;
      parts = parts.filter(function (p) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.g) p.vy += p.g * dt; return p.life < p.max; });
      birds.forEach(function (b, i) { b.x += b.vx * dt; b.y += b.vy * dt; b.f += dt * 9; if (b.x < -120 || b.x > 1150) birds[i] = newBird(0); });
      walkers.forEach(function (w) {
        var len = lerpPath(w.w.path, w.w.loop, 0)[3] || 1, sp = 11 * (w.w.speed || 1) / len;
        w.u += sp * dt * w.dir;
        if (w.w.loop) w.u = (w.u + 1) % 1; else if (w.u > 1) { w.u = 1; w.dir = -1; } else if (w.u < 0) { w.u = 0; w.dir = 1; }
      });
      if (anim) {
        var k = Math.min(1, (T - anim.t0) / anim.d), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        cam.x = anim.a.x + (anim.b.x - anim.a.x) * e; cam.y = anim.a.y + (anim.b.y - anim.a.y) * e; cam.z = anim.a.z + (anim.b.z - anim.a.z) * e;
        clamp(); if (k >= 1) anim = null;
      } else if (!drag && (Math.abs(vel.x) > 0.5 || Math.abs(vel.y) > 0.5)) { // инерция после броска
        cam.x -= vel.x * dt / cam.z; cam.y -= vel.y * dt / cam.z; vel.x *= Math.pow(0.04, dt); vel.y *= Math.pow(0.04, dt); clamp();
      }
    }
    function frame(ts) {
      raf = 0; if (!alive) return;
      if (!cv.isConnected) { destroy(); return; }
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016; last = ts;
      if (stats.dts.length >= 240) stats.dts.shift(); stats.dts.push(dt); stats.frames++;
      if (resize() && !(api.paused && api.paused())) { update(dt); draw(api.now()); }
      raf = requestAnimationFrame(frame);
    }

    /* ---------- ввод: пан, щипок, колесо, тап ---------- */
    var ptrs = {}, drag = null, pinch = null;
    function pos(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function hitTest(sx, sy) {
      var w = toWorld(sx, sy);
      for (var i = rects.length - 1; i >= 0; i--) {
        var it = rects[i];
        for (var j = it.r.length - 1; j >= 0; j--) { var r = it.r[j]; if (w[0] >= r.x && w[0] <= r.x + r.w && w[1] >= r.y && w[1] <= r.y + r.h && hitMask(r.name, (w[0] - r.x) / r.w, (w[1] - r.y) / r.h)) return it.id; }
      }
      for (i = rects.length - 1; i >= 0; i--) { var p = rects[i].plot; if (Math.abs(w[0] - p.x) / (p.w / 2) + Math.abs(w[1] - p.y) / (p.w * 0.31) <= 1) return rects[i].id; }
      return null;
    }
    function startDrag(id) { var p = ptrs[id]; drag = { id: id, sx: p[0], sy: p[1], cx: cam.x, cy: cam.y, moved: false, t: performance.now(), lx: p[0], ly: p[1], lt: performance.now() }; vel.x = vel.y = 0; }
    function startPinch() {
      var ids = Object.keys(ptrs), a = ptrs[ids[0]], b = ptrs[ids[1]];
      var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      pinch = { d: Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1])), z: cam.z, w: toWorld(mid[0], mid[1]) }; drag = null;
    }
    function onDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try { cv.setPointerCapture(e.pointerId); } catch (er) { }
      ptrs[e.pointerId] = pos(e); anim = null;
      var n = Object.keys(ptrs).length;
      if (n === 1) startDrag(e.pointerId); else if (n === 2) startPinch();
      e.preventDefault();
    }
    function onMove(e) {
      if (!ptrs[e.pointerId]) {
        if (e.pointerType === 'mouse') cv.style.cursor = hitTest.apply(null, pos(e)) ? 'pointer' : 'grab';
        return;
      }
      ptrs[e.pointerId] = pos(e);
      if (pinch && Object.keys(ptrs).length >= 2) {
        var ids = Object.keys(ptrs), a = ptrs[ids[0]], b = ptrs[ids[1]], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        cam.z = pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d; clamp();
        cam.x = pinch.w[0] - (mid[0] - W / 2) / cam.z; cam.y = pinch.w[1] - (mid[1] - H / 2) / cam.z; clamp();
      } else if (drag && drag.id === e.pointerId) {
        var p = ptrs[e.pointerId], dx = p[0] - drag.sx, dy = p[1] - drag.sy;
        if (!drag.moved && Math.hypot(dx, dy) > 7) drag.moved = true;
        if (drag.moved) {
          cam.x = drag.cx - dx / cam.z; cam.y = drag.cy - dy / cam.z; clamp();
          var t = performance.now(), dtt = Math.max(1, t - drag.lt);
          vel.x = 0.6 * vel.x + 0.4 * (p[0] - drag.lx) / dtt * 1000; vel.y = 0.6 * vel.y + 0.4 * (p[1] - drag.ly) / dtt * 1000;
          drag.lx = p[0]; drag.ly = p[1]; drag.lt = t;
          if (e.pointerType === 'mouse') cv.style.cursor = 'grabbing';
        }
      }
      e.preventDefault();
    }
    function onUp(e) {
      if (!ptrs[e.pointerId]) return;
      var wasDrag = drag && drag.id === e.pointerId ? drag : null;
      delete ptrs[e.pointerId];
      var n = Object.keys(ptrs).length;
      if (pinch) { if (n < 2) { pinch = null; if (n === 1) startDrag(Object.keys(ptrs)[0]); } vel.x = vel.y = 0; return; }
      drag = null;
      if (wasDrag) {
        if (performance.now() - wasDrag.lt > 90) { vel.x = vel.y = 0; }
        if (!wasDrag.moved && e.type === 'pointerup') {
          var p = pos(e), id = hitTest(p[0], p[1]);
          if (id) { press[id] = T; api.onTap(id); }
        }
      }
      if (e.pointerType === 'mouse') cv.style.cursor = 'grab';
    }
    function onWheel(e) {
      e.preventDefault(); anim = null;
      var p = pos(e), w = toWorld(p[0], p[1]), dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      cam.z *= Math.exp(-dy * 0.0016); clamp();
      cam.x = w[0] - (p[0] - W / 2) / cam.z; cam.y = w[1] - (p[1] - H / 2) / cam.z; clamp();
    }
    function noGesture(e) { e.preventDefault(); }
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('lostpointercapture', onUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('gesturestart', noGesture);
    cv.addEventListener('contextmenu', noGesture);
    cv.style.cursor = 'grab';

    function destroy() { alive = false; if (raf) cancelAnimationFrame(raf); raf = 0; if (cv.parentNode) cv.parentNode.removeChild(cv); }
    raf = requestAnimationFrame(frame);
    var self = {
      setModel: function (m) { model = m || []; },
      alive: function () { return alive && cv.isConnected; },
      destroy: destroy,
      view: function () { return { x: cam.x, y: cam.y, z: cam.z, minZ: minZ(), maxZ: maxZ(), W: W, H: H }; },
      setView: function (v, ms) {
        var b = { x: v.x != null ? v.x : cam.x, y: v.y != null ? v.y : cam.y, z: v.z != null ? v.z : cam.z };
        if (ms) { anim = { a: { x: cam.x, y: cam.y, z: cam.z }, b: b, t0: T, d: ms / 1000 }; }
        else { cam.x = b.x; cam.y = b.y; cam.z = b.z; clamp(); }
      },
      zoomBy: function (f) { var c = { x: cam.x, y: cam.y, z: cam.z }; cam.z *= f; clamp(); var z2 = cam.z; cam.z = c.z; self.setView({ z: z2 }, 220); },
      home: function () { var c = { x: cam.x, y: cam.y, z: cam.z }; home(); var h = { x: cam.x, y: cam.y, z: cam.z }; cam.x = c.x; cam.y = c.y; cam.z = c.z; self.setView(h, 400); },
      focus: function (id, z) { var p = ISO.plots[id]; if (p) self.setView({ x: p.x, y: p.y - p.w * 0.2, z: z || Math.max(cam.z, 1.4) }, 450); },
      /* экранная точка центра спрайта постройки (для тестов/подсказок) */
      screenOf: function (id) { var p = ISO.plots[id]; if (!p) return null; var s = toScreen(p.x, p.y - p.w * 0.12); var r = cv.getBoundingClientRect(); return { x: s[0] + r.left, y: s[1] + r.top, inView: s[0] > 0 && s[0] < W && s[1] > 0 && s[1] < H }; },
      hitTest: function (cx, cy) { var r = cv.getBoundingClientRect(); return hitTest(cx - r.left, cy - r.top); },
      fps: function () { var a = stats.dts.slice(-120); if (!a.length) return 0; var s = 0; a.forEach(function (d) { s += d; }); return a.length / s; },
      frames: function () { return stats.frames; },
      canvas: cv
    };
    return self;
  }
  CL.Iso = { create: create, preload: preload };
})(typeof globalThis !== 'undefined' ? globalThis : this);
