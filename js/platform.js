/* Платформенный слой: iPhone/iPad (Safari, «На экран Домой»), PWA-кэш, Android-обёртка.
   Игровой процесс не трогает: только установка, офлайн-кэш, обновления, напоминания о сохранении. */
(function (root) {
  'use strict';
  var doc = root.document, nav = root.navigator || {}, ua = nav.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  var standalone = nav.standalone === true || !!(root.matchMedia && root.matchMedia('(display-mode: standalone)').matches);
  var isIOSSafari = isIOS && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|GSA\/|Instagram|FBAN|FBAV/.test(ua);
  var hasBridge = !!root.AndroidBridge;
  var isPWA = !hasBridge && !!doc.querySelector('link[rel="manifest"]') && /^https?:$/.test(location.protocol) && 'serviceWorker' in nav;
  var K_EXP = 'castleLuck.lastExport', K_HINT = 'castleLuck.a2hsHidden', DAY = 86400000;
  function ls(k, v) { try { if (v === undefined) return root.localStorage.getItem(k); root.localStorage.setItem(k, String(v)); } catch (e) { return null; } }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var P = root.CLPlatform = {
    isIOS: isIOS, isIOSSafari: isIOSSafari, standalone: standalone, isPWA: isPWA, hasBridge: hasBridge,
    fileSave: !hasBridge, persisted: null, sw: { registered: false, controlled: !!(nav.serviceWorker && nav.serviceWorker.controller), updateReady: false, error: null },
    onExport: function () { ls(K_EXP, Date.now()); },
    lastExport: function () { var v = +ls(K_EXP); return v > 0 ? v : null; }
  };

  /* ---------- постоянное хранилище ---------- */
  function persist() {
    if (!nav.storage || !nav.storage.persist) return;
    try {
      (nav.storage.persisted ? nav.storage.persisted() : Promise.resolve(false)).then(function (p) { return p || nav.storage.persist(); })
        .then(function (r) { P.persisted = !!r; }, function () { P.persisted = false; });
    } catch (e) { }
  }
  persist();
  // Safari часто даёт разрешение только после взаимодействия — повторим на первом касании
  if (doc) doc.addEventListener('touchend', function once() { doc.removeEventListener('touchend', once, true); if (!P.persisted) persist(); }, true);

  /* ---------- iOS: жесты ---------- */
  if (doc) {
    // щипок-масштаб (iOS игнорирует user-scalable=no)
    doc.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });
    doc.addEventListener('dblclick', function (e) { e.preventDefault(); }, { passive: false });
    // долгий тап по картинкам не должен открывать меню «Сохранить изображение»
    doc.addEventListener('contextmenu', function (e) { if (!e.target.closest || !e.target.closest('textarea,input')) e.preventDefault(); });
  }

  /* ---------- блок в настройках ---------- */
  function ago(t) {
    if (!t) return 'ещё не было';
    var d = Math.floor((Date.now() - t) / DAY);
    return d <= 0 ? 'сегодня' : d === 1 ? 'вчера' : d + ' ' + (d % 10 === 1 && d % 100 !== 11 ? 'день' : d % 10 >= 2 && d % 10 <= 4 && (d % 100 < 10 || d % 100 >= 20) ? 'дня' : 'дней') + ' назад';
  }
  P.settingsHTML = function () {
    if (hasBridge) return '';
    var h = '';
    if (isIOS) {
      var le = P.lastExport(), old = !le || Date.now() - le > 7 * DAY;
      h += '<div class="pf-note' + (old ? ' warn' : '') + '"><b>💾 Сохранение на iPhone</b><br>Прогресс хранится только в памяти этого ' + (standalone ? 'приложения' : 'браузера') +
        '. Раз в неделю сохраняйте его кнопкой «Экспорт» (скопировать или «Сохранить файлом» в «Файлы»): так он переживёт очистку Safari и смену телефона.' +
        (standalone ? '' : ' Игра в Safari и игра на экране «Домой» хранят прогресс <b>раздельно</b> — перенесите его экспортом/импортом.') +
        '<br><span class="muted">Последний экспорт: ' + esc(ago(le)) + '</span></div>';
      if (isIOSSafari && !standalone) h += '<div class="pf-note"><b>📲 Установить на экран «Домой»</b><br>Нажмите <b>«Поделиться»</b> ' + SHARE_ICO + ' внизу Safari → <b>«На экран Домой»</b> → «Добавить». Игра откроется на весь экран и будет работать без интернета.</div>';
    }
    if (isPWA) h += '<p class="small muted">' + (P.sw.controlled ? 'Офлайн-режим: игра сохранена на устройстве ✓' : 'Офлайн-режим: подготовка…') + (P.persisted ? ' · хранилище защищено от очистки' : '') + '</p>';
    return h;
  };
  var SHARE_ICO = '<svg class="pf-share" viewBox="0 0 20 24" width="15" height="18" aria-label="Поделиться"><path d="M10 1v14M5 6l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10H3v13h14V10h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

  /* ---------- плашки: подсказка установки и обновление ---------- */
  function bar(cls, html) {
    var app = doc.getElementById('app') || doc.body, el = doc.createElement('div');
    el.className = 'pf-bar ' + cls; el.innerHTML = html; app.appendChild(el); return el;
  }
  function a2hsHint() {
    if (!isIOSSafari || standalone || hasBridge) return;
    var hid = +ls(K_HINT); if (hid && Date.now() - hid < 3 * DAY) return;
    var el = bar('pf-a2hs', '<img src="img/ui/icon.webp" alt=""><div><b>Установите «Замок удачи»</b><br>Нажмите «Поделиться» ' + SHARE_ICO + ' → «На экран Домой». Полный экран и игра без интернета.</div><button class="pf-x" aria-label="Скрыть">✕</button>');
    el.querySelector('.pf-x').addEventListener('click', function (e) { e.stopPropagation(); ls(K_HINT, Date.now()); el.remove(); });
  }
  P.showUpdate = function (onClick) {
    if (doc.querySelector('.pf-upd')) return;
    var el = bar('pf-upd', '<div><b>Доступно обновление</b><br><span class="muted">Прогресс сохранится</span></div><button class="btn sm">Обновить</button>');
    el.querySelector('button').addEventListener('click', function () { el.querySelector('button').textContent = '…'; onClick(); });
  };

  /* ---------- Service Worker (только веб-версия по http/https) ---------- */
  function setupSW() {
    if (!isPWA) return;
    var reloading = false, reg = null;
    function ready(w) { P.sw.updateReady = true; P.showUpdate(function () { if (root.CLGame) try { root.CLGame.saveNow(); } catch (e) { } w.postMessage({ type: 'SKIP_WAITING' }); setTimeout(function () { location.reload(); }, 3000); }); }
    nav.serviceWorker.addEventListener('controllerchange', function () {
      var first = !P.sw.controlled; P.sw.controlled = true;
      if (first || reloading) return; // первая установка — просто взяли управление
      reloading = true; if (root.CLGame) try { root.CLGame.saveNow(); } catch (e) { } location.reload();
    });
    nav.serviceWorker.register('sw.js').then(function (r) {
      reg = r; P.sw.registered = true;
      if (r.waiting && nav.serviceWorker.controller) ready(r.waiting);
      r.addEventListener('updatefound', function () {
        var w = r.installing; if (!w) return;
        w.addEventListener('statechange', function () { if (w.state === 'installed' && nav.serviceWorker.controller) ready(w); });
      });
    }, function (e) { P.sw.error = String(e && e.message || e); });
    // ярлык на «Домой» почти не перезагружается — проверяем обновление при каждом возврате в игру
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden && reg) try { reg.update(); } catch (e) { } });
    P.checkUpdate = function () { return reg ? reg.update() : Promise.resolve(); };
  }

  function boot() {
    if (isIOS) doc.documentElement.classList.add('ios');
    if (standalone) doc.documentElement.classList.add('standalone');
    setupSW();
    var n = 0, iv = setInterval(function () { if (root.__ready || ++n > 40) { clearInterval(iv); setTimeout(a2hsHint, 1500); } }, 250);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
