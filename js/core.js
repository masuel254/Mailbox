/* MailBox : client Gmail + Free (PWA). Aucun identifiant n'est stocké dans ce code.
   Le code est découpé par domaine ; les fichiers sont chargés dans l'ordre de index.html et partagent la même portée. */
'use strict';

const APP_VERSION = '4.17.2';
const APP_DATE = '24/11/2026';

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
/* Cache local plus grand (IndexedDB, sur l'iPhone) : listes, conversations, agenda, contacts ; lisible hors connexion */
const IDB = (() => {
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => { try { const r = indexedDB.open('mailbox', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }));
  const tx = (mode, fn) => db().then(d => new Promise((res, rej) => { const t = d.transaction('kv', mode); const q = fn(t.objectStore('kv')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }));
  return { get: k => tx('readonly', s => s.get(k)).catch(() => undefined), set: (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => {}), del: k => tx('readwrite', s => s.delete(k)).catch(() => {}) };
})();
// Conversations (120 dernières) et pièces jointes légères (80) gardées : relisibles sans réseau
function idbKeep(key, v, group) {
  IDB.set(key, { at: Date.now(), v });
  const lk = group === 'att' ? 'idbAtt' : 'idbKeys', max = group === 'att' ? 80 : 120;
  const ks = LS.get(lk, []).filter(k => k !== key); ks.push(key);
  while (ks.length > max) IDB.del(ks.shift());
  LS.set(lk, ks);
}
async function cachedFetch(key, fetcher, group) {
  try { const v = await fetcher(); if (v) idbKeep(key, v, group); return v; }
  catch (e) { if (e.message === 'auth' && navigator.onLine) throw e; const c = await IDB.get(key); if (c && c.v) { toast('Hors connexion : version enregistrée sur l’iPhone'); return c.v; } throw e; }
}
// Expéditeurs automatiques (notifications, newsletters) : affichés en retrait, jamais dans « À traiter »
const NOREPLY_RE = /no-?reply|ne-?pas-?repondre|notification|newsletter|mailer-daemon|bounce|news@|info@|marketing|promo/i;
const FS_CTL = '<span class="fs-ctl"><button type="button" data-fs="-1" aria-label="Texte plus petit">A−</button><button type="button" data-fs="1" aria-label="Texte plus grand">A+</button></span>';
// Ouverture instantanée : version gardée sur l'iPhone affichée tout de suite, relue en arrière-plan ;
// l'écran n'est redessiné que si la conversation a vraiment changé (nouveau message)
async function fastFetch(key, fetcher, changed) {
  const c = await IDB.get(key);
  if (c && c.v && navigator.onLine) {
    const h0 = location.hash;
    fetcher().then(v => { if (!v) return; idbKeep(key, v); if (changed(c.v, v) && location.hash === h0) route(); }).catch(() => {});
    return c.v;
  }
  return cachedFetch(key, fetcher);
}
// Version minimale du relais attendue par cette appli (à relever quand le relais change)
const MIN_RELAY = '4.17.1';
const verLt = (a, b) => { const x = String(a || '0').split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
  if (action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label; b.onclick = () => { t.classList.remove('show'); document.body.classList.remove('toast-act'); clearTimeout(toastTimer); action.run(); }; t.appendChild(b); }
  // Bandeau avec bouton (Annuler…) : la page gagne de la place en bas pour que rien ne reste caché dessous
  t.classList.add('show'); document.body.classList.toggle('toast-act', !!action); clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.classList.remove('show'); document.body.classList.remove('toast-act'); }, action ? 6000 : 2600);
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
      else { if (navigator.onLine) toast(e.message); throw new Error('auth'); }
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
const freeFolderOf = key => FREE_FOLDERS[key] || (String(key).startsWith('F:') ? decodeURIComponent(key.slice(2)) : null) || (isBlockLabel(key) ? 'BLOCKED' : null) || (isMenageLabel(key) ? 'MENAGE' : null);
const isMenageLabel = key => { try { return (labelById(key) || {}).name === 'Ménage IA'; } catch (e) { return false; } };
const curAcc = () => freeOn() ? (settings.acc || 'all') : 'gmail';
function parseFreeId(id) { const p = id.split(':'); return { uid: +p[1], folder: p.slice(2).join(':') }; }
function freeItem(x) {
  return { id: 'f:' + x.uid + ':' + x.folder, acc: 'free', folder: x.folder, uid: x.uid, subject: fixMojibake(x.subject), from: x.from.name || x.from.email, fromEmail: (x.from.email || '').toLowerCase(), fromName: x.from.name || '', to: x.to || '', sentByMe: false, snippet: cleanSnippet(x.snippet), date: x.date, count: 1, size: x.size || 0, att: !!x.att, mine: !!x.mine, toEmail: (x.toEmail || '').toLowerCase(), unread: !x.seen, starred: !!x.flagged, labels: [] };
}
/* Travail de fond (lecture des mails pour la pertinence) : arrêté dès qu'on change d'écran,
   et jamais de nouvel essai si Gmail freine, pour laisser le quota aux actions de l'utilisateur */
let bgGen = 0;
const bgAlive = g => g === bgGen;
async function bgApi(path, g) {
  if (!bgAlive(g)) throw new Error('bg-stop');
  try { return await api(path, {}, 3); }
  catch (e) { if (/ralentir|quota|rate/i.test(e.message)) bgGen++; throw e; }
}
function route() {
  auth.handleRedirect();
  const h = location.hash || (settings.home === 'today' ? '#/today' : '#/list/INBOX');
  const rt = document.querySelector('#tabbar a[data-tab="INBOX"]'); if (rt) rt.setAttribute('href', settings.home === 'today' ? '#/today' : '#/list/INBOX');
  if (h !== state.curHash) bgGen++;
  const parts = h.slice(2).split('?')[0].split('/');
  const view = parts[0];
  state.prevHash = state.curHash; state.curHash = h;
  if (['list', 'search', 'smart', 'waiting', 'tasks', 'today'].includes(view)) { state.lastList = h; try { sessionStorage.setItem('mb-last', h); } catch (e) {} }
  closeSheet();
  exitSelect(true);
  document.body.classList.toggle('no-tabbar', view === 'thread' || view === 'compose' || view === 'free');
  const lk = parts[1] === 'UNREAD' ? 'INBOX' : (parts[1] || 'INBOX');
  $$('#tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === (view === 'list' ? (lk === 'INBOX' ? 'INBOX' : lk === 'SENT' ? 'SENT' : 'labels') : ['waiting', 'tasks', 'scheduled', 'outbox', 'blocked', 'menage'].includes(view) ? 'labels' : view === 'today' ? 'INBOX' : view === 'bdays' ? 'agenda' : ['guide', 'settings'].includes(view) ? 'INBOX' : view)));
  $('#view').scrollTop = 0;
  if (!settings.clientId && !relayGmailOn() && view !== 'settings') return renderWelcome();
  if (view === 'thread') return renderThread(decodeURIComponent(parts[1]));
  if (view === 'free') return renderFree(decodeURIComponent(parts[1]), +parts[2]);
  if (view === 'compose') return renderCompose(new URLSearchParams(h.split('?')[1] || ''));
  if (view === 'labels') return renderLabels();
  if (view === 'waiting') return renderWaiting();
  if (view === 'guide') return renderGuide();
  if (view === 'tasks') return renderTasks();
  if (view === 'scheduled') return renderScheduled();
  if (view === 'outbox') return renderOutbox();
  if (view === 'menage') return renderMenage();
  if (view === 'blocked') { $('#view').innerHTML = `<div class="top"><a class="back" href="#/labels">${ICON.back}Dossiers</a></div><h1 class="thread-title">Expéditeurs bloqués</h1><p class="fhint">Leurs mails vont directement dans Indésirables. « Débloquer » les laisse de nouveau arriver dans la réception.</p><section class="card" id="s-blocked"><p>Chargement…</p></section>${freeOn() ? '<h2 class="sec-h" style="margin:22px 4px 6px">Toujours acceptés (Free)</h2><p class="fhint">L’antispam de Free classe parfois à tort des mails en indésirables. Ceux de ces expéditeurs sont remis dans ta réception automatiquement.</p><section class="card" id="s-allow"><p>Chargement…</p></section>' : ''}`; if (freeOn()) renderAllow($('#s-allow')); return renderBlocked($('#s-blocked')); }
  if (view === 'today') return renderToday();
  if (view === 'contacts') return renderContacts();
  if (view === 'agenda') return renderAgenda();
  if (view === 'bdays') return renderBdays();
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
