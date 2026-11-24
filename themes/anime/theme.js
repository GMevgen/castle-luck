/* 0.7: тема «Аниме» — исходный стиль игры. Названия, тексты и палитра — родные (data.js, css/style.css), поэтому словарь пуст. */
(function (root) {
  var CL = root.CL = root.CL || {};
  CL.ThemeData = {
    id: 'anime', title: 'Замок удачи', themeColor: '#8f2a1a',
    names: {}, terms: [],
    iso: { smoke: null, labelFont: 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif' },
    fx: { ambient: 'fireflies' }
  };
})(typeof window !== 'undefined' ? window : globalThis);
