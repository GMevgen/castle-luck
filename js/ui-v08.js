/* 0.8 (бета) — интерфейс: гость-обменщик карт (все стили), а в «Мультяшном» — деревня уровня из 5 построек,
   питомец-енот, раскопки-набег и анимации атаки / набега / купола на экране удачи. */
(function () {
  'use strict';
  var CL = window.CL, D = CL.Data, E = CL.Engine, T = CL.V08, U = window.CLUI; if (!U || !T) return;
  function st() { return U.state; }
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var C = window.CLT = { old: false, on: function () { return T.on(st()); } };
  if (CL.Theme && CL.Theme.id === 'toon') {   // редкости карт: обычная, редкая, золотая, чёрная
    D.RARITY.E.name = 'Золотая'; D.RARITY.E.color = '#ffc21a'; D.RARITY.E.ink = '#a87400';
    D.RARITY.L.name = 'Чёрная'; D.RARITY.L.color = '#2b2b33'; D.RARITY.L.ink = '#111';
  }
  function npc() { return C.on() ? { name: 'Енот-обменщик', img: 'img/extra/raccoon.webp' } : { name: D.CHARS.bruni.name, img: D.CHARS.bruni.img }; }
  function timer(end) { return '<span class="timer" data-end="' + end + '">' + U.fmtTime(end - U.now()) + '</span>'; }

  /* ================= гость-обменщик ================= */
  C.visitorHTML = function () {
    var v = T.visitor(st(), U.now()), n = npc(), k = D.CARD_BY_ID[v.card];
    return '<div class="xch card"><img class="xnpc" src="' + n.img + '" alt=""><div class="grow"><b>' + n.name + '</b>' +
      (v.here ? '<div class="small">Принёс карту «' + U.esc(k.name) + '». Отдаст только в обмен на одну вашу.</div>' : '<div class="small muted">Следующий гость через ' + timer(v.next) + '</div>') + '</div>' +
      (v.here ? '<img class="xcard" src="' + k.img + '" alt=""><button class="btn sm" data-act="xch">Обменять</button>' : '') + '</div>';
  };
  U.ACT.xch = function () {
    var s = st(), v = T.visitor(s, U.now()), n = npc(), k = D.CARD_BY_ID[v.card];
    if (!v.here) { U.toast(n.name + ' уже был сегодня. Следующий визит через ' + U.fmtTime(v.next - U.now()), n.img); return; }
    var own = Object.keys(s.cards).filter(function (id) { return s.cards[id] > 0 && D.CARD_BY_ID[id]; });
    U.dialog('<img src="' + n.img + '" style="width:84px"><h2>' + n.name + '</h2><p>Предлагает: <b>' + U.esc(k.name) + '</b> <span style="color:' + D.RARITY[k.r].ink + '">(' + D.RARITY[k.r].name.toLowerCase() + ')</span></p>' +
      '<img src="' + k.img + '" style="width:96px;border-radius:12px"><p class="small">' + (own.length ? 'Выберите, какую свою карту отдать взамен:' : 'Отдать нечего — у вас пока нет карт.') + '</p>' +
      '<div class="xgrid">' + own.map(function (id) { var c = D.CARD_BY_ID[id]; return '<button data-act="xgive" data-id="' + id + '"><img src="' + c.img + '" alt=""><span>' + U.esc(c.name) + (s.cards[id] > 1 ? ' ×' + s.cards[id] : '') + '</span></button>'; }).join('') + '</div>',
      [{ t: 'Отказаться', act: 'xno', cls: 'sec' }]);
  };
  U.ACT.xgive = function (d) {
    var r = T.exchange(st(), d.id, U.now()); U.closeModal();
    if (!r.ok) { U.toast(r.reason); return; }
    U.toast('Обмен: отдана «' + U.esc(D.CARD_BY_ID[r.got.gave].name) + '»', npc().img); U.cardPop(r.got); U.refreshAll();
  };
  U.ACT.xno = function () { T.decline(st(), U.now()); U.closeModal(); U.toast(npc().name + ' ушёл. Приходите завтра!', npc().img); U.refreshAll(); };

  /* ================= деревня уровня ================= */
  C.villageHTML = function () {
    var s = st(), v = T.village(s), sum = v.b.reduce(function (a, b) { return a + b; }, 0), id = v.id;
    var h = '<div class="tvil"><div class="tvhead"><div><b>' + v.name + '</b><span>Деревня ' + (v.i + 1) + '</span></div><span class="tstars">★ ' + s.toon.stars + '</span>' +
      '<div class="tvprog"><i style="width:' + (sum / 20 * 100).toFixed(0) + '%"></i><em>' + sum + ' / 20</em></div></div><div class="tvscene">';
    for (var j = 0; j < 5; j++) {
      var k = v.b[j], c = T.cost(s, j, U.now());
      h += '<div class="tvb p' + j + '"><div class="tvimg">' + (k < 4 ? '<img class="plot" src="img/extra/vil/' + id + '_5.webp" alt="">' : '') +
        (k > 0 ? '<img class="bld s' + k + '" src="img/extra/vil/' + id + '_' + j + '.webp" alt="">' : '') + '</div>' +
        '<div class="tvname">' + v.blds[j] + '</div><div class="tvst">' + '★★★★'.slice(0, k) + '<i>' + '★★★★'.slice(k) + '</i></div>' +
        (k < 4 ? '<button class="tvbtn' + (s.coins >= c ? '' : ' no') + '" data-act="tBuild" data-j="' + j + '"><img src="' + U.IC.coin + '" alt="">' + U.fmtK(c) + '<small>★+' + (k + 1) + '</small></button>' : '<span class="tvok">✓</span>') + '</div>';
    }
    return h + '<button class="tvpet" data-act="tPet"><img src="img/extra/raccoon.webp" alt=""><span>Питомец · ур. ' + s.toon.pet.lv + '</span></button></div>' +
      '<div class="row"><button class="btn sec sm grow" data-act="tOld">🏰 Хозяйство и сюжет</button></div></div>';
  };
  U.ACT.tBuild = function (d) {
    var r = T.build(st(), +d.j, U.rng, U.now()); if (!r.ok) { U.toast(r.reason); return; }
    U.S.coin && U.S.coin(); U.refreshAll();
    var el = $('.tvb.p' + d.j); if (el) el.classList.add('pop');
    if (r.done) { U.S.bigWin && U.S.bigWin(); U.showReward('«' + r.done + '» отстроена! Впереди новая деревня', r.reward, 'img/extra/vil/' + T.village(st()).id + '_0.webp'); }
    else U.toast('Этап ' + r.stage + ' готов: +' + r.stars + ' ★');
  };
  U.ACT.tOld = function () { C.old = true; U.refreshAll(); };
  /* ================= питомец ================= */
  U.ACT.tPet = function () {
    var p = st().toon.pet, L = D.TOON.pet.lv, next = L[p.lv + 1];
    U.dialog('<img src="img/extra/raccoon.webp" style="width:96px"><h2>Енот-питомец · ур. ' + p.lv + '</h2>' +
      '<p>+' + Math.round(D.TOON.pet.raid * p.lv * 100) + '% денежек в раскопках · ' + Math.round(D.TOON.pet.block * p.lv * 100) + '% шанс отбить налёт</p>' +
      (next != null ? U.bar(p.xp - L[p.lv], next - L[p.lv]) : '<p><b>Максимальный уровень!</b></p>') + '<p class="small">Лакомств: <b>' + p.treats + '</b> (бывают в бочонках)</p>',
      [{ t: '🍪 Покормить', act: 'tFeed' }, { t: 'Закрыть', act: 'close', cls: 'sec' }]);
  };
  U.ACT.tFeed = function () { var r = T.feed(st()); U.closeModal(); if (!r.ok) { U.toast(r.reason); return; } U.toast(r.up ? 'Енот вырос! Уровень ' + st().toon.pet.lv : 'Ням! Енот доволен', 'img/extra/raccoon.webp'); U.refreshAll(); U.ACT.tPet(); };

  /* ================= анимации на экране удачи и раскопки ================= */
  function fx(kind, img, text) {
    var app = $('#app'), el = document.createElement('div'); el.className = 'tfx ' + kind; el.innerHTML = '<img src="' + img + '" alt=""><b>' + text + '</b>';
    app.appendChild(el); var m = $('.machine'); if (m && kind === 'atk') { m.classList.remove('shake'); void m.offsetWidth; m.classList.add('shake'); }
    setTimeout(function () { el.remove(); }, 1500);
  }
  C.afterSpin = function (r, onSlot) {
    if (!C.on() || !onSlot) return;
    if (r.swordAttack > 0) fx('atk', 'img/sym/9.webp', 'АТАКА!');
    if (r.toonShield) fx('shd', 'img/sym/5.webp', '+1 КУПОЛ');
    if (r.toonRaid) { U.setAuto(false); fx('raid', 'img/sym/4.webp', 'НАБЕГ!'); setTimeout(C.openDig, 1200); }
  };
  C.openDig = function () {
    var g = st().toon.dig; if (!g || $('.tdig')) return;
    var r0 = D.RIVAL_BY_ID[g.rival] || {}, rv = { name: ((D.CHARS[r0.who] || {}).name || 'сосед') + (r0.village ? ', ' + r0.village : '') }, el = document.createElement('div'); el.className = 'tdig';
    el.innerHTML = '<div class="tdbox"><h2>Набег!</h2><p>Копаем у: <b>' + rv.name + '</b></p><p class="tdl">Лопат: <b id="tdLeft">' + g.left + '</b> из 3</p><div class="tdholes">' +
      [0, 1, 2, 3].map(function (i) { return '<button class="hole' + (g.open[i] ? ' open' : '') + '" data-i="' + i + '"><span>⛏</span></button>'; }).join('') +
      '</div><div class="tdsum" id="tdSum"></div></div>';
    $('#app').appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-x="ok"]')) { el.remove(); U.refreshAll(); return; }
      var b = e.target.closest('.hole'); if (!b || b.classList.contains('open')) return;
      var r = T.dig(st(), +b.dataset.i, U.rng, U.now()); if (!r.ok) return;
      b.classList.add('open'); b.innerHTML = r.coins ? '<img src="' + U.IC.coin + '" alt=""><b>+' + U.fmtK(r.coins) + '</b>' : '<b>пусто</b>';
      if (r.coins && U.S.coin) U.S.coin(); U.updateTop(); U.save();
      $('#tdLeft', el).textContent = Math.max(0, 3 - el.querySelectorAll('.hole.open').length);
      if (r.done) $('#tdSum', el).innerHTML = '<p>Добыто: <b>' + U.fmt(r.total) + '</b></p><button class="btn" data-x="ok">Забрать</button>';
    });
  };
})();
