// Sync with the Google Apps Script web app.
//  1. send the outbox (action "upsert")
//  2. pull every row (action "list") and merge, newest `updated` wins
// Runs on open, when the phone comes back online, every 60 s while open,
// on pull-to-refresh, and from the sync button.
(function () {
  let busy = false, again = false, lastError = '', state = 'idle';
  const listeners = [];
  const set = s => { state = s; listeners.forEach(f => f()); };

  // Apps Script needs Content-Type text/plain (no CORS preflight). Google replies
  // with a 302 to script.googleusercontent.com, which fetch follows automatically.
  async function call(body, ms = 25000) { // ms: give up after this long (saving a plan also fetches recipes)
    const s = Store.settings();
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(s.url, { method: 'POST', redirect: 'follow', signal: ctrl.signal,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, token: s.token }) });
      const txt = await res.text();
      let j; try { j = JSON.parse(txt); } catch (e) { throw new Error('Not a sync URL (got a web page). Check the Apps Script URL ends in /exec.'); }
      if (!j.ok) throw new Error(j.error === 'unauthorized' ? 'Wrong token' : j.error || 'Server error');
      return j;
    } finally { clearTimeout(timer); }
  }

  async function run() {
    const s = Store.settings();
    if (!s.url || !s.token) return set('setup');
    if (!navigator.onLine) return set('offline');
    if (busy) { again = true; return; } // a change came in mid-sync: run once more after
    busy = true; set('syncing');
    try {
      const snap = Store.outboxSnapshot();
      if (snap.items.length || snap.lists.length) { await call({ action: 'upsert', items: snap.items, lists: snap.lists }); Store.markSent(snap); }
      const data = await call({ action: 'list' });
      Store.mergeServer(data.items, data.lists);
      // The merge may have queued List rows for loose items, or you edited
      // something while we were syncing: send those right away too.
      const extra = Store.outboxSnapshot();
      if (extra.items.length || extra.lists.length) {
        await call({ action: 'upsert', items: extra.items, lists: extra.lists }); Store.markSent(extra);
      }
      Store.saveMeta({ ...Store.meta(), lastSync: new Date().toISOString() });
      lastError = ''; busy = false; set(Store.pendingCount() ? 'pending' : 'synced');
      if (again) { again = false; return run(); }
    } catch (e) {
      busy = false; again = false;
      lastError = e.name === 'AbortError' ? 'Timed out' : (e.message || String(e));
      set(navigator.onLine ? 'error' : 'offline');
    }
  }

  window.Sync = {
    run, call,
    state: () => state, error: () => lastError,
    onChange: f => listeners.push(f),
    // short text for the badge
    label() {
      const n = Store.pendingCount();
      if (state === 'setup') return n ? `Not set up · ${n} saved` : 'Not set up';
      if (state === 'syncing') return 'Syncing…';
      if (state === 'offline' || !navigator.onLine) return n ? `Offline · ${n} pending` : 'Offline';
      if (state === 'error') return n ? `Sync error · ${n} pending` : 'Sync error';
      if (n) return `Pending ${n}`;
      return state === 'synced' ? 'Synced' : '…';
    },
    start() {
      run();
      window.addEventListener('online', () => run());
      window.addEventListener('offline', () => set('offline'));
      document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
      setInterval(() => { if (!document.hidden) run(); }, 60000);
    },
  };
})();
