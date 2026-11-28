/* 0.8–0.9 — интерфейс правил вращения во всех стилях: гость-обменщик карт, анимации атаки / набега / купола
   на экране удачи и раскопки-набег. */
(function () {
  'use strict';
  var CL = window.CL, D = CL.Data, E = CL.Engine, T = CL.V08, U = window.CLUI; if (!U || !T) return;
  function st() { return U.state; }
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var C = window.CLT = { on: function () { return T.on(st()); } };
  function npc() { return { name: D.CHARS.bruni.name, img: D.CHARS.bruni.img }; }
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

  /* ================= анимации на экране удачи и раскопки ================= */
  function fx(kind, img, text) {
    var app = $('#app'), el = document.createElement('div'); el.className = 'tfx ' + kind; el.innerHTML = '<img src="' + img + '" alt=""><b>' + text + '</b>';
    app.appendChild(el); var m = $('.machine'); if (m && kind === 'atk') { m.classList.remove('shake'); void m.offsetWidth; m.classList.add('shake'); }
    setTimeout(function () { el.remove(); }, 1500);
  }
  C.afterSpin = function (r, onSlot) {
    if (!C.on() || !onSlot) return;
    if (r.swordAttack > 0) fx('atk', 'img/sym/9.webp', 'АТАКА!');
    if (r.shieldWin) fx('shd', 'img/sym/5.webp', '+1 КУПОЛ');
    if (r.raidDig) { U.setAuto(false); fx('raid', 'img/sym/4.webp', 'НАБЕГ!'); setTimeout(C.openDig, 1200); }
  };
  function rivalInfo(g) {
    var r0 = D.RIVAL_BY_ID[g.rival] || {}, ch = D.CHARS[r0.who] || {};
    return { name: ch.name || 'сосед', village: r0.village || '', img: ch.img || 'img/port/0.webp' };
  }
  function resultHTML(g, rv) {
    return '<div class="tdres"><div class="tdhero"><img src="' + rv.img + '" alt=""><div><b>' + rv.name + '</b><div class="small">' + rv.village + '</div></div></div>' +
      '<p>Набег окончен</p><div class="got">+' + U.fmt(g.got) + '</div><p class="small">золото уже у вас</p><button class="btn" data-x="ok">Забрать</button></div>';
  }
  C.openDig = function () {
    var g = st().dig; if (!g || $('.tdig')) return;
    var rv = rivalInfo(g), el = document.createElement('div'); el.className = 'tdig';
    function holes() {
      return [0, 1, 2, 3].map(function (i) {
        return '<button class="hole' + (g.open[i] ? ' open' : '') + '" data-i="' + i + '">' +
          (g.open[i] ? (g.spots[i] ? '<img src="' + U.IC.coin + '" alt="">' : '<b>пусто</b>') : '<span>⛏</span>') + '</button>';
      }).join('');
    }
    el.innerHTML = '<div class="tdbox" id="tdBox"><div class="tdhero"><img src="' + rv.img + '" alt=""><div><b>' + rv.name + '</b><div class="small">' + (rv.village ? 'деревня ' + rv.village : '') + '</div></div></div>' +
      '<h2>Набег!</h2><p class="tdl">Лопат: <b id="tdLeft">' + g.left + '</b> из 3</p><div class="tdholes">' + holes() +
      '</div><div class="tdsum" id="tdSum">Добыто: <b>0</b></div></div>';
    $('#app').appendChild(el);
    if (g.done) { $('#tdBox', el).innerHTML = resultHTML(g, rv); }
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-x="ok"]')) { T.claimDig(st()); el.remove(); U.refreshAll(); return; }
      var b = e.target.closest('.hole'); if (!b || b.classList.contains('open') || b.classList.contains('digging')) return;
      var r = T.dig(st(), +b.dataset.i, U.rng, U.now()); if (!r.ok) return;
      b.classList.add('digging');
      setTimeout(function () {
        b.classList.remove('digging'); b.classList.add('open');
        b.innerHTML = r.coins ? '<img src="' + U.IC.coin + '" alt=""><b>+' + U.fmtK(r.coins) + '</b><i class="flyc">💰</i>' : '<b>пусто</b>';
        if (r.coins && U.S.coin) U.S.coin();
        $('#tdLeft', el).textContent = String(st().dig ? st().dig.left : 0);
        $('#tdSum', el).innerHTML = 'Добыто: <b>' + U.fmt(r.total) + '</b>';
        U.updateTop(); U.save();
        if (r.done) setTimeout(function () { var box = $('#tdBox', el); if (box) box.innerHTML = resultHTML(st().dig || { got: r.total }, rv); }, 700);
      }, 450);
    });
  };
})();
