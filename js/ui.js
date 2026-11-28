/* Замок удачи — интерфейс. */
(function () {
  'use strict';
  var D = CL.Data, E = CL.Engine, S = CL.Sfx;
  var rng = new CL.Rng(); // crypto.getRandomValues
  var SAVE_KEY = 'castleLuck.save', BAK_KEY = 'castleLuck.save.bak';
  var state, screen = 'slot', qtab = 'story', spinning = false, auto = false, coinOffset = 0, lastWin = '';
  var reelPos = [40, 45, 50], cellH = 100, strips = [], modalStack = [], sheetCtx = null, readyChests = {};
  var fps = { frames: 0, t0: 0, samples: [] };
  var IC = { coin: 'img/sym/0.webp', energy: 'img/sym/3.webp', xp: 'img/sym/4.webp', mana: 'img/sym/5.webp', key: 'img/sym/8.webp',
             seal: 'img/skill/5.webp', cards: 'img/sym/6.webp', chest: 'img/sym/7.webp', bag: 'img/sym/1.webp' };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function now() { return Date.now() + (window.__timeOffset || 0); }

  /* ---------- форматирование ---------- */
  function grp(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f'); }
  function fmt(n) {
    n = Math.round(n || 0); var a = Math.abs(n);
    if (a < 100000) return grp(n);
    if (a < 1e6) return (n / 1e3).toFixed(a < 1e5 ? 1 : 0).replace('.', ',') + ' тыс';
    if (a < 1e9) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + ' млн';
    if (a < 1e12) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + ' млрд';
    return (n / 1e12).toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + ' трлн';
  }
  /* v0.6: компактные числа для верхней панели: 9 999 · 12.5K · 125K · 1.2M · 3.4B */
  function fmtK(n) {
    n = Math.round(n || 0); var a = Math.abs(n), u = '', v = n;
    if (a < 10000) return grp(n);
    if (a < 1e6) { v = n / 1e3; u = 'K'; } else if (a < 1e9) { v = n / 1e6; u = 'M'; } else if (a < 1e12) { v = n / 1e9; u = 'B'; } else { v = n / 1e12; u = 'T'; }
    var av = Math.abs(v), s = av < 100 ? (Math.floor(av * 10) / 10).toFixed(1).replace(/\.0$/, '') : String(Math.floor(av));
    return (v < 0 ? '-' : '') + s + u;
  }
  function fmtTime(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    if (d) return d + 'д ' + h + 'ч'; if (h) return h + 'ч ' + (m < 10 ? '0' : '') + m + 'м';
    if (m) return m + 'м ' + (sec < 10 ? '0' : '') + sec + 'с'; return sec + 'с';
  }
  function fmtXp(x) { x = Math.round((x || 0) * 10) / 10; return String(x).replace('.', ','); }
  function plural(n, a, b, c) { n = Math.abs(n) % 100; var n1 = n % 10; if (n > 10 && n < 20) return c; if (n1 > 1 && n1 < 5) return b; if (n1 === 1) return a; return c; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pill(icon, txt) { return '<span class="pill"><img src="' + icon + '">' + txt + '</span>'; }
  function bar(v, max, cls) { return '<div class="bar ' + (cls || '') + '"><i style="width:' + Math.min(100, max ? v / max * 100 : 0).toFixed(1) + '%"></i></div>'; }
  function timerSpan(end) { return '<span class="timer" data-end="' + end + '">' + fmtTime(end - now()) + '</span>'; }
  function rewardPills(rw) {
    var d = E.derived(state), out = [];
    if (rw.coinsB) out.push(pill(IC.coin, fmt(rw.coinsB * d.B)));
    if (rw.energy) out.push(pill(IC.energy, '+' + rw.energy));
    if (rw.mana) out.push(pill(IC.mana, '+' + rw.mana));
    if (rw.keys) out.push(pill(IC.key, '+' + rw.keys));
    if (rw.chest != null) out.push(pill(D.CHESTS[rw.chest].img, D.CHESTS[rw.chest].name.split(' ')[0]));
    if (rw.cards) out.push(pill(IC.cards, '+' + rw.cards));
    if (rw.eventCards) out.push(pill(IC.cards, '+' + rw.eventCards + ' карт события'));
    if (rw.seals) out.push(pill(IC.seal, '+' + rw.seals));
    return out.join(' ');
  }

  /* ---------- сохранение ---------- */
  function load() {
    var src = 'new', raw;
    try { raw = localStorage.getItem(SAVE_KEY); if (raw) { state = E.deserialize(raw, now()); src = 'main'; } } catch (e) { console.warn('save main', e); state = null; }
    if (!state) try { raw = localStorage.getItem(BAK_KEY); if (raw) { state = E.deserialize(raw, now()); src = 'backup'; } } catch (e) { state = null; }
    if (!state && window.AndroidBridge) try { raw = window.AndroidBridge.load(); if (raw) { state = E.deserialize(raw, now()); src = 'android'; } } catch (e) { state = null; }
    if (!state) { state = E.newState(now()); src = 'new'; }
    return src;
  }
  var saveTimer = null;
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 300); }
  function saveNow() {
    clearTimeout(saveTimer);
    var j = E.serialize(state);
    try { var prev = localStorage.getItem(SAVE_KEY); if (prev) localStorage.setItem(BAK_KEY, prev); localStorage.setItem(SAVE_KEY, j); } catch (e) { console.warn(e); }
    if (window.AndroidBridge) try { window.AndroidBridge.save(j); } catch (e) { }
  }

  /* ---------- модальные окна ---------- */
  function openOverlay(inner, cls, onClose) {
    var o = document.createElement('div'); o.className = 'overlay ' + (cls || '');
    o.innerHTML = inner; $('#app').appendChild(o);
    var m = { el: o, onClose: onClose }; modalStack.push(m);
    o.addEventListener('click', function (e) { if (e.target === o && !o.classList.contains('center')) closeModal(m); });
    return m;
  }
  function closeModal(m) {
    m = m || modalStack[modalStack.length - 1]; if (!m) return;
    var i = modalStack.indexOf(m); if (i >= 0) modalStack.splice(i, 1);
    if (m.el.parentNode) m.el.parentNode.removeChild(m.el);
    if (sheetCtx && sheetCtx.m === m) sheetCtx = null;
    if (m.onClose) m.onClose();
    setTimeout(function () { if (typeof pumpScenes === 'function') pumpScenes(); }, 350);
  }
  function modalOpen() { return tutOpen || modalStack.length > 0 || !!$('.story') || !!$('.viewer'); }
  function openSheet(title, renderFn) {
    var m = openOverlay('<div class="sheet"><div class="grab"><h2 style="margin:0">' + title + '</h2><button class="close" data-act="close">✕</button></div><div class="content"></div></div>');
    sheetCtx = { m: m, render: renderFn };
    m.el.querySelector('.content').innerHTML = renderFn();
    return m;
  }
  function refreshSheet() {
    if (!sheetCtx || !sheetCtx.m.el.parentNode) return;
    var sh = sheetCtx.m.el.querySelector('.sheet'), top = sh.scrollTop;
    sheetCtx.m.el.querySelector('.content').innerHTML = sheetCtx.render(); sh.scrollTop = top;
  }
  function dialog(html, buttons) {
    var b = (buttons || [{ t: 'Отлично!', act: 'close' }]).map(function (x) { return '<button class="btn ' + (x.cls || '') + ' wide" data-act="' + x.act + '" ' + (x.data || '') + '>' + x.t + '</button>'; }).join('<div style="height:8px"></div>');
    return openOverlay('<div class="dialog">' + html + '<div style="margin-top:12px">' + b + '</div></div>', 'center');
  }
  var queue = [];
  function enqueue(fn) { queue.push(fn); if (queue.length === 1) fn(); }
  function dequeue() { queue.shift(); if (queue.length) setTimeout(queue[0], 120); }
  function queuedDialog(html, buttons) { enqueue(function () { var m = dialog(html, buttons); m.onClose = dequeue; }); }
  function toast(html, img) {
    var t = document.createElement('div'); t.className = 'toast'; t.innerHTML = (img ? '<img src="' + img + '">' : '') + '<span>' + html + '</span>';
    var box = $('#toasts'); box.appendChild(t); while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2900);
  }

  /* ---------- награды ---------- */
  /* «Живая» карта: мерцание, лёгкое покачивание, параллакс-наклон пальцем, частицы для эпических/легендарных */
  function particles(r) { return (r === 'E' || r === 'L') ? '<span class="pt">' + (r === 'L' ? '<i></i><i></i><i></i><i></i><i></i><i></i>' : '<i></i><i></i><i></i><i></i>') + '</span>' : ''; }
  var cardSeq = 0;
  function cardMini(res, delay) {
    var c = D.CARD_BY_ID[res.id];
    return '<div class="kcard live tilt r-' + c.r + ' flip" style="animation-delay:' + (delay || 0) + 'ms;--d:' + ((cardSeq++ % 7) * 0.7).toFixed(1) + 's"><img src="' + c.img + '" loading="lazy">' + particles(c.r) + '<div class="kn">' + esc(c.name) + '</div>' + (res.isNew ? '<span class="new">НОВАЯ</span>' : '') + '</div>';
  }
  function rewardHTML(r) {
    if (!r) return '';
    var it = [];
    if (r.coins) it.push('<div class="rw"><img src="' + IC.coin + '">' + fmt(r.coins) + '</div>');
    if (r.energy) it.push('<div class="rw"><img src="' + IC.energy + '">+' + r.energy + '</div>');
    if (r.mana) it.push('<div class="rw"><img src="' + IC.mana + '">+' + r.mana + '</div>');
    if (r.keys) it.push('<div class="rw"><img src="' + IC.key + '">+' + r.keys + '</div>');
    if (r.seals) it.push('<div class="rw"><img src="' + IC.seal + '">+' + r.seals + '</div>');
    if (r.chest != null) it.push('<div class="rw"><img src="' + D.CHESTS[r.chest].img + '">' + D.CHESTS[r.chest].name.split(' ')[0] + '</div>');
    var h = it.length ? '<div class="rewards">' + it.join('') + '</div>' : '';
    if (r.cards && r.cards.length) h += '<div class="mini-cards">' + r.cards.map(function (c, i) { return cardMini(c, i * 90); }).join('') + '</div>';
    if (r.chestToCoins) h += '<div class="muted small">Нет места для сундука — он превращён в монеты.</div>';
    return h;
  }
  function showReward(title, r, img) {
    var cl = (r && r.cards || []).filter(function (c) { return c.completed; });
    queuedDialog((img ? '<img src="' + img + '" style="width:120px;height:120px;object-fit:contain;margin:0 auto 6px">' : '') + '<h2>' + title + '</h2>' + rewardHTML(r));
    cl.forEach(function (c) { showCollectionDone(c.completed); });
    if (r && r.cards && r.cards.length) S.card();
  }
  function showCollectionDone(cd) {
    var col = D.COL_BY_ID[cd.col], k; var bonus = [];
    for (k in col.bonus) bonus.push(D.BONUS_TEXT[k](col.bonus[k]));
    queuedDialog('<div class="cgrid" style="margin-bottom:10px">' + col.cards.map(function (c, i) { return '<div class="kcard live tilt flip r-' + c.r + '" style="animation-delay:' + i * 80 + 'ms;--d:' + (i * 0.5) + 's"><img src="' + c.img + '">' + particles(c.r) + '<div class="kn">' + esc(c.name) + '</div></div>'; }).join('') + '</div>' +
      '<h2>Коллекция собрана!</h2><div class="serif" style="font-size:18px">«' + col.name + '»</div><p>Постоянный бонус: <b class="ok">' + bonus.join(', ') + '</b></p>' + rewardHTML({ coins: E.derived(state).B * cd.reward.coinsB, energy: cd.reward.energy, chest: cd.reward.chest }));
    S.bigWin();
  }
  function showLevelUps(list) {
    list.forEach(function (lu) {
      var newBet = D.BETS.filter(function (b) { return b.lvl === lu.level; })[0];
      var cols = D.COLLECTIONS.filter(function (c) { return !c.event && c.unlock === lu.level; });
      var blds = D.BUILDINGS.filter(function (b) { return b.unlock === lu.level; });
      var extra = [];
      if (newBet) extra.push('Новая ставка: <b>×' + newBet.x + '</b>');
      cols.forEach(function (c) { extra.push('Новая коллекция: <b>' + c.name + '</b>'); });
      blds.forEach(function (b) { extra.push('Можно построить: <b>' + b.name + '</b>'); });
      queuedDialog('<div class="lvl" style="width:90px;height:90px;font-size:38px;margin:4px auto 10px">' + lu.level + '</div><h2>Новый уровень!</h2>' +
        rewardHTML({ energy: lu.reward.energy, coins: E.derived(state).B * lu.reward.coinsB, keys: lu.reward.keys }) + (extra.length ? '<p>' + extra.join('<br>') + '</p>' : ''));
      S.level();
    });
  }

  /* ---------- верхняя панель и навигация ---------- */
  function buildTop() {
    $('#top').innerHTML =
      '<button class="lvl" data-act="profile" id="tLvl"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" fill="none" stroke="rgba(0,0,0,.5)" stroke-width="4"/><circle id="tRing" cx="26" cy="26" r="24" fill="none" stroke="#7cc4ff" stroke-width="4" stroke-linecap="round" stroke-dasharray="150.8" stroke-dashoffset="150.8"/></svg><span id="tLv">1</span></button>' +
      resChip('coins', IC.coin, 'tCoins', '') + resChip('energy', IC.energy, 'tEnergy', 'tEnergyMax') +
      resChip('mana', IC.mana, 'tMana', 'tManaMax') + resChip('keys', IC.key, 'tKeys', 'tKeysMax') +
      '<button class="gear" data-act="settings" aria-label="Настройки">⚙</button>';
  }
  function resChip(k, ic, id, idMax) {
    return '<button class="res ' + k + '" data-act="resInfo" data-r="' + k + '" aria-label="' + RES_NAME[k] + '"><span class="ri"' + (k === 'energy' ? ' id="tERing"' : '') + '><img src="' + ic + '" alt=""></span>' +
      '<span class="tx"><b class="v" id="' + id + '">0</b>' + (idMax ? '<span class="mx" id="' + idMax + '"></span>' : '') + '</span></button>';
  }
  var RES_NAME = { coins: 'Монеты', energy: 'Энергия', mana: 'Мана', keys: 'Ключи' };
  function resInfo(k) {
    var d = E.derived(state, now()), t;
    if (k === 'coins') t = 'Монеты: ' + grp(state.coins) + '. Лимита нет — копите сколько угодно.';
    else if (k === 'energy') t = 'Энергия: ' + state.energy + ' из ' + d.maxEnergy + (state.energy >= d.maxEnergy ? '. Полная!' : '. +1 через ' + fmtTime(state.energyT + d.regenMs - Math.max(now(), state.time.high)));
    else if (k === 'mana') t = 'Мана: ' + state.mana + ' из ' + d.maxMana + '. Для заклинаний Башни архимага.';
    else t = 'Ключи: ' + state.keys + ' из ' + d.maxKeys + '. Открывают сундуки сразу. Связку расширяет Склад.';
    toast(t, IC[k === 'coins' ? 'coin' : k === 'keys' ? 'key' : k]);
  }
  function updateTop() {
    var d = E.derived(state, now()), need = D.xpNeed(state.level);
    $('#tLv').textContent = state.level;
    $('#tRing').setAttribute('stroke-dashoffset', (150.8 * (1 - Math.min(1, state.xp / need))).toFixed(1));
    $('#tCoins').textContent = fmtK(state.coins - coinOffset);
    $('#tEnergy').textContent = fmtK(state.energy);
    $('#tEnergyMax').textContent = '/' + fmtK(d.maxEnergy);
    var ep = state.energy >= d.maxEnergy ? 100 : 100 * (1 - Math.max(0, state.energyT + d.regenMs - Math.max(now(), state.time.high)) / d.regenMs);
    $('#tERing').style.setProperty('--p', ep.toFixed(1));
    $('#tMana').textContent = fmtK(state.mana);
    $('#tManaMax').textContent = '/' + fmtK(d.maxMana);
    $('#tKeys').textContent = fmtK(state.keys);
    $('#tKeysMax').textContent = '/' + fmtK(d.maxKeys);
    var n = E.notifications(state, now()); $('#top').classList.toggle('has-new', !!n.quests);
    setBadge('castle', n.castle); setBadge('quests', n.quests); setBadge('events', n.events);
    updateDeco();
  }
  function setBadge(id, n) { var b = $('#nav [data-to="' + id + '"] .badge'); if (!b) return; b.textContent = n; b.classList.toggle('hidden', !n); }
  function buildNav() {
    var ev = E.currentEvent(now()).ev;
    var items = [['slot', 'Удача', 'img/sym/2.webp'], ['castle', 'Замок', 'img/bld/citadel.webp'], ['cards', 'Карты', IC.cards], ['quests', 'Задания', IC.xp], ['events', 'Событие', ev.banner]];
    $('#nav').innerHTML = items.map(function (it) { return '<button data-act="go" data-to="' + it[0] + '" class="' + (screen === it[0] ? 'on' : '') + '"><img src="' + it[2] + '"><span>' + it[1] + '</span><span class="badge hidden">0</span></button>'; }).join('');
  }
  function go(to) {
    if (spinning && to !== 'slot') { auto = false; }
    if (to !== 'castle' && iso) { iso.destroy(); iso = null; }
    screen = to; buildNav(); renderScreen(); updateTop(); $('#screen').scrollTop = 0;
  }
  function renderScreen() {
    var el = $('#screen');
    if ($('#app')) $('#app').classList.toggle('slot-deco', screen === 'slot' && slotDeco());
    el.classList.toggle('iso-mode', screen === 'castle');
    if (screen !== 'castle' && iso) { iso.destroy(); iso = null; }
    if (screen === 'slot') { el.innerHTML = renderSlot(); mountSlot(); }
    else if (screen === 'castle') { if (iso && iso.alive() && $('#isoHud')) updateCastle(); else { el.innerHTML = renderCastle(); mountCastle(); } }
    else if (screen === 'cards') el.innerHTML = renderCards();
    else if (screen === 'quests') el.innerHTML = renderQuests();
    else if (screen === 'events') el.innerHTML = renderEvents();
  }
  function refreshAll() {
    updateTop();
    if (screen === 'slot') { updateSlotUI(); }
    else { var el = $('#screen'), top = el.scrollTop; renderScreen(); el.scrollTop = top; }
    refreshSheet(); save();
  }

  /* ---------- экран слота ---------- */
  function stripHTML() {
    var h = ''; for (var k = 0; k < 3; k++) for (var i = 0; i < D.STRIP.length; i++) h += '<div class="cell"><img src="' + D.SYMBOLS[D.STRIP[i]].img + '" alt=""></div>';
    return h;
  }
  function renderSlot() {
    var ce = E.currentEvent(now());
    return '<div class="slot"><div class="bgimg" style="background-image:url(img/ui/castle_bg.webp)"></div>' +
      '<button class="evstrip" data-act="go" data-to="events"><img src="' + ce.ev.banner + '"><div class="grow" style="text-align:left"><b>' + ce.ev.name + '</b><div class="small muted">' + ce.ev.bonusText + '</div></div><span class="pill">' + timerSpan(ce.end) + '</span></button>' +
      evBarHTML(ce) + (window.CLX ? CLX.slotBarHTML() : '') +
      (slotDeco() ? decoTop(ce) : '') +
      '<div class="machine"><div class="title">✦ Колесо Судьбы ✦</div><div class="reels" id="reels">' +
      [0, 1, 2].map(function (i) { return '<div class="reel" id="reel' + i + '"><div class="strip" id="strip' + i + '">' + stripHTML() + '</div><div class="hl"></div></div>'; }).join('') +
      '<div class="payline"></div></div></div>' +
      (slotDeco() ? '<div class="tdeco tenergy"><div class="trk"><i id="tEnFill"></i><b id="tEnTxt"></b></div><div class="plank" id="tEnNext"></div></div>' : '') +
      '<div class="winline" id="winline">' + (lastWin || '<span class="muted">Потяните рычаг судьбы — нажмите «Крутить»</span>') + '</div>' +
      '<div class="spells-active" id="spellsActive"></div>' +
      '<div class="controls">' + (slotDeco() ? '<button class="tdeco tcards" data-act="go" data-to="cards" aria-label="Карты"><img src="img/extra/cards.webp" alt=""></button>' : '') + '<div class="betbox"><span class="small muted">Ставка</span><span class="val" id="betVal">×1</span><div class="arrows"><button data-act="bet" data-d="-1" aria-label="меньше">−</button><button data-act="bet" data-d="1" aria-label="больше">+</button></div></div>' +
      '<button class="spinbtn" id="spinBtn" data-act="spin">' + (slotDeco() ? 'СПИН' : 'КРУТИТЬ') + '<small id="spinCost"></small></button>' +
      '<div class="side"><button class="toggle" id="autoBtn" data-act="auto">АВТО</button><button class="toggle" id="turboBtn" data-act="turbo">ТУРБО</button></div></div>' +
      '<div class="row"><button class="btn sec sm grow" data-act="spells">✨ Заклинания</button><button class="btn sec sm grow" data-act="paytable">📜 Выплаты</button></div>' + (window.CLX ? CLX.slotButtonsHTML() : '') +
      '<div class="chests" id="chests"></div>' +
      '</div>';
  }
  /* 0.9.1: украшения экрана удачи только в стиле «Монеточка» (slotDeco) */
  function slotDeco() { return !!(window.CL && CL.Theme && CL.Theme.iso && CL.Theme.iso('slotDeco', false)); }
  function decoTop(ce) {
    var h = { img: D.CHARS.hero.img, name: D.CHARS.hero.name };
    return '<div class="tdeco troof"><img class="roofimg" src="img/extra/roof.webp" alt="">' +
      '<button class="tjar" data-act="go" data-to="events"><img src="img/extra/jar.webp" alt=""><span class="tag">' + timerSpan(ce.end) + '</span></button>' +
      '<div class="tplate"><img src="' + h.img + '" alt=""><div class="tpt"><b>' + esc(h.name).toUpperCase() + '</b><span><img src="' + IC.coin + '" alt=""><i id="tPlCoins"></i></span></div><em id="tPlBet">Х 1</em></div>' +
      '<img class="twand" src="img/extra/wand.webp" alt="">' +
      '<span class="tshd" id="tShd"></span><button class="trac" data-act="xch"><img src="img/extra/raccoon.webp" alt=""><span class="plank">ОБМЕНЯТЬ</span></button></div>' +
      '<img class="tdeco tpup" src="img/guide/raven.webp" alt="">';
  }
  function updateDeco() {
    var c = $('#tPlCoins'); if (!c) return;
    var d = E.derived(state, now()); c.textContent = grp(state.coins - coinOffset); $('#tShd').textContent = '🛡×' + ((state.raid && state.raid.shields) || 0); $('#tPlBet').textContent = 'Х ' + state.bet;
    $('#tEnTxt').textContent = state.energy + '/' + d.maxEnergy;
    $('#tEnFill').style.width = Math.min(100, state.energy / d.maxEnergy * 100).toFixed(1) + '%';
    var left = state.energyT + d.regenMs - Math.max(now(), state.time.high);
    $('#tEnNext').textContent = state.energy >= d.maxEnergy ? 'Энергия полная' : '+1 энергия через ' + fmtTime(left);
  }
    /* ---------- шкала предметов события (единственное место, где видны предметы) ---------- */
  function evBarHTML(ce) {
    var it = ce.ev.item;
    return '<div class="evbar" id="evbar"><div class="ico" id="evIco"><img src="' + it.img + '" alt=""></div><div class="grow"><div class="small" style="font-weight:800;margin:0 0 3px 2px" id="evTitle"></div><div class="trk"><i id="evFill"></i><span id="evTxt"></span></div></div><div class="erw" id="evRw"></div></div>';
  }
  function updateEvBar() {
    if (!$('#evFill')) return;
    var ce = E.currentEvent(now()), b = E.eventBar(state), rw = b.reward, ic = [];
    $('#evTitle').textContent = ce.ev.item.name + ' · этап ' + (b.stage + 1) + (b.loop ? ' (бонусный)' : ' из ' + D.EVENT_BAR.length);
    $('#evFill').style.width = Math.min(100, b.items / b.need * 100).toFixed(1) + '%';
    $('#evTxt').textContent = b.items + ' / ' + b.need;
    if (rw.energy) ic.push('<img src="' + IC.energy + '">+' + rw.energy);
    if (rw.chest != null) ic.push('<img src="' + D.CHESTS[rw.chest].img + '">');
    else if (rw.eventCards) ic.push('<img src="' + IC.cards + '">');
    else if (rw.keys) ic.push('<img src="' + IC.key + '">');
    else if (rw.mana) ic.push('<img src="' + IC.mana + '">');
    else if (rw.coinsB) ic.push('<img src="' + IC.coin + '">');
    $('#evRw').innerHTML = ic.join('');
  }
  function flyItems(r, onArrive) {
    var app = $('#app'), ico = $('#evIco'); if (!ico || !r.eventItems) { if (onArrive) onArrive(); return; }
    var ar = app.getBoundingClientRect(), tr = ico.getBoundingClientRect(), ev = E.currentEvent(now()).ev, n = Math.min(6, r.eventItems);
    var srcIdx = []; r.syms.forEach(function (sy, i) { if (D.SYMBOLS[sy].id === ev.sym) srcIdx.push(i); }); if (!srcIdx.length) srcIdx = [1];
    for (var i = 0; i < n; i++) (function (i) {
      var reel = $('#reel' + srcIdx[i % srcIdx.length]); if (!reel) return;
      var rr = reel.getBoundingClientRect(), p = document.createElement('img'); p.src = ev.item.img; p.className = 'flyitem';
      var x = rr.left - ar.left + rr.width / 2 - 17 + (i % 3 - 1) * 10, y = rr.top - ar.top + rr.height / 2 - 17;
      p.style.left = x + 'px'; p.style.top = y + 'px'; p.style.animationDelay = (i * 70) + 'ms';
      p.style.setProperty('--dx', (tr.left - ar.left + 6 - x) + 'px'); p.style.setProperty('--dy', (tr.top - ar.top + 6 - y) + 'px');
      app.appendChild(p); setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 800 + i * 70);
    })(i);
    setTimeout(function () { var ic2 = $('#evIco'); if (ic2) { ic2.classList.remove('bump'); void ic2.offsetWidth; ic2.classList.add('bump'); } S.coin(); if (onArrive) onArrive(); }, 650 + n * 70);
  }
  /* выпавшая карта: рубашка переворачивается лицом и улетает к вкладке «Карты» */
  var popQueue = [], popBusy = false;
  function cardPop(res) { popQueue.push(res); if (!popBusy) nextPop(); }
  function nextPop() {
    var res = popQueue.shift(); if (!res) { popBusy = false; return; } popBusy = true;
    var k = D.CARD_BY_ID[res.id], app = $('#app'), el = document.createElement('div'); el.className = 'cardpop';
    var gc = { C: 'rgba(255,240,200,.7)', R: 'rgba(140,200,255,.8)', E: 'rgba(200,150,255,.85)', L: 'rgba(255,210,90,.95)' }[k.r];
    el.style.setProperty('--gc', gc);
    el.innerHTML = '<div class="glow"></div><div class="fl"><div class="back"></div><div class="kcard live r-' + k.r + '"><img src="' + k.img + '">' + particles(k.r) + '<div class="kn">' + esc(k.name) + '</div>' + (res.isNew ? '<span class="new">НОВАЯ</span>' : '') + '</div></div>';
    app.appendChild(el);
    var hold = (k.r === 'E' || k.r === 'L' || res.isNew) ? 1300 : 800;
    setTimeout(function () {
      var nb = $('#nav [data-to="cards"]'), ar = app.getBoundingClientRect(), er = el.getBoundingClientRect();
      if (nb) { var nr = nb.getBoundingClientRect(); el.style.setProperty('--dx', (nr.left + nr.width / 2 - (er.left + er.width / 2)) + 'px'); el.style.setProperty('--dy', (nr.top - (er.top + er.height / 2)) + 'px'); }
      el.classList.add('out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); nextPop(); }, 560);
    }, (state.settings.turbo ? 500 : 900) + hold);
  }
  /* наклон карт пальцем/мышью (параллакс картинки внутри рамки) */
  function tiltAt(el, cx, cy) {
    var r = el.getBoundingClientRect(), x = (cx - r.left) / r.width - 0.5, y = (cy - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', (x * 22).toFixed(1) + 'deg'); el.style.setProperty('--rx', (-y * 22).toFixed(1) + 'deg');
    el.style.setProperty('--tx', (-x * 10).toFixed(1) + 'px'); el.style.setProperty('--ty', (-y * 10).toFixed(1) + 'px');
  }
  function untilt(el) { ['--rx', '--ry', '--tx', '--ty'].forEach(function (v) { el.style.removeProperty(v); }); }
  var tiltEl = null;
  document.addEventListener('pointermove', function (e) {
    var el = e.target.closest && e.target.closest('.tilt');
    if (tiltEl && tiltEl !== el) { untilt(tiltEl); tiltEl = null; }
    if (el) { tiltEl = el; tiltAt(el, e.clientX, e.clientY); }
  }, { passive: true });
  document.addEventListener('pointerdown', function (e) { var el = e.target.closest && e.target.closest('.tilt'); if (el) { tiltEl = el; tiltAt(el, e.clientX, e.clientY); } }, { passive: true });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) { document.addEventListener(t, function () { if (tiltEl) { untilt(tiltEl); tiltEl = null; } }, { passive: true }); });

  function mountSlot() {
    strips = [0, 1, 2].map(function (i) { return $('#strip' + i); });
    layoutReels(); updateSlotUI();
    if (slotDeco()) requestAnimationFrame(function () { layoutReels(); });
  }
  function layoutReels() {
    var r0 = $('#reel0'); if (!r0) return;
    cellH = Math.round(r0.clientWidth * 0.92);
    if (slotDeco()) {
      var spin = $('#spinBtn'), screen = $('#screen');
      if (spin && screen) {
        var need = spin.offsetHeight + 90;
        var room = screen.clientHeight - (r0.getBoundingClientRect().top - screen.getBoundingClientRect().top) - need;
        if (room > 0) cellH = Math.min(cellH, Math.max(52, Math.floor(room / 3)));
      }
    }
    $('#reels').style.setProperty('--cell', cellH + 'px');
    [0, 1, 2].forEach(function (i) {
      $('#reel' + i).style.height = (cellH * 3) + 'px';
      Array.prototype.forEach.call(strips[i].children, function (c) { c.style.height = cellH + 'px'; });
      setReel(i, reelPos[i]);
    });
  }
  function setReel(i, pos) {
    var N = D.STRIP.length, p = N + (((pos % N) + N) % N);
    strips[i].style.transform = 'translate3d(0,' + (-(p - 1) * cellH).toFixed(2) + 'px,0)';
  }
  function updateSlotUI() {
    if (screen !== 'slot' || !$('#spinBtn')) return;
    var free = (state.spells.active.calm || 0) > 0;
    $('#betVal').textContent = '×' + state.bet; if (window.CLX) CLX.updateSlot();
    $('#spinCost').textContent = free ? 'бесплатно (' + state.spells.active.calm + ')' : '−' + state.bet + ' ' + plural(state.bet, 'энергия', 'энергии', 'энергии');
    $('#spinBtn').classList.toggle('dis', !free && state.energy < state.bet);
    $('#spinBtn').classList.toggle('busy', spinning);
    $('#autoBtn').classList.toggle('on', auto); $('#turboBtn').classList.toggle('on', !!state.settings.turbo);
    var act = state.spells.active, chips = [];
    for (var id in act) { var sp = D.SPELL_BY_ID[id]; chips.push('<span class="pill"><img src="' + sp.img + '">' + sp.name + ': ' + act[id] + '</span>'); }
    $('#spellsActive').innerHTML = chips.join('');
    if (!spinning) updateEvBar();
    renderChests();
  }
  function renderChests() {
    var box = $('#chests'); if (!box) return;
    var d = E.derived(state), n = d.chestSlots, h = '', t = Math.max(now(), state.time.high);
    box.style.setProperty('--n', n);
    for (var i = 0; i < n; i++) {
      var c = state.chests[i];
      if (!c) { h += '<div class="cslot"><span class="lab muted">Пусто</span></div>'; continue; }
      var ready = c.end && t >= c.end, lab = ready ? 'Открыть!' : c.end ? '🔓 ' + fmtTime(c.end - t) : '⏳ ' + fmtTime(E.chestMs(state, c.tier));
      h += '<button class="cslot ' + (ready ? 'ready' : '') + '" data-act="chest" data-i="' + i + '"><img src="' + D.CHESTS[c.tier].img + '"><span class="lab">' + lab + '</span></button>';
    }
    box.innerHTML = h;
  }

  function doSpin() {
    if (spinning) return;
    S.unlock();
    var r = E.spin(state, now(), rng);
    if (!r.ok) {
      auto = false; updateSlotUI(); S.error();
      var d = E.derived(state);
      toast('Не хватает энергии. +1 через ' + fmtTime(state.energyT + d.regenMs - now()) + (state.bet > 1 ? ' — или уменьшите ставку' : ''), IC.energy);
      return;
    }
    spinning = true; coinOffset = r.coins; save();
    [0, 1, 2].forEach(function (i) { var el = $('#reel' + i); if (el) el.classList.remove('win'); });
    if ($('#winline')) $('#winline').innerHTML = '<span class="muted">Колесо вращается…</span>';
    updateTop(); updateSlotUI();
    animateReels(r.stops, function () {
      spinning = false; coinOffset = 0; showResult(r); updateTop(); updateSlotUI(); save();
      if (!auto) setTimeout(pumpScenes, 900);
      if (auto) setTimeout(function () {
        if (!auto) return;
        if (screen !== 'slot' || modalOpen()) { auto = false; updateSlotUI(); return; }
        doSpin();
      }, state.settings.turbo ? 180 : 520);
    });
  }
  window.__spinDone = true;
  function animateReels(stops, done) {
    var turbo = !!state.settings.turbo, N = D.STRIP.length, t0 = performance.now(), lastTick = 0, stopped = [false, false, false];
    window.__spinDone = false;
    var plans = [0, 1, 2].map(function (i) {
      var cur = Math.round(reelPos[i]), idx = ((cur % N) + N) % N;
      var dist = (3 + i + (turbo ? 0 : 1)) * N + (((idx - stops[i]) % N) + N) % N;
      return { from: cur, to: cur - dist, dur: (turbo ? 380 : 950) + (turbo ? 140 : 330) * i };
    });
    var BOUNCE = turbo ? 90 : 170;
    fps.frames = 0; fps.t0 = t0;
    function frame(ts) {
      fps.frames++;
      var t = ts - t0, all = true;
      for (var i = 0; i < 3; i++) {
        var p = plans[i], pos;
        if (t < p.dur) { var u = t / p.dur; pos = p.from + (p.to - p.from) * (1 - Math.pow(1 - u, 4)); all = false; }
        else if (t < p.dur + BOUNCE) { var v = (t - p.dur) / BOUNCE; pos = p.to - 0.18 * Math.sin(Math.PI * v) * (1 - v); all = false; if (!stopped[i]) { stopped[i] = true; S.stop(i); } }
        else { pos = p.to; if (!stopped[i]) { stopped[i] = true; S.stop(i); } }
        reelPos[i] = pos; if (strips[i] && screen === 'slot') setReel(i, pos);
      }
      if (ts - lastTick > 85 && !all) { lastTick = ts; S.tick(); }
      if (!all) requestAnimationFrame(frame);
      else {
        var secs = (ts - t0) / 1000; if (secs > 0.3) { fps.samples.push(fps.frames / secs); if (fps.samples.length > 50) fps.samples.shift(); }
        reelPos = plans.map(function (p) { return p.to; });
        window.__spinDone = true; done();
      }
    }
    requestAnimationFrame(frame);
  }
  function showResult(r) {
    var d = E.derived(state), line = r.line, parts = [];
    var cnt = line.counts, onSlot = screen === 'slot' && $('#winline');
    if (onSlot) r.syms.forEach(function (s, i) { if (cnt[D.SYMBOLS[s].id] >= 2) $('#reel' + i).classList.add('win'); });
    if (r.coins > 0) parts.push('<span class="big"><img src="' + IC.coin + '">+' + fmt(r.coins) + '</span>');
    if (r.energy) parts.push(pill(IC.energy, '+' + r.energy));
    if (r.mana) parts.push(pill(IC.mana, '+' + r.mana));
    if (r.keys) parts.push(pill(IC.key, '+' + r.keys));
    parts.push(pill(IC.xp, '+' + fmtXp(r.xp) + ' опыта'));
    if (r.eventItems) parts.push(pill(E.currentEvent(now()).ev.item.img, '+' + r.eventItems));
    if (r.cards.length) parts.push(pill(IC.cards, '+' + r.cards.length));
    if (r.chest != null) parts.push(pill(D.CHESTS[r.chest].img, r.chestSlot >= 0 ? 'сундук!' : 'нет места'));
    if (r.horse) parts.push('<span class="pill">🍀 Подкова: ×2</span>');
    if (r.gold) parts.push('<span class="pill">✨×2</span>');
    lastWin = parts.join(' ');
    if (onSlot) $('#winline').innerHTML = lastWin;
    var big = r.coins >= 12 * d.B * r.bet;
    if (line.jackpot) { bigWin('ДЖЕКПОТ!', r.coins); S.bigWin(); }
    else if (line.triple || big) { if (big) bigWin(line.triple ? 'Три в ряд!' : 'Крупный выигрыш!', r.coins); S.win(); }
    else if (r.coins > 0) S.coin();
    if (r.coins > 0 && onSlot) coinBurst(Math.min(18, 4 + Math.floor(r.coins / (d.B * r.bet))));
    r.cards.forEach(function (c) {
      var k = D.CARD_BY_ID[c.id];
      if (onSlot) cardPop(c);
      else toast((c.isNew ? 'Новая карта: ' : 'Карта: ') + esc(k.name) + ' <span style="color:' + D.RARITY[k.r].ink + '">(' + D.RARITY[k.r].name.toLowerCase() + ')</span>', k.img);
      if (c.completed) { auto = false; showCollectionDone(c.completed); }
    });
    // предметы события летят в шкалу; заполненные этапы — награда сразу
    if (onSlot && r.eventItems) flyItems(r, function () { updateEvBar(); stageRewards(r.eventStages); });
    else { updateEvBar(); stageRewards(r.eventStages); }
    if (window.CLX) CLX.afterSpin(r, onSlot);
    if (window.CLT) CLT.afterSpin(r, onSlot);
    if (r.cards.length) S.card();
    if (r.chest != null) toast(r.chestSlot >= 0 ? D.CHESTS[r.chest].name + ' получен!' : 'Нет места для сундука — он превращён в монеты', D.CHESTS[r.chest].img);
    if (r.levelUps) { auto = false; showLevelUps(r.levelUps); }
    if (line.jackpot) auto = false;
  }
  function stageRewards(list) {
    (list || []).forEach(function (st) {
      var bar = $('#evbar'); if (bar) { bar.classList.remove('burst'); void bar.offsetWidth; bar.classList.add('burst'); }
      var g = st.got || {}, parts = [];
      if (g.energy) parts.push('+' + g.energy + ' энергии'); if (g.coins) parts.push('+' + fmt(g.coins) + ' монет'); if (g.mana) parts.push('+' + g.mana + ' маны'); if (g.keys) parts.push('+' + g.keys + ' кл.');
      if (st.reward.chest != null) parts.push(D.CHESTS[st.reward.chest].name.toLowerCase());
      if (g.cards && g.cards.length) parts.push(g.cards.length + ' ' + plural(g.cards.length, 'карта', 'карты', 'карт') + ' события');
      toast('Этап ' + st.stage + ' шкалы пройден! ' + parts.join(', '), IC.energy); S.win();
      (g.cards || []).forEach(function (c) { cardPop(c); if (c.completed) showCollectionDone(c.completed); });
    });
  }
  function bigWin(title, coins) {
    var el = document.createElement('div'); el.className = 'bigwin';
    el.innerHTML = '<b>' + title + '</b><span>+' + fmt(coins) + '</span>';
    $('#app').appendChild(el); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1700);
  }
  function coinBurst(n) {
    var app = $('#app'), m = $('.machine') || $('#screen'); if (!m) return;
    var ar = app.getBoundingClientRect(), mr = m.getBoundingClientRect(), tr = $('#tCoins').getBoundingClientRect();
    for (var i = 0; i < n; i++) {
      var p = document.createElement('img'); p.src = IC.coin; p.className = 'particle';
      var x = mr.left - ar.left + mr.width * (0.2 + 0.6 * (i / n)), y = mr.top - ar.top + Math.min(mr.height, 400) * 0.5;
      p.style.left = x + 'px'; p.style.top = y + 'px';
      p.style.setProperty('--dx', (tr.left - ar.left - x) + 'px'); p.style.setProperty('--dy', (tr.top - ar.top - y) + 'px');
      p.style.setProperty('--rot', (i * 47 % 360) + 'deg'); p.style.animationDelay = (i * 35) + 'ms';
      app.appendChild(p); (function (p) { setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 1300 + i * 35); })(p);
    }
  }

  /* ---------- сундуки ---------- */
  function openChestDialog(i) {
    var c = state.chests[i]; if (!c) return;
    var ch = D.CHESTS[c.tier], t = Math.max(now(), state.time.high), ready = c.end && t >= c.end;
    var unlockingOther = state.chests.some(function (x, j) { return j !== i && x && x.end && x.end > t; });
    var cost = E.chestKeyCost(state, i, t), btns = [];
    if (ready) btns.push({ t: 'Открыть', act: 'chestOpen', data: 'data-i="' + i + '"', cls: 'green' });
    else {
      if (!c.end) btns.push({ t: unlockingOther ? 'Другой сундук уже отпирается' : 'Отпереть · ' + fmtTime(E.chestMs(state, c.tier)), act: 'chestStart', data: 'data-i="' + i + '"', cls: unlockingOther ? 'sec dis' : 'sec' });
      btns.push({ t: '<img src="' + IC.key + '">Открыть сейчас за ' + cost + ' ' + plural(cost, 'ключ', 'ключа', 'ключей'), act: 'chestOpen', data: 'data-i="' + i + '" data-keys="1"', cls: state.keys >= cost ? '' : 'dis' });
    }
    btns.push({ t: 'Закрыть', act: 'close', cls: 'sec' });
    var d = E.derived(state);
    dialog('<img src="' + ch.img + '" style="width:150px;height:150px;object-fit:contain;margin:0 auto"><h2>' + ch.name + '</h2>' +
      '<p class="muted">Внутри: ' + fmt(d.B * ch.coins[0] * d.coinMul) + '–' + fmt(d.B * ch.coins[1] * d.coinMul) + ' монет, ' + ch.cards + ' ' + plural(ch.cards, 'карта', 'карты', 'карт') +
      ' (минимум одна «' + D.RARITY[c.tier === 3 ? 'E' : ch.minR].name.toLowerCase() + '»)' + (ch.energy[1] ? ', энергия' : '') + (ch.mana[1] ? ', мана' : '') + (ch.keyR[1] ? ', ключи' : '') + (ch.seals ? ', печати' : '') + '.</p>' +
      (c.end && !ready ? '<p>Откроется через ' + timerSpan(c.end) + '</p>' : ''), btns);
  }

  /* ---------- замок (v3: изометрическая карта) ---------- */
  var iso = null, resK = {};
  function chapterBtnHTML() {
    var ch = E.chapter(state);
    if (state.story.finished) return '<button class="chapbtn" data-act="storyTab"><img src="img/story/10.webp"><div class="grow"><b>Сказание завершено</b><div class="small muted">Перечитать главы — во вкладке «Задания»</div></div></button>';
    var done = ch.obj.filter(function (o) { return E.objProgress(state, o) >= o.t; }).length;
    return '<button class="chapbtn" data-act="storyTab"><img src="' + ch.img + '"><div class="grow"><b>Глава ' + ch.n + ': ' + ch.title + '</b><div class="small ' + (E.chapterDone(state) ? 'ok' : 'muted') + '">' + (E.chapterDone(state) ? '✓ Все цели выполнены — продолжить историю' : 'Цели: ' + done + ' из ' + ch.obj.length) + '</div></div><span style="font-size:22px">›</span></button>';
  }
  function castleHudHTML() {
    var d = E.derived(state, now()), q = state.builds, active = q.filter(function (j) { return j.start != null; }).length;
    var can = D.BUILDINGS.filter(function (b) { return E.canUpgrade(state, b.id).ok && !state.builds.some(function (j) { return j.id === b.id; }); }).length;
    return '<div class="iso-top">' + chapterBtnHTML() + '</div>' +
      '<div class="iso-bottom"><button class="isob q" data-act="bqueue">🔨 Стройка <b>' + active + '/' + d.builders + '</b>' + (q.length > active ? ' <span class="muted">+' + (q.length - active) + '</span>' : '') + '</button>' +
      '<button class="isob" data-act="bldList">☰ Постройки' + (can ? ' <span class="badge2">' + can + '</span>' : '') + '</button></div>' +
      '<div class="iso-zoom"><button class="isob r" data-act="isoZoom" data-f="1.3" aria-label="Приблизить">＋</button><button class="isob r" data-act="isoZoom" data-f="0.77" aria-label="Отдалить">－</button><button class="isob r" data-act="isoHome" aria-label="К цитадели">⌂</button></div>';
  }
  function renderCastle() {
    return '<div class="iso-wrap" id="isoWrap"><div class="iso-host" id="isoHost"></div><div class="iso-hud" id="isoHud">' + castleHudHTML() + '</div>' +
      '<div class="iso-hint" id="isoHint">Тяните карту пальцем, щипок — масштаб. Нажмите на постройку.</div></div>';
  }
  function castleModel() {
    var t = now();
    return D.BUILDINGS.map(function (b) {
      var job = null;
      state.builds.forEach(function (j) { if (j.id !== b.id) return; if (j.start != null) job = { active: true, start: j.start, end: j.end, to: j.to }; else if (!job) job = { active: false, to: j.to }; });
      return { id: b.id, name: b.name, lvl: state.bld[b.id], locked: state.level < b.unlock, unlock: b.unlock, job: job, can: E.canUpgrade(state, b.id, t).ok };
    });
  }
  function mountCastle() {
    var host = $('#isoHost'); if (!host || !CL.Iso) return;
    iso = CL.Iso.create(host, { now: now, fmtTime: fmtTime, onTap: tapBuilding, paused: function () { return sceneOpen; },
      quality: function () { return state.settings.mapFx || 'high'; },
      onAutoLow: function () { toast('Анимация карты: включён экономный режим (устройство не успевает)'); } });
    iso.setModel(castleModel());
    var hint = $('#isoHint'); if (hint) setTimeout(function () { hint.classList.add('off'); }, 4200);
  }
  function updateCastle() { var hud = $('#isoHud'); if (hud) hud.innerHTML = castleHudHTML(); if (iso) iso.setModel(castleModel()); }
  /* тап по постройке: сначала короткая сценка жителя, затем окно улучшения */
  function tapBuilding(id) {
    var b = D.BLD_BY_ID[id]; if (!b) return;
    if (sceneOpen || modalStack.length) return;
    if (state.settings.residents === false) { ACT.bld({ id: id }); return; }
    var active = state.builds.some(function (j) { return j.id === id && j.start != null; });
    resK[id] = (resK[id] || 0) + 1;
    var sc = D.residentScene(id, state.bld[id], { locked: state.level < b.unlock, building: active, k: resK[id] });
    S.click();
    openScene('res_' + id, { data: sc, replay: true, quick: true, onDone: function () { ACT.bld({ id: id }); } });
  }
  function castleListHTML() {
    var h = '';
    h += '<div class="bgrid" style="padding:4px 0">';
    D.BUILDINGS.forEach(function (b) {
      var lvl = state.bld[b.id], locked = state.level < b.unlock, c = E.canUpgrade(state, b.id), st;
      var job = state.builds.filter(function (j) { return j.id === b.id; })[0], planned = E.plannedLevel(state, b.id);
      if (locked) st = '<span class="muted">🔒 Откроется на ' + b.unlock + ' ур.</span>';
      else if (planned >= D.BLD_MAX) st = '<span style="color:var(--gold)">' + (job ? 'Строится последний уровень' : 'Максимум') + '</span>';
      else if (c.ok) st = '<span class="ok">▲ ' + fmt(c.cost) + '</span>';
      else if (c.cost) st = '<span class="muted">' + fmt(c.cost) + ' · ' + c.reason.toLowerCase() + '</span>';
      else st = '<span class="muted">' + c.reason + '</span>';
      var badge = job ? '<span class="hammer">' + (job.start != null ? '→ ' + job.to : 'в очереди') + '</span>' : (c.ok ? '<span class="arrow">▲</span>' : '');
      h += '<button class="bcard ' + (locked ? 'locked' : '') + (c.ok && !job ? ' can' : '') + (job ? ' building' : '') + '" data-act="bld" data-id="' + b.id + '"><img src="' + b.img + '" loading="lazy"><span class="lv">' + (lvl ? 'Ур. ' + lvl : 'Не построено') + '</span>' + badge +
        '<div class="info"><div class="nm">' + b.name + '</div><div class="st">' + st + '</div></div></button>';
    });
    return h + '</div>';
  }
  /* ---------- очередь строительства ---------- */
  function buildQueueHTML() {
    var d = E.derived(state, now()), t = Math.max(now(), state.time.high), q = state.builds;
    var active = q.filter(function (j) { return j.start != null; }), waiting = q.filter(function (j) { return j.start == null; });
    var h = '<div class="bqueue"><div class="hd"><b class="grow">🔨 Стройка</b><span class="pill">Строители: ' + active.length + ' / ' + d.builders + '</span><span class="pill">Очередь: ' + q.length + ' / ' + D.BUILD_QUEUE_MAX + '</span></div>';
    active.forEach(function (j) {
      var b = D.BLD_BY_ID[j.id], k = E.buildSkipCost(state, j, t), i = q.indexOf(j);
      h += '<div class="bjob"><img src="' + b.img + '"><div class="grow"><b>' + b.name + ' → ' + j.to + '</b><div class="small">Готово через ' + timerSpan(j.end) + '</div>' + bar(t - j.start, j.end - j.start, 'blue') + '</div>' +
        '<button class="btn sm ' + (state.keys >= k ? '' : 'dis') + '" data-act="skipBuild" data-i="' + i + '"><img src="' + IC.key + '">' + k + '</button></div>';
    });
    for (var f = active.length; f < d.builders; f++) h += '<div class="bjob free">' + (waiting.length ? 'Строитель ждёт: сначала нужен предыдущий уровень' : 'Свободный строитель — нажмите на постройку на карте') + '</div>';
    waiting.forEach(function (j) {
      var b = D.BLD_BY_ID[j.id], i = q.indexOf(j);
      h += '<div class="bjob wait"><img src="' + b.img + '"><div class="grow"><b>' + b.name + ' → ' + j.to + '</b><div class="small muted">Ждёт строителя · ' + fmtTime(j.ms) + '</div></div><button class="btn sec sm" data-act="cancelBuild" data-i="' + i + '">Отменить</button></div>';
    });
    if (d.builders < 3) h += '<div class="small muted" style="margin-top:6px">Ещё строитель — на ' + (d.builders === 1 ? 3 : 6) + ' уровне Цитадели. Стройка идёт и когда игра закрыта.</div>';
    return h + '</div>';
  }
  function hypo(id, lvl) { var s2 = {}; for (var k in state) s2[k] = state[k]; s2.bld = {}; for (var b in state.bld) s2.bld[b] = state.bld[b]; s2.bld[id] = lvl; return E.derived(s2, now()); }
  function effRow(label, cur, next) { return '<div class="stat-row"><span>' + label + '</span><span><b>' + cur + '</b>' + (next != null ? ' → <span class="nx">' + next + '</span>' : '') + '</span></div>'; }
  function buildingEffects(id) {
    var lvl = state.bld[id], a = hypo(id, lvl), max = lvl >= D.BLD_MAX, n = max ? null : hypo(id, lvl + 1), h = '';
    function nx(f) { return n ? f(n) : null; }
    function pct(v) { return Math.round(v * 100) + '%'; }
    switch (id) {
      case 'citadel':
        h += effRow('Макс. уровень построек', Math.min(10, lvl + 1), nx(function () { return Math.min(10, lvl + 2); }));
        h += effRow('Бонус монет', '+' + 3 * (lvl - 1) + '%', nx(function () { return '+' + 3 * lvl + '%'; }));
        h += effRow('Строителей', a.builders, nx(function (x) { return x.builders; }));
        h += effRow('Скорость стройки', '+' + pct(1 - a.buildMul), nx(function (x) { return '+' + pct(1 - x.buildMul); }));
        if (!max) h += effRow('Нужен уровень игрока', D.citadelReqLevel(lvl + 1));
        break;
      case 'warehouse':
        h += effRow('Макс. ключей', a.maxKeys, nx(function (x) { return x.maxKeys; }));
        h += effRow('Макс. энергии', a.maxEnergy, nx(function (x) { return x.maxEnergy; })); break;
      case 'academy':
        h += effRow('1 энергия каждые', fmtTime(a.regenMs), nx(function (x) { return fmtTime(x.regenMs); }));
        h += effRow('1 мана каждые', fmtTime(a.manaRegenMs), nx(function (x) { return fmtTime(x.manaRegenMs); }));
        h += effRow('Энергии в час', (3600000 / a.regenMs).toFixed(1), nx(function (x) { return (3600000 / x.regenMs).toFixed(1); })); break;
      case 'gallery':
        h += effRow('Усиление бонусов коллекций', '+' + 10 * Math.max(0, lvl - 1) + '%', nx(function () { return '+' + 10 * lvl + '%'; })); break;
      case 'market':
        h += effRow('Печатей за дубликаты', '+' + pct(a.sealMul - 1), nx(function (x) { return '+' + pct(x.sealMul - 1); }));
        h += effRow('Скидка в лавке', pct(1 - a.priceMul), nx(function (x) { return pct(1 - x.priceMul); })); break;
      case 'treasury':
        h += effRow('Доход в час', fmt(a.treasuryRate), nx(function (x) { return fmt(x.treasuryRate); }));
        h += effRow('Хранилище казны', a.treasuryCapH + ' ч', nx(function (x) { return x.treasuryCapH + ' ч'; })); break;
      case 'library':
        h += effRow('Макс. уровень навыков', a.skillCap, nx(function (x) { return x.skillCap; }));
        h += effRow('Скорость исследований', '+' + pct(1 - a.researchMul), nx(function (x) { return '+' + pct(1 - x.researchMul); })); break;
      case 'tower':
        h += effRow('Открыто заклинаний', Math.min(9, lvl), nx(function () { return Math.min(9, lvl + 1); }));
        h += effRow('Макс. маны', a.maxMana, nx(function (x) { return x.maxMana; }));
        h += effRow('Перезарядка', '−' + pct(1 - a.spellCdMul), nx(function (x) { return '−' + pct(1 - x.spellCdMul); }));
        h += effRow('Длительность', '+' + pct(a.spellPower - 1), nx(function (x) { return '+' + pct(x.spellPower - 1); })); break;
      case 'forge':
        h += effRow('Мест для сундуков', a.chestSlots, nx(function (x) { return x.chestSlots; }));
        h += effRow('Время отпирания', '−' + pct(1 - a.chestTimeMul), nx(function (x) { return '−' + pct(1 - x.chestTimeMul); }));
        h += effRow('Цена ключа', fmt(a.keyPrice), nx(function (x) { return fmt(x.keyPrice); })); break;
    }
    return h;
  }
  function buildingHTML(id) {
    var b = D.BLD_BY_ID[id], lvl = state.bld[id], c = E.canUpgrade(state, id), d = E.derived(state, now());
    var h = (window.CLX ? CLX.damageHTML(id) : '') + '<img class="hero-img" src="' + b.img + '"><div class="muted small">' + (lvl ? 'Уровень ' + lvl + ' из ' + D.BLD_MAX : 'Не построено') + '</div>' +
      '<p>' + b.desc + '</p><div class="card">' + buildingEffects(id) + '</div>';
    var planned = E.plannedLevel(state, id), busy = state.builds.filter(function (j) { return j.start != null; }).length;
    if (planned > lvl) h += '<div class="card" style="border-color:var(--sky)">🔨 В очереди стройки: до ' + planned + ' уровня' + state.builds.filter(function (j) { return j.id === id && j.start != null; }).map(function (j) { return ' · готово через ' + timerSpan(j.end); }).join('') + '</div>';
    if (planned < D.BLD_MAX) {
      var tgt = planned + 1, lbl = (planned ? 'Улучшить до ' + tgt : 'Построить') + (busy >= d.builders || planned > lvl ? ' (в очередь)' : '');
      h += '<button class="btn wide ' + (c.ok ? 'green' : 'dis') + '" data-act="upgrade" data-id="' + id + '"><img src="' + IC.coin + '">' + lbl + (c.cost ? ' · ' + fmt(c.cost) : '') + '</button>' +
        (c.ok ? '<div class="small muted" style="text-align:center;margin-top:6px">Время стройки: ' + fmtTime(c.ms) + '</div>' : '<div class="small bad" style="text-align:center;margin-top:6px">' + c.reason + '</div>');
    }
    if (lvl < 1 && id !== 'citadel') return h;
    if (id === 'citadel') h += '<h3>Постройки замка</h3>' + D.BUILDINGS.filter(function (x) { return x.id !== 'citadel'; }).map(function (x) { return effRow(x.name, state.bld[x.id] + ' / ' + E.buildingCap(state, x.id)); }).join('');
    if (id === 'warehouse') h += '<h3>Сейчас на складе</h3>' + effRow('Монеты', fmt(state.coins) + ' (без лимита)') + effRow('Энергия', state.energy + ' / ' + d.maxEnergy) + '<p class="small muted">Максимум энергии растёт только с уровнем Склада (100 + 15 за уровень). Монеты Склад не ограничивает — лимита золота нет; энергия из наград может временно превышать максимум, но сама восстанавливается только до него.</p>';
    if (id === 'academy') h += '<p class="small muted">Энергия и мана копятся даже при закрытой игре: время считается по часам устройства. Если перевести часы назад, восстановление приостановится, пока время не догонит.</p>';
    if (id === 'gallery') h += galleryPanel();
    if (id === 'market') h += marketPanel();
    if (id === 'treasury') {
      var amt = E.treasuryAmount(state, now()), full = Math.max(now(), state.time.high) - state.treasuryT >= d.treasuryCapH * 3600000;
      h += '<div class="card" style="text-align:center"><div class="muted">Накоплено' + (full ? ' (хранилище полно!)' : '') + '</div><div class="serif" style="font-size:30px;color:var(--gold)">' + fmt(amt) + '</div>' +
        '<button class="btn wide ' + (amt > 0 ? '' : 'dis') + '" data-act="treasury"><img src="' + IC.coin + '">Собрать</button></div>';
    }
    if (id === 'library') h += libraryPanel();
    if (id === 'tower') h += '<h3>Заклинания</h3>' + spellsList();
    if (id === 'forge') h += '<div class="card"><div class="row"><img src="' + IC.key + '" style="width:56px;height:56px;border-radius:10px"><div class="grow"><b>Выковать ключ</b><div class="small muted">Ключи открывают сундуки и ускоряют исследования. У вас: ' + state.keys + '</div></div></div><div style="height:8px"></div><button class="btn wide ' + (state.coins >= d.keyPrice ? '' : 'dis') + '" data-act="craftKey"><img src="' + IC.coin + '">' + fmt(d.keyPrice) + '</button></div>';
    return h;
  }
  function libraryPanel() {
    var d = E.derived(state), h = '<h3>Навыки</h3>', t = Math.max(now(), state.time.high);
    if (state.research) {
      var sk = D.SKILL_BY_ID[state.research.id], left = state.research.end - t, k = E.researchSkipCost(state, t);
      h += '<div class="card"><div class="row"><img src="' + sk.img + '" style="width:56px;height:56px;border-radius:10px"><div class="grow"><b>Изучается: ' + sk.name + ' ' + (state.skills[sk.id] + 1) + '</b><div class="small">Осталось ' + timerSpan(state.research.end) + '</div>' + bar(state.research.total - left, state.research.total, 'blue') + '</div></div><div style="height:8px"></div>' +
        '<button class="btn sm wide ' + (state.keys >= k ? '' : 'dis') + '" data-act="skipResearch"><img src="' + IC.key + '">Завершить сейчас за ' + k + '</button></div>';
    }
    D.SKILLS.forEach(function (sk) {
      var lv = state.skills[sk.id], c = E.canResearch(state, sk.id);
      h += '<div class="item ' + (lv ? '' : 'off') + '"><img src="' + sk.img + '"><div class="grow"><div class="t">' + sk.name + ' · ' + lv + '/' + D.SKILL_MAX + '</div><div class="d">' + sk.desc + '</div>' +
        (lv < D.SKILL_MAX ? '<div class="d">' + fmt(D.skillCost(sk.id, lv + 1)) + ' монет · ' + fmtTime(D.skillMinutes(lv + 1) * 60000 * d.researchMul) + (c.ok ? '' : ' · <span class="bad">' + c.reason + '</span>') + '</div>' : '') + '</div>' +
        (lv < D.SKILL_MAX ? '<button class="btn sm ' + (c.ok ? 'blue' : 'dis') + '" data-act="research" data-id="' + sk.id + '">Изучить</button>' : '<span class="ok">✓</span>') + '</div>';
    });
    return h;
  }
  function spellsList() {
    var t = Math.max(now(), state.time.high);
    return D.SPELLS.map(function (sp) {
      var st = E.spellState(state, sp.id, t), n = E.spellN(state, sp.id);
      var btn = !st.unlocked ? '<span class="small muted">Башня ' + sp.tower + ' ур.</span>' :
        st.cdLeft > 0 ? '<span class="pill">⏳ ' + timerSpan(state.spells.cd[sp.id]) + '</span>' :
        '<button class="btn sm ' + (st.canCast ? 'blue' : 'dis') + '" data-act="cast" data-id="' + sp.id + '"><img src="' + IC.mana + '">' + sp.mana + '</button>';
      return '<div class="item ' + (st.unlocked ? '' : 'off') + '"><img src="' + sp.img + '"><div class="grow"><div class="t">' + sp.name + (st.active ? ' <span class="ok small">активно: ' + st.active + '</span>' : '') + '</div><div class="d">' + sp.desc.replace('{n}', n) + '</div><div class="d">Перезарядка ' + fmtTime(sp.cd * 60000 * E.derived(state).spellCdMul) + '</div></div>' + btn + '</div>';
    }).join('');
  }
  function marketPanel() {
    var v = E.duplicateValue(state), dup = 0; for (var id in state.cards) if (state.cards[id] > 1) dup += state.cards[id] - 1;
    var h = '<div class="card"><div class="row"><img src="img/port/4.webp" style="width:64px;height:64px;border-radius:12px"><div class="grow"><b>Бруни:</b> «Лишние карты? Давай сюда, дам честные печати гильдии!»</div></div>' +
      '<div style="height:8px"></div><div class="row"><div class="grow">Дубликатов: <b>' + dup + '</b><br>Печатей у вас: <b style="color:var(--gold)">' + state.seals + '</b></div>' +
      '<button class="btn ' + (v > 0 ? '' : 'dis') + '" data-act="sell"><img src="' + IC.seal + '">+' + v + '</button></div></div><h3>Лавка</h3>';
    D.MARKET.forEach(function (it) {
      var p = E.marketPrice(state, it), ok = state.bld.market >= it.lvl, img = it.chest != null ? D.CHESTS[it.chest].img : it.energy ? IC.energy : it.mana ? IC.mana : IC.key;
      h += '<div class="item ' + (ok ? '' : 'off') + '"><img src="' + img + '"><div class="grow"><div class="t">' + it.name + '</div><div class="d">' + (ok ? p + ' печатей' : 'Нужен Рынок ' + it.lvl + ' ур.') + '</div></div>' +
        (ok ? '<button class="btn sm ' + (state.seals >= p ? '' : 'dis') + '" data-act="buy" data-id="' + it.id + '"><img src="' + IC.seal + '">' + p + '</button>' : '') + '</div>';
    });
    h += '<p class="small muted">' + (state.bld.market >= D.MARKET_PICK_LVL ? 'Недостающую карту можно купить прямо в коллекции: нажмите на пустую карту.' : 'С ' + D.MARKET_PICK_LVL + ' уровня Рынка можно покупать конкретные недостающие карты.') + '</p>';
    return h;
  }
  function galleryPanel() {
    var mul = 1 + 0.1 * Math.max(0, state.bld.gallery - 1), rows = [];
    Object.keys(state.colDone).forEach(function (id) { var c = D.COL_BY_ID[id], b = []; for (var k in c.bonus) b.push(D.BONUS_TEXT[k](c.bonus[k] * mul)); rows.push(effRow(c.name, b.join(', '))); });
    return '<button class="btn wide" data-act="gallery">🖼 Открыть галерею (' + E.uniqueCards(state) + ' карт)</button><h3>Бонусы собранных коллекций</h3>' + (rows.length ? rows.join('') : '<p class="muted">Пока ни одной собранной коллекции.</p>') +
      '<div style="height:8px"></div><button class="btn sec wide" data-act="goCards">Все коллекции</button>';
  }

  /* ---------- карты ---------- */
  function renderCards() {
    var uniq = E.uniqueCards(state), main = D.COLLECTIONS.filter(function (c) { return !c.event; }), evs = D.COLLECTIONS.filter(function (c) { return c.event; });
    var mainDone = main.filter(function (c) { return state.colDone[c.id]; }).length;
    var ce = E.currentEvent(now());
    var h = '<div class="pad">' + (window.CLT ? CLT.visitorHTML() : '') + '<div class="card"><div class="serif" style="font-size:20px;color:var(--gold)">Альбом</div><div>Карт: <b>' + uniq + '</b> из 162 · Коллекций: <b>' + mainDone + '</b> из 14</div>' + bar(uniq, 162) + '<div style="height:10px"></div>' +
      '<div class="row"><button class="btn sm grow" data-act="gallery">🖼 Галерея</button><button class="btn sm sec grow" data-act="bld" data-id="market">♻ Обмен (' + E.duplicateValue(state) + ' печ.)</button></div></div>';
    h += '<h3>Событие сейчас</h3>' + colRow(D.COL_BY_ID[ce.ev.col], true);
    h += '<h3>Коллекции</h3>' + main.map(function (c) { return colRow(c); }).join('');
    h += '<h3>Коллекции событий</h3><p class="small muted">Карты выпадают только во время своего события (событие меняется каждые 3 дня).</p>' + evs.filter(function (c) { return c.id !== ce.ev.col; }).map(function (c) { return colRow(c); }).join('');
    return h + '</div>';
  }
  function colRow(c, hot) {
    var p = E.colProgress(state, c.id), locked = !c.event && c.unlock > state.level, done = !!state.colDone[c.id], b = [];
    for (var k in c.bonus) b.push(D.BONUS_TEXT[k](c.bonus[k]));
    var owned = c.cards.filter(function (k) { return state.cards[k.id]; }), thumb = (owned[owned.length - 1] || c.cards[8]).img;
    return '<button class="colrow ' + (done ? 'done' : '') + (locked ? ' locked' : '') + '" data-act="col" data-id="' + c.id + '"><img src="' + thumb + '" loading="lazy"><div class="grow"><div class="row"><b class="grow">' + c.name + '</b>' + (done ? '<span class="ok">✓</span>' : '<span class="small">' + p + '/9</span>') + '</div>' +
      (locked ? '<div class="small muted">Откроется на ' + c.unlock + ' уровне</div>' : bar(p, 9, done ? 'green' : '') + '<div class="small muted" style="margin-top:3px">Бонус: ' + b.join(', ') + (hot ? ' · <span class="ok">выпадает сейчас</span>' : '') + '</div>') + '</div></button>';
  }
  function collectionHTML(id) {
    var c = D.COL_BY_ID[id], p = E.colProgress(state, id), b = [], mul = 1 + 0.1 * Math.max(0, state.bld.gallery - 1);
    for (var k in c.bonus) b.push(D.BONUS_TEXT[k](c.bonus[k] * mul));
    var h = '<div class="muted">' + p + ' из 9 · ' + (state.colDone[id] ? '<span class="ok">Собрана! Бонус действует:</span>' : 'Бонус за сбор:') + ' <b>' + b.join(', ') + '</b></div>' + bar(p, 9, state.colDone[id] ? 'green' : '') + '<div style="height:10px"></div><div class="cgrid">';
    c.cards.forEach(function (k, i) {
      var n = state.cards[k.id] || 0;
      h += '<button class="kcard tilt r-' + k.r + (n ? ' live' : ' miss') + '" style="--d:' + (i * 0.55).toFixed(2) + 's" data-act="viewCol" data-id="' + id + '" data-i="' + i + '"><img src="' + k.img + '" loading="lazy">' + (n ? particles(k.r) : '<span class="q">?</span>') + '<div class="kn">' + (n ? esc(k.name) : D.RARITY[k.r].name) + '</div>' + (n > 1 ? '<span class="cnt">×' + n + '</span>' : '') + '</button>';
    });
    h += '</div><p class="small muted">Редкость: <span style="color:' + D.RARITY.C.ink + '">обычная</span> · <span style="color:' + D.RARITY.R.ink + '">редкая</span> · <span style="color:' + D.RARITY.E.ink + '">эпическая</span> · <span style="color:' + D.RARITY.L.ink + '">легендарная</span></p>';
    return h;
  }
  /* Полноэкранный просмотр карт (галерея) */
  function openViewer(ids, idx) {
    var v = document.createElement('div'); v.className = 'viewer'; $('#app').appendChild(v);
    var i = idx || 0, sx = 0;
    function draw() {
      var k = D.CARD_BY_ID[ids[i]], n = state.cards[k.id] || 0, col = D.COL_BY_ID[k.col], rr = D.RARITY[k.r];
      var buy = '';
      if (!n) {
        var price = E.cardPrice(state, k.id), r0 = (col.event ? E.currentEvent(now()).ev.col === col.id : col.unlock <= state.level);
        if (state.bld.market >= D.MARKET_PICK_LVL && r0) buy = '<button class="btn" data-vact="buyCard" style="margin-top:10px"><img src="' + IC.seal + '">Купить за ' + price + ' печатей (у вас ' + state.seals + ')</button>';
      }
      v.innerHTML = '<span class="idx">' + (i + 1) + ' / ' + ids.length + '</span><button class="x" data-vact="x">✕</button>' +
        '<div class="art tilt r-' + k.r + (n ? ' live' : '') + '"><img src="' + k.img + '" style="' + (n ? '' : 'filter:grayscale(1) sepia(.4) brightness(.45) blur(2px)') + '">' + (n ? particles(k.r) : '') + '</div>' +
        '<div class="cap"><div class="serif" style="font-size:24px;color:' + rr.ink + '">' + (n ? esc(k.name) : '???') + '</div><div class="muted">' + rr.name + ' · «' + col.name + '»' + (n ? ' · в коллекции: ' + n : ' · ещё не найдена') + '</div>' + buy + '</div>' +
        (ids.length > 1 ? '<button class="nav2 prev" data-vact="p">‹</button><button class="nav2 next" data-vact="n">›</button>' : '');
    }
    v.addEventListener('click', function (e) {
      var a = e.target.closest('[data-vact]'); if (!a) return;
      var x = a.dataset.vact; S.click();
      if (x === 'x') { v.parentNode.removeChild(v); refreshAll(); }
      else if (x === 'p') { i = (i - 1 + ids.length) % ids.length; draw(); }
      else if (x === 'n') { i = (i + 1) % ids.length; draw(); }
      else if (x === 'buyCard') { var r = E.buyCard(state, ids[i], now()); if (!r.ok) { toast(r.reason); S.error(); } else { S.card(); toast('Карта куплена!', D.CARD_BY_ID[ids[i]].img); if (r.completed) showCollectionDone(r.completed); save(); draw(); } }
    });
    v.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    v.addEventListener('touchend', function (e) { var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50 && ids.length > 1) { i = (i + (dx < 0 ? 1 : -1) + ids.length) % ids.length; draw(); } });
    draw();
  }

  /* ---------- задания ---------- */
  function renderQuests() {
    var h = '<div class="pad"><div class="tabs"><button data-act="qtab" data-t="story" class="' + (qtab === 'story' ? 'on' : '') + '">Сюжет</button><button data-act="qtab" data-t="daily" class="' + (qtab === 'daily' ? 'on' : '') + '">Ежедневные</button><button data-act="qtab" data-t="ach" class="' + (qtab === 'ach' ? 'on' : '') + '">Достижения</button></div>';
    if (state.login.pending) h += loginCard();
    if (qtab === 'story') h += storyPanel(); else if (qtab === 'daily') h += dailyPanel(); else h += achPanel();
    return h + '</div>';
  }
  function storyPanel() {
    var h = window.CLX ? CLX.chainPanelHTML() : '';
    if (state.story.finished) h += '<div class="card"><img src="img/story/10.webp" style="width:100%;border-radius:10px"><h3>Сказание завершено!</h3><p>Сердце Фортуны восстановлено. Колесо продолжает вращаться: собирайте коллекции, участвуйте в событиях и развивайте замок до максимума.</p></div>';
    else {
      var ch = E.chapter(state), done = E.chapterDone(state);
      h += '<div class="card"><img src="' + ch.img + '" style="width:100%;border-radius:10px;aspect-ratio:16/9;object-fit:cover"><div class="muted small" style="margin-top:8px">ГЛАВА ' + ch.n + ' ИЗ ' + D.CHAPTERS.length + '</div><h3 style="margin-top:2px">' + ch.title + '</h3>';
      ch.obj.forEach(function (o) { var p = E.objProgress(state, o); h += '<div style="margin:8px 0"><div class="row"><span class="grow">' + (p >= o.t ? '✅ ' : '◻️ ') + o.text + '</span><span class="small">' + p + '/' + o.t + '</span></div>' + bar(p, o.t, p >= o.t ? 'green' : '') + '</div>'; });
      h += '<div class="small muted">Награда: ' + rewardPills(ch.reward) + '</div><div style="height:10px"></div><div class="row"><button class="btn sec sm grow" data-act="readCh" data-n="' + ch.n + '">📖 Читать главу</button>' +
        '<button class="btn sm grow ' + (done ? 'green' : 'dis') + '" data-act="finishCh">Завершить главу</button></div></div>';
    }
    var past = D.CHAPTERS.filter(function (c) { return c.n < state.story.ch || state.story.finished; });
    if (past.length) h += '<h3>Прочитанные главы</h3>' + past.map(function (c) { return '<button class="colrow" data-act="readCh" data-n="' + c.n + '"><img src="' + c.img + '" style="width:86px;height:50px"><div class="grow"><b>Глава ' + c.n + '</b><div class="small muted">' + c.title + '</div></div><span>▶</span></button>'; }).join('');
    return h;
  }
  function dailyPanel() {
    var dd = state.daily, h = '<div class="small muted" style="margin-bottom:8px">Обновятся в полночь</div>';
    dd.quests.forEach(function (q, i) {
      var tpl = D.DAILY_POOL.filter(function (x) { return x.id === q.id; })[0], p = E.dailyProgress(state, q), ok = p >= q.t;
      h += '<div class="card"><div class="row"><div class="grow"><b>' + tpl.text.replace('{t}', fmt(q.t)) + '</b><div style="margin:6px 0">' + bar(p, q.t, ok ? 'green' : '') + '</div><div class="small">' + fmt(p) + ' / ' + fmt(q.t) + ' · ' + rewardPills(tpl.reward) + '</div></div>' +
        (q.claimed ? '<span class="ok">✓</span>' : '<button class="btn sm ' + (ok ? 'green' : 'dis') + '" data-act="claimDaily" data-i="' + i + '">Забрать</button>') + '</div></div>';
    });
    var all = dd.quests.every(function (q) { return q.claimed; });
    h += '<div class="card"><div class="row"><img src="' + D.CHESTS[1].img + '" style="width:60px;height:60px;object-fit:contain"><div class="grow"><b>Бонус за все задания дня</b><div class="small">' + rewardPills(D.DAILY_BONUS) + '</div></div>' +
      (dd.bonus ? '<span class="ok">✓</span>' : '<button class="btn sm ' + (all ? 'green' : 'dis') + '" data-act="claimBonus">Забрать</button>') + '</div></div>';
    return h + loginCalendar();
  }
  function loginCalendar() {
    var cur = (Math.max(1, state.login.streak) - 1) % 7;
    return '<div class="card"><b>Ежедневный вход</b> <span class="small muted">· серия ' + state.login.streak + ' ' + plural(state.login.streak, 'день', 'дня', 'дней') + '</span><div class="login-grid">' +
      D.LOGIN.map(function (rw, i) { var lab = rw.chest != null ? '<img src="' + D.CHESTS[rw.chest].img + '" style="width:28px;height:28px;margin:auto">' : '<img src="' + (rw.energy ? IC.energy : rw.coinsB ? IC.coin : rw.keys ? IC.key : IC.mana) + '" style="width:26px;height:26px;margin:auto;border-radius:50%">'; return '<div class="' + (i === cur ? 'on' : i < cur ? 'past' : '') + '">Д' + (i + 1) + lab + '</div>'; }).join('') + '</div></div>';
  }
  function loginCard() {
    var day = (state.login.streak - 1) % 7, rw = D.LOGIN[day];
    return '<div class="card" style="border-color:var(--gold)"><div class="row"><div class="grow"><b>Награда за вход — день ' + (day + 1) + '</b><div class="small">' + rewardPills(rw) + '</div></div><button class="btn sm green" data-act="claimLogin">Забрать</button></div></div>';
  }
  function achPanel() {
    return D.ACHIEVEMENTS.map(function (a) {
      var st = E.achState(state, a);
      return '<div class="card"><div class="row"><div class="grow"><b>' + a.name + '</b><div style="margin:6px 0">' + bar(st.v, a.t, st.done ? 'green' : '') + '</div><div class="small">' + fmt(st.v) + ' / ' + fmt(a.t) + ' · ' + rewardPills(a.reward) + '</div></div>' +
        (st.claimed ? '<span class="ok">✓</span>' : '<button class="btn sm ' + (st.done ? 'green' : 'dis') + '" data-act="claimAch" data-id="' + a.id + '">Забрать</button>') + '</div></div>';
    }).join('');
  }

  /* ---------- события ---------- */
  function renderEvents() {
    var ce = E.currentEvent(now()), ev = ce.ev, col = D.COL_BY_ID[ev.col], b = E.eventBar(state);
    var symName = D.SYMBOLS.filter(function (x) { return x.id === ev.sym; })[0].name;
    var h = '<div class="castle-hero" style="height:260px;background-image:url(' + ev.banner + ')"><div class="small muted" style="letter-spacing:2px;font-weight:800">СОБЫТИЕ</div><h2 style="margin:2px 0 4px;font-size:32px">' + ev.name + '</h2><div><span class="pill">⏳ До конца: ' + timerSpan(ce.end) + '</span> <span class="pill">✨ ' + ev.bonusText + '</span></div></div><div class="pad">';
    h += '<div class="card"><p style="margin-top:0">' + ev.text + '</p><p class="small" style="margin-bottom:0">Каждое вращение: <b>ставка × (1 за каждый символ «' + symName + '» + 5 за три в ряд + иногда ещё 1)</b>. Собранное наполняет <b>шкалу над Колесом Судьбы</b> — заглядывайте туда. Каждый этап сразу дарит энергию и награды. После 10-го этапа шкала продолжается бонусными этапами до конца события.</p>' +
      '<div style="height:8px"></div><button class="btn wide" data-act="go" data-to="slot">К Колесу Судьбы</button></div>';
    h += '<h3>Награды этапов</h3>';
    D.EVENT_BAR.forEach(function (m, i) {
      var done = b.stage > i, cur = b.stage === i;
      h += '<div class="ms ' + (done ? 'done' : cur ? 'cur' : '') + '"><span class="pts">' + (i + 1) + '</span><div class="grow small">' + rewardPills(m.reward) + '</div>' + (done ? '<span class="ok">✓</span>' : cur ? '<span class="small ok">сейчас</span>' : '') + '</div>';
    });
    h += '<div class="ms ' + (b.loop ? 'cur' : '') + '"><span class="pts">∞</span><div class="grow small">' + rewardPills(D.EVENT_BAR_LOOP.reward) + ' <span class="muted">— каждый бонусный этап</span></div></div>';
    h += '<h3>Коллекция события</h3>' + colRow(col, true);
    h += '<h3>Расписание</h3>';
    for (var j = 1; j <= 3; j++) {
      var nx = E.currentEvent(ce.end + (j - 1) * D.EVENT_DAYS * 86400000 + 1000);
      h += '<div class="item"><img src="' + nx.ev.banner + '"><div class="grow"><div class="t">' + nx.ev.name + '</div><div class="d">через ' + timerSpan(nx.start) + ' · ' + nx.ev.bonusText + '</div></div></div>';
    }
    return h + '</div>';
  }

  /* ---------- катсцены: панорама-параллакс, портреты, печатная машинка, выборы ---------- */
  var sceneOpen = false;
  function openScene(id, opt) {
    opt = opt || {};
    var sc = opt.data || E.sceneData(id); if (!sc) { if (opt.onDone) opt.onDone(); return; }
    sceneOpen = true; auto = false;
    var el = document.createElement('div'); el.className = opt.quick ? 'story resi' : 'story intro'; $('#app').appendChild(el);
    var motes = ''; for (var m = 0; m < 14; m++) motes += '<i style="left:' + (m * 7.3 % 100).toFixed(1) + '%;--t:' + (7 + m % 5 * 1.6).toFixed(1) + 's;--dl:' + (m * 0.63).toFixed(2) + 's;--mx:' + ((m % 2 ? 1 : -1) * (20 + m * 3)) + 'px"></i>';
    el.innerHTML = '<div class="scene"><img class="lay bg" src="' + sc.img + '" alt=""><img class="lay fg" src="' + sc.img + '" alt=""><div class="motes">' + motes + '</div>' + (sc.sprite ? '<img class="spr" src="' + sc.sprite + '" alt="">' : '') +
      '<div class="actor l"><img alt=""></div><div class="actor r"><img alt=""></div><div class="vig"></div><div class="lb t"></div><div class="lb b"></div>' +
      '<div class="ttl">' + esc(D.g(sc.kicker || '')) + '<b>' + esc(D.g(sc.title || '')) + '</b></div></div>' +
      '<div class="dlg"><div class="who"><img id="sPort" alt=""><b id="sName"></b></div><div class="txt" id="sTxt"></div><div class="choices" id="sCh"></div>' +
      '<div class="hint"><button class="btn sec sm" id="sSkip">Пропустить</button><span id="sHint" class="nx">Нажмите, чтобы продолжить ▸</span></div></div>';
    var lines = sc.lines.slice(), li = -1, typing = null, full = '', sides = {}, nextSide = 'l', waitChoice = false, extra = [];
    var fg = el.querySelector('.lay.fg'), bg = el.querySelector('.lay.bg'), sceneBox = el.querySelector('.scene');
    function pan(k, n) {
      var W = sceneBox.clientWidth, H = sceneBox.clientHeight, iw = fg.naturalWidth || 16, ih = fg.naturalHeight || 9;
      var w = H * iw / ih, max = Math.max(0, w - W), u = n > 1 ? k / (n - 1) : 0.5;
      var x = -max * (0.1 + 0.8 * u), sc2 = 1.04 + 0.05 * Math.sin(k * 1.3);
      fg.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0) scale(' + sc2.toFixed(3) + ')';
      bg.style.transform = 'translate3d(' + (x * 0.55 - max * 0.2).toFixed(1) + 'px,0,0) scale(1.18)';
    }
    function startPan() { fg.style.transition = 'none'; bg.style.transition = 'none'; pan(0, 1); pan(-0.4, lines.length); void fg.offsetWidth; fg.style.transition = ''; bg.style.transition = ''; }
    if (fg.complete) startPan(); else fg.onload = startPan;
    setTimeout(function () { el.classList.remove('intro'); }, 1500);
    function actor(who) {
      var side = sides[who]; if (!side) { side = sides[who] = nextSide; nextSide = nextSide === 'l' ? 'r' : 'l'; }
      ['l', 'r'].forEach(function (sd) {
        var a = el.querySelector('.actor.' + sd);
        if (sd === side) { a.querySelector('img').src = D.CHARS[who].img; a.classList.remove('on'); void a.offsetWidth; a.classList.add('on'); }
        else a.classList.remove('on');
      });
    }
    function type(text) {
      full = text; var k = 0, tx = el.querySelector('#sTxt'); tx.textContent = '';
      clearInterval(typing); typing = setInterval(function () { k += 1; tx.innerHTML = esc(full.slice(0, k)) + '<span class="cur"></span>';  if (k >= full.length) { clearInterval(typing); typing = null; tx.textContent = full; } }, 24);
    }
    function sayLine(ln) {
      var who = D.CHARS[ln[0]]; actor(ln[0]);
      el.querySelector('#sPort').src = who.img; el.querySelector('#sName').textContent = who.name; type(D.g(ln[1]));
    }
    var done = false, started = false;
    function show() {
      if (done) return; started = true;
      var ln = lines[li]; if (!ln) { finish(); return; }
      var chBox = el.querySelector('#sCh'); chBox.innerHTML = '';
      pan(li, lines.length);
      if (ln && ln.choice) {
        waitChoice = true; el.querySelector('#sHint').textContent = 'Выберите ответ';
        chBox.innerHTML = ln.choice.map(function (c, i) { return '<button class="btn sec wide" data-ch="' + i + '" style="animation-delay:' + i * 90 + 'ms">' + esc(D.g(c.t)) + '</button>'; }).join('');
        type(D.g(ln.prompt || 'Что ответить?')); el.querySelector('#sName').textContent = D.CHARS.hero.name; el.querySelector('#sPort').src = D.CHARS.hero.img; actor('hero');
        return;
      }
      sayLine(ln);
      el.querySelector('#sHint').textContent = li >= lines.length - 1 ? 'Завершить ▸' : 'Нажмите, чтобы продолжить ▸';
    }
    function finish() {
      clearInterval(typing); if (done || !el.parentNode) return; done = true; el.style.transition = 'opacity .35s'; el.style.opacity = '0';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 360);
      if (!opt.replay) E.endScene(state);
      sceneOpen = false; save(); refreshAll();
      if (opt.onDone) opt.onDone(); else setTimeout(pumpScenes, 400);
      setTimeout(function () { if (screen === 'castle' && iso) updateCastle(); }, 0);
    }
    el.addEventListener('click', function (e) {
      if (e.target.id === 'sSkip') { finish(); return; }
      if (done || !started) return;
      var cb = e.target.closest('[data-ch]');
      if (cb && waitChoice) {
        var idx = +cb.dataset.ch, c = lines[li].choice[idx]; waitChoice = false; S.click();
        var r = opt.replay ? { ok: false } : E.sceneChoice(state, id, idx, rng, now());
        el.querySelector('#sCh').innerHTML = '';
        if (c.reply) { lines.splice(li + 1, 0, c.reply); }
        if (r.ok && r.reward) { var g = r.reward, p = []; if (g.energy) p.push('+' + g.energy + ' энергии'); if (g.mana) p.push('+' + g.mana + ' маны'); if (g.keys) p.push('+' + g.keys + ' ' + plural(g.keys, 'ключ', 'ключа', 'ключей')); if (g.seals) p.push('+' + g.seals + ' печатей'); if (p.length) toast('Подарок: ' + p.join(', '), IC.energy); updateTop(); save(); }
        li++; if (li >= lines.length) finish(); else show();
        return;
      }
      if (waitChoice) return;
      S.click();
      if (typing) { clearInterval(typing); typing = null; el.querySelector('#sTxt').textContent = full; return; }
      li++; if (li >= lines.length) finish(); else show();
    });
    li = 0; setTimeout(show, opt.quick ? 260 : 700);
  }
  /* показать следующую катсцену из очереди движка, когда ничего не мешает */
  function pumpScenes() {
    if (sceneOpen || spinning || modalStack.length || queue.length || $('.viewer') || popBusy || tutOpen) return;
    if (!state.hero.chosen) return;
    if (state.tut.news) { state.tut.news = false; save(); toast('Новое в ' + D.APP_VERSION + ': обучение с вороном Карром и выбор героя/героини — в Настройках', 'img/guide/raven.webp'); }
    var id = E.takeScene(state); if (!id) { if (!state.tut.done && state.scenes.seen.ch_1) startTutorial(); else if (state.tut.done && !state.tut.x2 && state.level >= 2) startTutorial(0, 'x2'); else if (state.tut.done && state.tut.x2 && !state.tut.x3 && state.level >= 2) startTutorial(0, 'x3'); return; }
    save();
    openScene(id, { onDone: function () {
      if (id === 'ch_1' && !state.tut.done) { setTimeout(startTutorial, 300); return; }
      setTimeout(pumpScenes, 400);
    } });
  }
  function openStory(n, onDone) {
    // перечитывание главы: начало + финал (если глава уже пройдена); награды за выборы не выдаются
    var withOut = n < state.story.ch || state.story.finished;
    openScene('ch_' + n, { replay: true, onDone: function () { if (withOut && E.sceneData('out_' + n)) openScene('out_' + n, { replay: true, onDone: onDone }); else if (onDone) onDone(); } });
  }

  /* ---------- прочие окна ---------- */
  function paytableDialog() {
    var st = E.paytableStats();
    var rows = D.SYMBOLS.map(function (s) {
      var p = D.PAYTABLE[s.id], c = [1, 2, 3].map(function (n) {
        if (p.coins) return p.coins[n] ? '×' + String(p.coins[n]).replace('.', ',') + ' B' : '—';
        if (p.energy) return p.energy[n] ? '+' + p.energy[n] + ' эн.' : '—';
        if (p.xp) return '+' + p.xp[n] + ' оп.';
        if (p.mana) return '+' + p.mana[n] + ' маны';
        if (p.keys) return p.keys[n] ? '+' + p.keys[n] + ' кл.' : '—';
        if (p.attack) return p.attack[n] ? '⚔ атака' : '—';
        if (p.raid) return p.raid[n] ? 'набег' : '—';
        if (p.cards) return n === 1 ? String(D.CARD_CHANCE_ONE_SYMBOL * 100).replace('.', ',') + '% карта' : n === 2 ? '50%: 1 карта' : '1–' + p.cards[n] + ' карты';
        if (p.chest) return p.chest[n] < 0 ? '—' : D.CHESTS[p.chest[n]].name.split(' ')[0];
        return '—';
      });
      return '<tr><td><img src="' + s.img + '"></td><td style="text-align:left">' + s.name + ' <span class="muted small">(' + D.STRIP_COUNTS[s.id] + '/' + D.STRIP.length + ')</span></td><td>' + c.join('</td><td>') + '</td></tr>';
    }).join('');
    dialog('<h2>Таблица выплат</h2><div style="overflow-x:auto"><table class="paytable" style="width:100%;border-collapse:collapse"><tr class="muted small"><td></td><td></td><td>×1</td><td>×2</td><td>×3</td></tr>' + rows + '</table></div>' +
      '<p class="small" style="text-align:left">Награды за каждый символ складываются и умножаются на ставку. B — базовая монета вашего уровня (сейчас ' + fmt(E.derived(state).B) + '). Каждое вращение также даёт ' + fmtXp(D.BASE_XP_PER_BET * D.XP_MUL) + ' опыта за единицу ставки и ' + String(D.CARD_CHANCE_BASE * 100).replace('.', ',') + '% шанс карты. Карты с символов выпадают каждая с шансом ' + Math.round(D.CARD_DROP_MUL * 100) + '% (при трёх в ряд — минимум одна), в среднем ' + String(st.cards.toFixed(3)).replace('.', ',') + ' карты за вращение. Опыт за свитки в таблице указан до общего множителя ×' + String(D.XP_MUL).replace('.', ',') + '.</p>' +
      '<p class="small" style="text-align:left"><b>Возврат монет (RTP): ' + (st.coinsPity * 100).toFixed(2) + '%</b> от ставки в монетах B (без бонусов замка). Колесо щедро к упорным: три короны непременно выпадут в течение нескольких десятков вращений (в среднем раз в ~' + Math.round(st.cycle) + '), а иногда и раньше — просто крутите. Возврат энергии с барабанов: ' + (st.energy * 100).toFixed(1) + '% (плюс шкала событий). Три в ряд: ' + (st.triplesPity * 100).toFixed(2) + '%.</p>' +
      '<p class="small muted" style="text-align:left">Генератор: crypto.getRandomValues (криптостойкий), выбор позиции каждого барабана без смещения (отбраковка значений). Барабаны независимы; единственное исключение — гарантированный джекпот.</p>');
  }
  /* ---------- v0.6: выбор героя ---------- */
  function genderDialog(first) {
    var cards = ['m', 'f'].map(function (g) { var h = D.HEROES[g];
      return '<button class="gcard' + (state.hero.g === g && !first ? ' on' : '') + '" data-act="setGender" data-g="' + g + '"><img src="' + h.img + '" alt=""><b>' + h.name + '</b><span>' + h.label + '</span></button>'; }).join('');
    var m = dialog('<div class="gender"><h2>' + (first ? 'Кто унаследовал замок?' : 'Ваш герой') + '</h2><p class="small">' + (first ? 'Дед оставил Вальдмор внуку… или внучке? Введите имя и выберите, за кого играть — сменить можно в любой момент в Настройках.' : 'Диалоги и обращения жителей подстроятся под выбор. Прогресс не меняется.') + '</p>' +
      '<label class="gname">Имя <input id="heroName" maxlength="16" autocomplete="off" placeholder="' + esc(D.HEROES[state.hero.g].name) + '" value="' + esc(state.hero.name || '') + '"></label><div class="gpick">' + cards + '</div></div>',
      first ? [] : [{ t: 'Назад к настройкам', act: 'backSettings', cls: 'sec' }]);
    if (first) m.onClose = function () { if (!state.hero.chosen || !state.hero.named) { state.hero.chosen = true; state.hero.named = true; save(); } dequeue(); };
    return m;
  }
  /* ---------- v0.6: обучение с вороном Карром ---------- */
  var tutOpen = false;
  var TUT = [
    { t: 'Кар-р! Знакомство', x: 'Я Карр — ворон замка Вальдмор и, между прочим, твой наставник. Покажу всё по одному пёрышку: что это, зачем и как этим пользоваться. Пропустить можно в любой момент, повторить — в Настройках.' },
    { sel: '#spinBtn', t: 'Колесо Судьбы', x: 'Главная кнопка. Жми «Крутить» — три барабана остановятся, и всё, что совпало на линии, твоё: монеты, энергия, ключи, карты, сундуки. Каждое вращение тратит энергию, равную ставке.' },
    { sel: '.betbox', t: 'Ставка', x: 'Стрелки меняют множитель: ×1, ×2, ×3… Больше ставка — больше награда, но и энергии уходит больше. Новые ставки открываются с уровнем. Не горячись — Колесо любит терпеливых.' },
    { sel: '#top .res.energy', t: 'Энергия', x: 'Топливо для Колеса. Слева — сколько есть, после «/» — максимум. Зелёное кольцо у значка — сколько осталось до следующей единицы. Энергия копится сама, даже когда игра закрыта. Нажми на значок — покажу точное время.' },
    { sel: '#top .res.coins', t: 'Монеты', x: 'На монеты строят и улучшают замок. «12.5K» — это 12 500, «1.2M» — 1 200 000. Лимита нет — копи сколько угодно, но лучше строй!' },
    { sel: '#top .res.keys', t: 'Ключи', x: 'Ключи открывают сундуки сразу, без ожидания. После «/» — размер связки: лишние ключи не поместятся. Связку, как и всё хозяйство, расширяет Склад.' },
    { sel: '#top .res.mana', t: 'Мана', x: 'Волшебная сила для заклинаний из Башни архимага: удвоить монеты, приманить карты и прочие чудеса. Копится сама, а расходуется только по твоей команде.' },
    { sel: '#chests', t: 'Сундуки', x: 'Сюда падают сундуки с барабанов. Нажми на сундук, чтобы начать отпирание по таймеру, или открой его ключами прямо сейчас. Внутри монеты, энергия, а иногда и карты.' },
    { sel: '#evbar', t: 'Шкала события', x: 'Во время праздников с барабанов падают особые предметы. Они наполняют шкалу над Колесом, а за каждый этап — подарок. Каждый праздник — свой предмет.' },
    { sel: '#dbar', t: 'Дневной сбор', x: 'А это — сбор дня. Каждый день духи долины прячут в барабанах свой предмет — банки светлячков, жёлуди, перья, фонарики… Какой сегодня — видно на значке слева. Собирай — на 100 штук дадут 100 энергии, на 1 000 — тысячу, и так до 50 000! В полночь всё начинается заново, с новым предметом.' },
    { sel: '[data-act="miniMenu"]', t: 'Мини-игры', x: 'Когда надоест крутить — сюда. «Поиск» (5 попыток в день, энергия и шанс на ультраредкую карту), и «Магический сапёр» 9×9. Монетки-мини за «Поиск» тратятся в мини-лавке.' },
    { sel: '#reels', t: 'Меч', x: '<img src="img/sym/9.webp" style="width:44px;float:left;margin:0 8px 4px 0;border-radius:10px">Новый символ на барабанах — меч. Три меча на линии — атака на соседа. Как выпадут, я покажу всех четырёх соседей: уровень замка, казна, есть ли щит. Выбирай, к кому в гости.' },
    { sel: '[data-act="raids"]', t: 'Набеги', x: 'Дальше — деревня соседа: коснись постройки, и меч ударит по ней. Удар уносит десятую часть его казны, разрушение — больше и ещё 2 печати. Поднятый щит 🛡 примет первый удар на себя. Соседи бьют в ответ, но твои щиты (каждые 30 вращений) держат удар, журнал помнит обидчиков, а «Отомстить» проходит сквозь любой щит и даёт ×1,5.' },
    { sel: '#tLvl', t: 'Уровень', x: 'Кольцо вокруг цифры — опыт до следующего уровня. Новый уровень открывает ставки, постройки и коллекции. Нажми — увидишь свою летопись.' },
    { sel: '#nav [data-to="castle"]', t: 'Замок', x: 'А теперь — самое красивое. Здесь твой замок. Пойдём посмотрим!' },
    { screen: 'castle', sel: '#isoHost', t: 'Постройки', x: 'Карту двигают пальцем и приближают щипком. Каждая постройка что-то даёт: Склад — вместимость, Академия — быстрее энергия, Казна — доход. Нажми на постройку — житель расскажет новости, а потом откроется окно улучшения.' },
    { screen: 'castle', sel: '#isoHud [data-act="bldList"]', t: 'Улучшения', x: 'Здесь список всех построек. Стрелка ▲ значит «можно улучшить». Улучшение стоит монет и строится по настоящему времени — даже когда игра закрыта.' },
    { screen: 'castle', sel: '#isoHud [data-act="bqueue"]', t: 'Стройка', x: 'Очередь стройки. Строители работают по одному заказу каждый; Цитадель добавляет строителей и ускоряет работу. Хочешь быстрее — улучшай Цитадель.' },
    { screen: 'slot', sel: '#nav [data-to="cards"]', t: 'Карты и коллекции', x: 'Карты — осколки Сердца Фортуны. Собери коллекцию целиком — получишь вечный бонус. Карты падают нечасто, так что каждая — праздник. Дубликаты меняй на печати у гнома Бруни.' },
    { sel: '#nav [data-to="quests"]', t: 'Задания и сюжет', x: 'Главы истории, ежедневные задания и достижения. У каждой главы есть цепочка заданий из трёх частей — с диалогами, перебивками и спорами о пирогах. Выполнил часть — открывается следующая. Спойлеров от меня не жди: я ворон приличный.' },
    { sel: '#nav [data-to="events"]', t: 'События', x: 'Праздники в долине сменяют друг друга. У каждого — своя коллекция, свой предмет для шкалы и свои бонусы. Загляни сюда, когда захочешь узнать, что сейчас празднуют.' },
    { sel: '#top .gear', t: 'Настройки', x: 'Звук, турбо, анимация карты, катсцены у построек, выбор героя или героини — и это обучение, если захочешь повторить. Я не обижусь. Почти.' },
    { t: 'Всё, {готов|готова}!', x: 'Крути Колесо, строй замок, собирай карты. Если что — я рядом, на самой высокой башне. Кар-р!' }
  ];
  var TUT_X2 = [
    { t: 'Кар-р! Новости', x: 'В замке перемены, и я обязан всё показать — у меня контракт. Пять новинок, по одной за раз.' }
  ].concat(TUT.filter(function (s) { return /Дневной сбор|Мини-игры|^Меч$|Набеги|Задания и сюжет/.test(s.t); })).concat([{ t: 'Это всё!', x: 'Иди крути, сражайся и не забывай мстить барону. Умеренно. Кар-р!' }]);
  var TUT_X3 = [{ t: 'Кар-р! К оружию!', x: 'Короткая новость, обещаю. Барабаны теперь звенят сталью.' }]
    .concat(TUT.filter(function (s) { return /^(Меч|Набеги)$/.test(s.t); })).concat([{ t: 'Вперёд!', x: 'Крути, лови мечи и навести барона. Вежливо, но с размаха. Кар-р!' }]);
  function startTutorial(from, list) {
    if (tutOpen) return; tutOpen = true; auto = false;
    var TUT0 = TUT; if (list === 'x2') TUT = TUT_X2; if (list === 'x3') TUT = TUT_X3;
    var i = from || 0, el = document.createElement('div'); el.className = 'tut'; $('#app').appendChild(el);
    function done(skipped) {
      tutOpen = false; state.tut.done = true; state.tut.x2 = true; state.tut.x3 = true; state.tut.step = 0; TUT = TUT0; save(); if (el.parentNode) el.parentNode.removeChild(el);
      if (screen !== 'slot') go('slot'); if (skipped) toast('Обучение можно пройти снова: Настройки → Обучение с вороном', 'img/guide/raven.webp');
      setTimeout(pumpScenes, 400);
    }
    function show() {
      var st = TUT[i];
      if (st.screen && screen !== st.screen) go(st.screen);
      state.tut.step = i; save();
      setTimeout(function () {
        var app = $('#app').getBoundingClientRect(), tg = st.sel ? $(st.sel) : null, r = tg && tg.getBoundingClientRect(), hole = '', top = true;
        if (r && r.width) {
          var p = 6, x = r.left - app.left - p, y = r.top - app.top - p, w = r.width + 2 * p, h = r.height + 2 * p;
          hole = '<div class="tut-hole" style="left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px"></div>';
          top = (y + h / 2) > app.height / 2;   // цель внизу — подсказка сверху
        }
        el.innerHTML = (hole || '<div class="tut-dim"></div>') + '<div class="tut-box ' + (top ? 'at-top' : 'at-bot') + '"><img class="tut-raven" src="img/guide/raven.webp" alt="Ворон Карр">' +
          '<div class="tut-bub"><div class="tut-k">Карр · ' + (i + 1) + ' из ' + TUT.length + '</div><h3>' + D.g(st.t) + '</h3><p>' + D.g(st.x) + '</p>' +
          '<div class="tut-btns">' + (i > 0 ? '<button class="btn sec sm" data-t="back">◂ Назад</button>' : '') + '<button class="btn sec sm" data-t="skip">Пропустить</button>' +
          '<button class="btn green sm" data-t="next">' + (i === TUT.length - 1 ? 'Начать игру!' : 'Дальше ▸') + '</button></div></div></div>';
      }, st.screen ? 260 : 30);
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-t]'); if (!b) return; S.click();
      var t = b.dataset.t;
      if (t === 'skip') return done(true);
      if (t === 'back') { i = Math.max(0, i - 1); return show(); }
      if (i >= TUT.length - 1) return done(false);
      i++; show();
    });
    if (screen !== 'slot' && !TUT[i].screen) go('slot');
    show();
  }
  function settingsDialog() {
    var s = state.settings;
    dialog('<h2>Настройки</h2>' +
      '<button class="btn sec wide" data-act="toggleSound">' + (s.sound ? '🔊 Звук: вкл' : '🔇 Звук: выкл') + '</button><div style="height:8px"></div>' +
      '<button class="btn sec wide" data-act="turbo">' + (s.turbo ? '⚡ Турбо-вращение: вкл' : '⚡ Турбо-вращение: выкл') + '</button><div style="height:8px"></div>' +
      '<button class="btn sec wide" data-act="mapFx">🏮 Анимация карты: ' + ({ high: 'полная', low: 'экономная', off: 'выкл' })[s.mapFx || 'high'] + '</button><div style="height:8px"></div>' +
      '<button class="btn sec wide" data-act="toggleResidents">' + (s.residents === false ? '🎬 Катсцены у построек: выкл' : '🎬 Катсцены у построек: вкл') + '</button><div style="height:8px"></div>' +
      '<button class="btn sec wide" data-act="gender">' + (state.hero.g === 'f' ? '👩' : '👦') + ' ' + D.HEROES[state.hero.g].label + ': ' + esc(D.CHARS.hero.name) + ' — сменить</button><div style="height:8px"></div>' +
      (window.CLV07 ? CLV07.settingsHTML() : '') +
      '<button class="btn sec wide" data-act="tutorial">🐦‍⬛ Обучение с вороном — пройти снова</button><div style="height:8px"></div>' +
      '<button class="btn sec wide" data-act="paytable">📜 Выплаты и RTP</button><div style="height:8px"></div>' +
      '<button class="btn sec wide" data-act="export">💾 Экспорт сохранения</button><div style="height:8px"></div>' +
      '<button class="btn sec wide" data-act="import">📥 Импорт сохранения</button><div style="height:8px"></div>' +
      '<button class="btn sec wide" data-act="credits">✒️ Создатели</button><div style="height:8px"></div>' +
      '<button class="btn sec wide" data-act="reset" style="color:var(--bad)">Начать заново</button>' +
      (window.CLPlatform && CLPlatform.settingsHTML ? CLPlatform.settingsHTML() : '') +
      '<p class="small muted">' + D.CREDITS.title + ' ' + D.APP_VERSION + ' · офлайн · сохранение v' + D.SAVE_VERSION + '<br>Без рейтингов, без покупок, без интернета.</p>', [{ t: 'Закрыть', act: 'close', cls: 'sec' }]);
  }
  function creditsDialog() { // экран «Создатели»: кто что делал
    var c = D.CREDITS;
    function card(role, name, items) { return '<div class="cr-card"><div class="cr-role">' + role + '</div><div class="cr-name">' + name + '</div><ul class="cr-list">' + items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul></div>'; }
    dialog('<div class="credits"><div class="cr-art"><img src="img/ui/castle_bg.webp" alt=""></div>' +
      '<div class="cr-kicker">Создатели</div><h2 class="cr-title">' + c.title + '</h2>' +
      '<div class="cr-ver">Версия ' + D.APP_VERSION + ' · ' + c.author + ' и ' + c.maker + '</div>' +
      card('Автор идеи', c.author, ['идея и замысел игры', 'мир замка, сюжет и жители — куда ведёт история', 'что добавить, что убрать и что переделать', 'выбор стиля, проверка и все решения по игре']) +
      card('Код и рисунки', c.maker, ['весь программный код игры', 'все рисунки: карта, постройки, жители, портреты, карты коллекций', 'анимации, звуки и эффекты', 'сборка для Android и iPhone']) +
      '<p class="cr-note">Игра «' + c.title + '» придумана ' + c.author + ' — это его игра. Код и рисунки выполнил ' + c.maker + ' по его задумке. ' +
      'Пожалуйста, не копируйте, не перепродавайте и не выкладывайте игру или её графику от своего имени без разрешения автора.</p>' +
      '<div class="cr-copy">© ' + c.year + ' ' + c.author + ' · код и рисунки: ' + c.maker + '</div>' +
      '<div class="cr-thanks">Спасибо, что играете! ✨</div></div>', [{ t: 'Назад к настройкам', act: 'backSettings', cls: 'sec' }]);
  }
  function profileDialog() {
    var d = E.derived(state), st = state.stats;
    dialog('<h2>' + D.g('Лорд Вальдмора') + '</h2>' + effRow('Уровень', state.level) + effRow('Опыт', fmtXp(state.xp) + ' / ' + fmt(D.xpNeed(state.level))) + effRow('Базовая монета B', fmt(d.B)) +
      effRow('Бонус монет', '+' + Math.round((d.coinMul - 1) * 100) + '%') + effRow('Бонус опыта', '+' + Math.round((d.xpMul - 1) * 100) + '%') + effRow('Шанс редких карт', '+' + Math.round(d.rare * 100) + '%') +
      effRow('Вращений', fmt(st.spins)) + effRow('Выиграно монет', fmt(st.coinsWon)) + effRow('Лучший выигрыш', fmt(st.bestWin)) + effRow('Три в ряд', fmt(st.triples)) + effRow('Джекпотов', st.jackpots) + effRow('Печати', state.seals), [{ t: 'Закрыть', act: 'close', cls: 'sec' }]);
  }
  function loginDialog() {
    queuedDialog('<h2>С возвращением!</h2><p>Награда за вход — день ' + ((state.login.streak - 1) % 7 + 1) + ' из 7</p>' + loginCalendar(), [{ t: 'Забрать', act: 'claimLogin', cls: 'green' }]);
  }

  /* ---------- действия ---------- */
  function fail(r) { toast(r.reason || 'Нельзя'); S.error(); }
  var ACT = {
    close: function () { closeModal(); },
    go: function (d) { closeAllModals(); go(d.to); },
    goCards: function () { closeAllModals(); go('cards'); },
    storyTab: function () { qtab = 'story'; go('quests'); },
    spin: function () { doSpin(); },
    bet: function (d) {
      var o = E.betOptions(state), i = o.indexOf(state.bet) + (+d.d);
      if (i < 0) { toast('Минимальная ставка'); return; }
      if (i >= o.length) { toast('Большие ставки откроются с уровнем: ' + D.BETS.filter(function (b) { return b.lvl > state.level; }).slice(0, 2).map(function (b) { return '×' + b.x + ' — ' + b.lvl + ' ур.'; }).join(', ')); return; }
      E.setBet(state, o[i]); S.click(); updateSlotUI(); save();
    },
    auto: function () { auto = !auto; updateSlotUI(); if (auto && !spinning) doSpin(); },
    turbo: function () { state.settings.turbo = !state.settings.turbo; updateSlotUI(); save(); if ($('.dialog [data-act="turbo"]')) { closeModal(); settingsDialog(); } },
    spells: function () { openSheet('Заклинания', function () { return (state.bld.tower < 1 ? '<p class="muted">Постройте Башню архимага (откроется на 6 уровне), чтобы применять заклинания.</p>' : '') + '<div class="small muted" style="margin-bottom:8px">Мана: ' + state.mana + ' / ' + E.derived(state).maxMana + '</div>' + spellsList(); }); },
    paytable: function () { paytableDialog(); },
    chest: function (d) { openChestDialog(+d.i); },
    chestStart: function (d) { var r = E.startUnlock(state, +d.i, now()); closeModal(); if (!r.ok) return fail(r); refreshAll(); },
    chestOpen: function (d) {
      var c = state.chests[+d.i], tier = c && c.tier;
      var r = E.openChest(state, +d.i, now(), rng, !!d.keys); closeModal();
      if (!r.ok) return fail(r);
      S.chest(); showReward(D.CHESTS[tier].name, r.loot, D.CHESTS[tier].img); refreshAll();
    },
    bld: function (d) { var b = D.BLD_BY_ID[d.id]; openSheet(b.name, function () { return buildingHTML(d.id); }); },
    bqueue: function () { openSheet('Стройка', function () { return buildQueueHTML(); }); },
    bldList: function () { openSheet('Постройки замка', function () { return castleListHTML(); }); },
    isoZoom: function (d) { if (iso) iso.zoomBy(+d.f); },
    isoHome: function () { if (iso) iso.home(); },
    mapFx: function () { var o = ['high', 'low', 'off'], c = state.settings.mapFx || 'high'; state.settings.mapFx = o[(o.indexOf(c) + 1) % 3]; save(); closeModal(); settingsDialog(); },
    resInfo: function (d) { resInfo(d.r); },
    gender: function () { closeModal(); genderDialog(false); },
    setGender: function (d) {
      var first = !state.hero.chosen || !state.hero.named, ni = $('#heroName'); state.hero.g = d.g === 'f' ? 'f' : 'm'; state.hero.chosen = true; state.hero.named = true;
      if (ni) state.hero.name = D.cleanName(ni.value); D.setHero(state.hero.g, state.hero.name); saveNow(); S.click();
      closeModal(); if (!first) { toast((state.hero.g === 'f' ? 'Героиня' : 'Герой') + ': ' + D.CHARS.hero.name + '. Диалоги теперь обращаются к вам как к ' + (state.hero.g === 'f' ? 'миледи' : 'милорду') + '.', D.HEROES[state.hero.g].img); settingsDialog(); }
    },
    tutorial: function () { closeAllModals(); startTutorial(); },
    toggleResidents: function () { state.settings.residents = state.settings.residents === false; save(); closeModal(); settingsDialog(); },
    upgrade: function (d) {
      var r = E.upgrade(state, d.id, now()); if (!r.ok) return fail(r);
      S.build(); toast(D.BLD_BY_ID[d.id].name + ' → ' + r.to + ': ' + (r.started ? 'стройка началась, ' + fmtTime(r.ms) : 'добавлено в очередь'), D.BLD_BY_ID[d.id].img);
      handleTickEvents(r.ev); refreshAll(); pumpScenes();
    },
    skipBuild: function (d) { var r = E.skipBuild(state, +d.i, now()); if (!r.ok) return fail(r); handleTickEvents(r.ev); refreshAll(); },
    cancelBuild: function (d) { var r = E.cancelBuild(state, +d.i, now()); if (!r.ok) return fail(r); toast('Заказ отменён, возвращено ' + fmt(r.coins) + ' монет', IC.coin); refreshAll(); },
    research: function (d) { var r = E.research(state, d.id, now()); if (!r.ok) return fail(r); S.spell(); toast('Исследование началось: ' + D.SKILL_BY_ID[d.id].name + ' · ' + fmtTime(r.ms), D.SKILL_BY_ID[d.id].img); refreshAll(); },
    skipResearch: function () { var r = E.skipResearch(state, now()); if (!r.ok) return fail(r); handleTickEvents(r.ev); refreshAll(); },
    cast: function (d) {
      var r = E.cast(state, d.id, now(), rng); if (!r.ok) return fail(r);
      S.spell(); var sp = D.SPELL_BY_ID[d.id]; if (r.ev) handleTickEvents(r.ev);
      toast(sp.name + ': ' + sp.desc.replace('{n}', r.n).toLowerCase(), sp.img);
      if (r.reward) showReward(sp.name, r.reward, sp.img);
      refreshAll();
    },
    sell: function () { var r = E.sellDuplicates(state); if (!r.ok) return fail(r); S.coin(); toast('Обменяно ' + r.cards + ' ' + plural(r.cards, 'карта', 'карты', 'карт') + ' на ' + r.seals + ' печатей', IC.seal); refreshAll(); },
    buy: function (d) { var r = E.buy(state, d.id, rng, now()); if (!r.ok) return fail(r); S.coin(); toast('Куплено!', IC.seal); refreshAll(); },
    treasury: function () { var r = E.collectTreasury(state, now()); if (!r.ok) return fail(r); S.coin(); coinBurst(10); toast('Казна: +' + fmt(r.coins) + ' монет' + (r.lost ? ' (склад полон, потеряно ' + fmt(r.lost) + ')' : ''), IC.bag); refreshAll(); },
    craftKey: function () { var r = E.craftKey(state); if (!r.ok) return fail(r); S.build(); toast('Выкован ключ', IC.key); refreshAll(); },
    gallery: function () {
      var ids = []; D.COLLECTIONS.forEach(function (c) { c.cards.forEach(function (k) { if (state.cards[k.id]) ids.push(k.id); }); });
      if (!ids.length) { toast('Галерея пуста — карты выпадают при вращениях и из сундуков'); return; }
      openViewer(ids, 0);
    },
    col: function (d) { var c = D.COL_BY_ID[d.id]; if (!c.event && c.unlock > state.level) { toast('Коллекция откроется на ' + c.unlock + ' уровне'); return; } openSheet(c.name, function () { return collectionHTML(d.id); }); },
    viewCol: function (d) { openViewer(D.COL_BY_ID[d.id].cards.map(function (k) { return k.id; }), +d.i); },
    qtab: function (d) { qtab = d.t; renderScreen(); },
    readCh: function (d) { openStory(+d.n); },
    finishCh: function () {
      var n0 = state.story.ch, r = E.completeChapter(state, rng, now()); if (!r.ok) return;
      S.level(); showReward('Глава ' + n0 + ' завершена!', r.reward, D.CHAPTERS[n0 - 1].img);
      refreshAll();
    },
    claimDaily: function (d) { var r = E.claimDaily(state, +d.i, rng, now()); if (r.ok) { showReward('Задание выполнено!', r.reward); refreshAll(); } },
    claimBonus: function () { var r = E.claimDailyBonus(state, rng, now()); if (r.ok) { showReward('Все задания дня!', r.reward); refreshAll(); } },
    claimLogin: function () { if ($('.dialog [data-act="claimLogin"]')) closeModal(); var r = E.claimLogin(state, rng, now()); if (r.ok) { showReward('Награда за вход: день ' + r.day, r.reward); refreshAll(); } },
    claimAch: function (d) { var r = E.claimAch(state, d.id, rng, now()); if (r.ok) { showReward('Достижение!', r.reward); refreshAll(); } },
    settings: function () { settingsDialog(); },
    credits: function () { closeModal(); creditsDialog(); },
    backSettings: function () { closeModal(); settingsDialog(); },
    profile: function () { profileDialog(); },
    toggleSound: function () { state.settings.sound = !state.settings.sound; S.setEnabled(state.settings.sound); save(); closeModal(); settingsDialog(); },
    export: function () {
      if (window.CLPlatform && CLPlatform.onExport) CLPlatform.onExport();
      dialog('<h2>Экспорт</h2><p class="small">Скопируйте текст и сохраните в надёжном месте.</p><textarea style="width:100%;height:160px;background:#000;color:#ddd;border:1px solid var(--line);border-radius:8px;font-size:11px;user-select:text;-webkit-user-select:text" readonly>' + esc(E.serialize(state)) + '</textarea>', [{ t: 'Скопировать', act: 'copySave' }].concat(window.CLPlatform && CLPlatform.fileSave ? [{ t: 'Сохранить файлом', act: 'saveFile', cls: 'sec' }] : []).concat([{ t: 'Закрыть', act: 'close', cls: 'sec' }]));
    },
    copySave: function () {
      var ta = $('.dialog textarea'), txt = ta.value;
      function ok() { toast('Скопировано'); if (window.CLPlatform && CLPlatform.onExport) CLPlatform.onExport(); }
      function fallback() {
        ta.removeAttribute('readonly'); ta.focus(); ta.select(); try { ta.setSelectionRange(0, txt.length); } catch (e) { }
        var r = false; try { r = document.execCommand('copy'); } catch (e) { }
        ta.setAttribute('readonly', ''); ta.blur(); if (r) ok(); else toast('Выделите и скопируйте вручную');
      }
      if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(txt).then(ok, fallback); else fallback();
    },
    saveFile: function () {
      var d = new Date(), name = 'castle-luck-save-' + d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) + '.txt';
      var url = URL.createObjectURL(new Blob([E.serialize(state)], { type: 'text/plain' })), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      if (window.CLPlatform && CLPlatform.onExport) CLPlatform.onExport(); toast('Файл сохранения: ' + name);
    },
    loadFile: function () {
      var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.txt,text/plain';
      inp.onchange = function () { var f = inp.files && inp.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { var t = $('#impTxt'); if (t) t.value = String(rd.result || ''); }; rd.readAsText(f); };
      inp.click();
    },
    import: function () { dialog('<h2>Импорт</h2><p class="small bad">Текущий прогресс будет заменён.</p><textarea id="impTxt" style="width:100%;height:160px;background:#000;color:#ddd;border:1px solid var(--line);border-radius:8px;font-size:16px;user-select:text;-webkit-user-select:text"></textarea>', [{ t: 'Загрузить', act: 'doImport' }].concat(window.CLPlatform && CLPlatform.fileSave ? [{ t: 'Выбрать файл', act: 'loadFile', cls: 'sec' }] : []).concat([{ t: 'Отмена', act: 'close', cls: 'sec' }])); },
    doImport: function () { try { state = E.deserialize($('#impTxt').value.trim(), now()); saveNow(); closeAllModals(); toast('Сохранение загружено'); go('slot'); } catch (e) { toast('Ошибка: ' + e.message); } },
    reset: function () { dialog('<h2>Начать заново?</h2><p>Весь прогресс будет удалён без возможности восстановления.</p>', [{ t: 'Да, удалить прогресс', act: 'doReset', cls: 'sec' }, { t: 'Отмена', act: 'close' }]); },
    doReset: function () { state = E.newState(now()); E.tick(state, now()); saveNow(); closeAllModals(); lastWin = ''; go('slot'); pumpScenes(); }
  };
  function closeAllModals() { while (modalStack.length) { var m = modalStack[modalStack.length - 1]; m.onClose = null; closeModal(m); } queue = []; }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-act]'); if (!a || a.closest('.viewer') || a.closest('.story')) return;
    var name = a.dataset.act; if (!ACT[name]) return;
    if (name !== 'spin' && name !== 'bet') S.click();
    try { ACT[name](a.dataset); } catch (err) { console.error(err); toast('Ошибка: ' + err.message); }
  });

  function handleTickEvents(evs) {
    (evs || []).forEach(function (ev) {
      if (ev.type === 'research') { toast('Изучено: ' + D.SKILL_BY_ID[ev.id].name + ' ' + ev.lvl, D.SKILL_BY_ID[ev.id].img); S.level(); }
      if (ev.type === 'build') { var b = D.BLD_BY_ID[ev.id]; toast(b.name + ': ' + (ev.lvl === 1 ? 'построено!' : 'уровень ' + ev.lvl + '!') + ' +' + fmtXp(ev.xp) + ' опыта', b.img); S.build(); if (ev.levelUps) showLevelUps(ev.levelUps); }
      if (ev.type === 'login') loginDialog();
      if (window.CLX) CLX.onTickEvent(ev);
      if (ev.type === 'event') { buildNav(); if (screen === 'slot') renderScreen(); }
    });
  }
  function secondTick() {
    var evs = E.tick(state, now());
    if (evs.length) { handleTickEvents(evs); refreshAll(); }
    updateTop(); pumpScenes();
    var t = now();
    Array.prototype.forEach.call(document.querySelectorAll('[data-end]'), function (el) { el.textContent = fmtTime(+el.dataset.end - t); });
    var tt = Math.max(t, state.time.high), changed = false;
    state.chests.forEach(function (c, i) { var r = !!(c && c.end && tt >= c.end); if (r && !readyChests[i]) { changed = true; toast(D.CHESTS[c.tier].name + ' готов к открытию!', D.CHESTS[c.tier].img); } readyChests[i] = r; });
    if (screen === 'slot') { if (!spinning) updateSlotUI(); else renderChests(); }
    else if (changed) refreshAll();
  }

  /* ---------- запуск ---------- */
  function boot() {
    var src = load(), before = { energy: state.energy, mana: state.mana, high: state.time.high };
    D.setHero(state.hero.g, state.hero.name);
    S.setEnabled(state.settings.sound);
    var evs = E.tick(state, now());
    state.chests.forEach(function (c, i) { readyChests[i] = !!(c && c.end && state.time.high >= c.end); });
    buildTop(); buildNav(); renderScreen(); updateTop();
    var bootEl = $('#boot'); if (bootEl) bootEl.parentNode.removeChild(bootEl);
    if (src !== 'new' && now() - before.high > 5 * 60000) {
      var gained = state.energy - before.energy, gm = state.mana - before.mana;
      if (gained > 0 || gm > 0) toast('Пока вас не было (' + fmtTime(now() - before.high) + '): +' + gained + ' энергии, +' + gm + ' маны', IC.energy);
    }
    if (src === 'backup') toast('Основное сохранение повреждено — загружена резервная копия');
    if (state.time.rollback) toast('Часы устройства переведены назад — восстановление на паузе', IC.energy);
    if (window.__skipIntro) { state.scenes.queue = []; state.hero.chosen = true; state.tut.done = true; state.tut.news = false; state.tut.x2 = true; state.tut.x3 = true; state.themeAsked = true; state.seenVer = D.APP_VERSION; }
    if (!state.hero.chosen || !state.hero.named) enqueue(function () { genderDialog(true); });   // 0.9: и один раз для старых сохранений — ввести имя   // v0.6: сначала — кто унаследовал замок
    if (window.CLV07) CLV07.onBoot(src);   // 0.7: «Что нового» и выбор стиля оформления (после выбора героя)
    pumpScenes();
    handleTickEvents(evs);
    saveNow();
    setInterval(secondTick, 1000);
    window.addEventListener('resize', function () { if (screen === 'slot') layoutReels(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) { auto = false; saveNow(); } else secondTick(); });
    window.addEventListener('pagehide', saveNow);
    window.__ready = true;
  }

  /* ---------- v0.6: помощники для ui-extra.js (мини-игры, набеги, дневной сбор, цепочки) ---------- */
  window.CLUI = {
    get state() { return state; }, get screen() { return screen; }, rng: rng, now: now, ACT: ACT, IC: IC, S: S,
    dialog: dialog, openSheet: openSheet, refreshSheet: refreshSheet, closeModal: closeModal, closeAll: function () { closeAllModals(); },
    enqueue: enqueue, dequeue: dequeue,
    toast: toast, save: save, saveNow: saveNow, refreshAll: function () { refreshAll(); }, updateTop: function () { updateTop(); }, go: function (t) { go(t); },
    fmt: fmt, fmtK: fmtK, fmtTime: fmtTime, esc: esc, plural: plural, pill: pill, bar: bar, showReward: showReward, cardPop: cardPop,
    openScene: function (id, o) { openScene(id, o); }, pumpScenes: function () { pumpScenes(); }, startTutorial: function (i, list) { startTutorial(i, list); },
    setAuto: function (v) { auto = !!v; }, modalCount: function () { return modalStack.length; }
  };
  /* ---------- хуки для автотестов ---------- */
  window.CLGame = {
    get state() { return state; }, E: E, D: D, ACT: ACT,
    spin: function () { doSpin(); }, isSpinning: function () { return spinning; },
    go: go, saveNow: saveNow, refresh: refreshAll, closeAll: closeAllModals,
    fps: function () { return fps.samples.slice(); },
    setTurbo: function (v) { state.settings.turbo = !!v; },
    openStory: openStory, openScene: openScene, cardPop: cardPop, pumpScenes: pumpScenes, openViewer: openViewer, sceneOpen: function () { return sceneOpen; }, openBuilding: function (id) { ACT.bld({ id: id }); }, tapBuilding: function (id) { tapBuilding(id); }, iso: function () { return iso; },
    openCollection: function (id) { ACT.col({ id: id }); }, queueLen: function () { return queue.length; },
    setQtab: function (t) { qtab = t; }, startTutorial: function (i) { startTutorial(i); }, tutOpen: function () { return tutOpen; }, genderDialog: function (f) { genderDialog(f); }, fmtK: fmtK,
    /* кнопка «Назад» Android: закрыть верхнее окно; false — окон нет, можно спросить о выходе */
    back: function () {
      var v = document.querySelector('.viewer'); if (v) { v.querySelector('[data-vact="x"]').click(); return true; }
      var st = document.querySelector('.story'); if (st) { st.querySelector('#sSkip').click(); return true; }
      if (modalStack.length) { closeModal(); return true; }
      if (screen !== 'slot') { go('slot'); return true; }
      saveNow(); return false;
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
