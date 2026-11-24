/* 0.7: реестр стилей оформления. Грузится ДО всего остального: выбирает активную тему и ставит <base href="themes/<id>/">,
   поэтому все относительные пути игры (img/..., isomask.js, theme.css) ведут в папку темы, а общие файлы подключаются как ../../css, ../../js.
   Смена темы = сохранить игру, записать выбор и перезагрузить страницу — так в памяти не остаётся ни одной картинки чужого стиля. */
(function (root) {
  'use strict';
  var CL = root.CL = root.CL || {};
  var KEY = 'castleLuck.theme';
  var LIST = [
    { id: 'anime', name: 'Аниме', ready: true, desc: 'Тёплая акварель, замок, долина и ворон Карр. Стиль по умолчанию.' },
    { id: 'cyber', name: 'Киберпанк', ready: true, desc: 'Неон, стальные плиты, квартал небоскрёбов, кредиты и голограмма ворона.' },
    { id: 'dark', name: 'Тёмное фэнтези', ready: false, desc: 'Мрачные руины, готика и холодный свет луны.' },
    { id: 'pencil', name: 'Карандаш', ready: false, desc: 'Чёрно-белая штриховка разорённого края с редкими пятнами цвета.' },
    { id: 'cpencil', name: 'Цветные карандаши', ready: false, desc: 'Тёплый рисунок цветными карандашами.' },
    { id: 'toon', name: 'Мультяшный', ready: false, desc: 'Яркая мультяшная долина: сочные цвета и круглые формы.' }
  ];
  var BY = {}; LIST.forEach(function (t) { BY[t.id] = t; });
  function ls(k, v) { try { if (v === undefined) return root.localStorage.getItem(k); if (v === null) root.localStorage.removeItem(k); else root.localStorage.setItem(k, v); } catch (e) { return null; } }
  function valid(id) { return !!(id && BY[id] && BY[id].ready); }
  var q = (root.location && /[?&]theme=([a-z]+)/.exec(root.location.search)) || null;   // для тестов/скриншотов: ?theme=cyber
  var id = q && valid(q[1]) ? q[1] : ls(KEY);
  if (!valid(id)) id = 'anime';
  if (q && valid(q[1])) ls(KEY, id);
  CL.THEMES = { list: LIST, byId: BY, active: id, key: KEY, valid: valid, store: function (v) { ls(KEY, v); } };
  /* Все файлы пишутся отсюда (а не тегами в index.html), иначе сканер предзагрузки браузера успевает запросить их
     по адресу без <base> — лишние 404 и запросы. Только файлы активной темы попадают на страницу. */
  var CSS = ['../../css/style.css', 'theme.gen.css', 'theme.css'];
  var JS = ['../../js/platform.js', '../../js/rng.js', '../../js/data.js', '../../js/engine.js', '../../js/story2.js', '../../js/extra.js', '../../js/audio.js',
    'theme.js', 'isomask.js', '../../js/theme-rt.js', '../../js/iso-fx.js', '../../js/iso.js', '../../js/ui.js', '../../js/ui-extra.js', '../../js/ui-v07.js'];
  CL.THEMES.css = CSS; CL.THEMES.js = JS;
  CL.THEMES.writeScripts = function () { root.document.write(JS.map(function (f) { return '<script src="' + f + '"><\/script>'; }).join('')); };
  if (root.document && root.document.write) root.document.write('<base href="themes/' + id + '/">' + CSS.map(function (f) { return '<link rel="stylesheet" href="' + f + '">'; }).join(''));
  if (root.document && root.document.documentElement) root.document.documentElement.setAttribute('data-theme', id);
})(typeof window !== 'undefined' ? window : globalThis);
