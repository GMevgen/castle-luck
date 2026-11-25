/* Замок удачи 0.8 (бета) — правила, общие для всех стилей (гость-обменщик карт раз в сутки),
   и правила стиля «Мультяшный» (s.theme === 'toon'): энергия 50, ставки ×1…×10, деревни уровней из 5 построек
   по 4 этапа со звёздами, три свинки — набег-раскопки (3 из 4 ям), три синих значка — +1 купол (макс. 3), питомец-енот. */
(function (root) {
  var CL = root.CL, D = CL.Data, E = CL.Engine, X = CL.Extra; if (!X) return;
  var T = CL.V08 = {}, DAY = 86400000;
  function on(s) { return !!s && s.theme === 'toon'; }
  T.on = on;
  function hash01(n) { var x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
  D.TOON = {
    maxEnergy: 50, bets: [1, 2, 3, 5, 10], maxShields: 3, stages: 4,
    villages: [
      { id: 'honey', name: 'Медовая пасека', blds: ['Домик-улей', 'Медоварня', 'Клумба с фонтаном', 'Мельница', 'Беседка'] },
      { id: 'candy', name: 'Конфетный городок', blds: ['Пряничный домик', 'Кексовая пекарня', 'Сад леденцов', 'Шоколадная фабрика', 'Киоск мороженого'] },
      { id: 'pirate', name: 'Пиратская бухта', blds: ['Таверна-бочка', 'Маяк', 'Кораблик на мели', 'Островок с кладом', 'Дозорная вышка'] },
      { id: 'winter', name: 'Снежная деревушка', blds: ['Бревенчатая избушка', 'Иглу', 'Нарядная ёлка', 'Каток', 'Мастерская снеговиков'] }],
    costB: [8, 10, 12, 14, 16],       // цена этапа k постройки j: costB[j] × k × (1 + 0,6 × номер деревни) × B
    villageRw: { energy: 25, chest: 1 },
    pet: { lv: [0, 3, 8, 15, 25, 40], raid: 0.1, block: 0.06 },   // уровень питомца: +10% к раскопкам и 6% шанс отбить налёт за уровень
    dig: { spots: [30, 15, 8, 0], tries: 3 }
  };
  /* ---------- состояние ---------- */
  var _new = E.newState;
  E.newState = function (now) {
    var s = _new(now);
    s.toon = { vi: 0, b: [0, 0, 0, 0, 0], stars: 0, pet: { lv: 0, xp: 0, treats: 1 }, dig: null };
    s.xch = { day: null };
    return s;
  };
  /* ---------- гость-обменщик: раз в сутки приносит одну случайную карту, отдать её можно только 1 за 1 ---------- */
  T.ALL_CARDS = []; D.COLLECTIONS.forEach(function (c) { if (!c.event) c.cards.forEach(function (k) { T.ALL_CARDS.push(k.id); }); });
  T.visitor = function (s, t) {
    var key = E.dayKey(t), idx = E.dayIndex(t), card = T.ALL_CARDS[Math.floor(hash01(idx * 7 + 3) * T.ALL_CARDS.length)];
    var d = new Date(t); d.setHours(24, 0, 0, 0);
    return { here: s.xch.day !== key, card: card, next: d.getTime() };
  };
  T.exchange = function (s, giveId, t) {
    var v = T.visitor(s, t);
    if (!v.here) return { ok: false, reason: 'Гость уже был сегодня — следующий завтра' };
    if (!giveId || !(s.cards[giveId] > 0)) return { ok: false, reason: 'Нужно отдать свою карту' };
    s.cards[giveId]--; s.xch.day = E.dayKey(t);
    var got = E.giveCard(s, v.card, t); got.id = v.card; got.gave = giveId;
    return { ok: true, got: got };
  };
  T.decline = function (s, t) { if (!T.visitor(s, t).here) return { ok: false }; s.xch.day = E.dayKey(t); return { ok: true }; };

  /* ---------- «Мультяшный»: энергия и ставки ---------- */
  var _der = E.derived;
  E.derived = function (s, now) { var d = _der(s, now); if (on(s)) d.maxEnergy = D.TOON.maxEnergy; return d; };
  var _bo = E.betOptions;
  E.betOptions = function (s) { return on(s) ? D.TOON.bets.slice() : _bo(s); };

  /* ---------- вращение: свинки → раскопки, значки → купол ---------- */
  var _spin = E.spin;
  E.spin = function (s, now, rng) {
    if (on(s) && D.TOON.bets.indexOf(s.bet) < 0) s.bet = 10;
    var out = _spin(s, now, rng); if (!out.ok || !on(s)) return out;
    var tr = out.line.triple;
    if (tr === 'orb' && s.raid.shields < D.TOON.maxShields) { s.raid.shields++; out.toonShield = 1; }
    if (tr === 'scroll' && !s.toon.dig) { s.toon.dig = T.makeDig(s, rng, out.bet); out.toonRaid = true; }
    return out;
  };
  T.makeDig = function (s, rng, bet) {
    var sp = D.TOON.dig.spots.slice(); for (var i = sp.length - 1; i > 0; i--) { var j = rng.int(i + 1), x = sp[i]; sp[i] = sp[j]; sp[j] = x; }
    var rv = D.RIVALS[rng.int(D.RIVALS.length)].id;
    return { rival: rv, spots: sp.map(function (v) { return v * bet; }), open: [false, false, false, false], left: D.TOON.dig.tries, got: 0 };
  };
  T.dig = function (s, i, rng, now) {
    var g = s.toon.dig; if (!g || g.left <= 0 || g.open[i] || i < 0 || i > 3) return { ok: false };
    g.open[i] = true; g.left--;
    var units = g.spots[i] * (1 + D.TOON.pet.raid * s.toon.pet.lv), coins = 0;
    if (units > 0) coins = X.reward(s, { coinsB: units }, rng, now).coins || 0;
    g.got += coins; var done = g.left <= 0;
    if (done) { s.stats.raids = (s.stats.raids || 0) + 1; s.toon.dig = null; }
    return { ok: true, coins: coins, done: done, total: g.got };
  };
  /* ---------- питомец: лакомства из сундуков, кормление поднимает уровень ---------- */
  var _oc = E.openChest;
  E.openChest = function (s, i, now, rng, useKeys) {
    var r = _oc(s, i, now, rng, useKeys); if (r.ok && on(s)) { var n = 1 + r.tier; s.toon.pet.treats += n; r.treats = n; } return r;
  };
  T.petLevel = function (xp) { var L = D.TOON.pet.lv, lv = 0; while (lv + 1 < L.length && xp >= L[lv + 1]) lv++; return lv; };
  T.feed = function (s) {
    var p = s.toon.pet; if (p.treats <= 0) return { ok: false, reason: 'Нет лакомств — они бывают в бочонках' };
    if (p.lv >= D.TOON.pet.lv.length - 1) return { ok: false, reason: 'Питомец уже наелся до максимума' };
    p.treats--; p.xp++; var was = p.lv; p.lv = T.petLevel(p.xp); return { ok: true, up: p.lv > was };
  };
  var _npc = X.npcAttacks;
  X.npcAttacks = function (s, t) {
    var evs = _npc(s, t);
    if (on(s) && s.toon.pet.lv > 0) evs.forEach(function (e) {
      if (e.dmg && hash01(e.t + 11) < D.TOON.pet.block * s.toon.pet.lv) { delete s.raid.dmg[e.dmg]; e.blocked = true; e.pet = true; delete e.dmg; }
    });
    return evs;
  };
  /* ---------- деревни уровней ---------- */
  T.village = function (s) {
    var V = D.TOON.villages, i = s.toon.vi, v = V[i % V.length], lap = Math.floor(i / V.length);
    return { i: i, id: v.id, name: v.name + (lap ? ' ★' + (lap + 1) : ''), blds: v.blds, b: s.toon.b.slice() };
  };
  T.cost = function (s, j, now) {
    var k = s.toon.b[j] + 1; if (k > D.TOON.stages) return 0;
    return Math.round(D.TOON.costB[j] * k * (1 + 0.6 * s.toon.vi) * E.derived(s, now).B);
  };
  T.build = function (s, j, rng, now) {
    if (j < 0 || j > 4 || s.toon.b[j] >= D.TOON.stages) return { ok: false, reason: 'Уже построено' };
    var c = T.cost(s, j, now); if (s.coins < c) return { ok: false, reason: 'Не хватает денежек' };
    s.coins -= c; s.toon.b[j]++; var stars = s.toon.b[j]; s.toon.stars += stars;
    var out = { ok: true, cost: c, stars: stars, stage: s.toon.b[j] };
    if (s.toon.b.every(function (x) { return x >= D.TOON.stages; })) {
      out.done = T.village(s).name; out.reward = X.reward(s, D.TOON.villageRw, rng, now);
      s.toon.vi++; s.toon.b = [0, 0, 0, 0, 0];
    }
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
