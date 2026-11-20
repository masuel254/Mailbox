/* Mail lisible : client Gmail PWA. Aucun identifiant n'est stocké dans ce code. */
'use strict';

const APP_VERSION = '2.10.7';
const APP_DATE = '19/11/2026';

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
const settings = Object.assign({ clientId: '', fontSize: 18, theme: 'auto', images: true, readable: true, email: '', relayUrl: 'https://vps-444b360b.vps.ovh.net/mailbox', relayToken: '', relayGmail: false, freeEmail: '', acc: 'all', vapid: '', primaryOnly: false }, LS.get('settings', {}));
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
const cleanSnippet = s => fixMojibake(decodeEntities(decodeEntities(s || ''))).replace(/(^|\s)[^\s{}][^{}]{0,300}\{[^{}]*\}/g, ' ').replace(/\*\*/g, '').replace(/[\u00a0\u200b-\u200d\u034f\ufeff]/g, ' ').replace(/\(?\s*<?https?:\/\/[^\s)>]*>?\s*\)?/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/^\s*(voir|afficher|consulter) (la version|ce (mail|message|courriel)) (en ligne|dans (votre|un) navigateur)\S*\s*/i, '').replace(/\s+/g, ' ').trim();
let toastTimer;
function toast(msg, action) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('has-act', !!action);
  if (action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label; b.onclick = () => { t.classList.remove('show'); clearTimeout(toastTimer); action.run(); }; t.appendChild(b); }
  t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), action ? 6000 : 2600);
}
const undoToast = (msg, undo) => toast(msg, { label: 'Annuler', run: async () => { try { await undo(); toast('Action annulée'); } catch (e) { toast('Annulation impossible : ' + e.message); } Object.keys(state.lists).forEach(k => delete state.lists[k]); route(); badgeNow(0); } });
const ICON = {
  folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
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
    if (relayGmailOn()) { location.href = relayGoogleStart(); return; }
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
  hasSettingsScope() { if (relayGmailOn()) return true; const t = LS.get('token', null); return !!(t && /gmail\.settings\.basic/.test(t.scope || '')); },
  logout() {
    const t = LS.get('token', null);
    LS.del('token');
    if (t) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t.v), { method: 'POST' }).catch(() => {});
  }
};

/* ---------- Relais (serveur personnel sur le VPS) ---------- */
const relayOn = () => !!(settings.relayUrl && settings.relayToken);
const relayGmailOn = () => relayOn() && settings.relayGmail;
const freeOn = () => relayOn() && !!settings.freeEmail;
async function rapi(path, opt, override) {
  opt = opt || {};
  const base = ((override && override.url) || settings.relayUrl).replace(/\/$/, '');
  const tok = (override && override.token) || settings.relayToken;
  let r;
  try {
    r = await fetch(base + path, { method: opt.method || 'GET', headers: Object.assign({ Authorization: 'Bearer ' + tok }, opt.body ? { 'Content-Type': 'application/json' } : {}), body: opt.body ? JSON.stringify(opt.body) : undefined, cache: 'no-store' });
  } catch (e) { const er = new Error('Relais injoignable'); er.status = 0; throw er; }
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok) { const er = new Error((j && j.error) || ('Relais : erreur ' + r.status)); er.status = r.status; throw er; }
  return j;
}
function relayGoogleStart() { return settings.relayUrl.replace(/\/$/, '') + '/auth/google/start?' + new URLSearchParams({ t: settings.relayToken, hint: settings.email || '' }); }
async function accessToken() {
  if (relayGmailOn()) {
    const c = LS.get('rtoken', null);
    if (c && c.exp > Date.now() + 60000) return c.v;
    try {
      const r = await rapi('/gmail/token');
      LS.set('rtoken', { v: r.access_token, exp: Date.now() + r.expires_in * 1000 });
      if (r.email && r.email !== settings.email) { settings.email = r.email; saveSettings(); }
      return r.access_token;
    } catch (e) {
      if (e.status === 409 || e.status === 401) { settings.relayGmail = false; saveSettings(); toast('Gmail est à relier de nouveau au relais (Réglages)'); }
      else { toast(e.message); throw new Error('auth'); }
    }
  }
  return auth.token();
}

/* ---------- API Gmail ---------- */
async function api(path, opt, tries) {
  opt = opt || {}; tries = tries || 0;
  const t = await accessToken();
  if (!t) { auth.login(); throw new Error('auth'); }
  const r = await fetch(API + path, {
    method: opt.method || 'GET',
    headers: Object.assign({ Authorization: 'Bearer ' + t }, opt.body ? { 'Content-Type': 'application/json' } : {}),
    body: opt.body ? JSON.stringify(opt.body) : undefined
  });
  if (r.status === 401) { if (relayGmailOn()) { LS.del('rtoken'); toast('Session Gmail renouvelée, réessaie'); throw new Error('auth'); } LS.del('token'); auth.login(); throw new Error('auth'); }
  if (!r.ok) {
    let m = 'Erreur ' + r.status; try { m = (await r.json()).error.message; } catch (e) {}
    // Quota Gmail dépassé : on patiente puis on réessaie, sans afficher le message technique
    if ((r.status === 429 || (r.status === 403 && /quota|rate/i.test(m))) && tries < 3) { await new Promise(res => setTimeout(res, 1500 * Math.pow(2, tries) + Math.random() * 500)); return api(path, opt, tries + 1); }
    if (r.status === 429 || /quota|rate limit/i.test(m)) m = 'Gmail demande de ralentir, réessaie dans une minute';
    if (r.status === 403 && /scope/i.test(m)) m = 'scope'; throw new Error(m);
  }
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
const isMe = email => !!email && [settings.email, settings.freeEmail].some(x => x && email.toLowerCase() === x.toLowerCase());
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
  // Certains mails annoncent un jeu de caractères (ISO-8859-1, Windows-1252) mais sont en réalité en UTF-8 : on essaie l'UTF-8 strict d'abord
  if (charset && !/utf-?8/i.test(charset) && bytes.some(b => b > 127)) { try { return fixMojibake(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch (e) {} }
  let out; try { out = new TextDecoder((charset || 'utf-8').toLowerCase()).decode(bytes); } catch (e) { out = new TextDecoder('utf-8').decode(bytes); }
  return fixMojibake(out);
}
/* Répare le texte « Ã© / Ã» / â€™ » (UTF-8 lu comme du Latin-1/Windows-1252), y compris dans le HTML déjà mal encodé à l'envoi */
const CP1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
function fixMojibake(str) {
  if (!str || !/[ÂÃâ][\u0080-¿Œ-™]/.test(str)) return str;
  const byteOf = c => { const n = c.charCodeAt(0); return n < 256 ? n : CP1252[n]; };
  return str.replace(/[Â-ô][\u0080-¿ŒœŠšŸŽžƒˆ˜–-™]{1,3}/g, seq => {
    const bytes = [...seq].map(byteOf);
    if (bytes.some(b => b === undefined)) return seq;
    try { return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)); } catch (e) { return seq; }
  });
}
function bytesToB64(bytes) { let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); }
const utf8B64 = s => bytesToB64(new TextEncoder().encode(s));
const toUrlB64 = s => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* ---------- Routage ---------- */
const state = { lists: {}, current: null, me: null };
const keyOf = ck => String(ck).split('|').pop();
const FREE_FOLDERS = { INBOX: 'INBOX', UNREAD: 'INBOX', SENT: 'SENT', TRASH: 'TRASH', SPAM: 'JUNK' };
const isBlockLabel = key => { try { return (labelById(key) || {}).name === BLOCK_LABEL; } catch (e) { return false; } };
const isFolderView = key => String(key).startsWith('F:') || (!SYSTEM[key] && key !== 'SEARCH' && !String(key).startsWith('S:'));
const freeFolderOf = key => FREE_FOLDERS[key] || (String(key).startsWith('F:') ? decodeURIComponent(key.slice(2)) : null) || (isBlockLabel(key) ? 'BLOCKED' : null);
const curAcc = () => freeOn() ? (settings.acc || 'all') : 'gmail';
function parseFreeId(id) { const p = id.split(':'); return { uid: +p[1], folder: p.slice(2).join(':') }; }
function freeItem(x) {
  return { id: 'f:' + x.uid + ':' + x.folder, acc: 'free', folder: x.folder, uid: x.uid, subject: fixMojibake(x.subject), from: x.from.name || x.from.email, fromEmail: (x.from.email || '').toLowerCase(), fromName: x.from.name || '', to: x.to || '', sentByMe: false, snippet: cleanSnippet(x.snippet), date: x.date, count: 1, size: x.size || 0, unread: !x.seen, starred: !!x.flagged, labels: [] };
}
function route() {
  auth.handleRedirect();
  const h = location.hash || '#/list/INBOX';
  const parts = h.slice(2).split('?')[0].split('/');
  const view = parts[0];
  closeSheet();
  exitSelect(true);
  document.body.classList.toggle('no-tabbar', view === 'thread' || view === 'compose' || view === 'free');
  const lk = parts[1] === 'UNREAD' ? 'INBOX' : (parts[1] || 'INBOX');
  $$('#tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === (view === 'list' ? (['INBOX', 'SENT'].includes(lk) ? lk : 'labels') : view === 'waiting' ? 'labels' : view)));
  $('#view').scrollTop = 0;
  if (!settings.clientId && !relayGmailOn() && view !== 'settings') return renderWelcome();
  if (view === 'thread') return renderThread(decodeURIComponent(parts[1]));
  if (view === 'free') return renderFree(decodeURIComponent(parts[1]), +parts[2]);
  if (view === 'compose') return renderCompose(new URLSearchParams(h.split('?')[1] || ''));
  if (view === 'labels') return renderLabels();
  if (view === 'waiting') return renderWaiting();
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
  if (String(key).startsWith('F:')) title = decodeURIComponent(key.slice(2)).split(/[\/.]/).pop();
  else if (!sys && !isSearch) { try { await getLabels(); const l = labelById(key); if (l) title = l.name; } catch (e) { if (e.message === 'auth') return; } }
  const plain = !!(sys && sys.plain);
  const isFreeDir = String(key).startsWith('F:');
  const acc = isFreeDir ? 'free' : freeOn() && (isSearch || freeFolderOf(key)) ? curAcc() : 'gmail';
  const cacheKey = (acc !== 'gmail' ? acc + '|' : '') + (isSearch ? 'S:' + q : key);
  state.current = cacheKey;
  const showTitle = key === 'INBOX' ? 'Réception' : String(title).split(/\//).pop();
  const backTo = ['INBOX', 'UNREAD', 'SENT'].includes(key) ? null : isSearch ? ['#/list/INBOX', 'Réception'] : ['#/labels', 'Dossiers'];
  v.innerHTML = `<div class="sticky-head">
    ${backTo ? `<a class="back back-sm" href="${backTo[0]}">${ICON.back}${backTo[1]}</a>` : ''}
    <div class="top">
      <h1>${esc(showTitle)}</h1>
      <button class="icon-btn" id="btn-select" aria-label="Sélectionner plusieurs mails">${ICON.check}</button>
      <button class="icon-btn" id="btn-search" aria-label="Rechercher">${ICON.search}</button>
      <button class="icon-btn" id="btn-refresh" aria-label="Actualiser">${ICON.refresh}</button>
    </div>
    <form class="searchbar" id="searchbar" ${isSearch ? '' : 'hidden'}><input type="search" id="q" placeholder="${settings.ai ? 'Demande : la promo Devred de mon anniversaire' : 'Rechercher (ex. from:claire facture)'}" value="${esc(q || '')}" enterkeyhint="search" autocomplete="off"></form>
    ${(() => {
      const inboxish = key === 'INBOX' || key === 'UNREAD';
      const accs = freeOn() && !isFreeDir && (isSearch || freeFolderOf(key)) ? `<div class="accounts" role="tablist" aria-label="Comptes">
      ${[['all', 'Tous', ''], ['gmail', 'Gmail', 'var(--gmail)'], ['free', 'Free', 'var(--free)']].map(([k, n, c]) => `<button role="tab" aria-selected="${acc === k}" class="${acc === k ? 'on' : ''}" data-acc="${k}"><span class="acc-l">${c ? `<span class="dot" style="background:${c}"></span>` : ''}${n}</span>${inboxish ? `<small class="acc-n" data-n="${k}"></small>` : ''}</button>`).join('')}
    </div>` : '';
      if (!inboxish) return accs;
      const pill = `<a class="unr-pill ${key === 'UNREAD' ? 'on' : ''}" href="#/list/${key === 'UNREAD' ? 'INBOX' : 'UNREAD'}" aria-pressed="${key === 'UNREAD'}">Non lus<span class="fcount" id="fcount"></span></a>`;
      return `<div class="tabrow">${accs || '<div class="accounts one"><button class="on" aria-selected="true">Réception</button></div>'}${pill}</div>`;
    })()}</div>
    ${isSearch && state.aiNote && state.aiNote.q === q ? `<div class="ai-note"><b>✦ ${esc(state.aiNote.resume || 'Recherche de l’assistant')}</b><span>« ${esc(state.aiNote.ask)} » → <code>${esc(q)}</code></span><a href="#/search/${encodeURIComponent(state.aiNote.ask)}" id="ai-raw">Chercher les mots exacts</a></div>` : ''}
    ${isFolderView(key) ? `<div class="banner"><span style="display:flex;flex-direction:column;gap:2px"><span>${title === BLOCK_LABEL ? 'Mails des expéditeurs bloqués' : 'Dossier « ' + esc(title) + ' »'}</span><b id="lab-size" style="color:var(--accent)">Calcul de la taille…</b></span><button class="btn danger" id="btn-empty">${ICON.trash}Tout supprimer</button></div>` : ''}
    <div id="list"><div class="loading">Chargement…</div></div>`;
  $('#btn-search').onclick = () => { const s = $('#searchbar'); s.hidden = !s.hidden; if (!s.hidden) $('#q').focus(); };
  $('#searchbar').onsubmit = async e => {
    e.preventDefault(); const val = $('#q').value.trim(); $('#q').blur(); if (!val) return;
    const natural = settings.ai && relayOn() && !/\w:\S/.test(val) && val.split(/\s+/).length >= 3;
    if (natural) {
      toast('L’assistant cherche…');
      try { const r = await rapi('/ai/search', { method: 'POST', body: { q: val, today: new Date().toISOString().slice(0, 10) } }); state.aiNote = { ask: val, q: r.q, resume: r.resume }; location.hash = '#/search/' + encodeURIComponent(r.q); return; }
      catch (er) { toast('Assistant : ' + er.message + ' · recherche simple'); }
    }
    state.aiNote = null; location.hash = '#/search/' + encodeURIComponent(val);
  };
  $('#btn-refresh').onclick = () => loadList(key, q, cacheKey, plain, true);
  $('#btn-select').onclick = () => state.sel ? exitSelect() : enterSelect();
  state.listCtx = { key, q, cacheKey, plain };
  $$('.accounts button[data-acc]').forEach(b => b.onclick = () => { settings.acc = b.dataset.acc; saveSettings(); renderList(key, q); });
  const be = $('#btn-empty'); if (be) { be.onclick = () => emptyLabel(key, title); labelSize(key).then(t => { const el = $('#lab-size'); if (el) el.textContent = t; }); }
  bindListGestures($('#list'));
  let cached = state.lists[cacheKey];
  // Ouverture instantanée : dernière liste connue gardée sur l'iPhone (réception, non lus, envoyés), actualisée aussitôt
  if (!cached && !isSearch) { const d = LS.get('list:' + cacheKey, null); if (d && d.items) { cached = Object.assign(d, { at: 0, stale: true }); state.lists[cacheKey] = cached; } }
  if (cached) { drawList(cached, plain); if (Date.now() - cached.at > 60000) loadList(key, q, cacheKey, plain, true); }
  else loadList(key, q, cacheKey, plain, true);
}

async function loadList(key, q, cacheKey, plain, reset) {
  const sys = SYSTEM[key];
  const acc = cacheKey.includes('|') ? cacheKey.split('|')[0] : 'gmail';
  const prev = state.lists[cacheKey];
  const more = !reset && prev;
  let gItems = [], next = prev ? prev.next : null, fItems = [], freeBefore = prev ? prev.freeBefore : 0, freeMore = prev ? prev.freeMore : false;
  try {
    const jobs = [];
    if (acc !== 'free' && (!more || prev.next)) {
      jobs.push((async () => {
        const p = new URLSearchParams({ maxResults: PAGE });
        if (key === 'SEARCH') p.set('q', q);
        else if ((key === 'INBOX' || key === 'UNREAD') && settings.primaryOnly) p.set('q', 'in:inbox category:primary' + (key === 'UNREAD' ? ' is:unread' : ''));
        else (sys ? sys.ids : [key]).forEach(id => p.append('labelIds', id));
        if (sys && sys.spamTrash) p.set('includeSpamTrash', 'true');
        if (more && prev.next) p.set('pageToken', prev.next);
        const [r] = await Promise.all([api('threads?' + p.toString()), getLabels().catch(() => [])]);
        const threads = await pool(r.threads || [], 12, t => api('threads/' + t.id + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date'));
        gItems = threads.filter(Boolean).map(t => Object.assign(summarize(t), { acc: 'gmail' }));
        next = r.nextPageToken || null;
      })());
    } else if (acc === 'free') next = null;
    if (acc !== 'gmail' && key === 'SEARCH' && !more) {
      jobs.push(rapi('/free/search?' + new URLSearchParams({ q, limit: '30' })).then(r => { fItems = (r.items || []).map(freeItem); freeMore = false; }).catch(e => { toast('Free : ' + e.message); }));
    } else if (acc !== 'gmail' && freeFolderOf(key) && (!more || prev.freeMore)) {
      jobs.push((async () => {
        try {
          const p = new URLSearchParams({ folder: freeFolderOf(key), unread: key === 'UNREAD' ? '1' : '0', limit: String(PAGE) });
          if (more && prev.freeBefore) p.set('before', prev.freeBefore);
          const r = await rapi('/free/list?' + p.toString());
          fItems = (r.items || []).map(freeItem);
          freeMore = !!r.more;
          if (fItems.length) freeBefore = Math.min(...fItems.map(i => i.uid));
        } catch (e) { toast('Free : ' + e.message); freeMore = false; }
      })());
    }
    await Promise.all(jobs);
    const fresh = gItems.concat(fItems).sort((a, b) => b.date - a.date);
    const data = { at: Date.now(), next, freeBefore, freeMore, items: more ? prev.items.concat(fresh) : fresh };
    state.lists[cacheKey] = data;
    if (['INBOX', 'UNREAD', 'SENT'].includes(key) && !more) { try { LS.set('list:' + cacheKey, { next: data.next, freeBefore: data.freeBefore, freeMore: data.freeMore, items: data.items.slice(0, 40) }); } catch (e) {} }
    if (state.current === cacheKey) { const y = scrollY; drawList(data, plain); if (reset && y) scrollTo(0, y); }
    if (key === 'INBOX' || key === 'UNREAD') updateBadge();
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
    subject: fixMojibake(hdr(msgs[0] || {}, 'Subject')) || '(sans objet)',
    from: froms.slice(-3).join(', '),
    fromEmail: ext ? ext.email.toLowerCase() : '',
    fromName: ext ? ext.name : '',
    to: to.join(', '),
    sentByMe: isMe(parseAddr(hdr(last, 'From')).email),
    snippet: fixMojibake(decodeEntities(last.snippet || '')),
    date: +last.internalDate || Date.now(),
    count: msgs.length,
    size: msgs.reduce((a, m) => a + (m.sizeEstimate || 0), 0),
    unread: msgs.some(m => (m.labelIds || []).includes('UNREAD')),
    starred: labels.has('STARRED'),
    labels: [...labels].filter(id => /^Label_/.test(id))
  };
}

function itemHTML(it, cls, sentView) {
  const who = sentView && it.to ? 'À : ' + it.to : it.from;
  const curKey = keyOf(state.current);
  const blocked = it.folder === BLOCK_LABEL || it.labels.some(id => (labelById(id) || {}).name === BLOCK_LABEL);
  const chips = (blocked ? '<span class="chip blocked">Bloqué</span>' : '') + it.labels.map(id => { const l = labelById(id); return l && l.name !== BLOCK_LABEL && id !== curKey ? `<span class="chip lab" style="--c:${esc(labelColor(l))}">${esc(l.name)}</span>` : ''; }).join('');
  const sel = state.sel && state.sel.has(it.id) ? ' sel' : '';
  const href = it.acc === 'free' ? '#/free/' + encodeURIComponent(it.folder) + '/' + it.uid : '#/thread/' + encodeURIComponent(it.id);
  const sizeChip = state.showSize && it.size ? `<span class="chip size">${it.size >= 1048576 ? (it.size / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(it.size / 1024)) + ' Ko'}</span>` : '';
  const accChip = state.showAcc ? `<span class="chip acc-${it.acc === 'free' ? 'free' : 'gmail'}">${it.acc === 'free' ? 'Free' : 'Gmail'}</span>` : '';
  return `<a class="item ${cls}${sel}" data-id="${esc(it.id)}" href="${href}">
    <span class="mark" aria-hidden="true"></span>
    <span class="av ${it.acc === 'free' ? 'free' : 'gmail'}" aria-hidden="true">${esc(initials(String(who).replace(/^À : /, '') || '?').slice(0, 1))}</span>
    <span class="body">
      <span class="row1"><span class="who">${esc(who)}${it.count > 1 ? ` <span class="count">(${it.count})</span>` : ''}</span>${it.starred ? '<span class="star" aria-label="Suivi">★</span>' : ''}<span class="when">${esc(fmtDate(it.date))}</span></span>
      <span class="subj">${it.unread ? '<span class="sr">Non lu : </span>' : ''}${esc(it.subject)}</span>
      <span class="row3"><span class="snip">${esc(it.snippet)}</span><span class="chips">${sizeChip}${accChip}${chips}</span></span>
    </span></a>`;
}
function drawList(data, plain) {
  const l = $('#list'); if (!l) return;
  state.showAcc = freeOn();
  if (!data.items.length) { l.innerHTML = '<div class="empty">Aucun message ici.</div>'; return; }
  // Recherche par taille (larger:) : du plus gros au plus petit, taille affichée
  const ck = String(state.current);
  if (state.listCtx && state.listCtx.key === 'SEARCH' && state.listCtx.cacheKey === ck && /\b(larger|size):/i.test(state.listCtx.q || '')) {
    state.showSize = true;
    l.innerHTML = `<h2 class="sec">Du plus gros au plus petit · ${data.items.length}</h2>` + data.items.slice().sort((a, b) => (b.size || 0) - (a.size || 0)).map(i => itemHTML(i, i.unread ? 'u' : '')).join('') + (data.next || data.freeMore ? '<button class="more" id="more">Afficher plus</button>' : '');
    const mm = $('#more'); if (mm) mm.onclick = () => { mm.disabled = true; mm.textContent = 'Chargement…'; loadList('SEARCH', state.listCtx.q, state.current, plain, false); };
    return;
  }
  state.showSize = false;
  const unread = data.items.filter(i => i.unread), read = data.items.filter(i => !i.unread);
  let h = '';
  const inboxView = ['INBOX', 'UNREAD'].includes(keyOf(state.current)) || isFolderView(keyOf(state.current));
  if (unread.length) h += `<h2 class="sec unread">Non lus · ${unread.length}${inboxView ? '<button class="sec-btn" id="btn-readall" type="button">Tout marquer lu</button>' : ''}</h2>` + unread.map(i => itemHTML(i, 'u')).join('');
  if (read.length) h += (unread.length ? '<h2 class="sec">Déjà lus</h2>' : '') + read.map(i => itemHTML(i, plain ? 'plain' : '', keyOf(state.current) === 'SENT')).join('');
  if (data.next || data.freeMore) h += '<button class="more" id="more">Afficher plus</button>';
  l.innerHTML = h;
  const ra = $('#btn-readall'); if (ra) ra.onclick = e => { e.stopPropagation(); readAll(ra); };
  const m = $('#more');
  if (m) m.onclick = () => { m.disabled = true; m.textContent = 'Chargement…'; const base = keyOf(state.current); loadList(base.startsWith('S:') ? 'SEARCH' : base, base.startsWith('S:') ? base.slice(2) : null, state.current, plain, false); };
}
function patchCached(id, fn) { Object.values(state.lists).forEach(d => { d.items = d.items.map(i => i.id === id ? fn(i) : i).filter(Boolean); }); }

async function readAll(btn) {
  const ck = String(state.current), acc = ck.includes('|') ? ck.split('|')[0] : 'gmail', key = keyOf(ck);
  const inbox = key === 'INBOX' || key === 'UNREAD', fFolder = inbox ? 'INBOX' : freeFolderOf(key);
  btn.disabled = true; btn.textContent = 'En cours…';
  let total = 0; const errs = [], gDone = [], fDone = [];
  const jobs = [];
  if (acc !== 'free' && !String(key).startsWith('F:')) jobs.push((async () => {
    let page = null;
    do {
      const p = new URLSearchParams({ q: inbox ? 'in:inbox is:unread' : 'is:unread', maxResults: 500 });
      if (!inbox) p.set('labelIds', key);
      if (page) p.set('pageToken', page);
      const r = (await api('messages?' + p.toString())) || {};
      const ids = (r.messages || []).map(m => m.id);
      for (let i = 0; i < ids.length; i += 1000) { const part = ids.slice(i, i + 1000); await api('messages/batchModify', { method: 'POST', body: { ids: part, removeLabelIds: ['UNREAD'] } }); gDone.push(part); }
      total += ids.length; page = r.nextPageToken;
    } while (page);
  })().catch(e => { if (e.message !== 'auth') errs.push('Gmail : ' + e.message); }));
  if (acc !== 'gmail' && freeOn() && fFolder) jobs.push(rapi('/free/readall', { method: 'POST', body: { folder: fFolder } }).then(r => { total += r.count || 0; if (r.uids && r.uids.length) fDone.push({ folder: r.folder || fFolder, uids: r.uids }); }).catch(e => errs.push('Free : ' + e.message)));
  await Promise.all(jobs);
  Object.keys(state.lists).forEach(k => delete state.lists[k]);
  const undo = () => Promise.all(gDone.map(ids => api('messages/batchModify', { method: 'POST', body: { ids, addLabelIds: ['UNREAD'] } })).concat(fDone.map(d => rapi('/free/flags', { method: 'POST', body: { folder: d.folder, uids: d.uids, seen: false } }))));
  if (errs.length) toast(errs.join(' · '));
  else if (total) undoToast(total + ' mail' + (total > 1 ? 's' : '') + ' marqué' + (total > 1 ? 's' : '') + ' comme lu' + (total > 1 ? 's' : ''), undo);
  else toast('Tout était déjà lu');
  route(); badgeNow(0);
}

let badgeT = null;
/* Après une lecture/suppression : baisse immédiate du chiffre puis relevé à jour côté relais */
function badgeNow(delta) {
  const b = $('#badge-inbox'); const cur = b && !b.hidden ? parseInt(b.textContent, 10) || 0 : 0;
  if (delta && cur) { const n = Math.max(0, cur - delta); if (b) { b.hidden = !n; b.textContent = n; } if (navigator.setAppBadge) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {}); }
  clearTimeout(badgeT); badgeT = setTimeout(() => updateBadge(true), 1500);
}
async function updateBadge(fresh) {
  try {
    let n, own, cnt = null;
    if (relayOn() && (relayGmailOn() || freeOn())) {
      const r = await rapi('/badge' + (fresh === true ? '?fresh=1' : ''));
      n = r.total || 0; cnt = { all: n, gmail: r.gmail || 0, free: r.free || 0 };
      const a = curAcc(); own = a === 'free' ? r.free : a === 'gmail' ? r.gmail : n;
    } else if (settings.primaryOnly) { const t = (await api('threads?' + new URLSearchParams({ q: 'in:inbox category:primary is:unread', maxResults: 100 }))) || {}; n = (t.threads || []).length; own = n; }
    else { const l = await api('labels/INBOX'); n = l.threadsUnread || 0; own = n; }
    const b = $('#badge-inbox'); b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
    const f = $('#fcount'); if (f) f.textContent = own ? '· ' + own : '';
    if (cnt) $$('.acc-n').forEach(el => { const v = cnt[el.dataset.n] || 0; el.textContent = v ? v + ' non lu' + (v > 1 ? 's' : '') : 'à jour'; });
    if (navigator.setAppBadge) { n ? navigator.setAppBadge(n).catch(() => {}) : navigator.clearAppBadge().catch(() => {}); }
  } catch (e) {}
}


/* ---------- Sélection multiple ---------- */
function bindListGestures(list) {
  let timer = null, longDone = false, sx = 0, sy = 0, cur = null, lock = null, dx = 0, bg = null, swiped = false;
  const reset = () => { if (cur) { cur.style.transition = 'transform .2s'; cur.style.transform = ''; const c = cur; setTimeout(() => { c.style.transition = ''; }, 220); } if (bg) { const g = bg; setTimeout(() => g.remove(), 200); } cur = null; bg = null; lock = null; dx = 0; };
  list.addEventListener('touchstart', e => {
    const a = e.target.closest('a.item'); if (!a || e.touches[0].clientX < 24) return;
    longDone = false; swiped = false; sx = e.touches[0].clientX; sy = e.touches[0].clientY; cur = a; lock = null; dx = 0;
    timer = setTimeout(() => { longDone = true; if (navigator.vibrate) navigator.vibrate(15); if (!state.sel) enterSelect(); toggleSel(a); }, 480);
  }, { passive: true });
  list.addEventListener('touchmove', e => {
    if (!cur) return;
    const mx = e.touches[0].clientX - sx, my = e.touches[0].clientY - sy;
    if (!lock && (Math.abs(mx) > 10 || Math.abs(my) > 10)) { clearTimeout(timer); timer = null; lock = Math.abs(mx) > Math.abs(my) * 1.3 && !state.sel ? 'h' : 'v'; }
    if (lock !== 'h') return;
    e.preventDefault();
    dx = Math.max(-300, Math.min(160, mx));
    if (!bg) {
      bg = document.createElement('div'); bg.className = 'swipe-bg';
      bg.style.top = cur.offsetTop + 'px'; bg.style.height = cur.offsetHeight + 'px';
      list.insertBefore(bg, cur);
    }
    const it = findItem(cur.dataset.id);
    const far = dx < -200;
    bg.classList.toggle('left', dx < 0); bg.classList.toggle('far', far); bg.classList.toggle('on', Math.abs(dx) > 90);
    if (far && !bg.dataset.far && navigator.vibrate) navigator.vibrate(8);
    bg.dataset.far = far ? '1' : '';
    bg.innerHTML = dx < 0 ? (far ? `<span>${ICON.block}Bloquer l’expéditeur</span>` : `<span>${ICON.trash}Supprimer</span><small>Continue pour bloquer</small>`) : `<span>${it && it.unread ? ICON.read + 'Lu' : ICON.unread + 'Non lu'}</span>`;
    cur.style.transform = 'translateX(' + dx + 'px)';
  }, { passive: false });
  list.addEventListener('touchend', () => {
    clearTimeout(timer); timer = null;
    if (lock === 'h' && cur) {
      swiped = true;
      if (Math.abs(dx) > 90) {
        const a = cur, id = a.dataset.id, it = findItem(id), kind = dx < -200 ? 'block' : dx < 0 ? 'trash' : (it && it.unread ? 'read' : 'unread');
        if (navigator.vibrate) navigator.vibrate(10);
        if (kind === 'block') { a.style.transition = 'transform .2s'; a.style.transform = 'translateX(-110%)'; quickBlock(it); setTimeout(() => { if (bg) bg.remove(); bg = null; cur = null; lock = null; }, 220); return; }
        if (kind === 'trash') { a.style.transition = 'transform .2s'; a.style.transform = 'translateX(-110%)'; }
        else reset();
        swipeAct(id, kind);
        setTimeout(() => { if (bg) bg.remove(); bg = null; cur = null; lock = null; }, 220);
        return;
      }
    }
    reset();
  });
  list.addEventListener('contextmenu', e => { if (e.target.closest('a.item')) e.preventDefault(); });
  list.addEventListener('click', e => {
    const a = e.target.closest('a.item'); if (!a) return;
    if (longDone || swiped) { e.preventDefault(); longDone = false; swiped = false; return; }
    if (state.sel) { e.preventDefault(); toggleSel(a); }
  });
}
function findItem(id) { for (const d of Object.values(state.lists)) { const i = d.items.find(x => x.id === id); if (i) return i; } return null; }
async function swipeAct(id, kind) {
  let r;
  try { r = await act([id], kind); } catch (e) { reDraw(); return; }
  if (!r.ok) { toast('Action impossible'); reDraw(); return; }
  Object.entries(state.lists).forEach(([k, d]) => { d.items = d.items.map(i => i.id === id ? ACT_PATCH[kind](i, k) : i).filter(Boolean); });
  reDraw();
  undoToast(kind === 'trash' ? 'Mail supprimé' : kind === 'read' ? 'Marqué comme lu' : 'Marqué comme non lu', r.undo);
  badgeNow(0);
}
function reDraw() { const c = state.listCtx; if (c && state.lists[c.cacheKey]) drawList(state.lists[c.cacheKey], c.plain); }
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
  $('#sel-read').onclick = () => bulk({ removeLabelIds: ['UNREAD'] }, (i, k) => keyOf(k) === 'UNREAD' ? null : Object.assign({}, i, { unread: false }), 'marqué(s) comme lu(s)');
  $('#sel-unread').onclick = () => bulk({ addLabelIds: ['UNREAD'] }, i => Object.assign({}, i, { unread: true }), 'marqué(s) comme non lu(s)');
  $('#sel-archive').onclick = () => bulk({ removeLabelIds: ['INBOX'] }, (i, k) => ['INBOX', 'UNREAD'].includes(keyOf(k)) ? null : i, 'archivé(s)');
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
/* Applique une action à des mails (Gmail et Free) et renvoie de quoi l'annuler */
async function act(ids, kind) {
  const undo = []; let ok = 0;
  const gIds = ids.filter(i => !i.startsWith('f:')), fIds = ids.filter(i => i.startsWith('f:'));
  const gBody = { read: { removeLabelIds: ['UNREAD'] }, unread: { addLabelIds: ['UNREAD'] }, archive: { removeLabelIds: ['INBOX'] } }[kind];
  const gUndo = { read: { addLabelIds: ['UNREAD'] }, unread: { removeLabelIds: ['UNREAD'] }, archive: { addLabelIds: ['INBOX'] } }[kind];
  await pool(gIds, 6, async id => {
    try {
      if (kind === 'trash') { await api('threads/' + id + '/trash', { method: 'POST' }); undo.push(() => api('threads/' + id + '/untrash', { method: 'POST' })); }
      else { await api('threads/' + id + '/modify', { method: 'POST', body: gBody }); undo.push(() => api('threads/' + id + '/modify', { method: 'POST', body: gUndo })); }
      ok++;
    } catch (e) { if (e.message === 'auth') throw e; }
  });
  const byFolder = {};
  fIds.forEach(id => { const p = parseFreeId(id); (byFolder[p.folder] = byFolder[p.folder] || []).push(p.uid); });
  for (const [folder, uids] of Object.entries(byFolder)) {
    try {
      if (kind === 'trash' || kind === 'archive') {
        const r = await rapi('/free/move', { method: 'POST', body: { folder, uids, to: kind === 'trash' ? 'TRASH' : 'ARCHIVE' } });
        if (r.uids && r.uids.length) undo.push(() => rapi('/free/move', { method: 'POST', body: { folder: r.dest, uids: r.uids, to: folder } }));
      } else {
        await rapi('/free/flags', { method: 'POST', body: { folder, uids, seen: kind === 'read' } });
        undo.push(() => rapi('/free/flags', { method: 'POST', body: { folder, uids, seen: kind !== 'read' } }));
      }
      ok += uids.length;
    } catch (e) { toast('Free : ' + e.message); }
  }
  return { ok, undo: () => Promise.all(undo.map(f => f())) };
}
const ACT_LABEL = { trash: ['supprimé', 'supprimés'], archive: ['archivé', 'archivés'], read: ['marqué lu', 'marqués lus'], unread: ['marqué non lu', 'marqués non lus'] };
const ACT_PATCH = { trash: () => null, archive: (i, k) => ['INBOX', 'UNREAD'].includes(keyOf(k)) ? null : i, read: i => Object.assign({}, i, { unread: false }), unread: i => Object.assign({}, i, { unread: true }) };
async function bulk(body, patch, label) {
  const ids = [...state.sel];
  if (!ids.length) return;
  $$('#selbar button').forEach(b => b.disabled = true);
  const kind = body === 'trash' ? 'trash' : (body.addLabelIds || []).includes('UNREAD') ? 'unread' : (body.removeLabelIds || []).includes('UNREAD') ? 'read' : 'archive';
  let r;
  try { r = await act(ids, kind); } catch (e) { if (e.message === 'auth') return; r = { ok: 0, undo: async () => {} }; }
  const set = new Set(ids);
  Object.entries(state.lists).forEach(([k, d]) => { d.items = d.items.map(i => set.has(i.id) ? patch(i, k) : i).filter(Boolean); });
  exitSelect();
  const c = state.listCtx;
  if (c && state.lists[c.cacheKey]) drawList(state.lists[c.cacheKey], c.plain);
  const msg = r.ok + ' mail' + (r.ok > 1 ? 's ' : ' ') + label + (r.ok < ids.length ? ' (' + (ids.length - r.ok) + ' en échec)' : '');
  r.ok ? undoToast(msg, r.undo) : toast(msg);
  badgeNow(0);
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
const WEBMAIL = ['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.fr', 'hotmail.com', 'hotmail.fr', 'outlook.com', 'outlook.fr', 'live.com', 'live.fr', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'free.fr', 'orange.fr', 'wanadoo.fr', 'sfr.fr', 'neuf.fr', 'laposte.net', 'bbox.fr', 'aol.com', 'gmx.fr', 'gmx.com', 'proton.me', 'protonmail.com'];
function rootDomain(addr) {
  const host = (addr.includes('@') ? addr.split('@')[1] : addr).toLowerCase().trim();
  const p = host.split('.');
  if (p.length >= 3 && /^(co|com|org|net|gov|ac|gouv)$/.test(p[p.length - 2]) && p[p.length - 1].length === 2) return p.slice(-3).join('.');
  return p.slice(-2).join('.');
}
// Cible du blocage : le domaine de la marque, sauf messageries grand public (adresse exacte)
function blockTarget(email) { const d = rootDomain(email); return WEBMAIL.includes(d) ? email.toLowerCase() : d; }
function isCovered(target, froms) { return froms.some(f => f === target || (!f.includes('@') && (target === f || target.endsWith('.' + f) || target.endsWith('@' + f)))); }
async function moveExisting(target, lab) {
  let page = null, n = 0;
  do {
    const p = new URLSearchParams({ q: 'from:' + target + ' in:inbox', maxResults: 500 });
    if (page) p.set('pageToken', page);
    const r = (await api('messages?' + p.toString())) || {};
    const ids = (r.messages || []).map(m => m.id);
    if (ids.length) await api('messages/batchModify', { method: 'POST', body: { ids, addLabelIds: [lab], removeLabelIds: ['INBOX', 'UNREAD'] } });
    n += ids.length; page = r.nextPageToken;
  } while (page && n < 5000);
  return n;
}
/* Blocage en un geste (balayage long ou bouton Bloquer d'un mail), avec Annuler */
async function quickBlock(item) {
  if (!auth.hasSettingsScope()) return needScope();
  if (!item || !item.fromEmail) { toast('Expéditeur introuvable'); return; }
  const t = blockTarget(item.fromEmail);
  const names = LS.get('blockedNames', {}); names[t] = t.includes('@') ? (item.fromName || t) : brandOf(t); LS.set('blockedNames', names);
  const dates = LS.get('blockedDates', {}); dates[t] = Date.now(); LS.set('blockedDates', dates);
  try {
    const lab = await blockLabelId();
    const froms = (((await api('settings/filters')) || {}).filter || []).map(f => (f.criteria && f.criteria.from || '').toLowerCase());
    let filterId = null;
    if (!isCovered(t, froms)) filterId = (await api('settings/filters', { method: 'POST', body: { criteria: { from: t }, action: { addLabelIds: [lab], removeLabelIds: ['INBOX', 'UNREAD'] } } })).id;
    let moved = await moveExisting(t, lab);
    if (freeOn()) { try { moved += (await rapi('/free/block', { method: 'POST', body: { target: t } })).moved || 0; } catch (e) {} }
    const hit = e => e && (e.toLowerCase() === t || blockTarget(e) === t);
    Object.values(state.lists).forEach(d => { d.items = d.items.filter(i => !hit(i.fromEmail)); });
    reDraw(); badgeNow(0);
    undoToast(names[t] + ' bloqué' + (moved > 1 ? ' · ' + moved + ' mails rangés' : ''), async () => {
      if (filterId) await api('settings/filters/' + filterId, { method: 'DELETE' });
      let page = null;
      do {
        const p = new URLSearchParams({ q: 'from:' + t, labelIds: lab, maxResults: 500 }); if (page) p.set('pageToken', page);
        const r = (await api('messages?' + p.toString())) || {};
        const ids = (r.messages || []).map(m => m.id);
        if (ids.length) await api('messages/batchModify', { method: 'POST', body: { ids, addLabelIds: ['INBOX'], removeLabelIds: [lab] } });
        page = r.nextPageToken;
      } while (page);
    });
  } catch (e) { if (e.message === 'scope') needScope(); else if (e.message !== 'auth') toast('Échec : ' + e.message); reDraw(); }
}
function blockSheet(ids, extra) {
  if (!auth.hasSettingsScope()) return needScope();
  const targets = [];
  Object.values(state.lists).map(d => d.items).concat([extra || []]).forEach(items => items.forEach(i => {
    if (!ids.includes(i.id) || !i.fromEmail) return;
    const t = blockTarget(i.fromEmail);
    if (!targets.find(x => x.t === t)) targets.push({ t, name: t.includes('@') ? i.fromName : brandOf(t), sender: i.fromName, sample: i.fromEmail });
  }));
  if (!targets.length) { toast('Aucun expéditeur à bloquer'); return; }
  openSheet(`<span class="grip"></span><h2>Bloquer ${targets.length > 1 ? 'ces expéditeurs' : 'cet expéditeur'}</h2>
    <p style="margin:0 0 4px;color:var(--muted);font-size:.8rem;line-height:1.45">Le blocage vise toute la marque : toutes ses adresses, présentes et futures. Leurs mails iront dans « ${BLOCK_LABEL} », marqués comme lus. Annulable dans Réglages.</p>
    ${targets.map((a, i) => `<div class="blk-row"><label class="check"><input type="checkbox" class="blk-on" data-i="${i}" checked><span style="display:flex;flex-direction:column;min-width:0"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.name)}</b><span style="font-size:.75rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.sender)} · ${esc(a.sample)}</span></span></label>${a.t.includes('@') ? '' : `<label class="switch blk-dom"><span>Toutes les adresses @${esc(a.t)}</span><input type="checkbox" class="blk-all" data-i="${i}" checked></label>`}</div>`).join('')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"><button class="btn" data-close>Annuler</button><button class="btn primary" id="blk-ok">Bloquer</button></div>`);
  $('#blk-ok').onclick = async () => {
    const names = LS.get('blockedNames', {});
    const chosen = [];
    $$('#sheet .blk-on').filter(i => i.checked).forEach(i => {
      const a = targets[+i.dataset.i];
      const all = $('#sheet .blk-all[data-i="' + i.dataset.i + '"]');
      const t = all && !all.checked ? a.sample.toLowerCase() : a.t;
      chosen.push(t); names[t] = t === a.t ? a.name : a.sender;
    });
    if (!chosen.length) return closeSheet();
    LS.set('blockedNames', names);
    const dates = LS.get('blockedDates', {}); chosen.forEach(t => { if (!dates[t]) dates[t] = Date.now(); }); LS.set('blockedDates', dates);
    $('#blk-ok').disabled = true; $('#blk-ok').textContent = 'Blocage…';
    try {
      const lab = await blockLabelId();
      const froms = (((await api('settings/filters')) || {}).filter || []).map(f => (f.criteria && f.criteria.from || '').toLowerCase());
      await pool(chosen.filter(t => !isCovered(t, froms)), 3, t => api('settings/filters', { method: 'POST', body: { criteria: { from: t }, action: { addLabelIds: [lab], removeLabelIds: ['INBOX', 'UNREAD'] } } }));
      let moved = 0;
      for (const t of chosen) moved += await moveExisting(t, lab);
      if (freeOn()) for (const t of chosen) { try { moved += (await rapi('/free/block', { method: 'POST', body: { target: t } })).moved || 0; } catch (e) { toast('Free : ' + e.message); } }
      const hit = e => chosen.some(t => t === e.toLowerCase() || blockTarget(e) === t);
      Object.values(state.lists).forEach(d => { d.items = d.items.filter(i => !(i.fromEmail && hit(i.fromEmail))); });
      closeSheet(); exitSelect();
      const c = state.listCtx; if (c && state.lists[c.cacheKey]) drawList(state.lists[c.cacheKey], c.plain);
      toast(chosen.length + (chosen.length > 1 ? ' expéditeurs bloqués' : ' expéditeur bloqué') + (moved ? ', ' + moved + ' mail' + (moved > 1 ? 's' : '') + ' rangé' + (moved > 1 ? 's' : '') : ''));
      badgeNow(0);
    } catch (e) {
      closeSheet();
      if (e.message === 'scope') needScope(); else if (e.message !== 'auth') toast('Échec : ' + e.message);
    }
  };
}
// Fusionne les règles par adresse en une règle par marque
async function mergeBlocked(fs, lab, box) {
  const names = LS.get('blockedNames', {});
  const groups = {};
  fs.forEach(f => { const from = f.criteria.from.toLowerCase(); const t = blockTarget(from); (groups[t] = groups[t] || []).push(f); });
  let created = 0, removed = 0;
  for (const [t, list] of Object.entries(groups)) {
    if (t.includes('@')) continue;
    const domainRule = list.find(f => f.criteria.from.toLowerCase() === t);
    const addrRules = list.filter(f => f !== domainRule);
    if (!addrRules.length) continue;
    if (!domainRule) { await api('settings/filters', { method: 'POST', body: { criteria: { from: t }, action: { addLabelIds: [lab], removeLabelIds: ['INBOX', 'UNREAD'] } } }); created++; }
    if (!names[t]) names[t] = brandOf(t);
    for (const f of addrRules) { await api('settings/filters/' + f.id, { method: 'DELETE' }); removed++; }
    await moveExisting(t, lab);
  }
  LS.set('blockedNames', names);
  return { created, removed };
}
function brandOf(email) {
  const d = rootDomain(email).split('.');
  const core = d[0];
  return core.charAt(0).toUpperCase() + core.slice(1);
}
async function renderBlocked(box) {
  getLabels().then(ls => { const l = (ls || []).find(x => x.name === BLOCK_LABEL), a = $('#s-junk'); if (a) { if (l) a.href = '#/list/' + encodeURIComponent(l.id); else a.hidden = true; } }).catch(() => {});
  if (!auth.hasSettingsScope()) { box.innerHTML = '<p>Aucun expéditeur bloqué pour l’instant.</p>'; return; }
  try {
    const labels = await getLabels();
    const l = labels.find(x => x.name === BLOCK_LABEL);
    const fs = l ? (((await api('settings/filters')) || {}).filter || []).filter(f => f.action && (f.action.addLabelIds || []).includes(l.id) && f.criteria && f.criteria.from) : [];
    if (!fs.length) { const nEl = $('#s-blk-n'); if (nEl) nEl.textContent = '0'; box.innerHTML = '<p>Aucun expéditeur bloqué pour l’instant.</p>'; return; }
    const names = LS.get('blockedNames', {});
    const label = e => names[e.toLowerCase()] || (e.includes('@') && WEBMAIL.includes(rootDomain(e)) ? e.split('@')[0] : brandOf(e));
    const sub = e => e.includes('@') ? e : 'Toutes les adresses @' + e;
    const after = new Set(fs.map(f => blockTarget(f.criteria.from.toLowerCase()))).size;
    const mergeBtn = after < fs.length ? `<button class="btn primary" id="blk-merge">Regrouper par marque (${fs.length} → ${after})</button><p style="margin:0">Une seule règle par marque bloque toutes ses adresses, y compris celles qu'elle utilisera demain.</p>` : '';
    const dates = LS.get('blockedDates', {});
    const first = LS.get('blockedSeenSince', 0) || Date.now(); LS.set('blockedSeenSince', first);
    const dOf = f => dates[f.criteria.from.toLowerCase()] || 0;
    const order = LS.get('blockedSort', 'date');
    if (order === 'date') fs.sort((a, b) => (dOf(b) - dOf(a)) || label(a.criteria.from).localeCompare(label(b.criteria.from), 'fr'));
    else fs.sort((a, b) => label(a.criteria.from).localeCompare(label(b.criteria.from), 'fr'));
    const fmtD = t => t ? 'bloqué le ' + new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' à ' + new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'bloqué avant le ' + new Date(first).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const sortBar = `<div class="accounts" role="tablist" style="margin:0 0 8px"><button class="${order === 'date' ? 'on' : ''}" data-bsort="date">Plus récents</button><button class="${order === 'az' ? 'on' : ''}" data-bsort="az">A → Z</button></div>`;
    const nEl = $('#s-blk-n'); if (nEl) nEl.textContent = String(fs.length);
    box.innerHTML = mergeBtn + sortBar + `<div>` + fs.map(f => `<div class="lab-row" style="padding:6px 0;gap:10px"><span class="nm" style="min-width:0;display:flex;flex-direction:column"><b style="font-size:.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label(f.criteria.from))}</b><span style="font-size:.72rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(sub(f.criteria.from))}</span><span style="font-size:.7rem;color:var(--muted);opacity:.8">${esc(fmtD(dOf(f)))}</span></span><button class="btn" style="height:38px;font-size:.75rem" data-fid="${esc(f.id)}">Débloquer</button></div>`).join('') +
      `</div>`;
    $$('[data-bsort]', box).forEach(b => b.onclick = () => { LS.set('blockedSort', b.dataset.bsort); renderBlocked(box); });
    const mb = $('#blk-merge', box);
    if (mb) mb.onclick = async () => { mb.disabled = true; mb.textContent = 'Regroupement…'; try { const r = await mergeBlocked(fs, l.id, box); toast('Règles regroupées : ' + r.removed + ' remplacées'); } catch (e) { toast('Échec : ' + e.message); } renderBlocked(box); };
    $$('button[data-fid]', box).forEach(b => b.onclick = async () => { b.disabled = true; try { await api('settings/filters/' + b.dataset.fid, { method: 'DELETE' }); toast('Débloqué'); await renderBlocked(box); } catch (e) { b.disabled = false; toast('Échec : ' + e.message); } });
  } catch (e) { box.innerHTML = '<p>Liste indisponible.</p>'; }
}



const fmtMo = b => b >= 1073741824 ? (b / 1073741824).toFixed(2).replace('.', ',') + ' Go' : b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(b / 1024)) + ' Ko';
async function labelSize(labelId) {
  if (String(labelId).startsWith('F:')) { try { const f = await rapi('/free/size?' + new URLSearchParams({ folder: freeFolderOf(labelId) })); return f.count ? fmtMo(f.bytes) + ' · ' + f.count + ' mail' + (f.count > 1 ? 's' : '') : 'Vide'; } catch (e) { return 'Taille indisponible'; } }
  // Quota Gmail : pas de lecture mail par mail. Nombre exact via le libellé, taille estimée sur un échantillon, mémorisée 30 min.
  const gmail = (async () => {
    const lab = (await api('labels/' + encodeURIComponent(labelId))) || {};
    let count = lab.messagesTotal || 0;
    // Gmail met parfois du temps à recompter un dossier renommé ou déplacé : on vérifie au lieu de croire « 0 »
    if (!count) { const r = (await api('messages?' + new URLSearchParams({ labelIds: labelId, maxResults: 100 }))) || {}; count = (r.messages || []).length; }
    if (!count) return { count: 0, bytes: 0 };
    let memo = null; try { memo = JSON.parse(localStorage.getItem('ml-size-' + labelId) || 'null'); } catch (e) {}
    if (memo && memo.count === count && Date.now() - memo.at < 30 * 60000) return memo;
    const r = (await api('messages?' + new URLSearchParams({ labelIds: labelId, maxResults: 60 }).toString())) || {};
    const ids = (r.messages || []).map(m => m.id);
    const sizes = (await pool(ids, 3, id => api('messages/' + id + '?format=minimal&fields=sizeEstimate').then(x => (x && x.sizeEstimate) || 0).catch(() => null))).filter(x => x != null);
    const avg = sizes.length ? sizes.reduce((x, y) => x + y, 0) / sizes.length : 0;
    const out = { count, bytes: Math.round(avg * count), approx: count > sizes.length, at: Date.now() };
    try { localStorage.setItem('ml-size-' + labelId, JSON.stringify(out)); } catch (e) {}
    return out;
  })();
  const free = freeOn() && isBlockLabel(labelId) ? rapi('/free/size?folder=BLOCKED').catch(() => null) : Promise.resolve(null);
  try {
    const [g, f] = await Promise.all([gmail.catch(() => null), free]);
    if (!g && !f) return 'Taille indisponible';
    const count = (g ? g.count : 0) + (f ? f.count : 0), bytes = (g ? g.bytes : 0) + (f ? f.bytes : 0);
    if (!count) return 'Vide';
    const parts = freeOn() && f ? ' (Gmail ' + (g ? g.count : '?') + ' · Free ' + f.count + ')' : '';
    return (g && g.approx ? '≈ ' : '') + fmtMo(bytes) + ' · ' + count + ' mail' + (count > 1 ? 's' : '') + parts;
  } catch (e) { return 'Taille indisponible'; }
}

async function emptyLabel(labelId, name) {
  openSheet(`<span class="grip"></span><h2>Tout supprimer ?</h2>
    <p style="margin:0;color:var(--muted);font-size:.85rem;line-height:1.5">Tous les mails « ${esc(name)} » partent dans la corbeille${String(labelId).startsWith('F:') ? ' de Free' : freeOn() && isBlockLabel(labelId) ? ' de leur boîte, Gmail et Free' : ' de Gmail'}.${String(labelId).startsWith('F:') ? '' : ' Côté Gmail, ils y restent 30 jours avant suppression définitive : la place n’est libérée qu’à ce moment-là, ou plus tôt si tu vides la corbeille.'}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"><button class="btn" data-close>Annuler</button><button class="btn primary" id="empty-ok">Tout supprimer</button></div>`);
  $('#empty-ok').onclick = async () => {
    const b = $('#empty-ok'); b.disabled = true; b.textContent = 'Suppression…';
    let total = 0;
    try {
      let page = null;
      if (String(labelId).startsWith('F:')) {
        total += (await rapi('/free/empty', { method: 'POST', body: { folder: freeFolderOf(labelId) } })).moved || 0;
      } else do {
        const p = new URLSearchParams({ labelIds: labelId, maxResults: 500 });
        if (page) p.set('pageToken', page);
        const r = (await api('messages?' + p.toString())) || {};
        const ids = (r.messages || []).map(m => m.id);
        for (let i = 0; i < ids.length; i += 1000) {
          await api('messages/batchModify', { method: 'POST', body: { ids: ids.slice(i, i + 1000), addLabelIds: ['TRASH'], removeLabelIds: ['INBOX', 'UNREAD'] } });
        }
        total += ids.length;
        b.textContent = total + ' supprimés…';
        page = r.nextPageToken;
      } while (page);
      if (freeOn() && isBlockLabel(labelId)) { try { total += (await rapi('/free/empty', { method: 'POST', body: { folder: 'BLOCKED' } })).moved || 0; } catch (e) { toast('Free : ' + e.message); } }
      closeSheet();
      Object.keys(state.lists).forEach(k => delete state.lists[k]);
      toast(total ? total + ' mail' + (total > 1 ? 's' : '') + ' placé' + (total > 1 ? 's' : '') + ' dans la corbeille' : 'Rien à supprimer');
      route();
    } catch (e) { closeSheet(); if (e.message !== 'auth') toast('Échec : ' + e.message); }
  };
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
    api('threads/' + id + '/modify', { method: 'POST', body: { removeLabelIds: ['UNREAD'] } }).then(() => badgeNow(1)).catch(() => {});
    patchCached(id, i => Object.assign({}, i, { unread: false }));
  }
  const lastM = msgs[msgs.length - 1] || {};
  const unsubH = hdr(lastM, 'List-Unsubscribe'), unsubP = hdr(lastM, 'List-Unsubscribe-Post');
  const chips = [...labels].map(l => l === 'INBOX' ? '<span class="chip">Réception</span>' : (labelById(l) ? `<span class="chip lab" style="--c:${esc(labelColor(labelById(l)))}">${esc(labelById(l).name)}</span>` : '')).join('');
  v.innerHTML = `
    <div class="top"><a class="back" href="#" id="back">${ICON.back}Retour</a></div>
    <h1 class="thread-title">${esc(subject)}</h1>
    <div class="thread-chips">${chips}</div>
    ${unsubH ? '<div class="unsub-bar"><span>Mail de liste de diffusion</span><button class="btn" id="t-unsub">Se désabonner</button></div>' : ''}
    <div class="toolbar">
      <button id="t-archive">${ICON.archive}Archiver</button>
      <button id="t-label">${ICON.tag}Classer</button>
      <button id="t-block">${ICON.block}Bloquer</button>
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
  $('#t-trash').onclick = async () => { try { await api('threads/' + id + '/trash', { method: 'POST' }); patchCached(id, () => null); toast('Placé dans la corbeille'); goBack(); badgeNow(0); } catch (e) { if (e.message !== 'auth') toast(e.message); } };
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
  $('#t-block').onclick = () => { const it = Object.assign({ id }, summarize(t)); goBack(); quickBlock(it); };
  const un = $('#t-unsub'); if (un) un.onclick = () => unsubscribe(unsubH, unsubP, 'gmail', (hdr(lastM, 'From').match(/^\s*"?([^"<]*?)"?\s*</) || [])[1] || hdr(lastM, 'From'));
}
async function renderFree(folder, uid) {
  const v = $('#view');
  v.innerHTML = `<div class="top"><a class="back" href="#" id="back">${ICON.back}Retour</a></div><div class="loading">Ouverture…</div>`;
  $('#back').onclick = e => { e.preventDefault(); goBack(); };
  let m;
  try { m = await rapi('/free/message?' + new URLSearchParams({ folder, uid })); }
  catch (e) { v.querySelector('.loading').outerHTML = `<div class="empty">Impossible d'ouvrir : ${esc(e.message)}</div>`; return; }
  const id = 'f:' + uid + ':' + folder;
  if (!m.seen) { rapi('/free/flags', { method: 'POST', body: { folder, uids: [uid], seen: true } }).then(() => badgeNow(1)).catch(() => {}); patchCached(id, i => Object.assign({}, i, { unread: false })); }
  state.freeMsg = m;
  v.innerHTML = `
    <div class="top"><a class="back" href="#" id="back">${ICON.back}Retour</a></div>
    <h1 class="thread-title">${esc(m.subject)}</h1>
    <div class="thread-chips"><span class="chip acc-free">Free</span><span class="chip">${esc(folder === 'INBOX' ? 'Réception' : folder)}</span></div>
    ${m.unsub ? '<div class="unsub-bar"><span>Mail de liste de diffusion</span><button class="btn" id="t-unsub">Se désabonner</button></div>' : ''}
    <div class="toolbar">
      <button id="t-archive">${ICON.archive}Archiver</button>
      <button id="t-fmove">${ICON.tag}Classer</button>
      <button id="t-block">${ICON.block}Bloquer</button>
      <button id="t-trash">${ICON.trash}Supprimer</button>
      <button id="t-unread">${ICON.unread}Non lu</button>
    </div>
    <div id="msgs"><article class="msg"><div class="msg-head" style="cursor:default">
      <span class="avatar" aria-hidden="true">${esc(initials(m.from.name || m.from.email || '?'))}</span>
      <span class="meta"><span class="from" style="display:block">${esc(isMe(m.from.email) ? 'Moi' : (m.from.name || m.from.email))}</span><span class="to" style="display:block">à ${esc(m.to || '…')}${m.cc ? ', ' + esc(m.cc) : ''}</span></span>
      <span class="date">${esc(fmtDate(m.date, true))}</span></div><div class="content"></div></article></div>
    <div class="reply-bar">
      <button class="btn primary" id="r-reply">Répondre</button>
      <button class="btn" id="r-all">À tous</button>
      <button class="btn" id="r-fwd">Transférer</button>
    </div>`;
  $('#back').onclick = e => { e.preventDefault(); goBack(); };
  const att = a => a.data ? Promise.resolve(a.data) : rapi('/free/attachment?' + new URLSearchParams({ folder, uid, idx: a.idx })).then(r => { a.data = r.data; return r.data; });
  renderBody(null, $('#msgs .content'), { acc: { html: fixMojibake(m.html), text: fixMojibake(m.text), att: m.attachments || [] }, att });
  const move = async (to, label) => { try { await rapi('/free/move', { method: 'POST', body: { folder, uids: [uid], to } }); patchCached(id, () => null); toast(label); badgeNow(0); goBack(); } catch (e) { toast(e.message); } };
  $('#t-archive').onclick = () => move('ARCHIVE', 'Archivé');
  $('#t-trash').onclick = () => move('TRASH', 'Placé dans la corbeille');
  $('#t-unread').onclick = async () => { try { await rapi('/free/flags', { method: 'POST', body: { folder, uids: [uid], seen: false } }); patchCached(id, i => Object.assign({}, i, { unread: true })); toast('Marqué non lu'); badgeNow(0); goBack(); } catch (e) { toast(e.message); } };
  $('#t-block').onclick = () => { goBack(); quickBlock({ id, fromEmail: m.from.email, fromName: m.from.name }); };
  $('#t-fmove').onclick = () => freeMoveSheet(id, folder, uid);
  const un = $('#t-unsub'); if (un) un.onclick = () => unsubscribe(m.unsub, m.unsubPost, 'free', m.from.name || m.from.email);
  $('#r-reply').onclick = () => openCompose('reply', null, m);
  $('#r-all').onclick = () => openCompose('all', null, m);
  $('#r-fwd').onclick = () => openCompose('fwd', null, m);
}
/* Désabonnement (en-tête List-Unsubscribe) : un clic si l'expéditeur le permet, sinon mail de désinscription ou page web */
async function unsubscribe(h, post, acc, who) {
  const links = (h.match(/<[^>]+>/g) || []).map(x => x.slice(1, -1).trim());
  const web = links.find(u => /^https:/i.test(u)), mail = links.find(u => /^mailto:/i.test(u));
  const oneClick = web && /one-click/i.test(post || '') && relayOn();
  openSheet(`<span class="grip"></span><h2>Se désabonner ?</h2>
    <p style="margin:0;color:var(--muted);font-size:.85rem;line-height:1.5">${esc(who || 'Cet expéditeur')} ne devrait plus t'envoyer cette liste de diffusion. ${oneClick || mail ? 'La demande part directement depuis l’appli.' : 'La page de désinscription de l’expéditeur va s’ouvrir : confirme là-bas.'} Les mails déjà reçus restent en place.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"><button class="btn" data-close>Annuler</button><button class="btn primary" id="un-ok">Se désabonner</button></div>`);
  $('#un-ok').onclick = async () => {
    const b = $('#un-ok'); b.disabled = true; b.textContent = 'Envoi…';
    try {
      if (oneClick) await rapi('/unsubscribe', { method: 'POST', body: { url: web } });
      else if (mail) {
        const u = new URL(mail.replace(/^mailto:/i, 'mailto://'));
        const to = decodeURIComponent(mail.replace(/^mailto:/i, '').split('?')[0]);
        const subject = u.searchParams.get('subject') || 'unsubscribe', body = u.searchParams.get('body') || 'unsubscribe';
        if (acc === 'free') await rapi('/free/send', { method: 'POST', body: { to, subject, text: body } });
        else await api('messages/send', { method: 'POST', body: { raw: buildRaw({ to, subject, body }) } });
      } else if (web) { window.open(web, '_blank', 'noopener'); closeSheet(); return; }
      else throw new Error('aucun lien utilisable');
      closeSheet(); toast('Désabonnement envoyé');
      const ub = $('.unsub-bar'); if (ub) ub.innerHTML = '<span>Désabonnement demandé ✓</span>';
    } catch (e) {
      if (web) { closeSheet(); window.open(web, '_blank', 'noopener'); toast('Confirme sur la page de l’expéditeur'); }
      else { closeSheet(); toast('Échec : ' + e.message); }
    }
  };
}
async function threadAction(id, body, msg, leave) {
  try {
    await api('threads/' + id + '/modify', { method: 'POST', body });
    if (body.removeLabelIds && body.removeLabelIds.includes('INBOX')) Object.entries(state.lists).forEach(([k, c]) => { if (['INBOX', 'UNREAD'].includes(keyOf(k))) c.items = c.items.filter(i => i.id !== id); });
    toast(msg); badgeNow(0);
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

function renderBody(m, container, pre) {
  const acc = pre ? pre.acc : { html: null, text: null, att: [] };
  const fetcher = pre ? pre.att : (a => attData(m.id, a));
  if (!pre) walkParts(m.payload, acc);
  if (!pre && acc.html == null && acc.text == null && m.payload && m.payload.body && m.payload.body.data) {
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
      if (a) fetcher(a).then(b64 => { img.src = 'data:' + a.mime + ';base64,' + b64; }).catch(() => {});
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
      b.onclick = () => openAttachment(fetcher, a, b);
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
async function openAttachment(fetcher, a, btn) {
  const label = btn.querySelector('.s'); const old = label.textContent; label.textContent = '…';
  try {
    const b64 = await fetcher(a);
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
      badgeNow(0);
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
/* ---------- Dossiers : Gmail + Free, arborescence, favoris, recherche ---------- */
const FOLD_ICON = '<svg class="fic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
function buildTree(items, sep) {
  // items : [{ key, full, href, n }] ; regroupe par chemin « A/B/C »
  const root = { children: new Map() };
  for (const it of items) {
    const parts = it.full.split(sep); let node = root, path = '';
    parts.forEach((p, i) => {
      path = path ? path + sep + p : p;
      if (!node.children.has(p)) node.children.set(p, { name: p, path, children: new Map() });
      node = node.children.get(p);
      if (i === parts.length - 1) Object.assign(node, it);
    });
  }
  const sum = n => { n.total = (n.n || 0) + [...n.children.values()].reduce((a, c) => a + sum(c), 0); return n.total; };
  [...root.children.values()].forEach(sum);
  return root;
}
/* Suivi : en attente de réponse */
async function renderWaiting() {
  const v = $('#view');
  v.innerHTML = `<div class="top"><a class="back" href="#/labels">${ICON.back}Dossiers</a></div><h1 class="thread-title">En attente</h1>
    <p class="fhint">Tes mails envoyés sans réponse depuis plus de 3 jours, et les mails de vraies personnes (hors newsletters) auxquels tu n'as pas répondu depuis 2 semaines.</p>
    <div id="list"><div class="loading">Analyse de tes échanges…</div></div>`;
  const day = 86400000, now = Date.now();
  const md = '&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=List-Unsubscribe&metadataHeaders=Precedence';
  const theirs = [], mine = [];
  const jobs = [];
  if (settings.clientId || relayGmailOn()) jobs.push((async () => {
    const [a, b] = await Promise.all([
      api('threads?' + new URLSearchParams({ q: 'in:sent newer_than:30d older_than:3d', maxResults: 40 })),
      api('threads?' + new URLSearchParams({ q: 'in:inbox newer_than:14d -category:promotions -category:social -category:updates -category:forums', maxResults: 40 }))]);
    const ta = await pool((a && a.threads) || [], 4, t => api('threads/' + t.id + '?format=metadata' + md).catch(() => null));
    const tb = await pool((b && b.threads) || [], 4, t => api('threads/' + t.id + '?format=metadata' + md).catch(() => null));
    ta.filter(Boolean).forEach(t => { const ms = t.messages || [], last = ms[ms.length - 1] || {}; if ((last.labelIds || []).includes('SENT') && +last.internalDate < now - 3 * day && !splitAddrs(hdr(last, 'To')).map(parseAddr).every(x => isMe(x.email))) theirs.push(Object.assign(summarize(t), { acc: 'gmail' })); });
    tb.filter(Boolean).forEach(t => { const ms = t.messages || [], last = ms[ms.length - 1] || {}; const fr = parseAddr(hdr(last, 'From')).email || '';
      if (!(last.labelIds || []).includes('SENT') && !hdr(last, 'List-Unsubscribe') && !/bulk|list/i.test(hdr(last, 'Precedence')) && !isMe(fr) && !/no-?reply|ne-pas-repondre|notification|newsletter/i.test(fr)) mine.push(Object.assign(summarize(t), { acc: 'gmail' })); });
  })().catch(e => { if (e.message !== 'auth') toast('Gmail : ' + e.message); }));
  if (freeOn()) jobs.push(rapi('/free/waiting').then(r => { (r.theirs || []).forEach(x => theirs.push(freeItem(x))); (r.mine || []).forEach(x => mine.push(freeItem(x))); }).catch(e => toast('Free : ' + e.message)));
  await Promise.all(jobs);
  const l = $('#list'); if (!l) return;
  state.showAcc = freeOn();
  theirs.sort((a, b) => a.date - b.date); mine.sort((a, b) => b.date - a.date);
  const age = d => { const n = Math.floor((now - d) / day); return n <= 0 ? 'aujourd’hui' : n === 1 ? 'depuis hier' : 'depuis ' + n + ' j'; };
  l.innerHTML = (mine.length ? `<h2 class="sec unread">À traiter · ${mine.length}</h2>` + mine.map(i => itemHTML(Object.assign({}, i, { unread: false }), '')).join('') : '')
    + (theirs.length ? `<h2 class="sec">Sans réponse de leur part · ${theirs.length}</h2>` + theirs.map(i => itemHTML(Object.assign({}, i, { snippet: 'Envoyé, sans réponse ' + age(i.date) }), '', true)).join('') : '')
    || '<div class="empty">Rien en attente : tout est à jour.</div>';
}
/* Ranger : dossiers vides + plan de rangement proposé par l'IA, appliqué seulement sur validation */
// Dossiers techniques que certains serveurs (dont Free) recréent tout seuls : inutile de les proposer
const SERVER_DIRS = /^(contacts|chats|calendar|calendrier|notes|tasks|tâches|journal|outbox|boîte d'envoi|emailed contacts)$/i;
function emptyFolders(g, f) {
  const out = [], keep = new Set(LS.get('tidyKeep', []));
  for (const list of [g, f]) for (const x of list) {
    if (x.m !== 0 || x.full === BLOCK_LABEL || keep.has(x.key)) continue;
    if (x.acc === 'free' && SERVER_DIRS.test(x.full)) continue;
    const pre = x.full + (x.delim || '/');
    if (list.some(y => y.full.startsWith(pre) && y.m !== 0)) continue;
    out.push(x);
  }
  return out.sort((a, b) => b.full.length - a.full.length);
}
const disp = x => x.acc === 'free' && x.delim && x.delim !== '/' ? x.full.split(x.delim).join('/') : x.full;
async function gEnsureLabel(name) {
  const labels = await getLabels(true);
  let l = labels.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (l) return l;
  const parts = name.split('/');
  for (let i = 1; i < parts.length; i++) { const p = parts.slice(0, i).join('/'); if (!labels.some(x => x.name.toLowerCase() === p.toLowerCase())) { try { await api('labels', { method: 'POST', body: { name: p } }); } catch (e) {} } }
  l = await api('labels', { method: 'POST', body: { name } });
  await getLabels(true);
  return l;
}
async function gMergeLabel(src, dstName) {
  const dst = await gEnsureLabel(dstName);
  let page = null;
  do {
    const p = new URLSearchParams({ labelIds: src.id, maxResults: 500 }); if (page) p.set('pageToken', page);
    const r = (await api('messages?' + p.toString())) || {};
    const ids = (r.messages || []).map(m => m.id);
    for (let i = 0; i < ids.length; i += 1000) await api('messages/batchModify', { method: 'POST', body: { ids: ids.slice(i, i + 1000), addLabelIds: [dst.id], removeLabelIds: [src.id] } });
    page = r.nextPageToken;
  } while (page);
  await api('labels/' + encodeURIComponent(src.id), { method: 'DELETE' });
}
async function gMove(from, to, mergeRoot) {
  const labels = await getLabels(true);
  const sub = labels.filter(l => l.name === from || l.name.startsWith(from + '/')).sort((a, b) => b.name.length - a.name.length);
  if (!sub.length) throw new Error('dossier introuvable');
  const parent = to.includes('/') ? to.slice(0, to.lastIndexOf('/')) : '';
  if (parent) { try { await gEnsureLabel(parent); } catch (e) { /* parent réservé (ex. INBOX) : Gmail accepte quand même le chemin */ } }
  for (const l of sub) {
    const nn = to + l.name.slice(from.length);
    const exists = (await getLabels()).find(x => x.name.toLowerCase() === nn.toLowerCase() && x.id !== l.id);
    if (exists || (mergeRoot && l.name === from)) await gMergeLabel(l, nn);
    else await api('labels/' + encodeURIComponent(l.id), { method: 'PATCH', body: { name: nn } });
  }
  await getLabels(true);
}
/* Vérifie réellement qu'un dossier Gmail est vide (le compteur de Gmail peut être en retard après un déplacement) */
async function gIsEmpty(id) { const r = (await api('messages?' + new URLSearchParams({ labelIds: id, maxResults: 1, includeSpamTrash: 'true' }))) || {}; return !(r.messages && r.messages.length); }
async function tidySheet(g, f) {
  openSheet('<span class="grip"></span><h2>Ranger mes dossiers</h2><div class="loading">Vérification des dossiers vides…</div>');
  const cand = emptyFolders(g, f);
  const ok = await pool(cand, 6, x => x.acc === 'gmail' ? gIsEmpty(x.id).catch(() => false) : Promise.resolve(true));
  const lines = cand.filter((x, i) => ok[i]).map(x => ({ kind: 'del', x, on: true }));
  const draw = () => {
    const dels = lines.filter(l => l.kind === 'del'), ai = lines.filter(l => l.kind !== 'del');
    openSheet(`<span class="grip"></span><h2>Ranger mes dossiers</h2>
      <div class="tidy-list">
        <h3 class="tidy-h">Dossiers vides · ${dels.length}</h3>
        ${dels.length ? dels.map(l => `<label class="switch"><span><span class="dot tdot" style="background:var(--${l.x.acc})"></span>Supprimer <b>${esc(disp(l.x).split('/').join(' › '))}</b></span><input type="checkbox" data-i="${lines.indexOf(l)}" ${l.on ? 'checked' : ''}></label>`).join('') : '<p class="fhint">Aucun dossier vide.</p>'}
        <h3 class="tidy-h">Proposition de l'IA${ai.length ? ' · ' + ai.length + ` <button class="sec-btn" id="tidy-toggle" type="button">${ai.every(l => l.on) ? 'Tout décocher' : 'Tout cocher'}</button>` : ''}</h3>
        ${ai.length ? (() => {
          // regroupé par dossier d'arrivée : un bloc par thème, une ligne courte par dossier déplacé
          const groups = new Map();
          ai.forEach(l => { const parts = l.to.split('/'); const dest = (l.kind === 'merge' ? parts : parts.slice(0, -1)).join(' › ') || 'Premier niveau'; const k = l.acc + '|' + dest; if (!groups.has(k)) groups.set(k, { acc: l.acc, dest, items: [] }); groups.get(k).items.push(l); });
          return [...groups.values()].map(gr => `<div class="tgroup"><div class="tgroup-h"><span class="dot tdot" style="background:var(--${gr.acc})"></span><span>→ ${esc(gr.dest)}</span><small>${gr.items.length}</small><input type="checkbox" class="tg-all" data-g="${esc(gr.acc + '|' + gr.dest)}" ${gr.items.every(l => l.on) ? 'checked' : ''} aria-label="Tout le groupe"></div>
            ${gr.items.map(l => { const fp = l.from.split('/'), leaf = fp.pop(), np = l.to.split('/').pop(); return `<label class="trow"><span class="tname"><span class="tl"><b>${esc(leaf)}</b>${l.kind === 'merge' ? ' <em>fusionné</em>' : np !== leaf ? ' <em>→ ' + esc(np) + '</em>' : ''}</span><small>${esc(fp.length ? 'depuis ' + fp.join(' › ') : 'depuis le premier niveau')}</small></span><input type="checkbox" data-i="${lines.indexOf(l)}" data-gk="${esc(gr.acc + '|' + gr.dest)}" ${l.on ? 'checked' : ''}></label>`; }).join('')}</div>`).join('');
        })()
          : settings.ai ? `<button class="btn primary" id="tidy-themes" type="button">✦ Remplacer INBOX par des thèmes</button><button class="btn" id="tidy-ai" type="button">✦ Proposer un rangement général</button><p class="fhint">L’IA ne reçoit que les noms de tes dossiers et leur nombre de mails. Rien n’est appliqué sans ta validation, et aucun mail n’est supprimé.</p>`
          : '<p class="fhint">Active l’assistant IA dans Réglages › Relais et notifications pour obtenir une proposition.</p>'}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"><button class="btn" data-close>Annuler</button><button class="btn primary" id="tidy-ok">Appliquer (${lines.filter(l => l.on).length})</button></div>`);
    $$('.tidy-list input[data-i]').forEach(c => c.onchange = () => { lines[+c.dataset.i].on = c.checked; $('#tidy-ok').textContent = 'Appliquer (' + lines.filter(l => l.on).length + ')'; });
    $$('.tidy-list .tg-all').forEach(c => c.onchange = () => { $$('.tidy-list input[data-gk]').filter(x => x.dataset.gk === c.dataset.g).forEach(x => { x.checked = c.checked; lines[+x.dataset.i].on = c.checked; }); $('#tidy-ok').textContent = 'Appliquer (' + lines.filter(l => l.on).length + ')'; });
    const tt = $('#tidy-toggle'); if (tt) tt.onclick = () => { const ai = lines.filter(l => l.kind !== 'del'), v = !ai.every(l => l.on); ai.forEach(l => l.on = v); draw(); };
    const runAI = async (ab, focus) => {
      $$('#tidy-ai,#tidy-themes').forEach(x => x.disabled = true); ab.textContent = 'L’IA étudie tes dossiers…';
      const ask = (list, acc) => list.length ? rapi('/ai/folders', { method: 'POST', body: { folders: list.map(x => ({ name: disp(x), n: x.m })), focus } }).then(r => (r.actions || []).map(a => ({ kind: a.type, acc, from: a.from, to: a.to, why: a.why, on: true, x: list.find(x => disp(x) === a.from) }))) : Promise.resolve([]);
      try {
        const [ga, fa] = await Promise.all([ask(g.filter(x => x.m !== 0), 'gmail'), ask(f.filter(x => x.m !== 0), 'free').catch(e => { toast('Free : ' + e.message); return []; })]);
        lines.push(...ga, ...fa);
        if (!ga.length && !fa.length) toast('L’IA ne voit rien à améliorer');
      } catch (e) { toast('IA : ' + e.message); }
      draw();
    };
    const ab = $('#tidy-ai'); if (ab) ab.onclick = () => runAI(ab, '');
    const at = $('#tidy-themes'); if (at) at.onclick = () => runAI(at, 'themes');
    $('#tidy-ok').onclick = async () => {
      // les dossiers vides décochés sont mémorisés : ils ne seront plus proposés
      const keep = new Set(LS.get('tidyKeep', [])); lines.filter(l => l.kind === 'del' && !l.on).forEach(l => keep.add(l.x.key)); LS.set('tidyKeep', [...keep]);
      const todo = lines.filter(l => l.on); if (!todo.length) { closeSheet(); return; }
      const b = $('#tidy-ok'); b.disabled = true; $$('.tidy-list input').forEach(c => c.disabled = true);
      let ok = 0; const errs = [];
      for (const [i, l] of todo.entries()) {
        b.textContent = (i + 1) + ' / ' + todo.length + '…';
        try {
          if (l.kind === 'del') {
            if (l.x.acc === 'gmail') { if (!(await gIsEmpty(l.x.id))) throw new Error('pas vide, conservé'); await api('labels/' + encodeURIComponent(l.x.id), { method: 'DELETE' }); }
            else await rapi('/free/folder-delete', { method: 'POST', body: { path: l.x.full } });
          } else if (l.acc === 'gmail') await gMove(l.from, l.to, l.kind === 'merge');
          else { const dl = (l.x && l.x.delim) || '/'; await rapi('/free/folder-rename', { method: 'POST', body: { from: l.from.split('/').join(dl), to: l.to.split('/').join(dl), delim: dl } }); }
          ok++;
        } catch (e) { errs.push((l.kind === 'del' ? disp(l.x) : l.from) + ' : ' + e.message); }
      }
      closeSheet(); state.folders = null; labelsCache = null; state.lists = {}; LS.del('foldersCache');
      toast(ok + ' action' + (ok > 1 ? 's' : '') + ' appliquée' + (ok > 1 ? 's' : '') + (errs.length ? ' · ' + errs.length + ' en échec' : ''));
      if (errs.length) console.warn(errs);
      renderLabels();
    };
  };
  draw();
}
/* Balayage à gauche sur un dossier : le supprimer */
/* Geste iPhone : balayer depuis le bord gauche de l'écran pour revenir */
(() => {
  let sx = -1, sy = 0;
  document.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX < 24 ? t.clientX : -1; sy = t.clientY; }, { passive: true });
  document.addEventListener('touchend', e => {
    if (sx < 0) return; const t = e.changedTouches[0];
    if (t.clientX - sx > 90 && Math.abs(t.clientY - sy) < 60) { const b = document.querySelector('#view .back'); if (b) b.click(); }
    sx = -1;
  }, { passive: true });
})();
function bindFolderSwipe(box, find, onDelete, onMove) {
  let sx = 0, sy = 0, cur = null, lock = null, dx = 0, bg = null, swiped = false;
  const reset = () => { if (cur) { cur.style.transition = 'transform .2s'; cur.style.transform = ''; } if (bg) { const g = bg; setTimeout(() => g.remove(), 200); } cur = null; bg = null; lock = null; dx = 0; };
  box.addEventListener('touchstart', e => { const a = e.target.closest('a.frow[data-k]'); if (!a || e.target.closest('button')) return; cur = a; swiped = false; lock = null; dx = 0; sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  box.addEventListener('touchmove', e => {
    if (!cur) return;
    const mx = e.touches[0].clientX - sx, my = e.touches[0].clientY - sy;
    if (!lock && (Math.abs(mx) > 10 || Math.abs(my) > 10)) lock = Math.abs(mx) > Math.abs(my) * 1.3 && sx > 24 ? 'h' : 'v';
    if (lock !== 'h') return;
    e.preventDefault();
    dx = Math.max(-170, Math.min(170, mx));
    if (bg && (dx < 0) !== bg.classList.contains('left')) { bg.remove(); bg = null; }
    if (!bg) { bg = document.createElement('div'); bg.className = 'swipe-bg fswipe' + (dx < 0 ? ' left' : ''); bg.innerHTML = dx < 0 ? `<span>${ICON.trash}Supprimer</span>` : `<span>${ICON.folder || ''}Déplacer</span>`; cur.parentNode.style.position = 'relative'; bg.style.top = cur.offsetTop + 'px'; bg.style.height = cur.offsetHeight + 'px'; cur.parentNode.insertBefore(bg, cur); cur.style.position = 'relative'; cur.style.zIndex = 1; cur.style.background = 'var(--surface)'; }
    bg.classList.toggle('on', Math.abs(dx) > 90);
    cur.style.transform = 'translateX(' + dx + 'px)';
  }, { passive: false });
  box.addEventListener('touchend', () => {
    if (lock === 'h' && cur) { swiped = true; if (Math.abs(dx) > 90) { const x = find(cur.dataset.k); if (navigator.vibrate) navigator.vibrate(10); if (x) (dx < 0 ? onDelete : onMove)(x); } }
    reset();
  });
  box.addEventListener('click', e => { if (swiped && e.target.closest('a.frow')) { e.preventDefault(); swiped = false; } }, true);
}
function moveFolderSheet(x, all) {
  if (x.full === BLOCK_LABEL) { toast('Le dossier Indésirables est protégé'); return; }
  const sep = x.delim || '/';
  const parts = x.full.split(sep), leaf = parts.pop(), curParent = parts.join(sep);
  const paths = new Set();
  all.filter(y => y.acc === x.acc).forEach(y => { const ps = y.full.split(y.delim || '/'); for (let i = 1; i <= ps.length; i++) paths.add(ps.slice(0, i).join(sep)); });
  const targets = [...paths].filter(p => p !== x.full && !p.startsWith(x.full + sep) && p !== BLOCK_LABEL).sort((a, b) => a.localeCompare(b, 'fr')).map(full => ({ full }));
  openSheet(`<span class="grip"></span><h2>Déplacer « ${esc(leaf)} »</h2>
    <p style="margin:0;color:var(--muted);font-size:.85rem"><span class="dot tdot" style="background:var(--${x.acc})"></span>Ses mails et sous-dossiers suivent. Si un dossier du même nom existe déjà à l’arrivée, les deux sont fusionnés.</p>
    <label class="f">Ranger dans<select id="mv-parent"><option value="">— Premier niveau —</option>${targets.map(y => `<option value="${esc(y.full)}" ${y.full === curParent ? 'selected' : ''}>${esc(y.full.split(sep).join(' › '))}</option>`).join('')}</select></label>
    <label class="f">Nom<input id="mv-name" value="${esc(leaf)}" autocomplete="off"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"><button class="btn" data-close>Annuler</button><button class="btn primary" id="mv-ok">Déplacer</button></div>`);
  $('#mv-ok').onclick = async () => {
    const name = $('#mv-name').value.trim().replace(/[\/]/g, '-'); if (!name) { toast('Donne un nom'); return; }
    const parent = $('#mv-parent').value, to = parent ? parent + sep + name : name;
    if (to === x.full) { closeSheet(); return; }
    const b = $('#mv-ok'); b.disabled = true; b.textContent = 'Déplacement…';
    try {
      if (x.acc === 'gmail') await gMove(x.full, to, false);
      else await rapi('/free/folder-rename', { method: 'POST', body: { from: x.full, to, delim: sep } });
      closeSheet(); state.folders = null; labelsCache = null; state.lists = {}; LS.del('foldersCache');
      if (parent) { const o = new Set(LS.get('openFolders', [])); let p = ''; parent.split(sep).forEach(seg => { p = p ? p + '/' + seg : seg; o.add(x.acc + ':' + p); }); LS.set('openFolders', [...o]); }
      toast('« ' + name + ' » déplacé' + (parent ? ' dans ' + parent.split(sep).pop() : ' au premier niveau')); renderLabels();
    } catch (e) { b.disabled = false; b.textContent = 'Déplacer'; toast('Échec : ' + e.message); }
  };
}
function deleteFolderSheet(x, all) {
  if (x.full === BLOCK_LABEL) { toast('Le dossier Indésirables est protégé'); return; }
  const sep = x.delim || '/';
  const kids = all.filter(y => y.acc === x.acc && y.full.startsWith(x.full + sep));
  const name = x.full.split(sep).join(' › ');
  const nMails = x.m > 0 ? x.m : 0;
  const cnt = nMails ? `Ses ${nMails} mail${nMails > 1 ? 's' : ''}` : 'Ses mails éventuels';
  const what = x.m === 0 ? 'Le dossier est vide.' : x.acc === 'gmail'
    ? `${cnt} ne sont pas effacés : ils restent dans Gmail (« Tous les messages », et la réception pour ceux qui y sont).`
    : `${cnt} partent dans la corbeille Free.`;
  openSheet(`<span class="grip"></span><h2>Supprimer « ${esc(name)} » ?</h2>
    <p style="margin:0;color:var(--muted);font-size:.85rem;line-height:1.5"><span class="dot tdot" style="background:var(--${x.acc})"></span>${x.acc === 'gmail' ? 'Gmail' : 'Free'}. ${what}${kids.length ? ` Ses ${kids.length} sous-dossier${kids.length > 1 ? 's sont' : ' est'} supprimé${kids.length > 1 ? 's' : ''} aussi.` : ''}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"><button class="btn" data-close>Annuler</button><button class="btn danger" id="fdel-ok">Supprimer</button></div>`);
  $('#fdel-ok').onclick = async () => {
    const b = $('#fdel-ok'); b.disabled = true; b.textContent = 'Suppression…';
    const list = kids.concat([x]).sort((a, c) => c.full.length - a.full.length);
    let err = null;
    for (const y of list) {
      try {
        if (y.acc === 'gmail') await api('labels/' + encodeURIComponent(y.id), { method: 'DELETE' });
        else { if (y.m !== 0) await rapi('/free/empty', { method: 'POST', body: { folder: y.full } }); await rapi('/free/folder-delete', { method: 'POST', body: { path: y.full } }); }
      } catch (e) { err = y.full + ' : ' + e.message; break; }
    }
    closeSheet(); state.folders = null; labelsCache = null; state.lists = {}; LS.del('foldersCache');
    toast(err ? 'Échec : ' + err : 'Dossier supprimé');
    renderLabels();
  };
}
async function freeMoveSheet(id, folder, uid) {
  openSheet(`<span class="grip"></span><h2>Classer dans…</h2><div id="fm-list"><div class="loading">Chargement…</div></div>
    <label class="f">Ou nouveau dossier<input id="fm-new" autocomplete="off" placeholder="ex. Factures 2026"></label>
    <button class="btn primary" id="fm-create">Créer et classer</button>`);
  const go = async to => {
    try {
      await rapi('/free/move', { method: 'POST', body: { folder, uids: [uid], to } });
      closeSheet(); Object.values(state.lists).forEach(d => { d.items = d.items.filter(i => i.id !== id); });
      state.folders = null; LS.del('foldersCache');
      toast('Classé dans « ' + to.split(/[\/.]/).pop() + ' »'); goBack();
    } catch (e) { toast(e.message); }
  };
  let dirs = [];
  try { dirs = (await rapi('/free/folders?tree=1')).folders || []; } catch (e) { toast('Free : ' + e.message); }
  const l = $('#fm-list'); if (!l) return;
  const dl = (dirs[0] || {}).delim || '/';
  l.innerHTML = `<div class="card fold" style="max-height:45vh;overflow:auto">${[{ path: 'INBOX', name: 'Réception' }].concat(dirs.filter(x => x.path !== folder && x.path !== BLOCK_LABEL).sort((a, b) => a.path.localeCompare(b.path, 'fr'))).map(x => `<button class="frow" style="width:100%;background:none;border:none;border-bottom:1px solid var(--line);text-align:left" data-to="${esc(x.path)}">${FOLD_ICON}<span class="nm">${esc(x.path === 'INBOX' ? 'Réception' : x.path.split(x.delim || '/').join(' › '))}</span></button>`).join('')}</div>`;
  $$('[data-to]', l).forEach(b => b.onclick = () => go(b.dataset.to));
  $('#fm-create').onclick = async () => {
    const n = $('#fm-new').value.trim().replace(/[\/]/g, '-'); if (!n) { toast('Donne un nom au dossier'); return; }
    try { await rapi('/free/folder-create', { method: 'POST', body: { path: n } }); } catch (e) { if (!/existe/.test(e.message)) { toast(e.message); return; } }
    go(n);
  };
}
function newFolderSheet(g, f) {
  const opts = list => '<option value="">— Aucun (premier niveau) —</option>' + list.slice().sort((a, b) => a.full.localeCompare(b.full, 'fr')).map(x => `<option value="${esc(x.full)}">${esc(x.full.split(x.delim || '/').join(' › '))}</option>`).join('');
  openSheet(`<span class="grip"></span><h2>Nouveau dossier</h2>
    ${freeOn() ? `<div class="accounts" role="tablist" style="margin:0 0 4px"><button class="on" data-nacc="gmail"><span class="acc-l"><span class="dot" style="background:var(--gmail)"></span>Gmail</span></button><button data-nacc="free"><span class="acc-l"><span class="dot" style="background:var(--free)"></span>Free</span></button></div>` : ''}
    <label class="f">Nom du dossier<input id="nd-name" autocomplete="off" placeholder="ex. Factures 2026"></label>
    <label class="f">Ranger dans<select id="nd-parent">${opts(g)}</select></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"><button class="btn" data-close>Annuler</button><button class="btn primary" id="nd-ok">Créer</button></div>`);
  let acc = 'gmail';
  $$('[data-nacc]').forEach(b => b.onclick = () => { acc = b.dataset.nacc; $$('[data-nacc]').forEach(x => x.classList.toggle('on', x === b)); $('#nd-parent').innerHTML = opts(acc === 'gmail' ? g : f); });
  setTimeout(() => $('#nd-name').focus(), 300);
  $('#nd-ok').onclick = async () => {
    const name = $('#nd-name').value.trim().replace(/[\/]/g, '-');
    if (!name) { toast('Donne un nom au dossier'); return; }
    const parent = $('#nd-parent').value;
    const b = $('#nd-ok'); b.disabled = true; b.textContent = 'Création…';
    try {
      if (acc === 'gmail') await gEnsureLabel(parent ? parent + '/' + name : name);
      else { const dl = ((f.find(x => x.full === parent) || f[0] || {}).delim) || '/'; await rapi('/free/folder-create', { method: 'POST', body: { path: parent ? parent + dl + name : name } }); }
      closeSheet(); state.folders = null; labelsCache = null; LS.del('foldersCache');
      if (parent) { const o = new Set(LS.get('openFolders', [])); let p = ''; parent.split(acc === 'gmail' ? '/' : (((f.find(x => x.full === parent) || {}).delim) || '/')).forEach(seg => { p = p ? p + '/' + seg : seg; o.add(acc + ':' + p); }); LS.set('openFolders', [...o]); }
      const secs = LS.get('openSecs', {}); secs[acc] = true; LS.set('openSecs', secs);
      toast('Dossier « ' + name + ' » créé'); renderLabels();
    } catch (e) { b.disabled = false; b.textContent = 'Créer'; toast(e.message); }
  };
}
async function renderLabels() {
  const v = $('#view');
  v.innerHTML = `<div class="sticky-head"><div class="top"><h1>Dossiers</h1><button class="icon-btn" id="btn-newdir" aria-label="Nouveau dossier">${ICON.plus}</button><button class="btn tidy-btn" id="btn-tidy">Ranger</button><button class="icon-btn" id="btn-refresh" aria-label="Actualiser">${ICON.refresh}</button></div>
    <div class="searchbar"><input type="search" id="fq" placeholder="Chercher un dossier" autocomplete="off" enterkeyhint="search"></div></div>
    <a class="set-link" href="#/waiting"><span class="set-t">⏳ En attente de réponse</span><span class="set-s">Suivi Gmail + Free</span><span class="chev-r" aria-hidden="true"></span></a>
    <div id="labs"><div class="loading">Chargement…</div></div>`;
  $('#btn-refresh').onclick = () => { state.folders = null; LS.del('foldersCache'); renderLabels(); };
  // Affichage instantané depuis le cache (mémoire ou appareil), puis mise à jour en arrière-plan
  const cached = state.folders || LS.get('foldersCache', null);
  let g = cached ? cached.g : [], f = cached ? cached.f : [];
  const fresh = state.folders && Date.now() - state.folders.at < 120000;
  const refresh = async () => {
    let ng = null, nf = null;
    const gJob = (async () => {
      const labels = await getLabels(true);
      if (!cached) { g = labels.map(l => ({ key: 'g:' + l.id, full: l.name, href: '#/list/' + encodeURIComponent(l.id), n: 0, m: -1, id: l.id, acc: 'gmail', color: labelColor(l) })); redraw(); }
      const counts = await pool(labels, 10, l => api('labels/' + l.id + '?fields=id,messagesTotal,threadsUnread').catch(() => null));
      ng = labels.map((l, i) => ({ key: 'g:' + l.id, full: l.name, href: '#/list/' + encodeURIComponent(l.id), n: (counts[i] && counts[i].threadsUnread) || 0, m: counts[i] && counts[i].id ? counts[i].messagesTotal || 0 : -1, id: l.id, acc: 'gmail', color: labelColor(l) }));
      if (!cached) { g = ng; redraw(); }
    })().catch(e => { if (e.message !== 'auth') toast('Gmail : ' + e.message); });
    const fJob = freeOn() ? rapi('/free/folders?tree=1').then(r => { nf = (r.folders || []).map(x => ({ key: 'f:' + x.path, full: x.path, delim: x.delim, href: '#/list/F:' + encodeURIComponent(x.path), n: x.unseen || 0, m: typeof x.messages === 'number' ? x.messages : -1, acc: 'free' })); if (!cached) { f = nf; redraw(); } }).catch(e => toast('Free : ' + e.message)) : Promise.resolve();
    await Promise.all([gJob, fJob]);
    if (ng) g = ng; if (nf) f = nf;
    state.folders = { at: Date.now(), g, f };
    try { LS.set('foldersCache', { at: Date.now(), g, f }); } catch (e) {}
    redraw();
  };
  let redraw = () => {};
  const favs = LS.get('favFolders', []);
  const opened = new Set(LS.get('openFolders', []));
  const openSecs = LS.get('openSecs', {});
  let all = g.concat(f), byKey = new Map(all.map(x => [x.key, x]));
  const nb = n => n ? `<span class="fnb">${n > 99 ? '99+' : n}</span>` : '';
  const star = k => `<button class="fstar ${favs.includes(k) ? 'on' : ''}" data-fav="${esc(k)}" aria-label="${favs.includes(k) ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${favs.includes(k) ? '★' : '☆'}</button>`;
  const dot = acc => `<span class="dot" style="background:var(--${acc})"></span>`;
  const rowHTML = (node, depth, acc) => {
    const kids = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const ok = acc + ':' + node.path, open = opened.has(ok);
    const chev = kids.length ? `<button class="ftog" data-open="${esc(ok)}" aria-expanded="${open}" aria-label="${open ? 'Replier' : 'Déplier'}"><span class="chev"></span></button>` : '';
    const inner = `${depth ? '' : FOLD_ICON}<span class="nm">${esc(node.name)}</span>${nb(kids.length && !open ? node.total : node.n)}`;
    const row = node.href
      ? `<a class="frow d${Math.min(depth, 3)}" data-k="${esc(node.key)}" href="${node.href}">${inner}${star(node.key)}${chev}</a>`
      : `<div class="frow d${Math.min(depth, 3)}" ${kids.length ? `data-open-row="${esc(ok)}"` : ''}>${inner}${chev}</div>`;
    return row + (open ? kids.map(c => rowHTML(c, depth + 1, acc)).join('') : '');
  };
  const section = (title, acc, items) => {
    if (!items.length) return '';
    const sep = acc === 'free' ? (items[0].delim || '/') : '/';
    const tree = buildTree(items, sep);
    const unread = [...tree.children.values()].reduce((a, n) => a + (n.total || 0), 0);
    return `<details class="set fsec" data-sec="${acc}" ${openSecs[acc] ? 'open' : ''}><summary><span class="set-t">${dot(acc)} ${title}</span><span class="set-s">${items.length} dossier${items.length > 1 ? 's' : ''}${unread ? ' · ' + unread + ' non lu' + (unread > 1 ? 's' : '') : ''}</span><span class="chev" aria-hidden="true"></span></summary><div class="card fold">${[...tree.children.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(n => rowHTML(n, 0, acc)).join('')}</div></details>`;
  };
  const boxes = ['STARRED', 'IMPORTANT', 'DRAFT', 'ALL', 'SPAM', 'TRASH'];
  const draw = q => {
    const $l = $('#labs'); if (!$l) return;
    if (q) {
      const ql = q.toLowerCase();
      const hits = all.filter(x => x.full.toLowerCase().includes(ql));
      $l.innerHTML = hits.length ? `<div class="card fold">${hits.map(x => `<a class="frow" data-k="${esc(x.key)}" href="${x.href}">${FOLD_ICON}<span class="nm">${esc(x.full.split(x.delim || '/').join(' › '))}</span>${dot(x.acc)}${nb(x.n)}${star(x.key)}</a>`).join('')}</div>` : '<div class="empty">Aucun dossier ne correspond.</div>';
    } else {
      const fv = favs.map(k => byKey.get(k)).filter(Boolean);
      $l.innerHTML = (fv.length ? `<h2 class="sec"><span class="fav-t">★</span>Favoris</h2><div class="card fold">${fv.map(x => `<a class="frow" data-k="${esc(x.key)}" href="${x.href}">${FOLD_ICON}<span class="nm">${esc(x.full.split(x.delim || '/').join(' › '))}</span>${dot(x.acc)}${nb(x.n)}${star(x.key)}</a>`).join('')}</div>` : '<p class="fhint">Touche ☆ à côté d’un dossier pour l’épingler ici.</p>')
        + section('Gmail', 'gmail', g) + section('Free', 'free', f)
        + `<details class="set fsec" data-sec="boxes" ${openSecs.boxes ? 'open' : ''}><summary><span class="set-t">Boîtes</span><span class="set-s">Suivis, Spam, Corbeille…</span><span class="chev" aria-hidden="true"></span></summary><div class="card fold">${boxes.map(k => `<a class="frow" href="#/list/${k}">${FOLD_ICON}<span class="nm">${esc(SYSTEM[k].name)}</span></a>`).join('')}</div></details>`;
      $$('details.fsec', $l).forEach(d => d.addEventListener('toggle', () => { openSecs[d.dataset.sec] = d.open; LS.set('openSecs', openSecs); }));
    }
    $$('[data-fav]', $l).forEach(b => b.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      const k = b.dataset.fav, i = favs.indexOf(k);
      if (i >= 0) favs.splice(i, 1); else favs.push(k);
      LS.set('favFolders', favs); draw($('#fq').value.trim());
    });
    $$('[data-open]', $l).forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); toggleOpen(b.dataset.open); });
    $$('[data-open-row]', $l).forEach(b => b.onclick = () => toggleOpen(b.dataset.openRow));
  };
  const toggleOpen = k => { opened.has(k) ? opened.delete(k) : opened.add(k); LS.set('openFolders', [...opened]); draw($('#fq').value.trim()); };
  $('#fq').oninput = e => draw(e.target.value.trim());
  $('#btn-tidy').onclick = () => tidySheet(g, f);
  $('#btn-newdir').onclick = () => newFolderSheet(g, f);
  bindFolderSwipe($('#labs'), k => byKey.get(k), async x => { if (x.acc === 'gmail' && x.m === 0 && !(await gIsEmpty(x.id).catch(() => false))) x = Object.assign({}, x, { m: -1 }); deleteFolderSheet(x, all); }, x => moveFolderSheet(x, all));
  redraw = () => {
    if (!location.hash.startsWith('#/labels') || !$('#labs')) return;
    all = g.concat(f); byKey = new Map(all.map(x => [x.key, x]));
    if (!all.length && !cached) return;
    const y = scrollY; draw(($('#fq') || {}).value ? $('#fq').value.trim() : ''); scrollTo(0, y);
  };
  if (cached) draw('');
  if (!fresh) refresh();
}

/* ---------- Rédaction ---------- */
function openCompose(mode, m, fm) {
  state.composeFrom = { mode, m, fm };
  location.hash = '#/compose?mode=' + mode;
}
function openComposeTo(to, subject) { state.composeFrom = { mode: 'new', to, subject }; location.hash = '#/compose?mode=new&t=' + Date.now(); }
function htmlText(html) {
  const d = new DOMParser().parseFromString(html.replace(/<(br|\/p|\/div|\/tr|\/h\d|\/li)[^>]*>/gi, '$&\n'), 'text/html');
  d.querySelectorAll('style,script').forEach(e => e.remove());
  return (d.body ? d.body.textContent : '').replace(/\n{3,}/g, '\n\n').trim();
}
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
  const fm = src.fm;
  let to = src.to || '', cc = '', subject = src.subject || '', body = '', threadId = null, inReplyTo = '', references = '', fwdAtts = [], fetchAtt = a => attData(m.id, a);
  if (fm && mode !== 'new') {
    const subj = fm.subject;
    const date = fmtDate(fm.date, true);
    const original = fm.text || htmlText(fm.html || '');
    if (mode === 'fwd') {
      subject = /^(tr|fwd?)\s*:/i.test(subj) ? subj : 'Tr: ' + subj;
      body = `\n\n---------- Message transféré ----------\nDe : ${fm.fromRaw}\nDate : ${date}\nObjet : ${subj}\nÀ : ${fm.to}\n\n${original}`;
      fwdAtts = fm.attachments || [];
      fetchAtt = a => a.data ? Promise.resolve(a.data) : rapi('/free/attachment?' + new URLSearchParams({ folder: fm.folder, uid: fm.uid, idx: a.idx })).then(r => r.data);
    } else {
      subject = /^re\s*:/i.test(subj) ? subj : 'Re: ' + subj;
      to = fm.replyTo || fm.fromRaw;
      if (mode === 'all') {
        const seen = new Set(splitAddrs(to).map(a => parseAddr(a).email.toLowerCase()));
        cc = splitAddrs(fm.to + ',' + fm.cc).filter(a => { const e = parseAddr(a).email.toLowerCase(); if (!e || seen.has(e) || isMe(e)) return false; seen.add(e); return true; }).join(', ');
      }
      inReplyTo = fm.messageId;
      references = ((fm.references || '') + ' ' + fm.messageId).trim();
      body = `\n\nLe ${date}, ${fm.from.name || fm.from.email} a écrit :\n` + original.split('\n').map(l => '> ' + l).join('\n');
    }
  }
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
      ${freeOn() ? `<div class="row"><label for="c-from">De</label><select id="c-from" style="flex:1;height:50px;border:none;background:transparent;font-size:1rem;color:var(--text)"><option value="gmail" ${fm ? '' : 'selected'}>${esc(settings.email || 'Gmail')}</option><option value="free" ${fm ? 'selected' : ''}>${esc(settings.freeEmail)}</option></select></div>` : ''}
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
      if (fwdAtts.length) o.attachments = await Promise.all(fwdAtts.map(async a => ({ name: a.name, mime: a.mime, b64: await fetchAtt(a) })));
      const viaFree = $('#c-from') && $('#c-from').value === 'free';
      if (viaFree) await rapi('/free/send', { method: 'POST', body: { to: o.to, cc: o.cc, bcc: o.bcc, subject: o.subject, text: o.body, inReplyTo: o.inReplyTo, references: o.references, attachments: o.attachments } });
      else { const raw = buildRaw(o); await api('messages/send', { method: 'POST', body: threadId ? { raw, threadId } : { raw } }); }
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
  const hq = new URLSearchParams((location.hash.split('?')[1]) || '');
  if (hq.get('relay')) {
    const r = hq.get('relay');
    if (r === 'gmail-ok') { settings.relayGmail = true; LS.del('rtoken'); saveSettings(); state.lists = {}; toast('Gmail relié au relais : plus de reconnexion toutes les heures'); }
    else toast(r === 'refus' ? 'Autorisation Google refusée' : 'Liaison Gmail échouée (' + r + ')');
    history.replaceState(null, '', location.pathname + '#/settings');
  }
  const connected = !!LS.get('token', null) || relayGmailOn();
  $('#view').innerHTML = `
    <div class="top"><h1>Réglages</h1></div>
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
    <section class="card" id="s-free"></section></details>
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
  renderRelay();
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
  const draw = st => {
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
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
