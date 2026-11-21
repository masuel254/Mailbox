'use strict';
/* ---------- Démarrage ---------- */
applySettings();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applySettings);
route();
if (auth.token() || relayGmailOn()) {
  api('profile').then(p => { if (p && p.emailAddress && p.emailAddress !== settings.email) { settings.email = p.emailAddress; saveSettings(); } }).catch(() => {});
  updateBadge();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const h = location.hash || '#/list/INBOX';
  if (h.startsWith('#/list/') && state.listCtx) { const c = state.listCtx; const d = state.lists[c.cacheKey]; if (d && Date.now() - d.at > 60000) loadList(c.key, c.q, c.cacheKey, c.plain, true); }
  updateBadge();
});
setInterval(() => { if (document.visibilityState === 'visible' && (auth.token() || relayOn())) updateBadge(); }, 120000);
document.addEventListener('visibilitychange', () => { if (auth.token() || relayOn()) updateBadge(document.visibilityState === 'hidden' ? true : false); });
checkUpdate();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // Le relais a signalé un nouveau mail ou un changement de non lus pendant que l'app est ouverte
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'mail') { refreshVisibleList(); setTimeout(() => updateBadge(true), 1500); } });
}
// Filet de sécurité : vérification chaque minute quand l'app est au premier plan
setInterval(() => { if (document.visibilityState === 'visible' && relayOn() && (relayGmailOn() || freeOn())) updateBadge(); }, 60000);
// Réception en direct : l'appli attend les changements signalés par le relais (nouveau mail, lu, supprimé…)
watchInbox();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') watchInbox(); });

/* ---------- Tirer pour rafraîchir (toutes les listes) ---------- */
async function pullRefresh() {
  const view = (location.hash || '#/list/INBOX').slice(2).split('?')[0].split('/')[0];
  if (view === 'list' || view === 'search') { const c = state.listCtx; if (c) return loadList(c.key, c.q, c.cacheKey, c.plain, 'fresh'); }
  if (view === 'today') return renderToday(true);
  if (view === 'agenda') { state.agCache = null; return renderAgenda(); }
  if (view === 'contacts') return loadContacts(true).then(() => renderContacts());
  if (view === 'labels') { state.folders = null; LS.del('foldersCache'); return renderLabels(); }
  return route();
}
(() => {
  const ind = document.createElement('div'); ind.id = 'ptr'; ind.setAttribute('aria-hidden', 'true'); ind.innerHTML = '<span class="ptr-i">↓</span><span class="ptr-t">Tirer pour actualiser</span>';
  document.body.appendChild(ind);
  let y0 = null, x0 = 0, dy = 0, busy = false, on = false;
  const NO = ['compose', 'thread', 'free'];
  const set = (h, t, arm) => { ind.style.transform = `translateY(${Math.min(h, 90) - 60}px)`; ind.style.opacity = Math.min(1, h / 50); ind.querySelector('.ptr-t').textContent = t; ind.classList.toggle('arm', !!arm); };
  document.addEventListener('touchstart', e => {
    const view = (location.hash || '#/list/INBOX').slice(2).split('/')[0];
    if (busy || scrollY > 0 || NO.includes(view) || !$('#sheet').hidden || e.touches.length !== 1) { y0 = null; return; }
    if (e.target.closest('input,textarea,select,.sheet')) { y0 = null; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; on = false;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (y0 === null) return;
    const t = e.touches[0]; dy = t.clientY - y0;
    if (!on) { if (Math.abs(t.clientX - x0) > Math.abs(dy) || dy < 8 || scrollY > 0) { if (Math.abs(t.clientX - x0) > 12 || dy < -4) y0 = null; return; } on = true; }
    const h = dy * 0.55;
    set(h, h > 70 ? 'Relâcher pour actualiser' : 'Tirer pour actualiser', h > 70);
  }, { passive: true });
  document.addEventListener('touchend', async () => {
    if (y0 === null || !on) { y0 = null; return; }
    y0 = null;
    if (dy * 0.55 <= 70) { set(0, '', false); return; }
    busy = true; ind.classList.add('busy'); set(80, 'Actualisation…', false);
    try { await Promise.race([pullRefresh(), sleep(12000)]); } catch (e) {}
    busy = false; ind.classList.remove('busy'); set(0, '', false);
  });
})();
// A− / A+ dans un mail : taille du texte réglée d'un geste (gardée pour la suite)
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-fs]'); if (!b) return; settings.fontSize = Math.max(14, Math.min(28, settings.fontSize + +b.dataset.fs)); saveSettings(); toast('Taille du texte : ' + settings.fontSize + ' px'); });
// Astuce affichée une seule fois : les gestes ne se devinent pas
setTimeout(() => { if (!LS.get('tipGestures', false) && (location.hash || '').match(/#\/(list|today)/)) { LS.set('tipGestures', true); toast('Astuce : appui long sur un mail ou un dossier pour voir toutes ses actions', { label: 'OK', run: () => {} }); } }, 2500);
