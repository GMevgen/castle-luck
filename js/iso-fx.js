/* Замок удачи v5 — «живая» карта: феи, кузнец, небесные фонарики, птицы, облака с тенями.
   Только отрисовка (canvas 2D), без логики игры.
   Производительность: все свечения/облака/фонарики заранее отрисованы в маленькие холсты
   (одно drawImage на объект), пул частиц фиксированного размера, отсечение вне экрана,
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
  function cloud(seed, w, h, dark) { // облако в духе аниме-фона: два тона (тень снизу, белая «шапка»), мягкий край
    var c = cnv(w, h), g = c.getContext('2d'), n = 9, s = seed, B = [];
    function r2() { s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for (var i = 0; i < n; i++) {
      var x = w * (0.2 + 0.6 * i / (n - 1)) + (r2() - 0.5) * w * 0.06, y = h * (0.62 - 0.2 * Math.sin(Math.PI * i / (n - 1))) + (r2() - 0.5) * h * 0.06;
      B.push([x, y, h * (0.14 + 0.16 * Math.sin(Math.PI * i / (n - 1))) * (0.85 + r2() * 0.25)]); // всё внутри холста — без резких краёв
    }
    function blob(x, y, rr, col, a) { var gr = g.createRadialGradient(x, y, rr * 0.55, x, y, rr); gr.addColorStop(0, 'rgba(' + col + ',' + a + ')'); gr.addColorStop(0.8, 'rgba(' + col + ',' + (a * 0.9) + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill(); }
    if (dark) { B.forEach(function (b) { blob(b[0], b[1], b[2], '30,44,40', 0.5); }); return c; }
    B.forEach(function (b) { blob(b[0], b[1], b[2], '196,204,228', 0.95); });            // сиренево-серая тень
    B.forEach(function (b) { blob(b[0] - b[2] * 0.08, b[1] - b[2] * 0.2, b[2] * 0.86, '255,253,248', 1); }); // белая освещённая часть
    B.forEach(function (b) { blob(b[0] - b[2] * 0.2, b[1] - b[2] * 0.42, b[2] * 0.4, '255,246,226', 0.7); }); // тёплый блик
    return c;
  }
  /* 0.7: эффекты по теме — в «Киберпанке» (fx.ambient = 'neon') вместо фонариков дроны, вместо облаков смог, вместо фей голо-искры, вместо птиц — стаи микродронов */
  function AMB() { try { var a = (CL.Theme && CL.Theme.fx('ambient')) || ''; return (a === 'toon' || a === 'monet') ? 'monet' : a; } catch (e) { return ''; } }
  function NEON() { return AMB() === 'neon'; }
  /* фаза B: «gloom» (тёмное фэнтези) — блуждающие огоньки, туман, летучие мыши; «ash» (карандаш) — дым и пепел, вороны;
     «paper» (цветные карандаши) — воздушные шарики, бабочки */
  function mist(seed, w, h, c0, c1, n) {
    var c = cnv(w, h), g = c.getContext('2d'), s = seed;
    function r2() { s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for (var i = 0; i < (n || 9); i++) { var x = w * (0.15 + 0.7 * r2()), y = h * (0.35 + 0.35 * r2()), rr = h * (0.25 + 0.2 * r2()), gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, 'rgba(' + c0 + ')'); gr.addColorStop(1, 'rgba(' + c1 + ',0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill(); }
    return c;
  }
  function wisp() { // блуждающий огонёк: холодное пламя с хвостиком
    var W = 48, H = 60, c = cnv(W, H), g = c.getContext('2d');
    var gr = g.createRadialGradient(24, 34, 1, 24, 34, 22); gr.addColorStop(0, 'rgba(170,255,230,.55)'); gr.addColorStop(1, 'rgba(90,200,190,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.beginPath(); g.moveTo(24, 14); g.quadraticCurveTo(33, 30, 30, 38); g.arc(24, 37, 6.5, 0.2, Math.PI - 0.2); g.quadraticCurveTo(15, 30, 24, 14); g.closePath();
    var b = g.createRadialGradient(24, 36, 1, 24, 32, 14); b.addColorStop(0, '#f4fffb'); b.addColorStop(0.5, '#9ff5df'); b.addColorStop(1, 'rgba(60,170,170,.2)'); g.fillStyle = b; g.fill();
    return c;
  }
  function puff(col, a) { // клуб дыма (карандаш): серый, с лёгкой «штриховкой»
    var W = 48, H = 60, c = cnv(W, H), g = c.getContext('2d');
    [[24, 34, 12], [16, 38, 8], [32, 37, 9], [24, 26, 9]].forEach(function (b) { var gr = g.createRadialGradient(b[0], b[1], 1, b[0], b[1], b[2]); gr.addColorStop(0, 'rgba(' + col + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)'); g.fillStyle = gr; g.beginPath(); g.arc(b[0], b[1], b[2], 0, TAU); g.fill(); });
    g.strokeStyle = 'rgba(40,40,40,.25)'; g.lineWidth = 0.6; for (var k = 0; k < 7; k++) { g.beginPath(); g.moveTo(14 + k * 3, 42); g.lineTo(20 + k * 3, 28); g.stroke(); }
    return c;
  }
  function balloon(fill, edge, outline) { // воздушный шарик на ниточке
    var W = 48, H = 60, c = cnv(W, H), g = c.getContext('2d');
    g.strokeStyle = outline ? '#2a2a2a' : 'rgba(80,60,40,.6)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(24, 42); g.quadraticCurveTo(20, 50, 25, 58); g.stroke();
    g.beginPath(); g.ellipse(24, 26, 11, 14, 0, 0, TAU); var b = g.createRadialGradient(20, 21, 1, 24, 26, 15); b.addColorStop(0, '#ffffff'); b.addColorStop(0.35, fill); b.addColorStop(1, edge); g.fillStyle = b; g.fill();
    if (outline) { g.lineWidth = 2; g.strokeStyle = '#2a2a2a'; g.stroke(); }
    g.fillStyle = edge; g.beginPath(); g.moveTo(21, 41); g.lineTo(27, 41); g.lineTo(24, 38); g.fill();
    return c;
  }
  function smog(seed, w, h) {
    var c = cnv(w, h), g = c.getContext('2d'), s = seed;
    function r2() { s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for (var i = 0; i < 9; i++) { var x = w * (0.15 + 0.7 * r2()), y = h * (0.35 + 0.35 * r2()), rr = h * (0.25 + 0.2 * r2()), gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, 'rgba(120,70,190,.35)'); gr.addColorStop(1, 'rgba(60,30,110,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill(); }
    return c;
  }
  function drone() { // квадрокоптер-курьер: корпус, четыре винта, голубая подсветка снизу
    var W = 48, H = 60, c = cnv(W, H), g = c.getContext('2d');
    var gr = g.createRadialGradient(24, 36, 1, 24, 36, 20); gr.addColorStop(0, 'rgba(0,229,255,.55)'); gr.addColorStop(1, 'rgba(0,229,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#2a2f45'; g.lineWidth = 2; g.beginPath(); g.moveTo(12, 24); g.lineTo(36, 34); g.moveTo(36, 24); g.lineTo(12, 34); g.stroke();
    g.fillStyle = 'rgba(160,240,255,.45)'; [[12, 24], [36, 24], [12, 34], [36, 34]].forEach(function (r) { g.beginPath(); g.ellipse(r[0], r[1] - 1, 7, 2, 0, 0, TAU); g.fill(); });
    g.fillStyle = '#1b1f33'; g.beginPath(); g.ellipse(24, 29, 7, 5, 0, 0, TAU); g.fill(); g.strokeStyle = '#00e5ff'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#ff3cc8'; g.beginPath(); g.arc(24, 28, 1.6, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,200,80,.85)'; g.fillRect(21, 34, 6, 5);   // посылка
    return c;
  }
  function lantern() { // бумажный фонарик (васи): тёплое свечение, рёбра, тёмные крышка и донце
    var W = 48, H = 60, c = cnv(W, H), g = c.getContext('2d');
    var gr = g.createRadialGradient(24, 30, 2, 24, 30, 26); gr.addColorStop(0, 'rgba(255,200,110,.5)'); gr.addColorStop(1, 'rgba(255,150,60,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.beginPath(); g.ellipse(24, 29, 11, 14, 0, 0, TAU); g.closePath();
    var b = g.createRadialGradient(22, 27, 1, 24, 29, 15); b.addColorStop(0, '#fff3c8'); b.addColorStop(0.45, '#ffc06a'); b.addColorStop(1, '#e0603a');
    g.fillStyle = b; g.fill(); g.lineWidth = 1; g.strokeStyle = 'rgba(96,40,24,.7)'; g.stroke();
    g.strokeStyle = 'rgba(150,60,30,.35)'; g.lineWidth = 0.7;
    for (var k = -2; k <= 2; k++) { var yy = 29 + k * 5, hw = 11 * Math.sqrt(Math.max(0, 1 - (k * 5 / 14) * (k * 5 / 14))); g.beginPath(); g.moveTo(24 - hw, yy); g.quadraticCurveTo(24, yy + 1.6, 24 + hw, yy); g.stroke(); }
    g.fillStyle = '#4a2c22'; g.fillRect(18, 13.5, 12, 3); g.fillRect(18, 41.5, 12, 3);
    g.fillStyle = 'rgba(255,250,220,.6)'; g.beginPath(); g.ellipse(20.5, 24, 2.6, 5, -0.25, 0, TAU); g.fill();
    return c;
  }
  function initSprites() {
    if (SPR) return SPR;
    if (NEON()) {
      SPR = { neon: true, lamp: glow(24, '0,229,255', 0.6), fairy: [glow(16, '0,229,255'), glow(16, '255,60,200'), glow(16, '170,110,255')], spark: glow(8, '200,250,255', 1),
              ember: glow(8, '255,90,210', 1), lantern: drone(), clouds: [smog(3, 260, 110), smog(11, 300, 120), smog(29, 220, 100)],
              shadows: [cloud(3, 130, 55, true), cloud(11, 150, 60, true), cloud(29, 110, 50, true)] };
      return SPR;
    }
    var A = AMB();
    if (A === 'gloom') {
      SPR = { flock: 'bat', lamp: glow(24, '150,255,220', 0.6), fairy: [glow(16, '150,255,220'), glow(16, '190,170,255'), glow(16, '120,220,255')], spark: glow(8, '210,255,240', 1),
              ember: glow(8, '255,150,60', 1), lantern: wisp(), fairyMode: 'spark',
              clouds: [mist(3, 260, 110, '70,60,100,.45', '40,30,70'), mist(11, 300, 120, '70,60,100,.45', '40,30,70'), mist(29, 220, 100, '70,60,100,.45', '40,30,70')],
              shadows: [cloud(3, 130, 55, true), cloud(11, 150, 60, true), cloud(29, 110, 50, true)] };
      return SPR;
    }
    if (A === 'ash') {
      SPR = { flock: 'bird', birdCol: 'rgba(25,25,25,.85)', lamp: null, fairy: [glow(16, '230,120,60'), glow(16, '200,200,200'), glow(16, '160,160,160')], spark: glow(8, '230,230,230', 1),
              ember: glow(8, '255,120,50', 1), lantern: puff('110,110,110', 0.5), fairyMode: 'spark',
              clouds: [mist(3, 260, 110, '90,90,90,.4', '60,60,60'), mist(11, 300, 120, '90,90,90,.4', '60,60,60'), mist(29, 220, 100, '90,90,90,.4', '60,60,60')],
              shadows: [cloud(3, 130, 55, true), cloud(11, 150, 60, true), cloud(29, 110, 50, true)] };
      return SPR;
    }
    if (A === 'paper') {
      var ol = false, cols = [['#ff6b6b', '#c0392b'], ['#ffd93d', '#d4a017'], ['#6bcBff', '#2a7fc0'], ['#8be37b', '#3c9a2f'], ['#c38bff', '#7a3fc0']];
      SPR = { flock: 'bird', lamp: null, fairy: [glow(16, '255,200,120'), glow(16, '255,160,220'), glow(16, '160,220,255')], spark: glow(8, '255,250,210', 1),
              ember: glow(8, '255,190,80', 1), balloons: cols.map(function (c) { return balloon(c[0], c[1], ol); }), fairyMode: 'butterfly',
              clouds: [cloud(3, 260, 110), cloud(11, 300, 120), cloud(29, 220, 100)],
              shadows: [cloud(3, 130, 55, true), cloud(11, 150, 60, true), cloud(29, 110, 50, true)] };
      SPR.lantern = SPR.balloons[0];
      return SPR;
    }
    SPR = { lamp: glow(24, '255,200,110', 0.75), fairy: [glow(16, '190,255,200'), glow(16, '255,190,240'), glow(16, '190,225,255')], spark: glow(8, '255,250,210', 1),
            ember: glow(8, '255,190,80', 1), lantern: lantern(), clouds: [cloud(3, 260, 110), cloud(11, 300, 120), cloud(29, 220, 100)],
            shadows: [cloud(3, 130, 55, true), cloud(11, 150, 60, true), cloud(29, 110, 50, true)] };
    return SPR;
  }
  function img(name) { var im = new Image(); im.decoding = 'async'; im.src = 'img/iso/' + name + '.webp'; return im; }
  function ok(im) { return im.complete && im.naturalWidth > 0; }

  /* настройки по уровню качества */
  var Q = { high: { lanterns: 22, fairies: 3, trail: 0.05, clouds: 5, flocks: 3 },
            low:  { lanterns: 10, fairies: 2, trail: 0.12, clouds: 3, flocks: 2 } };
  var FAIRY_SPOTS = [[674, 515, 46, 18], [846, 445, 54, 22], [322, 430, 36, 16]];

  function create() {
    var S = initSprites(), smith = [img('smith0'), img('smith1')];
    var T = 0, q = 'high', P = Q.high;
    // пул частиц (феи-искры, угольки кузни)
    var POOL = 160, parts = []; for (var i = 0; i < POOL; i++) parts.push({ on: false });
    function emit(kind, x, y, vx, vy, life, size, extra) {
      for (var i = 0; i < POOL; i++) { var p = parts[i]; if (!p.on) { p.on = true; p.k = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = 0; p.max = life; p.s = size; p.e = extra || 0; return; } }
    }
    var lanterns = [], clouds = [], flocks = [], fairies = [], smithT = 0, stats = { drawn: 0 };
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
      for (i = 0; i < POOL; i++) { var p = parts[i]; if (!p.on) continue; p.life += dt; if (p.life >= p.max) { p.on = false; continue; } p.x += p.vx * dt; p.y += p.vy * dt; if (p.k === 'ember') p.vy += 90 * dt; }
    }
    function smithPos() { return [326, 618]; }
    function inView(v, x, y, m) { return x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m; }

    /* ---- слой «земля»: тени облаков (под постройками) ---- */
    function drawGround(g, v) {
      if (q === 'off') return;
      for (var i = 0; i < clouds.length; i++) {
        var c = clouds[i], sh = S.shadows[c.k], w = sh.width * c.s, h = sh.height * c.s, x = c.x + 60, y = c.y + 150;
        if (!inView(v, x, y, w)) continue; g.globalAlpha = 0.16; g.drawImage(sh, x - w / 2, y - h / 2, w, h);
      }
      g.globalAlpha = 1;
    }
    /* ---- объекты с глубиной (сортируются вместе с постройками): кузнец ---- */
    function depthItems(v, model) {
      var out = []; if (q === 'off') return out;
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
    }
    /* ---- слой «воздух»: фонарики, феи, птицы, облака ---- */
    function drawAir(g, v, cam) {
      if (q === 'off') return;
      var i, p;
      g.globalCompositeOperation = 'lighter';
      for (i = 0; i < POOL; i++) {
        p = parts[i]; if (!p.on || !inView(v, p.x, p.y, 20)) continue;
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
        if (q === 'high' && al > 0.25 && S.lamp) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = al * fl * 0.6; g.drawImage(S.lamp, x - 31 * sc, y - 36 * sc, 62 * sc, 62 * sc); g.globalCompositeOperation = 'source-over'; }
        g.globalAlpha = al * (0.8 + 0.2 * fl);
        g.drawImage(S.balloons ? S.balloons[i % S.balloons.length] : S.lantern, x - 24 * sc, y - 34 * sc, 48 * sc, 60 * sc);
      }
      g.globalAlpha = 1;
      // феи: свечение + крылышки
      fairies.forEach(function (F) {
        if (F.x == null || !inView(v, F.x, F.y, 20)) return;
        g.globalCompositeOperation = 'lighter'; g.drawImage(S.fairy[F.c], F.x - 13, F.y - 13, 26, 26); g.globalCompositeOperation = 'source-over';
        if (S.neon) { g.fillStyle = '#e8fdff'; g.fillRect(F.x - 1.5, F.y - 1.5, 3, 3); return; }   // голо-искра без крылышек
        if (S.fairyMode === 'spark') { g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(F.x, F.y, 1.4, 0, TAU); g.fill(); return; }
        if (S.fairyMode === 'butterfly') {   // бабочка: два цветных крыла
          var bw = 0.3 + 0.7 * Math.abs(Math.sin(T * 14 + F.a)), bc = ['#ff7eb6', '#ffd23f', '#6fc3ff'][F.c % 3];
          g.fillStyle = bc; g.strokeStyle = 'rgba(40,30,30,.7)'; g.lineWidth = 0.8;
          g.beginPath(); g.ellipse(F.x - 3.2 * bw, F.y - 1, 3.4 * bw, 2.6, -0.4, 0, TAU); g.fill(); g.stroke();
          g.beginPath(); g.ellipse(F.x + 3.2 * bw, F.y - 1, 3.4 * bw, 2.6, 0.4, 0, TAU); g.fill(); g.stroke();
          g.fillStyle = '#2b2020'; g.fillRect(F.x - 0.6, F.y - 3, 1.2, 5); return;
        }
        var fw = 0.4 + 0.6 * Math.abs(Math.sin(T * 38 + F.a));
        g.fillStyle = 'rgba(235,250,255,.75)';
        g.beginPath(); g.ellipse(F.x - 2.4, F.y - 1.5, 2.6 * fw, 1.3, -0.6, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(F.x + 2.4, F.y - 1.5, 2.6 * fw, 1.3, 0.6, 0, TAU); g.fill();
        g.fillStyle = '#fffbe8'; g.beginPath(); g.arc(F.x, F.y, 1.2, 0, TAU); g.fill();
      });
      // птицы стайками (в неоне — микродроны с мигающими огнями)
      if (S.neon) {
        for (i = 0; i < flocks.length; i++) {
          var fd = flocks[i]; if (!inView(v, fd.x, fd.y, 90)) continue;
          for (var jd = 0; jd < fd.b.length; jd++) { var bd = fd.b[jd], dx = fd.x + bd.ox * Math.sign(fd.vx), dy = fd.y + bd.oy;
            g.fillStyle = '#1b1f33'; g.fillRect(dx - 3, dy - 1, 6, 2);
            g.fillStyle = Math.sin(T * 6 + bd.f) > 0 ? '#ff3cc8' : '#00e5ff'; g.fillRect(dx - 1, dy - 1, 2, 2); }
        }
      } else if (S.flock === 'bat') {   // летучие мыши: тёмные угловатые крылья
        g.fillStyle = 'rgba(14,10,22,.85)';
        for (i = 0; i < flocks.length; i++) {
          var fb = flocks[i]; if (!inView(v, fb.x, fb.y, 90)) continue;
          for (var jb = 0; jb < fb.b.length; jb++) { var bb = fb.b[jb], bx2 = fb.x + bb.ox * Math.sign(fb.vx), by2 = fb.y + bb.oy, fp2 = Math.sin(T * bb.fs * 1.6 + bb.f) * 3.5 * fb.s, w2 = 6.5 * fb.s;
            g.beginPath(); g.moveTo(bx2, by2); g.lineTo(bx2 - w2 * 0.5, by2 - 2 - fp2); g.lineTo(bx2 - w2, by2 - fp2 * 0.4); g.lineTo(bx2 - w2 * 0.55, by2 + 0.5); g.lineTo(bx2, by2 + 1.5);
            g.lineTo(bx2 + w2 * 0.55, by2 + 0.5); g.lineTo(bx2 + w2, by2 - fp2 * 0.4); g.lineTo(bx2 + w2 * 0.5, by2 - 2 - fp2); g.closePath(); g.fill(); }
        }
      } else {
      g.strokeStyle = S.birdCol || 'rgba(52,58,72,.78)'; g.lineCap = 'round'; g.lineWidth = 1.3;
      for (i = 0; i < flocks.length; i++) {
        var f = flocks[i]; if (!inView(v, f.x, f.y, 90)) continue; g.beginPath();
        for (var j = 0; j < f.b.length; j++) {
          var b = f.b[j], bx = f.x + b.ox * Math.sign(f.vx), by = f.y + b.oy, fp = Math.sin(T * b.fs + b.f) * 4 * f.s, s2 = 6 * f.s;
          g.moveTo(bx - s2, by - fp); g.quadraticCurveTo(bx - s2 / 2, by - 2 - fp / 2, bx, by); g.quadraticCurveTo(bx + s2 / 2, by - 2 - fp / 2, bx + s2, by - fp);
        }
        g.stroke();
      }
      }
      // облака (выше всего; лёгкий параллакс относительно камеры)
      var px = (cam.x - 512) * 0.18, py = (cam.y - 512) * 0.18;
      for (i = 0; i < clouds.length; i++) {
        var c = clouds[i], cs = S.clouds[c.k], cw = cs.width * c.s, ch = cs.height * c.s, cx = c.x - px, cy = c.y - py;
        if (!inView(v, cx, cy, cw)) continue; g.globalAlpha = c.a; g.drawImage(cs, cx - cw / 2, cy - ch / 2, cw, ch);
      }
      g.globalAlpha = 1;
    }
    setQuality('high');
    return { update: update, drawGround: drawGround, drawAir: drawAir, depthItems: depthItems, drawDepth: drawDepth, setQuality: setQuality,
      quality: function () { return q; },
      counts: function () { return { lanterns: lanterns.length, fairies: fairies.length, clouds: clouds.length, flocks: flocks.length, parts: parts.filter(function (p) { return p.on; }).length}; } };
  }
  CL.IsoFx = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
