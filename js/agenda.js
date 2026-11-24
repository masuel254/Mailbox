'use strict';
/* ---------- Google Contacts et Agenda ---------- */
async function gx(url, opt = {}) {
  const t = await accessToken();
  if (!t) { auth.login(); throw new Error('auth'); }
  const r = await fetch(url, { method: opt.method || 'GET', headers: Object.assign({ Authorization: 'Bearer ' + t }, opt.body ? { 'Content-Type': 'application/json' } : {}), body: opt.body ? JSON.stringify(opt.body) : undefined });
  if (r.status === 401) { LS.del('rtoken'); throw new Error('Session Google renouvelée, réessaie'); }
  if (!r.ok) {
    let j = {}; try { j = await r.json(); } catch (e) {}
    const m = (j.error && j.error.message) || ('Erreur ' + r.status), raw = JSON.stringify(j.error || {}) + m;
    const e = new Error(m);
    if (/SERVICE_DISABLED|accessNotConfigured|has not been used|is disabled/i.test(raw)) e.kind = 'api';
    else if (r.status === 403 && /scope|insufficient|PERMISSION_DENIED/i.test(raw)) e.kind = 'scope';
    else if (r.status === 429 || /rate|quota/i.test(raw)) e.kind = 'rate';
    throw e;
  }
  return r.status === 204 ? null : r.json().catch(() => null);
}
// Explique quoi faire quand Google refuse (autorisation à donner, API à activer)
function googleHelp(e, what) {
  if (!relayGmailOn()) return `<div class="empty">${esc(what)} passe par ton serveur relais relié à Gmail (Réglages).</div>`;
  if (e.kind === 'scope') return `<div class="ai-note"><b>Autorisation Google à ajouter</b><span>Pour afficher tes ${esc(what.toLowerCase())}, Google demande une autorisation de plus (une seule fois, elle couvre Contacts et Agenda). Si Google affiche « application non vérifiée » : Paramètres avancés puis Accéder.</span><button class="btn primary" id="g-auth" style="margin-top:6px">Autoriser</button></div>`;
  if (e.kind === 'api') {
    const api = /people/i.test(e.message) || what === 'Contacts' ? ['People API', 'people.googleapis.com'] : ['Google Calendar API', 'calendar-json.googleapis.com'];
    return `<div class="ai-note"><b>Service Google à activer (une fois)</b><span>Dans ton projet Google Cloud (celui de MailBox), active <b>${api[0]}</b> : ouvre le lien, vérifie que c’est bien ton projet en haut, touche <b>Activer</b>, attends une minute puis reviens ici.</span><a class="btn primary" style="margin-top:6px" href="https://console.cloud.google.com/apis/library/${api[1]}" target="_blank" rel="noopener">Ouvrir Google Cloud</a></div>`;
  }
  if (e.kind === 'rate') return '<div class="empty">Google demande de ralentir, réessaie dans une minute.</div>';
  return `<div class="empty">${esc(e.message)}</div>`;
}
const bindHelp = () => { const b = $('#g-auth'); if (b) b.onclick = () => { location.href = relayGoogleStart(); }; };
const AV_COLORS = ['#8fb6ff', '#f2b84b', '#9be3b4', '#c9b6ff', '#ffb3a1', '#e48ad1', '#7fd6d6', '#d9c27a'];
const avColor = s => AV_COLORS[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length];
const nrm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* Contacts : contacts Google enregistrés + correspondants trouvés dans les mails */
async function loadContacts(force) {
  const c = LS.get('gcontacts', null);
  if (c && !force && Date.now() - c.at < 10 * 60000) return c.list;
  const people = []; let page = null;
  do {
    const p = new URLSearchParams({ personFields: 'names,emailAddresses,phoneNumbers,organizations', pageSize: 1000, sortOrder: 'FIRST_NAME_ASCENDING' });
    if (page) p.set('pageToken', page);
    const r = (await gx('https://people.googleapis.com/v1/people/me/connections?' + p)) || {};
    (r.connections || []).forEach(x => people.push({
      rn: x.resourceName, name: ((x.names || [])[0] || {}).displayName || '', emails: (x.emailAddresses || []).map(e => (e.value || '').toLowerCase()).filter(Boolean),
      phones: (x.phoneNumbers || []).map(e => e.value).filter(Boolean), org: ((x.organizations || [])[0] || {}).name || ''
    }));
    page = r.nextPageToken;
  } while (page && people.length < 5000);
  let top = [];
  if (relayOn()) { try { top = (await rapi('/contacts/top?n=600')).items || []; } catch (e) {} }
  const byMail = new Map();
  people.forEach(p => p.emails.forEach(e => byMail.set(e, p)));
  top.forEach(t => {
    const p = byMail.get(t.email);
    if (p) { p.count = (p.count || 0) + t.count; p.last = Math.max(p.last || 0, t.last || 0); }
    else people.push({ rn: null, name: t.name || '', emails: [t.email], phones: [], org: '', count: t.count, last: t.last });
  });
  people.forEach(p => { if (!p.name) p.name = p.org || p.emails[0] || p.phones[0] || '(sans nom)'; p.key = p.rn || p.emails[0]; });
  LS.set('gcontacts', { at: Date.now(), list: people });
  return people;
}
const WEBMAIL_RE = /@(gmail|googlemail|yahoo|hotmail|outlook|live|msn|icloud|me|free|orange|wanadoo|sfr|neuf|laposte|bbox|aol|gmx|proton|protonmail)\./i;
const isCompany = p => !!p.org || (p.emails.length && !WEBMAIL_RE.test(p.emails[0]) && (!/\s/.test(p.name.trim()) || /^(contact|info|infos|bonjour|hello|service|support|commercial|devis|sav|accueil|admin|compta|factur|reservation|booking|team|equipe)/i.test(p.emails[0])));
async function renderContacts() {
  const v = $('#view');
  const tab = LS.get('ctab', 'all');
  v.innerHTML = `<div class="sticky-head"><div class="top"><h1>Contacts</h1><button class="icon-btn" id="ct-new" aria-label="Nouveau contact">${ICON.plus}</button><button class="icon-btn" id="ct-ref" aria-label="Actualiser">${ICON.refresh}</button></div>
    <div class="searchbar"><input type="search" id="ct-q" placeholder="Chercher un nom, une société, un mail" autocomplete="off" enterkeyhint="search"></div>
    <div class="seg" id="ct-seg">${[['all', 'Tous'], ['freq', 'Fréquents'], ['fav', 'Favoris'], ['co', 'Entreprises']].map(([k, n]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <div id="ct-list"><div class="loading">Chargement…</div></div>`;
  let list = [];
  const favs = () => new Set(LS.get('favContacts', []));
  const row = p => `<button class="ct-row" data-k="${esc(p.key)}"><span class="av" style="background:${avColor(p.name)}">${esc(initials(p.name))}</span><span class="ct-b"><b>${esc(p.name)}</b><small>${esc(p.org && p.org !== p.name ? p.org + ' · ' : '')}${esc(p.emails[0] || p.phones[0] || '')}</small></span>${p.count ? `<span class="ct-n">${p.count} mail${p.count > 1 ? 's' : ''}</span>` : ''}${favs().has(p.key) ? '<span class="star">★</span>' : ''}</button>`;
  const draw = () => {
    const q = nrm($('#ct-q').value.trim()), t = LS.get('ctab', 'all'), fv = favs();
    let l = list;
    if (q) l = l.filter(p => nrm(p.name + ' ' + p.org + ' ' + p.emails.join(' ') + ' ' + p.phones.join(' ').replace(/\s/g, '')).includes(q.replace(/^0/, '')) || nrm(p.name + ' ' + p.org + ' ' + p.emails.join(' ')).includes(q));
    const box = $('#ct-list'); if (!box) return;
    if (t === 'freq') l = l.filter(p => p.count >= 2).sort((a, b) => b.count - a.count).slice(0, 100);
    else if (t === 'fav') l = l.filter(p => fv.has(p.key));
    else if (t === 'co') l = l.filter(isCompany);
    if (!l.length) { box.innerHTML = `<div class="empty">${t === 'fav' && !q ? 'Aucun favori. Ouvre un contact et touche ⭐ Favori.' : 'Aucun contact ne correspond.'}</div>`; return; }
    if (t === 'freq') { box.innerHTML = '<div class="card fold">' + l.map(row).join('') + '</div>'; }
    else {
      l = l.slice().sort((a, b) => nrm(a.name).localeCompare(nrm(b.name), 'fr'));
      const groups = new Map();
      l.forEach(p => { const k = (nrm(p.name)[0] || '#').toUpperCase(); const g = /[A-Z]/.test(k) ? k : '#'; (groups.get(g) || groups.set(g, []).get(g)).push(p); });
      const fvl = t === 'all' && !q ? l.filter(p => fv.has(p.key)) : [];
      box.innerHTML = (fvl.length ? `<div class="day-h">Favoris</div><div class="card fold">${fvl.map(row).join('')}</div>` : '')
        + [...groups.entries()].map(([g, ps]) => `<div class="day-h">${g}</div><div class="card fold">${ps.slice(0, 400).map(row).join('')}</div>`).join('');
    }
    $$('.ct-row', box).forEach(b => b.onclick = () => { const p = list.find(x => x.key === b.dataset.k); if (p) contactSheet(p, () => { const c = LS.get('gcontacts', null); if (c && c.list) { list = c.list; draw(); } else load(true); }); });
  };
  $('#ct-q').oninput = draw;
  $$('#ct-seg button').forEach(b => b.onclick = () => { LS.set('ctab', b.dataset.t); $$('#ct-seg button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  const load = async force => {
    try { list = await loadContacts(force); draw(); }
    catch (e) { if (e.message === 'auth') return; const c = LS.get('gcontacts', null); if (c && c.list) { list = c.list; draw(); toast(e.message); } else { $('#ct-list').innerHTML = googleHelp(e, 'Contacts'); bindHelp(); } }
  };
  $('#ct-ref').onclick = () => { $('#ct-list').innerHTML = '<div class="loading">Chargement…</div>'; load(true); };
  $('#ct-new').onclick = () => contactEdit({ rn: null, name: '', emails: [], phones: [], org: '' }, () => load(true));
  const cached = LS.get('gcontacts', null);
  if (cached && cached.list) { list = cached.list; draw(); }
  load(false);
}
function contactSheet(p, onChange) {
  const fv = new Set(LS.get('favContacts', []));
  const e0 = p.emails[0], ph = p.phones[0];
  openSheet(`<span class="grip"></span>
    <div style="display:flex;gap:12px;align-items:center"><span class="av big" style="background:${avColor(p.name)}">${esc(initials(p.name))}</span><div style="min-width:0"><h2 style="margin:0">${esc(p.name)}</h2>${p.org && p.org !== p.name ? `<div class="fhint" style="margin:0">${esc(p.org)}</div>` : ''}</div></div>
    <div class="ct-info">${p.emails.map(e => `<div>✉️ ${esc(e)}</div>`).join('')}${p.phones.map(t => `<div>📞 ${esc(t)}</div>`).join('')}
    ${p.count ? `<div class="fhint" style="margin:4px 0 0">${p.count} mail${p.count > 1 ? 's' : ''} échangé${p.count > 1 ? 's' : ''}${p.last ? ' · dernier le ' + new Date(p.last).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</div>` : ''}
    ${!p.rn ? '<div class="fhint" style="margin:4px 0 0">Correspondant trouvé dans tes mails, pas encore enregistré dans tes contacts.</div>' : ''}</div>
    <div class="ct-acts">
      ${e0 ? '<button class="btn" id="cs-mail">✉️ Écrire</button>' : ''}
      ${ph ? `<a class="btn" href="tel:${esc(ph.replace(/[^\d+]/g, ''))}">📞 Appeler</a>` : ''}
      ${e0 ? '<button class="btn" id="cs-hist">🗂 Échanges</button>' : ''}
      <button class="btn" id="cs-rdv">📅 RDV</button>
      <button class="btn" id="cs-edit">${p.rn ? '✏️ Modifier' : '➕ Enregistrer'}</button>
      <button class="btn" id="cs-fav">${fv.has(p.key) ? '★ Favori' : '☆ Favori'}</button>
    </div><div id="cs-feed" class="cs-feed"><div class="loading">Échanges et rendez-vous…</div></div><div style="display:grid;grid-template-columns:${p.rn ? '1fr 1fr' : '1fr'};gap:8px">${p.rn ? '<button class="btn danger" id="cs-del">🗑 Supprimer</button>' : ''}<button class="btn" data-close>Fermer</button></div>`);
  const dl = $('#cs-del'); if (dl) dl.onclick = () => deleteContact(p, onChange);
  const m = $('#cs-mail'); if (m) m.onclick = () => { closeSheet(); openComposeTo(p.name && p.name !== e0 ? `"${p.name}" <${e0}>` : e0, ''); };
  const h = $('#cs-hist'); if (h) h.onclick = () => { closeSheet(); location.hash = '#/search/' + encodeURIComponent(p.emails.map(e => 'from:' + e + ' OR to:' + e).join(' OR ')); };
  $('#cs-rdv').onclick = () => { closeSheet(); location.hash = '#/agenda?new=1&title=' + encodeURIComponent('RDV ' + p.name) + '&with=' + encodeURIComponent(p.name); };
  $('#cs-edit').onclick = () => contactEdit(p, onChange);
  contactFeed(p);
  $('#cs-fav').onclick = () => { const f = new Set(LS.get('favContacts', [])); f.has(p.key) ? f.delete(p.key) : f.add(p.key); LS.set('favContacts', [...f]); toast(f.has(p.key) ? 'Ajouté aux favoris' : 'Retiré des favoris'); closeSheet(); if (onChange) onChange(); };
}
/* Fiche contact : derniers mails échangés (Gmail + Free) et prochains rendez-vous avec la personne */
async function contactFeed(p) {
  const emails = p.emails.slice(0, 3), name = String(p.name || '').trim();
  const nz = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const nameHit = t => name && name.length > 3 && !name.includes('@') && nz(t).includes(nz(name.split(/\s+/).slice(0, 2).join(' ')));
  const mails = [], evs = [], jobs = [];
  if (emails.length && (settings.clientId || relayGmailOn())) jobs.push((async () => {
    const r = (await api('threads?' + new URLSearchParams({ q: emails.map(e => 'from:' + e + ' OR to:' + e).join(' OR '), maxResults: 5 }))) || {};
    (await pool(r.threads || [], 5, t => threadMeta(t).catch(() => null))).filter(Boolean).forEach(t => mails.push(Object.assign(summarize(t), { acc: 'gmail' })));
  })().catch(() => {}));
  if (emails.length && freeOn()) jobs.push(rapi('/free/search?' + new URLSearchParams({ q: emails[0], limit: '5' })).then(r => (r.items || []).forEach(x => mails.push(freeItem(x)))).catch(() => {}));
  const from = new Date(), to = addDays(from, 180);
  const seenEv = new Set();
  [...emails, nameHit(name) ? name : null].filter(Boolean).forEach(q => jobs.push(gx('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + new URLSearchParams({ q, timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: 5 }))
    .then(r => ((r || {}).items || []).forEach(e => { if (seenEv.has(e.id) || e.status === 'cancelled') return; seenEv.add(e.id); const t = evTimes(e); evs.push({ s: t.s, allDay: t.allDay, title: e.summary || '(sans titre)', src: 'Google' }); })).catch(() => {})));
  if (relayOn() && nameHit(name)) jobs.push(rapi('/timetree/events?' + new URLSearchParams({ from: from.getTime(), to: addDays(from, 90).getTime() })).then(r => (r.items || []).filter(x => nameHit(x.title + ' ' + (x.note || ''))).forEach(x => evs.push({ s: x.allDay ? new Date(x.date + 'T00:00') : new Date(x.start), allDay: x.allDay, title: x.title, src: 'TimeTree' }))).catch(() => {}));
  await Promise.all(jobs);
  const box = $('#cs-feed'); if (!box) return;
  mails.sort((a, b) => b.date - a.date); evs.sort((a, b) => a.s - b.s);
  const mh = mails.slice(0, 5).map(m => `<a class="cs-row" href="${m.acc === 'free' ? '#/free/' + encodeURIComponent(m.folder) + '/' + m.uid : '#/thread/' + encodeURIComponent(m.id)}"><span>${m.mine || m.sentByMe ? '↗' : '↘'}</span><b>${esc(m.subject)}</b><small>${esc(fmtDate(m.date))}</small></a>`).join('');
  const eh = evs.slice(0, 4).map(x => `<div class="cs-row"><span>📅</span><b>${esc(x.title)}</b><small>${esc(x.s.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) + (x.allDay ? '' : ' ' + hhmm(x.s)))}</small></div>`).join('');
  box.innerHTML = (eh ? `<h3>Prochains rendez-vous</h3>${eh}` : '') + (mh ? `<h3>Derniers échanges</h3>${mh}` : '') || '<p class="fhint" style="margin:0">Aucun mail ni rendez-vous trouvé avec cette personne.</p>';
  $$('a.cs-row', box).forEach(a => a.addEventListener('click', () => closeSheet()));
}
function contactEdit(p, onChange) {
  const multi = (id, label, vals, type) => `<div class="f-multi" id="${id}"><span class="f-lab">${label}</span>${(vals.length ? vals : ['']).map(v => `<input type="${type}" ${type === 'email' ? 'inputmode="email"' : 'inputmode="tel"'} autocomplete="off" value="${esc(v)}">`).join('')}<button type="button" class="linkish" data-add="${id}">+ Ajouter ${type === 'email' ? 'un mail' : 'un numéro'}</button></div>`;
  openSheet(`<span class="grip"></span><h2>${p.rn ? 'Modifier le contact' : 'Nouveau contact'}</h2>
    <label class="f">Nom<input id="ce-name" autocomplete="off" value="${esc(p.rn || (p.name !== p.emails[0] && p.name !== p.phones[0]) ? (p.name === '(sans nom)' ? '' : p.name) : '')}"></label>
    <label class="f">Société<input id="ce-org" autocomplete="off" value="${esc(p.org || '')}"></label>
    ${multi('ce-mails', 'Mails', p.emails, 'email')}
    ${multi('ce-tels', 'Téléphones', p.phones, 'tel')}
    <p class="fhint" style="margin:0">Enregistré dans tes contacts Google : visible aussi dans Contacts sur l’iPhone si ton compte Google y est synchronisé.</p>
    <div style="display:grid;grid-template-columns:${p.rn ? '1fr 1fr 1fr' : '1fr 1fr'};gap:10px">${p.rn ? '<button class="btn danger" id="ce-del">Supprimer</button>' : ''}<button class="btn" data-close>Annuler</button><button class="btn primary" id="ce-ok">Enregistrer</button></div>`);
  $$('[data-add]').forEach(b => b.onclick = () => { const box = $('#' + b.dataset.add); const first = $('input', box); const n = first.cloneNode(); n.value = ''; box.insertBefore(n, b); n.focus(); });
  const vals = id => $$('#' + id + ' input').map(x => x.value.trim()).filter(Boolean);
  const fail = e => { if (e.message === 'auth') return; if (e.kind) { closeSheet(); openSheet('<span class="grip"></span>' + googleHelp(e, 'Contacts') + '<button class="btn" data-close>Fermer</button>'); bindHelp(); } else toast('Échec : ' + e.message); };
  $('#ce-ok').onclick = async () => {
    const name = $('#ce-name').value.trim(), org = $('#ce-org').value.trim(), mails = vals('ce-mails').map(x => x.toLowerCase()), tels = vals('ce-tels');
    if (!name && !org && !mails.length && !tels.length) { toast('Indique au moins un nom, un mail ou un numéro'); return; }
    const bad = mails.find(m => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)); if (bad) { toast('Mail invalide : ' + bad); return; }
    const sp = name.split(/\s+/);
    const body = { names: name ? [{ givenName: sp[0], familyName: sp.slice(1).join(' ') }] : [], organizations: org ? [{ name: org }] : [], emailAddresses: mails.map(value => ({ value })), phoneNumbers: tels.map(value => ({ value })) };
    const b = $('#ce-ok'); b.disabled = true; b.textContent = 'Enregistrement…';
    try {
      if (p.rn) {
        const cur = await gx('https://people.googleapis.com/v1/' + p.rn + '?personFields=metadata');
        await gx('https://people.googleapis.com/v1/' + p.rn + ':updateContact?updatePersonFields=names,organizations,emailAddresses,phoneNumbers', { method: 'PATCH', body: Object.assign({ etag: cur.etag }, body) });
      } else await gx('https://people.googleapis.com/v1/people:createContact', { method: 'POST', body });
      LS.del('gcontacts'); closeSheet(); toast(p.rn ? 'Contact modifié' : 'Contact créé');
      if (onChange) onChange();
    } catch (e) { b.disabled = false; b.textContent = 'Enregistrer'; fail(e); }
  };
  const del = $('#ce-del'); if (del) del.onclick = () => deleteContact(p, onChange);
}
async function deleteContact(p, onChange) {
  if (!confirm('Supprimer définitivement « ' + (p.name || 'ce contact') + ' » de tes contacts Google ?')) return;
  try {
    await gx('https://people.googleapis.com/v1/' + p.rn + ':deleteContact', { method: 'DELETE' });
    const f = new Set(LS.get('favContacts', [])); f.delete(p.key); LS.set('favContacts', [...f]);
    const c = LS.get('gcontacts', null); if (c && c.list) { c.list = c.list.filter(x => x.key !== p.key); LS.set('gcontacts', c); }
    closeSheet(); toast('Contact supprimé');
    if (onChange) onChange();
  } catch (e) { if (e.message === 'auth') return; if (e.kind) { closeSheet(); openSheet('<span class="grip"></span>' + googleHelp(e, 'Contacts') + '<button class="btn" data-close>Fermer</button>'); bindHelp(); } else toast('Échec : ' + e.message); }
}

/* Agenda : Google Agenda (calendrier principal) + tâches MailBox avec rappel */
const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = d => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const hhmm = d => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const EV_COLORS = { 1: '#a4bdfc', 2: '#7ae7bf', 3: '#dbadff', 4: '#ff887c', 5: '#fbd75b', 6: '#ffb878', 7: '#46d6db', 8: '#e1e1e1', 9: '#5484ed', 10: '#51b749', 11: '#dc2127' };
function evTimes(e) {
  if (e.start && e.start.date) { const s = new Date(e.start.date + 'T00:00'); return { s, e: new Date((e.end && e.end.date ? e.end.date : e.start.date) + 'T00:00'), allDay: true }; }
  return { s: new Date(e.start.dateTime), e: new Date((e.end || e.start).dateTime), allDay: false };
}
async function renderAgenda() {
  const v = $('#view');
  const hq = new URLSearchParams(location.hash.split('?')[1] || '');
  const mode = LS.get('agMode', 'week');
  state.agDay = state.agDay || startOfDay(new Date());
  v.innerHTML = `<div class="sticky-head ag-sticky"><div class="top ag-top"><h1>Agenda</h1><button class="icon-btn" id="ag-bd" aria-label="Anniversaires">🎂</button><button class="icon-btn" id="ag-new" aria-label="Nouvel événement">${ICON.plus}</button><button class="icon-btn" id="ag-ref" aria-label="Actualiser">${ICON.refresh}</button></div>
    <div class="seg" id="ag-seg">${[['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois'], ['list', 'Liste']].map(([k, n]) => `<button data-m="${k}" class="${mode === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div id="ag-nav"></div></div>${settings.ai && relayOn() ? '<div class="ag-ai"><button class="btn" id="ag-ai-day">✦ Ma journée</button><button class="btn" id="ag-ai-week">✦ Ma semaine</button><button class="btn" id="ag-ai-we">✦ Week-end</button></div><div id="ag-ai-out"></div>' : ''}<div id="ag-sug"></div><div id="ag-list"><div class="loading">Chargement…</div></div>`;
  $$('#ag-seg button').forEach(b => b.onclick = () => { LS.set('agMode', b.dataset.m); renderAgenda(); });
  $('#ag-bd').onclick = () => { location.hash = '#/bdays'; };
  $('#ag-new').onclick = () => eventSheet({ start: defaultStart(state.agDay) }, () => renderAgenda());
  $('#ag-ref').onclick = () => { state.agCache = null; renderAgenda(); };
  if (hq.get('new')) { history.replaceState(null, '', '#/agenda'); eventSheet({ title: hq.get('title') || '', note: hq.get('with') ? 'Avec ' + hq.get('with') : '', start: defaultStart(state.agDay) }, () => renderAgenda()); }
  const d0 = state.agDay;
  const range = mode === 'day' ? [startOfDay(d0), addDays(startOfDay(d0), 1)] : mode === 'week' ? [monday(d0), addDays(monday(d0), 7)]
    : mode === 'month' ? (() => { const f = new Date(d0.getFullYear(), d0.getMonth(), 1); const s = monday(f); return [s, addDays(s, 42)]; })()
    : [startOfDay(new Date()), addDays(startOfDay(new Date()), 60)];
  const ck = mode + range[0].getTime();
  let evs = [], tasks = [], tt = [], gErr = null, ttInfo = null;
  const ttJob = relayOn() ? rapi('/timetree/events?' + new URLSearchParams({ from: range[0].getTime(), to: range[1].getTime() })).then(r => { ttInfo = r; tt = r.items || []; state.ttCals = r.enabled ? (r.calIds || []) : []; }).catch(() => {}) : Promise.resolve();
  try {
    if (state.agCache && state.agCache.k === ck && Date.now() - state.agCache.at < 60000) evs = state.agCache.evs;
    else {
      const p = new URLSearchParams({ timeMin: range[0].toISOString(), timeMax: range[1].toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: 250 });
      evs = ((await gx('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + p)) || {}).items || [];
      state.agCache = { k: ck, at: Date.now(), evs };
    }
  } catch (e) { if (e.message === 'auth') return; gErr = e; }
  const bdJob = bdLoad().catch(() => []);
  await ttJob;
  const bdList = await bdJob;
  if (gErr && !(ttInfo && ttInfo.enabled)) { $('#ag-list').innerHTML = googleHelp(gErr, 'Agenda'); bindHelp(); return; }
  if (relayOn()) { try { tasks = ((await rapi('/tasks')).tasks || []).filter(t => !t.done && t.due && t.due >= range[0].getTime() && t.due < range[1].getTime()); } catch (e) {} }
  const items = evs.filter(e => e.status !== 'cancelled').map(e => Object.assign({ kind: 'ev', ev: e }, evTimes(e)))
    .concat(tasks.map(t => ({ kind: 'task', t, s: new Date(t.due), e: new Date(t.due), allDay: false })))
    .concat(tt.map(x => x.allDay ? { kind: 'tt', x, s: new Date(x.date + 'T00:00'), e: addDays(new Date(x.endDate + 'T00:00'), 1), allDay: true } : { kind: 'tt', x, s: new Date(x.start), e: new Date(x.end), allDay: false }))
    .concat(bdOccur(bdList, range[0], range[1]))
    .sort((a, b) => (b.allDay - a.allDay) || ((b.kind === 'bd') - (a.kind === 'bd')) || (a.s - b.s));
  const byDay = new Map();
  items.forEach(it => {
    // un événement sur plusieurs jours apparaît chaque jour
    let d = startOfDay(it.s); const end = it.allDay ? it.e : addDays(startOfDay(it.e), 1);
    do { (byDay.get(dayKey(d)) || byDay.set(dayKey(d), []).get(dayKey(d))).push(it); d = addDays(d, 1); } while (d < end && d < range[1]);
  });
  const nav = $('#ag-nav'), tk = dayKey(new Date());
  // bouton « Aujourd'hui » dès qu'on s'est éloigné du jour courant, pour ne pas s'y perdre
  const away = dayKey(d0) !== tk;
  const head = (lbl, prev, next, pl, nl) => { nav.innerHTML = `<div class="ag-head"><button class="icon-btn" id="ag-prev" aria-label="${pl}">‹</button><div class="ag-mid"><b>${esc(lbl)}</b>${away ? '<button class="today-pill" id="ag-today">Revenir à aujourd’hui</button>' : ''}</div><button class="icon-btn" id="ag-next" aria-label="${nl}">›</button></div>`; $('#ag-prev').onclick = () => { state.agDay = prev; renderAgenda(); }; $('#ag-next').onclick = () => { state.agDay = next; renderAgenda(); }; const tb = $('#ag-today'); if (tb) tb.onclick = () => { state.agDay = startOfDay(new Date()); renderAgenda(); }; };
  // titre et couleur d'un élément (Google, TimeTree ou tâche), pour les pastilles des vues Semaine et Mois
  const itTitle = it => it.kind === 'bd' ? '🎂 ' + it.b.name.split(' ')[0] : it.kind === 'tt' ? it.x.title : it.kind === 'task' ? it.t.title : (it.ev.summary || '(sans titre)');
  const itColor = it => it.kind === 'bd' ? '#f2b84b' : it.kind === 'tt' ? (it.x.color || '#4caf8f') : it.kind === 'task' ? '#9be3b4' : (EV_COLORS[it.ev.colorId] || '#8fb6ff');
  const itAttr = it => it.kind === 'bd' ? `data-bd="${esc(it.b.id)}"` : it.kind === 'tt' ? `data-tt="${esc(it.x.id)}"` : it.kind === 'task' ? `data-task="${esc(it.t.id)}"` : `data-ev="${esc(it.ev.id)}"`;
  let days = [], pre = '';
  if (mode === 'day') {
    head(d0.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + (dayKey(d0) === tk ? ' (auj.)' : ''), addDays(d0, -1), addDays(d0, 1), 'Jour précédent', 'Jour suivant');
    days = [startOfDay(d0)];
  } else if (mode === 'week') {
    const m = monday(d0);
    head(m.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + ' – ' + addDays(m, 6).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }), addDays(d0, -7), addDays(d0, 7), 'Semaine précédente', 'Semaine suivante');
    // 7 grandes cases sur 2 colonnes : titres et heures en entier, sans avoir à toucher chaque jour
    const wk = [...Array(7)].map((_, i) => addDays(m, i));
    const cnt = wk.map(d => (byDay.get(dayKey(d)) || []).length), total = new Set(wk.flatMap(d => byDay.get(dayKey(d)) || [])).size;
    const busy = cnt.indexOf(Math.max(...cnt)), free = wk.filter((d, i) => !cnt[i]);
    pre = `<div class="wgrid">${wk.map(d => { const k = dayKey(d), its = byDay.get(k) || [];
      return `<div class="wcard ${k === tk ? 'today' : ''}"><button class="wcard-h" data-day="${k}">${esc(d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }).replace('.', ''))}${k === tk ? ' · auj.' : ''}</button>${its.length ? its.map(it => `<button class="chip-ev" style="--c:${esc(itColor(it))}" ${itAttr(it)}>${it.allDay ? '' : `<i>${hhmm(it.s)}</i> `}${esc(itTitle(it))}</button>`).join('') : '<span class="wfree">Libre</span>'}</div>`; }).join('')}
      <div class="wcard wsum"><b>${total} événement${total > 1 ? 's' : ''}</b>${total ? `<span>${esc(wk[busy].toLocaleDateString('fr-FR', { weekday: 'long' }))} le plus chargé</span>` : ''}${free.length ? `<span>Libre : ${esc(free.map(d => d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')).join(', '))}</span>` : ''}</div></div>`;
  } else if (mode === 'month') {
    const f = new Date(d0.getFullYear(), d0.getMonth(), 1), st = monday(f);
    const mFirst = (y, mo) => { const x = new Date(y, mo, 1), n = new Date(); return x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth() ? startOfDay(n) : x; };
    head(f.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }), mFirst(d0.getFullYear(), d0.getMonth() - 1), mFirst(d0.getFullYear(), d0.getMonth() + 1), 'Mois précédent', 'Mois suivant');
    // cases hautes avec le début des titres ; la dernière ligne n'est affichée que si elle contient des jours du mois
    const n = addDays(st, 35).getMonth() === f.getMonth() ? 42 : 35;
    pre = `<div class="mgrid">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<span class="mh">${x}</span>`).join('')}${[...Array(n)].map((_, i) => { const d = addDays(st, i), k = dayKey(d), its = byDay.get(k) || [];
      return `<button class="mcell ${its.some(it => it.kind === 'bd') ? 'bd' : ''} ${d.getMonth() !== f.getMonth() ? 'out' : ''} ${k === dayKey(d0) ? 'on' : ''} ${k === tk ? 'today' : ''}" data-d="${k}"><b>${d.getDate()}</b>${its.slice(0, its.length > 3 ? 2 : 3).map(it => `<span style="--c:${esc(itColor(it))}">${esc(itTitle(it))}</span>`).join('')}${its.length > 3 ? `<small>+${its.length - 2}</small>` : ''}</button>`; }).join('')}</div>`;
    days = [startOfDay(d0)];
  } else { nav.innerHTML = ''; days = [...Array(60)].map((_, i) => addDays(startOfDay(new Date()), i)).filter(d => byDay.has(dayKey(d))); }
  const evRow = it => {
    if (it.kind === 'bd') return `<button class="ev bd-ev" style="--c:#f2b84b" data-bd="${esc(it.b.id)}"><span class="t">🎂</span><span class="ev-b"><b>${esc(BD_KIND[it.b.type] || 'Anniversaire')} ${esc(deName(it.b.name))}</b><small>${esc([bdText(it), dayKey(it.s) === tk ? 'rappel envoyé à 07:30' : 'rappel le jour J à 07:30'].filter(Boolean).join(' · '))}</small></span></button>`;
    if (it.kind === 'tt') { const x = it.x; return `<button class="ev" style="--c:${esc(x.color || '#4caf8f')}" data-tt="${esc(x.id)}"><span class="t">${it.allDay ? 'Journée' : hhmm(it.s) + (it.e > it.s ? '<br>' + hhmm(it.e) : '')}</span><span class="ev-b"><b>${esc(x.title)}</b><small><span class="tt-tag">TimeTree</span> ${esc(x.cal)}${x.location || mapLinkIn(x.note) ? ' · ' + locChip(x.location || mapLinkIn(x.note)) : ''}</small></span></button>`; }
    if (it.kind === 'task') return `<button class="ev" style="--c:#9be3b4" data-task="${esc(it.t.id)}"><span class="t">${hhmm(it.s)}</span><span class="ev-b"><b>${esc(it.t.title)}</b><small>Tâche MailBox${it.t.ref && it.t.ref.from ? ' · mail de ' + esc(it.t.ref.from) : ''}</small></span></button>`;
    const e = it.ev;
    return `<button class="ev" style="--c:${EV_COLORS[e.colorId] || '#8fb6ff'}" data-ev="${esc(e.id)}"><span class="t">${it.allDay ? 'Journée' : hhmm(it.s) + '<br>' + hhmm(it.e)}</span><span class="ev-b"><b>${esc(e.summary || '(sans titre)')}</b>${e.location || e.description ? `<small>${e.location ? locChip(e.location) : ''}${e.location && e.description ? ' · ' : ''}${!e.location && mapLinkIn(e.description) ? locChip(mapLinkIn(e.description)) + ' · ' : ''}${e.description ? esc(String(e.description).replace(/<[^>]+>/g, ' ').replace(/https?:\/\/\S+/g, '').slice(0, 80)) : ''}</small>` : ''}</span></button>`;
  };
  const box = $('#ag-list');
  box.innerHTML = bdBanner(bdList) + pre + days.map(d => { const its = byDay.get(dayKey(d)) || []; return (mode === 'day' ? '' : `<div class="day-h">${esc(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}${dayKey(d) === tk ? ' · aujourd’hui' : ''}</div>`) + (its.length ? its.map(evRow).join('') : '<p class="fhint" style="margin:2px 6px 8px">Rien de prévu</p>'); }).join('')
    || (mode === 'list' ? '<div class="empty">Rien de prévu sur les 60 prochains jours.</div>' : '');
  $$('[data-d]', box).forEach(b => b.onclick = () => { state.agDay = new Date(b.dataset.d + 'T00:00'); renderAgenda(); });
  // toucher l'en-tête d'un jour de la semaine ouvre la vue Jour
  $$('[data-day]', box).forEach(b => b.onclick = () => { state.agDay = new Date(b.dataset.day + 'T00:00'); LS.set('agMode', 'day'); renderAgenda(); });
  // toucher le lieu ouvre la carte (Plans ou le lien Maps collé), sans ouvrir l'événement
  $$('[data-ev]', box).forEach(b => b.onclick = () => { const e = evs.find(x => x.id === b.dataset.ev); if (e) eventSheet(e, () => { state.agCache = null; renderAgenda(); }); });
  $$('[data-task]', box).forEach(b => b.onclick = () => { location.hash = '#/tasks'; });
  $$('[data-bd]', box).forEach(b => b.onclick = ev => { ev.stopPropagation(); bdSheet(bdList.find(x => x.id === b.dataset.bd)); });
  $$('[data-tt]', box).forEach(b => b.onclick = () => {
    const it = items.find(i => i.kind === 'tt' && i.x.id === b.dataset.tt); if (!it) return; const x = it.x;
    openSheet(`<span class="grip"></span><h2>${esc(x.title)}</h2><p class="fhint" style="margin:0"><span class="tt-tag">TimeTree</span> ${esc(x.cal)}</p>
      <div class="ct-info"><div>📅 ${esc(it.s.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}${it.allDay ? ' · journée entière' : ' · ' + hhmm(it.s) + (it.e > it.s ? ' – ' + hhmm(it.e) : '')}</div>${x.location ? `<div>${locChip(x.location)}</div>` : ''}${x.note ? `<div>📝 ${noteLinks(x.note)}</div>` : ''}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn primary" id="tt-edit">✏️ Modifier</button><button class="btn" id="tt-copy">Copier vers Google</button></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn danger" id="tt-del">🗑 Supprimer</button><button class="btn" data-close>Fermer</button></div>`);
    $('#tt-del').onclick = async () => {
      if (!confirm('Supprimer « ' + x.title + ' » de TimeTree (' + x.cal + ') ?' + (x.recurring ? '\n\nC’est un événement qui se répète : TOUTES les occurrences seront supprimées.' : '') + '\n\nIl disparaîtra aussi pour les autres membres du calendrier.')) return;
      const db = $('#tt-del'); db.disabled = true; db.textContent = 'Suppression…';
      try { await rapi('/timetree/delete', { method: 'POST', body: { cal: x.calId, uuid: x.uuid } }); closeSheet(); toast('Supprimé de TimeTree'); state.agCache = null; renderAgenda(); }
      catch (e) { db.disabled = false; db.textContent = '🗑 Supprimer'; toast(e.message); }
    };
    $('#tt-edit').onclick = () => { closeSheet(); eventSheet({ ttEdit: x, title: x.title, start: it.s, end: it.allDay ? addDays(it.e, -1) : it.e, allDay: it.allDay, location: x.location || '', note: x.note || '' }, () => { state.agCache = null; renderAgenda(); }); };
    $('#tt-copy').onclick = () => { closeSheet(); eventSheet({ title: x.title, start: it.s, end: it.allDay ? null : it.e, allDay: it.allDay, location: x.location, note: (x.note ? x.note + ' · ' : '') + 'Depuis TimeTree (' + x.cal + ')' }, () => { state.agCache = null; renderAgenda(); }); };
  });
  if (gErr) box.insertAdjacentHTML('afterbegin', googleHelp(gErr, 'Agenda')), bindHelp();
  if (ttInfo && ttInfo.error) box.insertAdjacentHTML('afterbegin', `<p class="fhint">TimeTree : ${esc(ttInfo.error)}${ttInfo.at ? ' · données du ' + esc(new Date(ttInfo.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : ''}</p>`);
  bindAgendaSwipe(box, evs, items);
  if (mode === 'week') bindWeekDrag(box, evs, items);
  const aiD = $('#ag-ai-day'), aiW = $('#ag-ai-week');
  if (aiD) aiD.onclick = () => agendaSynthesis('day', aiD);
  if (aiW) aiW.onclick = () => agendaSynthesis('week', aiW);
  const aiE = $('#ag-ai-we'); if (aiE) aiE.onclick = () => agendaSynthesis('weekend', aiE);
  agendaSuggestions();
}
/* Synthèse IA du jour ou de la semaine (jour choisi / semaine qui le contient), Google Agenda + TimeTree + tâches */
async function agendaSynthesis(scope, btn, base) {
  const out = $('#ag-ai-out'); if (!out) return;
  const d0 = startOfDay(base || state.agDay || new Date());
  // ‹ › : période précédente / suivante, sans quitter la synthèse
  const step = scope === 'day' ? 1 : 7;
  const navBar = lbl => `<div class="ag-syn-nav"><button class="icon-btn" data-sh="-1" aria-label="Période précédente">‹</button><span>${esc(lbl)}</span><button class="icon-btn" data-sh="1" aria-label="Période suivante">›</button></div>`;
  const bindNav = () => $$('[data-sh]', out).forEach(b => b.onclick = () => agendaSynthesis(scope, btn, addDays(d0, step * +b.dataset.sh)));
  // week-end : samedi et dimanche de la semaine du jour choisi
  const from = scope === 'week' ? monday(d0) : scope === 'weekend' ? addDays(monday(d0), 5) : d0;
  const to = scope === 'week' || scope === 'weekend' ? addDays(monday(d0), 7) : addDays(d0, 1);
  const old = btn.textContent; btn.disabled = true; btn.textContent = 'Analyse…';
  try {
    const p = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: 100 });
    const errs = [];
    const [g, t, tk] = await Promise.all([
      gx('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + p).then(r => (r || {}).items || []).catch(e => { errs.push('Google Agenda : ' + e.message); return []; }),
      rapi('/timetree/events?' + new URLSearchParams({ from: from.getTime(), to: to.getTime() })).then(r => { if (r.error) errs.push('TimeTree : ' + r.error); return r.items || []; }).catch(e => { errs.push('TimeTree : ' + e.message); return []; }),
      rapi('/tasks').then(r => (r.tasks || []).filter(x => !x.done && x.due >= from.getTime() && x.due < to.getTime())).catch(() => [])
    ]);
    const fmtD = d => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const lines = [];
    // événements sur plusieurs jours (voyage, vacances) : décrits avec leurs dates de début et de fin
    const when = (s, e, allDay) => {
      if (!allDay) return fmtD(s) + ' · ' + hhmm(s) + '-' + hhmm(e);
      const last = addDays(e, -1);
      return dayKey(last) > dayKey(s) ? 'du ' + fmtD(s) + ' au ' + fmtD(last) + ' (plusieurs jours, en cours sur la période)' : fmtD(s) + ' · journée entière';
    };
    g.filter(e => e.status !== 'cancelled').forEach(e => { const t = evTimes(e); lines.push([t.s, when(t.s, t.e, t.allDay) + ' · ' + (e.summary || '(sans titre)') + (e.location ? ' · lieu : ' + e.location : '') + ' [Google]', t.e]); });
    t.forEach(x => { const s = x.allDay ? new Date(x.date + 'T00:00') : new Date(x.start), e = x.allDay ? addDays(new Date(x.endDate + 'T00:00'), 1) : new Date(x.end); lines.push([s, when(s, e, x.allDay) + ' · ' + x.title + (x.location ? ' · lieu : ' + x.location : '') + ' [TimeTree ' + x.cal + ']', e]); });
    tk.forEach(x => { const s = new Date(x.due); lines.push([s, fmtD(s) + ' · ' + hhmm(s) + ' · tâche : ' + x.title, s]); });
    // le relais renvoie une marge d'un jour : on ne garde que la période demandée
    // garder tout ce qui chevauche la période (un voyage commencé avant compte aussi)
    for (let i = lines.length - 1; i >= 0; i--) { const [s, , e] = lines[i]; if (s >= to || Math.max(+e, +s + 1) <= +from) lines.splice(i, 1); }
    lines.sort((a, b) => a[0] - b[0]);
    const label = scope === 'week' ? 'semaine du ' + fmtD(from) : scope === 'weekend' ? 'week-end du ' + fmtD(from) : fmtD(from);
    if (!lines.length) { out.innerHTML = `<div class="ag-syn">${navBar(label)}<div class="ag-syn-h"><b>Rien de prévu</b><button class="linkish" id="ag-syn-x" aria-label="Fermer">✕</button></div><p>Aucun événement sur cette période.</p></div>`; bindNav(); $('#ag-syn-x').onclick = () => { out.innerHTML = ''; }; return; }
    const cnt = { g: 0, t: 0, k: 0 }; lines.forEach(l => { if (/\[Google\]$/.test(l[1])) cnt.g++; else if (/\[TimeTree/.test(l[1])) cnt.t++; else cnt.k++; });
    const r = await rapi('/ai/agenda', { method: 'POST', body: { scope, now: new Date().toLocaleString('fr-FR'), text: 'PÉRIODE : ' + label + '\nNOMBRE D’ÉVÉNEMENTS : ' + lines.length + '\nÉVÉNEMENTS (un par ligne) :\n' + lines.map((l, i) => (i + 1) + '. ' + l[1]).join('\n') } });
    const ul = (h, a) => a && a.length ? `<h4>${h}</h4><ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    out.innerHTML = `<div class="ag-syn">${navBar(label)}<div class="ag-syn-h"><b>✦ ${esc(r.titre || 'Synthèse')}</b><button class="linkish" id="ag-syn-x" aria-label="Fermer">✕</button></div>
      ${r.resume ? `<p>${esc(r.resume)}</p>` : ''}
      ${scope !== 'day' ? (r.jours || []).map(j => j.points && j.points.length ? `<h4>${esc(j.jour)}</h4><ul>${j.points.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '').join('') : ''}
      ${ul('⚠️ Attention', r.attention)}${ul('🕒 Créneaux libres', r.libre)}${ul('📋 À préparer', r.preparer)}
      <p class="fhint" style="margin:6px 0 0">${esc(label)} · Google ${cnt.g} · TimeTree ${cnt.t}${cnt.k ? ' · tâches ' + cnt.k : ''}${errs.length ? '<br>⚠️ ' + errs.map(esc).join(' · ') : ''}</p></div>`;
    $('#ag-syn-x').onclick = () => { out.innerHTML = ''; }; bindNav();
  } catch (e) { if (e.message !== 'auth') toast('Synthèse impossible : ' + e.message); }
  finally { btn.disabled = false; btn.textContent = old; }
}
/* Glisser un événement vers la gauche : bouton Supprimer (Google Agenda ou TimeTree) */
/* Glisser un événement vers un autre jour (vue Semaine) : appui long, on déplace, on lâche sur le jour voulu */
function bindWeekDrag(box, evs, items) {
  let tm = null, drag = null, ghost = null, over = null, sx = 0, sy = 0;
  const find = b => b.dataset.ev ? items.find(i => i.kind === 'ev' && i.ev.id === b.dataset.ev) : b.dataset.tt ? items.find(i => i.kind === 'tt' && i.x.id === b.dataset.tt) : null;
  const end = () => { clearTimeout(tm); tm = null; if (ghost) ghost.remove(); ghost = null; if (over) over.classList.remove('drop'); over = null; if (drag) drag.b.classList.remove('dragging'); drag = null; };
  box.addEventListener('touchstart', e => {
    const b = e.target.closest('.chip-ev'); if (!b || e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    tm = setTimeout(() => {
      const it = find(b); if (!it) return;
      if (it.kind === 'tt' && it.x.recurring) { toast('Événement TimeTree répété : à déplacer dans TimeTree'); return; }
      if (it.kind === 'ev' && it.ev.recurringEventId) toast('Seul ce jour-là sera déplacé');
      drag = { b, it, from: b.closest('.wcard').querySelector('[data-day]').dataset.day };
      b.classList.add('dragging'); if (navigator.vibrate) navigator.vibrate(15);
      ghost = b.cloneNode(true); ghost.className = 'chip-ev drag-ghost'; ghost.style.setProperty('--c', b.style.getPropertyValue('--c')); ghost.style.width = b.offsetWidth + 'px';
      document.body.appendChild(ghost); ghost.style.transform = `translate(${sx - b.offsetWidth / 2}px,${sy - 20}px)`;
    }, 380);
  }, { passive: true });
  box.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (!drag) { if (tm && (Math.abs(t.clientX - sx) > 8 || Math.abs(t.clientY - sy) > 8)) { clearTimeout(tm); tm = null; } return; }
    e.preventDefault();
    ghost.style.transform = `translate(${t.clientX - ghost.offsetWidth / 2}px,${t.clientY - 20}px)`;
    const el = document.elementFromPoint(t.clientX, t.clientY), card = el && el.closest('.wcard:not(.wsum)');
    if (over && over !== card) over.classList.remove('drop');
    over = card; if (card) card.classList.add('drop');
  }, { passive: false });
  box.addEventListener('touchend', async e => {
    if (!drag) { clearTimeout(tm); tm = null; return; }
    e.preventDefault();
    const d = drag, card = over; end();
    if (!card) return;
    const to = card.querySelector('[data-day]').dataset.day; if (to === d.from) return;
    const delta = Math.round((new Date(to + 'T00:00') - new Date(d.from + 'T00:00')) / 864e5);
    const move = async n => {
      if (d.it.kind === 'ev') {
        const e0 = d.it.ev, body = {};
        ['start', 'end'].forEach(k => { const v = e0[k]; body[k] = v.date ? { date: dayKey(addDays(new Date(v.date + 'T00:00'), n)) } : { dateTime: addDays(new Date(v.dateTime), n).toISOString(), timeZone: v.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone }; });
        const r = await gx('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(e0.id), { method: 'PATCH', body });
        if (r) Object.assign(e0, { start: r.start, end: r.end });
      } else {
        const x = d.it.x;
        const b = x.allDay ? { allDay: true, date: dayKey(addDays(new Date(x.date + 'T00:00'), n)), endDate: dayKey(addDays(new Date(x.endDate + 'T00:00'), n)) } : { allDay: false, start: +addDays(new Date(x.start), n), end: +addDays(new Date(x.end), n), tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
        await rapi('/timetree/update', { method: 'POST', body: Object.assign({ cal: x.calId, uuid: x.uuid, title: x.title, location: x.location || '', note: x.note || '' }, b) });
        Object.assign(x, b);
      }
    };
    try {
      await move(delta); state.agCache = null; renderAgenda();
      toast('« ' + (d.it.kind === 'ev' ? d.it.ev.summary || 'Événement' : d.it.x.title) + ' » déplacé au ' + new Date(to + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' }), { label: 'Annuler', run: async () => { try { await move(-delta); state.agCache = null; renderAgenda(); toast('Remis à sa place'); } catch (er) { toast('Annulation impossible : ' + er.message); } } });
    } catch (er) { if (er.message !== 'auth') toast('Déplacement impossible : ' + er.message); }
  });
  box.addEventListener('touchcancel', end);
  box.addEventListener('contextmenu', e => { if (e.target.closest('.chip-ev')) e.preventDefault(); });
}
function bindAgendaSwipe(box, evs, items) {
  let sx = 0, sy = 0, cur = null, lock = null, dx = 0, open = null, bgNow = null;
  const mkBg = el => { const bg = document.createElement('button'); bg.type = 'button'; bg.className = 'ev-del'; bg.innerHTML = ICON.trash + '<small>Supprimer</small>'; bg.style.top = el.offsetTop + 'px'; bg.style.height = el.offsetHeight + 'px'; el.parentNode.insertBefore(bg, el); return bg; };
  const close = () => { if (!open) return; const o = open; open = null; o.el.style.transition = 'transform .2s'; o.el.style.transform = ''; setTimeout(() => { o.el.style.transition = ''; o.bg.remove(); }, 220); };
  const del = async (el) => {
    let ok = false;
    if (el.dataset.ev) {
      const e = evs.find(x => x.id === el.dataset.ev); if (!e) return;
      try { await gx('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(e.id), { method: 'DELETE' }); ok = true; toast('« ' + (e.summary || 'Événement') + ' » supprimé'); }
      catch (er) { if (er.message !== 'auth') toast('Échec : ' + er.message); }
    } else if (el.dataset.tt) {
      const it = items.find(i => i.kind === 'tt' && i.x.id === el.dataset.tt); if (!it) return; const x = it.x;
      if (x.recurring && !confirm('« ' + x.title + ' » se répète : TOUTES les occurrences seront supprimées de TimeTree, pour tous les membres. Continuer ?')) { close(); return; }
      try { await rapi('/timetree/delete', { method: 'POST', body: { cal: x.calId, uuid: x.uuid } }); ok = true; toast('« ' + x.title + ' » supprimé de TimeTree'); }
      catch (er) { toast(er.message); }
    }
    if (ok) { state.agCache = null; renderAgenda(); } else close();
  };
  box.addEventListener('touchstart', e => {
    const el = e.target.closest('button.ev'); 
    if (open && !e.target.closest('.ev-del')) { const same = el === open.el; close(); if (same) { cur = null; box.dataset.skip = '1'; return; } }
    if (!el || (!el.dataset.ev && !el.dataset.tt)) { cur = null; return; }
    cur = el; sx = e.touches[0].clientX; sy = e.touches[0].clientY; lock = null; dx = 0;
  }, { passive: true });
  box.addEventListener('touchmove', e => {
    if (!cur) return;
    const mx = e.touches[0].clientX - sx, my = e.touches[0].clientY - sy;
    if (!lock && (Math.abs(mx) > 10 || Math.abs(my) > 10)) lock = Math.abs(mx) > Math.abs(my) * 1.3 ? 'h' : 'v';
    if (lock !== 'h') return;
    e.preventDefault();
    dx = Math.min(0, Math.max(-box.clientWidth, mx));
    // le bouton rouge apparaît dès que l'on glisse, et s'élargit au-delà du seuil de suppression directe
    if (!bgNow) bgNow = mkBg(cur);
    bgNow.style.width = Math.max(92, -dx) + 'px';
    bgNow.classList.toggle('full', dx < -box.clientWidth * 0.6);
    cur.style.transform = 'translateX(' + dx + 'px)';
  }, { passive: false });
  box.addEventListener('touchend', () => {
    if (!cur || lock !== 'h') { cur = null; return; }
    const el = cur; cur = null; box.dataset.skip = '1';
    const bg = bgNow || mkBg(el); bgNow = null;
    if (dx < -box.clientWidth * 0.6) { el.style.transition = 'transform .2s'; el.style.transform = 'translateX(-100%)'; del(el); return; }
    if (dx < -50) {
      bg.style.transition = 'width .2s'; bg.style.width = '92px';
      el.style.transition = 'transform .2s'; el.style.transform = 'translateX(-92px)'; setTimeout(() => { el.style.transition = ''; }, 220);
      bg.onclick = ev => { ev.stopPropagation(); bg.disabled = true; del(el); };
      open = { el, bg };
      return;
    }
    el.style.transition = 'transform .2s'; el.style.transform = ''; setTimeout(() => { el.style.transition = ''; bg.remove(); }, 220);
  });
  // un glissement ne doit pas ouvrir la fiche de l'événement
  box.addEventListener('click', e => { if (box.dataset.skip) { delete box.dataset.skip; if (!e.target.closest('.ev-del')) { e.stopPropagation(); e.preventDefault(); } } }, true);
  window.addEventListener('scroll', close, { passive: true, once: true });
}
// Lieu : texte (adresse) ou lien Maps collé (Google Maps, Plans, Waze)
const isMapUrl = l => /^https?:\/\/\S+$/i.test(String(l || '').trim());
const mapUrl = l => isMapUrl(l) ? String(l).trim() : 'https://maps.apple.com/?q=' + encodeURIComponent(l);
const locChip = l => `<span class="loc-chip" data-map="${esc(l)}">📍 ${isMapUrl(l) ? 'Itinéraire' : esc(l)}</span>`;
// lien Maps glissé dans une note : on le retrouve pour en faire un bouton « Itinéraire »
const MAP_HOST_RE = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.apple\.com|(www\.)?waze\.com)/i;
const mapLinkIn = t => (String(t || '').match(/https?:\/\/[^\s<>"']+/gi) || []).find(u => MAP_HOST_RE.test(u)) || '';
// texte de note avec liens cliquables (les liens Maps ouvrent Plans / Google Maps)
const noteLinks = t => esc(t).replace(/https?:\/\/[^\s<>"']+/gi, u => { const raw = u.replace(/&amp;/g, '&'); return MAP_HOST_RE.test(raw) ? `<span class="loc-chip" data-map="${u}">📍 Itinéraire</span>` : `<a href="${u}" target="_blank" rel="noopener" class="linkish">${u.length > 40 ? u.slice(0, 38) + '…' : u}</a>`; });
document.addEventListener('click', e => { const m = e.target.closest && e.target.closest('[data-map]'); if (!m) return; e.preventDefault(); e.stopPropagation(); openMap(m.dataset.map); }, true);
function openMap(l) { const a = document.createElement('a'); a.href = mapUrl(l); a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
const defaultStart = d => { const x = new Date(d); const n = new Date(); if (dayKey(x) === dayKey(n)) { x.setHours(n.getHours() + 1, 0, 0, 0); } else x.setHours(9, 0, 0, 0); return x; };
const toInputDate = d => dayKey(d), toInputTime = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
// ev : événement Google existant, ou brouillon { title, start (Date), end, allDay, location, note }
function eventSheet(ev, onDone) {
  const tt = ev.ttEdit || null, isNew = !ev.id && !tt, ttRec = !!(tt && tt.recurring);
  let s, e, allDay;
  if (isNew || tt) { s = ev.start || defaultStart(new Date()); e = ev.end || new Date(s.getTime() + 3600000); allDay = !!ev.allDay; }
  else { const t = evTimes(ev); s = t.s; e = t.allDay ? addDays(t.e, -1) : t.e; allDay = t.allDay; }
  openSheet(`<span class="grip"></span><h2>${tt ? 'Modifier · <span class="tt-tag">TimeTree</span>' : isNew ? 'Nouvel événement' : 'Événement'}</h2>
    ${tt ? `<p class="fhint" style="margin:0">${esc(tt.cal)}${ttRec ? ' · événement qui se répète : seuls le titre, le lieu et la note sont modifiables ici (les dates déplaceraient toute la série)' : ''}</p>` : ''}
    <label class="f">Titre<input id="ev-title" autocomplete="off" value="${esc(isNew || tt ? ev.title || '' : ev.summary || '')}" placeholder="ex. Point avec Claire"></label>
    <label class="switch" ${ttRec ? 'style="display:none"' : ''}>Journée entière<input type="checkbox" id="ev-all" ${allDay ? 'checked' : ''}></label>
    <div class="ev-grid" ${ttRec ? 'style="display:none"' : ''}><label class="f">Date<input type="date" id="ev-d" value="${toInputDate(s)}"></label><label class="f ev-tm">Début<input type="time" id="ev-s" value="${toInputTime(s)}"></label><label class="f ev-tm">Fin<input type="time" id="ev-e" value="${toInputTime(e)}"></label></div>
    <label class="f">Lieu<input id="ev-loc" autocomplete="off" value="${esc(ev.location || '')}" placeholder="Adresse, visio ou lien Maps"></label>
    <div class="ev-locbar"><button type="button" class="linkish" id="ev-paste">📋 Coller un lien Maps</button><button type="button" class="linkish" id="ev-map">🗺 Voir sur la carte</button></div>
    <label class="f">Note<input id="ev-note" autocomplete="off" value="${esc(isNew || tt ? ev.note || '' : String(ev.description || '').replace(/<[^>]+>/g, ' '))}"></label>
    ${isNew && state.ttCals && state.ttCals.length ? `<label class="f">Enregistrer dans<select id="ev-dest"><option value="g">Google Agenda</option>${state.ttCals.map(c => `<option value="t:${esc(c.id)}">TimeTree · ${esc(c.name)}</option><option value="b:${esc(c.id)}">Google + TimeTree · ${esc(c.name)}</option>`).join('')}</select></label>` : ''}
    ${tt ? '' : (() => {
      // Options Google Agenda : répétition, rappel, invités
      const rr = ((ev.recurrence || []).find(x => /^RRULE/.test(x)) || '');
      const fq = (rr.match(/FREQ=(\w+)/) || [])[1] || '', iv = +((rr.match(/INTERVAL=(\d+)/) || [])[1] || 1);
      const rep = fq === 'WEEKLY' && iv === 2 ? 'W2' : fq ? fq : '';
      const ov = ev.reminders && !ev.reminders.useDefault ? ((ev.reminders.overrides || [])[0] || null) : undefined;
      const rem = ov === undefined ? 'd' : ov === null ? 'n' : String(ov.minutes);
      const inst = !!ev.recurringEventId;
      const guests = (ev.attendees || []).filter(a => !a.self).map(a => a.email).join(', ');
      return `<details class="ev-more" id="ev-more" ${rep || rem !== 'd' || guests ? 'open' : ''}><summary>Répétition, rappel, invités</summary>
        ${inst ? '<p class="fhint" style="margin:0">Événement qui se répète : la modification ne touche que ce jour-là.</p>' : `<label class="f">Répéter<select id="ev-rep">${[['', 'Non'], ['DAILY', 'Chaque jour'], ['WEEKLY', 'Chaque semaine'], ['W2', 'Toutes les 2 semaines'], ['MONTHLY', 'Chaque mois'], ['YEARLY', 'Chaque année']].map(([k, n]) => `<option value="${k}" ${k === rep ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="f" id="ev-until-l" ${rep ? '' : 'hidden'}>Jusqu’au (facultatif)<input type="date" id="ev-until" value="${(() => { const u = (rr.match(/UNTIL=(\d{8})/) || [])[1]; return u ? u.slice(0, 4) + '-' + u.slice(4, 6) + '-' + u.slice(6, 8) : ''; })()}"></label>`}
        <label class="f">Rappel<select id="ev-rem">${[['d', 'Par défaut de l’agenda'], ['n', 'Aucun'], ['10', '10 min avant'], ['30', '30 min avant'], ['60', '1 h avant'], ['1440', 'La veille'], ['2880', '2 jours avant']].map(([k, n]) => `<option value="${k}" ${k === rem ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="f">Invités (ils reçoivent l’invitation)<input id="ev-guests" type="text" inputmode="email" autocomplete="off" value="${esc(guests)}" placeholder="adresse@exemple.fr, …"></label>
      </details>`; })()}
    ${ev.mailUrl ? `<p class="fhint" style="margin:0">Lié au mail « ${esc(ev.mailSubject || '')} »</p>` : ''}
    <div style="display:grid;grid-template-columns:${isNew || tt ? '1fr 1fr' : '1fr 1fr 1fr'};gap:10px">${isNew || tt ? '<button class="btn" data-close>Annuler</button>' : '<button class="btn danger" id="ev-del">Supprimer</button><button class="btn" data-close>Fermer</button>'}<button class="btn primary" id="ev-ok">Enregistrer</button></div>`);
  $('#ev-paste').onclick = async () => {
    try { const t = (await navigator.clipboard.readText() || '').trim(); if (!t) { toast('Presse-papiers vide : copie d’abord le lien dans Maps (Partager › Copier)'); return; } $('#ev-loc').value = t; toast(isMapUrl(t) ? 'Lien Maps ajouté' : 'Texte collé'); }
    catch (e) { toast('Colle le lien dans le champ Lieu (appui long › Coller)'); $('#ev-loc').focus(); }
  };
  const repS = $('#ev-rep'); if (repS) repS.onchange = () => { $('#ev-until-l').hidden = !repS.value; };
  const destS = $('#ev-dest'), moreD = $('#ev-more'); if (destS && moreD) { const syncD = () => { moreD.hidden = destS.value.startsWith('t:'); }; destS.onchange = syncD; syncD(); }
  $('#ev-map').onclick = () => { const l = $('#ev-loc').value.trim(); if (!l) { toast('Indique d’abord un lieu'); return; } openMap(l); };
  const syncAll = () => $$('.ev-tm').forEach(x => { x.style.display = $('#ev-all').checked ? 'none' : ''; });
  $('#ev-all').onchange = syncAll; syncAll();
  $('#ev-s').onchange = () => { const [h, m] = $('#ev-s').value.split(':').map(Number); const dur = e - s; const ns = new Date(s); ns.setHours(h, m); const ne = new Date(ns.getTime() + (dur > 0 ? dur : 3600000)); $('#ev-e').value = toInputTime(ne); };
  $('#ev-ok').onclick = async () => {
    const title = $('#ev-title').value.trim(); if (!title) { toast('Donne un titre'); return; }
    const d = $('#ev-d').value, all = $('#ev-all').checked;
    // événement sur plusieurs jours : on garde le même écart entre le jour de début et le jour de fin
    const span = Math.max(0, Math.round((startOfDay(e) - startOfDay(s)) / 864e5));
    const dEnd = span ? dayKey(addDays(new Date(d + 'T00:00'), span)) : d;
    let start, end;
    if (all) { start = { date: d }; end = { date: dayKey(addDays(new Date(dEnd + 'T00:00'), 1)) }; }
    else {
      const sd = new Date(d + 'T' + ($('#ev-s').value || '09:00')); let ed = new Date(dEnd + 'T' + ($('#ev-e').value || $('#ev-s').value || '10:00'));
      if (ed <= sd) ed = new Date(sd.getTime() + 3600000);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      start = { dateTime: sd.toISOString(), timeZone: tz }; end = { dateTime: ed.toISOString(), timeZone: tz };
    }
    let note = $('#ev-note').value.trim();
    if (ev.mailUrl) note = (note ? note + '\n' : '') + 'Mail : ' + location.origin + location.pathname + ev.mailUrl;
    const body = { summary: title, location: $('#ev-loc').value.trim(), description: note, start, end };
    let invite = false;
    if ($('#ev-more')) {
      const rp = $('#ev-rep');
      if (rp) { if (rp.value) { const u = $('#ev-until').value; body.recurrence = ['RRULE:FREQ=' + (rp.value === 'W2' ? 'WEEKLY;INTERVAL=2' : rp.value) + (u ? ';UNTIL=' + u.replace(/-/g, '') + 'T235959Z' : '')]; } else if (!isNew && ev.recurrence) body.recurrence = []; }
      const rm = $('#ev-rem').value; body.reminders = rm === 'd' ? { useDefault: true } : { useDefault: false, overrides: rm === 'n' ? [] : [{ method: 'popup', minutes: +rm }] };
      const gs = splitAddrs($('#ev-guests').value).map(a => parseAddr(a).email.toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
      const before = (ev.attendees || []).filter(a => !a.self).map(a => a.email.toLowerCase()).sort().join(',');
      if (gs.length || before) { body.attendees = gs.map(email => Object.assign({ email }, ((ev.attendees || []).find(a => a.email.toLowerCase() === email) || {}))); const self = (ev.attendees || []).find(a => a.self); if (self) body.attendees.push(self); invite = gs.sort().join(',') !== before; }
    }
    const b = $('#ev-ok'); b.disabled = true; b.textContent = 'Enregistrement…';
    const dest = ($('#ev-dest') || {}).value || 'g', ttCal = dest.includes(':') ? dest.split(':')[1] : null;
    try {
      if (tt) {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const r = await rapi('/timetree/update', { method: 'POST', body: Object.assign({ cal: tt.calId, uuid: tt.uuid, title, location: body.location, note },
          all ? { allDay: true, date: d, endDate: dEnd } : { allDay: false, start: Date.parse(start.dateTime), end: Date.parse(end.dateTime), tz }) });
        state.agCache = null; closeSheet(); toast(r.recurring ? 'Série modifiée dans TimeTree' : 'Modifié dans TimeTree'); if (onDone) onDone(); return;
      }
      if (ttCal) {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const r = await rapi('/timetree/event', { method: 'POST', body: all ? { cal: ttCal, title, allDay: true, date: d, endDate: d, location: body.location, note } : { cal: ttCal, title, allDay: false, start: Date.parse(start.dateTime), end: Date.parse(end.dateTime), tz, location: body.location, note } });
        if (dest.startsWith('t:')) { state.agCache = null; closeSheet(); toast('Ajouté dans TimeTree · ' + r.cal); if (onDone) onDone(); return; }
      }
      const su = invite || (body.attendees && body.attendees.length) ? '?sendUpdates=all' : '';
      if (isNew) await gx('https://www.googleapis.com/calendar/v3/calendars/primary/events' + su, { method: 'POST', body });
      else await gx('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(ev.id) + su, { method: 'PATCH', body });
      if (invite) toast('Invitation envoyée');
      state.agCache = null; closeSheet();
      toast('Ajouté à ton agenda · ' + new Date(all ? d + 'T00:00' : start.dateTime).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));
      if (onDone) onDone();
    } catch (er) { b.disabled = false; b.textContent = 'Enregistrer'; if (er.message === 'auth') return; if (er.kind) { closeSheet(); openSheet('<span class="grip"></span>' + googleHelp(er, 'Agenda') + '<button class="btn" data-close>Fermer</button>'); bindHelp(); } else toast('Échec : ' + er.message); }
  };
  const del = $('#ev-del'); if (del) del.onclick = async () => {
    if (!confirm('Supprimer « ' + (ev.summary || 'cet événement') + ' » de ton agenda ?')) return;
    try { await gx('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(ev.id), { method: 'DELETE' }); state.agCache = null; closeSheet(); toast('Événement supprimé'); if (onDone) onDone(); }
    catch (er) { if (er.message !== 'auth') toast('Échec : ' + er.message); }
  };
}
// Depuis un mail : l'IA repère le rendez-vous et pré-remplit l'événement
async function eventFromMail(ctx, btn) {
  const draft = { title: ctx.subject || '', mailUrl: ctx.url, mailSubject: ctx.subject, note: ctx.from ? 'Avec ' + ctx.from : '' };
  if (settings.ai && relayOn()) {
    const old = btn.lastChild.textContent; btn.lastChild.textContent = 'Analyse…';
    try {
      const r = await rapi('/ai/event', { method: 'POST', body: { subject: ctx.subject, from: ctx.from, text: ctx.text, today: today() } });
      if (r.found && r.start) {
        const s = new Date(r.start); if (!isNaN(s)) { draft.start = s; draft.allDay = !!r.allDay; if (r.end) { const e = new Date(r.end); if (!isNaN(e) && e > s) draft.end = e; } }
        if (r.title) draft.title = r.title; if (r.location) draft.location = r.location; if (r.note) draft.note = r.note + (ctx.from ? ' · ' + ctx.from : '');
      } else toast('Pas de date trouvée dans ce mail : complète l’événement');
    } catch (e) { toast('IA indisponible : complète l’événement'); }
    btn.lastChild.textContent = old;
  }
  eventSheet(draft, null);
}
// « Trouvé dans tes mails » : rendez-vous proposés dans les mails récents de la réception
async function agendaSuggestions() {
  const box = $('#ag-sug'); if (!box || !settings.ai || !relayOn()) return;
  const scan = LS.get('evScan', {});
  const lists = Object.entries(state.lists).filter(([k]) => /(^|\|)INBOX$/.test(k)).map(([, d]) => d.items);
  const cached = LS.get('list:' + (freeOn() ? 'all|' : '') + 'INBOX', null);
  const items = [].concat(...lists, cached && cached.items ? cached.items : []);
  const seen = new Set(), RE = /\b(rdv|rendez|réunion|reunion|point |visio|déjeuner|dejeuner|dîner|diner|meeting|rencontre|disponibilit|créneau|creneau|invitation|\d{1,2} ?h ?\d{0,2})\b/i;
  const cand = items.filter(i => i && !seen.has(i.id) && seen.add(i.id) && Date.now() - i.date < 10 * 864e5 && RE.test(i.subject + ' ' + i.snippet) && !i.mine);
  for (const i of cand.filter(i => !(i.id in scan)).slice(0, 3)) {
    try { const r = await rapi('/ai/event', { method: 'POST', body: { subject: i.subject, from: i.from, text: i.snippet, today: today() } }); scan[i.id] = r.found && r.start ? { r, subject: i.subject, from: i.from, url: i.acc === 'free' ? '#/free/' + encodeURIComponent(i.folder) + '/' + i.uid : '#/thread/' + encodeURIComponent(i.id) } : 0; }
    catch (e) { break; }
  }
  const keys = Object.keys(scan); if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(k => delete scan[k]);
  LS.set('evScan', scan);
  const sug = Object.entries(scan).filter(([, x]) => x && !x.done && new Date(x.r.start) > Date.now() - 3600000).slice(0, 2);
  if (!$('#ag-sug')) return;
  box.innerHTML = sug.map(([id, x]) => `<div class="sugg" data-s="${esc(id)}"><div class="sugg-h">✦ Trouvé dans tes mails</div><b>${esc(x.r.title || x.subject)} · ${esc(new Date(x.r.start).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}${x.r.allDay ? '' : ' à ' + esc(hhmm(new Date(x.r.start)))}</b><small>${esc(x.from)} · « ${esc(x.subject)} »</small><div><button class="btn primary" data-add>Ajouter à l’agenda</button><button class="btn" data-ign>Ignorer</button></div></div>`).join('');
  $$('.sugg', box).forEach(c => {
    const id = c.dataset.s, x = scan[id];
    $('[data-ign]', c).onclick = () => { const sc = LS.get('evScan', {}); if (sc[id]) sc[id].done = true; LS.set('evScan', sc); c.remove(); };
    $('[data-add]', c).onclick = () => {
      const s = new Date(x.r.start), e = x.r.end ? new Date(x.r.end) : null;
      eventSheet({ title: x.r.title || x.subject, start: s, end: e && e > s ? e : null, allDay: !!x.r.allDay, location: x.r.location || '', note: (x.r.note || '') + ' · ' + x.from, mailUrl: x.url, mailSubject: x.subject }, () => { const sc = LS.get('evScan', {}); if (sc[id]) sc[id].done = true; LS.set('evScan', sc); renderAgenda(); });
    };
  });
}
/* ---------- Anniversaires : liste sur le serveur, rappel le jour J à 07:30 ---------- */
const deName = n => (/^[aeiouyhàâéèêëîïôöûü]/i.test(n) ? 'd’' : 'de ') + n;
const BD_KIND = { anniv: 'Anniversaire', mariage: 'Anniversaire de mariage', autre: 'Date à fêter' };
async function bdLoad(force) {
  const c = LS.get('bdays', null);
  if (!force && c && Date.now() - c.at < 300000) return c.list;
  if (!relayOn()) return c ? c.list : [];
  try { const r = await rapi('/bdays'); LS.set('bdays', { at: Date.now(), list: r.list || [] }); return r.list || []; } catch (e) { return c ? c.list : []; }
}
// Occurrences entre deux dates (le 29 février tombe le 28 les autres années)
function bdOccur(list, from, to) {
  const out = [];
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) list.forEach(b => {
    let [m, d] = b.date.split('-').map(Number);
    if (m === 2 && d === 29 && !((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) d = 28;
    const s = new Date(y, m - 1, d);
    if (s >= from && s < to) out.push({ kind: 'bd', b, s, e: addDays(s, 1), allDay: true, age: b.year ? y - b.year : 0 });
  });
  return out.sort((a, b) => a.s - b.s);
}
const bdText = o => (o.b.type === 'mariage' ? 'Mariage · ' : o.b.type === 'autre' ? '' : '') + (o.age ? (o.b.type === 'mariage' ? o.age + ' ans de mariage' : o.age + ' ans') : '');
const daysTo = d => Math.round((startOfDay(d) - startOfDay(new Date())) / 864e5);
// Bandeau des 7 prochains jours (agenda)
function bdBanner(list) {
  const t = startOfDay(new Date()), up = bdOccur(list, t, addDays(t, 8));
  if (!up.length) return '';
  const today = up.filter(o => daysTo(o.s) === 0), next = up.filter(o => daysTo(o.s) > 0).slice(0, 4);
  const short = o => esc(o.b.name.split(' ')[0]) + ' ' + esc(o.s.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }).replace('.', ''));
  return `<a class="bd-banner" href="#/bdays"><span class="bd-ic">🎂</span><span class="bd-tx">${today.length ? '<b>Auj. ' + today.map(o => esc(o.b.name)).join(', ') + '</b>' : ''}${next.length ? `<small>${today.length ? ' · ' : ''}${next.map(short).join(' · ')}</small>` : ''}</span><span class="chev-r" aria-hidden="true"></span></a>`;
}
async function renderBdays() {
  const v = $('#view');
  v.innerHTML = `<div class="top"><a class="back" href="#/agenda">${ICON.back}Agenda</a><button class="icon-btn" id="bd-add" aria-label="Ajouter un anniversaire">${ICON.plus}</button></div><h1 class="thread-title">🎂 Anniversaires</h1>
    <p class="fhint">Rappel le jour J à 07:30. Toucher une ligne pour modifier ou supprimer.</p><input type="search" id="bd-q" class="blk-q" placeholder="Rechercher" autocomplete="off"><div id="bd-list"><div class="loading">Chargement…</div></div>
    <button class="btn" id="bd-imp" style="width:100%;margin-top:14px">Importer une liste</button>`;
  $('#bd-add').onclick = () => bdSheet(null);
  $('#bd-imp').onclick = bdImportSheet;
  const list = await bdLoad(true), box = $('#bd-list');
  const t = startOfDay(new Date()), occ = bdOccur(list, t, addDays(t, 366)).filter((o, i, a) => a.findIndex(x => x.b.id === o.b.id) === i);
  const draw = () => {
    const q = ($('#bd-q').value || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const rows = occ.filter(o => !q || o.b.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
    if (!list.length) { box.innerHTML = '<div class="empty">Aucun anniversaire. Ajoute-les avec + ou importe une liste.</div>'; return; }
    let h = '', grp = '';
    rows.forEach(o => {
      const n = daysTo(o.s), g = n === 0 ? 'Aujourd’hui' : n <= 7 ? 'Cette semaine' : o.s.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      if (g !== grp) { h += (grp ? '</div>' : '') + `<h2 class="sec">${esc(g)}</h2><div class="card bd-card">`; grp = g; }
      h += `<div class="bd-wrap"><button type="button" class="bd-del" data-del="${esc(o.b.id)}">${ICON.trash}<small>Supprimer</small></button><button class="bd-row ${n === 0 ? 'today' : ''}" data-bd="${esc(o.b.id)}"><span class="av">${esc(initials(o.b.name))}</span><span class="bd-t"><b>${esc(o.b.name)}</b><small>${[o.b.type === 'mariage' ? 'Mariage' : '', o.age ? (o.b.type === 'mariage' ? o.age + ' ans de mariage' : 'Aura ' + o.age + ' ans') : '', o.s.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })].filter(Boolean).map(esc).join(' · ')}</small></span><span class="bd-n">${n === 0 ? '🎉' : n + ' j'}</span></button></div>`;
    });
    box.innerHTML = (h ? h + '</div>' : '<p class="fhint">Aucun résultat.</p>') + `<p class="fhint" style="text-align:center">${list.length} date${list.length > 1 ? 's' : ''} enregistrée${list.length > 1 ? 's' : ''}</p>`;
    $$('[data-bd]', box).forEach(b => b.onclick = () => { if (b.dataset.open) { bdClose(b); return; } bdSheet(list.find(x => x.id === b.dataset.bd)); });
    // glisser vers la gauche : bouton Supprimer (annulable)
    $$('.bd-row', box).forEach(row => {
      let x0 = 0, y0 = 0, dx = 0, on = false;
      row.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; on = null; $$('.bd-row[data-open]', box).forEach(r => r !== row && bdClose(r)); }, { passive: true });
      row.addEventListener('touchmove', e => {
        const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
        if (on === null) on = Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my);
        if (!on) return;
        dx = Math.max(-110, Math.min(0, mx + (row.dataset.open ? -96 : 0))); row.style.transition = 'none'; row.style.transform = `translateX(${dx}px)`;
      }, { passive: true });
      row.addEventListener('touchend', () => { if (!on) return; row.style.transition = ''; if (dx < -45) { row.style.transform = 'translateX(-96px)'; row.dataset.open = 1; } else bdClose(row); });
    });
    $$('[data-del]', box).forEach(b => b.onclick = async () => {
      const it = list.find(x => x.id === b.dataset.del); if (!it) return;
      try {
        await rapi('/bdays/delete', { method: 'POST', body: { id: it.id } });
        list.splice(list.indexOf(it), 1); occ.splice(occ.findIndex(o => o.b.id === it.id), 1); LS.del('bdays'); draw();
        undoToast(it.name + ' supprimé', async () => { const c = Object.assign({}, it); delete c.id; await rapi('/bdays', { method: 'POST', body: c }); LS.del('bdays'); });
      } catch (e) { toast(e.message); }
    });
  };
  const bdClose = r => { r.style.transition = ''; r.style.transform = ''; delete r.dataset.open; };
  $('#bd-q').oninput = draw; draw();
}
function bdSheet(b) {
  b = b || { name: '', date: '', year: 0, type: 'anniv', extra: 0, email: '' };
  const [m0, d0] = b.date ? b.date.split('-').map(Number) : [new Date().getMonth() + 1, new Date().getDate()];
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  openSheet(`<span class="grip"></span><h2>${b.id ? 'Modifier' : 'Nouvel anniversaire'}</h2>
    <input id="bs-name" placeholder="Nom et prénom" value="${esc(b.name)}" autocomplete="off">
    <div class="seg" id="bs-type">${Object.entries({ anniv: 'Anniversaire', mariage: 'Mariage', autre: 'Autre' }).map(([k, n]) => `<button type="button" data-t="${k}" class="${b.type === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div style="display:grid;grid-template-columns:1fr 1.6fr 1.2fr;gap:8px"><select id="bs-d">${[...Array(31)].map((_, i) => `<option ${i + 1 === d0 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select><select id="bs-m">${months.map((x, i) => `<option value="${i + 1}" ${i + 1 === m0 ? 'selected' : ''}>${x}</option>`).join('')}</select><input id="bs-y" inputmode="numeric" placeholder="Année" value="${b.year || ''}"></div>
    <label class="fhint" style="margin:0">Rappel le jour J à 07:30, et en plus :</label>
    <select id="bs-x"><option value="0" ${!b.extra ? 'selected' : ''}>Rien d’autre</option><option value="1" ${b.extra === 1 ? 'selected' : ''}>La veille à 07:30</option><option value="7" ${b.extra === 7 ? 'selected' : ''}>Une semaine avant</option></select>
    <input id="bs-mail" type="email" inputmode="email" placeholder="Adresse mail (facultatif, pour lui écrire)" value="${esc(b.email || '')}" autocomplete="off">
    <button class="btn primary" id="bs-ok">Enregistrer</button>
    ${b.id ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${b.email ? '<button class="btn" id="bs-write">Lui écrire</button>' : '<span></span>'}<button class="btn danger" id="bs-del">Supprimer</button></div>` : ''}
    <button class="btn" data-close>Annuler</button>`);
  let type = b.type;
  $$('#bs-type button').forEach(x => x.onclick = () => { type = x.dataset.t; $$('#bs-type button').forEach(y => y.classList.toggle('on', y === x)); });
  const done = () => { LS.del('bdays'); state.agCache = null; closeSheet(); (location.hash || '').startsWith('#/bdays') ? renderBdays() : renderAgenda(); };
  $('#bs-ok').onclick = async () => {
    const name = $('#bs-name').value.trim(); if (!name) { toast('Indique un nom'); return; }
    try { await rapi('/bdays', { method: 'POST', body: { id: b.id, name, type, date: $('#bs-m').value + '-' + $('#bs-d').value, year: +$('#bs-y').value || 0, extra: +$('#bs-x').value, email: $('#bs-mail').value.trim() } }); toast('Enregistré'); done(); } catch (e) { toast(e.message); }
  };
  const del = $('#bs-del'); if (del) del.onclick = async () => { if (!confirm('Supprimer ' + b.name + ' ?')) return; try { await rapi('/bdays/delete', { method: 'POST', body: { id: b.id } }); toast('Supprimé'); done(); } catch (e) { toast(e.message); } };
  const wr = $('#bs-write'); if (wr) wr.onclick = () => { closeSheet(); location.hash = '#/compose?' + new URLSearchParams({ to: b.email, subject: 'Joyeux anniversaire !' }); };
}
function bdImportSheet() {
  openSheet(`<span class="grip"></span><h2>Importer une liste</h2><p class="fhint" style="margin:0">Une date par ligne : <b>24/11 Olivier Henot</b>, avec l’année si tu la connais (<b>17/02/1961 Laurence Morieux</b>), et « mariage » à la fin pour un anniversaire de mariage. Les doublons sont ignorés.</p>
    <textarea id="bi-t" rows="10" placeholder="24/11 Olivier Henot"></textarea><button class="btn primary" id="bi-ok">Importer</button><button class="btn" data-close>Annuler</button>`);
  $('#bi-ok').onclick = async () => { try { const o = await rapi('/bdays/import', { method: 'POST', body: { text: $('#bi-t').value } }); toast(o.added + ' ajouté(s) sur ' + o.read + ' ligne(s) lue(s)'); LS.del('bdays'); closeSheet(); renderBdays(); } catch (e) { toast(e.message); } };
}
