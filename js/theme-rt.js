/* 0.7: движок стилей оформления. Работает с данными активной темы (themes/<id>/theme.js → CL.ThemeData):
   1) имена из темы подменяют названия в данных игры (постройки, карты, символы, персонажи, соперники…);
   2) словарь терминов переписывает весь текст интерфейса и диалогов (после подстановки рода героя/героини);
   3) функция палитры темы перекрашивает цвета во встроенных стилях и на холстах (карта, мини-игры);
   4) CL.Theme.set(id) — сохранить игру, запомнить выбор и перезагрузить страницу. */
(function (root) {
  'use strict';
  var CL = root.CL = root.CL || {};
  var TD = CL.ThemeData || { id: 'anime', names: {}, terms: [] };
  var RU = 'а-яёА-ЯЁ';

  /* ---------- цвета ---------- */
  var NAMED = { white: [255, 255, 255], black: [0, 0, 0], transparent: null, gold: [255, 215, 0], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], orange: [255, 165, 0], yellow: [255, 255, 0], gray: [128, 128, 128], grey: [128, 128, 128], silver: [192, 192, 192], purple: [128, 0, 128] };
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255; var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2, d = mx - mn;
    if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; if (!s) { var v = Math.round(l * 255); return [v, v, v]; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function f(t) { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
  }
  var COLRE = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(?:,\s*[\d.]+%?\s*)?\)|\b(?:white|black|gold|orange|yellow|silver|gray|grey|purple)\b/g;
  function parse(c) {
    var m;
    if (c[0] === '#') {
      var h = c.slice(1); if (h.length <= 4) h = h.split('').map(function (x) { return x + x; }).join('');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
    }
    if ((m = /rgba?\(([^)]*)\)/.exec(c))) { var p = m[1].split(',').map(function (x) { return parseFloat(x); }); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    var n = NAMED[c.toLowerCase()]; return n ? [n[0], n[1], n[2], 1] : null;
  }
  function fmt(rgba) { var a = Math.round(rgba[3] * 1000) / 1000; return a >= 1 ? '#' + rgba.slice(0, 3).map(function (v) { return ('0' + Math.max(0, Math.min(255, v)).toString(16)).slice(-2); }).join('') : 'rgba(' + rgba[0] + ',' + rgba[1] + ',' + rgba[2] + ',' + a + ')'; }
  var cache = {};
  function mapColor(c, kind) {
    if (!TD.col) return c;
    var k = kind + c; if (k in cache) return cache[k];
    var p = parse(c); if (!p) return (cache[k] = c);
    var hsl = rgb2hsl(p[0], p[1], p[2]), o = TD.col(hsl[0], hsl[1], hsl[2], p[3], kind), rgb = hsl2rgb(o[0], o[1], o[2]);
    return (cache[k] = fmt([rgb[0], rgb[1], rgb[2], o[3] == null ? p[3] : o[3]]));
  }
  function mapValue(v, kind) { return TD.col ? String(v).replace(COLRE, function (c) { return mapColor(c, kind); }) : v; }
  function kindOf(prop) {
    prop = prop.toLowerCase();
    if (/shadow/.test(prop)) return 'shadow';
    if (/^border|^outline|stroke|^column-rule|caret/.test(prop)) return 'border';
    if (/^background|^--|fill$/.test(prop) && prop !== 'fill') return 'bg';
    if (prop === 'color' || prop === 'fill' || /text-decoration|-webkit-text/.test(prop)) return 'text';
    return 'bg';
  }
  function mapStyleText(st) {
    if (!TD.col || !st) return st;
    return st.replace(/([a-zA-Z-]+)\s*:\s*([^;]+)/g, function (all, prop, val) { return prop + ':' + mapValue(val, kindOf(prop)); });
  }

  /* ---------- словарь терминов ---------- */
  var ENTRIES = [], RX = null, MAP = {};
  function cap(w) { return w.charAt(0).toUpperCase() + w.slice(1); }
  function addForm(f, t) {
    if (!f || f in MAP) return;
    var alt = null; if (t.indexOf('/') > 0) { var sp = t.split('/'); t = sp[0]; alt = sp[1]; }
    MAP[f] = { t: t, alt: alt }; ENTRIES.push(f);
  }
  (TD.terms || []).forEach(function (e) {
    var fs = e[0].split('|'), ts = e[1].split('|');
    fs.forEach(function (f, i) {
      var t = ts.length === 1 ? ts[0] : ts[i]; if (t == null) throw new Error('theme term forms mismatch: ' + e[0]);
      addForm(f, t);
      if (f.charAt(0) !== f.charAt(0).toUpperCase()) { var tc = t.split('/').map(cap).join('/'); addForm(cap(f), tc); }
    });
  });
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  if (ENTRIES.length) {
    ENTRIES.sort(function (a, b) { return b.length - a.length; });
    /* справа дефис — граница слова («монетки-мини» → «чипы-мини»), кроме хвостов, которые тема сама добавляет к исходному слову
       («Вальдмор» → «Вальдмор-Сити»: «Вальдмор-Сити» второй раз не переводится) */
    var SUF = {}; ENTRIES.forEach(function (f) { var t = MAP[f].t; if (t.indexOf(f + '-') === 0) SUF[t.slice(f.length + 1)] = 1; });
    var neg = Object.keys(SUF).length ? '(?!-(?:' + Object.keys(SUF).map(esc).join('|') + ')(?![' + RU + ']))' : '';
    RX = new RegExp('(^|[^' + RU + 'A-Za-z0-9-])(' + ENTRIES.map(esc).join('|') + ')' + neg + '(?=[^' + RU + 'A-Za-z0-9]|$)', 'g');
  }
  function few(before) {   // «2 монеты» → «2 кредита»: число перед словом оканчивается на 2–4 (кроме 12–14)
    var m = /(\d[\d\s\u00a0.]*)[\s\u00a0]*$/.exec(before.slice(-14)); if (!m) return false;
    var n = parseInt(m[1].replace(/[\s\u00a0.]/g, ''), 10) % 100; return n % 10 >= 2 && n % 10 <= 4 && (n < 12 || n > 14);
  }
  function tx(s) {
    if (!RX || !s || typeof s !== 'string' || !/[а-яёА-ЯЁ]/.test(s)) return s;
    return s.replace(RX, function (all, pre, w, off, str) { var e = MAP[w]; return pre + (e.alt && few(str.slice(0, off + pre.length)) ? e.alt : e.t); });
  }

  /* ---------- имена из темы → данные игры ---------- */
  function applyNames(D) {
    var N = TD.names || {}; if (!D) return;
    function byId(list, map) { if (!list || !map) return; list.forEach(function (x) { if (map[x.id] != null) { var v = map[x.id]; if (typeof v === 'string') x.name = v; else for (var k in v) x[k] = v[k]; } }); }
    byId(D.BUILDINGS, N.buildings); byId(D.SYMBOLS, N.symbols); byId(D.SPELLS, N.spells); byId(D.SKILLS, N.skills);
    if (N.chests) D.CHESTS.forEach(function (c, i) { if (N.chests[i]) c.name = N.chests[i]; });
    if (N.daily && D.DAILY_ITEMS) D.DAILY_ITEMS.forEach(function (c, i) { if (N.daily[i]) c.name = N.daily[i]; });
    if (N.events) D.EVENTS.forEach(function (e) { var v = N.events[e.id]; if (v) { e.name = v.name; if (v.item) e.item.name = v.item; } });
    if (N.collections) D.COLLECTIONS.forEach(function (c) { var v = N.collections[c.id]; if (!v) return; c.name = v[0]; c.cards.forEach(function (k, i) { if (v[1][i]) k.name = v[1][i]; }); });
    if (N.chars && D.CHARS) for (var id in N.chars) if (D.CHARS[id]) D.CHARS[id].name = N.chars[id];
    if (N.heroes && D.HEROES) for (var g in N.heroes) if (D.HEROES[g]) for (var k in N.heroes[g]) D.HEROES[g][k] = N.heroes[g][k];
    if (N.villages && D.RIVALS) D.RIVALS.forEach(function (r) { if (N.villages[r.id]) r.village = N.villages[r.id]; });
    if (N.rivals && D.RIVALS) D.RIVALS.forEach(function (r) { var o = N.rivals[r.id]; if (o) ['lose', 'win', 'hit'].forEach(function (k) { if (o[k]) r[k] = o[k]; }); });
  }
  if (CL.Data) applyNames(CL.Data);

  /* ---------- переписывание DOM ---------- */
  var seen = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function fixText(n) {
    var v = n.nodeValue; if (seen && seen.get(n) === v) return;
    var o = tx(v); if (o !== v) n.nodeValue = o; if (seen) seen.set(n, o);
  }
  var ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  function fixEl(el) {
    if (el.nodeType !== 1) return;
    if (TD.col && el.hasAttribute('style')) { var st = el.getAttribute('style'); if (!el.__thSt || el.__thSt !== st) { var ns = mapStyleText(st); el.__thSt = ns; if (ns !== st) el.setAttribute('style', ns); } }
    for (var i = 0; i < ATTRS.length; i++) { var a = el.getAttribute(ATTRS[i]); if (a) { var b = tx(a); if (b !== a) el.setAttribute(ATTRS[i], b); } }
  }
  /* data-notx — текст не переводится словарём (описания стилей и история версий говорят о словах разных стилей) */
  function noTx(n) { var e = n.nodeType === 1 ? n : n.parentElement; return !!(e && e.closest && e.closest('[data-notx]')); }
  function walk(node) {
    if (noTx(node)) return;
    if (node.nodeType === 3) { fixText(node); return; }
    if (node.nodeType !== 1 || node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
    fixEl(node);
    var w = root.document.createTreeWalker(node, 5 /* элементы и текст */, { acceptNode: function (x) { return x.nodeType === 1 && x.hasAttribute('data-notx') ? 2 /* REJECT — без поддерева */ : 1; } }, false), n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) fixText(n); else fixEl(n); }
  }
  var observer = null;
  function start() {
    var doc = root.document; if (!doc || !doc.body) return;
    if (TD.title) doc.title = TD.title;
    var mt = doc.querySelector('meta[name="theme-color"]'); if (mt && TD.themeColor) mt.setAttribute('content', TD.themeColor);
    if (!RX && !TD.col) return;
    walk(doc.body);
    observer = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (noTx(m.target)) continue;
        if (m.type === 'characterData') fixText(m.target);
        else if (m.type === 'attributes') fixEl(m.target);
        else for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
      }
    });
    observer.observe(doc.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'title', 'placeholder', 'aria-label', 'alt'] });
  }

  /* ---------- холсты: цвета через палитру темы ---------- */
  /* 0.7.2: строка «=цвет» ставится как есть, без перекраски палитрой (подписи построек с цветами из темы) */
  function patchCanvas() {
    if (!TD.col || !root.CanvasRenderingContext2D) return;
    var P = root.CanvasRenderingContext2D.prototype;
    [['fillStyle', 'bg'], ['strokeStyle', 'border'], ['shadowColor', 'shadow']].forEach(function (pk) {
      var d = Object.getOwnPropertyDescriptor(P, pk[0]); if (!d || !d.set) return;
      Object.defineProperty(P, pk[0], { configurable: true, enumerable: d.enumerable, get: d.get, set: function (v) { d.set.call(this, typeof v === 'string' ? (v.charAt(0) === '=' ? v.slice(1) : mapColor(v.trim(), pk[1])) : v); } });
    });
    var ft = P.fillText;   // текст на холсте — как «текст», а не «заливка»
    P.fillText = function (t, x, y, mw) {
      return mw === undefined ? ft.call(this, tx(String(t)), x, y) : ft.call(this, tx(String(t)), x, y, mw);
    };
    if (root.CanvasGradient) { var acs = root.CanvasGradient.prototype.addColorStop; root.CanvasGradient.prototype.addColorStop = function (o, c) { return acs.call(this, o, typeof c === 'string' ? mapColor(c.trim(), 'bg') : c); }; }
  }
  patchCanvas();

  /* ---------- публичный API ---------- */
  var T = CL.Theme = {
    id: TD.id, data: TD, tx: tx, mapColor: mapColor, mapValue: mapValue, mapStyleText: mapStyleText, kindOf: kindOf, applyNames: applyNames,
    fx: function (k, def) { return TD.fx && TD.fx[k] != null ? TD.fx[k] : def; },
    iso: function (k, def) { return TD.iso && TD.iso[k] != null ? TD.iso[k] : def; },
    list: function () { return (CL.THEMES && CL.THEMES.list) || []; },
    set: function (id, opt) {
      if (!CL.THEMES || !CL.THEMES.valid(id)) return false;
      try { if (root.CLGame) { var s = root.CLGame.state; if (s) { s.theme = id; s.themeAsked = true; } root.CLGame.saveNow(); } } catch (e) { }
      CL.THEMES.store(id);
      if (!(opt && opt.noReload)) { var u = String(root.location.href).replace(/([?&])theme=[a-z]+&?/, '$1').replace(/[?&]$/, ''); if (u !== root.location.href) root.location.replace(u); else root.location.reload(); }
      return true;
    }
  };
  if (root.document) { if (root.document.body) start(); else root.document.addEventListener('DOMContentLoaded', start); }
  if (typeof module !== 'undefined') module.exports = T;
})(typeof window !== 'undefined' ? window : globalThis);
