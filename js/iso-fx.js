/* Замок удачи v4 — «живая» карта: китайский облачный дракон, феи, кузнец, китайские флажки,
   небесные фонарики, птицы, облака с тенями. Только отрисовка (canvas 2D), без логики игры.
   Производительность: все свечения/облака/сегменты дракона заранее отрисованы в маленькие холсты
   (одно drawImage на объект), пулы частиц фиксированного размера, отсечение вне экрана,
   уровни качества 'high' | 'low' | 'off'. Мировые координаты = пиксели карты 1024×1024. */
(function (root) {
  'use strict';
  var CL = root.CL, D = CL.Data;
  var TAU = Math.PI * 2;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function cnv(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  /* --- заранее отрисованные спрайты --- */
  var SPR = null;
  function glow(r, rgb, core) {
    var c = cnv(r * 2, r * 2), g = c.getContext('2d'), gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, 'rgba(' + rgb + ',' + (core || 0.9) + ')'); gr.addColorStop(0.35, 'rgba(' + rgb + ',0.35)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); return c;
  }
  function cloud(seed, w, h, dark) {
    var c = cnv(w, h), g = c.getContext('2d'), n = 9, s = seed;
    function r2() { s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for (var i = 0; i < n; i++) {
      var x = w * (0.2 + 0.6 * i / (n - 1)) + (r2() - 0.5) * w * 0.06, y = h * (0.6 - 0.18 * Math.sin(Math.PI * i / (n - 1))) + (r2() - 0.5) * h * 0.06;
      var rr = h * (0.15 + 0.15 * Math.sin(Math.PI * i / (n - 1))) * (0.85 + r2() * 0.25); // всё внутри холста — без резких краёв
      var gr = g.createRadialGradient(x - rr * 0.25, y - rr * 0.35, rr * 0.1, x, y, rr);
      if (dark) { gr.addColorStop(0, 'rgba(30,40,30,.55)'); gr.addColorStop(1, 'rgba(30,40,30,0)'); }
      else { gr.addColorStop(0, 'rgba(255,255,255,.98)'); gr.addColorStop(0.6, 'rgba(246,242,236,.85)'); gr.addColorStop(1, 'rgba(225,222,230,0)'); }
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
    }
    return c;
  }
  function lantern() { // небесный фонарик (кунминдэн): тёплое свечение + бумажный корпус
    var W = 48, H = 60, c = cnv(W, H), g = c.getContext('2d');
    var gr = g.createRadialGradient(24, 34, 2, 24, 34, 26); gr.addColorStop(0, 'rgba(255,190,90,.55)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.beginPath(); g.moveTo(12, 14); g.quadraticCurveTo(24, 6, 36, 14); g.quadraticCurveTo(35, 30, 31, 42); g.quadraticCurveTo(24, 45, 17, 42); g.quadraticCurveTo(13, 30, 12, 14); g.closePath();
    var b = g.createLinearGradient(12, 0, 36, 0); b.addColorStop(0, '#cf3b27'); b.addColorStop(0.42, '#ffc56a'); b.addColorStop(0.6, '#ff9d45'); b.addColorStop(1, '#bf3322');
    g.fillStyle = b; g.fill(); g.lineWidth = 0.8; g.strokeStyle = 'rgba(110,28,10,.55)'; g.stroke();
    var v = g.createLinearGradient(0, 10, 0, 44); v.addColorStop(0, 'rgba(120,20,10,.25)'); v.addColorStop(1, 'rgba(255,240,180,.35)'); g.fillStyle = v; g.fill();
    g.strokeStyle = 'rgba(140,40,20,.35)'; for (var k = 0; k < 2; k++) { g.beginPath(); g.moveTo(19 + k * 10, 10); g.quadraticCurveTo(18 + k * 12, 28, 20 + k * 8, 43); g.stroke(); }
    g.fillStyle = 'rgba(255,248,200,.95)'; g.beginPath(); g.ellipse(24, 42, 5, 1.8, 0, 0, TAU); g.fill();
    return c;
  }
  function segment(r) { // сегмент тела дракона: нефритовый шар с золотыми чешуйками
    var s = Math.ceil(r * 2 + 4), c = cnv(s, s), g = c.getContext('2d'), m = s / 2;
    var gr = g.createRadialGradient(m - r * 0.35, m - r * 0.4, r * 0.1, m, m, r);
    gr.addColorStop(0, '#9fe0b4'); gr.addColorStop(0.55, '#3f9e72'); gr.addColorStop(1, '#1f5c45');
    g.fillStyle = gr; g.beginPath(); g.arc(m, m, r, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(233,196,95,.55)'; g.lineWidth = Math.max(1, r * 0.08);
    for (var k = 0; k < 3; k++) { g.beginPath(); g.arc(m + (k - 1) * r * 0.45, m - r * 0.1, r * 0.42, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
    g.strokeStyle = 'rgba(20,50,35,.5)'; g.lineWidth = 1; g.beginPath(); g.arc(m, m, r - 0.5, 0, TAU); g.stroke();
    return c;
  }
  function initSprites() {
    if (SPR) return SPR;
    SPR = { lamp: glow(24, '255,200,110', 0.75), fairy: [glow(16, '190,255,200'), glow(16, '255,190,240'), glow(16, '190,225,255')], spark: glow(8, '255,250,210', 1),
            ember: glow(8, '255,190,80', 1), lantern: lantern(), clouds: [cloud(3, 260, 110), cloud(11, 300, 120), cloud(29, 220, 100)],
            shadows: [cloud(3, 130, 55, true), cloud(11, 150, 60, true), cloud(29, 110, 50, true)], puff: cloud(7, 120, 60), seg: [] };
    for (var i = 0; i <= 16; i++) SPR.seg.push(segment(3 + i));
    return SPR;
  }
  function img(name) { var im = new Image(); im.decoding = 'async'; im.src = 'img/iso/' + name + '.webp'; return im; }
  function ok(im) { return im.complete && im.naturalWidth > 0; }

  /* настройки по уровню качества */
  var Q = { high: { lanterns: 22, fairies: 3, trail: 0.05, clouds: 5, flocks: 3, segs: 40, flags: 1, puffs: true, chunk: 3, fancy: true },
            low:  { lanterns: 10, fairies: 2, trail: 0.12, clouds: 3, flocks: 2, segs: 30, flags: 2, puffs: false, chunk: 4, fancy: false } };
  var WALL_FLAGS = [[378, 126], [648, 126], [762, 214], [255, 228], [130, 270], [905, 270], [63, 368], [978, 373], [55, 450], [985, 465], [155, 570], [918, 567], [320, 686], [705, 696], [470, 716], [548, 716]];
  var FAIRY_SPOTS = [[674, 515, 46, 18], [846, 445, 54, 22], [322, 430, 36, 16]];

  function create() {
    var S = initSprites(), head = img('dragon_head'), smith = [img('smith0'), img('smith1')];
    var T = 0, q = 'high', P = Q.high;
    // пул частиц (феи-искры, угольки кузни, облачка дракона)
    var POOL = 160, parts = []; for (var i = 0; i < POOL; i++) parts.push({ on: false });
    function emit(kind, x, y, vx, vy, life, size, extra) {
      for (var i = 0; i < POOL; i++) { var p = parts[i]; if (!p.on) { p.on = true; p.k = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = 0; p.max = life; p.s = size; p.e = extra || 0; return; } }
    }
    var lanterns = [], clouds = [], flocks = [], fairies = [], dragon = { on: false, next: 3 }, smithT = 0, stats = { drawn: 0 };
    function newLantern(init) {
      return { gx: rnd(150, 880), gy: rnd(260, 780), alt: init ? rnd(0, 300) : 0, max: rnd(260, 460), vy: rnd(7, 13), ph: rnd(0, TAU), wob: rnd(0.4, 0.9), dx: 0, fade: init ? 1 : 0, s: rnd(0.75, 1.15), fl: rnd(0, TAU) };
    }
    function newCloud(init) { var k = (Math.random() * 3) | 0; return { k: k, x: init ? rnd(-100, 1000) : -320, y: rnd(40, 820), v: rnd(7, 13), s: rnd(0.8, 1.3), a: rnd(0.45, 0.7) }; }
    function newFlock(init) {
      var l2r = Math.random() < 0.5, n = 3 + ((Math.random() * 4) | 0), y = rnd(80, 760), b = [];
      for (var i = 0; i < n; i++) { var r = Math.ceil(i / 2), side = i % 2 ? 1 : -1; b.push({ ox: -r * 14, oy: side * r * 9, f: rnd(0, TAU), fs: rnd(8, 11) }); }
      return { x: init ? rnd(0, 1024) : (l2r ? -80 : 1100), y: y, vx: (l2r ? 1 : -1) * rnd(30, 42), vy: rnd(-4, 4), b: b, s: rnd(0.8, 1.15) };
    }
    function setQuality(nq) {
      if (nq === q && lanterns.length) return; q = nq; P = Q[q] || Q.low;
      if (q === 'off') return;
      while (lanterns.length < P.lanterns) lanterns.push(newLantern(true)); lanterns.length = P.lanterns;
      while (clouds.length < P.clouds) clouds.push(newCloud(true)); clouds.length = P.clouds;
      while (flocks.length < P.flocks) flocks.push(newFlock(true)); flocks.length = P.flocks;
      fairies = [];
      FAIRY_SPOTS.forEach(function (sp, si) { for (var k = 0; k < P.fairies; k++) fairies.push({ sp: sp, a: rnd(0, TAU), w: rnd(0.9, 1.5) * (k % 2 ? -1 : 1), alt: rnd(16, 34), c: (si + k) % 3, t: 0 }); });
    }
    /* ---- дракон: голова идёт по синусоиде, тело — та же траектория с запаздыванием ---- */
    function summon() { // пролёт через центральную часть карты под случайным углом
      var a = rnd(0, TAU), dx = Math.cos(a), dy = Math.sin(a) * 0.75, n = Math.hypot(dx, dy); dx /= n; dy /= n;
      var off = rnd(-170, 170), cx = 512 - dy * off, cy = 470 + dx * off, R = 820;
      var A = [cx - dx * R, cy - dy * R], B = [cx + dx * R, cy + dy * R], len = 2 * R;
      dragon = { on: true, t: 0, A: A, B: B, dur: len / 72, amp: rnd(50, 85), fr: rnd(2.2, 3.4), ph: rnd(0, TAU), nx: -dy, ny: dx, lag: 0.15, next: 0 };
    }
    function dpos(t) { // положение точки траектории в момент t (может быть <0 — ещё за краем)
      var d = dragon, u = t / d.dur, w = Math.sin(u * d.fr * TAU + d.ph) * d.amp + Math.sin(u * 11 + d.ph) * 10;
      return [d.A[0] + (d.B[0] - d.A[0]) * u + d.nx * w, d.A[1] + (d.B[1] - d.A[1]) * u + d.ny * w - 60 - 18 * Math.sin(u * 7)];
    }

    function update(dt, ctx) {
      T += dt; if (q === 'off') return;
      var m = ctx.model || [];
      // фонарики
      for (var i = 0; i < lanterns.length; i++) {
        var L = lanterns[i], hov = 0.22 + 0.78 * Math.pow(0.5 + 0.5 * Math.sin(T * 0.45 + L.ph), 2);
        L.alt += L.vy * hov * dt; L.dx += (3 + Math.sin(T * L.wob + L.ph) * 5) * dt;
        if (L.alt > L.max) L.fade -= dt / 3.5; else if (L.fade < 1) L.fade = Math.min(1, L.fade + dt / 2);
        if (L.fade <= 0 && L.alt > L.max) lanterns[i] = newLantern(false);
      }
      for (i = 0; i < clouds.length; i++) { var c = clouds[i]; c.x += c.v * dt; if (c.x > 1150) clouds[i] = newCloud(false); }
      for (i = 0; i < flocks.length; i++) { var f = flocks[i]; f.x += f.vx * dt; f.y += f.vy * dt; if (f.x < -140 || f.x > 1170) flocks[i] = newFlock(false); }
      // феи + шлейф искр
      fairies.forEach(function (F) {
        F.a += F.w * dt; F.t -= dt;
        var x = F.sp[0] + Math.cos(F.a) * F.sp[2] + Math.sin(T * 1.7 + F.c) * 6, y = F.sp[1] + Math.sin(F.a) * F.sp[3] - F.alt - Math.sin(T * 3 + F.a) * 5;
        F.x = x; F.y = y;
        if (F.t <= 0) { F.t = P.trail; emit('fairy', x, y, rnd(-4, 4), rnd(2, 8), rnd(0.7, 1.1), rnd(0.25, 0.45), F.c); }
      });
      // кузнец: цикл 0,9 с — замах / удар; искры в момент удара
      var forge = m.filter(function (b) { return b.id === 'forge'; })[0];
      if (forge && forge.lvl > 0 && !forge.locked) {
        var ph = (T % 0.9) / 0.9, was = smithT; smithT = ph;
        if (was < 0.62 && ph >= 0.62) { var sp = smithPos(); for (var k = 0; k < (q === 'high' ? 9 : 4); k++) emit('ember', sp[0] - 6, sp[1] - 17, rnd(-30, 25), rnd(-45, -12), rnd(0.3, 0.6), rnd(0.25, 0.5)); }
      }
      // дракон
      if (!dragon.on) { dragon.next -= dt; if (dragon.next <= 0) summon(); }
      else {
        dragon.t += dt;
        if (P.puffs && Math.random() < dt * 9) { var sg = (Math.random() * P.segs) | 0, pp = dpos(dragon.t - sg * dragon.lag); emit('puff', pp[0], pp[1] + rnd(-6, 10), rnd(-6, 6), rnd(-3, 3), rnd(1.2, 2), rnd(0.25, 0.5)); }
        if (dragon.t - P.segs * dragon.lag > dragon.dur) { dragon = { on: false, next: rnd(22, 34) }; }
      }
      for (i = 0; i < POOL; i++) { var p = parts[i]; if (!p.on) continue; p.life += dt; if (p.life >= p.max) { p.on = false; continue; } p.x += p.vx * dt; p.y += p.vy * dt; if (p.k === 'ember') p.vy += 90 * dt; }
    }
    function smithPos() { return [326, 618]; }
    function inView(v, x, y, m) { return x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m; }

    /* ---- слой «земля»: тени облаков и дракона (под постройками) ---- */
    function drawGround(g, v) {
      if (q === 'off') return;
      for (var i = 0; i < clouds.length; i++) {
        var c = clouds[i], sh = S.shadows[c.k], w = sh.width * c.s, h = sh.height * c.s, x = c.x + 60, y = c.y + 150;
        if (!inView(v, x, y, w)) continue; g.globalAlpha = 0.16; g.drawImage(sh, x - w / 2, y - h / 2, w, h);
      }
      if (dragon.on) {
        g.globalAlpha = 0.13; g.fillStyle = '#1e2a1e';
        for (var k = 0; k < P.segs; k += 2) { var p = dpos(dragon.t - k * dragon.lag); var x2 = p[0] + 30, y2 = p[1] + 170; if (!inView(v, x2, y2, 30)) continue; g.beginPath(); g.ellipse(x2, y2, Math.max(3, 16 - k * 0.3), Math.max(1.5, 7 - k * 0.13), 0, 0, TAU); g.fill(); }
      }
      g.globalAlpha = 1;
    }
    /* ---- объекты с глубиной (сортируются вместе с постройками): флажки на стенах, кузнец ---- */
    function depthItems(v, model) {
      var out = []; if (q === 'off') return out;
      for (var i = 0; i < WALL_FLAGS.length; i += P.flags) { var f = WALL_FLAGS[i]; if (inView(v, f[0], f[1], 40)) out.push({ y: f[1] + 30, flag: f, i: i }); }
      (model || []).forEach(function (b) { // пара флажков у каждой построенной постройки (по бокам участка)
        if (b.locked || b.lvl <= 0 || q !== 'high') return; var p = D.ISO.plots[b.id];
        var L = [p.x - p.w * 0.47, p.y + 2], R = [p.x + p.w * 0.47, p.y + 2];
        if (inView(v, p.x, p.y, p.w)) { out.push({ y: L[1], flag: L, i: 20 + b.id.length, small: true }); out.push({ y: R[1], flag: R, i: 31 + b.id.length, small: true }); }
      });
      var forge = (model || []).filter(function (b) { return b.id === 'forge'; })[0];
      if (forge && forge.lvl > 0 && !forge.locked) { var sp = smithPos(); if (inView(v, sp[0], sp[1], 60)) out.push({ y: sp[1], smith: true }); }
      return out;
    }
    function drawDepth(g, it) {
      if (it.smith) {
        var fr = smithT >= 0.55 && smithT < 0.85 ? 1 : 0, im = smith[fr]; if (!ok(im)) return;
        var sp = smithPos(), h = 34, w = im.naturalWidth / im.naturalHeight * h;
        g.drawImage(im, sp[0] - w * 0.55, sp[1] - h, w, h);
        if (fr) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.8; g.drawImage(S.ember, sp[0] - 14, sp[1] - 25, 16, 16); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
        return;
      }
      drawFlag(g, it.flag[0], it.flag[1], it.i, it.small);
    }
    function drawFlag(g, x, y, seed, small) {
      var k = small ? 0.75 : 1, ph = h1(seed) * TAU, top = y - 26 * k, L = 17 * k, Hh = 10 * k;
      g.strokeStyle = '#4a3220'; g.lineWidth = 1.3 * k; g.beginPath(); g.moveTo(x, y); g.lineTo(x, top - 2); g.stroke();
      g.fillStyle = '#e8b93f'; g.beginPath(); g.arc(x, top - 2.5, 1.6 * k, 0, TAU); g.fill();
      var pts = [], n = 6;
      for (var i = 0; i <= n; i++) { var u = i / n, wv = Math.sin(T * 4.2 + ph - u * 3.2) * 2.6 * k * u; pts.push([x + u * L, top + wv + u * 1.5]); }
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (i = 1; i <= n; i++) g.lineTo(pts[i][0], pts[i][1]);
      var e = pts[n]; g.lineTo(e[0] - 4 * k, e[1] + Hh / 2); g.lineTo(e[0], e[1] + Hh); // «ласточкин хвост»
      for (i = n; i >= 0; i--) g.lineTo(pts[i][0], pts[i][1] + Hh);
      g.closePath(); g.fillStyle = '#c8322a'; g.fill(); g.lineWidth = 1 * k; g.strokeStyle = '#e8b93f'; g.stroke();
      var c = pts[2]; g.fillStyle = '#f2cf62'; g.beginPath(); g.arc(c[0], c[1] + Hh / 2, 2.2 * k, 0, TAU); g.fill();
    }
    function h1(n) { var x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }

    /* ---- слой «воздух»: фонарики, феи, дракон, птицы, облака ---- */
    function drawAir(g, v, cam) {
      if (q === 'off') return;
      var i, p;
      g.globalCompositeOperation = 'lighter';
      for (i = 0; i < POOL; i++) {
        p = parts[i]; if (!p.on || p.k === 'puff' || !inView(v, p.x, p.y, 20)) continue;
        var k = p.life / p.max, a = (1 - k) * (p.k === 'fairy' ? 0.5 + 0.5 * Math.sin(T * 25 + i) : 1), spr = p.k === 'fairy' ? S.fairy[p.e] : S.ember, s = spr.width * p.s * (1 - k * 0.5);
        g.globalAlpha = Math.max(0, a); g.drawImage(spr, p.x - s / 2, p.y - s / 2, s, s);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      // фонарики
      for (i = 0; i < lanterns.length; i++) {
        var L = lanterns[i], x = L.gx + L.dx, y = L.gy - L.alt, sc = L.s * 0.6;
        if (!inView(v, x, y, 30)) continue;
        var fl = 0.85 + 0.15 * Math.sin(T * 7 + L.fl) * Math.sin(T * 3.1 + L.ph), al = Math.max(0, Math.min(1, L.fade));
        sc *= 1 - Math.min(0.35, L.alt / 1300); // выше — чуть меньше
        if (q === 'high' && al > 0.25) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = al * fl * 0.6; g.drawImage(S.lamp, x - 31 * sc, y - 25 * sc, 62 * sc, 62 * sc); g.globalCompositeOperation = 'source-over'; }
        g.globalAlpha = al * (0.8 + 0.2 * fl);
        g.drawImage(S.lantern, x - 24 * sc, y - 34 * sc, 48 * sc, 60 * sc);
      }
      g.globalAlpha = 1;
      // феи: свечение + крылышки
      fairies.forEach(function (F) {
        if (F.x == null || !inView(v, F.x, F.y, 20)) return;
        g.globalCompositeOperation = 'lighter'; g.drawImage(S.fairy[F.c], F.x - 13, F.y - 13, 26, 26); g.globalCompositeOperation = 'source-over';
        var fw = 0.4 + 0.6 * Math.abs(Math.sin(T * 38 + F.a));
        g.fillStyle = 'rgba(235,250,255,.75)';
        g.beginPath(); g.ellipse(F.x - 2.4, F.y - 1.5, 2.6 * fw, 1.3, -0.6, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(F.x + 2.4, F.y - 1.5, 2.6 * fw, 1.3, 0.6, 0, TAU); g.fill();
        g.fillStyle = '#fffbe8'; g.beginPath(); g.arc(F.x, F.y, 1.2, 0, TAU); g.fill();
      });
      // облачка от дракона (под ним)
      for (i = 0; i < POOL; i++) { p = parts[i]; if (!p.on || p.k !== 'puff' || !inView(v, p.x, p.y, 40)) continue; var kk = p.life / p.max; g.globalAlpha = 0.55 * (kk < 0.2 ? kk / 0.2 : 1 - kk); var w = 60 * p.s * (1 + kk), h = w / 2; g.drawImage(S.puff, p.x - w / 2, p.y - h / 2, w, h); }
      g.globalAlpha = 1;
      if (dragon.on) drawDragon(g, v);
      // птицы стайками
      g.strokeStyle = 'rgba(60,48,40,.8)'; g.lineCap = 'round'; g.lineWidth = 1.3;
      for (i = 0; i < flocks.length; i++) {
        var f = flocks[i]; if (!inView(v, f.x, f.y, 90)) continue; g.beginPath();
        for (var j = 0; j < f.b.length; j++) {
          var b = f.b[j], bx = f.x + b.ox * Math.sign(f.vx), by = f.y + b.oy, fp = Math.sin(T * b.fs + b.f) * 4 * f.s, s2 = 6 * f.s;
          g.moveTo(bx - s2, by - fp); g.quadraticCurveTo(bx - s2 / 2, by - 2 - fp / 2, bx, by); g.quadraticCurveTo(bx + s2 / 2, by - 2 - fp / 2, bx + s2, by - fp);
        }
        g.stroke();
      }
      // облака (выше всего; лёгкий параллакс относительно камеры)
      var px = (cam.x - 512) * 0.18, py = (cam.y - 512) * 0.18;
      for (i = 0; i < clouds.length; i++) {
        var c = clouds[i], cs = S.clouds[c.k], cw = cs.width * c.s, ch = cs.height * c.s, cx = c.x - px, cy = c.y - py;
        if (!inView(v, cx, cy, cw)) continue; g.globalAlpha = c.a; g.drawImage(cs, cx - cw / 2, cy - ch / 2, cw, ch);
      }
      g.globalAlpha = 1;
    }
    function drawDragon(g, v) {
      var d = dragon, N = P.segs, pts = [];
      for (var k = 0; k < N; k++) pts.push(dpos(d.t - k * d.lag));
      var anyIn = pts.some(function (p) { return inView(v, p[0], p[1], 80); }); if (!anyIn) return;
      // хвост: красное пламя
      var tl = pts[N - 1], tp = pts[N - 2], ta = Math.atan2(tl[1] - tp[1], tl[0] - tp[0]);
      g.fillStyle = 'rgba(214,70,40,.9)';
      for (var f = -1; f <= 1; f++) { g.beginPath(); g.moveTo(tl[0], tl[1]); g.quadraticCurveTo(tl[0] + Math.cos(ta + f * 0.5) * 12, tl[1] + Math.sin(ta + f * 0.5) * 12 - 3, tl[0] + Math.cos(ta + f * 0.6 + Math.sin(T * 6) * 0.2) * 22, tl[1] + Math.sin(ta + f * 0.6) * 22); g.quadraticCurveTo(tl[0] + Math.cos(ta + f * 0.4) * 8, tl[1] + Math.sin(ta + f * 0.4) * 8 + 3, tl[0], tl[1]); g.fill(); }
      // тело — гладкая «труба» из коротких штрихов: контур, нефрит, блик сверху, кремовое брюхо снизу, золотые чешуйки, гребень
      function R(k) { return 3.5 + 14 * Math.pow(Math.sin(Math.min(1, (k + 3) / N * 1.15) * Math.PI * 0.5 + 0.0001) * (1 - k / N), 0.5); }
      function nrm(k) { var a = pts[Math.max(0, k - 1)], b = pts[Math.min(N - 1, k + 1)], ang = Math.atan2(a[1] - b[1], a[0] - b[0]), nx = Math.sin(ang), ny = -Math.cos(ang); if (ny > 0) { nx = -nx; ny = -ny; } return [nx, ny, ang]; }
      g.lineCap = 'round'; g.lineJoin = 'round';
      var passes = P.fancy ? [['#173f2f', 2.2, 0], ['#3e9a6f', 1.85, 0], ['#2c7a56', 1.35, 0.12, true], ['#8fd6a6', 0.6, 0.45], ['#f0dfae', 0.6, -0.55]]
                           : [['#173f2f', 2.2, 0], ['#3e9a6f', 1.85, 0], ['#f0dfae', 0.6, -0.55]];
      var CH = P.chunk;
      for (var pi = 0; pi < passes.length; pi++) {
        var ps = passes[pi]; g.strokeStyle = ps[0];
        for (var c = N - 1; c > 1; c -= CH) {
          var r0 = R(c - 1), off = ps[2] * r0; g.lineWidth = Math.max(1, r0 * ps[1]);
          if (ps[3]) { if (!g.setLineDash) continue; g.setLineDash([Math.max(1.5, r0 * 0.35), Math.max(2, r0 * 0.55)]); g.lineCap = 'butt'; }
          g.beginPath();
          for (var j = Math.min(N - 1, c + 1); j >= c - CH && j >= 1; j--) { var nn = nrm(j), pp = pts[j], ox = nn[0] * off, oy = nn[1] * off; if (j === Math.min(N - 1, c + 1)) g.moveTo(pp[0] + ox, pp[1] + oy); else g.lineTo(pp[0] + ox, pp[1] + oy); }
          g.stroke(); if (ps[3]) { g.setLineDash([]); g.lineCap = 'round'; }
        }
      }
      for (k = N - 2; k >= 1; k--) {
        var p = pts[k], r = R(k), nn2 = nrm(k), nx = nn2[0], ny = nn2[1], ang = nn2[2];
        if (k % 2 === 0) { // гребень-пламя
          var fl = r * (0.8 + 0.3 * Math.sin(T * 8 + k));
          g.fillStyle = k % 4 ? '#d8452c' : '#e7b443';
          g.beginPath(); g.moveTo(p[0] - Math.cos(ang) * r * 0.5 + nx * r * 0.8, p[1] - Math.sin(ang) * r * 0.5 + ny * r * 0.8); g.lineTo(p[0] + nx * (r + fl) - Math.cos(ang) * r * 1.1, p[1] + ny * (r + fl) - Math.sin(ang) * r * 1.1); g.lineTo(p[0] + Math.cos(ang) * r * 0.5 + nx * r * 0.8, p[1] + Math.sin(ang) * r * 0.5 + ny * r * 0.8); g.fill();
        }
        if (r > 6 && P.fancy) { // чешуйки
          g.strokeStyle = 'rgba(233,196,95,.7)'; g.lineWidth = 1;
          g.beginPath(); g.arc(p[0] + nx * r * 0.25, p[1] + ny * r * 0.25, r * 0.45, ang + 0.6, ang + Math.PI - 0.6); g.stroke();
        }
      }
      // голова (спрайт), развёрнута по направлению полёта; при полёте влево — зеркально по вертикали
      if (ok(head)) {
        var h0 = pts[0], h2 = pts[2], a = Math.atan2(h0[1] - h2[1], h0[0] - h2[0]), hw = 66, hh = hw * head.naturalHeight / head.naturalWidth;
        g.save(); g.translate(h0[0], h0[1]); g.rotate(a - 0.22 * (Math.cos(a) < 0 ? -1 : 1)); if (Math.cos(a) < 0) g.scale(1, -1);
        g.drawImage(head, -hw * 0.1, -hh * 0.55, hw, hh); g.restore();
      }
    }
    setQuality('high');
    return { update: update, drawGround: drawGround, drawAir: drawAir, depthItems: depthItems, drawDepth: drawDepth, setQuality: setQuality,
      quality: function () { return q; }, summonDragon: summon, dragonOn: function () { return dragon.on; }, dragonHead: function () { return dragon.on ? dpos(dragon.t) : null; },
      counts: function () { return { lanterns: lanterns.length, fairies: fairies.length, clouds: clouds.length, flocks: flocks.length, parts: parts.filter(function (p) { return p.on; }).length, dragon: dragon.on }; } };
  }
  CL.IsoFx = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
