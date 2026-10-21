// Lists app UI. Plain JS, no framework. Screens: home (#/), a list (#/list/<id>), settings (#/settings).
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = $('#app'), sheetRoot = $('#sheet-root');

  // card / edge / title-bar colors (ColorNote style). Yellow is the default.
  const COLORS = {
    yellow: ['#FFF7B8', '#F2D33A', '#8a8a00'],
    orange: ['#FFE0B8', '#F5A142', '#a35c00'],
    red:    ['#FFCDCD', '#E57373', '#9a3030'],
    purple: ['#E8D7F7', '#A57BD3', '#5e3f86'],
    blue:   ['#CFE6FF', '#5DA3E8', '#2d5f8f'],
    green:  ['#D9F5CC', '#7CC36A', '#3f7a2e'],
    gray:   ['#E6E6E6', '#9E9E9E', '#555555'],
  };
  const col = c => COLORS[c] || COLORS.yellow;

  const I = {
    back: '<svg viewBox="0 0 24 24"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/></svg>',
    pencil: '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm17.7-10.2a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
    dots: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg>',
  };

  // ---------- dates ----------
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const valid = iso => iso && iso > '1971' && !isNaN(new Date(iso));
  function shortWhen(iso) { // "7:10 AM" today, "Oct 17" this year, "Nov 20<br>2025" older
    if (!valid(iso)) return '';
    const d = new Date(iso), n = new Date();
    if (d.toDateString() === n.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const md = `${MON[d.getMonth()]} ${d.getDate()}`;
    return d.getFullYear() === n.getFullYear() ? md : `${md}<br>${d.getFullYear()}`;
  }
  const longDate = iso => valid(iso) ? `${MON[new Date(iso).getMonth()]} ${new Date(iso).getDate()}, ${new Date(iso).getFullYear()}` : '';
  const stamp = iso => valid(iso) ? new Date(iso).toLocaleString([], { month: 'numeric', day: 'numeric', year: '2-digit', hour: 'numeric', minute: '2-digit' }) : '';

  // ---------- bottom sheets & dialogs ----------
  function closeSheet() { sheetRoot.innerHTML = ''; sheetRoot.onclick = null; }
  function menu(title, actions) { // actions: [{label, fn, danger}]
    sheetRoot.innerHTML = `<div class="scrim"><div class="sheet" role="menu">
      ${title ? `<div class="sheet-title">${esc(title)}</div>` : ''}
      ${actions.map((a, i) => `<button class="sheet-btn ${a.danger ? 'danger' : ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}
      <button class="sheet-btn cancel" data-i="-1">Cancel</button></div></div>`;
    sheetRoot.onclick = e => {
      const b = e.target.closest('[data-i]');
      if (!b && e.target.closest('.sheet')) return;
      closeSheet(); if (b && +b.dataset.i >= 0) actions[+b.dataset.i].fn();
    };
  }
  function ask({ title, value = '', placeholder = '', ok = 'Save', colors = null, color = 'yellow' }) {
    return new Promise(resolve => {
      sheetRoot.innerHTML = `<div class="scrim"><form class="dialog">
        <div class="dialog-title">${esc(title)}</div>
        <input class="dialog-input" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="200" autocomplete="off">
        ${colors ? `<div class="swatches">${Object.keys(COLORS).map(c => `<button type="button" class="swatch ${c === color ? 'on' : ''}" data-c="${c}" aria-label="${c}" style="background:${COLORS[c][0]};border-color:${COLORS[c][1]}"></button>`).join('')}</div>` : ''}
        <div class="dialog-btns"><button type="button" class="txt-btn" data-x>Cancel</button><button class="txt-btn strong">${esc(ok)}</button></div>
      </form></div>`;
      let picked = color;
      const f = $('.dialog', sheetRoot), inp = $('input', f);
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
      f.onclick = e => { const s = e.target.closest('.swatch'); if (s) { picked = s.dataset.c; f.querySelectorAll('.swatch').forEach(x => x.classList.toggle('on', x === s)); } };
      $('[data-x]', f).onclick = () => { closeSheet(); resolve(null); };
      f.onsubmit = e => { e.preventDefault(); const v = inp.value.trim(); closeSheet(); resolve(v ? { text: v, color: picked } : null); };
    });
  }
  function confirmBox(text, ok = 'Delete') {
    return new Promise(resolve => {
      sheetRoot.innerHTML = `<div class="scrim"><div class="dialog"><div class="dialog-title">${esc(text)}</div>
        <div class="dialog-btns"><button class="txt-btn" data-v="0">Cancel</button><button class="txt-btn strong danger" data-v="1">${esc(ok)}</button></div></div></div>`;
      sheetRoot.onclick = e => { const b = e.target.closest('[data-v]'); if (b) { closeSheet(); resolve(b.dataset.v === '1'); } };
    });
  }

  // ---------- long press ----------
  function longPress(container, selector, onLong) {
    let timer = null, sx = 0, sy = 0;
    container.addEventListener('pointerdown', e => {
      const el = e.target.closest(selector); if (!el) return;
      sx = e.clientX; sy = e.clientY;
      timer = setTimeout(() => { timer = null; el.dataset.long = '1'; if (navigator.vibrate) navigator.vibrate(20); onLong(el); }, 550);
    });
    const cancel = () => { clearTimeout(timer); timer = null; };
    container.addEventListener('pointerup', cancel);
    container.addEventListener('pointercancel', cancel);
    container.addEventListener('pointermove', e => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel(); });
    container.addEventListener('contextmenu', e => { if (e.target.closest(selector)) e.preventDefault(); });
  }
  const wasLong = el => { if (el.dataset.long) { delete el.dataset.long; return true; } return false; };

  // ---------- pull to refresh ----------
  function pullToRefresh(scroller) {
    let y0 = null, dy = 0; const ind = document.createElement('div'); ind.className = 'ptr'; ind.textContent = 'Release to sync';
    scroller.prepend(ind);
    scroller.addEventListener('touchstart', e => { y0 = scroller.scrollTop <= 0 ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
    scroller.addEventListener('touchmove', e => {
      if (y0 === null) return; dy = e.touches[0].clientY - y0;
      ind.style.height = Math.max(0, Math.min(70, dy / 2)) + 'px'; ind.classList.toggle('ready', dy > 120);
    }, { passive: true });
    scroller.addEventListener('touchend', () => { if (y0 !== null && dy > 120) Sync.run(); y0 = null; ind.style.height = '0'; });
  }

  // ---------- badge ----------
  function badgeHTML() {
    const st = Sync.state(), cls = !navigator.onLine ? 'offline' : st;
    return `<button class="badge ${cls} ${Store.pendingCount() ? 'has-pending' : ''}" data-act="sync" title="${esc(Sync.error())}">${esc(Sync.label())}</button>`;
  }
  function refreshBadges() { document.querySelectorAll('.badge').forEach(b => b.outerHTML = badgeHTML()); }
  function onBadge() {
    const st = Sync.state();
    if (st === 'setup') return go('#/settings');
    if (st === 'error') return menu('Sync problem: ' + Sync.error(), [{ label: 'Try again', fn: Sync.run }, { label: 'Settings', fn: () => go('#/settings') }]);
    Sync.run();
  }

  // ---------- screens ----------
  let sortBy = localStorage.getItem('cl.sort') || 'modified';
  function home() {
    document.body.className = 'home';
    app.innerHTML = `<header class="home-bar"><div class="brand">Lists</div>${badgeHTML()}
        <button class="icon-btn dark" data-act="home-menu" aria-label="Menu">${I.dots}</button></header>
      <button class="sortbar" data-act="sort">Sort by ${sortBy === 'modified' ? 'modified time' : 'title'} ▼</button>
      <main class="cards scroller" id="cards"></main>
      <button class="fab" data-act="new-list" aria-label="New list">${I.plus}</button>`;
    renderCards();
    const cards = $('#cards');
    cards.addEventListener('click', e => { if (e.target.closest('.meals-card')) go('#/meals'); });
    pullToRefresh(cards);
    longPress(cards, '.card', el => listMenu(el.dataset.id));
    cards.addEventListener('click', e => { const c = e.target.closest('.card'); if (c && !wasLong(c)) go('#/list/' + encodeURIComponent(c.dataset.id)); });
  }
  function renderCards() {
    const el = $('#cards'); if (!el) return;
    let ls = Store.lists().map(l => ({ l, m: Store.modified(l), its: Store.items(l.name) }));
    ls.sort(sortBy === 'modified' ? (a, b) => b.m.localeCompare(a.m) || a.l.name.localeCompare(b.l.name) : (a, b) => a.l.name.localeCompare(b.l.name));
    const ptr = el.querySelector('.ptr');
    const s = Store.settings();
    const pinned = s.url && s.token ? `<div class="meals-card" role="button"><span class="mc-icon">🍽</span><div class="mc-title">This week's meals &amp; recipes</div><span class="mc-go">›</span></div>` : '';
    el.innerHTML = pinned + (ls.length ? ls.map(({ l, m, its }) => {
      const [bg, edge] = col(l.color), all = its.length && its.every(i => i.done);
      return `<div class="card" data-id="${esc(l.id)}" style="background:${bg};border-left-color:${edge}">
        <div class="card-title">${esc(l.name)}</div>
        <div class="card-meta">${all ? `<span class="card-check">${I.check}</span>` : ''}<span class="card-date">${shortWhen(m)}</span></div></div>`;
    }).join('') : '<div class="empty">No lists yet. Tap + to make one.</div>');
    if (ptr) el.prepend(ptr);
  }

  let curListId = null;
  function listView(id) {
    const l = Store.list(id);
    if (!l || l.deleted) return go('#/');
    curListId = id; document.body.className = 'list';
    const bar = col(l.color)[2];
    document.querySelector('meta[name=theme-color]').content = bar;
    app.innerHTML = `<header class="list-bar" style="background:${bar}">
        <button class="icon-btn" data-act="back" aria-label="Back">${I.back}</button>
        <div class="list-title" id="ltitle">${esc(l.name)}</div>
        <button class="icon-btn" data-act="edit-list" aria-label="Edit list">${I.pencil}</button>
        <button class="icon-btn" data-act="list-menu" aria-label="More">${I.dots}</button></header>
      <div class="subhead"><span id="lcreated">${longDate(l.created) || '&nbsp;'}</span>${badgeHTML()}<span id="lmod">${stamp(Store.modified(l))}</span></div>
      <main class="rows scroller" id="rows"></main>
      <form class="addbar" id="addbar"><input id="newitem" placeholder="Add item" autocomplete="off" maxlength="300" enterkeyhint="done">
        <button class="add-btn" aria-label="Add" style="background:${bar}">${I.plus}</button></form>`;
    renderRows();
    const rows = $('#rows');
    pullToRefresh(rows);
    longPress(rows, '.row', el => itemMenu(el.dataset.id));
    rows.addEventListener('click', e => {
      const r = e.target.closest('.row'); if (!r || wasLong(r)) return;
      if (e.target.closest('.row-menu')) return itemMenu(r.dataset.id);
      Store.toggleItem(r.dataset.id); Sync.run();
    });
    $('#addbar').onsubmit = e => {
      e.preventDefault(); const inp = $('#newitem'), v = inp.value.trim(); if (!v) return;
      const cur = Store.list(curListId); Store.addItem(cur.name, v); inp.value = ''; inp.focus();
      rows.scrollTop = rows.scrollHeight; Sync.run();
    };
  }
  function renderRows() {
    const el = $('#rows'); if (!el) return; const l = Store.list(curListId); if (!l || l.deleted) return go('#/');
    $('#ltitle').textContent = l.name; $('#lmod').textContent = stamp(Store.modified(l));
    const ptr = el.querySelector('.ptr');
    const its = Store.items(l.name);
    el.innerHTML = its.length ? its.map(i => `<div class="row ${i.done ? 'done' : ''}" data-id="${esc(i.id)}">
        <div class="row-text">${esc(i.text)}</div>
        ${i.done ? `<span class="row-check" aria-label="done">${I.check}</span>` : `<button class="row-menu" aria-label="Item menu">${I.dots}</button>`}
      </div>`).join('') : '<div class="empty dark">Empty list. Type below to add an item.</div>';
    if (ptr) el.prepend(ptr);
  }

  function itemMenu(id) {
    const it = Store.item(id); if (!it) return;
    menu(it.text, [
      { label: it.done ? 'Mark not done' : 'Mark done', fn: () => { Store.toggleItem(id); Sync.run(); } },
      { label: 'Edit', fn: async () => { const r = await ask({ title: 'Edit item', value: it.text }); if (r) { Store.editItem(id, r.text); Sync.run(); } } },
      { label: 'Delete', danger: true, fn: () => { Store.deleteItem(id); Sync.run(); } },
    ]);
  }
  async function editList(id) {
    const l = Store.list(id); if (!l) return;
    const r = await ask({ title: 'List name and color', value: l.name, colors: true, color: l.color });
    if (!r) return;
    if (r.text !== l.name && Store.listByName(r.text)) return alert('You already have a list with that name.');
    Store.updateList(id, { name: r.text, color: r.color }); Sync.run(); route();
  }
  function listMenu(id) {
    const l = Store.list(id); if (!l) return;
    menu(l.name, [
      { label: 'Rename / color', fn: () => editList(id) },
      { label: 'Clear done items', fn: () => { Store.clearDone(l.name); Sync.run(); } },
      { label: 'Delete list', danger: true, fn: async () => { if (await confirmBox(`Delete "${l.name}" and all its items?`)) { Store.deleteList(id); Sync.run(); go('#/'); } } },
    ]);
  }
  async function newList() {
    const r = await ask({ title: 'New list', placeholder: 'List name', ok: 'Create', colors: true });
    if (!r) return;
    if (Store.listByName(r.text)) return go('#/list/' + encodeURIComponent(Store.listByName(r.text).id));
    const l = Store.addList(r.text, r.color); Sync.run(); go('#/list/' + encodeURIComponent(l.id));
  }

  function settings() {
    document.body.className = 'settings';
    const s = Store.settings(), meta = Store.meta();
    app.innerHTML = `<header class="home-bar"><button class="icon-btn dark" data-act="back" aria-label="Back">${I.back}</button><div class="brand small">Settings</div></header>
      <main class="settings-body scroller">
        <p>To sync with your Google Sheet, paste the <b>Apps Script web app URL</b> (ends in <code>/exec</code>) and your <b>secret token</b>. They are saved only on this phone.</p>
        <label>Apps Script URL<input id="s-url" type="url" value="${esc(s.url || '')}" placeholder="https://script.google.com/macros/s/.../exec" autocomplete="off" spellcheck="false"></label>
        <label>Secret token<input id="s-token" type="password" value="${esc(s.token || '')}" placeholder="the TOKEN you set in Apps Script" autocomplete="off" spellcheck="false"></label>
        <label class="inline"><input type="checkbox" id="s-show"> Show token</label>
        <div class="btn-row"><button class="btn" data-act="s-test">Test</button><button class="btn primary" data-act="s-save">Save &amp; sync</button></div>
        <div id="s-msg" class="msg"></div>
        <p class="muted">Last sync: ${meta.lastSync ? new Date(meta.lastSync).toLocaleString() : 'never'} · Waiting to send: ${Store.pendingCount()}</p>
        ${s.url ? '' : '<button class="btn link" data-act="s-skip">Skip for now (use without sync)</button>'}
        <hr><button class="btn link danger" data-act="s-wipe">Erase lists on this phone</button>
        <p class="muted">Erasing only clears this phone. Your Google Sheet keeps everything that already synced.</p>
      </main>`;
    $('#s-show').onchange = e => { $('#s-token').type = e.target.checked ? 'text' : 'password'; };
  }
  function readSettingsForm() { return { url: $('#s-url').value.trim(), token: $('#s-token').value.trim() }; }
  async function testSettings(save) {
    const f = readSettingsForm(), msg = $('#s-msg');
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(f.url) && !/^http:\/\/localhost[:/]/.test(f.url)) { msg.className = 'msg bad'; msg.textContent = 'That URL should start with https://script.google.com/macros/s/ and end in /exec'; return; }
    if (!f.token) { msg.className = 'msg bad'; msg.textContent = 'Enter the token.'; return; }
    const old = Store.settings(); Store.saveSettings({ ...old, ...f });
    msg.className = 'msg'; msg.textContent = 'Checking…';
    try { await Sync.call({ action: 'ping' }); msg.className = 'msg good'; msg.textContent = 'Connected ✓'; }
    catch (e) { msg.className = 'msg bad'; msg.textContent = 'Could not connect: ' + e.message; if (!save) Store.saveSettings(old); return; }
    if (save) { Store.saveSettings({ ...f, configured: true }); await Sync.run(); Store.seedDefaults(); Sync.run(); go('#/'); }
  }

  // ---------- share a list (how a list gets into ColorNote) ----------
  // ColorNote has no public API, but it accepts text from Android's share sheet:
  // pick ColorNote there and it makes a new note. Falls back to copying.
  async function shareList(name) {
    const open = Store.items(name).filter(i => !i.done).map(i => '• ' + i.text);
    const text = name + '\n' + (open.length ? open.join('\n') : '(nothing left on the list)');
    try {
      if (navigator.share) { await navigator.share({ title: name, text }); return; }
      await navigator.clipboard.writeText(text); toast('Copied. Paste it into ColorNote or a message.');
    } catch (e) { if (e && e.name !== 'AbortError') toast('Could not share: ' + (e.message || e)); }
  }
  function toast(t) {
    const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d);
    setTimeout(() => d.remove(), 3500);
  }

  // ---------- this week's meals & recipes (read-only, from the Recipes tab) ----------
  const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const recipesCache = () => { try { return JSON.parse(localStorage.getItem('cl.recipes')) || null; } catch (e) { return null; } };
  let recipesBusy = null;
  function loadRecipes(force) { // keeps a copy on the phone so it works with no signal
    const c = recipesCache();
    if (!force && c && Date.now() - (c.at || 0) < 10 * 60000) return Promise.resolve(c);
    if (recipesBusy) return recipesBusy;
    recipesBusy = Sync.call({ action: 'recipes' }).then(j => {
      const v = { at: Date.now(), plan: j.plan || [], recipes: j.recipes || [] };
      localStorage.setItem('cl.recipes', JSON.stringify(v)); return v;
    }).catch(e => { if (c) return c; throw e; }).finally(() => { recipesBusy = null; });
    return recipesBusy;
  }
  function mealsBar(title, extra = '') {
    return `<header class="list-bar" style="background:#7a3e1d"><button class="icon-btn" data-act="back" aria-label="Back">${I.back}</button>
      <div class="list-title">${esc(title)}</div>${extra}</header>`;
  }
  function mealsView() {
    document.body.className = 'meals';
    document.querySelector('meta[name=theme-color]').content = '#7a3e1d';
    app.innerHTML = mealsBar("This week's meals", `<button class="icon-btn" data-act="plan" aria-label="Plan the week">${I.pencil}</button><button class="icon-btn" data-act="meals-refresh" aria-label="Refresh recipes">⟳</button>`) +
      '<main class="scroller meals-body" id="meals"><div class="empty">Loading…</div></main>';
    const draw = v => {
      const el = $('#meals'); if (!el || !v) return;
      const by = {}; v.recipes.forEach(r => { by[r.key] = r; });
      const days = DAYS.map(d => ({ d, meals: v.plan.filter(p => p.day === d) })).filter(x => x.meals.length);
      el.innerHTML = days.length ? days.map(x => x.meals.map(m => `<a class="meal-row" href="#/recipe/${encodeURIComponent(m.key)}">
          <b>${esc(x.d.slice(0, 3))}</b><span>${esc(m.meal)}</span>${by[m.key] && (by[m.key].ingredients.length || by[m.key].steps.length) ? '<i>›</i>' : '<i class="soon">soon</i>'}</a>`).join('')).join('')
        : '<div class="empty">No meal plan found yet.<br><button class="btn primary" data-act="plan">Plan the week</button></div>';
      el.insertAdjacentHTML('beforeend', `<p class="muted pad">Recipes fill in by themselves within an hour of the plan changing. Updated ${new Date(v.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.</p>`);
    };
    const c = recipesCache(); if (c) draw(c);
    loadRecipes(false).then(draw).catch(e => { if (!c) $('#meals').innerHTML = `<div class="empty">Couldn't load recipes: ${esc(e.message)}</div>`; });
  }
  async function refreshRecipes(btn) {
    btn.disabled = true; btn.classList.add('spin');
    try { await Sync.call({ action: 'refreshRecipes' }); await loadRecipes(true); toast('Recipes are up to date.'); }
    catch (e) { toast('Refresh failed: ' + e.message); }
    finally { btn.disabled = false; btn.classList.remove('spin'); if (location.hash === '#/meals') mealsView(); }
  }
  function recipeView(key) {
    document.body.className = 'meals';
    const c = recipesCache(); const r = c && c.recipes.find(x => x.key === key);
    const p = c && c.plan.find(x => x.key === key);
    app.innerHTML = mealsBar(r ? r.dish : (p ? p.meal : 'Recipe')) + '<main class="scroller recipe-body" id="recipe"></main>';
    const el = $('#recipe');
    if (!r || (!r.ingredients.length && !r.steps.length)) { el.innerHTML = '<div class="empty">No recipe yet. It fills in by itself within an hour.</div>'; return; }
    const link = r.source_url && /^https:\/\//.test(r.source_url) ? ` · <a href="${esc(r.source_url)}" target="_blank" rel="noopener">full recipe</a>` : '';
    el.innerHTML = `<div class="rc-day">${esc(r.day)}</div>
      ${r.ingredients.length ? `<h3>Ingredients</h3><ul class="rc-ing">${r.ingredients.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
      <h3>${r.ingredients.length ? 'Steps' : 'Tonight'}</h3><ol class="rc-steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      <p class="muted">Source: ${esc(r.source || '—')}${link}. Edit it in the sheet's Recipes tab.</p>`;
  }

  // ---------- plan the week (writes the sheet's Week tab) ----------
  // One dinner per day, Saturday to Friday like the frame. Save replaces the whole
  // week in the sheet (no merging), then the sheet fetches recipes, rebuilds the day
  // tabs and the grocery list; the frame picks it up on its next refresh.
  // What you type is kept on the phone as a draft until it is saved.
  const PLAN_TAGS = { Tuesday: '🥘 Make-ahead night' };
  const planDraft = () => { try { return JSON.parse(localStorage.getItem('cl.planDraft')) || null; } catch (e) { return null; } };
  function planView() {
    document.body.className = 'meals';
    document.querySelector('meta[name=theme-color]').content = '#7a3e1d';
    const s = Store.settings();
    if (!s.url || !s.token) {
      app.innerHTML = mealsBar('Plan the week') + `<main class="scroller meals-body"><div class="empty">Connect the app to your Google Sheet first (Settings), so the plan can be saved there.<br><button class="btn primary" data-act="settings">Settings</button></div></main>`;
      return;
    }
    app.innerHTML = mealsBar('Plan the week') + `<main class="scroller meals-body"><form id="planform" autocomplete="off">
        ${DAYS.map(d => `<label class="plan-row"><span class="plan-day">${d}${PLAN_TAGS[d] ? `<em>${esc(PLAN_TAGS[d])}</em>` : ''}</span>
          <input name="${d}" maxlength="200" placeholder="Dinner, main dish first" enterkeyhint="next"></label>`).join('')}
        <p class="muted">Saving replaces the whole week in the sheet. Leave a day blank if nothing is planned. Recipes, the grocery list and the kitchen frame update after you save.</p>
        <div class="btn-row"><button type="button" class="btn" data-act="plan-clear">Clear all</button><button class="btn primary" id="plansave">Save week</button></div>
      </form></main>`;
    const f = $('#planform');
    const fill = vals => DAYS.forEach(d => { f.elements[d].value = vals[d] || ''; });
    const read = () => { const o = {}; DAYS.forEach(d => { o[d] = f.elements[d].value.trim(); }); return o; };
    const fromPlan = v => { const o = {}; (v && v.plan || []).forEach(p => { o[p.day] = o[p.day] ? o[p.day] + ', ' + p.meal : p.meal; }); return o; };
    const draft = planDraft();
    if (draft) fill(draft.vals);
    else {
      const c = recipesCache(); if (c) fill(fromPlan(c));
      loadRecipes(false).then(v => { if (!planDraft() && $('#planform') === f) fill(fromPlan(v)); }).catch(() => {});
    }
    f.addEventListener('input', () => localStorage.setItem('cl.planDraft', JSON.stringify({ at: Date.now(), vals: read() })));
    f.addEventListener('keydown', e => { // Enter moves to the next day instead of saving
      if (e.key !== 'Enter') return; e.preventDefault();
      const i = DAYS.indexOf(e.target.name); if (i >= 0 && i < DAYS.length - 1) f.elements[DAYS[i + 1]].focus(); else e.target.blur();
    });
    f.onsubmit = async e => {
      e.preventDefault();
      const vals = read(), plan = DAYS.map(d => ({ day: d, meal: vals[d] }));
      if (!plan.some(p => p.meal)) return toast('Type at least one dinner first.');
      if (!navigator.onLine) return toast("You're offline. Your plan is kept here; save it when you're back online.");
      if (!(await confirmBox("Replace this week's plan in the sheet?", 'Save'))) return;
      const btn = $('#plansave'); btn.disabled = true; btn.textContent = 'Saving… (finding recipes)';
      try {
        await Sync.call({ action: 'savePlan', plan }, 120000);
        localStorage.removeItem('cl.planDraft');
        await loadRecipes(true).catch(() => {});
        toast('Week saved ✓ The frame updates within 30 minutes.');
        go('#/meals');
      } catch (err) {
        btn.disabled = false; btn.textContent = 'Save week';
        toast(err.name === 'AbortError' ? 'Still working in the sheet. Check This week\'s meals in a minute.' : 'Could not save: ' + err.message);
      }
    };
  }

  // ---------- routing & events ----------
  function go(h) { if (location.hash === h) route(); else location.hash = h; }
  function route() {
    closeSheet();
    document.querySelector('meta[name=theme-color]').content = '#e8e8e8';
    const h = location.hash || '#/', s = Store.settings();
    if (!s.configured && !s.skipped && h !== '#/settings') return go('#/settings');
    if (h.startsWith('#/list/')) return listView(decodeURIComponent(h.slice(7)));
    if (h === '#/meals') return mealsView();
    if (h === '#/plan') return planView();
    if (h.startsWith('#/recipe/')) return recipeView(decodeURIComponent(h.slice(9)));
    if (h === '#/settings') return settings();
    curListId = null; home();
  }
  app.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    switch (b.dataset.act) {
      case 'sync': return onBadge();
      case 'back': return history.length > 1 ? history.back() : go('#/');
      case 'new-list': return newList();
      case 'sort': sortBy = sortBy === 'modified' ? 'title' : 'modified'; localStorage.setItem('cl.sort', sortBy); return home();
      case 'home-menu': return menu('', [{ label: 'Sync now', fn: Sync.run }, { label: 'Settings', fn: () => go('#/settings') }]);
      case 'edit-list': return editList(curListId);
      case 'list-menu': { const l = Store.list(curListId); return menu(l.name, [
        { label: 'Share list (ColorNote, text, email…)', fn: () => shareList(l.name) },
        { label: 'Clear done items', fn: () => { Store.clearDone(l.name); Sync.run(); } },
        { label: 'Sync now', fn: Sync.run },
        { label: 'Delete list', danger: true, fn: async () => { if (await confirmBox(`Delete "${l.name}" and all its items?`)) { Store.deleteList(l.id); Sync.run(); go('#/'); } } }]); }
      case 'meals-refresh': return refreshRecipes(b);
      case 'plan': return go('#/plan');
      case 'settings': return go('#/settings');
      case 'plan-clear': return confirmBox('Clear every day on this screen? (Nothing is saved until you tap Save week.)', 'Clear').then(ok => {
        if (!ok) return; document.querySelectorAll('#planform input').forEach(i => { i.value = ''; });
        localStorage.setItem('cl.planDraft', JSON.stringify({ at: Date.now(), vals: {} })); });
      case 's-test': return testSettings(false);
      case 's-save': return testSettings(true);
      case 's-skip': Store.saveSettings({ ...Store.settings(), skipped: true }); Store.seedDefaults(); return go('#/');
      case 's-wipe': return confirmBox('Erase all lists on this phone?', 'Erase').then(ok => { if (ok) { Store.wipe(); route(); } });
    }
  });
  window.addEventListener('hashchange', route);
  Store.onChange(() => { renderCards(); renderRows(); refreshBadges(); });
  Sync.onChange(refreshBadges);
  window.addEventListener('online', refreshBadges);
  window.addEventListener('offline', refreshBadges);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  route();
  Sync.start();
})();
