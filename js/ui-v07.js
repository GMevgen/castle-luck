/* 0.7: выбор стиля оформления (первый запуск — после выбора героя; в Настройках — в любой момент),
   панель «Что нового» после обновления и полная история версий. */
(function () {
  'use strict';
  var CL = window.CL, D = CL.Data, U = window.CLUI, T = CL.Theme;
  function st() { return U.state; }
  function themes() { return (CL.THEMES && CL.THEMES.list) || []; }
  function cur() { return T ? T.id : 'anime'; }
  function card(t, active) {
    var ready = t.ready, prev = ready ? '<img src="../' + t.id + '/preview.webp" alt="">' : '<div class="tp-soon tp-' + t.id + '"><span>скоро</span></div>';
    return '<button class="tpick' + (active ? ' on' : '') + (ready ? '' : ' off') + '" data-act="v07pick" data-id="' + t.id + '"' + (ready ? '' : ' disabled') + '>' + prev +
      '<b>' + t.name + '</b><span>' + t.desc + '</span>' + (active ? '<i>сейчас</i>' : '') + '</button>';
  }
  /* окно выбора стиля; mode: 'first' — новый игрок, 'offer' — старый игрок после обновления, 'settings' — из настроек */
  function picker(mode, onDone) {
    var head = mode === 'first' ? 'Каким будет ваш мир?' : mode === 'offer' ? 'Новое: стили оформления' : 'Стиль оформления';
    var sub = mode === 'settings' ? 'Меняется всё: мир, постройки, жители, портреты, карты, кнопки, слова и эффекты. Прогресс не меняется — игра сохранится и перезапустится в новом стиле.'
      : mode === 'offer' ? 'Теперь игру можно перерисовать целиком. Ваш стиль — «Аниме»; выберите другой или оставьте как есть — сменить можно в любой момент в Настройках.'
      : 'Выберите стиль оформления — сменить его можно в любой момент в Настройках. Сюжет и прогресс от стиля не зависят.';
    var list = themes().map(function (t) { return card(t, t.id === cur()); }).join('');
    var m = U.dialog('<div class="tpicker"><h2>' + head + '</h2><p class="small">' + sub + '</p><div class="tgrid" data-notx>' + list + '</div></div>',
      mode === 'settings' ? [{ t: 'Назад к настройкам', act: 'backSettings', cls: 'sec' }] : [{ t: 'Оставить «' + (CL.THEMES.byId[cur()] || {}).name + '»', act: 'close', cls: 'sec' }]);
    m.el.classList.add('v07-picker');
    m.onClose = function () { if (mode !== 'settings' && !st().themeAsked) { st().themeAsked = true; U.save(); } if (onDone) onDone(); };
    return m;
  }
  function verIdx(v) { var L = D.CHANGELOG || []; for (var i = 0; i < L.length; i++) if (L[i].v === v) return i; return -1; }
  function entriesHTML(list) {
    return list.map(function (e) { return '<div class="wn-entry"><div class="wn-v">Версия ' + e.v + '</div><h3>' + e.title + '</h3><ul>' + e.items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>'; }).join('');
  }
  function whatsNew(fromVer, onDone) {
    var L = D.CHANGELOG || [], k = verIdx(fromVer), list = k < 0 ? L.slice(0, 1) : L.slice(0, k);
    if (!list.length) { if (onDone) onDone(); return null; }
    var m = U.dialog('<div class="whatsnew"><div class="wn-kicker">Обновление</div><h2>Что нового</h2>' + '<div data-notx>' + entriesHTML(list) + '</div>' +
      '<p class="small muted">Вся история версий — в Настройках → «Что нового: история версий».</p></div>', [{ t: 'Отлично!', act: 'close' }]);
    m.el.classList.add('v07-whatsnew');
    m.onClose = function () { st().seenVer = D.APP_VERSION; U.save(); if (onDone) onDone(); };
    return m;
  }
  function history() {
    U.dialog('<div class="whatsnew"><h2>История версий</h2><div data-notx>' + entriesHTML(D.CHANGELOG || []) + '</div></div>', [{ t: 'Назад к настройкам', act: 'backSettings', cls: 'sec' }]);
  }
  U.ACT.v07pick = function (d) {
    var id = d.id; if (!CL.THEMES.valid(id)) return;
    st().themeAsked = true;
    if (id === cur()) { U.save(); U.closeModal(); return; }
    U.toast('Перерисовываем мир…'); setTimeout(function () { T.set(id); }, 250);
  };
  U.ACT.v07theme = function () { U.closeModal(); picker('settings'); };
  U.ACT.v07history = function () { U.closeModal(); history(); };

  window.CLV07 = {
    picker: picker, whatsNew: whatsNew, history: history,
    settingsHTML: function () {
      var t = CL.THEMES.byId[cur()] || { name: cur() };
      return '<button class="btn sec wide" data-act="v07theme">🎨 Стиль оформления: ' + t.name + ' — сменить</button><div style="height:8px"></div>' +
        '<button class="btn sec wide" data-act="v07history">📰 Что нового: история версий</button><div style="height:8px"></div>';
    },
    onBoot: function () {
      var s = st();
      // тема из сохранения главнее (импорт сохранения, другой браузер); ?theme= в адресе — главнее сохранения
      var urlTheme = /[?&]theme=([a-z]+)/.test(location.search);
      if (!urlTheme && s.theme && s.theme !== cur() && CL.THEMES.valid(s.theme) && !sessionStorage.getItem('cl.themeAdopt')) {
        try { sessionStorage.setItem('cl.themeAdopt', '1'); } catch (e) { }
        CL.THEMES.store(s.theme); location.reload(); return;
      }
      s.theme = cur();
      var updated = s.seenVer !== D.APP_VERSION;
      if (updated) U.enqueue(function () { whatsNew(s.seenVer, U.dequeue); });
      if (!s.themeAsked) U.enqueue(function () { picker(updated ? 'offer' : 'first', U.dequeue); });
    }
  };
})();
