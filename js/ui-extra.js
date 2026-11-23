/* Замок удачи 0.6 (бета), часть 2 — интерфейс: дневной сбор, мини-игры (Поиск, Бегущий ворон, Магический сапёр),
   мини-лавка, набеги на соседей и журнал, цепочки заданий глав. Использует помощники window.CLUI из ui.js. */
(function () {
  var U = window.CLUI, CL = window.CL, D = CL.Data, E = CL.Engine, X = CL.Extra;
  if (!U || !X) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function st() { return U.state; }
  function icon(k) { return { energy: U.IC.energy, coinsB: U.IC.coin, coins: U.IC.coin, mana: U.IC.mana, keys: U.IC.key, seals: U.IC.seal, shield: 'img/sym/7.webp' }[k] || U.IC.chest; }
  function rwShort(rw) {
    if (rw.energy) return '<img src="' + U.IC.energy + '">+' + U.fmtK(rw.energy);
    if (rw.chest != null) return '<img src="' + D.CHESTS[rw.chest].img + '">';
    if (rw.keys) return '<img src="' + U.IC.key + '">+' + rw.keys;
    if (rw.coinsB) return '<img src="' + U.IC.coin + '">';
    return '';
  }
  function ago(t) { var d = U.now() - t; return d < 60000 ? 'только что' : U.fmtTime(d) + ' назад'; }
  function rewardText(r) {
    var p = []; if (!r) return '';
    if (r.coins) p.push('+' + U.fmt(r.coins) + ' монет'); if (r.energy) p.push('+' + U.fmt(r.energy) + ' энергии'); if (r.mana) p.push('+' + r.mana + ' маны');
    if (r.keys) p.push('+' + r.keys + ' ' + U.plural(r.keys, 'ключ', 'ключа', 'ключей')); if (r.seals) p.push('+' + r.seals + ' печатей'); if (r.shield) p.push('+' + r.shield + ' щит');
    if (r.chest != null) p.push(D.CHESTS[r.chest].name.toLowerCase());
    return p.join(', ');
  }
  function after() { U.updateTop(); U.save(); }

  /* ================= дневной сбор над Колесом ================= */
  function slotBarHTML() {
    return '<div class="dbar" id="dbar"><div class="ico"><img id="dbIco" src="' + X.dailyItem(U.now()).img + '" alt=""></div><div class="grow"><div class="small dbt" id="dbTitle"></div>' +
      '<div class="trk"><i id="dbFill"></i><span id="dbTxt"></span></div></div><div class="erw" id="dbRw"></div></div>';
  }
  function updateSlot() {
    if (!$('#dbFill')) return;
    var b = X.dailyBar(st(), U.now());
    $('#dbIco').src = b.item.img;
    $('#dbTitle').innerHTML = '<b>' + b.item.name + '</b> · сбор дня' + (b.done ? '' : ' · этап ' + (b.got + 1) + ' из ' + D.DAILY_MILES.length);
    var need = b.done ? b.n : b.next.need, w = b.done ? 100 : (b.n - b.prev) / (b.next.need - b.prev) * 100;
    $('#dbFill').style.width = Math.max(0, Math.min(100, w)).toFixed(1) + '%';
    $('#dbTxt').textContent = U.fmtK(b.n) + ' / ' + U.fmtK(need);
    $('#dbRw').innerHTML = b.done ? '✓' : rwShort(b.next.rw);
    var mb = $('[data-act="miniMenu"] .b2'), m = X.mini(st(), U.now()); if (mb) { mb.textContent = m.search + m.sweep; mb.classList.toggle('hidden', !(m.search + m.sweep)); }
    var rb = $('[data-act="raids"] .b2'); if (rb) { var n = X.raidOpen(st()) ? st().raid.charges : 0; rb.textContent = n; rb.classList.toggle('hidden', !n); }
  }
  function slotButtonsHTML() {
    return '<div class="row" style="margin-top:8px"><button class="btn sec sm grow" data-act="miniMenu">🎮 Мини-игры <span class="b2 hidden">0</span></button>' +
      '<button class="btn sec sm grow" data-act="raids">⚔ Набеги <span class="b2 hidden">0</span></button></div>';
  }
  function afterSpin(r, onSlot) {
    if (r.dailyItems && onSlot) { var bar = $('#dbar'); if (bar) { var f = document.createElement('span'); f.className = 'dfloat'; f.textContent = '+' + r.dailyItems; bar.appendChild(f); setTimeout(function () { f.remove(); }, 1100); } }
    (r.dailyMiles || []).forEach(function (m) {
      var bar = $('#dbar'); if (bar) { bar.classList.remove('burst'); void bar.offsetWidth; bar.classList.add('burst'); }
      U.toast('Сбор дня: ' + U.fmt(m.need) + ' — ' + rewardText(m.res), X.dailyItem(U.now()).img); U.S.win();
    });
    if (r.swordLocked) U.toast('⚔ Мечи! Атаки на соседей откроются на ' + D.RAID.unlock + ' уровне.', 'img/sym/9.webp');
    if (r.swordCoins) U.toast('⚔ Атак уже ' + D.RAID.maxCharges + ' — лишние мечи переплавлены в +' + U.fmt(r.swordCoins) + ' монет', 'img/sym/9.webp');
    if (r.swordAttack && onSlot) {   // как в «Монеточке»: мечи сразу ведут к выбору цели
      U.setAuto(false); U.S.win(); U.toast(r.swordAttack > 1 ? '⚔⚔ Три меча — две атаки!' : '⚔ Два меча — атака!', 'img/sym/9.webp');
      setTimeout(function () { if (!document.querySelector('.mg') && !U.modalCount()) chooseScreen(); }, 900);
    }
    if (r.raidShield) U.toast('🛡 Новый щит — теперь набег соседа отскочит.', 'img/sym/7.webp');
    updateSlot();
  }
  function onTickEvent(ev) {
    if (ev.type !== 'npcRaid') return;
    var e = ev.entry, rv = D.RIVAL_BY_ID[e.rival];
    U.toast(e.blocked ? '🛡 ' + D.CHARS[rv.who].name + ' напал, но щит выдержал!' : '⚔ ' + D.g(rv.hit) + ' Можно отомстить в «Набегах».', D.CHARS[rv.who].img);
  }

  /* ================= набеги ================= */
  var rtab = 'rivals';
  function raidsHTML() {
    var s = st(), r = s.raid;
    if (!X.raidOpen(s)) return '<p class="muted">Набеги откроются на ' + D.RAID.unlock + ' уровне. Соседи пока присматриваются к вашему замку.</p>';
    var h = '<div class="rvhud"><span class="pill">⚔ ' + r.charges + '/' + D.RAID.maxCharges + '</span><span class="pill">🛡 ' + r.shields + '/' + D.RAID.maxShields + '</span>' +
      '<span class="small muted"><img src="img/sym/9.webp" style="width:16px;vertical-align:-3px;border-radius:4px"> 2 меча на барабанах — атака, 3 — две; щит — каждые ' + D.RAID.shieldEvery + ' вращений</span></div>'; if (r.charges) h += '<button class="btn green" style="width:100%;margin:6px 0" data-act="rChoose">⚔ Атаковать соседа (' + r.charges + ')</button>';
    var dmg = Object.keys(r.dmg);
    if (dmg.length) h += '<div class="card warn"><b>Повреждено набегами:</b>' + dmg.map(function (id) { return '<div class="row" style="margin-top:6px"><img src="' + D.BLD_BY_ID[id].img + '" style="width:40px;height:40px;object-fit:contain"><span class="grow">' + D.BLD_BY_ID[id].name + '</span><button class="btn green sm" data-act="xRepair" data-id="' + id + '">Починить · ' + U.fmtK(X.repairCost(s)) + '</button></div>'; }).join('') + '</div>';
    h += '<div class="tabs"><button data-act="rTab" data-t="rivals" class="' + (rtab === 'rivals' ? 'on' : '') + '">Соседи</button><button data-act="rTab" data-t="log" class="' + (rtab === 'log' ? 'on' : '') + '">Журнал</button></div>';
    if (rtab === 'rivals') h += D.RIVALS.map(function (rv) {
      var c = D.CHARS[rv.who], R = X.rival(s, rv.id, U.now());
      return '<div class="rv"><img src="' + c.img + '" alt=""><div class="grow"><b>' + c.name + '</b><div class="small muted">' + rv.village + '</div><div class="small">🏰 ур. ' + R.lvl + ' · <img src="' + U.IC.coin + '" style="width:14px;vertical-align:-2px"> ' + U.fmtK(R.coins) + ' · ' + (R.shield ? '🛡 щит' : '<span class="ok">без щита</span>') + '</div></div><button class="btn sm ' + (r.charges ? 'green' : 'sec') + '" data-act="rAttack" data-id="' + rv.id + '">⚔ Атака</button></div>';
    }).join('');
    else h += r.log.length ? r.log.map(function (e) {
      var c = D.CHARS[D.RIVAL_BY_ID[e.rival].who], txt;
      if (e.dir === 'out') txt = e.blocked ? 'Атака на ' + c.name + ': щит соседа принял удар' : (e.revenge ? 'Месть! ' : '') + 'Атака на ' + c.name + ': ' + (e.steal ? '+' + U.fmt(e.coins) + ' монет' : (e.hit && !e.destroyed ? 'удар по «' : 'разрушено «') + D.BLD_BY_ID[e.bld].name + '», +' + U.fmt(e.coins) + ' монет');
      else txt = c.name + (e.blocked ? ' напал — щит выдержал' : e.steal ? ' украл ' + U.fmt(e.coins) + ' монет' : ' повредил «' + D.BLD_BY_ID[e.dmg].name + '»');
      var rev = e.dir === 'in' && !e.blocked && !e.revenged ? '<button class="btn green sm" data-act="rAttack" data-id="' + e.rival + '" data-rev="' + e.id + '">Отомстить</button>' : '';
      return '<div class="rv log ' + e.dir + '"><img src="' + c.img + '" alt=""><div class="grow"><div class="small">' + (e.dir === 'in' ? '⬅ ' : '➡ ') + txt + '</div><div class="small muted">' + ago(e.t) + '</div></div>' + rev + '</div>';
    }).join('') : '<p class="muted">Пока тихо. Подозрительно тихо.</p>';
    return h;
  }
  /* ---- 0.6.1: атака как в «Монеточке» — выбор соседа, затем его деревня и удар по постройке ---- */
  function grudge(id) { return st().raid.log.filter(function (e) { return e.dir === 'in' && !e.blocked && !e.revenged && e.rival === id; })[0]; }
  function chooseScreen() {
    var s = st(); if (!X.raidOpen(s)) { U.toast('Атаки откроются на ' + D.RAID.unlock + ' уровне'); return; }
    var el = overlay('mg-atk', '<div class="mg-top"><b>⚔ Атака! Кого навестим?</b><span class="pill">⚔ ' + s.raid.charges + '</span><button class="btn sec sm" data-x="quit">Позже</button></div>' +
      '<p class="small atk-sub">Выберите соседа. Богатая казна — богаче добыча; щит примет первый удар на себя.</p><div class="atk-list">' +
      D.RIVALS.map(function (rv) {
        var c = D.CHARS[rv.who], R = X.rival(s, rv.id, U.now()), g = grudge(rv.id);
        return '<button class="atk-card" data-id="' + rv.id + '"' + (g ? ' data-rev="' + g.id + '"' : '') + '><img src="' + c.img + '" alt=""><div class="grow"><b>' + c.name + '</b>' + (g ? ' <span class="atk-tag">обидчик · месть ×1,5</span>' : '') +
          '<div class="small muted">' + rv.village + '</div><div class="atk-stats"><span>🏰 ур. ' + R.lvl + '</span><span><img src="' + U.IC.coin + '"> ' + U.fmtK(R.coins) + '</span><span class="' + (R.shield ? 'sh' : 'nosh') + '">' + (R.shield ? '🛡 щит поднят' : 'без щита') + '</span></div>' +
          '<div class="atk-hp">' + R.hp.map(function (h) { return '<i class="h' + h + '"></i>'; }).join('') + '</div></div></button>';
      }).join('') + '</div>');
    el.addEventListener('click', function (e) {
      if (e.target.dataset.x === 'quit') { el.remove(); updateSlot(); return; }
      var b = e.target.closest('.atk-card'); if (b) { el.remove(); villageScreen(b.dataset.id, b.dataset.rev != null ? +b.dataset.rev : null); }
    });
  }
  function tier(l) { return l < 6 ? 1 : l < 12 ? 2 : 3; }
  var SPOTS = [[27, 34], [73, 34], [27, 72], [73, 72]];
  function villageScreen(id, rev) {
    var s = st(), rv = D.RIVAL_BY_ID[id], c = D.CHARS[rv.who], R = X.rival(s, id, U.now()), busy = false;
    if (rev == null && s.raid.charges <= 0) { U.toast('Нет атак — выбейте два меча на барабанах', 'img/sym/9.webp'); return; }
    var el = overlay('mg-atk', '');
    function draw() {
      var shield = R.shield && rev == null;
      el.innerHTML = '<div class="mg-top"><img class="atk-pt" src="' + c.img + '"><div class="grow"><b>' + rv.village + '</b><div class="small">🏰 ур. ' + R.lvl + ' · <img src="' + U.IC.coin + '" style="width:14px;vertical-align:-2px"> <span id="aCoins">' + U.fmtK(R.coins) + '</span></div></div>' +
        '<span class="pill">' + (rev != null ? '⚔ месть' : '⚔ ' + s.raid.charges) + '</span><button class="btn sec sm" data-x="quit">Отступить</button></div>' +
        '<div class="vil' + (shield ? ' shielded' : '') + '">' + (shield ? '<div class="dome"></div>' : '') +
        rv.blds.map(function (b, i) {
          var h = R.hp[i], img = h > 0 ? 'img/iso/' + b + '_' + tier(R.lvl) + '.webp' : 'img/iso/ruins.webp';
          return '<button class="vb h' + h + '" data-i="' + i + '" style="left:' + SPOTS[i][0] + '%;top:' + SPOTS[i][1] + '%"' + (h ? '' : ' disabled') + '><img src="' + img + '" alt=""><span class="vn">' + D.BLD_BY_ID[b].name + '</span><span class="atk-hp">' + [0, 1].map(function (k) { return '<i class="h' + (k < h ? 2 : 0) + '"></i>'; }).join('') + '</span></button>';
        }).join('') + '</div><p class="small atk-sub">' + (shield ? '🛡 У соседа поднят щит — первый удар он примет на себя.' : rev != null ? 'Месть проходит сквозь щит и приносит ×1,5.' : 'Коснитесь постройки, чтобы ударить. Разрушение — больше монет и 2 печати.') + '</p>';
    }
    draw();
    el.addEventListener('click', function (e) {
      if (e.target.dataset.x === 'quit') { el.remove(); updateSlot(); return; }
      if (e.target.dataset.x === 'more') { el.remove(); chooseScreen(); return; }
      if (e.target.dataset.x === 'done') { el.remove(); U.refreshAll(); return; }
      var b = e.target.closest('.vb'); if (!b || busy || b.disabled) return;
      var r = X.attack(s, id, +b.dataset.i, U.rng, U.now(), rev); if (!r.ok) { U.toast(r.reason); return; }
      busy = true; after(); U.saveNow && U.saveNow();
      var vil = $('.vil', el), sw = document.createElement('img'); sw.src = 'img/ui/sword.webp'; sw.className = 'atk-sword';
      sw.style.left = b.style.left; sw.style.top = b.style.top; vil.appendChild(sw);
      setTimeout(function () {
        if (r.blocked) { var d = $('.dome', el); if (d) d.classList.add('break'); sw.classList.add('bounce'); U.S.error(); }
        else {
          U.S.coin(); b.classList.add('shake');
          for (var k = 0; k < 7; k++) { var p = document.createElement('i'); p.className = 'puff'; p.style.left = b.style.left; p.style.top = b.style.top; p.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px'); p.style.setProperty('--dy', (-Math.random() * 70 - 10) + 'px'); vil.appendChild(p); }
        }
        var f = document.createElement('span'); f.className = 'atk-float'; f.style.left = b.style.left; f.style.top = b.style.top; f.textContent = '+' + U.fmtK(r.coins); vil.appendChild(f);
      }, 420);
      setTimeout(function () {
        var more = s.raid.charges > 0;
        draw(); el.insertAdjacentHTML('beforeend', '<div class="atk-res"><img src="' + c.img + '"><div class="grow"><b>' + (r.blocked ? 'Щит соседа!' : r.revenge ? 'Месть свершилась!' : r.destroyed ? 'Разрушено «' + D.BLD_BY_ID[r.bld].name + '»!' : 'Точный удар!') + '</b><p class="rvq">«' + U.esc(D.g(r.quip)) + '»</p>' +
          '<div>' + (r.blocked ? 'Утешительные монеты' : 'Добыча') + ': <b>+' + U.fmt(r.coins) + '</b> монет' + (r.seals ? ', +' + r.seals + ' печати' : '') + (r.rebuilt ? '<br><span class="small muted">Деревня разрушена до основания — сосед отстраивается и растёт до ' + R.lvl + ' ур.</span>' : '') + '</div>' +
          '<div class="row" style="margin-top:8px">' + (more ? '<button class="btn green sm grow" data-x="more">⚔ Ещё атака (' + s.raid.charges + ')</button>' : '') + '<button class="btn ' + (more ? 'sec' : 'green') + ' sm grow" data-x="done">Готово</button></div></div></div>');
        U.refreshAll();
      }, 1250);
    });
  }

  /* ================= мини-игры: меню и лавка ================= */
  function miniHTML() {
    var m = X.mini(st(), U.now());
    var tile = function (act, img, name, sub, txt) { return '<button class="mtile" data-act="' + act + '"><img src="' + img + '" alt=""><div class="grow"><b>' + name + '</b><div class="small ok">' + sub + '</div><div class="small muted">' + txt + '</div></div></button>'; };
    return tile('mSearch', 'img/story/6.webp', '🔍 Поиск', 'Попыток сегодня: ' + m.search + ' из ' + D.MINI.searchTries, 'Найдите 5 предметов на картинке за ' + D.MINI.searchTime + ' с. Энергия и редкий шанс на ультраредкую карту.') +
      tile('mRun', 'img/guide/raven.webp', '🐦‍⬛ Бегущий ворон', 'Монеток-мини сегодня ещё: ' + m.runLeft, 'Ворон летит по трём дорожкам: уворачивайтесь от туч и шпилей, собирайте монетки-мини и бонусы.') +
      tile('mSweep', 'img/sym/5.webp', '💣 Магический сапёр', 'Партий сегодня: ' + m.sweep + ' из ' + D.MINI.sweepTries, 'Поле 9×9: бонусы копятся в котелке, мина забирает 75%. Откройте всё — котелок ×2.') +
      '<h3 style="margin:14px 0 6px">Мини-лавка · <img src="img/daily/6.webp" style="width:20px;vertical-align:-4px"> ' + m.coins + ' монеток-мини</h3>' +
      D.MINI_SHOP.map(function (it) {
        var left = it.day - (st().mini.shop[it.id] || 0), amt = it.energy || it.mana || it.seals || it.keys;
        return '<div class="rv"><img src="' + U.IC[it.ico] + '" alt=""><div class="grow"><b>' + it.name + ' ×' + amt + '</b><div class="small muted">сегодня ещё ' + left + '</div></div><button class="btn sm ' + (m.coins >= it.price && left > 0 ? 'green' : 'sec') + '" data-act="mBuy" data-id="' + it.id + '">' + it.price + ' мини</button></div>';
      }).join('') + '<p class="small muted">Лимиты обновляются в полночь — чтобы мини-игры радовали, а не ломали экономику.</p>';
  }
  function overlay(cls, html) {
    U.closeAll(); U.setAuto(false);
    var old = document.querySelector('.mg-atk'); if (old) old.remove();   // экран атаки можно открыть позже из «Набегов» — заряд не пропадает
    var el = document.createElement('div'); el.className = 'mg ' + cls; el.innerHTML = html; $('#app').appendChild(el); return el;
  }
  function result(title, r, img, extra) {
    U.showReward(title, r || {}, img); if (extra) U.toast(extra);
    after(); U.refreshAll();
  }

  /* ---------- Поиск ---------- */
  function searchGame() {
    var s0 = X.searchStart(st(), U.now()); if (!s0.ok) { U.toast(s0.reason); return; }
    U.saveNow();
    var bgs = ['img/story/3.webp', 'img/story/6.webp', 'img/story/4.webp', 'img/story/8.webp', 'img/story/1.webp'], bg = bgs[U.rng.int(bgs.length)];
    var pool = D.DAILY_ITEMS.map(function (x) { return { img: x.img, name: x.name }; }).concat(D.SYMBOLS.map(function (x) { return { img: x.img, name: x.name }; }), D.CHESTS.map(function (x) { return { img: x.img, name: x.name }; }));
    for (var z = pool.length - 1; z > 0; z--) { var y = U.rng.int(z + 1), tmp = pool[z]; pool[z] = pool[y]; pool[y] = tmp; }
    var targets = pool.slice(0, D.MINI.searchFind), decoys = pool.slice(D.MINI.searchFind, D.MINI.searchFind + 12), all = targets.concat(decoys), cells = [];
    for (var c = 0; c < 20; c++) cells.push(c);
    for (z = cells.length - 1; z > 0; z--) { y = U.rng.int(z + 1); tmp = cells[z]; cells[z] = cells[y]; cells[y] = tmp; }
    var items = all.map(function (it, i) {
      var cell = cells[i], cx = cell % 4, cy = (cell / 4) | 0, x = (cx + 0.15 + U.rng.float() * 0.7) * 25, yy = (cy + 0.15 + U.rng.float() * 0.7) * 20;
      return '<img class="hid" data-i="' + i + '" src="' + it.img + '" style="left:' + x.toFixed(1) + '%;top:' + yy.toFixed(1) + '%;transform:translate(-50%,-50%) rotate(' + (U.rng.int(70) - 35) + 'deg);width:' + (30 + U.rng.int(14)) + 'px">';
    }).join('');
    var el = overlay('mg-search', '<div class="mgh"><b>🔍 Поиск</b><span id="sTime" class="pill">' + D.MINI.searchTime + ' с</span><span id="sFound" class="pill">0/' + targets.length + '</span><button class="btn sec sm" data-x="quit">✕</button></div>' +
      '<div class="sfield" style="background-image:url(' + bg + ')">' + items + '</div>' +
      '<div class="slist">' + targets.map(function (t, i) { return '<div class="st" data-t="' + i + '"><img src="' + t.img + '"><span>' + t.name + '</span></div>'; }).join('') + '</div>');
    var found = {}, nf = 0, left = D.MINI.searchTime, done = false;
    var timer = setInterval(function () { left--; $('#sTime', el).textContent = left + ' с'; if (left <= 0) finish(); }, 1000);
    function finish() {
      if (done) return; done = true; clearInterval(timer); el.remove();
      var r = X.searchFinish(st(), nf, targets.length, U.rng, U.now());
      result(r.all ? 'Всё найдено!' : 'Найдено ' + nf + ' из ' + targets.length, r, 'img/guide/raven.webp', r.cards && r.cards.length ? 'Ультраредкая находка — карта!' : null);
      (r.cards || []).forEach(function (k) { U.cardPop(k); });
    }
    el.addEventListener('click', function (e) {
      if (e.target.dataset.x === 'quit') return finish();
      var h = e.target.closest('.hid'); if (!h || done) return;
      var i = +h.dataset.i;
      if (i < targets.length && !found[i]) { found[i] = 1; nf++; h.classList.add('got'); $('.st[data-t="' + i + '"]', el).classList.add('got'); $('#sFound', el).textContent = nf + '/' + targets.length; U.S.coin(); if (nf >= targets.length) setTimeout(finish, 500); }
      else if (i >= targets.length) { left = Math.max(1, left - 3); h.classList.remove('miss'); void h.offsetWidth; h.classList.add('miss'); U.S.error(); }
    });
  }

  /* ---------- Бегущий ворон ---------- */
  function runnerGame() {
    var el = overlay('mg-run', '<div class="mgh"><b>🐦‍⬛ Бегущий ворон</b><span id="rCoins" class="pill">0</span><span id="rBuf" class="pill hidden"></span><button class="btn sec sm" data-x="quit">✕</button></div>' +
      '<canvas id="rc"></canvas><div class="rhint" id="rHint">Свайп или касание слева/справа — смена дорожки. Стрелки ← → на ПК. Начать — касание!</div>');
    var cv = $('#rc', el), g = cv.getContext('2d'), raven = new Image(); raven.src = 'img/guide/raven.webp';
    var coinImg = new Image(); coinImg.src = 'img/daily/6.webp';
    var W, H, dpr = Math.min(2, window.devicePixelRatio || 1);
    function size() { var r = cv.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
    size();
    var lane = 1, lx = 1, objs = [], coins = 0, speed = 260, t = 0, spawn = 0, shield = 0, magnet = 0, alive = true, started = false, last = 0, clouds = [];
    for (var i = 0; i < 7; i++) clouds.push({ x: Math.random(), y: Math.random(), r: 20 + Math.random() * 40, v: 0.3 + Math.random() * 0.5 });
    function LX(l) { return W * (l * 2 + 1) / 6; }
    function move(d) { if (!started) { started = true; $('#rHint', el).classList.add('hidden'); } if (!alive) return; lane = Math.max(0, Math.min(2, lane + d)); }
    var sx = null;
    cv.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    cv.addEventListener('touchend', function (e) { var x = e.changedTouches[0].clientX, dx = x - sx; if (Math.abs(dx) > 30) move(dx > 0 ? 1 : -1); else { var r = cv.getBoundingClientRect(); move(x - r.left < W / 2 ? -1 : 1); } e.preventDefault(); });
    cv.addEventListener('mousedown', function (e) { var r = cv.getBoundingClientRect(); move(e.clientX - r.left < W / 2 ? -1 : 1); });
    function key(e) { if (e.key === 'ArrowLeft' || e.key === 'a') move(-1); if (e.key === 'ArrowRight' || e.key === 'd') move(1); }
    document.addEventListener('keydown', key);
    el.addEventListener('click', function (e) { if (e.target.dataset.x === 'quit') end(); });
    function spawnRow() {
      var obst = U.rng.int(3), two = t > 12 && U.rng.chance(0.35), lanes = [obst];
      if (two) lanes.push((obst + 1 + U.rng.int(2)) % 3);
      lanes.forEach(function (l) { objs.push({ l: l, y: -50, k: U.rng.chance(0.5) ? 'storm' : 'spire' }); });
      var free = [0, 1, 2].filter(function (l) { return lanes.indexOf(l) < 0; }), fl = free[U.rng.int(free.length)];
      var bonus = U.rng.float();
      if (bonus < 0.06) objs.push({ l: fl, y: -50, k: 'shield' }); else if (bonus < 0.12) objs.push({ l: fl, y: -50, k: 'magnet' });
      else for (var c = 0; c < 3; c++) objs.push({ l: fl, y: -50 - c * 46, k: 'coin' });
    }
    function drawObj(o, x) {
      if (o.k === 'coin') { g.drawImage(coinImg, x - 15, o.y - 15, 30, 30); return; }
      if (o.k === 'shield' || o.k === 'magnet') { g.fillStyle = o.k === 'shield' ? 'rgba(120,200,255,.85)' : 'rgba(255,120,160,.85)'; g.beginPath(); g.arc(x, o.y, 18, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '18px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(o.k === 'shield' ? '🛡' : '🧲', x, o.y + 1); return; }
      if (o.k === 'storm') { g.fillStyle = '#4b4560'; [[-16, 0, 18], [6, -6, 20], [20, 4, 14], [0, 8, 16]].forEach(function (c) { g.beginPath(); g.arc(x + c[0], o.y + c[1], c[2], 0, 7); g.fill(); }); g.strokeStyle = '#ffe36b'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 2, o.y + 14); g.lineTo(x + 6, o.y + 26); g.lineTo(x - 2, o.y + 28); g.lineTo(x + 5, o.y + 42); g.stroke(); return; }
      g.fillStyle = '#5a3f2e'; g.beginPath(); g.moveTo(x - 20, o.y + 26); g.lineTo(x, o.y - 30); g.lineTo(x + 20, o.y + 26); g.closePath(); g.fill(); g.fillStyle = '#8f2a1a'; g.beginPath(); g.moveTo(x - 9, o.y - 8); g.lineTo(x, o.y - 30); g.lineTo(x + 9, o.y - 8); g.fill();
    }
    function frame(ts) {
      if (!el.parentNode) return;
      var dt = Math.min(0.05, last ? (ts - last) / 1000 : 0); last = ts;
      if (started && alive) {
        t += dt; speed = Math.min(720, 260 + t * 9); spawn -= dt;
        if (spawn <= 0) { spawnRow(); spawn = Math.max(0.42, 0.9 - t * 0.012); }
        lx += (lane - lx) * Math.min(1, dt * 14);
        shield = Math.max(0, shield - dt); magnet = Math.max(0, magnet - dt);
        var ry = H * 0.8;
        objs.forEach(function (o) {
          o.y += speed * dt;
          if (magnet > 0 && o.k === 'coin' && o.y > ry - 220) o.l = lane;
          if (o.dead || Math.abs(o.y - ry) > 30 || o.l !== lane || Math.abs(lx - lane) > 0.5) return;
          if (o.k === 'coin') { coins++; o.dead = true; }
          else if (o.k === 'shield') { shield = 8; o.dead = true; }
          else if (o.k === 'magnet') { magnet = 7; o.dead = true; }
          else if (shield > 0) { shield = 0; o.dead = true; U.S.error(); }
          else { alive = false; U.S.error(); setTimeout(end, 700); }
        });
        objs = objs.filter(function (o) { return !o.dead && o.y < H + 60; });
        $('#rCoins', el).textContent = coins;
        var bf = $('#rBuf', el); bf.classList.toggle('hidden', !(shield || magnet)); bf.textContent = (shield ? '🛡' + Math.ceil(shield) : '') + (magnet ? ' 🧲' + Math.ceil(magnet) : '');
      }
      var sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#f6d9a8'); sky.addColorStop(1, '#a9d3d8'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,.75)'; clouds.forEach(function (c) { c.y += c.v * dt * (started ? speed / 300 : 0.3) / 3; if (c.y > 1.1) { c.y = -0.1; c.x = Math.random(); } g.beginPath(); g.ellipse(c.x * W, c.y * H, c.r * 1.6, c.r * 0.7, 0, 0, 7); g.fill(); });
      g.strokeStyle = 'rgba(143,42,26,.18)'; g.setLineDash([10, 14]); g.lineWidth = 2; [1, 2].forEach(function (k) { g.beginPath(); g.moveTo(W * k / 3, 0); g.lineTo(W * k / 3, H); g.stroke(); }); g.setLineDash([]);
      objs.forEach(function (o) { drawObj(o, LX(o.l)); });
      var x = LX(lx), y = H * 0.8 + Math.sin(ts / 140) * 4, rw = 70, rh = rw * 1.3;
      if (shield > 0) { g.fillStyle = 'rgba(120,200,255,.35)'; g.beginPath(); g.arc(x, y, 48, 0, 7); g.fill(); }
      g.save(); g.translate(x, y); g.rotate((lane - lx) * 0.35); if (!alive) g.globalAlpha = 0.5; if (raven.complete && raven.naturalWidth) { var sh = raven.naturalHeight * 0.68, rh2 = rw * sh / raven.naturalWidth; g.drawImage(raven, 0, 0, raven.naturalWidth, sh, -rw / 2, -rh2 / 2, rw, rh2); }   // ворон без пенька g.restore();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    var ended = false;
    function end() {
      if (ended) return; ended = true; document.removeEventListener('keydown', key); el.remove();
      var r = X.runFinish(st(), coins, U.now());
      U.dialog('<img src="img/guide/raven.webp" style="width:90px"><h2>Полёт окончен!</h2><p>Монеток-мини собрано: <b>' + coins + '</b>' + (r.capped ? '<br><span class="small muted">Сегодня засчитано ' + r.got + ' — дневной лимит ' + D.MINI.runCoinCap + '</span>' : '') + '</p><p class="small">На счету: ' + st().mini.coins + ' — тратьте в мини-лавке.</p>',
        [{ t: 'Ещё полёт', act: 'mRun', cls: 'green' }, { t: 'В мини-лавку', act: 'miniMenu', cls: 'sec' }]);
      after();
    }
  }

  /* ---------- Магический сапёр ---------- */
  var flagMode = false, flags = {};
  function sweepGame(cont) {
    if (!cont) { var r0 = X.sweepNew(st(), U.now()); if (!r0.ok) { U.toast(r0.reason); return; } flags = {}; U.saveNow(); }
    var el = overlay('mg-sweep', '<div class="mgh"><b>💣 Сапёр</b><span class="pill" id="wPot"></span><button class="btn sec sm" id="wFlag">🚩</button><button class="btn sec sm" data-x="quit">✕</button></div><div class="sgrid" id="sg"></div><div class="swb"><div class="small muted" id="wMsg">Первая клетка всегда безопасна. Цифра — сколько мин рядом. Бонусы падают в котелок.</div><button class="btn green wide" id="wCash">Забрать котелок</button></div>');
    var g = st().mini.sw;
    function draw() {
      g = st().mini.sw; if (!g) return;
      var h = '';
      for (var i = 0; i < g.n * g.n; i++) {
        var open = g.open.indexOf(i) >= 0, mine = g.mines && g.mines.indexOf(i) >= 0, cls = 'c', inner = '';
        if (open || (g.over && mine)) {
          cls += ' o';
          if (mine) { cls += i === g.boom ? ' boom' : ' mine'; inner = '✴'; }
          else if (g.bonus[i]) { var k = Object.keys(g.bonus[i])[0]; inner = '<img src="' + icon(k) + '">'; cls += ' bn'; }
          else { var n = X.sweepCount(g, i); inner = n || ''; cls += ' n' + n; }
        } else if (flags[i]) inner = '🚩';
        h += '<button class="' + cls + '" data-c="' + i + '">' + inner + '</button>';
      }
      $('#sg', el).innerHTML = h;
      var p = g.pot, parts = [];
      if (p.energy) parts.push('⚡' + p.energy); if (p.coinsB) parts.push('🪙' + p.coinsB + 'B'); if (p.mana) parts.push('🔮' + p.mana); if (p.keys) parts.push('🗝' + p.keys);
      $('#wPot', el).textContent = 'Котелок: ' + (parts.join(' ') || 'пусто');
      $('#wFlag', el).classList.toggle('green', flagMode);
      if (g.over) { $('#wMsg', el).innerHTML = g.win ? '<b class="ok">Поле очищено! Котелок удвоен.</b>' : '<b style="color:var(--bad)">Магическая мина! Котелок потерял 75%.</b>'; $('#wCash', el).textContent = 'Забрать что осталось'; }
    }
    draw();
    el.addEventListener('click', function (e) {
      if (e.target.dataset.x === 'quit') { el.remove(); U.toast('Партия сохранена — вернитесь из меню мини-игр'); U.refreshAll(); return; }
      if (e.target.id === 'wFlag') { flagMode = !flagMode; draw(); return; }
      if (e.target.id === 'wCash') { var r = X.sweepCash(st(), U.rng, U.now()); el.remove(); result('Котелок сапёра', r, 'img/sym/5.webp'); return; }
      var c = e.target.closest('[data-c]'); if (!c || g.over) return;
      var i = +c.dataset.c;
      if (flagMode) { flags[i] = !flags[i]; draw(); return; }
      if (flags[i]) return;
      var r = X.sweepReveal(st(), i, U.rng); if (!r.ok) return;
      if (r.boom) U.S.error(); else if (r.got && r.got.length) U.S.coin(); else U.S.click();
      U.save(); draw();
    });
  }

  /* ================= цепочки заданий ================= */
  function chainPanelHTML() {
    var s = st(), step = X.chainStep(s);
    if (!step) return '<div class="card chain"><b>Все цепочки глав пройдены!</b><div class="small muted">Карр требует продолжения. Мы работаем над этим.</div></div>';
    var c = D.CHAINS[s.chain.n - 1], k = s.chain.k;
    if (!X.chainOpen(s)) return '<div class="card chain"><div class="small muted">Цепочка главы ' + c.n + '</div><b>Откроется вместе с главой ' + c.n + '</b></div>';
    var p = X.chainProgress(s), done = X.chainDone(s);
    return '<div class="card chain"><div class="chk">Цепочка главы ' + c.n + ' · часть ' + (k + 1) + ' из ' + c.steps.length + '</div><h3>«' + D.g(step.title) + '»</h3>' +
      '<div class="small">' + step.obj.text + '</div>' + U.bar(p, step.obj.t) + '<div class="small muted">' + U.fmt(p) + ' / ' + U.fmt(step.obj.t) + ' · награда: ' + rewardText(rwPreview(step.rw)) + '</div>' +
      '<div class="row" style="margin-top:8px"><button class="btn sec sm grow" data-act="chainReplay">💬 Диалог</button>' + (done ? '<button class="btn green sm grow" data-act="chainClaim">Забрать</button>' : '') + '</div></div>';
  }
  function rwPreview(rw) { var o = {}; for (var k in rw) o[k] = rw[k]; if (rw.coinsB) o.coins = Math.round(rw.coinsB * E.derived(st()).B); return o; }
  function damageHTML(id) {
    var s = st(); if (!s.raid || !s.raid.dmg[id]) return '';
    return '<div class="card warn">⚔ Постройку повредили соседи. Пока не почините — улучшать нельзя.<button class="btn green sm wide" style="margin-top:6px" data-act="xRepair" data-id="' + id + '">Починить · ' + U.fmt(X.repairCost(s)) + ' монет</button></div>';
  }

  /* ================= действия ================= */
  Object.assign(U.ACT, {
    miniMenu: function () { U.closeAll(); U.openSheet('Мини-игры', miniHTML); },
    mSearch: function () { searchGame(); },
    mRun: function () { runnerGame(); },
    mSweep: function () { sweepGame(!!(st().mini.sw && !st().mini.sw.over) || !!st().mini.sw); },
    mBuy: function (d) { var r = X.shopBuy(st(), d.id, U.rng, U.now()); if (!r.ok) { U.toast(r.reason || 'Нельзя'); U.S.error(); return; } U.toast('Куплено: ' + rewardText(r), U.IC.energy); U.S.coin(); after(); U.refreshSheet(); },
    raids: function () { U.closeAll(); U.openSheet('Набеги', raidsHTML); },
    rTab: function (d) { rtab = d.t; U.refreshSheet(); },
    rAttack: function (d) { villageScreen(d.id, d.rev != null ? +d.rev : null); },
    rChoose: function () { chooseScreen(); },
    xRepair: function (d) { var r = X.repair(st(), d.id); if (!r.ok) { U.toast(r.reason); U.S.error(); return; } U.toast(D.BLD_BY_ID[d.id].name + ' починена!', D.BLD_BY_ID[d.id].img); U.S.build(); after(); U.refreshSheet(); U.refreshAll(); },
    chainClaim: function () { var r = X.chainClaim(st(), U.rng, U.now()); if (!r.ok) return; result('Часть главы пройдена!', r.reward, 'img/guide/raven.webp'); setTimeout(U.pumpScenes, 600); },
    chainReplay: function () { var s = st(); U.openScene(X.chainSceneId(s.chain.n, s.chain.k), { replay: true }); }
  });
  window.CLX = { slotBarHTML: slotBarHTML, slotButtonsHTML: slotButtonsHTML, updateSlot: updateSlot, afterSpin: afterSpin, onTickEvent: onTickEvent, chainPanelHTML: chainPanelHTML, damageHTML: damageHTML };
})();
