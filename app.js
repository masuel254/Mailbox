/* Mail lisible : client Gmail PWA. Aucun identifiant n'est stocké dans ce code. */
'use strict';

const APP_VERSION = '4.2.2';
const APP_DATE = '20/11/2026';

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
const undoToast = (msg, undo) => toast(msg, { label: 'Annuler', run: async () => { try { await undo(); gone.clear(); toast('Action annulée'); } catch (e) { toast('Annulation impossible : ' + e.message); } Object.keys(state.lists).forEach(k => delete state.lists[k]); route(); badgeNow(0); } });
const ICON = {
  folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>',
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  todo: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12l3 3 5-6"/></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
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
function dayLabel(ms) {
  const d = new Date(ms), n = new Date(), same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, n)) return 'Aujourd’hui';
  const y = new Date(n); y.setDate(n.getDate() - 1); if (same(d, y)) return 'Hier';
  return d.toLocaleDateString('fr-FR', Object.assign({ day: 'numeric', month: 'long' }, n - d < 6 * 864e5 ? { weekday: 'long' } : {}, d.getFullYear() !== n.getFullYear() ? { year: 'numeric' } : {}));
}
/* Liste groupée par jour : intertitre par jour, heure seule sur chaque mail */
function byDay(items, render) {
  let last = '', h = '';
  items.forEach(i => { const dl = dayLabel(i.date); if (dl !== last) { h += `<div class="day-h">${esc(dl)}</div>`; last = dl; } h += render(i); });
  return h;
}
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
  return { id: 'f:' + x.uid + ':' + x.folder, acc: 'free', folder: x.folder, uid: x.uid, subject: fixMojibake(x.subject), from: x.from.name || x.from.email, fromEmail: (x.from.email || '').toLowerCase(), fromName: x.from.name || '', to: x.to || '', sentByMe: false, snippet: cleanSnippet(x.snippet), date: x.date, count: 1, size: x.size || 0, att: !!x.att, mine: !!x.mine, toEmail: (x.toEmail || '').toLowerCase(), unread: !x.seen, starred: !!x.flagged, labels: [] };
}
function route() {
  auth.handleRedirect();
  const h = location.hash || '#/list/INBOX';
  const parts = h.slice(2).split('?')[0].split('/');
  const view = parts[0];
  state.prevHash = state.curHash; state.curHash = h;
  if (['list', 'search', 'smart', 'waiting', 'tasks'].includes(view)) { state.lastList = h; try { sessionStorage.setItem('mb-last', h); } catch (e) {} }
  closeSheet();
  exitSelect(true);
  document.body.classList.toggle('no-tabbar', view === 'thread' || view === 'compose' || view === 'free');
  const lk = parts[1] === 'UNREAD' ? 'INBOX' : (parts[1] || 'INBOX');
  $$('#tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === (view === 'list' ? (lk === 'INBOX' ? 'INBOX' : 'labels') : ['waiting', 'tasks'].includes(view) ? 'labels' : ['guide', 'settings'].includes(view) ? 'INBOX' : view)));
  $('#view').scrollTop = 0;
  if (!settings.clientId && !relayGmailOn() && view !== 'settings') return renderWelcome();
  if (view === 'thread') return renderThread(decodeURIComponent(parts[1]));
  if (view === 'free') return renderFree(decodeURIComponent(parts[1]), +parts[2]);
  if (view === 'compose') return renderCompose(new URLSearchParams(h.split('?')[1] || ''));
  if (view === 'labels') return renderLabels();
  if (view === 'waiting') return renderWaiting();
  if (view === 'guide') return renderGuide();
  if (view === 'tasks') return renderTasks();
  if (view === 'contacts') return renderContacts();
  if (view === 'agenda') return renderAgenda();
  if (view === 'smart') return renderSmart(decodeURIComponent(parts.slice(1).join('/')));
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
  const contactQ = isSearch && (String(q || '').match(/^from:(\S+) OR to:\1$/) || [])[1];
  let title = contactQ ? 'Échanges' : isSearch ? 'Recherche' : sys ? sys.name : 'Libellé';
  if (String(key).startsWith('F:')) title = decodeURIComponent(key.slice(2)).split(/[\/.]/).pop();
  else if (!sys && !isSearch) { try { await getLabels(); const l = labelById(key); if (l) title = l.name; } catch (e) { if (e.message === 'auth') return; } }
  const plain = !!(sys && sys.plain);
  const isFreeDir = String(key).startsWith('F:');
  const acc = isFreeDir ? 'free' : freeOn() && (isSearch || freeFolderOf(key)) ? curAcc() : 'gmail';
  const cacheKey = (acc !== 'gmail' ? acc + '|' : '') + (isSearch ? 'S:' + q : key);
  state.current = cacheKey;
  const showTitle = key === 'INBOX' ? 'Réception' : String(title).split(/\//).pop();
  const backTo = key === 'UNREAD' ? ['#/list/INBOX', 'Toute la réception'] : ['INBOX', 'SENT'].includes(key) ? null : isSearch ? ['#/list/INBOX', 'Réception'] : ['#/labels', 'Dossiers'];
  v.innerHTML = `<div class="sticky-head">
    ${backTo ? `<a class="back back-sm" href="${backTo[0]}">${ICON.back}${backTo[1]}</a>` : ''}
    <div class="top">
      <h1>${esc(showTitle)}</h1>
      <button class="icon-btn" id="btn-select" aria-label="Sélectionner plusieurs mails">${ICON.check}</button>
      <button class="icon-btn" id="btn-search" aria-label="Rechercher">${ICON.search}</button>
      <button class="icon-btn" id="btn-refresh" aria-label="Actualiser">${ICON.refresh}</button>
      ${['INBOX', 'UNREAD'].includes(key) ? `<a class="icon-btn" href="#/settings" aria-label="Réglages">${ICON.gear}</a>` : ''}
    </div>
    <form class="searchbar" id="searchbar" ${isSearch ? '' : 'hidden'}><input type="search" id="q" placeholder="Un mot ou une phrase" value="${esc(q || '')}" enterkeyhint="search" autocomplete="off"></form>

    ${(() => {
      const inboxish = key === 'INBOX' || key === 'UNREAD';
      const accs = freeOn() && !isFreeDir && (isSearch || freeFolderOf(key)) ? `<div class="accounts" role="tablist" aria-label="Comptes">
      ${[['all', 'Tous', ''], ['gmail', 'Gmail', 'var(--gmail)'], ['free', 'Free', 'var(--free)']].map(([k, n, c]) => `<button role="tab" aria-selected="${acc === k}" class="${acc === k ? 'on' : ''}" data-acc="${k}"><span class="acc-l">${c ? `<span class="dot" style="background:${c}"></span>` : ''}${n}</span>${inboxish ? `<small class="acc-n" data-n="${k}"></small>` : ''}</button>`).join('')}
    </div>` : '';
      if (!inboxish) return accs;
      const pill = `<a class="unr-pill ${key === 'UNREAD' ? 'on' : ''}" href="#/list/${key === 'UNREAD' ? 'INBOX' : 'UNREAD'}" aria-pressed="${key === 'UNREAD'}">Non lus<span class="fcount" id="fcount"></span>${key === 'UNREAD' ? '<span class="unr-x" aria-hidden="true"> ✕</span>' : ''}</a>`;
      return `<div class="tabrow">${accs || '<div class="accounts one"><button class="on" aria-selected="true">Réception</button></div>'}${pill}</div>`;
    })()}</div>
    ${contactQ ? `<div class="ai-note"><b>👤 ${esc(contactQ)}</b><span>Tous vos mails, dans les deux sens, Gmail et Free.</span>${settings.ai && relayOn() ? `<button class="btn" id="hist-go" style="margin-top:4px">${ICON.spark}Retracer l’historique</button>` : ''}</div><div id="hist-out"></div>` : ''}
    ${isSearch && state.aiNote && state.aiNote.q === q ? `<div class="ai-note"><b>✦ ${esc(state.aiNote.resume || 'Recherche de l’assistant')}</b><span>« ${esc(state.aiNote.ask)} » → <code>${esc(q)}</code></span><span class="ai-links"><a href="#/smart/${encodeURIComponent(state.aiNote.ask)}">✦ Pas trouvé ? Recherche par le sens</a><a href="#/search/${encodeURIComponent(state.aiNote.ask)}" id="ai-raw">Mots exacts</a></span></div>` : ''}
    ${isFolderView(key) || key === 'TRASH' ? `<div class="banner"><span style="display:flex;flex-direction:column;gap:2px"><span>${key === 'TRASH' ? 'Corbeille' + (freeOn() ? ' Gmail + Free' : '') : title === BLOCK_LABEL ? 'Expéditeurs bloqués et spam' : 'Dossier « ' + esc(title) + ' »'}</span><b id="lab-size" style="color:var(--accent)">Calcul de la taille…</b></span><button class="btn danger" id="btn-empty">${ICON.trash}${key === 'TRASH' ? 'Vider' : 'Tout supprimer'}</button></div>` : ''}
    <div id="subdirs"></div>
    ${isSearch && !contactQ ? '<div id="best"></div>' : ''}
    <div id="list"><div class="loading">Chargement…</div></div>`;
  // Sous-dossiers du dossier ouvert : un dossier « thème » ne contient souvent rien lui-même, ses mails sont dans ses sous-dossiers
  let kids = [];
  if (isFolderView(key) && title !== BLOCK_LABEL) {
    const fc = state.folders || LS.get('foldersCache', null);
    if (String(key).startsWith('F:')) {
      const path = decodeURIComponent(key.slice(2));
      kids = ((fc && fc.f) || []).filter(x => { const d = x.delim || '/'; return x.full.startsWith(path + d) && !x.full.slice(path.length + 1).includes(d); });
    } else {
      kids = (labelsCache || []).filter(l => l.name.startsWith(title + '/') && !l.name.slice(title.length + 1).includes('/')).map(l => { const c = fc && fc.g ? fc.g.find(x => x.id === l.id) : null; return { full: l.name, href: '#/list/' + encodeURIComponent(l.id), n: c ? c.n : 0, m: c ? c.m : -1 }; });
    }
    if (kids.length) $('#subdirs').innerHTML = `<h2 class="sec">Sous-dossiers · ${kids.length}</h2><div class="card fold">${kids.sort((a, c) => a.full.localeCompare(c.full, 'fr')).map(x => `<a class="frow" href="${x.href}">${FOLD_ICON}<span class="nm">${esc(x.full.split(x.delim || '/').pop())}</span>${x.n ? `<span class="fnb">${x.n}</span>` : ''}<span class="chev-r" aria-hidden="true"></span></a>`).join('')}</div>`;
  }
  $('#btn-search').onclick = () => { const s = $('#searchbar'); s.hidden = !s.hidden; if (!s.hidden) $('#q').focus(); };
  $('#searchbar').onsubmit = e => { e.preventDefault(); const val = $('#q').value.trim(); $('#q').blur(); if (val) runSearch(val); };
  $('#btn-refresh').onclick = () => loadList(key, q, cacheKey, plain, true);
  const hg = $('#hist-go'); if (hg) hg.onclick = () => contactHistory(contactQ, cacheKey, hg);
  if (isSearch && !contactQ && q) bestMatches(q).catch(() => { const b = $('#best'); if (b) b.innerHTML = ''; });
  $('#btn-select').onclick = () => state.sel ? exitSelect() : enterSelect();
  state.listCtx = { key, q, cacheKey, plain };
  $$('.accounts button[data-acc]').forEach(b => b.onclick = () => { settings.acc = b.dataset.acc; saveSettings(); renderList(key, q); });
  const be = $('#btn-empty'); if (be) { be.onclick = () => key === 'TRASH' ? emptyTrash() : emptyLabel(key, title); new Promise(r => setTimeout(r, 2500)).then(() => labelSize(key)).then(t => { const el = $('#lab-size'); if (!el) return; if (t === 'Vide' && kids.length) { el.textContent = 'Tes mails sont dans ses ' + kids.length + ' sous-dossier' + (kids.length > 1 ? 's' : '') + ', ci-dessous'; be.hidden = true; } else el.textContent = t; if (t === 'Vide' && $$('#list a.item').length) { delete state.lists[cacheKey]; loadList(key, q, cacheKey, plain, true); } }); }
  bindListGestures($('#list'));
  let cached = state.lists[cacheKey];
  // Ouverture instantanée : dernière liste connue gardée sur l'iPhone (réception, non lus, envoyés), actualisée aussitôt
  if (!cached && !isSearch) { const d = LS.get('list:' + cacheKey, null); if (d && d.items) { cached = Object.assign(d, { at: 0, stale: true }); state.lists[cacheKey] = cached; } }
  // Corbeille, spam et dossiers changent souvent (suppressions, vidage) : toujours relus à l'ouverture
  // Toujours relue à l'ouverture (affichage immédiat de la dernière version, puis mise à jour) : peu coûteux grâce à threadMeta
  if (cached) { drawList(cached, plain); loadList(key, q, cacheKey, plain, true); }
  else loadList(key, q, cacheKey, plain, true);
}

/* En-têtes des conversations gardés en mémoire : Gmail renvoie un « historyId » qui change à chaque modification
   (lu, étoile, nouveau message…). Tant qu'il ne change pas, on ne redemande rien : relire une liste ne coûte qu'un appel. */
const metaCache = new Map();
async function threadMeta(t) {
  const c = metaCache.get(t.id);
  if (c && t.historyId && c.h === t.historyId) return c.v;
  const v = await api('threads/' + t.id + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date');
  if (v) { metaCache.set(t.id, { h: t.historyId || v.historyId, v }); if (metaCache.size > 3000) metaCache.delete(metaCache.keys().next().value); }
  return v;
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
        const threads = await pool(r.threads || [], 12, t => threadMeta(t));
        gItems = threads.filter(Boolean).map(t => Object.assign(summarize(t), { acc: 'gmail' }));
        next = r.nextPageToken || null;
        // Indésirables commun : on y montre aussi le spam Gmail (sans le déplacer, pour ne pas dérégler le filtre de Gmail)
        if (isBlockLabel(key) && !more) {
          const rs = (await api('threads?' + new URLSearchParams({ labelIds: 'SPAM', includeSpamTrash: 'true', maxResults: 50 })).catch(() => null)) || {};
          const st = await pool(rs.threads || [], 8, t => threadMeta(t).catch(() => null));
          const have = new Set(gItems.map(i => i.id)); gItems = gItems.concat(st.filter(t => t && !have.has(t.id)).map(t => Object.assign(summarize(t), { acc: 'gmail' })));
        }
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
    // Réception : les non lus plus anciens que la première page sont ajoutés, pour que le compteur et la liste disent la même chose
    let extraUnread = [];
    if (key === 'INBOX' && !more) {
      const xs = [];
      if (acc !== 'free' && !settings.primaryOnly) xs.push((async () => {
        const r = (await api('threads?' + new URLSearchParams({ labelIds: 'UNREAD', q: 'in:inbox', maxResults: 30 })).catch(() => null)) || {};
        const ts = await pool(r.threads || [], 8, t => threadMeta(t).catch(() => null));
        ts.filter(Boolean).forEach(t => extraUnread.push(Object.assign(summarize(t), { acc: 'gmail' })));
      })());
      if (acc !== 'gmail' && freeOn()) xs.push(rapi('/free/list?' + new URLSearchParams({ folder: 'INBOX', unread: '1', limit: '30' })).then(r => (r.items || []).forEach(x => extraUnread.push(freeItem(x)))).catch(() => {}));
      xs.push(Promise.all(jobs));
      await Promise.all(xs);
    } else await Promise.all(jobs);
    const seenIds = new Set(gItems.concat(fItems).map(i => i.id));
    const fresh = gItems.concat(fItems, extraUnread.filter(i => i.unread && !seenIds.has(i.id) && seenIds.add(i.id))).sort((a, b) => b.date - a.date);
    const data = { at: Date.now(), next, freeBefore, freeMore, items: more ? (ids => prev.items.concat(fresh.filter(i => !ids.has(i.id))))(new Set(prev.items.map(i => i.id))) : fresh };
    state.lists[cacheKey] = data;
    if (['INBOX', 'UNREAD', 'SENT'].includes(key) && !more) { try { LS.set('list:' + cacheKey, { next: data.next, freeBefore: data.freeBefore, freeMore: data.freeMore, items: data.items.slice(0, 40) }); } catch (e) {} }
    if (state.current === cacheKey) { const y = scrollY; drawList(data, plain); if (reset && y) scrollTo(0, y); }
    // Recherche de l'assistant qui ne trouve presque rien : on bascule seul sur la recherche par le sens
    if (key === 'SEARCH' && !more && settings.ai && state.aiNote && state.aiNote.q === q && !state.aiNote.auto && data.items.length < 3) { state.aiNote.auto = true; toast('Peu de résultats, je cherche par le sens…'); location.hash = '#/smart/' + encodeURIComponent(state.aiNote.ask); }
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
    att: msgs.some(m => /multipart\/mixed/i.test((m.payload && m.payload.mimeType) || '')),
    mine: msgs.some(m => (m.labelIds || []).includes('SENT')),
    promo: ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_FORUMS'].some(l => labels.has(l)),
    unread: msgs.some(m => (m.labelIds || []).includes('UNREAD')),
    starred: labels.has('STARRED'),
    spam: labels.has('SPAM'),
    labels: [...labels].filter(id => /^Label_/.test(id))
  };
}

function itemHTML(it, cls, sentView) {
  const who = sentView && it.to ? 'À : ' + it.to : it.from;
  const curKey = keyOf(state.current);
  const blocked = it.folder === BLOCK_LABEL || it.labels.some(id => (labelById(id) || {}).name === BLOCK_LABEL);
  const chips = (it.spam ? '<span class="chip blocked">Spam</span>' : blocked ? '<span class="chip blocked">Bloqué</span>' : '') + it.labels.map(id => { const l = labelById(id); return l && l.name !== BLOCK_LABEL && id !== curKey ? `<span class="chip lab" style="--c:${esc(labelColor(l))}">${esc(l.name)}</span>` : ''; }).join('');
  const sel = state.sel && state.sel.has(it.id) ? ' sel' : '';
  const href = it.acc === 'free' ? '#/free/' + encodeURIComponent(it.folder) + '/' + it.uid : '#/thread/' + encodeURIComponent(it.id);
  const sizeChip = state.showSize && it.size ? `<span class="chip size">${it.size >= 1048576 ? (it.size / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(it.size / 1024)) + ' Ko'}</span>` : '';
  // Taille discrète à droite de l'objet quand le mail a une pièce jointe (taille du mail entier, quasi égale à celle des pièces jointes)
  const attSize = it.att && it.size && !sizeChip ? `<span class="att-size" aria-label="Pièce jointe, ${fmtMo(it.size)}">📎 ${fmtMo(it.size)}</span>` : '';
  const accChip = state.showAcc ? `<span class="chip acc-${it.acc === 'free' ? 'free' : 'gmail'}">${it.acc === 'free' ? 'Free' : 'Gmail'}</span>` : '';
  return `<a class="item ${cls}${sel}" data-id="${esc(it.id)}" href="${href}">
    <span class="mark" aria-hidden="true"></span>
    <span class="body">
      <span class="row1"><span class="who">${esc(who)}${it.count > 1 ? ` <span class="count">(${it.count})</span>` : ''}</span>${it.starred ? '<span class="star" role="button" aria-label="Ne plus suivre">★</span>' : ''}<span class="when">${esc(state.dayMode ? new Date(it.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : fmtDate(it.date))}</span></span>
      <span class="subj${attSize ? ' has-att' : ''}"><span class="subj-t">${it.unread ? '<span class="sr">Non lu : </span>' : ''}${esc(it.subject)}</span>${attSize}</span>
      <span class="row3"><span class="snip">${esc(it.snippet)}</span><span class="chips">${it.att && !attSize ? '<span class="chip att-chip" title="Pièce jointe">📎</span>' : ''}${sizeChip}${accChip}${chips}</span></span>
    </span></a>`;
}
/* Mails tout juste supprimés ou bloqués : masqués pendant 30 s, le temps que Gmail/Free le confirment,
   pour qu'un rafraîchissement arrivé entre-temps ne les fasse pas réapparaître */
const gone = new Map();
const hideGone = ids => { const t = Date.now() + 30000; ids.forEach(id => gone.set(id, t)); };
const isGone = id => { const t = gone.get(id); if (!t) return false; if (t < Date.now()) { gone.delete(id); return false; } return true; };
function drawList(data, plain) {
  const l = $('#list'); if (!l) return;
  if (gone.size && data.items.some(i => isGone(i.id))) data = Object.assign({}, data, { items: data.items.filter(i => !isGone(i.id)) });
  // Suivis : un mail dont on vient de retirer l'étoile n'a plus rien à faire ici
  if (state.listCtx && state.listCtx.key === 'STARRED' && data.items.some(i => !i.starred)) data = Object.assign({}, data, { items: data.items.filter(i => i.starred) });
  state.showAcc = freeOn(); state.dayMode = false;
  if (!data.items.length) { l.innerHTML = $('#subdirs') && $('#subdirs').innerHTML ? '<div class="empty">Aucun mail directement dans ce dossier : ouvre un sous-dossier ci-dessus.</div>' : '<div class="empty">Aucun message ici.</div>'; return; }
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
  state.dayMode = true;
  let h = '';
  const inboxView = ['INBOX', 'UNREAD'].includes(keyOf(state.current)) || isFolderView(keyOf(state.current));
  if (unread.length) h += `<h2 class="sec unread">Non lus · ${unread.length}${inboxView ? '<button class="sec-btn" id="btn-readall" type="button">Tout marquer lu</button>' : ''}</h2>` + byDay(unread, i => itemHTML(i, 'u'));
  if (read.length) h += (unread.length ? '<h2 class="sec">Déjà lus</h2>' : '') + byDay(read, i => itemHTML(i, plain ? 'plain' : '', keyOf(state.current) === 'SENT'));
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
/* Liste affichée remise à jour quand un mail arrive ou que le nombre de non lus change */
let lastOwn = null, refreshT = null;
function refreshVisibleList() {
  clearTimeout(refreshT);
  refreshT = setTimeout(() => {
    const h = location.hash || '#/list/INBOX';
    if (!h.startsWith('#/list/') || !state.listCtx || state.sel || document.visibilityState !== 'visible') return;
    const c = state.listCtx; loadList(c.key, c.q, c.cacheKey, c.plain, true);
  }, 800);
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
    if (lastOwn !== null && own !== lastOwn) refreshVisibleList();
    lastOwn = own;
    const b = $('#badge-inbox'); b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
    const f = $('#fcount'); if (f) f.textContent = own ? '· ' + own : '';
    if (cnt) $$('.acc-n').forEach(el => { const v = cnt[el.dataset.n] || 0; el.textContent = v ? v + ' non lu' + (v > 1 ? 's' : '') : 'à jour'; });
    if (navigator.setAppBadge) { n ? navigator.setAppBadge(n).catch(() => {}) : navigator.clearAppBadge().catch(() => {}); }
  } catch (e) {}
}


/* ---------- Sélection multiple ---------- */
function bindListGestures(list) {
  let timer = null, longDone = false, sx = 0, sy = 0, cur = null, lock = null, dx = 0, bg = null, swiped = false, base = 0;
  // Tiroir ouvert après un glissement à gauche : boutons Bloquer et Supprimer
  let tray = null;
  const TRAY = 160;
  const full = () => Math.max(230, list.clientWidth * 0.6);
  const closeTray = () => {
    if (!tray) return;
    const t = tray; tray = null;
    t.a.style.transition = 'transform .2s'; t.a.style.transform = '';
    setTimeout(() => { t.a.style.transition = ''; t.bg.remove(); }, 220);
  };
  const reset = () => { if (cur) { cur.style.transition = 'transform .2s'; cur.style.transform = ''; const c = cur; setTimeout(() => { c.style.transition = ''; }, 220); } if (bg) { const g = bg; setTimeout(() => g.remove(), 200); } cur = null; bg = null; lock = null; dx = 0; base = 0; };
  const drawBg = it => {
    const isFull = dx < -full();
    bg.classList.toggle('left', dx < 0); bg.classList.toggle('on', Math.abs(dx) > 70); bg.classList.toggle('full', isFull);
    bg.innerHTML = dx < 0
      ? `<button type="button" class="tray-b block" data-tray="block">${ICON.block}<small>Bloquer</small></button><button type="button" class="tray-b del" data-tray="trash">${ICON.trash}<small>Supprimer</small></button>`
      : `<span>${it && it.unread ? ICON.read + 'Lu' : ICON.unread + 'Non lu'}</span>`;
  };
  list.addEventListener('touchstart', e => {
    if (tray) {
      if (e.target.closest('[data-tray]')) return;
      const same = e.target.closest('a.item') === tray.a;
      closeTray(); swiped = same; cur = null; return;
    }
    const a = e.target.closest('a.item'); if (!a || e.touches[0].clientX < 24) return;
    longDone = false; swiped = false; sx = e.touches[0].clientX; sy = e.touches[0].clientY; cur = a; lock = null; dx = 0; base = 0;
    timer = setTimeout(() => { longDone = true; if (navigator.vibrate) navigator.vibrate(15); if (!state.sel) enterSelect(); toggleSel(a); }, 480);
  }, { passive: true });
  list.addEventListener('touchmove', e => {
    if (!cur) return;
    const mx = e.touches[0].clientX - sx, my = e.touches[0].clientY - sy;
    if (!lock && (Math.abs(mx) > 10 || Math.abs(my) > 10)) { clearTimeout(timer); timer = null; lock = Math.abs(mx) > Math.abs(my) * 1.3 && !state.sel ? 'h' : 'v'; }
    if (lock !== 'h') return;
    e.preventDefault();
    dx = Math.max(-list.clientWidth, Math.min(160, base + mx));
    if (!bg) {
      bg = document.createElement('div'); bg.className = 'swipe-bg';
      bg.style.top = cur.offsetTop + 'px'; bg.style.height = cur.offsetHeight + 'px';
      list.insertBefore(bg, cur);
    }
    const wasFull = bg.classList.contains('full');
    drawBg(findItem(cur.dataset.id));
    if (bg.classList.contains('full') && !wasFull && navigator.vibrate) navigator.vibrate(8);
    cur.style.transform = 'translateX(' + dx + 'px)';
  }, { passive: false });
  list.addEventListener('touchend', () => {
    clearTimeout(timer); timer = null;
    if (lock === 'h' && cur) {
      swiped = true;
      const a = cur, id = a.dataset.id, it = findItem(id);
      if (dx < -full()) {
        // Glissé jusqu'au bout : suppression seule, jamais de blocage
        if (navigator.vibrate) navigator.vibrate(10);
        collapseRow(a); swipeAct(id, 'trash');
        setTimeout(() => { if (bg) bg.remove(); bg = null; cur = null; lock = null; }, 220);
        return;
      }
      if (dx < -60) {
        // Tiroir ouvert : on attend un tap sur Supprimer ou Bloquer
        a.style.transition = 'transform .2s'; a.style.transform = 'translateX(' + (-TRAY) + 'px)';
        setTimeout(() => { a.style.transition = ''; }, 220);
        const t = { a, bg, it };
        bg.classList.add('tray'); bg.classList.remove('full');
        bg.querySelectorAll('[data-tray]').forEach(b => b.onclick = ev => {
          ev.preventDefault(); ev.stopPropagation();
          tray = null; t.bg.remove();
          if (navigator.vibrate) navigator.vibrate(10);
          collapseRow(a);
          if (b.dataset.tray === 'block') quickBlock(it); else swipeAct(id, 'trash');
        });
        tray = t; bg = null; cur = null; lock = null; dx = 0;
        return;
      }
      if (dx > 90) {
        if (navigator.vibrate) navigator.vibrate(10);
        reset(); swipeAct(id, it && it.unread ? 'read' : 'unread');
        return;
      }
    }
    reset();
  });
  list.addEventListener('scroll', closeTray, { passive: true });
  window.addEventListener('scroll', closeTray, { passive: true });
  list.addEventListener('contextmenu', e => { if (e.target.closest('a.item')) e.preventDefault(); });
  list.addEventListener('click', e => {
    if (e.target.closest('[data-tray]')) return;
    // Toucher l'étoile retire le suivi, sans ouvrir le mail
    const st = e.target.closest('.star');
    if (st && !state.sel) { e.preventDefault(); e.stopPropagation(); const a = st.closest('a.item'); if (a) unstarRow(a.dataset.id); return; }
    const a = e.target.closest('a.item'); if (!a) return;
    if (longDone || swiped) { e.preventDefault(); longDone = false; swiped = false; return; }
    if (state.sel) { e.preventDefault(); toggleSel(a); }
  });
}
/* Retire une ligne de la liste en la refermant (pas de trou) */
function collapseRow(a) {
  if (!a || !a.parentNode) return;
  a.style.transition = 'transform .2s, opacity .2s'; a.style.transform = 'translateX(-110%)'; a.style.opacity = '0';
  setTimeout(() => { a.style.overflow = 'hidden'; a.style.height = a.offsetHeight + 'px'; a.offsetHeight; a.style.transition = 'height .2s, margin .2s, padding .2s'; a.style.height = '0'; a.style.margin = '0'; a.style.paddingTop = a.style.paddingBottom = '0'; a.style.borderWidth = '0'; }, 180);
  setTimeout(() => { a.remove(); $$('#list .swipe-bg').forEach(x => x.remove()); }, 420);
}
async function unstarRow(id) {
  const it = findItem(id); if (!it) return;
  const set = v => { Object.values(state.lists).forEach(d => { d.items = d.items.map(i => i.id === id ? Object.assign({}, i, { starred: v }) : i); }); reDraw(); };
  const run = v => it.acc === 'free'
    ? (p => rapi('/free/flags', { method: 'POST', body: { folder: p.folder, uids: [p.uid], flagged: v } }))(parseFreeId(id))
    : api('threads/' + id + '/modify', { method: 'POST', body: v ? { addLabelIds: ['STARRED'] } : { removeLabelIds: ['STARRED'] } });
  set(false);
  try { await run(false); toast('Suivi retiré', { label: 'Annuler', run: async () => { set(true); try { await run(true); } catch (e) { set(false); toast('Annulation impossible'); } } }); }
  catch (e) { set(true); if (e.message !== 'auth') toast('Échec : ' + e.message); }
}
function findItem(id) { for (const d of Object.values(state.lists)) { const i = d.items.find(x => x.id === id); if (i) return i; } return null; }
async function swipeAct(id, kind) {
  let r;
  if (kind === 'trash') hideGone([id]);
  try { r = await act([id], kind); } catch (e) { gone.delete(id); reDraw(); return; }
  if (!r.ok) { gone.delete(id); toast('Action impossible'); reDraw(); return; }
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
  hideGone([item.id]);
  const t = blockTarget(item.fromEmail);
  const names = LS.get('blockedNames', {}); names[t] = t.includes('@') ? (item.fromName || t) : brandOf(t); LS.set('blockedNames', names);
  const dates = LS.get('blockedDates', {}); dates[t] = Date.now(); LS.set('blockedDates', dates);
  // Free d'abord, indépendamment de Gmail : un Gmail qui freine ne doit pas empêcher le blocage côté Free
  let moved = 0, freeErr = null;
  if (freeOn()) { try { moved += (await rapi('/free/block', { method: 'POST', body: { target: t } })).moved || 0; } catch (e) { freeErr = e; } }
  try {
    const lab = await blockLabelId();
    const froms = (((await api('settings/filters')) || {}).filter || []).map(f => (f.criteria && f.criteria.from || '').toLowerCase());
    let filterId = null;
    if (!isCovered(t, froms)) filterId = (await api('settings/filters', { method: 'POST', body: { criteria: { from: t }, action: { addLabelIds: [lab], removeLabelIds: ['INBOX', 'UNREAD'] } } })).id;
    moved += await moveExisting(t, lab);
    if (freeErr) toast('Free : ' + freeErr.message);
    const hit = e => e && (e.toLowerCase() === t || blockTarget(e) === t);
    $$('#list a.item').forEach(a => { const i = findItem(a.dataset.id); if (i && hit(i.fromEmail)) collapseRow(a); });
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
  } catch (e) {
    if (e.message === 'scope') return needScope();
    if (e.message === 'auth') return;
    if (moved && !freeErr) { gone.clear(); route(); toast('Bloqué côté Free · Gmail : ' + e.message + ', réessaie plus tard'); }
    else { toast('Échec : ' + (freeErr ? 'Free : ' + freeErr.message + ' · ' : '') + e.message); reDraw(); }
  }
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
    if (isBlockLabel(labelId)) { try { count += ((await api('labels/SPAM?fields=messagesTotal')) || {}).messagesTotal || 0; } catch (e) {} }
    // Gmail met parfois du temps à recompter un dossier renommé ou déplacé : on vérifie au lieu de croire « 0 »
    if (!count) { const r = (await api('messages?' + new URLSearchParams({ labelIds: labelId, maxResults: 100 }))) || {}; count = (r.messages || []).length; }
    if (!count) return { count: 0, bytes: 0 };
    let memo = null; try { memo = JSON.parse(localStorage.getItem('ml-size-' + labelId) || 'null'); } catch (e) {}
    if (memo && memo.count === count && Date.now() - memo.at < 30 * 60000) return memo;
    const r = (await api('messages?' + new URLSearchParams({ labelIds: labelId, maxResults: 25 }).toString())) || {};
    const ids = (r.messages || []).map(m => m.id);
    const sizes = (await pool(ids, 2, id => api('messages/' + id + '?format=minimal&fields=sizeEstimate').then(x => (x && x.sizeEstimate) || 0).catch(() => null))).filter(x => x != null);
    const avg = sizes.length ? sizes.reduce((x, y) => x + y, 0) / sizes.length : 0;
    const out = { count, bytes: Math.round(avg * count), approx: count > sizes.length, at: Date.now() };
    try { localStorage.setItem('ml-size-' + labelId, JSON.stringify(out)); } catch (e) {}
    return out;
  })();
  const free = freeOn() && (isBlockLabel(labelId) || labelId === 'TRASH') ? rapi('/free/size?folder=' + (labelId === 'TRASH' ? 'TRASH' : 'BLOCKED')).catch(() => null) : Promise.resolve(null);
  try {
    const [g, f] = await Promise.all([gmail.catch(() => null), free]);
    if (!g && !f) return 'Taille indisponible';
    // Gmail n'a pas répondu : ne surtout pas afficher « Vide » sur la seule foi de Free
    if (!g) return 'Taille Gmail indisponible pour l’instant' + (f && f.count ? ' · Free ' + f.count + ' mail' + (f.count > 1 ? 's' : '') : '');
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
      if (isBlockLabel(labelId)) {
        // spam Gmail : à la corbeille aussi
        let sp = null;
        do {
          const p = new URLSearchParams({ labelIds: 'SPAM', includeSpamTrash: 'true', maxResults: 500 });
          const r = (await api('messages?' + p.toString())) || {};
          const ids = (r.messages || []).map(m => m.id);
          if (!ids.length) break;
          await api('messages/batchModify', { method: 'POST', body: { ids, addLabelIds: ['TRASH'], removeLabelIds: ['SPAM', 'UNREAD'] } });
          total += ids.length; b.textContent = total + ' supprimés…';
          sp = r.nextPageToken;
        } while (sp);
      }
      if (freeOn() && isBlockLabel(labelId)) { try { total += (await rapi('/free/empty', { method: 'POST', body: { folder: 'BLOCKED' } })).moved || 0; } catch (e) { toast('Free : ' + e.message); } }
      closeSheet();
      Object.keys(state.lists).forEach(k => delete state.lists[k]);
      toast(total ? total + ' mail' + (total > 1 ? 's' : '') + ' placé' + (total > 1 ? 's' : '') + ' dans la corbeille' : 'Rien à supprimer');
      route();
    } catch (e) { closeSheet(); if (e.message !== 'auth') toast('Échec : ' + e.message); }
  };
}

/* Vider la corbeille : suppression définitive, Gmail et Free */
function emptyTrash() {
  openSheet(`<span class="grip"></span><h2>Vider la corbeille ?</h2>
    <p style="margin:0;color:var(--muted);font-size:.85rem;line-height:1.5">Tous les mails de la corbeille${freeOn() ? ', Gmail et Free,' : ''} sont <b>effacés définitivement</b> et la place est libérée tout de suite. Impossible de les récupérer ensuite.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"><button class="btn" data-close>Annuler</button><button class="btn danger" id="trash-ok">Vider</button></div>`);
  $('#trash-ok').onclick = async () => {
    const b = $('#trash-ok'); b.disabled = true; b.textContent = 'Suppression…';
    let job;
    try {
      job = await rapi('/trash/empty', { method: 'POST' });
      // Le relais travaille seul ; on affiche l'avancement (tu peux quitter l'app, il continue)
      const sub = $('#sheet p'); if (sub) sub.innerHTML = 'Effacement en cours sur le serveur. Tu peux fermer l\u2019app, il continue tout seul.';
      while (job.running) {
        await new Promise(r => setTimeout(r, 2000));
        job = await rapi('/trash/empty');
        const bb = $('#trash-ok'); if (!bb) break;
        bb.textContent = (job.gmail + job.free) + ' effacés…';
      }
    } catch (e) { closeSheet(); toast('Échec : ' + e.message); return; }
    closeSheet();
    Object.keys(state.lists).forEach(k => delete state.lists[k]);
    try { localStorage.removeItem('ml-size-TRASH'); } catch (e) {}
    route(); // d'abord recharger la liste : route() referme les fenêtres, le bilan s'ouvre après
    const total = (job.gmail || 0) + (job.free || 0);
    // Bilan détaillé, qui reste affiché : on sait exactement ce qui a été fait ou non
    const bilan = `Gmail : <b>${job.gmail || 0}</b> effacé${job.gmail > 1 ? 's' : ''}${freeOn() ? ` · Free : <b>${job.free || 0}</b>` : ''}`;
    if (job.error === 'scope') {
      openSheet(`<span class="grip"></span><h2>Autorisation Gmail à ajouter</h2>
        <p style="margin:0;color:var(--muted);font-size:.85rem;line-height:1.5">${bilan}.<br>Google refuse l’effacement définitif : ton serveur n’a pas encore cette autorisation. Appuie sur Autoriser, choisis ton compte, accepte tout (si Google affiche « application non vérifiée » : Paramètres avancés puis Continuer). De retour ici, relance « Vider ».</p>
        <button class="btn primary" id="tr-auth">Autoriser</button><button class="btn" data-close>Plus tard</button>`);
      $('#tr-auth').onclick = () => { location.href = relayGoogleStart(); };
    } else if (job.error) {
      openSheet(`<span class="grip"></span><h2>Vidage interrompu</h2><p style="margin:0;color:var(--muted);font-size:.85rem;line-height:1.5">${bilan}.<br>Arrêt : <code>${esc(job.error)}</code></p><button class="btn primary" data-close>OK</button>`);
    } else toast(total ? total + ' mail' + (total > 1 ? 's' : '') + ' effacé' + (total > 1 ? 's' : '') + ' définitivement' : 'La corbeille était déjà vide');
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
    ${(() => { const other = msgs.map(m => parseAddr(hdr(m, 'From'))).filter(a => a.email && !isMe(a.email)).pop() || splitAddrs(hdr(lastM, 'To')).map(parseAddr).find(a => a.email && !isMe(a.email)); return other ? contactLink(other.name, other.email.toLowerCase()) : ''; })()}
    ${unsubH ? '<div class="unsub-bar"><span>Mail de liste de diffusion</span><button class="btn" id="t-unsub">Se désabonner</button></div>' : ''}
    <div class="toolbar">
      <button id="t-archive">${ICON.archive}Archiver</button>
      <button id="t-label">${ICON.tag}Classer</button>
      <button id="t-block">${ICON.block}Bloquer</button>
      <button id="t-trash">${ICON.trash}Supprimer</button>
      <button id="t-unread">${ICON.unread}Non lu</button>
      <button id="t-star" aria-pressed="${starred}">${starred ? ICON.starOn : ICON.star}${starred ? 'Suivi' : 'Suivre'}</button>
      <button id="t-todo">${ICON.todo}À faire</button>
      <button id="t-snooze">${ICON.clock}Plus tard</button>
      <button id="t-cal">${ICON.cal}Agenda</button>
    </div>
    ${aiBar()}
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
  bindReadTools();
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
    ${(() => { if (m.from.email && !isMe(m.from.email)) return contactLink(m.from.name, m.from.email.toLowerCase()); const t = splitAddrs(m.to || '').map(parseAddr).find(a => a.email && !isMe(a.email)); return t ? contactLink(t.name, t.email.toLowerCase()) : ''; })()}
    ${m.unsub ? '<div class="unsub-bar"><span>Mail de liste de diffusion</span><button class="btn" id="t-unsub">Se désabonner</button></div>' : ''}
    <div class="toolbar">
      <button id="t-archive">${ICON.archive}Archiver</button>
      <button id="t-fmove">${ICON.tag}Classer</button>
      <button id="t-block">${ICON.block}Bloquer</button>
      <button id="t-trash">${ICON.trash}Supprimer</button>
      <button id="t-unread">${ICON.unread}Non lu</button>
      <button id="t-todo">${ICON.todo}À faire</button>
      <button id="t-snooze">${ICON.clock}Plus tard</button>
      <button id="t-cal">${ICON.cal}Agenda</button>
    </div>
    ${aiBar()}
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
  state.thread = null; state.freeCtx = { id, folder, uid };
  bindReadTools();
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
  // Retour à la liste d'où vient le mail (réception, dossier, résultats de recherche)
  const last = state.lastList || sessionStorage.getItem('mb-last') || '#/list/INBOX';
  if (history.length > 1 && state.cameFromApp && state.prevHash === last) history.back();
  else location.hash = last;
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
    box.innerHTML = `<div class="atts-h">📎 ${files.length} pièce${files.length > 1 ? 's' : ''} jointe${files.length > 1 ? 's' : ''}</div>`;
    const kind = a => { const n = (a.name || '').toLowerCase(), mt = (a.mime || '').toLowerCase(); if (/pdf/.test(mt) || n.endsWith('.pdf')) return ['PDF', 'PDF', 'pdf']; if (/^image\//.test(mt)) return ['IMG', 'Image', 'img']; if (/word|\.docx?$/.test(mt + n)) return ['DOC', 'Word', 'doc']; if (/sheet|excel|\.xlsx?$|\.csv$/.test(mt + n)) return ['XLS', 'Excel', 'xls']; if (/zip|compressed/.test(mt + n)) return ['ZIP', 'Archive', 'zip']; return [(n.split('.').pop() || 'FIC').slice(0, 4).toUpperCase(), 'Fichier', 'oth']; };
    files.forEach(a => {
      const [lab, type, cls] = kind(a);
      const c = document.createElement('div');
      c.className = 'attc';
      c.innerHTML = `<span class="thumb ${cls}">${esc(lab)}</span><span class="t"><b>${esc(a.name)}</b><small>${type} · ${esc(fmtSize(a.size))}</small></span><button class="btn">Ouvrir</button>`;
      const btn = $('button', c);
      btn.onclick = () => openAttachment(fetcher, a, btn);
      $('.t', c).onclick = () => btn.click();
      if (cls === 'img' && (a.size || 0) < 3e6) fetcher(a).then(d => { const th = $('.thumb', c); th.style.backgroundImage = `url(data:${a.mime || 'image/jpeg'};base64,${d})`; th.textContent = ''; }).catch(() => {});
      box.appendChild(c);
    });
    container.insertBefore(box, body);
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
  const label = btn.querySelector('.s') || btn; const old = label.textContent; label.textContent = '…';
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
    <div id="lab-sug"></div>
    <p style="margin:0 0 6px;color:var(--muted);font-size:.8rem">Ce sont tes libellés Gmail : le classement apparaît aussi dans Gmail.</p>
    ${rows.map(r => `<label class="check"><input type="checkbox" value="${esc(r.id)}" ${current.has(r.id) ? 'checked' : ''}><span class="sw" style="--c:${esc(r.c)}"></span>${esc(r.name)}</label>`).join('')}
    <form id="newlab" style="display:flex;gap:8px;margin-top:6px"><label class="f" style="flex:1"><span class="sr">Nouveau libellé</span><input id="newlab-name" placeholder="Nouveau libellé"></label><button class="btn" type="submit">Créer</button></form>
    ${state.thread && state.thread.id === threadId ? `<label class="switch" style="margin-top:6px">Toujours ranger les mails de cet expéditeur dans le dossier coché<input type="checkbox" id="lab-rule"></label>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"><button class="btn" data-close>Annuler</button><button class="btn primary" id="lab-ok">Valider</button></div>`);
  const ctx = state.thread && state.thread.id === threadId ? readCtx() : null;
  if (ctx) suggestFolder(ctx, labels.map(l => ({ key: l.id, name: l.name })), (key, why) => {
    const box = $('#lab-sug'); if (!box) return;
    const l = labels.find(x => x.id === key); if (!l) return;
    box.innerHTML = `<div class="sug"><span>💡 <b>${esc(l.name.split('/').join(' › '))}</b><small>${esc(why)}</small></span><button class="btn primary" id="sug-go">Ranger ici</button></div>`;
    $('#sug-go').onclick = async () => { closeSheet(); try { await api('threads/' + threadId + '/modify', { method: 'POST', body: { addLabelIds: [key], removeLabelIds: ['INBOX'] } }); patchCached(threadId, () => null); toast('Rangé dans ' + l.name.split('/').pop()); badgeNow(0); goBack(); } catch (e) { if (e.message !== 'auth') toast(e.message); } };
  });
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
    const rule = $('#lab-rule') && $('#lab-rule').checked && ctx && ctx.fromEmail ? add.find(i => i !== 'INBOX') : null;
    closeSheet();
    if (rule) api('settings/filters', { method: 'POST', body: { criteria: { from: ctx.fromEmail }, action: { addLabelIds: [rule], removeLabelIds: ['INBOX'] } } }).then(() => toast('Règle créée : les prochains mails de ' + ctx.fromEmail + ' iront directement dans ce dossier')).catch(e => toast(e.message === 'scope' ? 'Autorisation des règles manquante (Réglages › Comptes)' : 'Règle : ' + e.message));
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
/* ---------- Guide d'utilisation intégré ---------- */
const GUIDE = [
  ['👋', 'Prise en main', `
    <p>MailBox réunit <b>Gmail</b> (pastille bleue) et <b>Free</b> (pastille rose) dans une seule appli, plus lisible que Gmail.</p>
    <p>En bas : <b>Reçus</b>, <b>Agenda</b>, <b>Écrire</b>, <b>Contacts</b>, <b>Dossiers</b>. Les <b>Envoyés</b> sont dans Dossiers, les <b>Réglages</b> derrière la roue dentée en haut de Reçus. Le chiffre sur Reçus et sur l'icône de l'iPhone est le nombre de mails non lus.</p>
    <p>Un mail <b>non lu</b> a un cadre jaune et un rond jaune plein. Les mails sont groupés par jour (Aujourd’hui, Hier, Mardi 17 novembre…), avec l’heure à droite. Un mail <b>lu</b> est simplement en gris. L'étiquette <b>Gmail</b> ou <b>Free</b> en bas à droite indique la boîte.</p>
    <div class="tip">Les mots de passe ne sont jamais dans l'appli ni sur GitHub : Gmail passe par Google, Free par ton serveur, chiffré.</div>`],
  ['👆', 'Les gestes', `
    <div class="gges"><span>← court<br><b>Supprimer</b></span><span>←← jusqu'au bord<br><b>Bloquer</b></span><span>→<br><b>Lu / non lu</b></span></div>
    <p><b>Appui long</b> sur un mail : mode sélection. Coche plusieurs mails (ou « Tout sélectionner ») puis Lu, Non lu, Archiver, Supprimer ou Bloquer.</p>
    <p><b>Depuis le bord gauche</b> de l'écran, glisse vers la droite pour revenir en arrière.</p>
    <p>Dans <b>Dossiers</b> : balaye un dossier à gauche pour le supprimer, à droite pour le déplacer ou le renommer.</p>
    <div class="tip">Après chaque action, un bouton <b>Annuler</b> reste 6 secondes en bas de l'écran.</div>`],
  ['📥', 'Réception et non lus', `
    <p>Les onglets <b>Tous / Gmail / Free</b> filtrent par boîte, avec le nombre de non lus de chacune. Le bouton <b>Non lus</b> n'affiche que ceux-là.</p>
    <p><b>Tout marquer lu</b> (à droite de « Non lus ») passe toute la boîte en lu, avec Annuler.</p>
    <p>Une 📎 dans la liste signale un mail avec pièce jointe ; dans le mail, les pièces jointes s’affichent en cartes en haut, avant le texte, avec <b>Ouvrir</b>.</p>
    <p>Dans un mail : <b>Répondre</b>, <b>À tous</b>, <b>Transférer</b>, <b>Classer</b>, <b>Archiver</b>, <b>Bloquer</b>, <b>Suivre</b> (étoile). Les citations des anciens messages sont repliées.</p>
    <p><b>Se désabonner</b> : sur une newsletter, une barre en haut du mail permet de se désinscrire en un appui.</p>
    <p>Réglages › Affichage › <b>Principal seulement</b> masque Promotions, Réseaux sociaux, etc. de la réception et du compteur.</p>`],
  ['✍️', 'Écrire', `
    <p>Le champ <b>De</b> permet de choisir l'adresse d'envoi : Gmail ou Free. L'envoi Free apparaît aussi dans les Envoyés Free.</p>
    <p>En transférant un mail, ses pièces jointes suivent.</p>`],
  ['⛔', 'Bloquer et indésirables', `
    <p>Bloquer range automatiquement <b>tous les mails de la marque</b> (ex. toutes les adresses @aliexpress.com) dans « Indésirables », côté Gmail et Free : <b>pas de notification, pas de pastille</b>.</p>
    <p>Glisse un mail vers la gauche : les boutons <b>Bloquer</b> et <b>Supprimer</b> apparaissent. Glisser jusqu’au bout supprime seulement, sans bloquer.</p>
    <p>Réglages › <b>Voir les mails indésirables</b> : taille occupée et <b>Tout supprimer</b> (vers la corbeille).</p>
    <p>Réglages › <b>Voir les expéditeurs bloqués</b> : tri par date ou A → Z, <b>Débloquer</b>, et « Regrouper par marque ».</p>
    <div class="tip">Une adresse Gmail, Hotmail, Free… est bloquée seule, jamais tout le domaine.</div>`],
  ['📁', 'Dossiers', `
    <p>Gmail et Free sont rangés en accordéons. La flèche jaune déplie les sous-dossiers. Le chiffre est le nombre de non lus.</p>
    <p><b>☆</b> épingle un dossier dans les Favoris, en haut. <b>Chercher un dossier</b> filtre par nom.</p>
    <p><b>＋</b> crée un dossier (Gmail ou Free, au premier niveau ou dans un autre).</p>
    <p>Un dossier « thème » (ex. Maison) affiche ses sous-dossiers en haut : ses mails sont dedans.</p>
    <p>Dans un dossier : <b>Tout marquer lu</b>, <b>Tout supprimer</b>, sélection et gestes comme dans la réception.</p>
    <p><b>⏳ En attente de réponse</b> : les mails reçus de vraies personnes sans réponse de ta part, et tes envois restés sans réponse.</p>`],
  ['🧹', 'Ranger et transférer', `
    <p><b>Ranger</b> liste les dossiers vraiment vides à supprimer (décoche ceux à garder : ils ne seront plus proposés).</p>
    <p><b>✦ Remplacer INBOX par des thèmes</b> : l'IA propose de regrouper tes dossiers en grands thèmes. Le plan est groupé par thème ; <b>✎</b> change le thème, en crée un nouveau ou renomme ; rien n'est appliqué sans ta validation, aucun mail n'est supprimé.</p>
    <p><b>Free → Gmail</b> : balaye un dossier Free vers la droite › onglet <b>Vers Gmail</b>. Les mails sont copiés avec dates, pièces jointes et état lu/non lu ; le transfert tourne sur ton serveur et reprend tout seul s'il est interrompu. Une barre en haut de Dossiers suit la progression.</p>`],
  ['✅', 'Tâches et rappels', `
    <p>Dans un mail, <b>À faire</b> transforme le mail en tâche : l’assistant propose l’intitulé et la date, tu ajustes (Ce soir, Demain 8 h, Lundi 8 h ou date précise).</p>
    <p>À l’heure dite, une <b>notification</b> te le rappelle, même pendant les heures calmes.</p>
    <p>Dossiers › <b>✅ Tâches</b> : en retard (en rouge), aujourd’hui, à venir, sans date. Le rond coche la tâche (avec Annuler), un appui sur le texte la modifie, <b>Mail</b> rouvre le mail d’origine, <b>＋</b> ajoute une tâche libre.</p>`],
  ['⏰', 'Plus tard et annuler l’envoi', `
    <p><b>Plus tard</b> dans un mail : il quitte la réception et revient, non lu, au moment choisi, avec une notification. En attendant il est dans le dossier « Mis de côté ».</p>
    <p><b>Annuler l’envoi</b> : après Envoyer, tu as 6 secondes pour toucher Annuler ; le message reste à l’écran.</p>`],
  ['✦', 'Assistant IA', `
    <p><b>Résumer</b> (en haut d’un mail) : résumé, points clés, suivi de l’échange (qui a dit quoi, quand), engagements et échéances. Chaque échéance a un bouton <b>+ Tâche</b>.</p>
    <p>Tu peux aussi écrire dans la loupe « tous les échanges avec les Aciers du Littoral » : l’appli retrouve l’adresse dans le carnet de tes correspondants (construit sur ton serveur à partir de tes mails) et ouvre directement vos échanges.</p>
    <p><b>👤 Tous les échanges avec…</b> (sous le titre d’un mail) : toute ta correspondance avec cette personne, dans les deux sens, Gmail et Free. <b>Retracer l’historique</b> y fait relire les échanges par l’IA : résumé, chronologie, engagements en cours et échéances (avec + Tâche).</p>
    <p><b>Réponse IA</b> : 3 propositions (accepter, décliner, demander une précision) ou selon ta consigne (« accepter jeudi, proposer 10 h »). <b>Utiliser et modifier</b> ouvre la réponse pré-remplie.</p>
    <p><b>Classer</b> : une suggestion 💡 apparaît en haut (là où sont déjà les mails de cet expéditeur, sinon « Suggérer un dossier »). La case <b>Toujours ranger…</b> crée une règle automatique pour les prochains mails.</p>
    <p><b>Recherche</b> : écris une phrase dans la loupe (« la promo Devred de mon anniversaire », « mes plus gros mails »). Une longue phrase (« un gars est venu réparer mon portail il y a quelque temps, retrouve nos échanges ») part directement en recherche par le sens ; une phrase courte qui trouve moins de 3 mails y bascule toute seule sur la <b>recherche par le sens</b> : il déduit les expéditeurs probables, les synonymes et la période, examine jusqu’à 80 mails Gmail et Free, tous dossiers confondus, puis les classe en « Correspond le mieux » et « Peut-être aussi », avec la raison de chaque résultat. Si une personne ou une entreprise ressort, <b>Tous les échanges avec…</b> affiche toute votre correspondance.</p>
    <div class="tip">Ces fonctions envoient à Groq le texte du mail concerné, uniquement quand tu touches le bouton. Le rangement des dossiers n’envoie que leurs noms.</div>`],
  ['🔔', 'Pastille et notifications', `
    <p>Le serveur prévient l'iPhone à chaque nouveau mail : notification <b>discrète</b> (sans son) et pastille sur l'icône.</p>
    <p><b>Heures calmes</b> (22 h – 7 h par défaut) : rien la nuit, un seul résumé au réveil.</p>
    <p><b>Pastille seule, sans notification</b> : Réglages de l'iPhone › Notifications › MailBox › décoche Écran verrouillé, Centre de notifications et Bannières ; laisse Pastilles.</p>
    <p>Si tu lis tes mails ailleurs (PC), la pastille de l'iPhone se recale dans les 2 minutes.</p>`],
  ['🛠', 'Mises à jour et dépannage', `
    <p><b>Mettre à jour l'appli</b> : Réglages › Application › Mettre à jour (ou le bandeau jaune quand il apparaît).</p>
    <p><b>Mettre à jour le serveur</b> (quand c'est indiqué) : dans Termius, colle :</p>
    <code>curl -fsSL https://raw.githubusercontent.com/masuel254/Mailbox/main/relay/install.sh | sudo bash</code>
    <p>Ta configuration, Gmail, Free et la clé IA sont conservés. n8n n'est pas touché.</p>
    <p><b>Voir ce qui se passe sur le serveur</b> :</p>
    <code>sudo docker logs mailbox-relay 2>&1 | tail -20</code>
    <p><b>Un mail affiche des caractères bizarres</b> : mets l'appli à jour, ils sont réparés automatiquement.</p>
    <p><b>Gmail demande de ralentir</b> : attends une minute, l'appli réessaie seule.</p>
    <div class="tip">Ne partage jamais le code d'accès du relais, ni la capture qui l'affiche à la fin d'une installation.</div>`]
];
function renderGuide() {
  const v = $('#view');
  v.innerHTML = `<div class="sticky-head"><a class="back back-sm" href="#/settings">${ICON.back}Réglages</a><div class="top"><h1>Guide MailBox</h1></div>
    <div class="searchbar"><input type="search" id="gq" placeholder="Chercher : bloquer, dossier, pastille…" autocomplete="off"></div></div>
    <div id="guide">${GUIDE.map(([ic, t, body], i) => `<details class="set gsec" data-g="${i}"><summary><span class="gic">${ic}</span><span class="set-t">${esc(t)}</span><span class="chev" aria-hidden="true"></span></summary><div class="card gbody">${body}</div></details>`).join('')}
    <p class="fhint" style="text-align:center;margin-top:14px">MailBox v${esc(APP_VERSION)}</p></div>`;
  const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  $('#gq').oninput = e => {
    const q = norm(e.target.value.trim());
    $$('#guide .gsec').forEach(d => { const hit = !q || norm(d.textContent).includes(q); d.hidden = !hit; d.open = !!q && hit; });
  };
}
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
  const draw = focus => {
    const sc = ($('.tidy-list') || {}).scrollTop || 0;
    const dels = lines.filter(l => l.kind === 'del'), ai = lines.filter(l => l.kind !== 'del');
    openSheet(`<span class="grip"></span><h2>Ranger mes dossiers</h2>
      <div class="tidy-list">
        <h3 class="tidy-h">Dossiers vides · ${dels.length}</h3>
        ${dels.length ? dels.map(l => `<label class="switch"><span><span class="dot tdot" style="background:var(--${l.x.acc})"></span>Supprimer <b>${esc(disp(l.x).split('/').join(' › '))}</b></span><input type="checkbox" data-i="${lines.indexOf(l)}" ${l.on ? 'checked' : ''}></label>`).join('') : '<p class="fhint">Aucun dossier vide.</p>'}
        <h3 class="tidy-h">Proposition de l'IA${ai.length ? ' · ' + ai.length + ` <button class="sec-btn" id="tidy-toggle" type="button">${ai.every(l => l.on) ? 'Tout décocher' : 'Tout cocher'}</button>` : ''}</h3>
        ${ai.length ? (() => {
          // regroupé par dossier d'arrivée : un bloc par thème, une ligne courte par dossier déplacé
          const groups = new Map();
          ai.forEach(l => { const parts = l.to.split('/'); const raw = (l.kind === 'merge' ? parts : parts.slice(0, -1)).join('/'); const dest = raw.split('/').join(' › ') || 'Premier niveau'; const k = l.acc + '|' + dest; if (!groups.has(k)) groups.set(k, { acc: l.acc, dest, raw, items: [] }); groups.get(k).items.push(l); });
          return [...groups.values()].sort((a, c) => a.dest.localeCompare(c.dest, 'fr')).map(gr => `<div class="tgroup"><div class="tgroup-h"><span class="dot tdot" style="background:var(--${gr.acc})"></span><span>→ ${esc(gr.dest)}</span><button class="tedit" type="button" data-gedit="${esc(gr.acc + '|' + gr.raw)}" aria-label="Renommer ce thème">✎</button><small>${gr.items.length}</small><input type="checkbox" class="tg-all" data-g="${esc(gr.acc + '|' + gr.dest)}" ${gr.items.every(l => l.on) ? 'checked' : ''} aria-label="Tout le groupe"></div>
            ${gr.items.map(l => { const fp = l.from.split('/'), leaf = fp.pop(), np = l.to.split('/').pop(); return `<label class="trow"><span class="tname"><span class="tl"><b>${esc(leaf)}</b>${l.kind === 'merge' ? ' <em>fusionné</em>' : np !== leaf ? ' <em>→ ' + esc(np) + '</em>' : ''}</span><small>${esc(fp.length ? 'depuis ' + fp.join(' › ') : 'depuis le premier niveau')}</small></span><button class="tedit" type="button" data-edit="${lines.indexOf(l)}" aria-label="Changer la destination">✎</button><input type="checkbox" data-i="${lines.indexOf(l)}" data-gk="${esc(gr.acc + '|' + gr.dest)}" ${l.on ? 'checked' : ''}></label>`; }).join('')}</div>`).join('');
        })()
          : settings.ai ? `<button class="btn primary" id="tidy-themes" type="button">✦ Remplacer INBOX par des thèmes</button><button class="btn" id="tidy-ai" type="button">✦ Proposer un rangement général</button><p class="fhint">L’IA ne reçoit que les noms de tes dossiers et leur nombre de mails. Rien n’est appliqué sans ta validation, et aucun mail n’est supprimé.</p>`
          : '<p class="fhint">Active l’assistant IA dans Réglages › Relais et notifications pour obtenir une proposition.</p>'}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"><button class="btn" data-close>Annuler</button><button class="btn primary" id="tidy-ok">Appliquer (${lines.filter(l => l.on).length})</button></div>`);
    if (sc && $('.tidy-list')) $('.tidy-list').scrollTop = sc;
    if (typeof focus === 'number') { const c = $('.tidy-list input[data-i="' + focus + '"]'); const r = c && c.closest('.trow'); if (r) { r.scrollIntoView({ block: 'center' }); r.classList.add('flash'); } }
    $$('.tidy-list input[data-i]').forEach(c => c.onchange = () => { lines[+c.dataset.i].on = c.checked; $('#tidy-ok').textContent = 'Appliquer (' + lines.filter(l => l.on).length + ')'; });
    // Modifier une proposition : autre thème, nouveau thème ou autre nom
    $$('.tidy-list [data-edit]').forEach(b => b.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      const l = lines[+b.dataset.edit], row = b.closest('.trow');
      if (row.nextElementSibling && row.nextElementSibling.classList.contains('tedit-box')) { row.nextElementSibling.remove(); return; }
      const parts = l.to.split('/'), curDest = (l.kind === 'merge' ? parts : parts.slice(0, -1)).join('/'), curName = l.kind === 'merge' ? l.from.split('/').pop() : parts[parts.length - 1];
      const themes = new Set(lines.filter(x => x.kind !== 'del' && x.acc === l.acc).map(x => { const p = x.to.split('/'); return (x.kind === 'merge' ? p : p.slice(0, -1)).join('/'); }).filter(Boolean));
      (l.acc === 'gmail' ? g : f).forEach(x => { if (!x.full.includes(x.delim || '/') && x.full !== BLOCK_LABEL && x.full !== l.from) themes.add(x.full); });
      const box = document.createElement('div'); box.className = 'tedit-box';
      box.innerHTML = `<label class="f">Ranger dans<select class="te-dest"><option value="">— Premier niveau —</option>${[...themes].sort((a, c) => a.localeCompare(c, 'fr')).map(t => `<option value="${esc(t)}" ${t === curDest ? 'selected' : ''}>${esc(t.split('/').join(' › '))}</option>`).join('')}<option value="__new">＋ Nouveau thème…</option></select></label>
        <label class="f te-newl" hidden>Nom du nouveau thème<input class="te-new" autocomplete="off" placeholder="ex. Maison"></label>
        <label class="f">Nom du dossier<input class="te-name" value="${esc(curName)}" autocomplete="off"></label>
        <div style="display:flex;gap:8px"><button class="btn" type="button" data-x>Annuler</button><button class="btn primary" type="button" data-ok>Valider</button></div>`;
      row.after(box);
      const sel = $('.te-dest', box); sel.onchange = () => { $('.te-newl', box).hidden = sel.value !== '__new'; if (sel.value === '__new') $('.te-new', box).focus(); };
      $('[data-x]', box).onclick = () => box.remove();
      $('[data-ok]', box).onclick = () => {
        const dest = sel.value === '__new' ? $('.te-new', box).value.trim().replace(/\s*\/\s*/g, '/') : sel.value;
        const name = $('.te-name', box).value.trim().replace(/[\/]/g, '-');
        if (!name || (sel.value === '__new' && !dest)) { toast('Complète le nom'); return; }
        l.kind = 'move'; l.to = dest ? dest + '/' + name : name; l.on = l.to !== l.from; l.why = 'modifié par toi';
        draw(lines.indexOf(l)); toast('« ' + name + ' » → ' + (dest ? dest.split('/').join(' › ') : 'premier niveau'));
      };
    });
    // Renommer tout un thème proposé
    $$('.tidy-list [data-gedit]').forEach(b => b.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      const [acc, raw] = [b.dataset.gedit.split('|')[0], b.dataset.gedit.slice(b.dataset.gedit.indexOf('|') + 1)];
      const head = b.closest('.tgroup-h');
      if (head.nextElementSibling && head.nextElementSibling.classList.contains('tedit-box')) { head.nextElementSibling.remove(); return; }
      const box = document.createElement('div'); box.className = 'tedit-box';
      box.innerHTML = `<label class="f">Nouveau nom du thème<input class="te-name" value="${esc(raw)}" autocomplete="off"></label><div style="display:flex;gap:8px"><button class="btn" type="button" data-x>Annuler</button><button class="btn primary" type="button" data-ok>Renommer</button></div>`;
      head.after(box);
      $('[data-x]', box).onclick = () => box.remove();
      $('[data-ok]', box).onclick = () => {
        const nv = $('.te-name', box).value.trim().replace(/\s*\/\s*/g, '/'); if (!nv) return;
        lines.filter(x => x.kind !== 'del' && x.acc === acc).forEach(x => { if (x.to === raw) x.to = nv; else if (x.to.startsWith(raw + '/')) x.to = nv + x.to.slice(raw.length); });
        draw();
      };
    });
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
let xferTimer = null;
async function watchTransfer() {
  clearTimeout(xferTimer);
  const bar = $('#xfer-bar'); if (!bar) return;
  let t; try { t = await rapi('/transfer/status'); } catch (e) { return; }
  if (!t || t.state === 'none' || (t.state !== 'running' && LS.get('xferSeen', '') === t.path + t.label + t.done)) { bar.hidden = true; return; }
  const pct = t.total ? Math.round(100 * t.done / t.total) : 0;
  bar.hidden = false;
  bar.className = 'xfer-bar' + (t.state === 'error' ? ' err' : '');
  bar.innerHTML = t.state === 'running'
    ? `<b>Transfert Free → Gmail</b><span>${esc(t.path)} → ${esc(t.label.split('/').join(' › '))} · ${t.done} / ${t.total || '…'}${t.failed ? ' · ' + t.failed + ' en échec' : ''}</span><i style="width:${pct}%"></i>`
    : t.state === 'done' ? `<b>Transfert terminé ✓</b><span>${t.done} mail${t.done > 1 ? 's' : ''} dans Gmail › ${esc(t.label.split('/').join(' › '))}${t.failed ? ' · ' + t.failed + ' en échec (restés dans Free)' : ''}</span><button class="sec-btn" id="xfer-ok">OK</button>`
    : `<b>Transfert interrompu</b><span>${esc(t.error)} · ${t.done} mails copiés. Relance le transfert : il reprend là où il s'est arrêté.</span><button class="sec-btn" id="xfer-ok">OK</button>`;
  const ok = $('#xfer-ok'); if (ok) ok.onclick = () => { LS.set('xferSeen', t.path + t.label + t.done); bar.hidden = true; state.folders = null; LS.del('foldersCache'); renderLabels(); };
  // dossiers Free en cours de transfert : grisés avec la progression
  $$('a.frow[data-k^="f:"]').forEach(a => { const p = a.dataset.k.slice(2); const on = t.state === 'running' && (p === t.path || p.startsWith(t.path + '/') || p.startsWith(t.path + '.')); a.classList.toggle('xfering', on); });
  if (t.state === 'running') { state.xferRunning = true; xferTimer = setTimeout(watchTransfer, 3000); }
  else if (state.xferRunning) { state.xferRunning = false; state.folders = null; LS.del('foldersCache'); labelsCache = null; setTimeout(renderLabels, 300); }
}
function moveFolderSheet(x, all) {
  if (x.full === BLOCK_LABEL) { toast('Le dossier Indésirables est protégé'); return; }
  const sep = x.delim || '/';
  const parts = x.full.split(sep), leaf = parts.pop(), curParent = parts.join(sep);
  const paths = new Set();
  all.filter(y => y.acc === x.acc).forEach(y => { const ps = y.full.split(y.delim || '/'); for (let i = 1; i <= ps.length; i++) paths.add(ps.slice(0, i).join(sep)); });
  const targets = [...paths].filter(p => p !== x.full && !p.startsWith(x.full + sep) && p !== BLOCK_LABEL).sort((a, b) => a.localeCompare(b, 'fr')).map(full => ({ full }));
  const canXfer = x.acc === 'free' && relayOn() && relayGmailOn();
  openSheet(`<span class="grip"></span><h2>Déplacer « ${esc(leaf)} »</h2>
    ${canXfer ? `<div class="accounts" role="tablist" style="margin:0"><button class="on" data-mvt="free"><span class="acc-l"><span class="dot" style="background:var(--free)"></span>Dans Free</span></button><button data-mvt="gmail"><span class="acc-l"><span class="dot" style="background:var(--gmail)"></span>Vers Gmail</span></button></div>` : ''}
    <div class="mv-free" style="display:flex;flex-direction:column;gap:10px">
    <p style="margin:0;color:var(--muted);font-size:.85rem"><span class="dot tdot" style="background:var(--${x.acc})"></span>Ses mails et sous-dossiers suivent. Si un dossier du même nom existe déjà à l’arrivée, les deux sont fusionnés.</p>
    <label class="f">Ranger dans<select id="mv-parent"><option value="">— Premier niveau —</option>${targets.map(y => `<option value="${esc(y.full)}" ${y.full === curParent ? 'selected' : ''}>${esc(y.full.split(sep).join(' › '))}</option>`).join('')}</select></label>
    <label class="f">Nom<input id="mv-name" value="${esc(leaf)}" autocomplete="off"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"><button class="btn" data-close>Annuler</button><button class="btn primary" id="mv-ok">Déplacer</button></div></div>
    ${canXfer ? `<div class="xfer" hidden>
      <p style="margin:0;color:var(--muted);font-size:.8rem;line-height:1.45">Les mails de ce dossier${all.some(y => y.acc === 'free' && y.full.startsWith(x.full + sep)) ? ' et de ses sous-dossiers' : ''} sont copiés dans Gmail, avec leurs dates, pièces jointes et état lu/non lu. Ça se fait sur ton serveur : tu peux fermer l'appli.</p>
      <label class="f">Dossier Gmail d'arrivée<select id="xf-parent"><option value="">— Premier niveau —</option>${[...new Set(all.filter(y => y.acc === 'gmail').flatMap(y => { const ps = y.full.split('/'); return ps.map((_, i) => ps.slice(0, i + 1).join('/')); }))].filter(p => p !== BLOCK_LABEL).sort((a, c) => a.localeCompare(c, 'fr')).map(p => `<option value="${esc(p)}" ${p.toLowerCase() === curParent.split(sep).join('/').toLowerCase() ? 'selected' : ''}>${esc(p.split('/').join(' › '))}</option>`).join('')}</select></label>
      <label class="f">Nom dans Gmail<input id="xf-name" value="${esc(leaf)}" autocomplete="off"></label>
      <label class="switch">Ensuite, mettre les mails Free à la corbeille et supprimer le dossier Free<input type="checkbox" id="xf-del" checked></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="btn" data-close>Annuler</button><button class="btn primary" id="xf-ok">Transférer</button></div></div>` : ''}`);
  $$('[data-mvt]').forEach(b => b.onclick = () => { const gm = b.dataset.mvt === 'gmail'; $$('[data-mvt]').forEach(y => y.classList.toggle('on', y === b)); $('.mv-free').style.display = gm ? 'none' : 'flex'; $('.xfer').hidden = !gm; });
  const xf = $('#xf-ok'); if (xf) xf.onclick = async () => {
    const name = $('#xf-name').value.trim().replace(/[\/]/g, '-'); if (!name) { toast('Donne un nom'); return; }
    const parent = $('#xf-parent').value, label = parent ? parent + '/' + name : name;
    xf.disabled = true; xf.textContent = 'Démarrage…';
    try { await rapi('/transfer/free-to-gmail', { method: 'POST', body: { path: x.full, label, deleteSource: $('#xf-del').checked } }); closeSheet(); toast('Transfert lancé vers Gmail › ' + label.split('/').join(' › ')); state.folders = null; LS.del('foldersCache'); renderLabels(); }
    catch (e) { xf.disabled = false; xf.textContent = 'Transférer vers Gmail'; toast(e.message); }
  };
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
/* ---------- Outils de lecture : IA, tâches, plus tard ---------- */
/* Lien « Tous les échanges avec … » : l'interlocuteur du mail (pas moi) */
function contactLink(name, email) {
  if (!email) return '';
  const q = 'from:' + email + ' OR to:' + email;
  return `<a class="contact-bar" href="#/search/${encodeURIComponent(q)}"><span>👤 Tous les échanges avec <b>${esc(name || email)}</b></span><span class="chev-r" aria-hidden="true"></span></a>`;
}
function aiBar() {
  return settings.ai ? `<div class="ai-tools"><button class="btn" id="ai-sum">${ICON.spark}Résumer</button><button class="btn" id="ai-rep">${ICON.spark}Réponse IA</button></div><div id="ai-out"></div>` : '';
}
function readCtx() {
  if (state.thread && location.hash.startsWith('#/thread/')) {
    const { msgs, subject, id } = state.thread, last = msgs[msgs.length - 1] || {};
    const fromH = hdr(last, 'From'), fa = parseAddr(fromH);
    const firstOther = msgs.slice().reverse().find(m => !isMe(parseAddr(hdr(m, 'From')).email)) || last;
    const fo = parseAddr(hdr(firstOther, 'From'));
    const text = msgs.map(m => `--- ${hdr(m, 'From')} · ${fmtDate(+m.internalDate, true)}\n` + plainOf(m).split('\n').filter(l => !/^\s*>/.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').slice(0, 5000)).join('\n\n');
    return { acc: 'gmail', id, subject, from: fo.name || fo.email, fromEmail: fo.email, text, last, reply: prefill => { state.composeFrom = { mode: 'reply', m: last, prefill }; location.hash = '#/compose?mode=reply&t=' + Date.now(); }, url: '#/thread/' + encodeURIComponent(id) };
  }
  const m = state.freeMsg, c = state.freeCtx || {};
  if (!m) return null;
  return { acc: 'free', id: c.id, folder: c.folder, uid: c.uid, subject: m.subject, from: m.from.name || m.from.email, fromEmail: m.from.email, text: (m.text || htmlText(m.html || '')).slice(0, 9000), reply: prefill => { state.composeFrom = { mode: 'reply', fm: m, prefill }; location.hash = '#/compose?mode=reply&t=' + Date.now(); }, url: '#/free/' + encodeURIComponent(c.folder) + '/' + c.uid };
}
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
function bindReadTools() {
  const ctx = readCtx(); if (!ctx) return;
  $('#t-todo').onclick = () => taskSheet({ ref: { acc: ctx.acc, url: ctx.url, subject: ctx.subject, from: ctx.from } }, ctx);
  $('#t-snooze').onclick = () => snoozeSheet(ctx);
  const cb = $('#t-cal'); if (cb) cb.onclick = () => eventFromMail(ctx, cb);
  const sb = $('#ai-sum'); if (sb) sb.onclick = () => aiSummary(ctx, sb);
  const rb = $('#ai-rep'); if (rb) rb.onclick = () => aiReplySheet(ctx);
}
/* Historique des échanges avec une personne : l'IA retrace la chronologie à partir des mails */
async function contactHistory(email, cacheKey, btn) {
  const out = $('#hist-out'); if (!out) return;
  if (out.innerHTML) { out.innerHTML = ''; return; }
  const data = state.lists[cacheKey];
  const items = data ? data.items.slice().sort((a, b) => a.date - b.date).slice(-40) : [];
  if (!items.length) { toast('Attends que la liste soit chargée'); return; }
  btn.disabled = true; out.innerHTML = '<div class="ai-card"><div class="loading">L’assistant relit vos échanges…</div></div>';
  // texte complet des 10 échanges les plus récents, aperçu pour les autres
  const full = await pool(items.slice(-10), 4, async it => {
    try {
      if (it.acc === 'free') { const m = await rapi('/free/message?' + new URLSearchParams({ folder: it.folder, uid: it.uid })); return (m.text || htmlText(m.html || '')).split('\n').filter(l => !/^\s*>/.test(l)).join('\n').slice(0, 1500); }
      const t = await api('threads/' + it.id + '?format=full'); return (t.messages || []).map(m => `[${hdr(m, 'From')} · ${fmtDate(+m.internalDate, true)}] ` + plainOf(m).split('\n').filter(l => !/^\s*>/.test(l)).join('\n').slice(0, 900)).join('\n');
    } catch (e) { return ''; }
  });
  const fullBy = new Map(items.slice(-10).map((it, i) => [it.id, full[i]]));
  const text = items.map(it => `--- ${fmtDate(it.date, true)} · ${it.mine && it.count === 1 ? 'Samuel → ' + it.to : it.from} · ${it.subject}\n` + (fullBy.get(it.id) || it.snippet || '')).join('\n\n').slice(0, 13000);
  try {
    const r = await rapi('/ai/summary', { method: 'POST', body: { text: 'Historique des échanges entre Samuel et ' + email + ', du plus ancien au plus récent.\n\n' + text, today: today() } });
    const li = a => (a || []).filter(Boolean);
    out.innerHTML = `<div class="ai-card"><h3>✦ Historique avec ${esc(email)}</h3><p>${esc(r.resume || '')}</p>
      ${li(r.chronologie).length ? `<h4>Chronologie</h4><ol class="tl">${li(r.chronologie).map(x => `<li><b>${esc(x.date || '')}</b> ${esc(x.qui || '')} : ${esc(x.fait || '')}</li>`).join('')}</ol>` : ''}
      ${li(r.engagements).length ? `<h4>Engagements en cours</h4><ul>${li(r.engagements).map(x => `<li><b>${esc(x.qui || '')}</b> : ${esc(x.quoi || '')}${x.quand ? ' · ' + esc(x.quand) : ''}</li>`).join('')}</ul>` : ''}
      ${li(r.echeances).length ? `<h4>Échéances</h4>${li(r.echeances).map((x, i) => `<div class="ai-due"><span>${esc(x.quoi || '')}${x.date ? ' · <b>' + esc(new Date(x.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })) + '</b>' : ''}</span><button class="sec-btn" data-due="${i}">+ Tâche</button></div>`).join('')}` : ''}
      <p class="ai-foot">Basé sur ${items.length} mail${items.length > 1 ? 's' : ''} affiché${items.length > 1 ? 's' : ''}${data && (data.next || data.freeMore) ? ' (touche « Afficher plus » en bas pour inclure les plus anciens, puis relance)' : ''}.</p></div>`;
    $$('[data-due]', out).forEach(b => b.onclick = () => { const x = li(r.echeances)[+b.dataset.due]; taskSheet({ title: x.quoi, due: x.date ? new Date(x.date + 'T09:00').getTime() : 0, ref: { acc: 'gmail', url: location.hash, subject: 'Échanges avec ' + email, from: email } }, null); });
  } catch (e) { out.innerHTML = ''; toast('Assistant : ' + e.message); }
  btn.disabled = false;
}
async function aiSummary(ctx, btn) {
  const out = $('#ai-out'); if (!out) return;
  if (out.innerHTML) { out.innerHTML = ''; return; }
  btn.disabled = true; out.innerHTML = '<div class="ai-card"><div class="loading">L’assistant lit l’échange…</div></div>';
  try {
    const r = await rapi('/ai/summary', { method: 'POST', body: { text: 'Objet : ' + ctx.subject + '\n\n' + ctx.text, today: today() } });
    const li = a => (a || []).filter(Boolean);
    out.innerHTML = `<div class="ai-card"><h3>✦ Résumé</h3><p>${esc(r.resume || '')}</p>
      ${li(r.points).length ? `<ul>${li(r.points).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${li(r.chronologie).length > 1 ? `<h4>Suivi de l’échange</h4><ol class="tl">${li(r.chronologie).map(x => `<li><b>${esc(x.date || '')}</b> ${esc(x.qui || '')} : ${esc(x.fait || '')}</li>`).join('')}</ol>` : ''}
      ${li(r.engagements).length ? `<h4>Engagements</h4><ul>${li(r.engagements).map(x => `<li><b>${esc(x.qui || '')}</b> : ${esc(x.quoi || '')}${x.quand ? ' · ' + esc(x.quand) : ''}</li>`).join('')}</ul>` : ''}
      ${li(r.echeances).length ? `<h4>Échéances</h4>${li(r.echeances).map((x, i) => `<div class="ai-due"><span>${esc(x.quoi || '')}${x.date ? ' · <b>' + esc(new Date(x.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })) + '</b>' : ''}</span><button class="sec-btn" data-due="${i}">+ Tâche</button></div>`).join('')}` : ''}
      <p class="ai-foot">Généré par l’IA à partir du mail : vérifie les points importants.</p></div>`;
    $$('[data-due]', out).forEach(b => b.onclick = () => { const x = li(r.echeances)[+b.dataset.due]; taskSheet({ title: x.quoi, due: x.date ? new Date(x.date + 'T09:00').getTime() : 0, ref: { acc: ctx.acc, url: ctx.url, subject: ctx.subject, from: ctx.from } }, null); });
  } catch (e) { out.innerHTML = ''; toast('Assistant : ' + e.message); }
  btn.disabled = false;
}
function aiReplySheet(ctx) {
  openSheet(`<span class="grip"></span><h2>✦ Réponse avec l’IA</h2>
    <label class="f">Consigne (facultatif)<input id="ar-intent" autocomplete="off" placeholder="ex. accepter jeudi 10h, proposer plutôt vendredi"></label>
    <button class="btn primary" id="ar-go">Proposer des réponses</button><div id="ar-out" class="ar-out"></div>`);
  $('#ar-go').onclick = async () => {
    const b = $('#ar-go'); b.disabled = true; b.textContent = 'Rédaction…';
    try {
      const r = await rapi('/ai/reply', { method: 'POST', body: { subject: ctx.subject, text: ctx.text, intent: $('#ar-intent').value.trim() } });
      const vs = (r.variants || []).filter(v => v && v.body);
      $('#ar-out').innerHTML = vs.map((v, i) => `<div class="ar-v"><b>${esc(v.label || 'Proposition ' + (i + 1))}</b><p>${esc(v.body).replace(/\n/g, '<br>')}</p><button class="btn" data-v="${i}">Utiliser et modifier</button></div>`).join('') || '<p class="fhint">Aucune proposition, reformule la consigne.</p>';
      $$('[data-v]', $('#ar-out')).forEach(x => x.onclick = () => { closeSheet(); ctx.reply(vs[+x.dataset.v].body.trim() + '\n'); });
    } catch (e) { toast('Assistant : ' + e.message); }
    b.disabled = false; b.textContent = 'Proposer à nouveau';
  };
}
/* Raccourcis de date */
function quickDates() {
  const at = (d, h, m) => { const x = new Date(d); x.setHours(h, m || 0, 0, 0); return x; };
  const n = new Date(), tm = new Date(n); tm.setDate(n.getDate() + 1);
  const mon = new Date(n); mon.setDate(n.getDate() + ((8 - n.getDay()) % 7 || 7));
  const wk = new Date(n); wk.setDate(n.getDate() + 7);
  const out = [];
  if (n.getHours() < 17) out.push(['Ce soir 18 h', at(n, 18)]);
  out.push(['Demain 8 h', at(tm, 8)], ['Lundi 8 h', at(mon, 8)], ['Dans 1 semaine', at(wk, 8)]);
  return out;
}
const toLocalInput = ms => { if (!ms) return ''; const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
function snoozeSheet(ctx) {
  const q = quickDates();
  openSheet(`<span class="grip"></span><h2>Mettre de côté</h2>
    <p style="margin:0;color:var(--muted);font-size:.85rem">Le mail quitte la réception et revient, non lu, au moment choisi${ctx.acc === 'gmail' ? ' (dossier « Mis de côté » en attendant)' : ''}.</p>
    <div class="qd">${q.map((x, i) => `<button class="btn" data-q="${i}">${esc(x[0])}<small>${esc(x[1].toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }))}</small></button>`).join('')}</div>
    <label class="f">Ou une date précise<input type="datetime-local" id="sn-at"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="btn" data-close>Annuler</button><button class="btn primary" id="sn-ok">Mettre de côté</button></div>`);
  const go = async until => {
    if (!until || until < Date.now() + 60000) { toast('Choisis un moment dans le futur'); return; }
    try {
      await rapi('/snooze', { method: 'POST', body: Object.assign({ acc: ctx.acc, until, subject: ctx.subject, from: ctx.from }, ctx.acc === 'gmail' ? { threadId: ctx.id } : { folder: ctx.folder, uid: ctx.uid }) });
      closeSheet(); patchCached(ctx.id, () => null); badgeNow(0);
      toast('Revient le ' + new Date(until).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }) + ' à ' + new Date(until).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
      goBack();
    } catch (e) { toast(e.message); }
  };
  $$('[data-q]').forEach(b => b.onclick = () => go(q[+b.dataset.q][1].getTime()));
  $('#sn-ok').onclick = () => go(new Date($('#sn-at').value).getTime());
}
/* ---------- Recherche : un seul point d'entrée (loupe de la liste et champ de la recherche par le sens) ---------- */
async function runSearch(val) {

  const words = val.split(/\s+/).length;
  // « échanges avec X » : on cherche d'abord X dans le carnet des correspondants
  if (relayOn() && !/\w:\S/.test(val) && (words >= 3 || /\b(avec|échanges?|mails? de)\b/i.test(val))) {
    try {
      const r = await rapi('/contacts?' + new URLSearchParams({ q: val }));
      const it = r.items || [];
      if (it.length && (/\b(avec|échanges?|correspondance|mails? de|de la part)\b/i.test(val) || it[0].score >= 8)) {
        const go = c => { state.aiNote = null; location.hash = '#/search/' + encodeURIComponent('from:' + c.email + ' OR to:' + c.email); };
        const top = it.filter(c => c.score === it[0].score);
        if (top.length === 1) { go(top[0]); return; }
        openSheet(`<span class="grip"></span><h2>De qui parles-tu ?</h2>${top.slice(0, 6).map((c, i) => `<button class="frow" style="width:100%;background:none;border:none;border-bottom:1px solid var(--line);text-align:left" data-c="${i}"><span class="nm"><b>${esc(c.name || c.email)}</b><br><small style="color:var(--muted)">${esc(c.email)} · ${c.count} mail${c.count > 1 ? 's' : ''}</small></span></button>`).join('')}<button class="btn" data-close>Aucun, chercher autrement</button>`);
        $$('[data-c]').forEach(b => b.onclick = () => { closeSheet(); go(top[+b.dataset.c]); });
        return;
      }
      if (r.building) toast('Je prépare le carnet de tes correspondants (quelques minutes). Recherche par le sens en attendant.');
    } catch (er) {}
  }
  const natural = settings.ai && relayOn() && !/\w:\S/.test(val) && words >= 3;
  if (natural && words >= 5) { state.aiNote = { ask: val }; location.hash = '#/smart/' + encodeURIComponent(val); return; }
  if (natural) {
    toast('L’assistant cherche…');
    try { const r = await rapi('/ai/search', { method: 'POST', body: { q: val, today: new Date().toISOString().slice(0, 10) } }); state.aiNote = { ask: val, q: r.q, resume: r.resume }; location.hash = '#/search/' + encodeURIComponent(r.q); return; }
    catch (er) { toast('Assistant : ' + er.message + ' · recherche simple'); }
  }
  state.aiNote = null; location.hash = '#/search/' + encodeURIComponent(val);
}
/* ---------- Recherche par le sens : plusieurs pistes, puis l'IA trie les candidats ---------- */
const smartCache = (() => { try { return JSON.parse(sessionStorage.getItem('mb-smart') || '{}'); } catch (e) { return {}; } })();
const keepSmart = () => { try { const k = Object.keys(smartCache).sort((a, b) => smartCache[b].at - smartCache[a].at).slice(0, 5); sessionStorage.setItem('mb-smart', JSON.stringify(Object.fromEntries(k.map(x => [x, smartCache[x]])))); } catch (e) {} };
async function renderSmart(question) {
  const v = $('#view');
  v.innerHTML = `<div class="sticky-head"><a class="back back-sm" href="#/list/INBOX">${ICON.back}Réception</a><div class="top"><h1>Recherche</h1></div>
    <form class="searchbar" id="sm-form"><input type="search" id="sm-q" value="${esc(question)}" enterkeyhint="search" autocomplete="off"></form></div>
    <div class="ai-note"><b>✦ Recherche par le sens</b><span id="sm-step">L’assistant explore plusieurs pistes…</span></div><div id="list"><div class="loading">Recherche…</div></div>`;
  $('#sm-form').onsubmit = e => { e.preventDefault(); const v2 = $('#sm-q').value.trim(); $('#sm-q').blur(); if (!v2) return; if (v2 === question) { delete smartCache[question]; renderSmart(question); } else runSearch(v2); };
  const step = t => { const e = $('#sm-step'); if (e) e.textContent = t; };
  // Résultat déjà calculé (retour depuis un mail) : affichage immédiat, sans relancer l'IA
  // position de défilement mémorisée au moment où un mail est ouvert
  $('#list').addEventListener('click', () => { if (smartCache[question]) { smartCache[question].y = scrollY; keepSmart(); } }, true);
  const c = smartCache[question];
  if (c && Date.now() - c.at < 30 * 60000) { step(c.step); state.showAcc = freeOn(); state.dayMode = false; $('#list').innerHTML = c.html; setTimeout(() => scrollTo(0, c.y || 0), 30); return; }
  const save = () => { smartCache[question] = { at: Date.now(), step: ($('#sm-step') || {}).textContent || '', html: ($('#list') || {}).innerHTML || '' }; keepSmart(); };
  let plan;
  try { plan = await rapi('/ai/smart', { method: 'POST', body: { q: question, today: today() } }); } catch (e) { $('#list').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const qs = (plan.queries || []).filter(Boolean).slice(0, 6);
  if (state.aiNote && state.aiNote.ask === question && state.aiNote.q && !qs.includes(state.aiNote.q)) qs.unshift(state.aiNote.q);
  step('Pistes : ' + qs.join(' · '));
  const cand = new Map();
  // deep = seconde passe : corbeille et spam (Gmail et Free), seulement si rien de sûr n'a été trouvé
  const gather = (deep, into) => Promise.all(qs.map(async q => {
    const jobs = [];
    if (settings.clientId || relayGmailOn()) jobs.push((async () => {
      const r = (await api('threads?' + new URLSearchParams(deep ? { q: '(' + q + ') (in:trash OR in:spam)', maxResults: 12, includeSpamTrash: 'true' } : { q, maxResults: 12 }))) || {};
      const ts = await pool(r.threads || [], 6, t => api('threads/' + t.id + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date').catch(() => null));
      ts.filter(Boolean).forEach(t => { const it = summarize(t); it.acc = 'gmail'; if (deep) it.where = (t.messages || []).some(m => (m.labelIds || []).includes('SPAM')) ? 'Spam' : 'Corbeille'; if (!cand.has(it.id)) into.set(it.id, it); });
    })().catch(() => {}));
    if (freeOn()) jobs.push(rapi('/free/search?' + new URLSearchParams(deep ? { q, limit: '12', deep: '1' } : { q, limit: '12' })).then(r => (r.items || []).forEach(x => { const it = freeItem(x); if (deep) it.where = /junk|spam|ind/i.test(x.folder) ? 'Spam' : 'Corbeille'; if (!cand.has(it.id)) into.set(it.id, it); })).catch(() => {}));
    await Promise.all(jobs);
  }));
  await gather(false, cand);
  // pré-tri local : on garde d'abord les mails qui contiennent les mots des pistes
  const kw = [...new Set(qs.join(' ').toLowerCase().replace(/\b(from|to|subject|in|is|has|newer_than|older_than|after|before|label|category):\S*/g, ' ').replace(/[()"]/g, ' ').split(/\s+/).filter(w => w.length > 3 && w !== 'or' && w !== 'and'))];
  const hits = x => { const t = (x.subject + ' ' + x.snippet + ' ' + x.from).toLowerCase(); return kw.filter(w => t.includes(w)).length; };
  const all = [...cand.values()].sort((a, b) => (hits(b) - hits(a)) || (b.date - a.date)).slice(0, 50);
  // On lit le corps des 30 premiers candidats : l'IA juge sur le passage qui parle vraiment du sujet, pas sur le début du mail
  if (all.length) { step(all.length + ' mails candidats, lecture des plus prometteurs…'); try { await enrich(all, searchWords(kw.join(' ') + ' ' + question), 30); } catch (e) {} }
  const txt = x => x.passage && x.passage.hits ? x.passage.excerpt : x.snippet;
  let deepDone = false;
  if (!all.length) {
    step('Rien ici, je regarde aussi dans la corbeille et le spam…');
    const extra = new Map(); await gather(true, extra); deepDone = true;
    all.push(...[...extra.values()].sort((a, b) => (hits(b) - hits(a)) || (b.date - a.date)).slice(0, 40));
  }
  if (!all.length) { $('#list').innerHTML = '<div class="empty">Rien trouvé, même dans la corbeille et le spam. Essaie avec un autre mot ou un expéditeur.</div>'; return; }
  step(all.length + ' mails candidats, tri par pertinence…');
  let ranked = [], contact = null;
  try { const rr = await rapi('/ai/rank', { method: 'POST', body: { q: question, indices: plan.indices || '', items: all.map((x, i) => ({ i, date: new Date(x.date).toLocaleDateString('fr-FR'), from: x.mine && x.count === 1 ? 'Samuel → ' + (x.to || '') : x.from, email: x.fromEmail || x.toEmail || '', n: x.count, mine: x.mine, subject: x.subject, snippet: txt(x), promo: !!(x.promo || PROMO_RE.test(x.fromEmail || '')) })) } }) ; contact = rr.contact && rr.contact.email && /@/.test(rr.contact.email) ? rr.contact : null; ranked = (rr.results || []).filter(r => all[r.i]); } catch (e) { ranked = null; step('Tri par l’IA indisponible (' + e.message + ')'); }
  if (ranked === null) {
    const loc = all.filter(x => hits(x) > 0);
    state.showAcc = freeOn(); state.dayMode = false;
    $('#list').innerHTML = loc.length ? `<h2 class="sec">Contiennent les mots recherchés · ${loc.length}</h2>` + loc.map(i => itemHTML(Object.assign({}, i, { unread: false }), '')).join('') : '<div class="empty">Rien de pertinent trouvé. Réessaie dans une minute ou ajoute un détail (nom, ville, mois).</div>';
    save(); return;
  }
  const where = x => x.where === 'Spam' ? '⚠️ Trouvé dans le spam · ' : x.where ? '🗑️ Trouvé dans la corbeille · ' : '✦ ';
  const mk = r => Object.assign({}, all[r.i], { snippet: where(all[r.i]) + (r.why || ''), unread: false });
  let best = ranked.filter(r => (r.score == null ? 7 : r.score) >= 7).map(mk), maybe = ranked.filter(r => r.score != null && r.score < 7).map(mk);
  let deepNote = '';
  if (deepDone) deepNote = ' (corbeille et spam compris)';
  if (!best.length && !deepDone) {
    // Rien de sûr : on regarde aussi dans la corbeille et le spam
    step('Rien de sûr ici, je regarde aussi dans la corbeille et le spam…');
    const extra = new Map();
    await gather(true, extra);
    const dall = [...extra.values()].sort((a, b) => (hits(b) - hits(a)) || (b.date - a.date)).slice(0, 40);
    if (dall.length) {
      try {
        const rr = await rapi('/ai/rank', { method: 'POST', body: { q: question, indices: plan.indices || '', items: dall.map((x, i) => ({ i, date: new Date(x.date).toLocaleDateString('fr-FR'), from: x.mine && x.count === 1 ? 'Samuel → ' + (x.to || '') : x.from, email: x.fromEmail || x.toEmail || '', n: x.count, mine: x.mine, subject: x.subject, snippet: x.snippet, promo: !!(x.promo || PROMO_RE.test(x.fromEmail || '')) })) } });
        const dk = r => Object.assign({}, dall[r.i], { snippet: where(dall[r.i]) + (r.why || ''), unread: false });
        const dr = (rr.results || []).filter(r => dall[r.i]);
        best = dr.filter(r => (r.score == null ? 7 : r.score) >= 7).map(dk);
        maybe = maybe.concat(dr.filter(r => r.score != null && r.score < 7).map(dk));
        ranked = ranked.concat(dr);
        deepNote = ' (corbeille et spam compris)';
      } catch (e) {}
    }
  }
  step((ranked.length ? (best.length + maybe.length) + ' résultat' + (best.length + maybe.length > 1 ? 's' : '') + ' sur ' + all.length + ' mails examinés' : all.length + ' mails examinés, aucun ne correspond vraiment') + deepNote);
  state.showAcc = freeOn(); state.dayMode = false;
  $('#list').innerHTML = (contact ? `<a class="set-link contact-link" href="#/search/${encodeURIComponent('from:' + contact.email + ' OR to:' + contact.email)}"><span class="set-t">👤 Tous les échanges avec ${esc(contact.name || contact.email)}</span><span class="set-s">${esc(contact.email)}</span><span class="chev-r" aria-hidden="true"></span></a>` : '') + (ranked.length
    ? (best.length ? `<h2 class="sec">Correspond le mieux · ${best.length}</h2>` + best.map(i => itemHTML(i, '')).join('') : '')
      + (maybe.length ? `<h2 class="sec">Peut-être aussi · ${maybe.length}</h2>` + maybe.map(i => itemHTML(i, '')).join('') : '')
      + `<details class="set" style="margin-top:12px"><summary><span class="set-t">Pistes explorées</span><span class="chev"></span></summary><div class="card" style="font-size:.8rem;color:var(--muted)">${qs.map(q => `<code>${esc(q)}</code>`).join('<br>')}${plan.indices ? '<br><br>' + esc(plan.indices) : ''}</div></details>`
    : '<div class="empty">Aucun mail ne correspond vraiment. Ajoute un détail : le nom de l’entreprise, la ville, le mois…</div>');
  save();
}
/* ---------- Tâches ---------- */
async function taskSheet(t, ctx) {
  t = Object.assign({ title: '', due: 0, note: '' }, t);
  const q = quickDates();
  openSheet(`<span class="grip"></span><h2>${t.id ? 'Modifier la tâche' : 'Nouvelle tâche'}</h2>
    ${t.ref && t.ref.subject ? `<p class="fhint" style="margin:0">Liée au mail : <b>${esc(t.ref.subject)}</b></p>` : ''}
    <label class="f">À faire<input id="tk-title" autocomplete="off" value="${esc(t.title)}" placeholder="${ctx && settings.ai ? 'L’assistant propose…' : 'ex. Envoyer le devis'}"></label>
    <div class="qd">${q.map((x, i) => `<button class="btn" type="button" data-q="${i}">${esc(x[0])}</button>`).join('')}</div>
    <label class="f">Rappel<input type="datetime-local" id="tk-due" value="${toLocalInput(t.due)}"></label>
    <label class="f">Note<input id="tk-note" autocomplete="off" value="${esc(t.note || '')}"></label>
    <div style="display:grid;grid-template-columns:${t.id ? '1fr 1fr 1fr' : '1fr 1fr'};gap:10px">${t.id ? '<button class="btn danger" id="tk-del">Supprimer</button>' : '<button class="btn" data-close>Annuler</button>'}${t.id ? '<button class="btn" data-close>Fermer</button>' : ''}<button class="btn primary" id="tk-ok">Enregistrer</button></div>`);
  $$('[data-q]').forEach(b => b.onclick = () => { $('#tk-due').value = toLocalInput(q[+b.dataset.q][1].getTime()); });
  if (ctx && settings.ai && !t.title) {
    rapi('/ai/task', { method: 'POST', body: { subject: ctx.subject, from: ctx.from, text: ctx.text, today: today() } }).then(r => {
      const ti = $('#tk-title'); if (!ti || ti.value) return;
      ti.value = r.title || ''; if (r.due && !$('#tk-due').value) { const d = new Date(r.due); if (!isNaN(d)) $('#tk-due').value = toLocalInput(d.getTime()); }
      ti.placeholder = 'ex. Envoyer le devis';
    }).catch(() => { const ti = $('#tk-title'); if (ti) ti.placeholder = 'ex. Envoyer le devis'; });
  }
  setTimeout(() => { const ti = $('#tk-title'); if (ti && !ctx) ti.focus(); }, 300);
  $('#tk-ok').onclick = async () => {
    const title = $('#tk-title').value.trim(); if (!title) { toast('Écris ce qu’il y a à faire'); return; }
    const due = $('#tk-due').value ? new Date($('#tk-due').value).getTime() : 0;
    try { await rapi('/tasks', { method: 'POST', body: { id: t.id, title, due, note: $('#tk-note').value.trim(), ref: t.ref } }); closeSheet(); toast(due ? 'Tâche enregistrée · rappel le ' + new Date(due).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' à ' + new Date(due).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'Tâche enregistrée'); state.tasks = null; if (location.hash.startsWith('#/tasks')) renderTasks(); }
    catch (e) { toast(e.message); }
  };
  const d = $('#tk-del'); if (d) d.onclick = async () => { try { await rapi('/tasks/delete', { method: 'POST', body: { id: t.id } }); closeSheet(); renderTasks(); } catch (e) { toast(e.message); } };
}
async function renderTasks() {
  const v = $('#view');
  v.innerHTML = `<div class="sticky-head"><a class="back back-sm" href="#/labels">${ICON.back}Dossiers</a><div class="top"><h1>Tâches</h1><button class="icon-btn" id="tk-new" aria-label="Nouvelle tâche">${ICON.plus}</button></div></div><div id="tasks"><div class="loading">Chargement…</div></div>`;
  $('#tk-new').onclick = () => taskSheet({}, null);
  if (!relayOn()) { $('#tasks').innerHTML = '<div class="empty">Les tâches et leurs rappels passent par ton serveur relais (Réglages).</div>'; return; }
  let ts = [];
  try { ts = (await rapi('/tasks')).tasks || []; } catch (e) { $('#tasks').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const now = Date.now(), eod = new Date(); eod.setHours(23, 59, 59, 999);
  const open = ts.filter(t => !t.done).sort((a, b) => (a.due || 9e15) - (b.due || 9e15));
  const groups = [['En retard', open.filter(t => t.due && t.due < now), 'late'], ['Aujourd’hui', open.filter(t => t.due >= now && t.due <= eod), ''], ['À venir', open.filter(t => t.due > eod), ''], ['Sans date', open.filter(t => !t.due), '']];
  const done = ts.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const row = t => `<div class="task ${t.done ? 'done' : ''}" data-t="${esc(t.id)}"><button class="tk-check" aria-label="${t.done ? 'Rouvrir' : 'Fait'}">${t.done ? '✓' : ''}</button><div class="tk-body"><b>${esc(t.title)}</b>${t.due ? `<small class="${!t.done && t.due < now ? 'late' : ''}">⏰ ${esc(new Date(t.due).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }))} · ${esc(new Date(t.due).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))}</small>` : ''}${t.ref && t.ref.subject ? `<small>✉︎ ${esc((t.ref.from ? t.ref.from + ' · ' : '') + t.ref.subject)}</small>` : ''}${t.note ? `<small>${esc(t.note)}</small>` : ''}</div>${t.ref && t.ref.url ? `<a class="sec-btn" href="${esc(t.ref.url.replace(/^.*#/, '#'))}">Mail</a>` : ''}</div>`;
  $('#tasks').innerHTML = (open.length ? groups.filter(g => g[1].length).map(g => `<div class="day-h ${g[2]}">${g[0]} · ${g[1].length}</div><div class="card fold">${g[1].map(row).join('')}</div>`).join('') : '<div class="empty">Rien à faire pour l’instant. Ouvre un mail et touche « À faire ».</div>')
    + (done.length ? `<details class="set" style="margin-top:14px"><summary><span class="set-t">Terminées · ${done.length}</span><span class="chev"></span></summary><div class="card fold">${done.map(row).join('')}</div></details>` : '');
  const byId = id => ts.find(t => t.id === id);
  $$('#tasks .task').forEach(el => {
    const t = byId(el.dataset.t);
    $('.tk-check', el).onclick = async e => { e.stopPropagation(); try { await rapi('/tasks', { method: 'POST', body: { id: t.id, done: !t.done } }); if (!t.done) undoToast('Tâche terminée', () => rapi('/tasks', { method: 'POST', body: { id: t.id, done: false } })); renderTasks(); } catch (er) { toast(er.message); } };
    $('.tk-body', el).onclick = () => taskSheet(t, null);
  });
}
/* Suggestion de dossier : d'abord là où sont déjà les autres mails de l'expéditeur (Gmail), sinon l'IA */
async function suggestFolder(ctx, folders, show) {
  if (!folders.length) return;
  if (ctx.acc === 'gmail' && ctx.fromEmail) {
    try {
      const r = (await api('messages?' + new URLSearchParams({ q: 'from:' + ctx.fromEmail + ' -in:inbox -in:trash -in:spam', maxResults: 8 }))) || {};
      const ms = await pool((r.messages || []).slice(0, 6), 6, m => api('messages/' + m.id + '?format=minimal').catch(() => null));
      const count = {};
      ms.filter(Boolean).forEach(m => (m.labelIds || []).forEach(id => { if (folders.some(f => f.key === id)) count[id] = (count[id] || 0) + 1; }));
      const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
      if (best) { show(best[0], best[1] > 1 ? best[1] + ' autres mails de cet expéditeur y sont déjà' : 'un autre mail de cet expéditeur y est déjà'); return; }
    } catch (e) {}
  }
  if (!settings.ai || !relayOn()) return;
  const box = $('#lab-sug'); if (!box) return;
  box.innerHTML = `<button class="btn" id="sug-ai">${ICON.spark}Suggérer un dossier</button>`;
  $('#sug-ai').onclick = async () => {
    const b = $('#sug-ai'); b.disabled = true; b.lastChild.textContent = 'L’assistant réfléchit…';
    try {
      const r = await rapi('/ai/classify', { method: 'POST', body: { from: ctx.from + ' <' + ctx.fromEmail + '>', subject: ctx.subject, text: ctx.text, folders: folders.map(f => f.name) } });
      const f = folders.find(x => x.name === r.folder);
      if (f) show(f.key, r.why || 'proposé par l’assistant'); else { box.innerHTML = '<p class="fhint">Aucun dossier existant ne convient vraiment.</p>'; }
    } catch (e) { toast(e.message); b.disabled = false; }
  };
}
async function freeMoveSheet(id, folder, uid) {
  openSheet(`<span class="grip"></span><h2>Classer dans…</h2><div id="lab-sug"></div><div id="fm-list"><div class="loading">Chargement…</div></div>
    <label class="switch">Toujours ranger les mails de cet expéditeur dans le dossier choisi<input type="checkbox" id="fm-rule"></label>
    <label class="f">Ou nouveau dossier<input id="fm-new" autocomplete="off" placeholder="ex. Factures 2026"></label>
    <button class="btn primary" id="fm-create">Créer et classer</button>`);
  const fctx = readCtx();
  const go = async to => {
    try {
      if ($('#fm-rule') && $('#fm-rule').checked && fctx && fctx.fromEmail && to !== 'INBOX') rapi('/free/rule', { method: 'POST', body: { from: fctx.fromEmail, folder: to } }).then(() => toast('Règle créée pour ' + fctx.fromEmail)).catch(e => toast(e.message));
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
  if (fctx) suggestFolder(fctx, dirs.filter(x => x.path !== BLOCK_LABEL).map(x => ({ key: x.path, name: x.path.split(x.delim || '/').join('/') })), (key, why) => {
    const box = $('#lab-sug'); if (!box) return;
    box.innerHTML = `<div class="sug"><span>💡 <b>${esc(key.split(/[\/.]/).join(' › '))}</b><small>${esc(why)}</small></span><button class="btn primary" id="sug-go">Ranger ici</button></div>`;
    $('#sug-go').onclick = () => go(key);
  });
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
    <div id="xfer-bar" hidden></div>
    <a class="set-link" href="#/tasks"><span class="set-t">✅ Tâches</span><span class="set-s" id="tk-count">À faire et rappels</span><span class="chev-r" aria-hidden="true"></span></a>
    <a class="set-link" href="#/list/SENT"><span class="set-t">📤 Envoyés</span><span class="set-s">Gmail + Free</span><span class="chev-r" aria-hidden="true"></span></a>
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
      const counts = await pool(labels, 3, l => api('labels/' + l.id + '?fields=id,messagesTotal,threadsUnread').catch(() => null));
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
  // Indésirables et Corbeille : un seul accès commun Gmail + Free, sortis des listes de chaque boîte
  const nfcl = x => String(x || '').normalize('NFC').toLowerCase();
  const isBlk = x => nfcl(x.full) === nfcl(BLOCK_LABEL);
  // Nombre de mails affiché en petit sur Indésirables et Corbeille (compté une fois par visite de la page)
  const cnt = { blk: null, trash: null };
  const fmtN = n => n == null ? '' : n ? ' · ' + n.toLocaleString('fr-FR') + ' mail' + (n > 1 ? 's' : '') : ' · vide';
  const fillCounts = () => {
    const a = $('#cnt-blk'), t = $('#cnt-trash');
    const sub = freeOn() ? 'Gmail + Free' : 'Gmail';
    if (a) a.textContent = sub + fmtN(cnt.blk);
    if (t) t.textContent = sub + fmtN(cnt.trash);
  };
  const loadCounts = async () => {
    const gb = g.find(isBlk);
    const [gt, ft, gbn, fbn] = await Promise.all([
      api('labels/TRASH?fields=messagesTotal').then(x => (x && x.messagesTotal) || 0).catch(() => null),
      freeOn() ? rapi('/free/size?folder=TRASH').then(x => x.count || 0).catch(() => null) : Promise.resolve(0),
      gb ? Promise.all([api('labels/' + encodeURIComponent(gb.id) + '?fields=messagesTotal'), api('labels/SPAM?fields=messagesTotal')]).then(([x, y]) => ((x && x.messagesTotal) || 0) + ((y && y.messagesTotal) || 0)).catch(() => null) : Promise.resolve(0),
      freeOn() ? rapi('/free/size?folder=BLOCKED').then(x => x.count || 0).catch(() => null) : Promise.resolve(0)
    ]);
    cnt.blk = gbn == null || fbn == null ? null : gbn + fbn;
    cnt.trash = gt == null || ft == null ? null : gt + ft;
    fillCounts();
  };
  // 1er comptage rapide, 2e une fois les dossiers relus (nombre exact de mails par dossier)
  setTimeout(() => loadCounts().catch(() => {}), 600);
  setTimeout(() => { if ($('#cnt-trash')) loadCounts().catch(() => {}); }, 6000);
  const common = () => {
    const blk = g.find(isBlk) || f.find(isBlk);
    const sub = freeOn() ? 'Gmail + Free' : 'Gmail';
    return (blk ? `<a class="set-link" href="${blk.href}"><span class="set-t">🚫 Indésirables</span><span class="set-s" id="cnt-blk">${sub + fmtN(cnt.blk)}</span><span class="chev-r" aria-hidden="true"></span></a>` : '')
      + `<a class="set-link" href="#/list/TRASH"><span class="set-t">🗑️ Corbeille</span><span class="set-s" id="cnt-trash">${sub + fmtN(cnt.trash)}</span><span class="chev-r" aria-hidden="true"></span></a>`;
  };
  const draw = q => {
    const $l = $('#labs'); if (!$l) return;
    if (q) {
      const ql = q.toLowerCase();
      const hits = all.filter(x => x.full.toLowerCase().includes(ql));
      $l.innerHTML = hits.length ? `<div class="card fold">${hits.map(x => `<a class="frow" data-k="${esc(x.key)}" href="${x.href}">${FOLD_ICON}<span class="nm">${esc(x.full.split(x.delim || '/').join(' › '))}</span>${dot(x.acc)}${nb(x.n)}${star(x.key)}</a>`).join('')}</div>` : '<div class="empty">Aucun dossier ne correspond.</div>';
    } else {
      const fv = favs.map(k => byKey.get(k)).filter(Boolean);
      $l.innerHTML = (fv.length ? `<h2 class="sec"><span class="fav-t">★</span>Favoris</h2><div class="card fold">${fv.map(x => `<a class="frow" data-k="${esc(x.key)}" href="${x.href}">${FOLD_ICON}<span class="nm">${esc(x.full.split(x.delim || '/').join(' › '))}</span>${dot(x.acc)}${nb(x.n)}${star(x.key)}</a>`).join('')}</div>` : '<p class="fhint">Touche ☆ à côté d’un dossier pour l’épingler ici.</p>')
        + section('Gmail', 'gmail', g.filter(x => !isBlk(x))) + section('Free', 'free', f.filter(x => !isBlk(x)))
        + `<a class="set-link" href="#/list/STARRED"><span class="set-t">⭐ Suivis</span><span class="set-s">Mails marqués « Suivre »</span><span class="chev-r" aria-hidden="true"></span></a>`
        + `<a class="set-link" href="#/list/DRAFT"><span class="set-t">📝 Brouillons</span><span class="set-s">Gmail</span><span class="chev-r" aria-hidden="true"></span></a>`
        + common();
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
  if (relayOn()) rapi('/tasks').then(r => { const n = (r.tasks || []).filter(t => !t.done && t.due && t.due < Date.now() + 864e5).length, o = (r.tasks || []).filter(t => !t.done).length, el = $('#tk-count'); if (el && o) el.textContent = o + ' à faire' + (n ? ' · ' + n + ' pour aujourd’hui' : ''); }).catch(() => {});
  if (relayOn() && freeOn()) watchTransfer();
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
  if (src.prefill) body = src.prefill + body;
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
      <div class="row att-row"><button type="button" class="btn" id="c-att">${ICON.clip}Joindre une photo ou un fichier</button><input type="file" id="c-file" multiple hidden></div>
      <div class="att-list" id="c-atts" hidden></div>
      <label for="c-body" class="sr">Message</label>
      <textarea id="c-body"></textarea>
    </form>`;
  const ta = $('#c-body');
  const added = [];
  ta.value = body;
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, window.innerHeight * 0.45) + 'px'; };
  ta.addEventListener('input', grow); grow();
  setTimeout(() => { if (!to) $('#c-to').focus(); else { ta.focus(); ta.setSelectionRange(0, 0); } }, 50);
  $('#back').onclick = e => { e.preventDefault(); if (((ta.value.trim() && ta.value !== body) || added.length) && !confirm('Abandonner ce message ?')) return; goBack(); };
  $('#c-more').onclick = () => { $('#row-cc').hidden = false; $('#row-bcc').hidden = false; $('#c-cc').focus(); };
  // Pièces jointes ajoutées depuis l'iPhone (Photothèque, appareil photo, Fichiers)
  const MAX_ATT = 20 * 1048576;
  const drawAtts = () => {
    const box = $('#c-atts');
    box.hidden = !added.length;
    box.innerHTML = added.map((a, i) => `<span class="att-chip">${ICON.clip}<span class="att-n">${esc(a.name)}</span><span class="att-s">${fmtMo(a.size)}</span><button type="button" data-rm="${i}" aria-label="Retirer ${esc(a.name)}">×</button></span>`).join('');
    $$('[data-rm]', box).forEach(b => b.onclick = () => { added.splice(+b.dataset.rm, 1); drawAtts(); });
  };
  const readB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
  $('#c-att').onclick = () => $('#c-file').click();
  $('#c-file').onchange = async e => {
    const files = [...e.target.files]; e.target.value = '';
    for (const f of files) {
      const total = added.reduce((x, a) => x + a.size, 0) + fwdAtts.reduce((x, a) => x + (a.size || 0), 0);
      if (total + f.size > MAX_ATT) { toast('Trop lourd : 20 Mo maximum de pièces jointes par mail'); break; }
      try { added.push({ name: f.name || 'piece-jointe', mime: f.type || 'application/octet-stream', size: f.size, b64: await readB64(f) }); } catch (err) { toast('Lecture impossible : ' + (f.name || 'fichier')); }
    }
    drawAtts();
  };
  $('#send').onclick = async () => {
    const o = { to: $('#c-to').value.trim(), cc: $('#c-cc').value.trim(), bcc: $('#c-bcc').value.trim(), subject: $('#c-subj').value, body: ta.value, inReplyTo, references };
    if (!o.to && !o.cc && !o.bcc) { toast('Ajoute un destinataire'); $('#c-to').focus(); return; }
    const bad = splitAddrs([o.to, o.cc, o.bcc].join(',')).map(a => parseAddr(a).email).filter(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    if (bad.length) { toast('Adresse invalide : ' + bad[0]); return; }
    const btn = $('#send'); btn.disabled = true; btn.lastChild.textContent = 'Envoi…';
    // Annuler l'envoi : 6 secondes pour se raviser
    const cancelled = await new Promise(res => { const t = setTimeout(() => res(false), 6200); toast('Envoi dans quelques secondes…', { label: 'Annuler', run: () => { clearTimeout(t); res(true); } }); });
    if (cancelled) { btn.disabled = false; btn.lastChild.textContent = 'Envoyer'; toast('Envoi annulé, ton message est toujours là'); return; }
    try {
      o.attachments = (fwdAtts.length ? await Promise.all(fwdAtts.map(async a => ({ name: a.name, mime: a.mime, b64: await fetchAtt(a) }))) : []).concat(added.map(a => ({ name: a.name, mime: a.mime, b64: a.b64 })));
      if (!o.attachments.length) delete o.attachments;
      const viaFree = $('#c-from') && $('#c-from').value === 'free';
      if (viaFree) await rapi('/free/send', { method: 'POST', body: { to: o.to, cc: o.cc, bcc: o.bcc, subject: o.subject, text: o.body, inReplyTo: o.inReplyTo, references: o.references, attachments: o.attachments } });
      else await gmailSend(o, threadId);
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
/* Gros mails (photos) : au-delà de ~5 Mo, Gmail exige l'envoi « upload » */
async function gmailSend(o, threadId) {
  const mime = buildMime(o);
  if (mime.length < 4500000) { const raw = toUrlB64(btoa(mime)); return api('messages/send', { method: 'POST', body: threadId ? { raw, threadId } : { raw } }); }
  const t = await accessToken();
  if (!t) { auth.login(); throw new Error('auth'); }
  const b = 'up_' + Math.random().toString(36).slice(2);
  const body = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(threadId ? { threadId } : {}) + '\r\n--' + b + '\r\nContent-Type: message/rfc822\r\n\r\n' + mime + '\r\n--' + b + '--';
  const r = await fetch('https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'multipart/related; boundary=' + b }, body });
  if (!r.ok) { let m = 'Erreur ' + r.status; try { m = (await r.json()).error.message; } catch (e) {} throw new Error(m); }
  return r.json().catch(() => null);
}
function buildRaw(o) { return toUrlB64(btoa(buildMime(o))); }
function buildMime(o) {
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
  return msg;
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
    <a class="back back-sm" href="#/list/INBOX">${ICON.back}Reçus</a><div class="top"><h1>Réglages</h1></div>
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
    </div><div style="display:grid;grid-template-columns:${p.rn ? '1fr 1fr' : '1fr'};gap:8px">${p.rn ? '<button class="btn danger" id="cs-del">🗑 Supprimer</button>' : ''}<button class="btn" data-close>Fermer</button></div>`);
  const dl = $('#cs-del'); if (dl) dl.onclick = () => deleteContact(p, onChange);
  const m = $('#cs-mail'); if (m) m.onclick = () => { closeSheet(); openComposeTo(p.name && p.name !== e0 ? `"${p.name}" <${e0}>` : e0, ''); };
  const h = $('#cs-hist'); if (h) h.onclick = () => { closeSheet(); location.hash = '#/search/' + encodeURIComponent(p.emails.map(e => 'from:' + e + ' OR to:' + e).join(' OR ')); };
  $('#cs-rdv').onclick = () => { closeSheet(); location.hash = '#/agenda?new=1&title=' + encodeURIComponent('RDV ' + p.name) + '&with=' + encodeURIComponent(p.name); };
  $('#cs-edit').onclick = () => contactEdit(p, onChange);
  $('#cs-fav').onclick = () => { const f = new Set(LS.get('favContacts', [])); f.has(p.key) ? f.delete(p.key) : f.add(p.key); LS.set('favContacts', [...f]); toast(f.has(p.key) ? 'Ajouté aux favoris' : 'Retiré des favoris'); closeSheet(); if (onChange) onChange(); };
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
  v.innerHTML = `<div class="sticky-head"><div class="top"><h1>Agenda</h1><button class="icon-btn" id="ag-new" aria-label="Nouvel événement">${ICON.plus}</button><button class="icon-btn" id="ag-ref" aria-label="Actualiser">${ICON.refresh}</button></div>
    <div class="seg" id="ag-seg">${[['week', 'Semaine'], ['month', 'Mois'], ['list', 'Liste']].map(([k, n]) => `<button data-m="${k}" class="${mode === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div id="ag-nav"></div></div><div id="ag-sug"></div><div id="ag-list"><div class="loading">Chargement…</div></div>`;
  $$('#ag-seg button').forEach(b => b.onclick = () => { LS.set('agMode', b.dataset.m); renderAgenda(); });
  $('#ag-new').onclick = () => eventSheet({ start: defaultStart(state.agDay) }, () => renderAgenda());
  $('#ag-ref').onclick = () => { state.agCache = null; renderAgenda(); };
  if (hq.get('new')) { history.replaceState(null, '', '#/agenda'); eventSheet({ title: hq.get('title') || '', note: hq.get('with') ? 'Avec ' + hq.get('with') : '', start: defaultStart(state.agDay) }, () => renderAgenda()); }
  const d0 = state.agDay;
  const range = mode === 'week' ? [monday(d0), addDays(monday(d0), 7)]
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
  await ttJob;
  if (gErr && !(ttInfo && ttInfo.enabled)) { $('#ag-list').innerHTML = googleHelp(gErr, 'Agenda'); bindHelp(); return; }
  if (relayOn()) { try { tasks = ((await rapi('/tasks')).tasks || []).filter(t => !t.done && t.due && t.due >= range[0].getTime() && t.due < range[1].getTime()); } catch (e) {} }
  const items = evs.filter(e => e.status !== 'cancelled').map(e => Object.assign({ kind: 'ev', ev: e }, evTimes(e)))
    .concat(tasks.map(t => ({ kind: 'task', t, s: new Date(t.due), e: new Date(t.due), allDay: false })))
    .concat(tt.map(x => x.allDay ? { kind: 'tt', x, s: new Date(x.date + 'T00:00'), e: addDays(new Date(x.endDate + 'T00:00'), 1), allDay: true } : { kind: 'tt', x, s: new Date(x.start), e: new Date(x.end), allDay: false }))
    .sort((a, b) => (b.allDay - a.allDay) || (a.s - b.s));
  const byDay = new Map();
  items.forEach(it => {
    // un événement sur plusieurs jours apparaît chaque jour
    let d = startOfDay(it.s); const end = it.allDay ? it.e : addDays(startOfDay(it.e), 1);
    do { (byDay.get(dayKey(d)) || byDay.set(dayKey(d), []).get(dayKey(d))).push(it); d = addDays(d, 1); } while (d < end && d < range[1]);
  });
  const nav = $('#ag-nav'), tk = dayKey(new Date());
  if (mode === 'week') {
    const m = monday(d0);
    nav.innerHTML = `<div class="ag-head"><button class="icon-btn" id="ag-prev" aria-label="Semaine précédente">‹</button><b>${esc(m.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }))} – ${esc(addDays(m, 6).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }))}</b><button class="icon-btn" id="ag-next" aria-label="Semaine suivante">›</button></div>
      <div class="week">${[...Array(7)].map((_, i) => { const d = addDays(m, i), k = dayKey(d); return `<button class="wd ${k === dayKey(d0) ? 'on' : ''} ${k === tk ? 'today' : ''}" data-d="${k}">${esc(d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''))}<b>${d.getDate()}</b>${byDay.has(k) ? '<i></i>' : '<i class="no"></i>'}</button>`; }).join('')}</div>`;
    $('#ag-prev').onclick = () => { state.agDay = addDays(d0, -7); renderAgenda(); };
    $('#ag-next').onclick = () => { state.agDay = addDays(d0, 7); renderAgenda(); };
  } else if (mode === 'month') {
    const f = new Date(d0.getFullYear(), d0.getMonth(), 1), s = monday(f);
    nav.innerHTML = `<div class="ag-head"><button class="icon-btn" id="ag-prev" aria-label="Mois précédent">‹</button><b>${esc(f.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }))}</b><button class="icon-btn" id="ag-next" aria-label="Mois suivant">›</button></div>
      <div class="month">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<span class="mh">${x}</span>`).join('')}${[...Array(42)].map((_, i) => { const d = addDays(s, i), k = dayKey(d); return `<button class="md ${d.getMonth() !== f.getMonth() ? 'out' : ''} ${k === dayKey(d0) ? 'on' : ''} ${k === tk ? 'today' : ''}" data-d="${k}">${d.getDate()}${byDay.has(k) ? '<i></i>' : ''}</button>`; }).join('')}</div>`;
    $('#ag-prev').onclick = () => { state.agDay = new Date(d0.getFullYear(), d0.getMonth() - 1, 1); renderAgenda(); };
    $('#ag-next').onclick = () => { state.agDay = new Date(d0.getFullYear(), d0.getMonth() + 1, 1); renderAgenda(); };
  } else nav.innerHTML = '';
  $$('[data-d]', nav).forEach(b => b.onclick = () => { state.agDay = new Date(b.dataset.d + 'T00:00'); renderAgenda(); });
  // Liste : le jour choisi puis la suite de la semaine (semaine), le jour choisi (mois), 60 jours (liste)
  const days = mode === 'week' ? [...Array(7)].map((_, i) => addDays(monday(d0), i)).filter(d => d >= startOfDay(d0))
    : mode === 'month' ? [startOfDay(d0)]
    : [...Array(60)].map((_, i) => addDays(startOfDay(new Date()), i)).filter(d => byDay.has(dayKey(d)));
  const evRow = it => {
    if (it.kind === 'tt') { const x = it.x; return `<button class="ev" style="--c:${esc(x.color || '#4caf8f')}" data-tt="${esc(x.id)}"><span class="t">${it.allDay ? 'Journée' : hhmm(it.s) + (it.e > it.s ? '<br>' + hhmm(it.e) : '')}</span><span class="ev-b"><b>${esc(x.title)}</b><small><span class="tt-tag">TimeTree</span> ${esc(x.cal)}${x.location ? ' · 📍 ' + esc(x.location) : ''}</small></span></button>`; }
    if (it.kind === 'task') return `<button class="ev" style="--c:#9be3b4" data-task="${esc(it.t.id)}"><span class="t">${hhmm(it.s)}</span><span class="ev-b"><b>${esc(it.t.title)}</b><small>Tâche MailBox${it.t.ref && it.t.ref.from ? ' · mail de ' + esc(it.t.ref.from) : ''}</small></span></button>`;
    const e = it.ev;
    return `<button class="ev" style="--c:${EV_COLORS[e.colorId] || '#8fb6ff'}" data-ev="${esc(e.id)}"><span class="t">${it.allDay ? 'Journée' : hhmm(it.s) + '<br>' + hhmm(it.e)}</span><span class="ev-b"><b>${esc(e.summary || '(sans titre)')}</b>${e.location || e.description ? `<small>${e.location ? '📍 ' + esc(e.location) : ''}${e.location && e.description ? ' · ' : ''}${e.description ? esc(String(e.description).replace(/<[^>]+>/g, ' ').slice(0, 80)) : ''}</small>` : ''}</span></button>`;
  };
  const box = $('#ag-list');
  box.innerHTML = days.map(d => { const its = byDay.get(dayKey(d)) || []; return `<div class="day-h">${esc(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}${dayKey(d) === tk ? ' · aujourd’hui' : ''}</div>` + (its.length ? its.map(evRow).join('') : '<p class="fhint" style="margin:2px 6px 8px">Rien de prévu</p>'); }).join('')
    || '<div class="empty">Rien de prévu sur les 60 prochains jours.</div>';
  $$('[data-ev]', box).forEach(b => b.onclick = () => { const e = evs.find(x => x.id === b.dataset.ev); if (e) eventSheet(e, () => { state.agCache = null; renderAgenda(); }); });
  $$('[data-task]', box).forEach(b => b.onclick = () => { location.hash = '#/tasks'; });
  $$('[data-tt]', box).forEach(b => b.onclick = () => {
    const it = items.find(i => i.kind === 'tt' && i.x.id === b.dataset.tt); if (!it) return; const x = it.x;
    openSheet(`<span class="grip"></span><h2>${esc(x.title)}</h2><p class="fhint" style="margin:0"><span class="tt-tag">TimeTree</span> ${esc(x.cal)}</p>
      <div class="ct-info"><div>📅 ${esc(it.s.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}${it.allDay ? ' · journée entière' : ' · ' + hhmm(it.s) + (it.e > it.s ? ' – ' + hhmm(it.e) : '')}</div>${x.location ? `<div>📍 ${esc(x.location)}</div>` : ''}${x.note ? `<div>📝 ${esc(x.note)}</div>` : ''}</div>
      <p class="fhint" style="margin:0">Pour le modifier, passe par l’app TimeTree.</p>
      <button class="btn" id="tt-copy">Copier dans Google Agenda</button>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn danger" id="tt-del">🗑 Supprimer</button><button class="btn" data-close>Fermer</button></div>`);
    $('#tt-del').onclick = async () => {
      if (!confirm('Supprimer « ' + x.title + ' » de TimeTree (' + x.cal + ') ?' + (x.recurring ? '\n\nC’est un événement qui se répète : TOUTES les occurrences seront supprimées.' : '') + '\n\nIl disparaîtra aussi pour les autres membres du calendrier.')) return;
      const db = $('#tt-del'); db.disabled = true; db.textContent = 'Suppression…';
      try { await rapi('/timetree/delete', { method: 'POST', body: { cal: x.calId, uuid: x.uuid } }); closeSheet(); toast('Supprimé de TimeTree'); state.agCache = null; renderAgenda(); }
      catch (e) { db.disabled = false; db.textContent = '🗑 Supprimer'; toast(e.message); }
    };
    $('#tt-copy').onclick = () => { closeSheet(); eventSheet({ title: x.title, start: it.s, end: it.allDay ? null : it.e, allDay: it.allDay, location: x.location, note: (x.note ? x.note + ' · ' : '') + 'Depuis TimeTree (' + x.cal + ')' }, () => { state.agCache = null; renderAgenda(); }); };
  });
  if (gErr) box.insertAdjacentHTML('afterbegin', googleHelp(gErr, 'Agenda')), bindHelp();
  if (ttInfo && ttInfo.error) box.insertAdjacentHTML('afterbegin', `<p class="fhint">TimeTree : ${esc(ttInfo.error)}${ttInfo.at ? ' · données du ' + esc(new Date(ttInfo.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : ''}</p>`);
  bindAgendaSwipe(box, evs, items);
  agendaSuggestions();
}
/* Glisser un événement vers la gauche : bouton Supprimer (Google Agenda ou TimeTree) */
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
const defaultStart = d => { const x = new Date(d); const n = new Date(); if (dayKey(x) === dayKey(n)) { x.setHours(n.getHours() + 1, 0, 0, 0); } else x.setHours(9, 0, 0, 0); return x; };
const toInputDate = d => dayKey(d), toInputTime = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
// ev : événement Google existant, ou brouillon { title, start (Date), end, allDay, location, note }
function eventSheet(ev, onDone) {
  const isNew = !ev.id;
  let s, e, allDay;
  if (isNew) { s = ev.start || defaultStart(new Date()); e = ev.end || new Date(s.getTime() + 3600000); allDay = !!ev.allDay; }
  else { const t = evTimes(ev); s = t.s; e = t.allDay ? addDays(t.e, -1) : t.e; allDay = t.allDay; }
  openSheet(`<span class="grip"></span><h2>${isNew ? 'Nouvel événement' : 'Événement'}</h2>
    <label class="f">Titre<input id="ev-title" autocomplete="off" value="${esc(isNew ? ev.title || '' : ev.summary || '')}" placeholder="ex. Point avec Claire"></label>
    <label class="switch">Journée entière<input type="checkbox" id="ev-all" ${allDay ? 'checked' : ''}></label>
    <div class="ev-grid"><label class="f">Date<input type="date" id="ev-d" value="${toInputDate(s)}"></label><label class="f ev-tm">Début<input type="time" id="ev-s" value="${toInputTime(s)}"></label><label class="f ev-tm">Fin<input type="time" id="ev-e" value="${toInputTime(e)}"></label></div>
    <label class="f">Lieu<input id="ev-loc" autocomplete="off" value="${esc(isNew ? ev.location || '' : ev.location || '')}" placeholder="Adresse ou visio"></label>
    <label class="f">Note<input id="ev-note" autocomplete="off" value="${esc(isNew ? ev.note || '' : String(ev.description || '').replace(/<[^>]+>/g, ' '))}"></label>
    ${isNew && state.ttCals && state.ttCals.length ? `<label class="f">Enregistrer dans<select id="ev-dest"><option value="g">Google Agenda</option>${state.ttCals.map(c => `<option value="t:${esc(c.id)}">TimeTree · ${esc(c.name)}</option><option value="b:${esc(c.id)}">Google + TimeTree · ${esc(c.name)}</option>`).join('')}</select></label>` : ''}
    ${ev.mailUrl ? `<p class="fhint" style="margin:0">Lié au mail « ${esc(ev.mailSubject || '')} »</p>` : ''}
    <div style="display:grid;grid-template-columns:${isNew ? '1fr 1fr' : '1fr 1fr 1fr'};gap:10px">${isNew ? '<button class="btn" data-close>Annuler</button>' : '<button class="btn danger" id="ev-del">Supprimer</button><button class="btn" data-close>Fermer</button>'}<button class="btn primary" id="ev-ok">Enregistrer</button></div>`);
  const syncAll = () => $$('.ev-tm').forEach(x => { x.style.display = $('#ev-all').checked ? 'none' : ''; });
  $('#ev-all').onchange = syncAll; syncAll();
  $('#ev-s').onchange = () => { const [h, m] = $('#ev-s').value.split(':').map(Number); const dur = e - s; const ns = new Date(s); ns.setHours(h, m); const ne = new Date(ns.getTime() + (dur > 0 ? dur : 3600000)); $('#ev-e').value = toInputTime(ne); };
  $('#ev-ok').onclick = async () => {
    const title = $('#ev-title').value.trim(); if (!title) { toast('Donne un titre'); return; }
    const d = $('#ev-d').value, all = $('#ev-all').checked;
    let start, end;
    if (all) { start = { date: d }; end = { date: dayKey(addDays(new Date(d + 'T00:00'), 1)) }; }
    else {
      const sd = new Date(d + 'T' + ($('#ev-s').value || '09:00')); let ed = new Date(d + 'T' + ($('#ev-e').value || $('#ev-s').value || '10:00'));
      if (ed <= sd) ed = new Date(sd.getTime() + 3600000);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      start = { dateTime: sd.toISOString(), timeZone: tz }; end = { dateTime: ed.toISOString(), timeZone: tz };
    }
    let note = $('#ev-note').value.trim();
    if (ev.mailUrl) note = (note ? note + '\n' : '') + 'Mail : ' + location.origin + location.pathname + ev.mailUrl;
    const body = { summary: title, location: $('#ev-loc').value.trim(), description: note, start, end };
    const b = $('#ev-ok'); b.disabled = true; b.textContent = 'Enregistrement…';
    const dest = ($('#ev-dest') || {}).value || 'g', ttCal = dest.includes(':') ? dest.split(':')[1] : null;
    try {
      if (ttCal) {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const r = await rapi('/timetree/event', { method: 'POST', body: all ? { cal: ttCal, title, allDay: true, date: d, endDate: d, location: body.location, note } : { cal: ttCal, title, allDay: false, start: Date.parse(start.dateTime), end: Date.parse(end.dateTime), tz, location: body.location, note } });
        if (dest.startsWith('t:')) { state.agCache = null; closeSheet(); toast('Ajouté dans TimeTree · ' + r.cal); if (onDone) onDone(); return; }
      }
      if (isNew) await gx('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST', body });
      else await gx('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(ev.id), { method: 'PATCH', body });
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

/* ---------- Pertinence : lire dans le corps des mails ----------
   Gmail trouve les mails qui contiennent les mots, mais les trie par date et son extrait (snippet) ne montre que le début.
   Ici on lit le texte des meilleurs candidats, on repère le passage où les mots apparaissent ensemble et on note chaque mail. */
const STOPW = new Set(['le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'ou', 'a', 'à', 'au', 'aux', 'en', 'pour', 'par', 'sur', 'mon', 'ma', 'mes', 'avec', 'dans', 'que', 'qui', 'd', 'l']);
const searchWords = q => [...new Set(nrm(String(q).replace(/\b(from|to|subject|in|is|has|label|category|after|before|newer_than|older_than|larger|filename):\S*/gi, ' ').replace(/[()"]/g, ' ').replace(/\bOR\b/g, ' ')).split(/[^a-z0-9@.\-]+/).filter(w => w.length > 1 && !STOPW.has(w)))];
const bodyCache = new Map();
async function threadText(id) {
  if (bodyCache.has(id)) return bodyCache.get(id);
  const t = await api('threads/' + id + '?format=full').catch(() => null);
  const txt = t ? (t.messages || []).map(m => hdr(m, 'Subject') + '\n' + plainOf(m).split('\n').filter(l => !/^\s*>/.test(l)).join('\n')).join('\n\n').replace(/\s+/g, ' ').slice(0, 20000) : '';
  bodyCache.set(id, txt); if (bodyCache.size > 400) bodyCache.delete(bodyCache.keys().next().value);
  return txt;
}
// Meilleur passage : la fenêtre de ~160 caractères qui contient le plus de mots différents
function bestPassage(text, words) {
  const low = nrm(text); if (!words.length || !low) return { hits: 0, near: false, excerpt: '' };
  const pos = []; words.forEach((w, wi) => { let i = -1; let n = 0; while ((i = low.indexOf(w, i + 1)) !== -1 && n < 60) { if (!i || !/[a-z0-9]/.test(low[i - 1])) { pos.push([i, wi]); n++; } } });
  if (!pos.length) return { hits: 0, near: false, excerpt: '' };
  pos.sort((a, b) => a[0] - b[0]);
  let best = { k: 0, at: pos[0][0] };
  for (let i = 0; i < pos.length; i++) { const seen = new Set(); for (let j = i; j < pos.length && pos[j][0] - pos[i][0] < 70; j++) seen.add(pos[j][1]); if (seen.size > best.k) best = { k: seen.size, at: pos[i][0] }; }
  const all = new Set(pos.map(p => p[1])).size;
  const s = Math.max(0, best.at - 25), e = Math.min(text.length, best.at + 190);
  return { hits: all, near: best.k, excerpt: (s ? '…' : '') + text.slice(s, e).trim() + (e < text.length ? '…' : '') };
}
const PROMO_RE = /no-?reply|newsletter|news@|marketing|promo|offre|mailing|info@|bonjour@|hello@|e\.?mail\./i;
function relScore(it, words, passage) {
  const subj = nrm(it.subject); let sc = 0;
  words.forEach(w => { if (subj.includes(w)) sc += 3; });
  sc += passage.hits * 1.5 + (passage.near >= Math.min(2, words.length) ? 4 : 0) + (passage.near === words.length && words.length > 1 ? 4 : 0);
  if (words.length > 1 && nrm(passage.excerpt + ' ' + it.subject).includes(words.join(' '))) sc += 3;
  if (it.mine || it.count > 1) sc += 2;
  // pubs et newsletters : fortement déclassées (elles parlent de tout, mais ne sont presque jamais le mail cherché)
  if (it.promo || PROMO_RE.test(it.fromEmail || '')) sc = Math.min(sc * 0.3, 4);
  return sc;
}
async function enrich(items, words, max) {
  const top = items.slice(0, max);
  await pool(top, 5, async it => {
    const text = it.acc === 'free' ? (it.subject + ' ' + (it.body || it.snippet)) : await threadText(it.id);
    const p = bestPassage(text, words);
    it.passage = p; it.rel = relScore(it, words, p);
  });
  return top;
}
// « Les plus pertinents » en tête d'une recherche par mots : mails personnels (hors pubs) lus en entier, triés par pertinence
async function bestMatches(q) {
  const box = $('#best'); if (!box) return;
  const words = searchWords(q); if (!words.length || /\b(from|to|larger|filename):/i.test(q)) return;
  box.innerHTML = '<div class="ai-note"><span>Lecture des mails pour trouver les plus pertinents…</span></div>';
  const base = words.join(' ');
  const cand = new Map();
  const grab = async (gq, n) => {
    const r = (await api('threads?' + new URLSearchParams({ q: gq, maxResults: n })).catch(() => null)) || {};
    const ts = await pool(r.threads || [], 6, t => threadMeta(t).catch(() => null));
    ts.filter(Boolean).forEach(t => { if (!cand.has(t.id)) cand.set(t.id, Object.assign(summarize(t), { acc: 'gmail' })); });
  };
  const jobs = [];
  if (settings.clientId || relayGmailOn()) jobs.push(grab(base + ' -category:promotions -category:social -category:forums', 30), grab('in:sent ' + base, 20), grab('subject:(' + base + ') -category:promotions -category:social', 10));
  if (freeOn()) jobs.push(rapi('/free/search?' + new URLSearchParams({ q: base, limit: '20' })).then(r => (r.items || []).forEach(x => { const it = freeItem(x); it.body = x.text || ''; cand.set(it.id, it); })).catch(() => {}));
  await Promise.all(jobs);
  if (!$('#best')) return;
  const all = await enrich([...cand.values()].sort((a, b) => b.date - a.date), words, 55);
  let best = all.filter(x => x.rel >= 6 && x.passage.hits >= Math.min(2, words.length)).sort((a, b) => b.rel - a.rel || b.date - a.date);
  if (best.length) best = best.filter(x => x.rel >= best[0].rel * 0.6).slice(0, 6);
  if (!$('#best')) return;
  if (!best.length) { box.innerHTML = ''; return; }
  state.showAcc = freeOn(); state.dayMode = false;
  box.innerHTML = `<h2 class="sec">Les plus pertinents · ${best.length}</h2>` + best.map(i => itemHTML(Object.assign({}, i, { snippet: '« ' + i.passage.excerpt + ' »' }), '')).join('') + '<h2 class="sec">Tous les résultats, du plus récent au plus ancien</h2>';
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
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // Le relais a signalé un nouveau mail ou un changement de non lus pendant que l'app est ouverte
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'mail') { refreshVisibleList(); setTimeout(() => updateBadge(true), 1500); } });
}
// Filet de sécurité : vérification chaque minute quand l'app est au premier plan
setInterval(() => { if (document.visibilityState === 'visible' && relayOn() && (relayGmailOn() || freeOn())) updateBadge(); }, 60000);
