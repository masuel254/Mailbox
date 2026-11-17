/* Mail lisible : client Gmail PWA. Aucun identifiant n'est stocké dans ce code. */
'use strict';

const APP_VERSION = '1.5.1';
const APP_DATE = '17/11/2026';

const SCOPE = 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.settings.basic';
const BLOCK_LABEL = 'Indésirables';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me/';
const PAGE = 25;

/* ---------- Stockage local (sur l'iPhone uniquement) ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('ml.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ml.' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('ml.' + k); } catch (e) {} }
};
const settings = Object.assign({ clientId: '', fontSize: 18, theme: 'auto', images: true, readable: true, email: '' }, LS.get('settings', {}));
function saveSettings() { LS.set('settings', settings); applySettings(); }
function applySettings() {
  const r = document.documentElement;
  r.style.setProperty('--fs', settings.fontSize + 'px');
  r.dataset.theme = settings.theme;
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]').setAttribute('content', dark ? '#121417' : '#F4F5F7');
}

/* ---------- Outils ---------- */
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const decodeEntities = s => { const t = document.createElement('textarea'); t.innerHTML = s || ''; return t.value; };
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600); }
const ICON = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13"/></svg>',
  tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>',
  unread: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  starOn: '<svg viewBox="0 0 24 24" aria-hidden="true" style="fill:currentColor"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  clip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12l3 3 5-6"/></svg>',
  read: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9l9-6 9 6v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 9l9 6 9-6"/></svg>',
  block: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z"/></svg>'
};

/* ---------- Connexion Google (OAuth, sans mot de passe dans l'appli) ---------- */
function redirectUri() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
const auth = {
  token() { const t = LS.get('token', null); return t && t.exp > Date.now() + 60000 ? t.v : null; },
  login() {
    if (!settings.clientId) { location.hash = '#/settings'; toast('Renseigne d’abord l’identifiant Google dans Réglages'); return; }
    const st = Math.random().toString(36).slice(2) + Date.now().toString(36);
    LS.set('oauthState', st);
    const h = location.hash;
    LS.set('returnTo', h.startsWith('#/') && !h.startsWith('#/settings') ? h : '#/list/INBOX');
    const p = new URLSearchParams({ client_id: settings.clientId, redirect_uri: redirectUri(), response_type: 'token', scope: SCOPE, include_granted_scopes: 'true', state: st });
    if (settings.email) p.set('login_hint', settings.email);
    location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
  },
  handleRedirect() {
    const h = location.hash;
    if (!/access_token=|error=/.test(h)) return false;
    const p = new URLSearchParams(h.slice(1));
    const ret = LS.get('returnTo', '#/list/INBOX');
    if (p.get('error')) toast('Connexion refusée : ' + p.get('error'));
    else if (p.get('state') !== LS.get('oauthState', '')) toast('Connexion invalide, réessaie');
    else LS.set('token', { v: p.get('access_token'), scope: p.get('scope') || '', exp: Date.now() + (parseInt(p.get('expires_in'), 10) || 3600) * 1000 });
    LS.del('oauthState');
    history.replaceState(null, '', location.pathname + ret);
    return true;
  },
  hasSettingsScope() { const t = LS.get('token', null); return !!(t && /gmail\.settings\.basic/.test(t.scope || '')); },
  logout() {
    const t = LS.get('token', null);
    LS.del('token');
    if (t) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t.v), { method: 'POST' }).catch(() => {});
  }
};

/* ---------- API Gmail ---------- */
async function api(path, opt) {
  opt = opt || {};
  const t = auth.token();
  if (!t) { auth.login(); throw new Error('auth'); }
  const r = await fetch(API + path, {
    method: opt.method || 'GET',
    headers: Object.assign({ Authorization: 'Bearer ' + t }, opt.body ? { 'Content-Type': 'application/json' } : {}),
    body: opt.body ? JSON.stringify(opt.body) : undefined
  });
  if (r.status === 401) { LS.del('token'); auth.login(); throw new Error('auth'); }
  if (!r.ok) { let m = 'Erreur ' + r.status; try { m = (await r.json()).error.message; } catch (e) {} if (r.status === 403 && /scope/i.test(m)) m = 'scope'; throw new Error(m); }
  return r.status === 204 ? null : r.json().catch(() => null);
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { if (e.message === 'auth') throw e; out[k] = null; } }
  }));
  return out;
}

/* ---------- Libellés ---------- */
const SYSTEM = {
  INBOX: { name: 'Réception', ids: ['INBOX'] },
  UNREAD: { name: 'Non lus', ids: ['INBOX', 'UNREAD'] },
  SENT: { name: 'Envoyés', ids: ['SENT'], plain: true },
  STARRED: { name: 'Suivis', ids: ['STARRED'] },
  IMPORTANT: { name: 'Importants', ids: ['IMPORTANT'] },
  DRAFT: { name: 'Brouillons', ids: ['DRAFT'], plain: true },
  ALL: { name: 'Tous les messages', ids: [] },
  SPAM: { name: 'Spam', ids: ['SPAM'], spamTrash: true },
  TRASH: { name: 'Corbeille', ids: ['TRASH'], spamTrash: true, plain: true }
};
let labelsCache = null;
async function getLabels(force) {
  if (labelsCache && !force) return labelsCache;
  const r = await api('labels');
  labelsCache = (r.labels || []).filter(l => l.type === 'user').sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return labelsCache;
}
const labelById = id => (labelsCache || []).find(l => l.id === id);
const labelColor = l => (l && l.color && l.color.backgroundColor) || '#8E959F';

/* ---------- En-têtes et adresses ---------- */
const hdr = (m, n) => { const h = ((m.payload && m.payload.headers) || []).find(x => x.name.toLowerCase() === n.toLowerCase()); return h ? h.value : ''; };
const partHdr = (p, n) => { const h = (p.headers || []).find(x => x.name.toLowerCase() === n.toLowerCase()); return h ? h.value : ''; };
function parseAddr(s) {
  s = (s || '').trim();
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (m) return { name: m[1].trim() || m[2].trim(), email: m[2].trim() };
  return { name: s, email: s };
}
function splitAddrs(s) {
  const out = []; let cur = '', q = false, a = false;
  for (const c of s || '') {
    if (c === '"') q = !q;
    if (c === '<') a = true;
    if (c === '>') a = false;
    if ((c === ',' || c === ';') && !q && !a) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const isMe = email => settings.email && email.toLowerCase() === settings.email.toLowerCase();
const shortName = a => isMe(a.email) ? 'moi' : (a.name.split(/\s+/)[0].length > 1 && a.name !== a.email ? a.name : a.email);
function initials(name) { const p = name.replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/); return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase(); }
function fmtDate(ms, long) {
  const d = new Date(ms), n = new Date();
  const same = (a, b) => a.toDateString() === b.toDateString();
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (long) return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() !== n.getFullYear() ? 'numeric' : undefined }) + ' à ' + hm;
  if (same(d, n)) return hm;
  const y = new Date(n); y.setDate(n.getDate() - 1);
  if (same(d, y)) return 'Hier';
  if (n - d < 6 * 864e5) return d.toLocaleDateString('fr-FR', { weekday: 'short' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() !== n.getFullYear() ? 'numeric' : undefined });
}
const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' Mo' : Math.max(1, Math.round(b / 1024)) + ' Ko';

/* ---------- Base64 ---------- */
function b64ToBytes(s) { const bin = atob((s || '').replace(/-/g, '+').replace(/_/g, '/')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function decodeText(data, charset) {
  const bytes = b64ToBytes(data);
  try { return new TextDecoder((charset || 'utf-8').toLowerCase()).decode(bytes); } catch (e) { return new TextDecoder('utf-8').decode(bytes); }
}
function bytesToB64(bytes) { let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); }
const utf8B64 = s => bytesToB64(new TextEncoder().encode(s));
const toUrlB64 = s => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* ---------- Routage ---------- */
const state = { lists: {}, current: null, me: null };
function route() {
  auth.handleRedirect();
  const h = location.hash || '#/list/INBOX';
  const parts = h.slice(2).split('?')[0].split('/');
  const view = parts[0];
  closeSheet();
  exitSelect(true);
  document.body.classList.toggle('no-tabbar', view === 'thread' || view === 'compose');
  $$('#tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === (view === 'list' ? (parts[1] === 'UNREAD' ? 'INBOX' : (parts[1] || 'INBOX')) : view)));
  $('#view').scrollTop = 0;
  if (!settings.clientId && view !== 'settings') return renderWelcome();
  if (view === 'thread') return renderThread(decodeURIComponent(parts[1]));
  if (view === 'compose') return renderCompose(new URLSearchParams(h.split('?')[1] || ''));
  if (view === 'labels') return renderLabels();
  if (view === 'settings') return renderSettings();
  if (view === 'search') return renderList('SEARCH', decodeURIComponent(parts.slice(1).join('/')));
  return renderList(parts[1] || 'INBOX');
}
window.addEventListener('hashchange', route);

/* ---------- Accueil (première configuration) ---------- */
function renderWelcome() {
  $('#view').innerHTML = `<div class="welcome">
    <h1>Bienvenue</h1>
    <p>Pour lire tes mails Gmail ici, l'appli a besoin d'un identifiant Google (Client ID). Il se crée une seule fois, gratuitement.</p>
    <ol>
      <li>Ouvre console.cloud.google.com et crée un projet.</li>
      <li>Active l'API Gmail.</li>
      <li>Écran de consentement : type « Externe », ajoute ton adresse Gmail comme utilisateur test.</li>
      <li>Identifiants › Créer › ID client OAuth › Application Web.</li>
      <li>Origine JavaScript : <code>${esc(location.origin)}</code></li>
      <li>URI de redirection : <code>${esc(redirectUri())}</code></li>
      <li>Copie l'ID client et colle-le dans Réglages.</li>
    </ol>
    <a class="btn primary" href="#/settings">Aller aux Réglages</a>
  </div>`;
}

/* ---------- Liste des conversations ---------- */
async function renderList(key, q) {
  const v = $('#view');
  const isSearch = key === 'SEARCH';
  const sys = SYSTEM[key];
  let title = isSearch ? 'Recherche' : sys ? sys.name : 'Libellé';
  if (!sys && !isSearch) { try { await getLabels(); const l = labelById(key); if (l) title = l.name; } catch (e) { if (e.message === 'auth') return; } }
  const plain = !!(sys && sys.plain);
  const cacheKey = isSearch ? 'S:' + q : key;
  state.current = cacheKey;
  v.innerHTML = `
    <div class="top">
      <h1>${esc(key === 'INBOX' ? 'Réception' : title)}</h1>
      <button class="icon-btn" id="btn-select" aria-label="Sélectionner plusieurs mails">${ICON.check}</button>
      <button class="icon-btn" id="btn-search" aria-label="Rechercher">${ICON.search}</button>
      <button class="icon-btn" id="btn-refresh" aria-label="Actualiser">${ICON.refresh}</button>
    </div>
    <form class="searchbar" id="searchbar" ${isSearch ? '' : 'hidden'}><input type="search" id="q" placeholder="Rechercher (ex. from:claire facture)" value="${esc(q || '')}" enterkeyhint="search" autocomplete="off"></form>
    ${key === 'INBOX' || key === 'UNREAD' ? `<nav class="accounts filters" aria-label="Filtre">
      <a href="#/list/INBOX" class="${key === 'INBOX' ? 'on' : ''}" ${key === 'INBOX' ? 'aria-current="page"' : ''}>Tous</a>
      <a href="#/list/UNREAD" class="${key === 'UNREAD' ? 'on' : ''}" ${key === 'UNREAD' ? 'aria-current="page"' : ''}>Non lus<span class="fcount" id="fcount"></span></a>
    </nav>` : ''}
    <div id="list"><div class="loading">Chargement…</div></div>`;
  $('#btn-search').onclick = () => { const s = $('#searchbar'); s.hidden = !s.hidden; if (!s.hidden) $('#q').focus(); };
  $('#searchbar').onsubmit = e => { e.preventDefault(); const val = $('#q').value.trim(); if (val) location.hash = '#/search/' + encodeURIComponent(val); $('#q').blur(); };
  $('#btn-refresh').onclick = () => loadList(key, q, cacheKey, plain, true);
  $('#btn-select').onclick = () => state.sel ? exitSelect() : enterSelect();
  state.listCtx = { key, q, cacheKey, plain };
  bindListGestures($('#list'));
  const cached = state.lists[cacheKey];
  if (cached) { drawList(cached, plain); if (Date.now() - cached.at > 60000) loadList(key, q, cacheKey, plain, true); }
  else loadList(key, q, cacheKey, plain, true);
}

async function loadList(key, q, cacheKey, plain, reset) {
  const sys = SYSTEM[key];
  const prev = state.lists[cacheKey];
  const p = new URLSearchParams({ maxResults: PAGE });
  if (key === 'SEARCH') p.set('q', q);
  else (sys ? sys.ids : [key]).forEach(id => p.append('labelIds', id));
  if (sys && sys.spamTrash) p.set('includeSpamTrash', 'true');
  if (!reset && prev && prev.next) p.set('pageToken', prev.next);
  try {
    const [r] = await Promise.all([api('threads?' + p.toString()), getLabels().catch(() => [])]);
    const threads = await pool(r.threads || [], 8, t => api('threads/' + t.id + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date'));
    const items = threads.filter(Boolean).map(summarize);
    const data = { at: Date.now(), next: r.nextPageToken || null, items: reset || !prev ? items : prev.items.concat(items) };
    state.lists[cacheKey] = data;
    if (state.current === cacheKey) drawList(data, plain);
    if (key === 'INBOX') updateBadge();
  } catch (e) {
    if (e.message === 'auth') return;
    const l = $('#list'); if (l && state.current === cacheKey) l.innerHTML = `<div class="empty">Impossible de charger : ${esc(e.message)}</div>`;
  }
}

function summarize(t) {
  const msgs = t.messages || [];
  const last = msgs[msgs.length - 1] || {};
  const labels = new Set(msgs.flatMap(m => m.labelIds || []));
  const froms = [];
  msgs.forEach(m => { const a = parseAddr(hdr(m, 'From')); const n = shortName(a); if (!froms.includes(n)) froms.push(n); });
  const to = splitAddrs(hdr(last, 'To')).map(parseAddr).map(shortName);
  const ext = msgs.map(m => parseAddr(hdr(m, 'From'))).filter(a => !isMe(a.email)).pop();
  return {
    id: t.id,
    subject: hdr(msgs[0] || {}, 'Subject') || '(sans objet)',
    from: froms.slice(-3).join(', '),
    fromEmail: ext ? ext.email.toLowerCase() : '',
    fromName: ext ? ext.name : '',
    to: to.join(', '),
    sentByMe: isMe(parseAddr(hdr(last, 'From')).email),
    snippet: decodeEntities(last.snippet || ''),
    date: +last.internalDate || Date.now(),
    count: msgs.length,
    unread: msgs.some(m => (m.labelIds || []).includes('UNREAD')),
    starred: labels.has('STARRED'),
    labels: [...labels].filter(id => /^Label_/.test(id))
  };
}

function itemHTML(it, cls, sentView) {
  const who = sentView && it.to ? 'À : ' + it.to : it.from;
  const chips = it.labels.map(id => { const l = labelById(id); return l ? `<span class="chip lab" style="--c:${esc(labelColor(l))}">${esc(l.name)}</span>` : ''; }).join('');
  const sel = state.sel && state.sel.has(it.id) ? ' sel' : '';
  return `<a class="item ${cls}${sel}" data-id="${esc(it.id)}" href="#/thread/${encodeURIComponent(it.id)}">
    <span class="mark" aria-hidden="true"></span>
    <span class="body">
      <span class="row1"><span class="who">${esc(who)}${it.count > 1 ? ` <span class="count">(${it.count})</span>` : ''}</span>${it.starred ? '<span class="star" aria-label="Suivi">★</span>' : ''}<span class="when">${esc(fmtDate(it.date))}</span></span>
      <span class="subj">${it.unread ? '<span class="sr">Non lu : </span>' : ''}${esc(it.subject)}</span>
      <span class="row3"><span class="snip">${esc(it.snippet)}</span><span class="chips">${chips}</span></span>
    </span></a>`;
}
function drawList(data, plain) {
  const l = $('#list'); if (!l) return;
  if (!data.items.length) { l.innerHTML = '<div class="empty">Aucun message ici.</div>'; return; }
  const unread = data.items.filter(i => i.unread), read = data.items.filter(i => !i.unread);
  let h = '';
  if (unread.length) h += `<h2 class="sec unread">Non lus · ${unread.length}</h2>` + unread.map(i => itemHTML(i, 'u')).join('');
  if (read.length) h += (unread.length ? '<h2 class="sec">Déjà lus</h2>' : '') + read.map(i => itemHTML(i, plain ? 'plain' : '', state.current === 'SENT')).join('');
  if (data.next) h += '<button class="more" id="more">Afficher plus</button>';
  l.innerHTML = h;
  const m = $('#more');
  if (m) m.onclick = () => { m.disabled = true; m.textContent = 'Chargement…'; const key = state.current.startsWith('S:') ? 'SEARCH' : state.current; loadList(key, state.current.startsWith('S:') ? state.current.slice(2) : null, state.current, plain, false); };
}
function patchCached(id, fn) { Object.values(state.lists).forEach(d => { d.items = d.items.map(i => i.id === id ? fn(i) : i).filter(Boolean); }); }

async function updateBadge() {
  try {
    const l = await api('labels/INBOX');
    const n = l.threadsUnread || 0;
    const b = $('#badge-inbox'); b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
    const f = $('#fcount'); if (f) f.textContent = n ? '· ' + n : '';
    if (navigator.setAppBadge) { n ? navigator.setAppBadge(n).catch(() => {}) : navigator.clearAppBadge().catch(() => {}); }
  } catch (e) {}
}


/* ---------- Sélection multiple ---------- */
function bindListGestures(list) {
  let timer = null, longDone = false, sx = 0, sy = 0;
  list.addEventListener('touchstart', e => {
    const a = e.target.closest('a.item'); if (!a) return;
    longDone = false; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    timer = setTimeout(() => { longDone = true; if (navigator.vibrate) navigator.vibrate(15); if (!state.sel) enterSelect(); toggleSel(a); }, 480);
  }, { passive: true });
  list.addEventListener('touchmove', e => { if (timer && (Math.abs(e.touches[0].clientX - sx) > 10 || Math.abs(e.touches[0].clientY - sy) > 10)) { clearTimeout(timer); timer = null; } }, { passive: true });
  list.addEventListener('touchend', () => { clearTimeout(timer); timer = null; });
  list.addEventListener('contextmenu', e => { if (e.target.closest('a.item')) e.preventDefault(); });
  list.addEventListener('click', e => {
    const a = e.target.closest('a.item'); if (!a) return;
    if (longDone) { e.preventDefault(); longDone = false; return; }
    if (state.sel) { e.preventDefault(); toggleSel(a); }
  });
}
function enterSelect() {
  state.sel = new Set();
  document.body.classList.add('selecting');
  let bar = $('#selbar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'selbar'; document.body.appendChild(bar); }
  bar.innerHTML = `<div class="selhead"><button class="linkish" id="sel-all">Tout sélectionner</button><span id="sel-n">0 sélectionné</span><button class="linkish" id="sel-cancel">Annuler</button></div>
    <div class="selact">
      <button id="sel-read" disabled>${ICON.read}<span>Lu</span></button>
      <button id="sel-unread" disabled>${ICON.unread}<span>Non lu</span></button>
      <button id="sel-archive" disabled>${ICON.archive}<span>Archiver</span></button>
      <button id="sel-block" disabled>${ICON.block}<span>Bloquer</span></button>
      <button id="sel-trash" disabled>${ICON.trash}<span>Supprimer</span></button>
    </div>`;
  $('#sel-cancel').onclick = () => exitSelect();
  $('#sel-all').onclick = () => {
    const items = $$('#list a.item');
    const all = items.length && items.every(a => state.sel.has(a.dataset.id));
    items.forEach(a => { if (all) { state.sel.delete(a.dataset.id); a.classList.remove('sel'); } else { state.sel.add(a.dataset.id); a.classList.add('sel'); } });
    updateSelBar();
  };
  $('#sel-read').onclick = () => bulk({ removeLabelIds: ['UNREAD'] }, (i, k) => k === 'UNREAD' ? null : Object.assign({}, i, { unread: false }), 'marqué(s) comme lu(s)');
  $('#sel-unread').onclick = () => bulk({ addLabelIds: ['UNREAD'] }, i => Object.assign({}, i, { unread: true }), 'marqué(s) comme non lu(s)');
  $('#sel-archive').onclick = () => bulk({ removeLabelIds: ['INBOX'] }, (i, k) => k === 'INBOX' ? null : i, 'archivé(s)');
  $('#sel-trash').onclick = () => bulk('trash', () => null, 'placé(s) dans la corbeille');
  $('#sel-block').onclick = () => blockSheet([...state.sel]);
  const b = $('#btn-select'); if (b) b.classList.add('on');
  updateSelBar();
}
function exitSelect(silent) {
  if (!state.sel && silent) return;
  state.sel = null;
  document.body.classList.remove('selecting');
  const bar = $('#selbar'); if (bar) bar.remove();
  $$('#list a.item.sel').forEach(a => a.classList.remove('sel'));
  const b = $('#btn-select'); if (b) b.classList.remove('on');
}
function toggleSel(a) {
  const id = a.dataset.id;
  if (state.sel.has(id)) { state.sel.delete(id); a.classList.remove('sel'); } else { state.sel.add(id); a.classList.add('sel'); }
  updateSelBar();
}
function updateSelBar() {
  const n = state.sel ? state.sel.size : 0;
  const t = $('#sel-n'); if (t) t.textContent = n + (n > 1 ? ' sélectionnés' : ' sélectionné');
  $$('#selbar .selact button').forEach(b => b.disabled = !n);
}
async function bulk(body, patch, label) {
  const ids = [...state.sel];
  if (!ids.length) return;
  $$('#selbar button').forEach(b => b.disabled = true);
  let ok = 0;
  try {
    await pool(ids, 6, async id => {
      if (body === 'trash') await api('threads/' + id + '/trash', { method: 'POST' });
      else await api('threads/' + id + '/modify', { method: 'POST', body });
      ok++;
    });
  } catch (e) { if (e.message === 'auth') return; }
  const set = new Set(ids);
  Object.entries(state.lists).forEach(([k, d]) => { d.items = d.items.map(i => set.has(i.id) ? patch(i, k) : i).filter(Boolean); });
  exitSelect();
  const c = state.listCtx;
  if (c && state.lists[c.cacheKey]) drawList(state.lists[c.cacheKey], c.plain);
  toast(ok + ' mail' + (ok > 1 ? 's ' : ' ') + label + (ok < ids.length ? ' (' + (ids.length - ok) + ' en échec)' : ''));
  updateBadge();
}


/* ---------- Expéditeurs bloqués (règles Gmail) ---------- */
async function blockLabelId() {
  const labels = await getLabels(true);
  let l = labels.find(x => x.name === BLOCK_LABEL);
  if (!l) { l = await api('labels', { method: 'POST', body: { name: BLOCK_LABEL, labelListVisibility: 'labelShow', messageListVisibility: 'hide' } }); await getLabels(true); }
  return l.id;
}
function needScope() {
  openSheet(`<span class="grip"></span><h2>Autorisation supplémentaire</h2>
    <p style="margin:0;color:var(--muted);font-size:.85rem;line-height:1.5">Pour créer des règles de tri dans Gmail, l'appli a besoin d'une autorisation de plus. Google va te la demander : appuie sur Continuer puis coche la case « paramètres Gmail ».</p>
    <button class="btn primary" id="sc-ok">Autoriser</button><button class="btn" data-close>Plus tard</button>`);
  $('#sc-ok').onclick = () => { LS.del('token'); auth.login(); };
}
function blockSheet(ids) {
  if (!auth.hasSettingsScope()) return needScope();
  const all = [];
  Object.values(state.lists).forEach(d => d.items.forEach(i => { if (ids.includes(i.id) && i.fromEmail && !all.find(a => a.email === i.fromEmail)) all.push({ email: i.fromEmail, name: i.fromName }); }));
  if (!all.length) { toast('Aucun expéditeur à bloquer'); return; }
  openSheet(`<span class="grip"></span><h2>Bloquer ${all.length > 1 ? 'ces expéditeurs' : 'cet expéditeur'}</h2>
    <p style="margin:0 0 4px;color:var(--muted);font-size:.8rem;line-height:1.45">Leurs mails, actuels et futurs, iront dans « ${BLOCK_LABEL} », marqués comme lus : ni boîte de réception, ni pastille. Réglage annulable dans Réglages.</p>
    ${all.map(a => `<label class="check"><input type="checkbox" value="${esc(a.email)}" checked><span style="display:flex;flex-direction:column;min-width:0"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.name)}</b><span style="font-size:.75rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.email)}</span></span></label>`).join('')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"><button class="btn" data-close>Annuler</button><button class="btn primary" id="blk-ok">Bloquer</button></div>`);
  $('#blk-ok').onclick = async () => {
    const emails = $$('#sheet input[type=checkbox]').filter(i => i.checked).map(i => i.value);
    if (!emails.length) return closeSheet();
    $('#blk-ok').disabled = true; $('#blk-ok').textContent = 'Blocage…';
    try {
      const lab = await blockLabelId();
      const existing = (((await api('settings/filters')) || {}).filter || []).map(f => (f.criteria && f.criteria.from || '').toLowerCase());
      await pool(emails.filter(e => !existing.includes(e)), 3, e => api('settings/filters', { method: 'POST', body: { criteria: { from: e }, action: { addLabelIds: [lab], removeLabelIds: ['INBOX', 'UNREAD'] } } }));
      const set = new Set(emails);
      const tids = [];
      Object.values(state.lists).forEach(d => d.items.forEach(i => { if (set.has(i.fromEmail) && !tids.includes(i.id)) tids.push(i.id); }));
      await pool(tids, 6, id => api('threads/' + id + '/modify', { method: 'POST', body: { addLabelIds: [lab], removeLabelIds: ['INBOX', 'UNREAD'] } }));
      Object.entries(state.lists).forEach(([k, d]) => { d.items = d.items.filter(i => !set.has(i.fromEmail)); });
      closeSheet(); exitSelect();
      const c = state.listCtx; if (c && state.lists[c.cacheKey]) drawList(state.lists[c.cacheKey], c.plain);
      toast(emails.length + (emails.length > 1 ? ' expéditeurs bloqués' : ' expéditeur bloqué'));
      updateBadge();
    } catch (e) {
      closeSheet();
      if (e.message === 'scope') needScope(); else if (e.message !== 'auth') toast('Échec : ' + e.message);
    }
  };
}
async function renderBlocked(box) {
  if (!auth.hasSettingsScope()) { box.innerHTML = '<p>Aucun expéditeur bloqué pour l’instant.</p>'; return; }
  try {
    const labels = await getLabels();
    const l = labels.find(x => x.name === BLOCK_LABEL);
    const fs = l ? (((await api('settings/filters')) || {}).filter || []).filter(f => f.action && (f.action.addLabelIds || []).includes(l.id) && f.criteria && f.criteria.from) : [];
    if (!fs.length) { box.innerHTML = '<p>Aucun expéditeur bloqué pour l’instant.</p>'; return; }
    box.innerHTML = fs.map(f => `<div class="lab-row" style="padding:4px 0"><span class="nm" style="font-size:.85rem;overflow:hidden;text-overflow:ellipsis">${esc(f.criteria.from)}</span><button class="btn" style="height:38px;font-size:.75rem" data-fid="${esc(f.id)}">Débloquer</button></div>`).join('') +
      `<a class="btn" href="#/list/${encodeURIComponent(l.id)}">Voir les mails « ${BLOCK_LABEL} »</a>`;
    $$('button[data-fid]', box).forEach(b => b.onclick = async () => { b.disabled = true; try { await api('settings/filters/' + b.dataset.fid, { method: 'DELETE' }); toast('Débloqué'); renderBlocked(box); } catch (e) { b.disabled = false; toast('Échec : ' + e.message); } });
  } catch (e) { box.innerHTML = '<p>Liste indisponible.</p>'; }
}

/* ---------- Conversation ---------- */
function walkParts(p, acc) {
  if (!p) return;
  const mt = (p.mimeType || '').toLowerCase();
  const ct = partHdr(p, 'Content-Type');
  const cs = (ct.match(/charset="?([^";]+)/i) || [])[1];
  if (p.filename && p.body && (p.body.attachmentId || p.body.data)) {
    acc.att.push({ name: p.filename, mime: mt, id: p.body.attachmentId, data: p.body.data, size: p.body.size || 0, cid: (partHdr(p, 'Content-ID') || '').replace(/[<>]/g, '') });
  } else if (mt === 'text/html' && p.body && p.body.data && acc.html == null) acc.html = decodeText(p.body.data, cs);
  else if (mt === 'text/plain' && p.body && p.body.data && acc.text == null) acc.text = decodeText(p.body.data, cs);
  (p.parts || []).forEach(c => walkParts(c, acc));
}

async function renderThread(id) {
  const v = $('#view');
  v.innerHTML = `<div class="top"><a class="back" href="#" id="back">${ICON.back}Retour</a></div><div class="loading">Ouverture…</div>`;
  $('#back').onclick = e => { e.preventDefault(); goBack(); };
  let t;
  try { [t] = await Promise.all([api('threads/' + encodeURIComponent(id) + '?format=full'), getLabels().catch(() => [])]); }
  catch (e) { if (e.message !== 'auth') v.querySelector('.loading').outerHTML = `<div class="empty">Impossible d'ouvrir : ${esc(e.message)}</div>`; return; }
  const msgs = (t.messages || []).filter(m => !(m.labelIds || []).includes('TRASH') || (t.messages || []).every(x => (x.labelIds || []).includes('TRASH')));
  const labels = new Set(msgs.flatMap(m => m.labelIds || []));
  const subject = hdr(msgs[0] || {}, 'Subject') || '(sans objet)';
  const starred = labels.has('STARRED');
  state.thread = { id, msgs, labels, subject };
  if (labels.has('UNREAD')) {
    api('threads/' + id + '/modify', { method: 'POST', body: { removeLabelIds: ['UNREAD'] } }).then(updateBadge).catch(() => {});
    patchCached(id, i => Object.assign({}, i, { unread: false }));
  }
  const chips = [...labels].map(l => l === 'INBOX' ? '<span class="chip">Réception</span>' : (labelById(l) ? `<span class="chip lab" style="--c:${esc(labelColor(labelById(l)))}">${esc(labelById(l).name)}</span>` : '')).join('');
  v.innerHTML = `
    <div class="top"><a class="back" href="#" id="back">${ICON.back}Retour</a></div>
    <h1 class="thread-title">${esc(subject)}</h1>
    <div class="thread-chips">${chips}</div>
    <div class="toolbar">
      <button id="t-archive">${ICON.archive}Archiver</button>
      <button id="t-label">${ICON.tag}Classer</button>
      <button id="t-trash">${ICON.trash}Supprimer</button>
      <button id="t-unread">${ICON.unread}Non lu</button>
      <button id="t-star" aria-pressed="${starred}">${starred ? ICON.starOn : ICON.star}${starred ? 'Suivi' : 'Suivre'}</button>
    </div>
    <div id="msgs"></div>
    <div class="reply-bar">
      <button class="btn primary" id="r-reply">Répondre</button>
      <button class="btn" id="r-all">À tous</button>
      <button class="btn" id="r-fwd">Transférer</button>
    </div>`;
  $('#back').onclick = e => { e.preventDefault(); goBack(); };
  const box = $('#msgs');
  msgs.forEach((m, i) => box.appendChild(messageEl(m, i === msgs.length - 1 || (m.labelIds || []).includes('UNREAD'))));
  const last = msgs[msgs.length - 1];
  $('#r-reply').onclick = () => openCompose('reply', last);
  $('#r-all').onclick = () => openCompose('all', last);
  $('#r-fwd').onclick = () => openCompose('fwd', last);
  $('#t-archive').onclick = () => threadAction(id, { removeLabelIds: ['INBOX'] }, 'Archivé', true);
  $('#t-trash').onclick = async () => { try { await api('threads/' + id + '/trash', { method: 'POST' }); patchCached(id, () => null); toast('Placé dans la corbeille'); goBack(); updateBadge(); } catch (e) { if (e.message !== 'auth') toast(e.message); } };
  $('#t-unread').onclick = () => { patchCached(id, i => Object.assign({}, i, { unread: true })); threadAction(id, { addLabelIds: ['UNREAD'] }, 'Marqué non lu', true); };
  $('#t-star').onclick = async () => {
    try {
      if (starred) await api('threads/' + id + '/modify', { method: 'POST', body: { removeLabelIds: ['STARRED'] } });
      else await api('messages/' + last.id + '/modify', { method: 'POST', body: { addLabelIds: ['STARRED'] } });
      patchCached(id, i => Object.assign({}, i, { starred: !starred }));
      renderThread(id);
    } catch (e) { if (e.message !== 'auth') toast(e.message); }
  };
  $('#t-label').onclick = () => labelSheet(id, labels);
}
async function threadAction(id, body, msg, leave) {
  try {
    await api('threads/' + id + '/modify', { method: 'POST', body });
    if (body.removeLabelIds && body.removeLabelIds.includes('INBOX')) { const c = state.lists.INBOX; if (c) c.items = c.items.filter(i => i.id !== id); }
    toast(msg); updateBadge();
    if (leave) goBack();
  } catch (e) { if (e.message !== 'auth') toast(e.message); }
}
function goBack() {
  if (history.length > 1 && state.cameFromApp) history.back();
  else location.hash = '#/list/INBOX';
}
window.addEventListener('hashchange', () => { state.cameFromApp = true; });

function messageEl(m, open) {
  const from = parseAddr(hdr(m, 'From'));
  const tos = splitAddrs(hdr(m, 'To')).concat(splitAddrs(hdr(m, 'Cc'))).map(parseAddr).map(shortName);
  const el = document.createElement('article');
  el.className = 'msg' + (open ? '' : ' collapsed');
  el.innerHTML = `<button class="msg-head" aria-expanded="${open}">
      <span class="avatar" aria-hidden="true">${esc(initials(from.name))}</span>
      <span class="meta"><span class="from" style="display:block">${esc(isMe(from.email) ? 'Moi' : from.name)}</span><span class="to" style="display:block">à ${esc(tos.join(', ') || '…')}</span></span>
      <span class="date">${esc(fmtDate(+m.internalDate, true))}</span>
    </button>
    <div class="snippet">${esc(decodeEntities(m.snippet || ''))}</div>
    <div class="content"></div>`;
  let rendered = false;
  const toggle = () => {
    const c = el.classList.toggle('collapsed');
    $('.msg-head', el).setAttribute('aria-expanded', !c);
    if (!c && !rendered) { rendered = true; renderBody(m, $('.content', el)); }
  };
  $('.msg-head', el).onclick = toggle;
  if (open) { rendered = true; renderBody(m, $('.content', el)); }
  return el;
}

function renderBody(m, container) {
  const acc = { html: null, text: null, att: [] };
  walkParts(m.payload, acc);
  if (acc.html == null && acc.text == null && m.payload && m.payload.body && m.payload.body.data) {
    const t = decodeText(m.payload.body.data);
    if (/html/i.test(m.payload.mimeType)) acc.html = t; else acc.text = t;
  }
  let readable = settings.readable;
  let showImages = settings.images;
  const body = document.createElement('div');
  body.className = 'msg-body';
  const host = document.createElement('div');
  body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const tools = document.createElement('div');
  tools.className = 'msg-tools';
  const draw = () => {
    const html = acc.html != null ? cleanHtml(acc.html, readable, showImages) : textToHtml(acc.text || '');
    shadow.innerHTML = `<style>${bodyCss(readable && acc.html != null, acc.html == null)}</style><div class="mail">${html}</div>`;
    shadow.querySelectorAll('img[src^="cid:"]').forEach(img => {
      const cid = img.getAttribute('src').slice(4);
      const a = acc.att.find(x => x.cid === cid);
      if (a) attData(m.id, a).then(b64 => { img.src = 'data:' + a.mime + ';base64,' + b64; }).catch(() => {});
    });
    tools.innerHTML = (acc.html != null ? `<button data-t="mode">${readable ? 'Mise en forme d’origine' : 'Mode lisible'}</button>` : '') +
      (!showImages && shadow.querySelector('img[data-src]') ? '<button data-t="img">Afficher les images</button>' : '');
    $$('button', tools).forEach(b => b.onclick = () => { if (b.dataset.t === 'mode') readable = !readable; else showImages = true; draw(); });
  };
  shadow.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href');
    if (/^mailto:/i.test(href)) { const u = new URL(href); openComposeTo(decodeURIComponent(u.pathname), u.searchParams.get('subject') || ''); }
    else if (/^https?:/i.test(href)) window.open(href, '_blank', 'noopener');
  });
  draw();
  container.appendChild(body);
  container.appendChild(tools);
  const files = acc.att.filter(a => !(a.cid && acc.html && acc.html.includes('cid:' + a.cid)));
  if (files.length) {
    const box = document.createElement('div');
    box.className = 'atts';
    files.forEach(a => {
      const b = document.createElement('button');
      b.className = 'att';
      b.innerHTML = `${ICON.clip}<span class="n">${esc(a.name)}</span><span class="s">${esc(fmtSize(a.size))}</span>`;
      b.onclick = () => openAttachment(m.id, a, b);
      box.appendChild(b);
    });
    container.appendChild(box);
  }
}

function bodyCss(readable, isText) {
  const base = `:host{display:block;contain:paint;overflow:hidden}
    .mail{word-wrap:break-word;overflow-wrap:anywhere}
    img{max-width:100%!important;height:auto!important}
    details{margin:12px 0}
    summary{display:inline-block;cursor:pointer;padding:8px 14px;border-radius:18px;border:1px dashed var(--line2);color:var(--muted);font-size:.72rem;list-style:none}
    summary::-webkit-details-marker{display:none}`;
  if (readable || isText) return base + `
    .mail{color:var(--text);font-size:1rem;line-height:1.65;font-family:-apple-system,system-ui,sans-serif}
    .mail *{background:transparent!important;color:inherit!important;font-family:inherit!important;font-size:inherit!important;line-height:inherit!important;max-width:100%!important}
    .mail a{color:var(--accent)!important;text-decoration:underline}
    .mail summary{font-size:.72rem!important;color:var(--muted)!important}
    table,tbody,thead,tfoot,tr,td,th{display:block!important;width:auto!important;height:auto!important;border:0!important;padding:0!important}
    h1,h2,h3,h4{font-size:1.1em!important;font-weight:700;line-height:1.3!important;margin:.8em 0 .4em}
    p{margin:0 0 .8em}
    blockquote{margin:0 0 0 .2em;padding-left:.8em;border-left:3px solid var(--line2)}
    pre,.txt{white-space:pre-wrap;font-family:inherit!important;margin:0}
    hr{border:0;border-top:1px solid var(--line2)}`;
  return base + `
    .mail{background:#fff;color:#222;border-radius:10px;padding:12px;font:16px/1.5 -apple-system,system-ui,sans-serif;overflow-x:auto}
    .mail *{max-width:100%!important;box-sizing:border-box}
    summary{color:#555;border-color:#bbb}`;
}

function cleanHtml(html, readable, showImages) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,iframe,frame,frameset,object,embed,form,input,button,select,textarea,link,meta,base,noscript,title,svg,math').forEach(e => e.remove());
  doc.querySelectorAll('*').forEach(e => {
    Array.from(e.attributes).forEach(a => {
      const n = a.name.toLowerCase(), val = a.value.trim().toLowerCase();
      if (n.startsWith('on') || n === 'srcset' || n === 'formaction' || ((n === 'href' || n === 'src' || n === 'action' || n === 'background' || n === 'xlink:href') && /^(javascript|vbscript|data:text)/.test(val))) e.removeAttribute(a.name);
    });
  });
  doc.querySelectorAll('img').forEach(img => {
    const w = parseInt(img.getAttribute('width'), 10), h = parseInt(img.getAttribute('height'), 10);
    if ((w && w <= 2) || (h && h <= 2) || /display\s*:\s*none/i.test(img.getAttribute('style') || '')) { img.remove(); return; }
    const src = img.getAttribute('src') || '';
    if (!/^(https?:|cid:|data:image\/)/i.test(src)) { img.remove(); return; }
    if (!showImages && /^https?:/i.test(src)) { img.setAttribute('data-src', src); img.removeAttribute('src'); img.setAttribute('alt', img.getAttribute('alt') || '[image]'); }
  });
  collapseQuotes(doc);
  if (readable) {
    doc.querySelectorAll('style').forEach(e => e.remove());
    doc.querySelectorAll('*').forEach(e => ['style', 'class', 'bgcolor', 'color', 'face', 'size', 'width', 'height', 'background', 'align', 'valign', 'border', 'cellpadding', 'cellspacing'].forEach(a => e.removeAttribute(a)));
    doc.querySelectorAll('font,center,span:empty').forEach(e => { if (e.tagName !== 'SPAN') e.replaceWith(...e.childNodes); });
  } else {
    doc.querySelectorAll('style').forEach(s => { s.textContent = s.textContent.replace(/position\s*:\s*fixed/gi, 'position:static').replace(/@import[^;]+;/gi, ''); });
  }
  doc.querySelectorAll('a[href]').forEach(a => { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); });
  return doc.body ? doc.body.innerHTML : '';
}
function collapseQuotes(doc) {
  const q = doc.querySelector('.gmail_quote, blockquote[type="cite"], #divRplyFwdMsg, #appendonsend, .moz-cite-prefix, div[style*="border-top:solid #E1E1E1"], div[style*="border-top: solid #E1E1E1"]');
  if (!q || !q.parentNode) return;
  const d = doc.createElement('details');
  const s = doc.createElement('summary');
  s.textContent = 'Afficher le message précédent';
  d.appendChild(s);
  const outlook = q.id === 'divRplyFwdMsg' || q.id === 'appendonsend' || /border-top/.test(q.getAttribute('style') || '');
  q.parentNode.insertBefore(d, q);
  if (outlook) { let n = q; while (n) { const nx = n.nextSibling; d.appendChild(n); n = nx; } }
  else d.appendChild(q);
}
function linkify(s) { return s.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1">$1</a>'); }
function textToHtml(t) {
  const lines = t.replace(/\r\n/g, '\n').split('\n');
  let cut = lines.findIndex((l, i) => /^(Le .+ a écrit|On .+ wrote|-{2,}\s*(Original Message|Message d'origine|Message transféré)|De\s?:\s.+)/i.test(l.trim()) && lines.slice(i + 1).some(x => /^>/.test(x) || /^(Envoyé|Sent|Objet|Subject)\s?:/i.test(x)));
  const main = linkify(esc((cut > 0 ? lines.slice(0, cut) : lines).join('\n')));
  const quoted = cut > 0 ? `<details><summary>Afficher le message précédent</summary><div class="txt">${linkify(esc(lines.slice(cut).join('\n')))}</div></details>` : '';
  return `<div class="txt">${main}</div>${quoted}`;
}

const attCache = {};
async function attData(msgId, a) {
  if (a.data) return a.data.replace(/-/g, '+').replace(/_/g, '/');
  const k = msgId + a.id;
  if (!attCache[k]) attCache[k] = api('messages/' + msgId + '/attachments/' + a.id).then(r => r.data.replace(/-/g, '+').replace(/_/g, '/'));
  return attCache[k];
}
async function openAttachment(msgId, a, btn) {
  const label = btn.querySelector('.s'); const old = label.textContent; label.textContent = '…';
  try {
    const b64 = await attData(msgId, a);
    const blob = new Blob([b64ToBytes(b64)], { type: a.mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    if (/^image\//.test(a.mime)) {
      openSheet(`<h2>${esc(a.name)}</h2><div class="viewer"><img src="${url}" alt="${esc(a.name)}"></div><a class="btn primary" href="${url}" download="${esc(a.name)}">Enregistrer</a><button class="btn" data-close>Fermer</button>`);
    } else {
      const link = document.createElement('a');
      link.href = url; link.download = a.name; link.target = '_blank'; link.rel = 'noopener';
      document.body.appendChild(link); link.click(); link.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (e) { if (e.message !== 'auth') toast('Pièce jointe indisponible'); }
  label.textContent = old;
}

/* ---------- Classement (libellés Gmail) ---------- */
async function labelSheet(threadId, current) {
  let labels;
  try { labels = await getLabels(true); } catch (e) { return; }
  const rows = [{ id: 'INBOX', name: 'Boîte de réception', c: 'var(--gmail)' }].concat(labels.map(l => ({ id: l.id, name: l.name, c: labelColor(l) })));
  openSheet(`<span class="grip"></span><h2>Classer dans…</h2>
    <p style="margin:0 0 6px;color:var(--muted);font-size:.8rem">Ce sont tes libellés Gmail : le classement apparaît aussi dans Gmail.</p>
    ${rows.map(r => `<label class="check"><input type="checkbox" value="${esc(r.id)}" ${current.has(r.id) ? 'checked' : ''}><span class="sw" style="--c:${esc(r.c)}"></span>${esc(r.name)}</label>`).join('')}
    <form id="newlab" style="display:flex;gap:8px;margin-top:6px"><label class="f" style="flex:1"><span class="sr">Nouveau libellé</span><input id="newlab-name" placeholder="Nouveau libellé"></label><button class="btn" type="submit">Créer</button></form>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"><button class="btn" data-close>Annuler</button><button class="btn primary" id="lab-ok">Valider</button></div>`);
  $('#newlab').onsubmit = async e => {
    e.preventDefault();
    const n = $('#newlab-name').value.trim(); if (!n) return;
    try { const l = await api('labels', { method: 'POST', body: { name: n, labelListVisibility: 'labelShow', messageListVisibility: 'show' } }); current.add(l.id); await getLabels(true); closeSheet(); labelSheet(threadId, current); }
    catch (er) { if (er.message !== 'auth') toast(er.message); }
  };
  $('#lab-ok').onclick = async () => {
    const checked = new Set($$('#sheet input[type=checkbox]').filter(i => i.checked).map(i => i.value));
    const ids = rows.map(r => r.id);
    const add = ids.filter(i => checked.has(i) && !current.has(i));
    const rem = ids.filter(i => !checked.has(i) && current.has(i));
    closeSheet();
    if (!add.length && !rem.length) return;
    try {
      await api('threads/' + threadId + '/modify', { method: 'POST', body: { addLabelIds: add, removeLabelIds: rem } });
      Object.keys(state.lists).forEach(k => delete state.lists[k]);
      toast('Classé');
      if (rem.includes('INBOX')) goBack(); else renderThread(threadId);
      updateBadge();
    } catch (e) { if (e.message !== 'auth') toast(e.message); }
  };
}
function openSheet(html) {
  const s = $('#sheet');
  s.innerHTML = `<div class="panel" role="dialog" aria-modal="true">${html}</div>`;
  s.hidden = false;
  s.onclick = e => { if (e.target === s || e.target.closest('[data-close]')) closeSheet(); };
}
function closeSheet() { const s = $('#sheet'); if (s) { s.hidden = true; s.innerHTML = ''; } }

/* ---------- Libellés (navigation) ---------- */
async function renderLabels() {
  const v = $('#view');
  v.innerHTML = `<div class="top"><h1>Dossiers et libellés</h1></div><div id="labs"><div class="loading">Chargement…</div></div>`;
  let labels;
  try { labels = await getLabels(true); } catch (e) { return; }
  const counts = await pool(labels, 6, l => api('labels/' + l.id)).catch(() => []);
  const sys = ['INBOX', 'STARRED', 'IMPORTANT', 'SENT', 'DRAFT', 'ALL', 'SPAM', 'TRASH'];
  const $l = $('#labs'); if (!$l) return;
  $l.innerHTML = `<div class="card" style="padding:0;gap:0">${sys.map(k => `<a class="lab-row" href="#/list/${k}"><span class="sw" style="--c:var(--accent-fill)"></span><span class="nm">${esc(SYSTEM[k].name)}</span></a>`).join('')}</div>
    <h2 class="h2">Mes libellés</h2>
    <div class="card" style="padding:0;gap:0">${labels.length ? labels.map((l, i) => { const c = counts[i]; const n = c && c.threadsUnread; return `<a class="lab-row" href="#/list/${encodeURIComponent(l.id)}"><span class="sw" style="--c:${esc(labelColor(l))}"></span><span class="nm">${esc(l.name)}</span>${n ? `<span class="nb">${n}</span>` : ''}</a>`; }).join('') : '<div class="empty">Aucun libellé personnel.</div>'}</div>`;
}

/* ---------- Rédaction ---------- */
function openCompose(mode, m) {
  state.composeFrom = { mode, m };
  location.hash = '#/compose?mode=' + mode;
}
function openComposeTo(to, subject) { state.composeFrom = { mode: 'new', to, subject }; location.hash = '#/compose?mode=new&t=' + Date.now(); }
function plainOf(m) {
  const acc = { html: null, text: null, att: [] };
  walkParts(m.payload, acc);
  if (acc.text) return acc.text;
  if (acc.html) {
    const d = new DOMParser().parseFromString(acc.html.replace(/<(br|\/p|\/div|\/tr|\/h\d|\/li)[^>]*>/gi, '$&\n'), 'text/html');
    d.querySelectorAll('style,script').forEach(e => e.remove());
    return (d.body ? d.body.textContent : '').replace(/\n{3,}/g, '\n\n').trim();
  }
  return decodeEntities(m.snippet || '');
}
function renderCompose(params) {
  const src = state.composeFrom || {};
  const mode = params.get('mode') || 'new';
  const m = src.m;
  let to = src.to || '', cc = '', subject = src.subject || '', body = '', threadId = null, inReplyTo = '', references = '', fwdAtts = [];
  if (m && mode !== 'new') {
    const subj = hdr(m, 'Subject');
    const from = hdr(m, 'From'), replyTo = hdr(m, 'Reply-To');
    const fromMe = isMe(parseAddr(from).email);
    const date = fmtDate(+m.internalDate, true);
    const original = plainOf(m);
    if (mode === 'fwd') {
      subject = /^(tr|fwd?)\s*:/i.test(subj) ? subj : 'Tr: ' + subj;
      body = `\n\n---------- Message transféré ----------\nDe : ${from}\nDate : ${date}\nObjet : ${subj}\nÀ : ${hdr(m, 'To')}\n\n${original}`;
      const acc = { html: null, text: null, att: [] }; walkParts(m.payload, acc); fwdAtts = acc.att;
    } else {
      subject = /^re\s*:/i.test(subj) ? subj : 'Re: ' + subj;
      to = fromMe ? hdr(m, 'To') : (replyTo || from);
      if (mode === 'all') {
        const seen = new Set(splitAddrs(to).map(a => parseAddr(a).email.toLowerCase()));
        cc = splitAddrs(hdr(m, 'To') + ',' + hdr(m, 'Cc')).filter(a => { const e = parseAddr(a).email.toLowerCase(); if (!e || seen.has(e) || isMe(e)) return false; seen.add(e); return true; }).join(', ');
      }
      threadId = m.threadId;
      inReplyTo = hdr(m, 'Message-ID') || hdr(m, 'Message-Id');
      references = ((hdr(m, 'References') || '') + ' ' + inReplyTo).trim();
      body = `\n\nLe ${date}, ${parseAddr(from).name} a écrit :\n` + original.split('\n').map(l => '> ' + l).join('\n');
    }
  }
  const title = mode === 'fwd' ? 'Transférer' : mode === 'new' ? 'Nouveau message' : 'Répondre';
  $('#view').innerHTML = `
    <div class="top"><a class="back" href="#" id="back">${ICON.back}Annuler</a><h1 style="text-align:center;font-size:1.1rem">${esc(title)}</h1><button class="btn primary" id="send" style="height:44px">${ICON.send}Envoyer</button></div>
    <form class="compose card" id="cform" style="gap:0">
      <div class="row"><label for="c-to">À</label><input id="c-to" type="text" inputmode="email" autocomplete="email" value="${esc(to)}"><button type="button" class="linkish" id="c-more">Cc</button></div>
      <div class="row" id="row-cc" ${cc ? '' : 'hidden'}><label for="c-cc">Cc</label><input id="c-cc" type="text" inputmode="email" value="${esc(cc)}"></div>
      <div class="row" id="row-bcc" hidden><label for="c-bcc">Cci</label><input id="c-bcc" type="text" inputmode="email"></div>
      <div class="row"><label for="c-subj">Objet</label><input id="c-subj" type="text" value="${esc(subject)}"></div>
      ${fwdAtts.length ? `<div class="row" style="flex-wrap:wrap;padding:8px 4px">${fwdAtts.map(a => `<span class="chip">${ICON.clip} ${esc(a.name)}</span>`).join(' ')}</div>` : ''}
      <label for="c-body" class="sr">Message</label>
      <textarea id="c-body"></textarea>
    </form>`;
  const ta = $('#c-body');
  ta.value = body;
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, window.innerHeight * 0.45) + 'px'; };
  ta.addEventListener('input', grow); grow();
  setTimeout(() => { if (!to) $('#c-to').focus(); else { ta.focus(); ta.setSelectionRange(0, 0); } }, 50);
  $('#back').onclick = e => { e.preventDefault(); if (ta.value.trim() && ta.value !== body && !confirm('Abandonner ce message ?')) return; goBack(); };
  $('#c-more').onclick = () => { $('#row-cc').hidden = false; $('#row-bcc').hidden = false; $('#c-cc').focus(); };
  $('#send').onclick = async () => {
    const o = { to: $('#c-to').value.trim(), cc: $('#c-cc').value.trim(), bcc: $('#c-bcc').value.trim(), subject: $('#c-subj').value, body: ta.value, inReplyTo, references };
    if (!o.to && !o.cc && !o.bcc) { toast('Ajoute un destinataire'); $('#c-to').focus(); return; }
    const bad = splitAddrs([o.to, o.cc, o.bcc].join(',')).map(a => parseAddr(a).email).filter(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    if (bad.length) { toast('Adresse invalide : ' + bad[0]); return; }
    const btn = $('#send'); btn.disabled = true; btn.lastChild.textContent = 'Envoi…';
    try {
      if (fwdAtts.length) o.attachments = await Promise.all(fwdAtts.map(async a => ({ name: a.name, mime: a.mime, b64: await attData(m.id, a) })));
      const raw = buildRaw(o);
      await api('messages/send', { method: 'POST', body: threadId ? { raw, threadId } : { raw } });
      Object.keys(state.lists).forEach(k => delete state.lists[k]);
      state.composeFrom = null;
      toast('Message envoyé');
      goBack();
    } catch (e) { btn.disabled = false; btn.lastChild.textContent = 'Envoyer'; if (e.message !== 'auth') toast('Échec : ' + e.message); }
  };
}

/* ---------- Construction du mail (MIME) ---------- */
const encWord = s => /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + utf8B64(s) + '?=';
function encAddrs(s) {
  return splitAddrs(s).map(a => {
    const p = a.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    if (!p || !p[1].trim()) return (p ? p[2] : a).trim();
    const name = p[1].trim().replace(/"/g, '');
    return (/^[\x20-\x7e]*$/.test(name) ? '"' + name + '"' : encWord(name)) + ' <' + p[2].trim() + '>';
  }).join(', ');
}
const wrap76 = s => s.replace(/.{1,76}/g, '$&\r\n').replace(/\r\n$/, '');
function buildRaw(o) {
  const h = [];
  if (o.to) h.push('To: ' + encAddrs(o.to));
  if (o.cc) h.push('Cc: ' + encAddrs(o.cc));
  if (o.bcc) h.push('Bcc: ' + encAddrs(o.bcc));
  h.push('Subject: ' + encWord(o.subject || ''));
  if (o.inReplyTo) { h.push('In-Reply-To: ' + o.inReplyTo); h.push('References: ' + (o.references || o.inReplyTo)); }
  h.push('MIME-Version: 1.0');
  const textPart = ['Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', wrap76(utf8B64(o.body || ''))].join('\r\n');
  let msg;
  if (o.attachments && o.attachments.length) {
    const b = 'ml_' + Math.random().toString(36).slice(2);
    const parts = [textPart].concat(o.attachments.map(a => [
      'Content-Type: ' + (a.mime || 'application/octet-stream') + '; name="' + encWord(a.name).replace(/"/g, '') + '"',
      'Content-Disposition: attachment; filename="' + encWord(a.name).replace(/"/g, '') + '"',
      'Content-Transfer-Encoding: base64', '', wrap76(a.b64)].join('\r\n')));
    msg = h.concat(['Content-Type: multipart/mixed; boundary="' + b + '"', '', parts.map(p => '--' + b + '\r\n' + p).join('\r\n') + '\r\n--' + b + '--']).join('\r\n');
  } else {
    msg = h.join('\r\n') + '\r\n' + textPart;
  }
  return toUrlB64(btoa(msg));
}

/* ---------- Réglages ---------- */
function renderSettings() {
  const connected = !!LS.get('token', null);
  $('#view').innerHTML = `
    <div class="top"><h1>Réglages</h1></div>
    <h2 class="h2">Comptes</h2>
    <section class="card">
      <h3><span class="dot" style="background:var(--gmail)"></span>Gmail<span class="st" style="color:${connected ? 'var(--ok)' : 'var(--muted)'}">${connected ? 'Connecté' : 'Non connecté'}</span></h3>
      ${settings.email ? `<p>${esc(settings.email)}</p>` : ''}
      <p>Connexion sécurisée par Google : ton mot de passe n'est jamais saisi ni stocké dans l'appli.</p>
      <label class="f">Identifiant Google (Client ID)<input id="s-cid" value="${esc(settings.clientId)}" placeholder="xxxx.apps.googleusercontent.com" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      ${connected ? '<button class="btn" id="s-logout">Se déconnecter</button>' : '<button class="btn primary" id="s-login">Se connecter avec Google</button>'}
    </section>
    <section class="card">
      <h3><span class="dot" style="background:var(--free)"></span>Free<span class="st" style="color:var(--muted)">Version 2</span></h3>
      <p>Le compte Free (identifiant et mot de passe) se configurera ici. Il nécessite un petit relais sur ton serveur, prévu en V2. Les identifiants resteront sur cet iPhone.</p>
    </section>
    <h2 class="h2">Expéditeurs bloqués</h2>
    <section class="card" id="s-blocked"><p>Chargement…</p></section>
    <h2 class="h2">Pastille sur l'icône</h2>
    <section class="card">
      <p>Affiche le nombre de mails non lus sur l'icône de l'appli. iOS exige pour cela l'autorisation des notifications, et l'appli doit être installée sur l'écran d'accueil.</p>
      <p id="s-badge-state" style="font-weight:650;color:var(--text)"></p>
      <button class="btn primary" id="s-badge">Activer la pastille</button>
    </section>
    <h2 class="h2">Affichage</h2>
    <section class="card">
      <label class="f"><span>Taille du texte : <b id="s-fs-v">${settings.fontSize}</b> px</span><input type="range" id="s-fs" min="15" max="26" step="1" value="${settings.fontSize}"></label>
      <p class="sample">Aperçu : Point MRP V3 jeudi 10h</p>
      <div class="seg" role="radiogroup" aria-label="Thème">
        ${[['light', 'Clair'], ['dark', 'Sombre'], ['auto', 'Auto']].map(([k, n]) => `<button role="radio" aria-checked="${settings.theme === k}" class="${settings.theme === k ? 'on' : ''}" data-th="${k}">${n}</button>`).join('')}
      </div>
      <label class="switch">Mode lisible par défaut<input type="checkbox" id="s-read" ${settings.readable ? 'checked' : ''}></label>
      <label class="switch">Afficher les images des mails<input type="checkbox" id="s-img" ${settings.images ? 'checked' : ''}></label>
    </section>
    <h2 class="h2">Application</h2>
    <section class="card">
      <h3>Version ${esc(APP_VERSION)}<span class="st" style="color:var(--muted)">${esc(APP_DATE)}</span></h3>
      <p id="s-upd-state">Les mises à jour sont vérifiées à chaque ouverture.</p>
      <button class="btn primary" id="s-upd">Rechercher une mise à jour</button>
      <button class="btn" id="s-force">Forcer l'actualisation</button>
    </section>`;
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
  $('#s-upd').onclick = async () => {
    const st = $('#s-upd-state'); st.textContent = 'Vérification…';
    const v = await latestVersion();
    if (!v) st.textContent = 'Vérification impossible (pas de réseau ?).';
    else if (v.version !== APP_VERSION) { st.textContent = 'Version ' + v.version + ' disponible.'; $('#s-upd').textContent = 'Installer la version ' + v.version; $('#s-upd').onclick = forceUpdate; }
    else st.textContent = 'Tu as la dernière version.';
  };
  $('#s-force').onclick = forceUpdate;
  $('#s-fs').oninput = e => { settings.fontSize = +e.target.value; $('#s-fs-v').textContent = settings.fontSize; saveSettings(); };
  $$('.seg button').forEach(b => b.onclick = () => { settings.theme = b.dataset.th; saveSettings(); renderSettings(); });
  $('#s-read').onchange = e => { settings.readable = e.target.checked; saveSettings(); };
  $('#s-img').onchange = e => { settings.images = e.target.checked; saveSettings(); };
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
    await Promise.all(['./', 'index.html', 'app.js', 'styles.css', 'sw.js', 'manifest.webmanifest'].map(f => fetch(f, { cache: 'reload' }).catch(() => {})));
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

/* ---------- Démarrage ---------- */
applySettings();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applySettings);
route();
if (auth.token()) {
  api('profile').then(p => { if (p && p.emailAddress && p.emailAddress !== settings.email) { settings.email = p.emailAddress; saveSettings(); } }).catch(() => {});
  updateBadge();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const h = location.hash || '#/list/INBOX';
  if (h.startsWith('#/list/')) { const key = h.split('/')[2]; const c = state.lists[key]; if (c && Date.now() - c.at > 60000) loadList(key, null, key, !!(SYSTEM[key] && SYSTEM[key].plain), true); }
  updateBadge();
});
setInterval(() => { if (document.visibilityState === 'visible' && auth.token()) updateBadge(); }, 120000);
checkUpdate();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
