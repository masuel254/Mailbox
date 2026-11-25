'use strict';
/* ---------- Démarrage ---------- */
applySettings();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applySettings);
route();
if (auth.token() || relayGmailOn()) {
  api('profile').then(p => { if (p && p.emailAddress && p.emailAddress !== settings.email) { settings.email = p.emailAddress; saveSettings(); } }).catch(() => {});
  updateBadge();
}
/* Retour dans l'appli après l'avoir quittée : on repart de la réception (sauf mail en cours d'écriture, sauf retour éclair) */
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') hiddenAt = Date.now(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const away = hiddenAt && Date.now() - hiddenAt > 20000; hiddenAt = 0;
  if (away && !/^#\/(compose|reply|fwd|list\/INBOX$)/.test(location.hash || '') && !document.querySelector('#sheet.open')) {
    const home = (settings.home === 'today' ? '#/today' : '#/list/INBOX');
    if (location.hash !== home) { history.replaceState(null, '', home); window.dispatchEvent(new HashChangeEvent('hashchange')); }
    window.scrollTo(0, 0);
  }
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
onNetChange();
// Bouton « Plus » d'un mail : déplie les autres actions sur place, sans nouvelle fenêtre
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#t-more'); if (!b) return; const m = $('#tb-more'); if (!m) return; m.hidden = !m.hidden; b.setAttribute('aria-expanded', String(!m.hidden)); b.lastChild.textContent = m.hidden ? 'Plus' : 'Moins'; });
// Relais pas à jour : bandeau avec la commande à copier (sinon certaines fonctions échouent sans explication)
async function checkRelayVersion() {
  if (!relayOn() || !navigator.onLine) return;
  let r; try { r = await rapi('/status'); } catch (e) { return; }
  const old = document.getElementById('relay-old'); if (old) old.remove();
  if (r && r.relayVersion && !verLt(r.relayVersion, MIN_RELAY)) return;
  const cmd = 'curl -fsSL https://raw.githubusercontent.com/masuel254/Mailbox/main/relay/install.sh | sudo bash';
  const b = document.createElement('div'); b.id = 'relay-old';
  b.innerHTML = `<b>Ton relais n’est pas à jour</b> (${esc((r && r.relayVersion) || 'ancienne version')}). Lance la commande dans Termius.<div><button type="button" id="ro-copy">Copier la commande</button><button type="button" id="ro-x" aria-label="Fermer">✕</button></div>`;
  document.body.appendChild(b);
  $('#ro-copy').onclick = () => { navigator.clipboard.writeText(cmd).then(() => toast('Commande copiée : colle-la dans Termius')).catch(() => toast(cmd)); };
  $('#ro-x').onclick = () => b.remove();
}
setTimeout(checkRelayVersion, 4000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(checkRelayVersion, 3000); });

/* Zoom avec deux doigts : sur iPhone, les barres fixes (bas d'écran) restent accrochées à la page non zoomée et
   finissent au milieu de l'écran. On les masque tant que la page est zoomée, elles reviennent au dézoom. */
if (window.visualViewport) {
  const vvFix = () => document.body.classList.toggle('zoomed', window.visualViewport.scale > 1.02);
  window.visualViewport.addEventListener('resize', vvFix); window.visualViewport.addEventListener('scroll', vvFix);
}
/* iPhone : barres fixes du bas (Répondre, onglets, sélection) qui « remontent » au milieu de l'écran.
   Cause : après un clavier, un retour d'arrière-plan ou un défilement à inertie, iOS garde parfois une ancienne
   hauteur d'écran pour les éléments fixés en bas. On mesure où la barre est vraiment et on la recolle au bas
   de l'écran visible ; on force aussi iOS à la redessiner quand le défilement s'arrête. */
(() => {
  const vv = window.visualViewport;
  const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); };
  const bars = () => ['.reply-bar', '#tabbar', '#selbar'].map(s => document.querySelector(s)).filter(el => el && el.getClientRects().length && getComputedStyle(el).position === 'fixed');
  const pin = () => {
    if (!vv || vv.scale > 1.02 || typing()) return;
    const bottom = vv.offsetTop + vv.height;
    bars().forEach(el => {
      el.style.transform = '';
      const d = Math.round(bottom - el.getBoundingClientRect().bottom);
      if (d > 2 && d < 800) { el.style.transform = `translateY(${d}px)`; try { LS.set('pinDbg', { at: Date.now(), d, ih: innerHeight, vh: Math.round(vv.height), ot: Math.round(vv.offsetTop), el: el.id || el.className }); } catch (e) {} }
    });
  };
  const repaint = () => { bars().forEach(el => { el.style.willChange = 'transform'; void el.offsetHeight; requestAnimationFrame(() => { el.style.willChange = ''; }); }); pin(); };
  let t = 0; const soon = (ms) => { clearTimeout(t); t = setTimeout(repaint, ms); };
  window.addEventListener('scroll', () => soon(120), { passive: true });
  window.addEventListener('resize', () => soon(60));
  if (vv) { vv.addEventListener('resize', () => soon(60)); vv.addEventListener('scroll', () => soon(120)); }
  document.addEventListener('focusout', () => { setTimeout(() => { window.scrollTo(window.scrollX, window.scrollY); repaint(); }, 250); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(repaint, 300); });
  window.addEventListener('pageshow', () => setTimeout(repaint, 300));
  window.addEventListener('hashchange', () => setTimeout(repaint, 350));
  // filet de sécurité : vérification légère toutes les 1,5 s quand l'appli est affichée
  setInterval(() => { if (document.visibilityState === 'visible') pin(); }, 1500);
})();
// Ligne du haut d'un mail figée : un trait apparaît sous elle quand on a défilé
window.addEventListener('scroll', () => { const t = document.querySelector('.th-top'); if (t) t.classList.toggle('stuck', window.scrollY > 8); }, { passive: true });
