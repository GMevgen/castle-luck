/* Замок удачи 0.6 (бета), часть 2: дневной сбор над Колесом, мини-игры и мини-лавка, набеги на NPC-соседей,
   цепочки заданий глав. Чистая логика без DOM (работает и в Node для тестов). Подключается после engine.js. */
(function (root) {
  var CL = root.CL, D = CL.Data, E = CL.Engine, X = CL.Extra = {};
  var H = 3600000;

  /* ---------- данные ---------- */
  D.DAILY_ITEMS = ['Банки светлячков', 'Жёлуди', 'Вороньи перья', 'Лунные грибы', 'Бумажные фонарики', 'Ракушки', 'Звёздная пыль', 'Горшочки мёда']
    .map(function (n, i) { return { name: n, img: 'img/daily/' + i + '.webp' }; });
  /* этапы считаются от начала дня; награда выдаётся сразу при достижении */
  D.DAILY_MILES = [
    { need: 100, rw: { energy: 100 } }, { need: 300, rw: { coinsB: 20 } }, { need: 600, rw: { keys: 3, shield: 1 } },
    { need: 1000, rw: { energy: 1000 } }, { need: 2500, rw: { chest: 1, seals: 20 } }, { need: 5000, rw: { chest: 2, shield: 1 } },
    { need: 10000, rw: { energy: 5000 } }, { need: 20000, rw: { energy: 20000 } }, { need: 50000, rw: { energy: 50000, chest: 3 } }
  ];
  /* предметов за вращение = ставка × v, v ∈ {0,1,2,4} с весами 66/24/6/4 → в среднем 0,52 предмета на 1 энергию.
     Энергия за этапы 100…50 000 возвращает не больше ~90% потраченной на них энергии — бесконечной «фермы» нет. */
  D.DAILY_DROP = { w: [66, 24, 6, 4], v: [0, 1, 2, 4] };
  D.ENERGY_HARD_CAP = 99999;
  D.MINI = { searchTries: 5, sweepTries: 3, runCoinCap: 400, searchTime: 45, searchFind: 5 };
  D.MINI_SHOP = [
    { id: 'en', name: 'Энергия', ico: 'energy', energy: 25, price: 60, day: 5 },
    { id: 'mana', name: 'Кристаллы маны', ico: 'mana', mana: 40, price: 50, day: 5 },
    { id: 'seal', name: 'Печати гильдии', ico: 'seal', seals: 10, price: 80, day: 3 },
    { id: 'key', name: 'Ключ', ico: 'key', keys: 1, price: 90, day: 2 }
  ];
  D.SWEEP = { n: 9, mines: 10, bonus: 14 };
  D.RAID = { unlock: 4, maxCharges: 3, maxShields: 3, chargeEvery: 12, shieldEvery: 30, npcMin: 5 * H, npcSpread: 5 * H, npcMaxOffline: 2 };
  D.RIVALS = [
    { id: 'baron', who: 'baron', village: 'Шнапсбург', blds: ['citadel', 'treasury', 'market'],
      lose: 'Мои усы! То есть мои монеты! Это одно и то же!', win: 'Ха! Мой щит крепче вашего характера!', hit: 'Барон фон Шнапс разграбил казну! Говорят, он смеялся в усы. В оба.' },
    { id: 'griz', who: 'griz', village: 'Кривая Топь', blds: ['tower', 'academy', 'warehouse'],
      lose: 'Ой-ой, мой котёл! Ладно, ладно, забирай. Но чай я не отдам.', win: 'Мой щит заговорён, {милок|милочка}. И слегка пахнет жабой.', hit: 'Ведьма Гризельда наслала ветер — и половина монет улетела в её котёл.' },
    { id: 'krax', who: 'krax', village: 'Процентово', blds: ['treasury', 'library', 'market'],
      lose: 'Это грабёж! Я запишу в книгу. С процентами. Против себя.', win: 'Щит, {милорд|милорд}, тоже взят в долг. Но он работает.', hit: 'Кракс-ростовщик взыскал «старый долг вашего деда». Долга не было. Монет тоже больше нет.' },
    { id: 'unylot', who: 'unylot', village: 'Дождливый Утёс', blds: ['citadel', 'forge', 'gallery'],
      lose: 'Я так и знал. Я всегда всё знаю заранее. Это грустно.', win: 'Щит выдержал. Даже радоваться не хочется. Как всегда.', hit: 'Сэр Унылот вежливо постучал, извинился — и сломал вам стену. Очень печально.' }
  ];
  D.RIVAL_BY_ID = {}; D.RIVALS.forEach(function (r) { D.RIVAL_BY_ID[r.id] = r; });

  /* ---------- состояние: новые поля (для старых сохранений дозаполняются в E.migrate) ---------- */
  var _new = E.newState;
  E.newState = function (now) {
    var s = _new(now);
    s.dbar = { day: null, n: 0, got: 0 };
    s.mini = { day: null, search: 0, sweep: 0, runCoins: 0, coins: 0, shop: {}, sw: null, best: 0 };
    s.raid = { charges: 1, shields: 1, spinN: 0, log: [], dmg: {}, nextT: now + 8 * H, seq: 0 };
    s.chain = { n: 1, k: 0, base: null };
    s.stats.raids = 0; s.stats.miniPlays = 0; s.stats.dailyItems = 0; s.stats.chainSteps = 0;
    s.tut.x2 = false;
    return s;
  };
  function today(s, t) { return E.dayKey(t != null ? t : s.time.high); }
  function snap(s) { var o = {}; for (var k in s.stats) o[k] = s.stats[k]; return o; }
  function reward(s, rw, rng, now) {
    var r = E.applyReward(s, rw, rng, null, now);
    if (rw.shield) { var g = Math.min(rw.shield, D.RAID.maxShields - s.raid.shields); s.raid.shields += Math.max(0, g); r.shield = Math.max(0, g); }
    return r;
  }
  X.reward = reward;
  function hash01(n) { var x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }

  /* ---------- дневной сбор ---------- */
  X.dailyItem = function (t) { return D.DAILY_ITEMS[((E.dayIndex(t) % 8) + 8) % 8]; };
  X.dailyBar = function (s, t) {
    var key = today(s, t); if (s.dbar.day !== key) { s.dbar = { day: key, n: 0, got: 0 }; }
    var next = D.DAILY_MILES[s.dbar.got] || null, prev = s.dbar.got > 0 ? D.DAILY_MILES[s.dbar.got - 1].need : 0;
    return { n: s.dbar.n, got: s.dbar.got, next: next, prev: prev, item: X.dailyItem(t != null ? t : s.time.high), done: !next };
  };
  X.addDaily = function (s, items, rng, t) {
    X.dailyBar(s, t); var out = [];
    if (items <= 0) return out;
    s.dbar.n += items; s.stats.dailyItems += items;
    while (D.DAILY_MILES[s.dbar.got] && s.dbar.n >= D.DAILY_MILES[s.dbar.got].need) {
      var m = D.DAILY_MILES[s.dbar.got]; s.dbar.got++;
      out.push({ need: m.need, rw: m.rw, res: reward(s, m.rw, rng, t) });
    }
    return out;
  };

  /* ---------- вращение: дневные предметы, заряды набегов, щиты ---------- */
  var _spin = E.spin;
  E.spin = function (s, now, rng) {
    var out = _spin(s, now, rng); if (!out.ok) return out;
    var t = s.time.high, v = D.DAILY_DROP.v[rng.weighted(D.DAILY_DROP.w)];
    out.dailyItems = v * out.bet; out.dailyMiles = X.addDaily(s, out.dailyItems, rng, t);
    if (s.level >= D.RAID.unlock) {
      var r = s.raid; r.spinN++;
      if (r.spinN % D.RAID.chargeEvery === 0 && r.charges < D.RAID.maxCharges) { r.charges++; out.raidCharge = true; }
      if (r.spinN % D.RAID.shieldEvery === 0 && r.shields < D.RAID.maxShields) { r.shields++; out.raidShield = true; }
    }
    return out;
  };
  /* энергия из наград может превышать прежние 9 999 (этапы 20 000 / 50 000) */
  X.ENERGY_CAP = D.ENERGY_HARD_CAP;

  /* ---------- набеги ---------- */
  function logPush(s, e) { s.raid.seq++; e.id = s.raid.seq; s.raid.log.unshift(e); if (s.raid.log.length > 25) s.raid.log.length = 25; return e; }
  X.raidOpen = function (s) { return s.level >= D.RAID.unlock; };
  X.attack = function (s, rivalId, bldIdx, rng, now, revengeId) {
    var rv = D.RIVAL_BY_ID[rivalId]; if (!rv) return { ok: false, reason: 'Нет такого соседа' };
    if (!X.raidOpen(s)) return { ok: false, reason: 'Набеги откроются на ' + D.RAID.unlock + ' уровне' };
    var rev = null;
    if (revengeId != null) {
      rev = s.raid.log.filter(function (e) { return e.id === revengeId; })[0];
      if (!rev || rev.dir !== 'in' || rev.revenged || rev.rival !== rivalId) return { ok: false, reason: 'Месть уже свершилась' };
    } else if (s.raid.charges <= 0) return { ok: false, reason: 'Нет зарядов набега — крутите Колесо' };
    if (rev) rev.revenged = true; else s.raid.charges--;
    var d = E.derived(s, now), mul = rev ? 1.5 : 1, bld = rv.blds[bldIdx % rv.blds.length], res;
    s.stats.raids++;
    if (!rev && rng.chance(0.25)) {   // у соседа сработал щит
      res = reward(s, { coinsB: 3 }, rng, now);
      logPush(s, { dir: 'out', rival: rivalId, t: now, blocked: true, bld: bld, coins: res.coins || 0 });
      return { ok: true, blocked: true, coins: res.coins || 0, bld: bld, quip: rv.win };
    }
    var steal = rng.chance(0.6);
    res = reward(s, steal ? { coinsB: Math.round(rng.range(15, 40) * mul) } : { coinsB: Math.round(10 * mul), seals: 2 }, rng, now);
    logPush(s, { dir: 'out', rival: rivalId, t: now, steal: steal, bld: bld, coins: res.coins || 0, seals: res.seals || 0, revenge: !!rev });
    return { ok: true, steal: steal, coins: res.coins || 0, seals: res.seals || 0, bld: bld, revenge: !!rev, quip: rv.lose };
  };
  X.repairCost = function (s) { return Math.round(E.derived(s).B * 8); };
  X.repair = function (s, id) {
    if (!s.raid.dmg[id]) return { ok: false, reason: 'Постройка цела' };
    var c = X.repairCost(s); if (s.coins < c) return { ok: false, reason: 'Не хватает монет', cost: c };
    s.coins -= c; delete s.raid.dmg[id]; return { ok: true, cost: c };
  };
  /* ответные набеги NPC: по расписанию раз в 5–10 ч, пока игрок не в сети — не больше двух подряд */
  X.npcAttacks = function (s, t) {
    var evs = []; if (!X.raidOpen(s)) { if (s.raid.nextT < t) s.raid.nextT = t + D.RAID.npcMin; return evs; }
    var n = 0;
    while (t >= s.raid.nextT && n < D.RAID.npcMaxOffline) {
      var at = s.raid.nextT, h = hash01(at), rv = D.RIVALS[Math.floor(hash01(at + 1) * D.RIVALS.length)], e;
      if (s.raid.shields > 0) { s.raid.shields--; e = logPush(s, { dir: 'in', rival: rv.id, t: at, blocked: true }); }
      else if (h < 0.55 || !E.derived(s).B) {
        var lost = Math.min(Math.round(s.coins * 0.05), Math.round(E.derived(s).B * 25)); s.coins -= lost;
        e = logPush(s, { dir: 'in', rival: rv.id, t: at, steal: true, coins: lost });
      } else {
        var cand = D.BUILDINGS.filter(function (b) { return s.bld[b.id] > 0 && !s.raid.dmg[b.id]; });
        var b = cand[Math.floor(hash01(at + 2) * cand.length)];
        if (b) { s.raid.dmg[b.id] = true; e = logPush(s, { dir: 'in', rival: rv.id, t: at, dmg: b.id }); }
        else e = logPush(s, { dir: 'in', rival: rv.id, t: at, blocked: true });
      }
      evs.push({ type: 'npcRaid', entry: e }); n++;
      s.raid.nextT = at + D.RAID.npcMin + Math.floor(hash01(at + 3) * D.RAID.npcSpread);
    }
    if (t >= s.raid.nextT) s.raid.nextT = t + D.RAID.npcMin;   // пропущенные окна не копятся
    return evs;
  };
  var _canUp = E.canUpgrade;
  E.canUpgrade = function (s, id) {
    if (s.raid && s.raid.dmg && s.raid.dmg[id]) return { ok: false, reason: 'Повреждено набегом — сначала почините', dmg: true };
    return _canUp.apply(this, arguments);
  };

  /* ---------- мини-игры ---------- */
  function miniDay(s, t) { var k = today(s, t); if (s.mini.day !== k) { s.mini.day = k; s.mini.search = 0; s.mini.sweep = 0; s.mini.runCoins = 0; s.mini.shop = {}; } return s.mini; }
  X.mini = function (s, t) { var m = miniDay(s, t); return { search: D.MINI.searchTries - m.search, sweep: D.MINI.sweepTries - m.sweep, runLeft: D.MINI.runCoinCap - m.runCoins, coins: m.coins }; };
  /* Поиск: попытка списывается при старте */
  X.searchStart = function (s, t) { var m = miniDay(s, t); if (m.search >= D.MINI.searchTries) return { ok: false, reason: 'Попытки на сегодня закончились — приходите завтра' }; m.search++; s.stats.miniPlays++; return { ok: true }; };
  X.searchFinish = function (s, found, total, rng, t) {
    found = Math.max(0, Math.min(found | 0, total | 0, D.MINI.searchFind)); total = Math.min(total | 0, D.MINI.searchFind);
    var all = found >= total && total > 0, rw = { energy: 4 * found + (all ? 10 : 0) }, r = reward(s, rw, rng, t);
    r.cards = r.cards || [];
    if (all && rng.chance(0.04)) r.cards.push(E.rollCard(s, rng, 'L', 0, t));        // ультраредкая (легендарная) карта
    else if (found >= 3 && rng.chance(0.03)) r.cards.push(E.rollCard(s, rng, 'E', 0, t));
    r.found = found; r.all = all; return r;
  };
  /* Бегущий ворон: монетки-мини копятся на счёте, не больше D.MINI.runCoinCap в день */
  X.runFinish = function (s, coins, t) {
    var m = miniDay(s, t), got = Math.max(0, Math.min(coins | 0, D.MINI.runCoinCap - m.runCoins));
    m.runCoins += got; m.coins += got; m.best = Math.max(m.best || 0, coins | 0); s.stats.miniPlays++;
    return { ok: true, got: got, capped: got < (coins | 0) };
  };
  X.shopBuy = function (s, id, rng, t) {
    var it = D.MINI_SHOP.filter(function (x) { return x.id === id; })[0]; if (!it) return { ok: false };
    var m = miniDay(s, t), n = m.shop[id] || 0;
    if (n >= it.day) return { ok: false, reason: 'Лимит на сегодня: ' + it.day };
    if (m.coins < it.price) return { ok: false, reason: 'Не хватает монеток-мини' };
    if (it.keys && s.keys >= E.derived(s).maxKeys) return { ok: false, reason: 'Связка ключей полна' };
    m.coins -= it.price; m.shop[id] = n + 1;
    var r = reward(s, { energy: it.energy, mana: it.mana, seals: it.seals, keys: it.keys }, rng, t); r.ok = true; return r;
  };
  /* Магический сапёр 9×9: 10 мин, 14 клеток с бонусами; первая клетка всегда безопасна.
     Бонусы копятся в «котелке»; мина забирает 75% котелка; открыть всё безопасное — котелок ×2. */
  X.sweepNew = function (s, t) {
    var m = miniDay(s, t); if (m.sweep >= D.MINI.sweepTries) return { ok: false, reason: 'Партии на сегодня закончились' };
    m.sweep++; s.stats.miniPlays++;
    m.sw = { n: D.SWEEP.n, mines: null, bonus: {}, open: [], pot: { energy: 0, coinsB: 0, mana: 0, keys: 0 }, over: false, win: false };
    return { ok: true, game: m.sw };
  };
  function nb(n, i) { var x = i % n, y = (i / n) | 0, o = []; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; var a = x + dx, b = y + dy; if (a >= 0 && b >= 0 && a < n && b < n) o.push(b * n + a); } return o; }
  X.sweepCount = function (g, i) { return nb(g.n, i).filter(function (j) { return g.mines.indexOf(j) >= 0; }).length; };
  X.sweepReveal = function (s, i, rng) {
    var g = s.mini.sw; if (!g || g.over) return { ok: false };
    var N = g.n * g.n;
    if (!g.mines) {   // расстановка после первого хода: клетка и соседи безопасны
      var safe = nb(g.n, i).concat([i]), cells = []; for (var c = 0; c < N; c++) if (safe.indexOf(c) < 0) cells.push(c);
      for (var z = cells.length - 1; z > 0; z--) { var y = rng.int(z + 1), tmp = cells[z]; cells[z] = cells[y]; cells[y] = tmp; }
      g.mines = cells.slice(0, D.SWEEP.mines);
      var rest = cells.slice(D.SWEEP.mines).concat(safe.filter(function (x) { return x !== i; }));
      for (var k = 0; k < D.SWEEP.bonus; k++) {
        var at = rest.splice(rng.int(rest.length), 1)[0], roll = rng.float();
        g.bonus[at] = roll < 0.45 ? { energy: rng.range(3, 8) } : roll < 0.75 ? { coinsB: 2 } : roll < 0.95 ? { mana: 5 } : { keys: 1 };
      }
    }
    if (g.open.indexOf(i) >= 0) return { ok: true, game: g };
    var res = { ok: true, game: g, got: [] };
    if (g.mines.indexOf(i) >= 0) {
      g.open.push(i); g.over = true; g.boom = i;
      for (var p in g.pot) g.pot[p] = Math.floor(g.pot[p] * 0.25);
      res.boom = true; return res;
    }
    var stack = [i];
    while (stack.length) {
      var c2 = stack.pop(); if (g.open.indexOf(c2) >= 0) continue; g.open.push(c2);
      var bn = g.bonus[c2]; if (bn) { for (var q in bn) g.pot[q] += bn[q]; res.got.push(bn); }
      if (X.sweepCount(g, c2) === 0 && !bn) nb(g.n, c2).forEach(function (j) { if (g.open.indexOf(j) < 0 && g.mines.indexOf(j) < 0) stack.push(j); });
    }
    if (g.open.length >= N - g.mines.length) { g.over = true; g.win = true; for (var w in g.pot) g.pot[w] *= 2; res.win = true; }
    return res;
  };
  X.sweepCash = function (s, rng, t) {
    var g = s.mini.sw; if (!g) return { ok: false };
    var rw = {}; for (var k in g.pot) if (g.pot[k] > 0) rw[k] = g.pot[k];
    var r = reward(s, rw, rng, t); s.mini.sw = null; r.ok = true; r.pot = rw; return r;
  };

  /* ---------- цепочки заданий глав ---------- */
  X.chainStep = function (s) { var c = D.CHAINS[s.chain.n - 1]; return c ? c.steps[s.chain.k] || null : null; };
  X.chainOpen = function (s) { return !!X.chainStep(s) && (s.story.finished || s.story.ch >= s.chain.n); };
  X.chainProgress = function (s) {
    var st = X.chainStep(s); if (!st || !s.chain.base) return 0;
    return Math.max(0, Math.min(st.obj.t, (s.stats[st.obj.stat] || 0) - (s.chain.base[st.obj.stat] || 0)));
  };
  X.chainDone = function (s) { var st = X.chainStep(s); return !!st && !!s.chain.base && X.chainProgress(s) >= st.obj.t; };
  X.chainSceneId = function (n, k) { return 'q_' + n + '_' + k; };
  /* начать текущую часть, если доступна: зафиксировать счётчики и поставить диалог в очередь */
  X.chainStart = function (s) {
    if (s.chain.base || !X.chainOpen(s)) return false;
    s.chain.base = snap(s); E.queueScene(s, X.chainSceneId(s.chain.n, s.chain.k)); return true;
  };
  X.chainClaim = function (s, rng, now) {
    if (!X.chainDone(s)) return { ok: false };
    var st = X.chainStep(s), r = reward(s, st.rw, rng, now); s.stats.chainSteps++;
    s.chain.k++; if (!D.CHAINS[s.chain.n - 1].steps[s.chain.k]) { s.chain.n++; s.chain.k = 0; }
    s.chain.base = null; X.chainStart(s);
    return { ok: true, reward: r };
  };
  var _scene = E.sceneData;
  E.sceneData = function (id) {
    var m = /^q_(\d+)_(\d+)$/.exec(id);
    if (m) {
      var c = D.CHAINS[+m[1] - 1], st = c && c.steps[+m[2]]; if (!st) return null;
      return { img: st.img, kicker: 'Глава ' + c.n + ' · ' + (st.kicker || 'Часть ' + (+m[2] + 1)), title: st.title, lines: st.lines };
    }
    return _scene(id);
  };

  /* ---------- такт: новый день, набеги NPC, доступность цепочки ---------- */
  var _tick = E.tick;
  E.tick = function (s, now) {
    var ev = _tick(s, now) || [], t = s.time.high;
    if (!s.raid) return ev;
    X.dailyBar(s, t); miniDay(s, t);
    X.npcAttacks(s, t).forEach(function (e) { ev.push(e); });
    X.chainStart(s);
    return ev;
  };
  var _notif = E.notifications;
  E.notifications = function (s, now) {
    var n = _notif(s, now);
    if (s.chain && X.chainDone(s)) n.quests++;
    return n;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
