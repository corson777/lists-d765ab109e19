// Local storage for lists, items, the outbox (changes not yet sent) and settings.
// Everything lives only on this phone, in localStorage.
//
// Item: {id, list, text, done, created, done_at, updated, deleted}
// List: {id, name, color, created, updated, deleted}
// `updated` is new Date().toISOString() of the last change; the newest wins on sync.
(function () {
  const K = { items: 'cl.items', lists: 'cl.lists', outbox: 'cl.outbox', settings: 'cl.settings', meta: 'cl.meta' };
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  let items = load(K.items, {});      // id -> item
  let lists = load(K.lists, {});      // id -> list
  let outbox = load(K.outbox, { items: {}, lists: {} }); // id -> record waiting to be sent
  const listeners = [];

  const now = () => new Date().toISOString();
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const slug = name => 'list-' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

  function persist() { save(K.items, items); save(K.lists, lists); save(K.outbox, outbox); listeners.forEach(f => f()); }
  function queueItem(it) { items[it.id] = it; outbox.items[it.id] = it; }
  function queueList(l) { lists[l.id] = l; outbox.lists[l.id] = l; }

  const Store = {
    uuid, now, slug,
    onChange(f) { listeners.push(f); },
    settings: () => load(K.settings, {}),
    saveSettings: s => save(K.settings, s),
    meta: () => load(K.meta, {}),
    saveMeta: m => save(K.meta, m),

    lists() { return Object.values(lists).filter(l => !l.deleted); },
    list(id) { return lists[id]; },
    listByName(name) { return Object.values(lists).find(l => l.name === name && !l.deleted); },
    items(listName) {
      return Object.values(items).filter(i => !i.deleted && i.list === listName)
        .sort((a, b) => (a.created || '').localeCompare(b.created || '') || a.id.localeCompare(b.id));
    },
    item(id) { return items[id]; },
    // Last time anything in this list changed (for the home screen sort and date)
    modified(l) {
      let m = l.updated && l.updated > '1971' ? l.updated : (l.created || '');
      for (const i of Object.values(items)) if (i.list === l.name) { const t = i.updated || i.created || ''; if (t > m) m = t; }
      return m;
    },
    pendingCount() { return Object.keys(outbox.items).length + Object.keys(outbox.lists).length; },

    // ----- edits (all save locally at once and go into the outbox) -----
    addList(name, color) {
      const t = now();
      const existing = Object.values(lists).find(l => l.name === name);
      if (existing && !existing.deleted) return existing;
      const l = { id: existing ? existing.id : uuid(), name, color: color || 'yellow', created: t, updated: t, deleted: false };
      queueList(l); persist(); return l;
    },
    updateList(id, changes) {
      const l = lists[id]; if (!l) return;
      const t = now();
      if (changes.name && changes.name !== l.name) {
        for (const i of Object.values(items)) if (i.list === l.name && !i.deleted) queueItem({ ...i, list: changes.name, updated: t });
      }
      queueList({ ...l, ...changes, updated: t }); persist();
    },
    deleteList(id) {
      const l = lists[id]; if (!l) return; const t = now();
      for (const i of Object.values(items)) if (i.list === l.name && !i.deleted) queueItem({ ...i, deleted: true, updated: t });
      queueList({ ...l, deleted: true, updated: t }); persist();
    },
    addItem(listName, text) {
      const t = now();
      const it = { id: uuid(), list: listName, text, done: false, created: t, done_at: '', updated: t, deleted: false };
      queueItem(it); persist(); return it;
    },
    toggleItem(id) {
      const i = items[id]; if (!i) return; const t = now();
      queueItem({ ...i, done: !i.done, done_at: i.done ? '' : t, updated: t }); persist();
    },
    editItem(id, text) { const i = items[id]; if (!i) return; queueItem({ ...i, text, updated: now() }); persist(); },
    deleteItem(id) { const i = items[id]; if (!i) return; queueItem({ ...i, deleted: true, updated: now() }); persist(); },
    clearDone(listName) {
      const t = now();
      for (const i of Object.values(items)) if (i.list === listName && i.done && !i.deleted) queueItem({ ...i, deleted: true, updated: t });
      persist();
    },
    // Starter lists on a brand-new install. Fixed ids so two phones don't create duplicates.
    seedDefaults() {
      const m = Store.meta(); if (m.seeded) return;
      ['To Do', 'Groceries', 'Meals'].forEach(n => {
        if (Object.values(lists).some(l => l.name === n)) return;
        queueList({ id: slug(n), name: n, color: 'yellow', created: '1970-01-01T00:00:00.000Z', updated: '1970-01-01T00:00:00.000Z', deleted: false });
      });
      Store.saveMeta({ ...m, seeded: true }); persist();
    },

    // ----- sync helpers -----
    outboxSnapshot() { return { items: Object.values(outbox.items), lists: Object.values(outbox.lists) }; },
    // Remove only what was sent; a newer edit made during the sync stays queued.
    markSent(snap) {
      for (const i of snap.items) if (outbox.items[i.id] && outbox.items[i.id].updated === i.updated) delete outbox.items[i.id];
      for (const l of snap.lists) if (outbox.lists[l.id] && outbox.lists[l.id].updated === l.updated) delete outbox.lists[l.id];
      persist();
    },
    // Merge rows pulled from the sheet: last-write-wins by `updated`.
    mergeServer(srvItems, srvLists) {
      const take = (local, srv, pending) => !local || (!pending && (srv.updated || '') >= (local.updated || ''));
      for (const s of srvLists || []) if (take(lists[s.id], s, outbox.lists[s.id])) lists[s.id] = s;
      for (const s of srvItems || []) if (take(items[s.id], s, outbox.items[s.id])) items[s.id] = s;
      // Items whose list has no List row (e.g. rows typed straight into the sheet):
      // give them one, with a fixed id and an old timestamp so any real edit wins.
      for (const i of Object.values(items)) {
        if (i.deleted || !i.list || Store.listByName(i.list)) continue;
        const id = slug(i.list), old = lists[id];
        queueList(old ? { ...old, name: i.list, deleted: false, updated: now() }
          : { id, name: i.list, color: 'yellow', created: i.created || now(), updated: '1970-01-01T00:00:00.000Z', deleted: false });
      }
      persist();
    },
    // Settings > "Erase data on this phone"
    wipe() { items = {}; lists = {}; outbox = { items: {}, lists: {} }; localStorage.removeItem(K.meta); persist(); },
  };
  window.Store = Store;
})();
