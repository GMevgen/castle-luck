/* Замок удачи 0.8–0.9 — правила вращения, общие для всех стилей: гость-обменщик карт раз в сутки, энергия 50,
   ставки ×1…×10, три свитка — набег-раскопки (3 из 4 ям), три сферы — +1 купол (макс. 3).
   0.9: стиль «Мультяшный» удалён, правила стали общими; деревни уровней и питомец-енот убраны (замок — снова главный экран). */
(function (root) {
  var CL = root.CL, D = CL.Data, E = CL.Engine, X = CL.Extra; if (!X) return;
  var T = CL.V08 = {};
  function on(s) { return !!s; }
  T.on = on;
  function hash01(n) { var x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
  D.SLOT8 = { maxEnergy: 50, bets: [1, 2, 3, 5, 10], maxShields: 3, dig: { spots: [30, 15, 8, 0], tries: 3 } };
  /* ---------- состояние ---------- */
  var _new = E.newState;
  E.newState = function (now) { var s = _new(now); s.dig = null; s.xch = { day: null }; return s; };
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

  /* ---------- энергия и ставки ---------- */
  var _der = E.derived;
  E.derived = function (s, now) { var d = _der(s, now); if (on(s)) d.maxEnergy += D.SLOT8.maxEnergy - 100; return d; };   // 0.9: база 50 (была 100), Склад по-прежнему даёт +15 за уровень
  var _bo = E.betOptions;
  E.betOptions = function (s) { return on(s) ? D.SLOT8.bets.slice() : _bo(s); };

  /* ---------- вращение: свинки → раскопки, значки → купол ---------- */
  var _spin = E.spin;
  E.spin = function (s, now, rng) {
    if (on(s) && D.SLOT8.bets.indexOf(s.bet) < 0) s.bet = 10;
    var out = _spin(s, now, rng); if (!out.ok || !on(s)) return out;
    var tr = out.line.triple;
    if (tr === 'orb' && s.raid.shields < D.SLOT8.maxShields) { s.raid.shields++; out.shieldWin = 1; }
    if (tr === 'scroll' && !s.dig) { s.dig = T.makeDig(s, rng, out.bet); out.raidDig = true; }
    return out;
  };
  T.makeDig = function (s, rng, bet) {
    var sp = D.SLOT8.dig.spots.slice(); for (var i = sp.length - 1; i > 0; i--) { var j = rng.int(i + 1), x = sp[i]; sp[i] = sp[j]; sp[j] = x; }
    var rv = D.RIVALS[rng.int(D.RIVALS.length)].id;
    return { rival: rv, spots: sp.map(function (v) { return v * bet; }), open: [false, false, false, false], left: D.SLOT8.dig.tries, got: 0 };
  };
  T.dig = function (s, i, rng, now) {
    var g = s.dig; if (!g || g.left <= 0 || g.open[i] || i < 0 || i > 3) return { ok: false };
    g.open[i] = true; g.left--;
    var units = g.spots[i], coins = 0;
    if (units > 0) coins = X.reward(s, { coinsB: units }, rng, now).coins || 0;
    g.got += coins; var done = g.left <= 0;
    if (done) { s.stats.raids = (s.stats.raids || 0) + 1; s.dig = null; }
    return { ok: true, coins: coins, done: done, total: g.got };
  };
})(typeof window !== 'undefined' ? window : globalThis);
