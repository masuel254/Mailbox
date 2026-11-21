'use strict';
/* ---------- Hors connexion (avion, métro) ----------
   1. Préchargement : en ligne, les 50 derniers mails de la réception (et leurs pièces jointes légères) sont gardés sur l'iPhone.
   2. Boîte d'envoi : un message envoyé sans réseau attend dans « À envoyer » et part tout seul au retour du réseau.
   3. Actions en attente : supprimer, archiver, lu/non lu faits hors connexion sont rejoués au retour du réseau. */
const isNetErr = e => !navigator.onLine || /failed to fetch|load failed|network|injoignable|internet|hors connexion/i.test(String((e && e.message) || e));

/* --- Boîte d'envoi --- */
async function outbox() { return (await IDB.get('outbox')) || []; }
async function outboxSave(list) { await IDB.set('outbox', list); LS.set('outboxN', list.length); paintOutbox(); }
async function outboxAdd(job) {
  const list = await outbox();
  list.push(Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now() }, job));
  await outboxSave(list);
}
function paintOutbox() {
  const n = LS.get('outboxN', 0);
  let b = document.getElementById('outbox-bar');
  if (!n) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('a'); b.id = 'outbox-bar'; b.href = '#/outbox'; document.body.appendChild(b); }
  b.textContent = '📤 ' + n + ' message' + (n > 1 ? 's' : '') + ' à envoyer' + (navigator.onLine ? ' · envoi…' : ' · au retour du réseau');
}
let flushing = false;
async function flushOutbox() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    let list = await outbox();
    for (const job of list.slice()) {
      try {
        let sent = null;
        if (job.acc === 'free') sent = await rapi('/free/send', { method: 'POST', body: job.body });
        else sent = await gmailSend(job.o, job.threadId);
        if (job.follow) rapi('/follow', { method: 'POST', body: Object.assign({}, job.follow, { sentAt: Date.now(), threadId: sent && sent.threadId, messageId: sent && sent.id && job.acc === 'free' ? sent.id : null }) }).catch(() => {});
        list = (await outbox()).filter(x => x.id !== job.id); await outboxSave(list);
        toast('Envoyé : ' + (job.subject || 'ton message'));
        notifyLocal('Message envoyé', job.subject || '');
      } catch (e) { if (isNetErr(e) || e.message === 'auth') break; job.error = e.message; await outboxSave(list); }
    }
  } finally { flushing = false; paintOutbox(); }
}
async function notifyLocal(title, body) {
  try { if (window.Notification && Notification.permission === 'granted' && navigator.serviceWorker) { const r = await navigator.serviceWorker.ready; r.showNotification(title, { body, icon: 'icon-192.png', tag: 'mb-local-' + Date.now() }); } } catch (e) {}
}
async function renderOutbox() {
  const v = $('#view');
  const list = await outbox();
  v.innerHTML = `<div class="top"><a class="back" href="#/labels">${ICON.back}Dossiers</a></div><h1 class="thread-title">À envoyer</h1>
    <p class="fhint">Messages écrits sans réseau. Ils partent tout seuls dès que l’iPhone retrouve une connexion, app ouverte.</p>
    ${list.length ? `<div class="card">${list.map(j => `<div class="sch-row"><span class="sch-b"><b>${esc(j.subject || '(sans objet)')}</b><small>À ${esc(j.to || '')} · écrit le ${esc(new Date(j.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}${j.error ? ' · ⚠️ ' + esc(j.error) : ''}</small></span><button class="btn danger" data-ox="${esc(j.id)}">Supprimer</button></div>`).join('')}</div>
    <button class="btn primary" id="ox-go" style="margin-top:12px;width:100%">Envoyer maintenant</button>` : '<div class="empty">Rien en attente.</div>'}`;
  $$('[data-ox]').forEach(b => b.onclick = async () => { await outboxSave((await outbox()).filter(x => x.id !== b.dataset.ox)); toast('Message retiré'); renderOutbox(); });
  const g = $('#ox-go'); if (g) g.onclick = async () => { if (!navigator.onLine) { toast('Toujours pas de réseau'); return; } g.disabled = true; await flushOutbox(); renderOutbox(); };
}

/* --- Actions faites hors connexion --- */
function queueAction(a) { const q = LS.get('pendingActs', []); q.push(Object.assign({ at: Date.now() }, a)); LS.set('pendingActs', q.slice(-300)); }
let replaying = false;
async function flushActions() {
  if (replaying || !navigator.onLine) return;
  let q = LS.get('pendingActs', []); if (!q.length) return;
  replaying = true; let done = 0;
  try {
    while (q.length) {
      const a = q[0];
      try {
        if (a.t === 'act') { await act(a.ids, a.kind); }
        else if (a.t === 'gmodify') await api('threads/' + a.id + '/modify', { method: 'POST', body: a.body });
        else if (a.t === 'fflags') await rapi('/free/flags', { method: 'POST', body: a.body });
        done++;
      } catch (e) { if (isNetErr(e) || e.message === 'auth') break; }
      q.shift(); LS.set('pendingActs', q);
    }
  } finally { replaying = false; }
  if (done) { toast(done + ' action' + (done > 1 ? 's' : '') + ' faite' + (done > 1 ? 's' : '') + ' hors connexion appliquée' + (done > 1 ? 's' : '')); badgeNow(0); }
}

/* --- Préchargement des mails récents --- */
let prefAt = 0, prefRunning = false;
async function prefetchInbox() {
  if (prefRunning || !navigator.onLine || document.visibilityState !== 'visible' || Date.now() - prefAt < 20 * 60000) return;
  const d = Object.entries(state.lists).filter(([k]) => /(^|\|)INBOX$/.test(k)).map(([, v]) => v).sort((a, b) => b.items.length - a.items.length)[0];
  if (!d || !d.items.length) return;
  prefRunning = true; prefAt = Date.now();
  const have = new Set(LS.get('idbKeys', []));
  const todo = d.items.slice().sort((a, b) => (b.unread - a.unread) || (b.date - a.date)).slice(0, 50).filter(i => !have.has(i.acc === 'free' ? 'fm:' + i.folder + ':' + i.uid : 'th:' + i.id));
  let n = 0;
  try {
    for (const it of todo) {
      if (!navigator.onLine || document.visibilityState !== 'visible') break;
      try {
        if (it.acc === 'free') {
          const m = await rapi('/free/message?' + new URLSearchParams({ folder: it.folder, uid: it.uid, peek: '1' }));
          if (m) idbKeep('fm:' + it.folder + ':' + it.uid, m);
        } else {
          const t = await api('threads/' + encodeURIComponent(it.id) + '?format=full');
          if (!t) continue;
          idbKeep('th:' + it.id, t);
          for (const m of (t.messages || []).slice(-2)) {
            const acc = { html: null, text: null, att: [] }; walkParts(m.payload, acc);
            for (const a of acc.att.filter(x => x.id && x.size && x.size < 2 * 1048576).slice(0, 3)) {
              const k = 'att:' + m.id + ':' + a.id;
              if (!have.has(k)) { const r = await api('messages/' + m.id + '/attachments/' + a.id); if (r && r.data) idbKeep(k, r.data.replace(/-/g, '+').replace(/_/g, '/'), 'att'); }
            }
          }
        }
        n++;
      } catch (e) { if (/ralentir|quota|rate/i.test(e.message) || isNetErr(e) || e.message === 'auth') break; }
      await sleep(1200);
    }
  } finally { prefRunning = false; }
  if (n) LS.set('prefetchAt', Date.now());
}

/* --- Bandeau hors connexion et reprise --- */
function onNetChange() {
  document.body.classList.toggle('offline', !navigator.onLine);
  let b = document.getElementById('offline-bar');
  if (!navigator.onLine) { if (!b) { b = document.createElement('div'); b.id = 'offline-bar'; b.textContent = '✈︎ Hors connexion · mails enregistrés sur l’iPhone'; document.body.appendChild(b); } }
  else { if (b) b.remove(); flushActions().then(flushOutbox); setTimeout(prefetchInbox, 8000); }
  paintOutbox();
}
window.addEventListener('online', onNetChange);
window.addEventListener('offline', onNetChange);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && navigator.onLine) { flushActions().then(flushOutbox); setTimeout(prefetchInbox, 8000); } });
setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') { flushActions().then(flushOutbox); prefetchInbox(); } }, 60000);
