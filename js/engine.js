/* Замок удачи — игровая логика без DOM (тестируется в Node). */
(function (root) {
  'use strict';
  var CL = root.CL = root.CL || {};
  var D = CL.Data;
  var E = CL.Engine = {};
  var MIN = 60000, HOUR = 3600000, DAY = 86400000;
  var MAIN_COLS = D.COLLECTIONS.filter(function (c) { return !c.event; });
  var CROWN = D.SYMBOLS.map(function (x) { return x.id; }).indexOf('crown'), CROWN_STOP = D.STRIP.indexOf(CROWN);

  /* ---------- время ---------- */
  function dayIndex(t) { return Math.floor((t - new Date(t).getTimezoneOffset() * MIN) / DAY); }
  function dayKey(t) { var d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  E.dayIndex = dayIndex; E.dayKey = dayKey;

  /* Защита от перевода часов назад: «эффективное время» никогда не уменьшается.
     Если часы отвели назад, таймеры стоят, пока реальное время не догонит максимум. */
  function effNow(s, now) {
    if (now < s.time.high) { s.time.rollback = true; return s.time.high; }
    s.time.rollback = false; s.time.high = now; return now;
  }

  /* ---------- состояние ---------- */
  E.newState = function (now) {
    var bld = {}; D.BUILDINGS.forEach(function (b) { bld[b.id] = b.start; });
    var skills = {}; D.SKILLS.forEach(function (k) { skills[k.id] = 0; });
    var s = {
      v: D.SAVE_VERSION, created: now,
      theme: (globalThis.CL && CL.THEMES && CL.THEMES.active) || 'anime', themeAsked: false, seenVer: D.APP_VERSION,   // 0.7
      time: { high: now, rollback: false },
      level: 1, xp: 0, coins: 2500, energy: 100, mana: 30, keys: 2, seals: 0,
      energyT: now, manaT: now, treasuryT: now,
      bld: bld, skills: skills, research: null,
      cards: {}, colDone: {},
      chests: [null, null, null], unlocking: -1,
      spells: { active: {}, cd: {}, rewindMin: 0 },
      stats: { spins: 0, coinsWon: 0, cardsGot: 0, upgrades: 0, chestsOpened: 0, spellsCast: 0, treasuryCollects: 0,
               triples: 0, jackpots: 0, researched: 0, energySpent: 0, coinsLost: 0, bestWin: 0, eventStages: 0 },
      daily: null, login: { last: null, streak: 0, pending: false },
      story: { ch: 1, base: {}, seen: 0, finished: false },
      ach: {}, event: { inst: -1, items: 0, stage: 0 },
      bet: 1, settings: { sound: true, turbo: false },
      hero: { g: 'm', chosen: false, name: '', named: false },   // 0.9: имя персонажа (named — экран создания уже показан)        // v0.6: пол героя (выбирается при первом запуске)
      tut: { done: false, step: 0, news: false },   // v0.6: обучение с вороном
      pity: { since: 0, target: null },       // скрытый счётчик джекпота (в интерфейсе не показывается)
      builds: [],                             // очередь строительства
      scenes: { seen: {}, queue: ['ch_1'], active: null }
    };
    s.story.base = snapshotStats(s);
    s.chests[0] = { tier: 0, end: null }; // стартовый подарок
    return s;
  };
  function snapshotStats(s) { var o = {}; for (var k in s.stats) o[k] = s.stats[k]; return o; }

  /* ---------- сохранения и миграции ---------- */
  /* v1 — формат ранней сборки: { version:1, gold, spins(энергия), lvl, exp, buildings:{...}, cardList:[id,...], lastSeen } */
  E.MIGRATIONS = {
    1: function (o, now) {
      var s = E.newState(o.lastSeen || now);
      s.coins = o.gold | 0; s.energy = o.spins | 0; s.level = o.lvl || 1; s.xp = o.exp | 0;
      if (o.buildings) for (var k in o.buildings) if (k in s.bld) s.bld[k] = o.buildings[k] | 0;
      (o.cardList || []).forEach(function (id) { if (D.CARD_BY_ID[id]) s.cards[id] = (s.cards[id] || 0) + 1; });
      s.energyT = s.manaT = s.treasuryT = o.lastSeen || now;
      s.time.high = o.lastSeen || now;
      s.v = 2; return s;
    },
    /* v2 → v3 (игра v2.0): очередь стройки, шкала события, скрытый счётчик джекпота, катсцены.
       Уровни, монеты, карты, навыки — без изменений. Энергия сохраняется (может временно превышать новый максимум). */
    2: function (o, now) {
      o.builds = [];
      o.pity = { since: 0, target: null };     // цель выберется crypto-ГСЧ при первом вращении
      var inst = o.event && typeof o.event.inst === 'number' ? o.event.inst : -1;
      o.event = { inst: inst, items: 0, stage: 0 };
      if (o.stats) o.stats.eventStages = o.stats.eventStages || 0;
      var seen = {}, ch = (o.story && o.story.ch) || 1;
      for (var i = 1; i <= ch; i++) seen['ch_' + i] = 1;
      for (var j = 1; j < ch; j++) seen['out_' + j] = 1;
      if (o.story && o.story.finished) { seen['out_' + ch] = 1; seen.epilogue = 1; }
      for (var lv in D.LEVEL_SCENES) if ((o.level || 1) >= +lv) seen[D.LEVEL_SCENES[lv]] = 1;
      if (o.stats && o.stats.jackpots > 0) seen.jackpot1 = 1;
      if (o.colDone && Object.keys(o.colDone).length) seen.col1 = 1;
      if (o.bld && o.bld.warehouse >= 2) seen.wh2 = 1;
      if (o.bld && o.bld.citadel >= 3) seen.builder2 = 1;
      if (o.bld && o.bld.citadel >= 6) seen.builder3 = 1;
      o.scenes = { seen: seen, queue: [], active: null };
      o.v = 3; return o;
    },
    /* v3 → v4 (игра 0.6 бета): пол героя и обучение. Старые игроки — герой, обучение считается пройденным
       (его можно включить в настройках), один раз покажется подсказка о новинках. Прогресс не трогается. */
    3: function (o) {
      o.hero = { g: 'm', chosen: true };
      o.tut = { done: true, step: 0, news: true };
      o.v = 4; return o;
    },
    /* v4 → v5 (игра 0.7 бета): стиль оформления. Старые игроки остаются в «Аниме», один раз им предложат выбрать стиль;
       «Что нового» покажет изменения с 0.6.1. Прогресс не трогается. */
    4: function (o) {
      o.theme = 'anime'; o.themeAsked = false; o.seenVer = '0.6.1 (бета)';
      o.v = 5; return o;
    }
  };
  E.migrate = function (raw, now) {
    if (!raw || typeof raw !== 'object') return E.newState(now);
    var o = raw, v = o.v || o.version || 1, guard = 0;
    while (v < D.SAVE_VERSION && guard++ < 20) {
      if (!E.MIGRATIONS[v]) throw new Error('Нет миграции с версии ' + v);
      o = E.MIGRATIONS[v](o, now); v = o.v;
    }
    if (v > D.SAVE_VERSION) throw new Error('Сохранение из более новой версии игры (' + v + ')');
    if (o.theme === 'cpencil') o.theme = 'pencil';
    if (o.theme === 'toon' || o.theme === 'dark') o.theme = 'anime';   // 0.9: стили удалены → «Аниме»
    if (o.toon) { if (o.toon.dig && !o.dig) o.dig = o.toon.dig; delete o.toon; }   // 0.9: деревни 0.8 и питомец удалены, раскопки остаются
    // дозаполнение недостающих полей (forward-compatible)
    var fresh = E.newState(now);
    (function fill(dst, src) {
      for (var k in src) {
        if (!(k in dst) || dst[k] === undefined) dst[k] = src[k];
        else if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object') fill(dst[k], src[k]);
      }
    })(o, fresh);
    o.coins = E.safeCoins(o.coins);   // 0.7.1: монеты без лимита, но всегда конечное целое ≥ 0
    return o;
  };
  E.serialize = function (s) { return JSON.stringify(s); };
  E.deserialize = function (str, now) { return E.migrate(JSON.parse(str), now); };

  /* ---------- производные параметры ---------- */
  function colBonusSum(s) {
    var b = { coins: 0, xp: 0, mana: 0, maxEnergy: 0, rare: 0, regen: 0, treasury: 0, chestTime: 0 };
    var mul = 1 + 0.1 * Math.max(0, s.bld.gallery - 1); // Галерея усиливает бонусы
    for (var id in s.colDone) { var c = D.COL_BY_ID[id]; if (!c) continue; for (var k in c.bonus) b[k] += c.bonus[k] * mul; }
    return b;
  }
  E.currentEvent = function (now) {
    var inst = Math.floor(dayIndex(now) / D.EVENT_DAYS);
    var ev = D.EVENTS[((inst % D.EVENTS.length) + D.EVENTS.length) % D.EVENTS.length];
    var startDay = inst * D.EVENT_DAYS;
    var start = (startDay * DAY) + new Date(startDay * DAY).getTimezoneOffset() * MIN;
    var end = start + D.EVENT_DAYS * DAY;
    var nextEv = D.EVENTS[(((inst + 1) % D.EVENTS.length) + D.EVENTS.length) % D.EVENTS.length];
    return { inst: inst, ev: ev, start: start, end: end, next: nextEv };
  };
  E.derived = function (s, now) {
    var t = now != null ? now : s.time.high;
    var cb = colBonusSum(s), sk = s.skills, b = s.bld;
    var ev = E.currentEvent(t).ev.bonus;
    var d = {};
    d.B = D.baseCoin(s.level);
    // 0.7.1: монеты без лимита (Склад их больше не ограничивает); MAX_COINS — только защита от переполнения точной арифметики
    d.maxEnergy = 100 + 15 * (Math.max(1, b.warehouse) - 1);   // v2: только Склад
    d.regenMs = Math.max(20000, 90000 * Math.pow(0.94, b.academy - 1) * (1 - cb.regen) * (1 - D.SKILL_BY_ID.stamina.per * sk.stamina) * (1 - (ev.regen || 0)));
    d.builders = D.builders(b.citadel);
    d.buildMul = Math.max(0.6, 1 - 0.04 * (b.citadel - 1));   // Цитадель ускоряет стройку
    d.maxMana = 60 + 20 * b.tower;
    d.maxKeys = 30 + 10 * (Math.max(1, b.warehouse) - 1);   // v0.6: связка ключей (растёт со Складом)
    d.manaRegenMs = 360000 * Math.pow(0.95, b.academy - 1);
    d.coinMul = (1 + 0.03 * (b.citadel - 1)) * (1 + D.SKILL_BY_ID.coin.per * sk.coin + cb.coins) * (1 + (ev.coins || 0));
    d.xpMul = (1 + D.SKILL_BY_ID.wisdom.per * sk.wisdom + cb.xp) * (1 + (ev.xp || 0));
    d.manaMul = 1 + D.SKILL_BY_ID.magister.per * sk.magister + cb.mana;
    d.rare = D.SKILL_BY_ID.luck.per * sk.luck + cb.rare;
    d.cardChanceMul = 1 + (ev.cardChance || 0);
    d.chestTimeMul = Math.max(0.3, (1 - D.SKILL_BY_ID.patience.per * sk.patience) * (1 - cb.chestTime) * (1 - 0.05 * b.forge));
    d.sealMul = (1 + D.SKILL_BY_ID.trade.per * sk.trade) * (1 + 0.1 * Math.max(0, b.market - 1));
    d.priceMul = Math.max(0.6, 1 - 0.03 * Math.max(0, b.market - 1));
    d.horse = D.SKILL_BY_ID.horse.per * sk.horse;
    d.keyChance = D.SKILL_BY_ID.keys.per * sk.keys;
    d.treasuryRate = b.treasury > 0 ? d.B * (2 + 2 * b.treasury) * (1 + cb.treasury) : 0; // монет в час
    d.treasuryCapH = 3 + b.treasury;
    d.chestSlots = Math.min(6, 3 + Math.floor(b.forge / 3));
    d.keyPrice = Math.round(d.B * 40 * Math.max(0.5, 1 - 0.04 * b.forge));
    d.spellCdMul = Math.max(0.5, 1 - 0.04 * Math.max(0, b.tower - 1));
    d.spellPower = 1 + 0.1 * Math.max(0, b.tower - 1); // длительность заклинаний
    d.researchMul = Math.max(0.4, 1 - 0.05 * b.library);
    d.skillCap = Math.min(D.SKILL_MAX, Math.ceil(b.library / 2));
    d.unlockedCols = MAIN_COLS.filter(function (c) { return c.unlock <= s.level; }).map(function (c) { return c.id; });
    return d;
  };

  /* ---------- начисления с ограничениями ---------- */
  E.MAX_COINS = Number.MAX_SAFE_INTEGER;   // 0.7.1: лимита золота нет, только предел точных целых в JS (≈9 квадриллионов)
  E.safeCoins = function (v) { v = Math.floor(Number(v)); return v > 0 ? Math.min(v, E.MAX_COINS) : 0; };
  function addCoins(s, n, d, out) {
    n = Math.round(n); if (!(n > 0)) return 0;   // NaN/Infinity/отрицательные не начисляются
    var got = Math.min(n, E.MAX_COINS - E.safeCoins(s.coins)); s.coins = E.safeCoins(s.coins) + got;
    return got;
  }
  function addMana(s, n, d) { var before = s.mana; s.mana = Math.min(d.maxMana, s.mana + Math.round(n)); return s.mana - before; }
  /* ключи сверх связки не начисляются; уже имеющиеся сверх максимума не отнимаются */
  function addKeys(s, n, d) { n = Math.max(0, Math.round(n || 0)); var got = Math.max(0, Math.min(n, d.maxKeys - s.keys)); s.keys += got; return got; }
  E.addKeys = function (s, n) { return addKeys(s, n, E.derived(s)); };
  function addEnergy(s, n) { s.energy = Math.min(D.ENERGY_HARD_CAP || 9999, s.energy + Math.round(n)); return Math.round(n); }

  /* ---------- тик реального времени ---------- */
  E.tick = function (s, now) {
    var t = effNow(s, now), d = E.derived(s, t), ev = [];
    // энергия
    if (s.energy >= d.maxEnergy) s.energyT = t;
    else {
      if (s.energyT > t) s.energyT = t;
      var n = Math.floor((t - s.energyT) / d.regenMs);
      if (n > 0) { var add = Math.min(n, d.maxEnergy - s.energy); s.energy += add; s.energyT += n * d.regenMs; if (s.energy >= d.maxEnergy) s.energyT = t; }
    }
    // мана
    if (s.mana >= d.maxMana) s.manaT = t;
    else {
      if (s.manaT > t) s.manaT = t;
      var m = Math.floor((t - s.manaT) / d.manaRegenMs);
      if (m > 0) { s.mana = Math.min(d.maxMana, s.mana + m); s.manaT += m * d.manaRegenMs; if (s.mana >= d.maxMana) s.manaT = t; }
    }
    // исследование
    if (s.research && t >= s.research.end) {
      s.skills[s.research.id]++; s.stats.researched++;
      ev.push({ type: 'research', id: s.research.id, lvl: s.skills[s.research.id] });
      s.research = null;
    }
    // очередь строительства (идёт и офлайн: завершения обрабатываются по порядку их времени)
    processBuilds(s, t, ev);
    // ежедневные задания и вход
    var dk = dayKey(t);
    if (!s.daily || s.daily.day !== dk) newDaily(s, t, dk);
    if (s.login.last !== dk && !s.login.pending) {
      var yesterday = dayKey(t - DAY);
      s.login.streak = (s.login.last === yesterday) ? s.login.streak + 1 : 1;
      s.login.pending = true; s.login.day = dk;
      ev.push({ type: 'login' });
    }
    // событие
    var ce = E.currentEvent(t);
    if (s.event.inst !== ce.inst) { s.event = { inst: ce.inst, items: 0, stage: 0 }; ev.push({ type: 'event', id: ce.ev.id }); queueScene(s, 'ev_' + ce.ev.id, true); }
    return ev;
  };

  function newDaily(s, t, dk) {
    var pool = D.DAILY_POOL.filter(function (q) { return !q.minLvl || q.minLvl <= s.level; });
    // детерминированный выбор по дню (не влияет на слот)
    var src = CL.makeSeededSource((dayIndex(t) * 2654435761) >>> 0), r = new CL.Rng(src), picked = [];
    while (picked.length < 3 && pool.length) { picked.push(pool.splice(r.int(pool.length), 1)[0]); }
    s.daily = { day: dk, bonus: false, quests: picked.map(function (q) {
      return { id: q.id, t: q.t(s.level), base: s.stats[q.stat] || 0, claimed: false };
    }) };
  }

  /* ---------- уровень и опыт ---------- */
  /* n — «сырой» опыт; здесь применяется общий множитель D.XP_MUL (v2: ×0,5 для всех источников). Возвращает начисленное. */
  function xpGain(n) { return Math.round(n * D.XP_MUL * 100) / 100; }
  E.xpGain = xpGain;
  function addXp(s, n, out) {
    var g = xpGain(n);
    s.xp = Math.round((s.xp + g) * 100) / 100;
    while (s.level < D.MAX_LEVEL && s.xp >= D.xpNeed(s.level)) {
      s.xp = Math.round((s.xp - D.xpNeed(s.level)) * 100) / 100; s.level++;
      if (D.LEVEL_SCENES[s.level]) queueScene(s, D.LEVEL_SCENES[s.level]);
      var d = E.derived(s);
      var rw = { energy: 15 + s.level, coinsB: 10, keys: s.level % 5 === 0 ? 2 : 0 };
      applyReward(s, rw, null, null);
      if (out) (out.levelUps = out.levelUps || []).push({ level: s.level, reward: rw });
    }
    return g;
  }
  E.addXp = addXp;

  /* ---------- карты ---------- */
  function rarityWeights(rare) {
    return [D.RARITY.C.w, D.RARITY.R.w * (1 + 2 * rare), D.RARITY.E.w * (1 + 4 * rare), D.RARITY.L.w * (1 + 6 * rare)];
  }
  E.rollCard = function (s, rng, minR, extraRare, now) {
    var d = E.derived(s, now), t = now != null ? now : s.time.high;
    var ce = E.currentEvent(t), colId;
    var evCol = D.COL_BY_ID[ce.ev.col];
    if (!s.colDone[evCol.id] && rng.chance(0.3)) colId = evCol.id;
    else colId = rng.pick(d.unlockedCols);
    var col = D.COL_BY_ID[colId];
    var ri = rng.weighted(rarityWeights(d.rare + (extraRare || 0)));
    var minI = D.RARITY_ORDER.indexOf(minR || 'C'); if (ri < minI) ri = minI;
    var r = D.RARITY_ORDER[ri];
    var pool = col.cards.filter(function (c) { return c.r === r; });
    var card = rng.pick(pool);
    return E.giveCard(s, card.id, t);
  };
  /* v0.6: «вдвое реже» — каждая карта с символов остаётся с шансом D.CARD_DROP_MUL */
  E.dropCards = function (n, rng, min) { var k = 0; for (var i = 0; i < n; i++) if (rng.chance(D.CARD_DROP_MUL)) k++; return Math.max(min || 0, k); };
  E.giveCard = function (s, id, now) {
    var isNew = !s.cards[id];
    s.cards[id] = (s.cards[id] || 0) + 1; s.stats.cardsGot++;
    var res = { id: id, isNew: isNew, completed: null };
    var col = D.COL_BY_ID[D.CARD_BY_ID[id].col];
    if (isNew && !s.colDone[col.id] && col.cards.every(function (c) { return s.cards[c.id] > 0; })) {
      s.colDone[col.id] = now || s.time.high;
      var rw = { coinsB: 100 + 20 * D.COLLECTIONS.indexOf(col), energy: 25, chest: 2 };
      res.completed = { col: col.id, reward: rw };
      applyReward(s, rw, null, null);
      queueScene(s, 'col1');
    }
    return res;
  };
  E.uniqueCards = function (s) { var n = 0; for (var k in s.cards) if (s.cards[k] > 0) n++; return n; };
  E.colProgress = function (s, colId) { var c = D.COL_BY_ID[colId]; return c.cards.filter(function (k) { return s.cards[k.id] > 0; }).length; };

  /* ---------- сундуки ---------- */
  function addChest(s, tier, d, out) {
    while (s.chests.length < d.chestSlots) s.chests.push(null);
    for (var i = 0; i < d.chestSlots; i++) if (!s.chests[i]) { s.chests[i] = { tier: tier, end: null }; return i; }
    // нет места — сундук превращается в монеты
    var got = addCoins(s, d.B * [10, 25, 60, 150][tier], d, out);
    if (out) (out.chestToCoins = out.chestToCoins || []).push({ tier: tier, coins: got });
    return -1;
  }
  E.chestMs = function (s, tier) { return D.CHESTS[tier].min * MIN * E.derived(s).chestTimeMul; };
  E.startUnlock = function (s, i, now) {
    var t = effNow(s, now), c = s.chests[i];
    if (!c || c.end) return { ok: false, reason: 'Нельзя' };
    for (var j = 0; j < s.chests.length; j++) if (s.chests[j] && s.chests[j].end && s.chests[j].end > t) return { ok: false, reason: 'Уже открывается другой сундук' };
    c.end = t + E.chestMs(s, c.tier);
    return { ok: true };
  };
  E.openChest = function (s, i, now, rng, useKeys) {
    var t = effNow(s, now), c = s.chests[i];
    if (!c) return { ok: false, reason: 'Пусто' };
    var ready = c.end && t >= c.end;
    if (!ready) {
      if (!useKeys) return { ok: false, reason: 'Сундук ещё заперт' };
      var cost = E.chestKeyCost(s, i, t);
      if (s.keys < cost) return { ok: false, reason: 'Не хватает ключей' };
      s.keys -= cost;
    }
    s.chests[i] = null;
    var out = E.chestLoot(s, c.tier, rng, t);
    s.stats.chestsOpened++;
    return { ok: true, tier: c.tier, loot: out };
  };
  E.chestKeyCost = function (s, i, now) {
    var c = s.chests[i]; if (!c) return 0;
    var base = D.CHESTS[c.tier].keys;
    if (!c.end) return base;
    var left = Math.max(0, c.end - now), total = E.chestMs(s, c.tier);
    return Math.max(left > 0 ? 1 : 0, Math.ceil(base * left / total));
  };
  E.chestLoot = function (s, tier, rng, now) {
    var ch = D.CHESTS[tier], d = E.derived(s, now), out = { cards: [] };
    out.coins = addCoins(s, d.B * rng.range(ch.coins[0], ch.coins[1]) * d.coinMul, d, out);
    out.energy = addEnergy(s, rng.range(ch.energy[0], ch.energy[1]));
    out.mana = addMana(s, rng.range(ch.mana[0], ch.mana[1]) * d.manaMul, d);
    out.keys = addKeys(s, rng.range(ch.keyR[0], ch.keyR[1]), d);
    out.seals = ch.seals; s.seals += ch.seals;
    for (var k = 0; k < ch.cards; k++) {
      // первая карта — не ниже гарантированной редкости (для мифического: легендарная с шансом 35%, иначе эпическая)
      var minR = k === 0 ? (tier === 3 ? (rng.chance(0.35) ? 'L' : 'E') : ch.minR) : 'C';
      out.cards.push(E.rollCard(s, rng, minR, 0, now));
    }
    return out;
  };

  /* ---------- универсальная выдача наград ---------- */
  function applyReward(s, rw, rng, out, now) {
    var d = E.derived(s, now), res = { cards: [] };
    if (rw.coinsB) res.coins = addCoins(s, d.B * rw.coinsB, d, res);
    if (rw.energy) res.energy = addEnergy(s, rw.energy);
    if (rw.mana) res.mana = addMana(s, rw.mana, d);
    if (rw.keys) res.keys = addKeys(s, rw.keys, d);
    if (rw.seals) { s.seals += rw.seals; res.seals = rw.seals; }
    if (rw.chest != null) { res.chest = rw.chest; addChest(s, rw.chest, d, res); }
    if (rw.cards && rng) for (var i = 0; i < rw.cards; i++) res.cards.push(E.rollCard(s, rng, 'C', 0, now));
    if (rw.eventCards && rng) {
      var col = D.COL_BY_ID[E.currentEvent(now || s.time.high).ev.col];
      for (var j = 0; j < rw.eventCards; j++) res.cards.push(E.giveCard(s, rng.pick(col.cards).id, now));
    }
    return res;
  }
  E.applyReward = applyReward;

  /* ---------- слот ---------- */
  /* Награда за набор символов (без модификаторов). Используется и игрой, и расчётом RTP. */
  E.evalLine = function (syms, bet) {
    var cnt = {}; syms.forEach(function (i) { var id = D.SYMBOLS[i].id; cnt[id] = (cnt[id] || 0) + 1; });
    var r = { coinsB: 0, energy: 0, xp: D.BASE_XP_PER_BET * bet, mana: 0, keys: 0, attack: 0, cards: 0, cardChance: D.CARD_CHANCE_BASE, chest: -1, triple: null, jackpot: false, counts: cnt };
    for (var id in cnt) {
      var n = cnt[id], p = D.PAYTABLE[id];
      if (p.coins) r.coinsB += p.coins[n] * bet;
      if (p.energy) r.energy += p.energy[n] * bet;
      if (p.xp) r.xp += p.xp[n] * bet;
      if (p.mana) r.mana += p.mana[n] * bet;
      if (p.keys) r.keys += p.keys[n];
      if (p.attack) r.attack += p.attack[n];
      if (p.cards) { r.cards += p.cards[n] + (n === 2 && bet >= 5 ? 1 : 0); if (n === 1) r.cardChance += D.CARD_CHANCE_ONE_SYMBOL; }
      if (p.chest && p.chest[n] >= 0) r.chest = p.chest[n];
      if (n === 3) { r.triple = id; if (id === 'crown') r.jackpot = true; }
    }
    return r;
  };

  E.spin = function (s, now, rng) {
    E.tick(s, now);
    var t = s.time.high, d = E.derived(s, t), bet = s.bet, act = s.spells.active;
    var free = (act.calm || 0) > 0;
    if (!free && s.energy < bet) return { ok: false, reason: 'energy' };
    if (!s.pity || s.pity.target == null) s.pity = { since: 0, target: rng.range(D.PITY.min, D.PITY.max) };
    s.pity.since++;
    var stops = [rng.int(D.STRIP.length), rng.int(D.STRIP.length), rng.int(D.STRIP.length)];
    var luckyUsed = false;
    if ((act.lucky || 0) > 0) {
      act.lucky--; var a = D.STRIP[stops[0]], b = D.STRIP[stops[1]], c = D.STRIP[stops[2]];
      if (a !== b && a !== c && b !== c) {
        var re = rng.int(D.STRIP.length), rc = D.STRIP[re];
        if (rc === a || rc === b) { stops[2] = re; luckyUsed = true; }
      }
    }
    // гарантированный джекпот: если к скрытой цели (50–80) три короны не выпали сами — выпадают сейчас
    var pityForced = false;
    if (s.pity.since >= s.pity.target && !(D.STRIP[stops[0]] === CROWN && D.STRIP[stops[1]] === CROWN && D.STRIP[stops[2]] === CROWN)) {
      stops = [CROWN_STOP, CROWN_STOP, CROWN_STOP]; pityForced = true;
    }
    var syms = stops.map(function (i) { return D.STRIP[i]; });
    var line = E.evalLine(syms, bet);
    if (line.jackpot) s.pity = { since: 0, target: rng.range(D.PITY.min, D.PITY.max) };
    var out = { ok: true, stops: stops, syms: syms, line: line, bet: bet, free: free, luckyUsed: luckyUsed, cards: [], levelUps: null, pityForced: pityForced };
    // стоимость
    if (free) act.calm--; else {
      if (s.energy >= d.maxEnergy) s.energyT = t; // таймер восстановления начинается с момента траты
      s.energy -= bet; s.stats.energySpent += bet;
    }
    // монеты
    var coinMul = d.coinMul;
    if ((act.gold || 0) > 0) { coinMul *= 2; act.gold--; out.gold = true; }
    var coins = line.coinsB * d.B * coinMul;
    if (coins > 0 && d.horse > 0 && rng.chance(d.horse)) { coins *= 2; out.horse = true; }
    out.coins = addCoins(s, coins, d, out);
    out.coinsRaw = Math.round(coins);
    s.stats.coinsWon += out.coins; if (out.coins > s.stats.bestWin) s.stats.bestWin = out.coins;
    // энергия/мана/ключи
    out.energy = line.energy ? addEnergy(s, line.energy) : 0;
    out.mana = line.mana ? addMana(s, line.mana * d.manaMul, d) : 0;
    out.keys = addKeys(s, line.keys + (d.keyChance > 0 && rng.chance(d.keyChance) ? 1 : 0), d);
    // карты
    var nCards = line.cards, extraRare = (act.seer || 0) > 0 ? 0.1 : 0;
    if (nCards > 0) nCards = E.dropCards(nCards, rng, line.triple === 'cards' ? 1 : 0);   // v0.6: ×0,5
    else if (rng.chance(line.cardChance * d.cardChanceMul)) nCards = 1;
    if ((act.collect || 0) > 0) { act.collect--; if (nCards === 0) nCards = 1; }
    if ((act.seer || 0) > 0) act.seer--;
    for (var k = 0; k < nCards; k++) out.cards.push(E.rollCard(s, rng, line.triple === 'cards' && k === 0 ? 'R' : 'C', extraRare, t));
    // сундук
    if (line.chest >= 0) { out.chest = line.chest; out.chestSlot = addChest(s, line.chest, d, out); }
    // статистика
    s.stats.spins++;
    if (line.triple) s.stats.triples++;
    if (line.jackpot) { s.stats.jackpots++; queueScene(s, 'jackpot1'); }
    // предметы события → шкала над слотом
    var ce = E.currentEvent(t), nSym = line.counts[ce.ev.sym] || 0;
    var items = bet * (D.EVENT_ITEM.perSymbol * nSym + (nSym === 3 ? D.EVENT_ITEM.triple : 0) + (rng.chance(D.EVENT_ITEM.flat) ? 1 : 0));
    out.eventItems = items; out.eventStages = addEventItems(s, items, rng, t);
    // опыт (в конце, т.к. может повысить уровень); ×0,5 применяется внутри addXp
    var xpMul = d.xpMul * ((act.insight || 0) > 0 ? 3 : 1); if ((act.insight || 0) > 0) act.insight--;
    out.xp = addXp(s, line.xp * xpMul, out);
    for (var sp in act) if (act[sp] <= 0) delete act[sp];
    return out;
  };

  E.betOptions = function (s) { return D.BETS.filter(function (b) { return b.lvl <= s.level; }).map(function (b) { return b.x; }); };
  E.setBet = function (s, x) { if (E.betOptions(s).indexOf(x) >= 0) s.bet = x; return s.bet; };

  /* Точные ожидаемые значения таблицы выплат: полный перебор 32^3 = 32768 исходов. */
  E.paytableStats = function () {
    var N = D.STRIP.length, total = 0, acc = { coinsB: 0, energy: 0, xp: 0, mana: 0, keys: 0, cards: 0, triples: 0, jackpot: 0, chest0: 0, chest2: 0, anyWin: 0 };
    for (var a = 0; a < N; a++) for (var b = 0; b < N; b++) for (var c = 0; c < N; c++) {
      var r = E.evalLine([D.STRIP[a], D.STRIP[b], D.STRIP[c]], 1);
      acc.coinsB += r.coinsB; acc.energy += r.energy; acc.xp += r.xp; acc.mana += r.mana; acc.keys += r.keys;
      acc.cards += r.cards * D.CARD_DROP_MUL + (r.triple === 'cards' ? Math.pow(1 - D.CARD_DROP_MUL, r.cards) : 0) + (r.cards === 0 ? r.cardChance : 0);
      if (r.triple) acc.triples++; if (r.jackpot) acc.jackpot++;
      if (r.chest === 0) acc.chest0++; if (r.chest === 2) acc.chest2++;
      if (r.coinsB > 0) acc.anyWin++;
      total++;
    }
    var o = {}; for (var k in acc) o[k] = acc[k] / total; o.outcomes = total;
    /* С учётом гарантии джекпота: цикл между джекпотами длиной L (≤ T, T равномерно в [50,80]).
       Все вращения цикла, кроме последнего, — обычные исходы при условии «не джекпот»; последнее — джекпот. */
    var pJ = o.jackpot, J = D.PAYTABLE.crown.coins[3], nT = D.PITY.max - D.PITY.min + 1, EL = 0;
    for (var T = D.PITY.min; T <= D.PITY.max; T++) { var sum = 0; for (var i = 0; i < T; i++) sum += Math.pow(1 - pJ, i); EL += sum / nT; }
    var evNJ = (o.coinsB - pJ * J) / (1 - pJ), enJ = D.PAYTABLE.crown.energy ? 0 : 0;
    o.cycle = EL; o.jackpotRate = 1 / EL;
    o.coinsPity = ((EL - 1) * evNJ + J) / EL;
    o.coinsNoJackpot = evNJ;
    o.triplesPity = ((EL - 1) * (o.triples - pJ) / (1 - pJ) + 1) / EL;
    return o;
  };
  /* Ожидаемые предметы события за вращение на 1 ставки и энергия со шкалы за полный проход 10 этапов. */
  E.eventItemStats = function (symId) {
    var c = D.STRIP_COUNTS[symId] / D.STRIP.length, ei = D.EVENT_ITEM;
    var perSpin = 3 * c * ei.perSymbol + c * c * c * ei.triple + ei.flat;
    var need = 0, energy = 0; D.EVENT_BAR.forEach(function (b) { need += b.need; energy += b.reward.energy || 0; });
    return { perSpin: perSpin, spinsFullBar: need / perSpin, energyFullBar: energy, energyReturn: energy / (need / perSpin),
             loopEnergyReturn: D.EVENT_BAR_LOOP.reward.energy / (D.EVENT_BAR_LOOP.need / perSpin) };
  };

  /* ---------- постройки и очередь строительства (v2) ---------- */
  /* Заказ: { id, to, cost, ms, start|null, end|null }. Оплата сразу при постановке в очередь.
     Одновременно строится не больше d.builders заказов; остальные ждут. Ждущий заказ стартует, когда
     есть свободный строитель и выполнены условия (предыдущий уровень этой постройки готов, Цитадель позволяет).
     Время завершения фиксируется при старте → очередь честно продолжается офлайн. */
  E.plannedLevel = function (s, id) { var n = s.bld[id]; (s.builds || []).forEach(function (j) { if (j.id === id) n = Math.max(n, j.to); }); return n; };
  E.buildingCap = function (s, id) {
    if (id === 'citadel') return D.BLD_MAX;
    return Math.min(D.BLD_MAX, E.plannedLevel(s, 'citadel') + 1);
  };
  E.canUpgrade = function (s, id) {
    var b = D.BLD_BY_ID[id];
    if (!b) return { ok: false, reason: 'Нет такой постройки' };
    var d = E.derived(s), target = E.plannedLevel(s, id) + 1;
    if (s.level < b.unlock) return { ok: false, reason: 'Откроется на ' + b.unlock + ' уровне' };
    if (target > D.BLD_MAX) return { ok: false, reason: 'Максимальный уровень' };
    if (target > E.buildingCap(s, id)) return { ok: false, reason: 'Сначала улучшите Цитадель' };
    if (id === 'citadel' && s.level < D.citadelReqLevel(target)) return { ok: false, reason: 'Нужен ' + D.citadelReqLevel(target) + ' уровень игрока' };
    if ((s.builds || []).length >= D.BUILD_QUEUE_MAX) return { ok: false, reason: 'Очередь стройки заполнена', full: true };
    var cost = D.buildCost(id, target);
    if (s.coins < cost) return { ok: false, reason: 'Не хватает монет', cost: cost, target: target };
    return { ok: true, cost: cost, target: target, ms: D.buildMinutes(target) * MIN * d.buildMul };
  };
  function jobStartable(s, j) {
    if (s.bld[j.id] !== j.to - 1) return false;
    if (j.id !== 'citadel' && j.to > s.bld.citadel + 1) return false;
    return true;
  }
  function startWaiting(s, at) {
    var busy = s.builds.filter(function (j) { return j.start != null; }).length, cap = D.builders(s.bld.citadel);
    for (var i = 0; i < s.builds.length && busy < cap; i++) {
      var j = s.builds[i];
      if (j.start == null && jobStartable(s, j)) { j.start = at; j.end = at + j.ms; busy++; }
    }
  }
  function processBuilds(s, t, ev) {
    if (!s.builds) s.builds = [];
    for (var guard = 0; guard < 100; guard++) {
      var next = null;
      s.builds.forEach(function (j) { if (j.start != null && j.end <= t && (!next || j.end < next.end)) next = j; });
      if (!next) break;
      s.builds.splice(s.builds.indexOf(next), 1);
      s.bld[next.id] = next.to; s.stats.upgrades++;
      if (next.id === 'treasury' && next.to === 1) s.treasuryT = next.end;
      var o = { type: 'build', id: next.id, lvl: next.to, at: next.end };
      o.xp = addXp(s, 20 * next.to + 10 * s.level, o);
      if (next.id === 'warehouse' && next.to === 2) queueScene(s, 'wh2');
      if (next.id === 'citadel' && next.to === 3) queueScene(s, 'builder2');
      if (next.id === 'citadel' && next.to === 6) queueScene(s, 'builder3');
      if (ev) ev.push(o);
      startWaiting(s, next.end);
    }
    startWaiting(s, t);
  }
  E.processBuilds = processBuilds;
  /* Поставить улучшение в очередь (имя сохранено с v1). */
  E.upgrade = function (s, id, now) {
    var ev = E.tick(s, now);
    var c = E.canUpgrade(s, id); if (!c.ok) return c;
    s.coins -= c.cost;
    var job = { id: id, to: c.target, cost: c.cost, ms: c.ms, start: null, end: null };
    s.builds.push(job);
    startWaiting(s, s.time.high);
    queueScene(s, 'build1');
    var done = []; processBuilds(s, s.time.high, done); // мгновенные (0 мс) не бывают, но на всякий случай
    return { ok: true, id: id, to: c.target, cost: c.cost, ms: c.ms, started: job.start != null, end: job.end, ev: ev.concat(done) };
  };
  E.buildSkipCost = function (s, j, now) { if (!j || j.start == null) return 0; return Math.max(1, Math.ceil((j.end - now) / (D.BUILD_SKIP_MIN * MIN))); };
  E.skipBuild = function (s, idx, now) {
    E.tick(s, now); var j = s.builds[idx];
    if (!j || j.start == null) return { ok: false, reason: 'Стройка ещё не началась' };
    var k = E.buildSkipCost(s, j, s.time.high); if (s.keys < k) return { ok: false, reason: 'Не хватает ключей' };
    s.keys -= k; j.end = s.time.high; var ev = []; processBuilds(s, s.time.high, ev);
    return { ok: true, keys: k, ev: ev };
  };
  /* Отменить ждущий (ещё не начатый) заказ — монеты возвращаются полностью. */
  E.cancelBuild = function (s, idx, now) {
    E.tick(s, now); var j = s.builds[idx];
    if (!j || j.start != null) return { ok: false, reason: 'Начатую стройку отменить нельзя' };
    // нельзя отменить, если после него в очереди есть следующий уровень той же постройки
    if (s.builds.some(function (x) { return x.id === j.id && x.to > j.to; })) return { ok: false, reason: 'Сначала отмените следующий уровень' };
    s.builds.splice(idx, 1); var d = E.derived(s); var got = addCoins(s, j.cost, d, null);
    return { ok: true, coins: got };
  };

  /* ---------- заклинания ---------- */
  E.spellState = function (s, id, now) {
    var sp = D.SPELL_BY_ID[id], t = now != null ? Math.max(now, s.time.high) : s.time.high;
    var unlocked = s.bld.tower >= sp.tower, cdLeft = Math.max(0, (s.spells.cd[id] || 0) - t);
    return { unlocked: unlocked, cdLeft: cdLeft, canCast: unlocked && cdLeft === 0 && s.mana >= sp.mana, active: s.spells.active[id] || 0 };
  };
  E.spellN = function (s, id) { var sp = D.SPELL_BY_ID[id]; return ['guard', 'phoenix', 'rewind'].indexOf(id) >= 0 ? sp.n : Math.round(sp.n * E.derived(s).spellPower); };
  E.cast = function (s, id, now, rng) {
    E.tick(s, now);
    var t = s.time.high, sp = D.SPELL_BY_ID[id], st = E.spellState(s, id, t), d = E.derived(s, t);
    if (!st.unlocked) return { ok: false, reason: 'Нужна Башня архимага ' + sp.tower + ' ур.' };
    if (st.cdLeft > 0) return { ok: false, reason: 'Перезарядка' };
    if (s.mana < sp.mana) return { ok: false, reason: 'Не хватает маны' };
    s.mana -= sp.mana; s.spells.cd[id] = t + sp.cd * MIN * d.spellCdMul; s.stats.spellsCast++;
    var n = E.spellN(s, id), out = { ok: true, id: id, n: n };
    if (id === 'guard') out.reward = applyReward(s, { chest: 1 }, rng, null, t);
    else if (id === 'phoenix') out.energy = addEnergy(s, n);
    else if (id === 'rewind') {
      var ms = n * MIN;
      s.chests.forEach(function (c) { if (c && c.end) c.end -= ms; });
      if (s.research) s.research.end -= ms;
      (s.builds || []).forEach(function (j) { if (j.start != null) { j.end -= ms; j.start -= ms; } });
      out.ev = [];
      out.ev = E.tick(s, now);
    } else s.spells.active[id] = (s.spells.active[id] || 0) + n;
    return out;
  };

  /* ---------- навыки ---------- */
  E.canResearch = function (s, id) {
    var d = E.derived(s), lvl = s.skills[id], target = lvl + 1;
    if (s.bld.library < 1) return { ok: false, reason: 'Постройте Библиотеку' };
    if (s.research) return { ok: false, reason: 'Уже идёт исследование' };
    if (target > D.SKILL_MAX) return { ok: false, reason: 'Изучено полностью' };
    if (target > d.skillCap) return { ok: false, reason: 'Нужна Библиотека ' + (target * 2 - 1) + ' ур.' };
    var cost = D.skillCost(id, target);
    if (s.coins < cost) return { ok: false, reason: 'Не хватает монет', cost: cost };
    return { ok: true, cost: cost, ms: D.skillMinutes(target) * MIN * d.researchMul };
  };
  E.research = function (s, id, now) {
    E.tick(s, now);
    var c = E.canResearch(s, id); if (!c.ok) return c;
    s.coins -= c.cost; s.research = { id: id, end: s.time.high + c.ms, total: c.ms };
    return { ok: true, id: id, ms: c.ms };
  };
  E.researchSkipCost = function (s, now) { if (!s.research) return 0; return Math.max(1, Math.ceil((s.research.end - now) / (20 * MIN))); }; // 1 ключ за 20 мин
  E.skipResearch = function (s, now) {
    E.tick(s, now); if (!s.research) return { ok: false };
    var k = E.researchSkipCost(s, s.time.high); if (s.keys < k) return { ok: false, reason: 'Не хватает ключей' };
    s.keys -= k; s.research.end = s.time.high; var ev = E.tick(s, now); return { ok: true, keys: k, ev: ev };
  };

  /* ---------- рынок ---------- */
  E.duplicateValue = function (s) {
    var d = E.derived(s), sum = 0;
    for (var id in s.cards) if (s.cards[id] > 1) sum += (s.cards[id] - 1) * D.RARITY[D.CARD_BY_ID[id].r].seal;
    return Math.floor(sum * d.sealMul);
  };
  E.sellDuplicates = function (s) {
    if (s.bld.market < 1) return { ok: false, reason: 'Постройте Рынок' };
    var v = E.duplicateValue(s), n = 0;
    for (var id in s.cards) if (s.cards[id] > 1) { n += s.cards[id] - 1; s.cards[id] = 1; }
    s.seals += v; return { ok: true, seals: v, cards: n };
  };
  E.marketPrice = function (s, item) { return Math.ceil(item.seals * E.derived(s).priceMul); };
  E.buy = function (s, itemId, rng, now) {
    var it = D.MARKET.filter(function (m) { return m.id === itemId; })[0];
    if (!it) return { ok: false };
    if (s.bld.market < it.lvl) return { ok: false, reason: 'Нужен Рынок ' + it.lvl + ' ур.' };
    if (it.keys && !it.chest && !it.energy && !it.mana && s.keys >= E.derived(s).maxKeys) return { ok: false, reason: 'Связка ключей полна — улучшите Склад' };
    var p = E.marketPrice(s, it); if (s.seals < p) return { ok: false, reason: 'Не хватает печатей' };
    s.seals -= p; var d = E.derived(s);
    var out = { ok: true, price: p };
    if (it.chest != null) out.slot = addChest(s, it.chest, d, out);
    if (it.energy) addEnergy(s, it.energy);
    if (it.mana) addMana(s, it.mana, d);
    if (it.keys) out.keys = addKeys(s, it.keys, d);
    return out;
  };
  E.cardPrice = function (s, id) { return Math.ceil(D.RARITY[D.CARD_BY_ID[id].r].price * E.derived(s).priceMul); };
  E.buyCard = function (s, id, now) {
    if (s.bld.market < D.MARKET_PICK_LVL) return { ok: false, reason: 'Нужен Рынок ' + D.MARKET_PICK_LVL + ' ур.' };
    var card = D.CARD_BY_ID[id], col = D.COL_BY_ID[card.col];
    if (s.cards[id]) return { ok: false, reason: 'Карта уже есть' };
    if (col.event) { if (E.currentEvent(now || s.time.high).ev.col !== col.id) return { ok: false, reason: 'Только во время события' }; }
    else if (col.unlock > s.level) return { ok: false, reason: 'Коллекция ещё закрыта' };
    var p = E.cardPrice(s, id); if (s.seals < p) return { ok: false, reason: 'Не хватает печатей' };
    s.seals -= p; var r = E.giveCard(s, id, now); r.ok = true; r.price = p; return r;
  };

  /* ---------- казна и кузница ---------- */
  E.treasuryAmount = function (s, now) {
    var d = E.derived(s), t = Math.max(now || 0, s.time.high);
    if (s.bld.treasury < 1) return 0;
    var ms = Math.min(d.treasuryCapH * HOUR, Math.max(0, t - s.treasuryT));
    return Math.floor(d.treasuryRate * ms / HOUR);
  };
  E.collectTreasury = function (s, now) {
    E.tick(s, now); var amt = E.treasuryAmount(s, s.time.high);
    if (amt <= 0) return { ok: false, reason: 'Пока пусто' };
    var d = E.derived(s), got = addCoins(s, amt, d, null);
    s.treasuryT = s.time.high; s.stats.treasuryCollects++;
    return { ok: true, coins: got, lost: amt - got };
  };
  E.craftKey = function (s) {
    if (s.bld.forge < 1) return { ok: false, reason: 'Постройте Кузницу' };
    var p = E.derived(s).keyPrice; if (s.coins < p) return { ok: false, reason: 'Не хватает монет' };
    s.coins -= p; s.keys++; return { ok: true, price: p };
  };

  /* ---------- задания, вход, события, сюжет, достижения ---------- */
  function statValue(s, stat) {
    if (stat === 'uniqueCards') return E.uniqueCards(s);
    if (stat === 'colsDone') return Object.keys(s.colDone).filter(function (id) { return !D.COL_BY_ID[id].event; }).length;
    if (stat === 'level') return s.level;
    if (stat === 'chapter') return s.story.finished ? 11 : s.story.ch;
    return s.stats[stat] || 0;
  }
  E.statValue = statValue;
  E.dailyProgress = function (s, q) { var p = D.DAILY_POOL.filter(function (x) { return x.id === q.id; })[0]; return Math.min(q.t, (s.stats[p.stat] || 0) - q.base); };
  E.claimDaily = function (s, i, rng, now) {
    var q = s.daily.quests[i]; if (!q || q.claimed) return { ok: false };
    if (E.dailyProgress(s, q) < q.t) return { ok: false, reason: 'Ещё не выполнено' };
    q.claimed = true; var tpl = D.DAILY_POOL.filter(function (x) { return x.id === q.id; })[0];
    return { ok: true, reward: applyReward(s, tpl.reward, rng, null, now) };
  };
  E.claimDailyBonus = function (s, rng, now) {
    if (s.daily.bonus || !s.daily.quests.every(function (q) { return q.claimed; })) return { ok: false };
    s.daily.bonus = true; return { ok: true, reward: applyReward(s, D.DAILY_BONUS, rng, null, now) };
  };
  E.claimLogin = function (s, rng, now) {
    if (!s.login.pending) return { ok: false };
    var day = (s.login.streak - 1) % 7, rw = D.LOGIN[day];
    s.login.pending = false; s.login.last = s.login.day;
    return { ok: true, day: day + 1, reward: applyReward(s, rw, rng, null, now) };
  };
  /* ---------- шкала события (v2) ---------- */
  E.barStage = function (stage) { return stage < D.EVENT_BAR.length ? D.EVENT_BAR[stage] : D.EVENT_BAR_LOOP; };
  E.eventBar = function (s) { var st = E.barStage(s.event.stage); return { stage: s.event.stage, items: s.event.items, need: st.need, reward: st.reward, loop: s.event.stage >= D.EVENT_BAR.length }; };
  function addEventItems(s, n, rng, now) {
    var res = []; if (!(n > 0)) return res;
    s.event.items += n;
    for (var g = 0; g < 50; g++) {
      var st = E.barStage(s.event.stage); if (s.event.items < st.need) break;
      s.event.items -= st.need; var stageNo = s.event.stage + 1; s.event.stage++; s.stats.eventStages++;
      res.push({ stage: stageNo, reward: st.reward, got: applyReward(s, st.reward, rng, null, now) });
    }
    return res;
  }
  E.addEventItems = addEventItems;

  /* ---------- катсцены (v2) ---------- */
  function queueScene(s, id, repeat) {
    if (!s.scenes) s.scenes = { seen: {}, queue: [], active: null };
    if (!repeat && s.scenes.seen[id]) return false;
    if (s.scenes.queue.indexOf(id) >= 0) return false;
    if (!E.sceneData(id)) return false;
    s.scenes.queue.push(id); return true;
  }
  E.queueScene = queueScene;
  E.sceneData = function (id) {
    var m = /^(ch|out)_(\d+)$/.exec(id);
    if (m) {
      var ch = D.CHAPTERS[+m[2] - 1]; if (!ch) return null;
      if (m[1] === 'ch') return { img: ch.img, kicker: 'Глава ' + ch.n, title: ch.title, lines: ch.lines };
      return D.CHAPTER_OUTRO[ch.n] ? { img: ch.img, kicker: 'Глава ' + ch.n + ' · финал', title: ch.title, lines: D.CHAPTER_OUTRO[ch.n] } : null;
    }
    return D.SCENES[id] || null;
  };
  /* UI берёт следующую сцену из очереди; выбор в ней даст награду (один раз). */
  E.takeScene = function (s) {
    if (!s.scenes || !s.scenes.queue.length) return null;
    var id = s.scenes.queue.shift(); s.scenes.seen[id] = (s.scenes.seen[id] || 0) + 1; s.scenes.active = id;
    var m = /^ch_(\d+)$/.exec(id); if (m && s.story.seen < +m[1]) s.story.seen = +m[1];
    return id;
  };
  E.sceneChoice = function (s, id, idx, rng, now) {
    var sc = E.sceneData(id); if (!sc || !s.scenes || s.scenes.active !== id) return { ok: false };
    var ch = null; sc.lines.forEach(function (l) { if (l && l.choice) ch = l.choice; });
    var opt = ch && ch[idx]; s.scenes.active = null; if (!opt) return { ok: false };
    return { ok: true, reward: opt.reward ? applyReward(s, opt.reward, rng, null, now) : null };
  };
  E.endScene = function (s) { if (s.scenes) s.scenes.active = null; };
  E.chapter = function (s) { return D.CHAPTERS[s.story.ch - 1] || null; };
  E.objProgress = function (s, o) {
    if (o.type === 'rel') return Math.min(o.t, (s.stats[o.stat] || 0) - (s.story.base[o.stat] || 0));
    if (o.type === 'bld') return Math.min(o.t, s.bld[o.id]);
    if (o.type === 'level') return Math.min(o.t, s.level);
    if (o.type === 'cols') return Math.min(o.t, statValue(s, 'colsDone'));
    return 0;
  };
  E.chapterDone = function (s) { var c = E.chapter(s); return !!c && c.obj.every(function (o) { return E.objProgress(s, o) >= o.t; }); };
  E.completeChapter = function (s, rng, now) {
    if (s.story.finished || !E.chapterDone(s)) return { ok: false };
    var c = E.chapter(s), r = applyReward(s, c.reward, rng, null, now);
    queueScene(s, 'out_' + c.n);
    if (s.story.ch >= D.CHAPTERS.length) { s.story.finished = true; queueScene(s, 'epilogue'); }
    else { s.story.ch++; s.story.base = snapshotStats(s); queueScene(s, 'ch_' + s.story.ch); }
    return { ok: true, reward: r, next: s.story.finished ? null : s.story.ch };
  };
  E.achState = function (s, a) { var v = statValue(s, a.stat); return { v: Math.min(v, a.t), done: v >= a.t, claimed: !!s.ach[a.id] }; };
  E.claimAch = function (s, id, rng, now) {
    var a = D.ACHIEVEMENTS.filter(function (x) { return x.id === id; })[0]; if (!a) return { ok: false };
    var st = E.achState(s, a); if (!st.done || st.claimed) return { ok: false };
    s.ach[id] = true; return { ok: true, reward: applyReward(s, a.reward, rng, null, now) };
  };
  E.notifications = function (s, now) {
    var n = { quests: 0, castle: 0, events: 0, cards: 0 };
    if (s.daily) s.daily.quests.forEach(function (q) { if (!q.claimed && E.dailyProgress(s, q) >= q.t) n.quests++; });
    if (s.daily && !s.daily.bonus && s.daily.quests.every(function (q) { return q.claimed; })) n.quests++;
    D.ACHIEVEMENTS.forEach(function (a) { var st = E.achState(s, a); if (st.done && !st.claimed) n.quests++; });
    if (E.chapterDone(s) && !s.story.finished) n.quests++;
    if (s.login.pending) n.quests++;
    var busy = (s.builds || []).filter(function (j) { return j.start != null; }).length;
    if (busy < E.derived(s).builders) D.BUILDINGS.forEach(function (b) { if (E.canUpgrade(s, b.id).ok) n.castle++; });
    if (E.treasuryAmount(s, now) > 0 && E.treasuryAmount(s, now) >= E.derived(s).treasuryRate) n.castle++;
    return n;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
