'use strict';
/* ---------- Réglages ---------- */
// Nombre de mails de chaque boîte (pour info), en haut des Réglages
async function mailboxStats() {
  const fmt = n => Number(n || 0).toLocaleString('fr-FR');
  const g = $('#mbs-g'), f = $('#mbs-f'), sum = [];
  const block = (dot, name, total, rows) => `<div class="mbs-h"><span class="dot" style="background:var(--${dot === 'g' ? 'gmail' : 'free'})"></span><b>${name}</b><span>${fmt(total)} mails</span></div>` + rows.map(([n, v]) => `<div class="mbs-r"><span>${esc(n)}</span><span>${fmt(v)}</span></div>`).join('');
  const jobs = [(async () => {
    try {
      const [p, ...ls] = await Promise.all([api('profile'), ...['INBOX', 'SENT', 'DRAFT', 'SPAM', 'TRASH'].map(id => api('labels/' + id).catch(() => null))]);
      const nm = { INBOX: 'Réception', SENT: 'Envoyés', DRAFT: 'Brouillons', SPAM: 'Spam', TRASH: 'Corbeille' };
      if (g) g.innerHTML = block('g', 'Gmail', p.messagesTotal, ls.filter(Boolean).map(l => [nm[l.id] || l.name, l.messagesTotal || 0]));
      sum[0] = 'Gmail ' + fmt(p.messagesTotal);
    } catch (e) { if (g) g.innerHTML = '<p>Gmail indisponible</p>'; }
  })()];
  if (f) jobs.push((async () => {
    try {
      const r = await rapi('/free/stats');
      f.innerHTML = block('f', 'Free', r.total, (r.folders || []).filter(x => x.messages).sort((a, b) => b.messages - a.messages).map(x => [fixMojibake(x.name), x.messages]));
      sum[1] = 'Free ' + fmt(r.total);
    } catch (e) { f.innerHTML = '<p>Free indisponible (relais à mettre à jour ?)</p>'; }
  })());
  await Promise.all(jobs);
  const s = $('#mbs-sum'); if (s) s.textContent = sum.filter(Boolean).join(' · ') || '—';
}
function renderSettings() {
  const hq = new URLSearchParams((location.hash.split('?')[1]) || '');
  if (hq.get('relay')) {
    const r = hq.get('relay');
    if (r === 'gmail-ok') { settings.relayGmail = true; LS.del('rtoken'); saveSettings(); state.lists = {}; toast('Gmail relié au relais : plus de reconnexion toutes les heures'); }
    else toast(r === 'refus' ? 'Autorisation Google refusée' : 'Liaison Gmail échouée (' + r + ')');
    history.replaceState(null, '', location.pathname + '#/settings');
  }
  const connected = !!LS.get('token', null) || relayGmailOn();
  $('#view').innerHTML = `
    <a class="back back-sm" href="#/list/INBOX">${ICON.back}Reçus</a><div class="top"><h1>Réglages</h1></div>
    <details class="set" data-set="mbstats"><summary><span class="set-t">Boîtes mail</span><span class="set-s" id="mbs-sum">…</span><span class="chev" aria-hidden="true"></span></summary>
    <section class="card mbs-card"><div id="mbs-g"><p>Chargement…</p></div>${freeOn() ? '<div id="mbs-f"><p>Chargement…</p></div>' : ''}</section></details>
    <a class="set-link" href="#/guide"><span class="set-t">📖 Guide d'utilisation</span><span class="set-s">Gestes, dossiers, IA…</span><span class="chev-r" aria-hidden="true"></span></a>
    <a class="set-link" id="s-junk" href="#/labels"><span class="set-t">Voir les mails indésirables</span><span class="set-s">${freeOn() ? 'Gmail + Free' : 'Gmail'}</span><span class="chev-r" aria-hidden="true"></span></a>
    <details class="set" data-set="blocked"><summary><span class="set-t">Voir les expéditeurs bloqués</span><span class="set-s" id="s-blk-n"></span><span class="chev" aria-hidden="true"></span></summary>
    <section class="card" id="s-blocked"><p>Chargement…</p></section></details>
    <details class="set" data-set="accounts"><summary><span class="set-t">Comptes</span><span class="set-s">${connected ? '<i style="background:var(--gmail)"></i>Gmail' : 'Gmail non connecté'}${freeOn() ? ' <i style="background:var(--free)"></i>Free' : ''}</span><span class="chev" aria-hidden="true"></span></summary>
    <section class="card">
      <h3><span class="dot" style="background:var(--gmail)"></span>Gmail<span class="st" style="color:${connected ? 'var(--ok)' : 'var(--muted)'}">${connected ? 'Connecté' : 'Non connecté'}</span></h3>
      ${settings.email ? `<p>${esc(settings.email)}</p>` : ''}
      <p>Connexion sécurisée par Google : ton mot de passe n'est jamais saisi ni stocké dans l'appli.</p>
      <label class="f">Identifiant Google (Client ID)<input id="s-cid" value="${esc(settings.clientId)}" placeholder="xxxx.apps.googleusercontent.com" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      ${connected ? '<button class="btn" id="s-logout">Se déconnecter</button>' : '<button class="btn primary" id="s-login">Se connecter avec Google</button>'}
    </section>
    <section class="card" id="s-free"></section>
    <section class="card" id="s-tt"></section></details>
    <details class="set" data-set="relay"><summary><span class="set-t">Relais et notifications</span><span class="set-s">${relayOn() ? 'Connecté' : 'Non connecté'}</span><span class="chev" aria-hidden="true"></span></summary>
    <section class="card" id="s-relay">
      <p>Ton serveur personnel : Gmail connecté en permanence, notifications et pastille en temps réel, boîte Free.</p>
      <label class="f">Adresse du relais<input id="s-rurl" value="${esc(settings.relayUrl)}" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="url"></label>
      <label class="f">Code d'accès<input id="s-rtok" type="password" value="${esc(settings.relayToken)}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="affiché à la fin de l'installation"></label>
      <button class="btn ${relayOn() ? '' : 'primary'}" id="s-rconn">${relayOn() ? 'Vérifier la connexion' : 'Connecter le relais'}</button>
      <div id="s-rstate" style="display:flex;flex-direction:column;gap:10px"></div>
    </section></details>
    <details class="set" data-set="badge" ${relayOn() ? 'hidden' : ''}><summary><span class="set-t">Pastille sur l'icône</span><span class="chev" aria-hidden="true"></span></summary>
    <section class="card" ${relayOn() ? 'hidden' : ''}>
      <p>Affiche le nombre de mails non lus sur l'icône de l'appli. iOS exige pour cela l'autorisation des notifications, et l'appli doit être installée sur l'écran d'accueil.</p>
      <p id="s-badge-state" style="font-weight:650;color:var(--text)"></p>
      <button class="btn primary" id="s-badge">Activer la pastille</button>
    </section></details>
    <details class="set" data-set="display"><summary><span class="set-t">Affichage</span><span class="set-s">${settings.fontSize} px · ${({ light: 'Clair', dark: 'Sombre', auto: 'Auto' })[settings.theme] || ''}</span><span class="chev" aria-hidden="true"></span></summary>
    <section class="card">
      <label class="f"><span>Taille du texte : <b id="s-fs-v">${settings.fontSize}</b> px</span><input type="range" id="s-fs" min="15" max="26" step="1" value="${settings.fontSize}"></label>
      <label class="f">Ton prénom (accueil)<input id="s-name" autocomplete="given-name" value="${esc(settings.myName || '')}" placeholder="Samuel"></label>
      <label class="switch">Ouvrir sur « Aujourd’hui »<input type="checkbox" id="s-home" ${settings.home === 'today' ? 'checked' : ''}></label>
      <label class="f">Signature Gmail<textarea id="s-sig-g" rows="3" placeholder="Samuel">${esc(settings.sigGmail || '')}</textarea></label>
      <label class="f">Signature Free<textarea id="s-sig-f" rows="3" placeholder="Samuel">${esc(settings.sigFree || '')}</textarea></label>
      <p class="sample">Aperçu : Point MRP V3 jeudi 10h</p>
      <div class="seg" role="radiogroup" aria-label="Thème">
        ${[['light', 'Clair'], ['dark', 'Sombre'], ['auto', 'Auto']].map(([k, n]) => `<button role="radio" aria-checked="${settings.theme === k}" class="${settings.theme === k ? 'on' : ''}" data-th="${k}">${n}</button>`).join('')}
      </div>
      <label class="switch">Mode lisible par défaut<input type="checkbox" id="s-read" ${settings.readable ? 'checked' : ''}></label>
      <label class="switch">Afficher les images des mails<input type="checkbox" id="s-img" ${settings.images ? 'checked' : ''}></label>
      <label class="switch">Gmail : onglet Principal seulement<input type="checkbox" id="s-prim" ${settings.primaryOnly ? 'checked' : ''}></label>
      <p style="margin:-4px 0 0;font-size:.78rem">Masque Promotions, Réseaux sociaux, Notifications et Forums de la réception et du compteur. Ils restent dans Gmail.</p>
    </section></details>
    <details class="set" data-set="app"><summary><span class="set-t">Application</span><span class="set-s">v${esc(APP_VERSION)}</span><span class="chev" aria-hidden="true"></span></summary>
    <section class="card">
      <h3>Version ${esc(APP_VERSION)}<span class="st" style="color:var(--muted)">${esc(APP_DATE)}</span></h3>
      <p id="s-upd-state">Les mises à jour sont vérifiées à chaque ouverture.</p>
      <button class="btn primary" id="s-upd">Rechercher une mise à jour</button>
      <button class="btn" id="s-force">Forcer l'actualisation</button>
    </section></details>`;
  // mémorise les sections ouvertes
  let openSets = null; try { openSets = JSON.parse(localStorage.getItem('ml-sets') || 'null'); } catch (e) {}
  if (hq.get('relay')) openSets = Object.assign({}, openSets || {}, { relay: true });
  $$('details.set').forEach(d => {
    const k = d.dataset.set;
    if (openSets && k in openSets) d.open = !!openSets[k];
    d.addEventListener('toggle', () => { let o = {}; try { o = JSON.parse(localStorage.getItem('ml-sets') || '{}'); } catch (e) {} o[k] = d.open; try { localStorage.setItem('ml-sets', JSON.stringify(o)); } catch (e) {} });
  });
  $('#s-cid').onchange = e => { settings.clientId = e.target.value.trim(); saveSettings(); toast('Identifiant enregistré'); };
  const li = $('#s-login'); if (li) li.onclick = () => { settings.clientId = $('#s-cid').value.trim(); saveSettings(); LS.set('returnTo', '#/list/INBOX'); location.hash = '#/list/INBOX'; };
  const lo = $('#s-logout'); if (lo) lo.onclick = () => { auth.logout(); settings.email = ''; saveSettings(); state.lists = {}; renderSettings(); toast('Déconnecté'); };
  const bs = $('#s-badge-state'), bb = $('#s-badge');
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const perm = 'Notification' in window ? Notification.permission : 'absent';
  if (!standalone) { bs.textContent = 'Installe d’abord l’appli : Partager › Sur l’écran d’accueil, puis reviens ici depuis l’icône.'; bb.hidden = true; }
  else if (perm === 'granted') { bs.textContent = 'Pastille active.'; bb.hidden = true; }
  else if (perm === 'denied') { bs.textContent = 'Refusée. Réglages de l’iPhone › Notifications › Mail lisible › Autoriser.'; bb.hidden = true; }
  else if (perm === 'absent' || !navigator.setAppBadge) { bs.textContent = 'Non disponible sur cet appareil (iOS 16.4 minimum).'; bb.hidden = true; }
  bb.onclick = async () => { try { const r = await Notification.requestPermission(); if (r === 'granted') { await updateBadge(); toast('Pastille activée'); } renderSettings(); } catch (e) { toast('Autorisation impossible'); } };
  renderBlocked($('#s-blocked'));
  mailboxStats();
  renderRelay();
  $('#s-upd').onclick = async () => {
    const st = $('#s-upd-state'); st.textContent = 'Vérification…';
    const v = await latestVersion();
    if (!v) st.textContent = 'Vérification impossible (pas de réseau ?).';
    else if (v.version !== APP_VERSION) { st.textContent = 'Version ' + v.version + ' disponible.'; $('#s-upd').textContent = 'Installer la version ' + v.version; $('#s-upd').onclick = forceUpdate; }
    else st.textContent = 'Tu as la dernière version.';
  };
  $('#s-force').onclick = forceUpdate;
  $('#s-name').oninput = e => { settings.myName = e.target.value.trim(); saveSettings(); };
  $('#s-home').onchange = e => { settings.home = e.target.checked ? 'today' : 'inbox'; saveSettings(); };
  $('#s-sig-g').oninput = e => { settings.sigGmail = e.target.value; saveSettings(); };
  $('#s-sig-f').oninput = e => { settings.sigFree = e.target.value; saveSettings(); };
  $('#s-fs').oninput = e => { settings.fontSize = +e.target.value; $('#s-fs-v').textContent = settings.fontSize; saveSettings(); };
  $$('.seg button').forEach(b => b.onclick = () => { settings.theme = b.dataset.th; saveSettings(); renderSettings(); });
  $('#s-read').onchange = e => { settings.readable = e.target.checked; saveSettings(); };
  $('#s-img').onchange = e => { settings.images = e.target.checked; saveSettings(); };
  $('#s-prim').onchange = async e => {
    settings.primaryOnly = e.target.checked; saveSettings(); state.lists = {};
    if (relayOn() && relayGmailOn()) { try { await rapi('/prefs', { method: 'POST', body: { primaryOnly: settings.primaryOnly } }); } catch (er) { toast('Relais : ' + er.message); } }
    toast(settings.primaryOnly ? 'Réception : Principal seulement' : 'Réception complète'); setTimeout(updateBadge, 2500);
  };
}

/* ---------- Réglages du relais, notifications et Free ---------- */
function b64uToBytes(s) { return b64ToBytes(s); }
async function enablePush(vapid) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Installe l’appli sur l’écran d’accueil (iOS 16.4 minimum)');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications refusées dans iOS');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(vapid) });
  await rapi('/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
  LS.set('pushOn', true);
}
async function renderRelay() {
  const box = $('#s-rstate'), freeBox = $('#s-free');
  const drawFree = st => {
    if (!relayOn() || !st) { freeBox.innerHTML = `<h3><span class="dot" style="background:var(--free)"></span>Free<span class="st" style="color:var(--muted)">Relais requis</span></h3><p>Connecte d'abord le serveur relais (section ci-dessous) pour ajouter ta boîte Free.</p>`; return; }
    if (st.free) {
      freeBox.innerHTML = `<h3><span class="dot" style="background:var(--free)"></span>Free<span class="st" style="color:var(--ok)">Connecté</span></h3><p>${esc(st.free.email)}</p><p>Mot de passe chiffré sur ton serveur, jamais sur cet iPhone ni sur GitHub.</p><button class="btn" id="s-free-off">Retirer le compte Free</button>`;
      if (settings.freeEmail !== st.free.email) { settings.freeEmail = st.free.email; saveSettings(); }
      $('#s-free-off').onclick = async () => { if (!confirm('Retirer le compte Free de l’appli ?')) return; try { await rapi('/free/account', { method: 'DELETE' }); settings.freeEmail = ''; saveSettings(); state.lists = {}; renderSettings(); } catch (e) { toast(e.message); } };
    } else {
      freeBox.innerHTML = `<h3><span class="dot" style="background:var(--free)"></span>Free<span class="st" style="color:var(--muted)">À configurer</span></h3>
        <label class="f">Adresse Free<input id="s-fmail" type="email" inputmode="email" autocomplete="username" autocapitalize="off" placeholder="identifiant@free.fr"></label>
        <label class="f">Mot de passe de la messagerie<input id="s-fpass" type="password" autocomplete="current-password"></label>
        <label class="f">Nom affiché à l'envoi<input id="s-fname" value="Samuel" autocomplete="name"></label>
        <p>Envoyé directement à ton serveur, qui le garde chiffré. Il ne passe ni par GitHub ni par Claude.</p>
        <button class="btn primary" id="s-fsave">Tester et enregistrer</button>`;
      if (settings.freeEmail) { settings.freeEmail = ''; saveSettings(); }
      $('#s-fsave').onclick = async () => {
        const b = $('#s-fsave'); b.disabled = true; b.textContent = 'Connexion à Free…';
        try { const r = await rapi('/free/account', { method: 'POST', body: { email: $('#s-fmail').value.trim(), password: $('#s-fpass').value, name: $('#s-fname').value.trim() } }); settings.freeEmail = r.email; settings.acc = 'all'; saveSettings(); state.lists = {}; toast('Boîte Free ajoutée'); renderSettings(); }
        catch (e) { b.disabled = false; b.textContent = 'Tester et enregistrer'; toast(e.message); }
      };
    }
  };
  const drawTT = st => {
    const tb = $('#s-tt'); if (!tb) return;
    const head = (c, t) => `<h3><span class="dot" style="background:#4caf8f"></span>TimeTree<span class="st" style="color:${c}">${t}</span></h3>`;
    if (!relayOn() || !st) { tb.innerHTML = head('var(--muted)', 'Relais requis') + '<p>Connecte d’abord le serveur relais pour afficher tes calendriers TimeTree dans l’Agenda.</p>'; return; }
    if (st.timetree) {
      tb.innerHTML = head('var(--ok)', 'Connecté') + `<p>${esc(st.timetree.email)}</p><p>Lecture seule : tes événements TimeTree s’affichent dans l’Agenda, relus toutes les 15 min. Connexion non officielle, elle peut cesser de marcher si TimeTree change son site.</p><button class="btn" id="s-tt-off">Retirer TimeTree</button>`;
      $('#s-tt-off').onclick = async () => { if (!confirm('Retirer TimeTree de l’appli ?')) return; try { await rapi('/timetree/account', { method: 'DELETE' }); state.agCache = null; renderSettings(); } catch (e) { toast(e.message); } };
    } else {
      tb.innerHTML = head('var(--muted)', 'À configurer') + `
        <label class="f">Mail TimeTree<input id="s-ttmail" type="email" inputmode="email" autocomplete="username" autocapitalize="off"></label>
        <label class="f">Mot de passe TimeTree<input id="s-ttpass" type="password" autocomplete="current-password"></label>
        <p>Envoyé directement à ton serveur, qui le garde chiffré. Il ne passe ni par GitHub ni par Claude. Lecture seule : rien n’est jamais modifié dans TimeTree.</p>
        <button class="btn primary" id="s-ttsave">Tester et enregistrer</button>`;
      $('#s-ttsave').onclick = async () => {
        const b = $('#s-ttsave'); b.disabled = true; b.textContent = 'Connexion à TimeTree…';
        try { const r = await rapi('/timetree/account', { method: 'POST', body: { email: $('#s-ttmail').value.trim(), password: $('#s-ttpass').value } }); state.agCache = null; toast(r.error ? 'TimeTree connecté, lecture : ' + r.error : 'TimeTree connecté · ' + r.events + ' événement' + (r.events > 1 ? 's' : '') + (r.cals.length ? ' (' + r.cals.join(', ') + ')' : '')); renderSettings(); }
        catch (e) { b.disabled = false; b.textContent = 'Tester et enregistrer'; toast(e.message); }
      };
    }
  };
  const draw = st => {
    drawTT(st);
    if (!st) { box.innerHTML = ''; drawFree(null); return; }
    const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    const perm = 'Notification' in window ? Notification.permission : 'absent';
    box.innerHTML = `<p style="color:var(--ok);font-weight:650">Relais connecté</p>
      <div class="lab-row" style="padding:0"><span class="nm">Gmail permanent<br><span style="font-size:.75rem;color:var(--muted)">${st.gmail ? esc(st.gmail.email) + ' · plus de reconnexion' : 'Non relié'}</span></span>${st.gmail && settings.relayGmail ? '<span class="nb" style="color:var(--ok)">Actif</span>' : '<button class="btn primary" style="height:40px" id="s-rgmail">Relier Gmail</button>'}</div>
      <div class="lab-row" style="padding:0"><span class="nm">Notifications et pastille<br><span style="font-size:.75rem;color:var(--muted)">${!standalone ? 'Installe l’appli sur l’écran d’accueil d’abord' : perm === 'granted' && LS.get('pushOn', false) ? 'Actives sur cet iPhone' : perm === 'denied' ? 'Refusées : Réglages iPhone › Notifications › MailBox' : 'Désactivées'}</span></span>${standalone && perm !== 'denied' ? `<button class="btn ${perm === 'granted' && LS.get('pushOn', false) ? '' : 'primary'}" style="height:40px" id="s-rpush">${perm === 'granted' && LS.get('pushOn', false) ? 'Tester' : 'Activer'}</button>` : ''}</div>`;
    const g = $('#s-rgmail'); if (g) g.onclick = () => { if (st.gmail) { settings.relayGmail = true; LS.del('rtoken'); saveSettings(); state.lists = {}; renderSettings(); } else location.href = relayGoogleStart(); };
    const p = $('#s-rpush'); if (p) p.onclick = async () => {
      p.disabled = true;
      try { if (Notification.permission === 'granted' && LS.get('pushOn', false)) { await rapi('/push/test', { method: 'POST', body: {} }); toast('Notification de test envoyée'); } else { await enablePush(st.vapid); await rapi('/prefs', { method: 'POST', body: { tz: Intl.DateTimeFormat().resolvedOptions().timeZone } }).catch(() => {}); toast('Notifications activées'); updateBadge(); renderSettings(); } }
      catch (e) { toast(e.message); } p.disabled = false;
    };
    if (settings.ai !== !!st.ai) { settings.ai = !!st.ai; saveSettings(); }
    const ai = document.createElement('div');
    ai.style.cssText = 'display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line);padding-top:8px';
    ai.innerHTML = st.ai
      ? `<div class="lab-row" style="padding:0"><span class="nm">Assistant IA (Groq)<br><span style="font-size:.75rem;color:var(--muted)">Recherche en langage naturel active. Seules tes questions partent vers Groq.</span></span><button class="btn" style="height:40px" id="s-ai-off">Retirer</button></div>`
      : `<span class="nm" style="font-weight:650">Assistant IA (Groq, gratuit)</span>
        <label class="f">Clé API Groq<input id="s-ai-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="gsk_…"></label>
        <p style="margin:0;font-size:.78rem">Crée une clé sur console.groq.com › API Keys. Elle est envoyée à ton serveur, qui la garde chiffrée.</p>
        <button class="btn primary" id="s-ai-save">Activer l’assistant</button>`;
    box.appendChild(ai);
    const aon = $('#s-ai-save'); if (aon) aon.onclick = async () => { aon.disabled = true; try { await rapi('/ai/key', { method: 'POST', body: { key: $('#s-ai-key').value } }); settings.ai = true; saveSettings(); toast('Assistant activé'); renderSettings(); } catch (e) { aon.disabled = false; toast(e.message); } };
    const aoff = $('#s-ai-off'); if (aoff) aoff.onclick = async () => { try { await rapi('/ai/key', { method: 'POST', body: { key: '' } }); settings.ai = false; saveSettings(); renderSettings(); } catch (e) { toast(e.message); } };
    if (perm === 'granted' && LS.get('pushOn', false)) drawPrefs();
    drawFree(st);
  };
  const drawPrefs = async () => {
    const el = document.createElement('div');
    el.style.cssText = 'display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--line);padding-top:8px';
    el.innerHTML = '<p>Chargement des préférences…</p>';
    box.appendChild(el);
    let p;
    try { p = await rapi('/prefs'); } catch (e) { el.innerHTML = '<p>Préférences indisponibles.</p>'; return; }
    const hours = sel => Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === sel ? 'selected' : ''}>${String(h).padStart(2, '0')} h</option>`).join('');
    el.innerHTML = `<label class="switch">Notifications discrètes (sans son ni vibration)<input type="checkbox" id="p-silent" ${p.silent ? 'checked' : ''}></label>
      <label class="switch">Heures calmes (rien la nuit)<input type="checkbox" id="p-quiet" ${p.quiet ? 'checked' : ''}></label>
      <div id="p-hours" style="display:${p.quiet ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:8px">
        <label class="f">De<select id="p-start">${hours(p.quietStart)}</select></label>
        <label class="f">À<select id="p-end">${hours(p.quietEnd)}</select></label>
      </div>
      <p>Pendant les heures calmes, aucun mail ne te réveille. Au réveil, un seul résumé « X mails reçus cette nuit » met la pastille à jour.</p>`;
    const saveP = async () => {
      const body = { silent: $('#p-silent').checked, quiet: $('#p-quiet').checked, quietStart: +$('#p-start').value, quietEnd: +$('#p-end').value, tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
      $('#p-hours').style.display = body.quiet ? 'grid' : 'none';
      try { await rapi('/prefs', { method: 'POST', body }); toast('Préférences enregistrées'); } catch (e) { toast(e.message); }
    };
    ['#p-silent', '#p-quiet', '#p-start', '#p-end'].forEach(id => $(id).onchange = saveP);
  };
  $('#s-rconn').onclick = async () => {
    const url = $('#s-rurl').value.trim().replace(/\/$/, ''), token = $('#s-rtok').value.trim();
    if (!url || !token) { toast('Adresse et code d’accès requis'); return; }
    const b = $('#s-rconn'); b.disabled = true; b.textContent = 'Connexion…';
    try { const st = await rapi('/status', null, { url, token }); settings.relayUrl = url; settings.relayToken = token; settings.vapid = st.vapid; saveSettings(); toast('Relais connecté'); renderSettings(); }
    catch (e) { toast(e.status === 401 ? 'Code d’accès refusé' : e.message); b.disabled = false; b.textContent = 'Connecter le relais'; }
  };
  if (!relayOn()) return draw(null);
  box.innerHTML = '<p>Vérification du relais…</p>';
  try { draw(await rapi('/status')); } catch (e) { box.innerHTML = `<p style="color:var(--danger)">${esc(e.status === 401 ? 'Code d’accès refusé' : e.message)}</p>`; drawFree(null); }
}

/* ---------- Mises à jour ---------- */
async function latestVersion() {
  try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}
async function forceUpdate() {
  toast('Mise à jour…');
  try {
    if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }
    if (navigator.serviceWorker) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); }
    await Promise.all(['./', 'index.html', 'styles.css', 'sw.js', 'manifest.webmanifest'].map(f => fetch(f, { cache: 'reload' }).catch(() => {})));
    const v = await latestVersion();
    if (v && v.assets) await Promise.all(v.assets.map(f => fetch(f, { cache: 'reload' }).catch(() => {})));
  } catch (e) {}
  location.replace(location.pathname + '?u=' + Date.now() + (location.hash.startsWith('#/') ? location.hash : '#/list/INBOX'));
}
async function checkUpdate() {
  const v = await latestVersion();
  if (!v || v.version === APP_VERSION || $('#upd-banner')) return;
  const b = document.createElement('div');
  b.id = 'upd-banner'; b.className = 'upd-banner';
  b.innerHTML = `<span>Nouvelle version ${esc(v.version)} disponible</span><button class="btn primary" type="button">Mettre à jour</button>`;
  b.querySelector('button').onclick = forceUpdate;
  document.body.appendChild(b);
}
