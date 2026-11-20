/* MailBox relais : Gmail permanent, notifications push, boîte Free.
   Aucun secret dans ce fichier : tout vient des variables d'environnement (.env sur le VPS). */
'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const { simpleParser } = require('mailparser');
const webpush = require('web-push');

const C = {
  port: +(process.env.PORT || 8787),
  token: process.env.RELAY_TOKEN || '',
  appUrl: process.env.APP_URL || 'https://masuel254.github.io/Mailbox/',
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
  gClientId: process.env.GOOGLE_CLIENT_ID || '',
  gClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  encKey: Buffer.from(process.env.ENC_KEY || '', 'hex'),
  vapidPub: process.env.VAPID_PUBLIC || '',
  vapidPriv: process.env.VAPID_PRIVATE || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  dataDir: process.env.DATA_DIR || '/data',
  pollMs: +(process.env.POLL_SECONDS || 60) * 1000,
  aiUrl: process.env.AI_URL || 'https://api.groq.com/openai/v1/chat/completions',
  aiModel: process.env.AI_MODEL || 'openai/gpt-oss-20b',
  imap: { host: process.env.FREE_IMAP_HOST || 'imap.free.fr', port: +(process.env.FREE_IMAP_PORT || 993), secure: process.env.FREE_IMAP_SECURE !== 'false' },
  smtp: { host: process.env.FREE_SMTP_HOST || 'smtp.free.fr', port: +(process.env.FREE_SMTP_PORT || 465), secure: process.env.FREE_SMTP_SECURE !== 'false', tls: { rejectUnauthorized: process.env.FREE_TLS_STRICT !== 'false' } }
};
const SCOPE = 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.settings.basic';
const BLOCK_LABEL = 'Indésirables';
const appOrigin = new URL(C.appUrl).origin;
const log = (...a) => console.log(new Date().toISOString(), ...a);

for (const k of ['token', 'publicUrl', 'gClientId', 'gClientSecret', 'vapidPub', 'vapidPriv']) if (!C[k]) { console.error('Variable manquante : ' + k); process.exit(1); }
if (C.encKey.length !== 32) { console.error('ENC_KEY doit faire 64 caractères hexadécimaux'); process.exit(1); }
webpush.setVapidDetails(C.vapidSubject, C.vapidPub, C.vapidPriv);

/* ---------- État persistant (chiffré pour les secrets) ---------- */
const STATE_FILE = path.join(C.dataDir, 'state.json');
let S = { gmail: null, free: null, subs: [], seen: { gmail: [], freeUid: 0 }, badge: { gmail: 0, free: 0 }, names: {}, prefs: { silent: true, quiet: true, quietStart: 22, quietEnd: 7, tz: 'Europe/Paris' }, pending: [] };
try { S = Object.assign(S, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); } catch (e) {}
function save() { fs.mkdirSync(C.dataDir, { recursive: true }); fs.writeFileSync(STATE_FILE + '.tmp', JSON.stringify(S)); fs.renameSync(STATE_FILE + '.tmp', STATE_FILE); }
function enc(txt) { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', C.encKey, iv); const d = Buffer.concat([c.update(txt, 'utf8'), c.final()]); return [iv, c.getAuthTag(), d].map(b => b.toString('base64')).join('.'); }
function dec(s) { const [iv, tag, d] = s.split('.').map(x => Buffer.from(x, 'base64')); const c = crypto.createDecipheriv('aes-256-gcm', C.encKey, iv); c.setAuthTag(tag); return Buffer.concat([c.update(d), c.final()]).toString('utf8'); }

/* ---------- HTTP ---------- */
function cors(req, res) {
  if (req.headers.origin === appOrigin) {
    res.setHeader('Access-Control-Allow-Origin', appOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}
function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
function redirect(res, url) { res.writeHead(302, { Location: url, 'Cache-Control': 'no-store' }); res.end(); }
function authed(req, q) {
  const h = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || (q && q.get('t')) || '';
  const a = Buffer.from(h), b = Buffer.from(C.token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function body(req) {
  return new Promise((ok, ko) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > 30 * 1024 * 1024) { ko(new Error('trop gros')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { ko(new Error('JSON invalide')); } });
    req.on('error', ko);
  });
}

/* ---------- Gmail ---------- */
let gTok = null;
const oauthStates = new Map();
async function gmailToken() {
  if (!S.gmail) throw Object.assign(new Error('Gmail non relié au relais'), { code: 409 });
  if (gTok && gTok.exp > Date.now() + 60000) return gTok;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: C.gClientId, client_secret: C.gClientSecret, refresh_token: dec(S.gmail.refresh), grant_type: 'refresh_token' }) });
  const j = await r.json();
  if (!r.ok) { if (j.error === 'invalid_grant') { S.gmail = null; save(); } throw Object.assign(new Error('Google : ' + (j.error_description || j.error)), { code: 401 }); }
  gTok = { access_token: j.access_token, exp: Date.now() + j.expires_in * 1000, scope: j.scope || SCOPE };
  return gTok;
}
async function gapi(p, opt = {}) {
  const t = await gmailToken();
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + p, { method: opt.method || 'GET', headers: Object.assign({ Authorization: 'Bearer ' + t.access_token }, opt.body ? { 'Content-Type': 'application/json' } : {}), body: opt.body ? JSON.stringify(opt.body) : undefined });
  if (!r.ok) throw new Error('Gmail ' + r.status);
  return r.status === 204 ? null : r.json().catch(() => null);
}

/* ---------- Transfert d'un dossier Free vers Gmail ---------- */
async function gImport(raw) {
  const t = await gmailToken();
  const r = await fetch('https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/import?uploadType=media&internalDateSource=dateHeader&neverMarkSpam=true', { method: 'POST', headers: { Authorization: 'Bearer ' + t.access_token, 'Content-Type': 'message/rfc822' }, body: raw, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error('Gmail ' + r.status);
  return r.json();
}
async function gEnsureLabel(name) {
  const all = ((await gapi('labels')) || {}).labels || [];
  const find = n => all.find(l => l.name.toLowerCase() === n.toLowerCase());
  const parts = name.split('/');
  let id = null;
  for (let i = 1; i <= parts.length; i++) {
    const n = parts.slice(0, i).join('/');
    let l = find(n);
    if (!l) { try { l = await gapi('labels', { method: 'POST', body: { name: n, labelListVisibility: 'labelShow', messageListVisibility: 'show' } }); all.push(l); } catch (e) { if (i === parts.length) throw e; } }
    if (i === parts.length) id = l.id;
  }
  return id;
}
async function runTransfer(job) {
  const client = new ImapFlow(Object.assign({}, C.imap, { auth: { user: S.free.user, pass: dec(S.free.pass) }, logger: false }));
  try {
    await client.connect();
    const list = await client.list();
    const norm = p => String(p || '').normalize('NFC').toLowerCase().replace(/[./]/g, '/');
    const root = list.find(m => m.path === job.path) || list.find(m => norm(m.path) === norm(job.path)) || list.find(m => norm(m.name) === norm(job.path.split(/[./]/).pop()));
    if (!root) { log('transfert : dossiers Free disponibles', list.map(m => m.path).join(' | ')); throw new Error('Dossier Free introuvable : ' + job.path); }
    job.path = root.path;
    const d = root.delimiter || '/';
    const dirs = list.filter(m => m.path === job.path || m.path.startsWith(job.path + d)).sort((a, b) => a.path.length - b.path.length);
    const trash = (await folders(client)).trash;
    for (const dir of dirs) {
      const st = await client.status(dir.path, { messages: true }).catch(() => ({ messages: 0 }));
      job.total += st.messages || 0;
    }
    save();
    for (const dir of dirs) {
      const labelName = job.label + dir.path.slice(job.path.length).split(d).join('/');
      const labelId = await gEnsureLabel(labelName);
      const lock = await client.getMailboxLock(dir.path);
      try {
        const uids = ((await client.search({ all: true }, { uid: true })) || []).filter(u => !(job.doneUids[dir.path] || []).includes(u));
        for (let i = 0; i < uids.length; i += 10) {
          const part = uids.slice(i, i + 10), moved = [];
          for await (const m of client.fetch(part, { source: true, flags: true }, { uid: true })) {
            try {
              const r = await gImport(m.source);
              await gapi('messages/' + r.id + '/modify', { method: 'POST', body: { addLabelIds: [labelId].concat(m.flags.has('\\Seen') ? [] : ['UNREAD']), removeLabelIds: ['INBOX'] } });
              job.done++; moved.push(m.uid);
            } catch (e) { job.failed++; log('transfert', dir.path, m.uid, e.message); }
          }
          (job.doneUids[dir.path] = job.doneUids[dir.path] || []).push(...moved);
          if (job.deleteSource && moved.length && trash) await client.messageMove(moved, trash, { uid: true }).catch(e => log('transfert corbeille', e.message));
          save();
        }
      } finally { lock.release(); }
    }
    if (job.deleteSource && !job.failed) {
      for (const dir of dirs.slice().reverse()) {
        const st = await client.status(dir.path, { messages: true }).catch(() => ({ messages: 1 }));
        if (!st.messages) await client.mailboxDelete(dir.path).catch(() => {});
      }
    }
    job.state = 'done';
  } catch (e) { job.state = 'error'; job.error = e.message; log('transfert', e.message); }
  finally { job.endedAt = Date.now(); save(); await client.logout().catch(() => {}); }
}

/* ---------- Free (IMAP / SMTP) ---------- */
let imapQueue = Promise.resolve();
function withImap(fn) {
  const run = async () => {
    if (!S.free) throw Object.assign(new Error('Compte Free non configuré'), { code: 409 });
    const client = new ImapFlow(Object.assign({}, C.imap, { auth: { user: S.free.user, pass: dec(S.free.pass) }, logger: false }));
    await client.connect();
    try { return await fn(client); } finally { await client.logout().catch(() => {}); }
  };
  const p = imapQueue.then(run, run);
  imapQueue = p.catch(() => {});
  return p;
}
async function folders(client) {
  const list = await client.list();
  const find = (use, re) => (list.find(m => m.specialUse === use) || list.find(m => re.test(m.path)) || list.find(m => re.test(m.name)) || {}).path;
  return {
    all: list.map(m => ({ path: m.path, name: m.name, special: m.specialUse || '' })),
    sent: find('\\Sent', /^(sent|envoy|éléments envoyés|sent messages|sent items)/i) || 'Sent',
    trash: find('\\Trash', /^(trash|corbeille|deleted)/i) || 'Trash',
    junk: find('\\Junk', /^(junk|spam|courrier ind)/i) || 'Junk',
    drafts: find('\\Drafts', /^(drafts|brouillons)/i) || 'Drafts',
    archive: find('\\Archive', /^(archive|archives)$/i) || null
  };
}
async function ensureFolder(client, name) { try { await client.mailboxCreate(name); } catch (e) { /* existe déjà */ } return name; }
async function resolveFolder(client, key) {
  const f = await folders(client);
  if (key === 'INBOX') return 'INBOX';
  if (key === 'SENT') return f.sent;
  if (key === 'TRASH') return f.trash;
  if (key === 'JUNK') return f.junk;
  if (key === 'ARCHIVE') return f.archive || ensureFolder(client, 'Archives');
  if (key === 'BLOCKED') return ensureFolder(client, BLOCK_LABEL);
  if (f.all.find(m => m.path === key)) return key;
  throw Object.assign(new Error('Dossier inconnu'), { code: 400 });
}
const snip = t => (t || '').replace(/(^|\s)[^\s{}][^{}]{0,300}\{[^{}]*\}/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
function headerText(src, name) {
  const head = src.toString('utf8', 0, Math.min(src.length, 65536)).split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, ' ');
  const m = head.match(new RegExp('^' + name + ':[ \\t]*(.*)$', 'im'));
  return m ? m[1].trim() : '';
}
const addr = a => (a && a[0]) ? { name: a[0].name || a[0].address || '', email: (a[0].address || '').toLowerCase() } : { name: '', email: '' };
const addrList = a => (a || []).map(x => (x.name ? `"${x.name.replace(/"/g, '')}" <${x.address}>` : x.address)).join(', ');
async function freeList(folderKey, unread, before, limit) {
  return withImap(async client => {
    const folder = await resolveFolder(client, folderKey);
    const lock = await client.getMailboxLock(folder);
    try {
      let uids = await client.search(unread ? { seen: false } : { all: true }, { uid: true }) || [];
      uids.sort((a, b) => b - a);
      if (before) uids = uids.filter(u => u < before);
      const total = uids.length;
      uids = uids.slice(0, limit);
      const items = [];
      if (uids.length) {
        for await (const m of client.fetch(uids, { envelope: true, flags: true, internalDate: true, source: { start: 0, maxLength: 6000 } }, { uid: true })) {
          let snippet = '';
          try { const p = await simpleParser(m.source); snippet = snip(p.text); } catch (e) {}
          items.push({ uid: m.uid, folder, subject: m.envelope.subject || '(sans objet)', from: addr(m.envelope.from), to: (m.envelope.to || []).map(x => x.name || x.address).join(', '), date: +new Date(m.internalDate || m.envelope.date), seen: m.flags.has('\\Seen'), flagged: m.flags.has('\\Flagged'), snippet });
        }
      }
      items.sort((a, b) => b.date - a.date);
      return { folder, items, more: total > uids.length };
    } finally { lock.release(); }
  });
}
async function freeSearch(q, limit) {
  const crit = {}; const words = []; const alts = []; let anyOf = false;
  for (const tok of (q.match(/\S+:"[^"]*"|\S+:\S+|"[^"]*"|\S+/g) || [])) {
    const m = tok.match(/^(from|de|to|subject|objet|newer_than|after|before|older_than|larger|size):(.+)$/i);
    const v = (m ? m[2] : tok).replace(/^"|"$/g, '').replace(/^\(|\)$/g, '');
    if (!m) { if (tok === 'OR') anyOf = true; else if (!/^(is|in|has|label|category|-)/i.test(tok)) words.push(v.toLowerCase()); continue; }
    const k = m[1].toLowerCase();
    if (k === 'from' || k === 'de' || k === 'to' || k === 'subject' || k === 'objet') { const kk = k === 'de' ? 'from' : k === 'objet' ? 'subject' : k; alts.push({ [kk]: v }); crit[kk] = v; }
    else if (k === 'larger' || k === 'size') { const n = v.match(/^(\d+(?:\.\d+)?)([kKmM]?)$/); if (n) crit.larger = Math.round(+n[1] * ({ k: 1024, m: 1048576 })[n[2].toLowerCase()] || +n[1]); }
    else if (k === 'newer_than') { const n = v.match(/^(\d+)([dmy])$/); if (n) crit.since = new Date(Date.now() - (+n[1]) * ({ d: 1, m: 30, y: 365 })[n[2]] * 86400000); }
    else if (k === 'older_than') { const n = v.match(/^(\d+)([dmy])$/); if (n) crit.before = new Date(Date.now() - (+n[1]) * ({ d: 1, m: 30, y: 365 })[n[2]] * 86400000); }
    else { const d = new Date(v.replace(/\//g, '-')); if (!isNaN(d)) crit[k === 'after' ? 'since' : 'before'] = d; }
  }
  const base = {}; ['since', 'before', 'larger'].forEach(k => { if (crit[k]) base[k] = crit[k]; });
  const queries = anyOf
    ? alts.map(x => Object.assign({}, base, x)).concat(words.map(w => Object.assign({}, base, { text: w })))
    : words.length ? [Object.assign({}, crit, { text: words[0] })] : [crit];
  if (anyOf) words.length = 0;
  if (!queries.length || !Object.keys(queries[0]).length) return { items: [] };
  return withImap(async client => {
    const f = await folders(client);
    const items = [], seen = new Set();
    for (const folder of ['INBOX', f.sent, f.archive, BLOCK_LABEL].filter(Boolean)) {
      let lock; try { lock = await client.getMailboxLock(folder); } catch (e) { continue; }
      try {
        let uids = [];
        for (const qq of queries) uids.push(...((await client.search(qq, { uid: true })) || []));
        uids = [...new Set(uids)].sort((a, b) => b - a).slice(0, limit * 2);
        if (uids.length) for await (const m of client.fetch(uids, { envelope: true, flags: true, internalDate: true, size: true, source: { start: 0, maxLength: 8000 } }, { uid: true })) {
          let snippet = '', text = '';
          try { const p = await simpleParser(m.source); text = p.text || ''; snippet = snip(text); } catch (e) {}
          if (!anyOf && words.length > 1) { const hay = ((m.envelope.subject || '') + ' ' + JSON.stringify(m.envelope.from || []) + ' ' + text).toLowerCase(); if (!words.slice(1).every(w => hay.includes(w))) continue; }
          const key = folder + ':' + m.uid; if (seen.has(key)) continue; seen.add(key);
          items.push({ uid: m.uid, folder, subject: m.envelope.subject || '(sans objet)', from: addr(m.envelope.from), to: (m.envelope.to || []).map(x => x.name || x.address).join(', '), date: +new Date(m.internalDate || m.envelope.date), seen: m.flags.has('\\Seen'), flagged: m.flags.has('\\Flagged'), snippet, size: m.size || 0 });
        }
      } finally { lock.release(); }
    }
    items.sort(crit.larger ? (a, b) => b.size - a.size : (a, b) => b.date - a.date);
    return { items: items.slice(0, limit) };
  });
}
/* Suivi : mails envoyés sans réponse, mails reçus de personnes sans réponse de ma part */
async function freeWaiting() {
  return withImap(async client => {
    const f = await folders(client);
    const now = Date.now(), day = 86400000;
    const sent = [], inbox = [];
    const grab = async (folder, since, arr, withHead) => {
      let lock; try { lock = await client.getMailboxLock(folder); } catch (e) { return; }
      try {
        const uids = ((await client.search({ since: new Date(since) }, { uid: true })) || []).sort((a, b) => b - a).slice(0, 300);
        if (uids.length) for await (const m of client.fetch(uids, Object.assign({ envelope: true, flags: true, internalDate: true }, withHead ? { headers: ['list-unsubscribe', 'precedence', 'auto-submitted'] } : {}), { uid: true })) {
          const h = withHead && m.headers ? m.headers.toString() : '';
          arr.push({ uid: m.uid, folder, env: m.envelope, flags: m.flags, date: +new Date(m.internalDate || m.envelope.date), bulk: /list-unsubscribe|precedence:\s*(bulk|list)|auto-submitted:\s*auto/i.test(h) });
        }
      } finally { lock.release(); }
    };
    await grab(f.sent, now - 30 * day, sent, false);
    await grab('INBOX', now - 45 * day, inbox, true);
    const me = S.free.user.toLowerCase();
    const repliedTo = new Set(inbox.map(m => m.env.inReplyTo).filter(Boolean));
    const answeredIds = new Set(sent.map(m => m.env.inReplyTo).filter(Boolean));
    const item = (m, who) => ({ uid: m.uid, folder: m.folder, subject: m.env.subject || '(sans objet)', from: who, to: (m.env.to || []).map(x => x.name || x.address).join(', '), date: m.date, seen: m.flags.has('\\Seen'), flagged: m.flags.has('\\Flagged'), snippet: '' });
    const theirs = sent.filter(m => m.date < now - 3 * day && m.env.messageId && !repliedTo.has(m.env.messageId) && (m.env.to || []).some(x => (x.address || '').toLowerCase() !== me))
      .map(m => item(m, addr(m.env.to)));
    const mine = inbox.filter(m => m.date > now - 14 * day && !m.bulk && !m.flags.has('\\Answered') && !answeredIds.has(m.env.messageId) && addr(m.env.from).email !== me && !/no-?reply|ne-pas-repondre|notification|newsletter/i.test(addr(m.env.from).email))
      .map(m => item(m, addr(m.env.from)));
    return { theirs: theirs.slice(0, 40), mine: mine.slice(0, 40) };
  });
}
/* Recherche en langage naturel : seule la question part vers l'IA */
async function aiJSON(sys, user, maxTokens) {
  const call = async (model, extra) => {
    const r = await fetch(C.aiUrl, { method: 'POST', headers: { Authorization: 'Bearer ' + dec(S.ai.key), 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000),
      body: JSON.stringify(Object.assign({ model, temperature: 0.1, max_tokens: maxTokens, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }, extra)) });
    if (r.status === 401) throw Object.assign(new Error('Clé Groq refusée'), { code: 502 });
    if (r.status === 429) throw Object.assign(new Error('Groq demande de patienter un instant'), { code: 503 });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { log('IA', model, r.status, JSON.stringify(j).slice(0, 300)); return null; }
    const txt = (((j.choices || [])[0] || {}).message || {}).content || '';
    const mm = txt.match(/\{[\s\S]*\}/);
    try { return JSON.parse(mm ? mm[0] : txt); } catch (e) { log('IA réponse illisible', model, txt.slice(0, 200)); return null; }
  };
  return (await call(C.aiModel, /gpt-oss/.test(C.aiModel) ? { reasoning_effort: 'low', include_reasoning: false } : {})) || (await call('llama-3.3-70b-versatile', {}));
}
async function aiFolders(list, focus) {
  if (!S.ai) throw Object.assign(new Error('IA non configurée'), { code: 400 });
  const names = list.filter(x => x && typeof x.name === 'string').slice(0, 400);
  const sys = 'Tu aides à ranger des dossiers de messagerie personnels. Tu reçois la liste des dossiers (chemin, sous-dossiers séparés par « / », et nombre de mails). ' +
    'Propose un plan pour améliorer la lisibilité. Réponds UNIQUEMENT en JSON : {"actions":[{"type":"move"|"merge","from":"chemin existant","to":"nouveau chemin","why":"raison en 12 mots max"}]}. ' +
    '"move" déplace ou renomme un dossier avec ses sous-dossiers ; "merge" verse tous les mails de "from" dans "to" puis supprime "from". ' +
    'Règles : ne supprime jamais de mails ; ne touche pas au dossier « Indésirables » ; garde les noms choisis par l’utilisateur sauf doublon évident ; ' +
    'sors du niveau « INBOX/ » ou « [Imap]/ » les dossiers personnels rangés dessous par un ancien logiciel ; fusionne les doublons (même nom à la casse près, mêmes thèmes évidents) ; ' +
    'regroupe sous quelques grands thèmes en français (ex. Administratif, Travail, Famille, Voyages, Maison, Achats) seulement si cela réduit nettement le nombre de dossiers au premier niveau ; ' +
    'quand plusieurs sous-dossiers vont ensemble (ex. INBOX/CRYPTO/ATC, INBOX/CRYPTO/Binance), déplace le dossier parent entier (INBOX/CRYPTO → Banque & Assurances/Crypto) : ses sous-dossiers suivent, ne les déplace pas un par un ; ' +
    'n’agis pas sur les dossiers vides (ils sont traités à part) ; ' + (focus === 'themes' ? '80' : '40') + ' actions maximum, les plus utiles d’abord ; "from" doit être recopié exactement depuis la liste.' +
    (focus === 'themes' ? ' PRIORITÉ : remplace le regroupement « INBOX/ » (et « [Imap]/ », « [Gmail]/ » s’ils contiennent des dossiers personnels) par 5 à 8 grands thèmes en français adaptés aux noms rencontrés (par exemple Administratif, Banque & Assurances, Travail, Famille, Voyages, Maison, Santé, Achats). Chaque dossier situé sous INBOX/ doit recevoir une action "move" vers « Thème/NomDuDossier ». Range aussi dans ces thèmes les dossiers de premier niveau qui s’y rattachent clairement (ex. ASSURANCES → Banque & Assurances/Assurances). Ne crée pas de thème pour un seul dossier.' : '');
  const user = names.map(x => x.name + ' (' + (x.n >= 0 ? x.n : '?') + ')').join('\n');
  const out = await aiJSON(sys, user, 6000);
  if (!out || !Array.isArray(out.actions)) throw Object.assign(new Error('Réponse de l’IA illisible, réessaie'), { code: 502 });
  const known = new Set(names.map(x => x.name));
  const acts = out.actions.filter(a => a && (a.type === 'move' || a.type === 'merge') && known.has(a.from) && typeof a.to === 'string' && a.to.trim() && a.to.trim() !== a.from && a.from !== BLOCK_LABEL && !a.to.startsWith(BLOCK_LABEL))
    .slice(0, focus === 'themes' ? 80 : 40).map(a => ({ type: a.type, from: a.from, to: a.to.trim().replace(/\s*\/\s*/g, '/').replace(/^\/|\/$/g, ''), why: String(a.why || '').slice(0, 120) }));
  // si un dossier parent est déplacé, ses sous-dossiers suivent : on retire les actions redondantes
  const moved = acts.map(a => a.from);
  return { actions: acts.filter(a => !moved.some(p => p !== a.from && a.from.startsWith(p + '/'))) };
}
async function aiSearch(question, today) {
  if (!S.ai) throw Object.assign(new Error('IA non configurée'), { code: 400 });
  if (!question) throw Object.assign(new Error('Question vide'), { code: 400 });
  const sys = 'Tu convertis une demande en français en requête de recherche Gmail. Date du jour : ' + (today || new Date().toISOString().slice(0, 10)) + '. ' +
    'Réponds UNIQUEMENT par un objet JSON {"q": "...", "resume": "..."}. ' +
    '"q" utilise la syntaxe Gmail : from:, to:, subject:, mots-clés, OR, newer_than:7d/3m/1y, after:AAAA/MM/JJ, before:AAAA/MM/JJ, has:attachment, is:unread. ' +
    'Pour une demande sur la taille ou la place prise (gros mails, plus lourds, pièces jointes volumineuses), utilise larger:5M (ou larger:10M pour « très gros », larger:2M pour « assez gros ») sans autre mot-clé sauf précision ; l’appli triera alors du plus gros au plus petit. ' +
    'Garde 1 à 4 mots-clés distinctifs, sans mots vides ; pour une marque, utilise from:marque (sans .com) ; n\'invente pas d\'adresse. ' +
    '"resume" décrit la recherche en une courte phrase en français, par exemple « Mails de Devred des 3 derniers mois contenant anniversaire ».';
  const call = async (model, extra) => {
    const r = await fetch(C.aiUrl, { method: 'POST', headers: { Authorization: 'Bearer ' + dec(S.ai.key), 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25000),
      body: JSON.stringify(Object.assign({ model, temperature: 0.1, max_tokens: 1500, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }, { role: 'user', content: question }] }, extra)) });
    if (r.status === 401) throw Object.assign(new Error('Clé Groq refusée'), { code: 502 });
    if (r.status === 429) throw Object.assign(new Error('Groq demande de patienter un instant'), { code: 503 });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { log('IA', model, r.status, JSON.stringify(j).slice(0, 300)); return null; }
    const txt = (((j.choices || [])[0] || {}).message || {}).content || '';
    const mm = txt.match(/\{[\s\S]*\}/);
    try { const o = JSON.parse(mm ? mm[0] : txt); if (o && o.q) return o; } catch (e) {}
    log('IA réponse illisible', model, txt.slice(0, 200));
    return null;
  };
  // modèle à raisonnement : effort bas, raisonnement masqué ; sinon repli sur un modèle rapide
  let out = await call(C.aiModel, /gpt-oss/.test(C.aiModel) ? { reasoning_effort: 'low', include_reasoning: false } : {});
  if (!out) out = await call('llama-3.1-8b-instant', {});
  if (!out) throw Object.assign(new Error('Réponse de l’IA illisible, reformule'), { code: 502 });
  return { q: String(out.q).slice(0, 300), resume: String(out.resume || '').slice(0, 200) };
}
async function freeMessage(folderKey, uid) {
  return withImap(async client => {
    const folder = await resolveFolder(client, folderKey);
    const lock = await client.getMailboxLock(folder);
    try {
      const m = await client.fetchOne(uid, { source: true, flags: true }, { uid: true });
      if (!m) throw Object.assign(new Error('Message introuvable'), { code: 404 });
      const p = await simpleParser(m.source);
      return {
        uid, folder, subject: p.subject || '(sans objet)', from: p.from ? { name: p.from.value[0].name || p.from.value[0].address, email: (p.from.value[0].address || '').toLowerCase() } : { name: '', email: '' },
        fromRaw: p.from ? p.from.text : '', to: p.to ? p.to.text : '', cc: p.cc ? p.cc.text : '', replyTo: p.replyTo ? p.replyTo.text : '',
        date: +(p.date || Date.now()), html: p.html || null, text: p.text || '', messageId: p.messageId || '', references: [].concat(p.references || []).join(' '),
        seen: m.flags.has('\\Seen'),
        unsub: headerText(m.source, 'List-Unsubscribe'),
        unsubPost: headerText(m.source, 'List-Unsubscribe-Post'),
        attachments: (p.attachments || []).map((a, i) => ({ idx: i, name: a.filename || 'piece-jointe-' + (i + 1), mime: a.contentType, size: a.size, cid: a.cid || '', data: a.size < 300000 && a.cid ? a.content.toString('base64') : undefined }))
      };
    } finally { lock.release(); }
  });
}
async function freeAttachment(folderKey, uid, idx) {
  return withImap(async client => {
    const folder = await resolveFolder(client, folderKey);
    const lock = await client.getMailboxLock(folder);
    try {
      const m = await client.fetchOne(uid, { source: true }, { uid: true });
      const p = await simpleParser(m.source);
      const a = (p.attachments || [])[idx];
      if (!a) throw Object.assign(new Error('Pièce jointe introuvable'), { code: 404 });
      return { name: a.filename, mime: a.contentType, data: a.content.toString('base64') };
    } finally { lock.release(); }
  });
}
async function freeFlags(folderKey, uids, seen, flagged) {
  return withImap(async client => {
    const folder = await resolveFolder(client, folderKey);
    const lock = await client.getMailboxLock(folder);
    try {
      if (seen === true) await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
      if (seen === false) await client.messageFlagsRemove(uids, ['\\Seen'], { uid: true });
      if (flagged === true) await client.messageFlagsAdd(uids, ['\\Flagged'], { uid: true });
      if (flagged === false) await client.messageFlagsRemove(uids, ['\\Flagged'], { uid: true });
      return { ok: true };
    } finally { lock.release(); }
  });
}
async function freeMove(folderKey, uids, toKey) {
  return withImap(async client => {
    const folder = await resolveFolder(client, folderKey);
    const dest = await resolveFolder(client, toKey);
    const lock = await client.getMailboxLock(folder);
    try {
      if (toKey === 'BLOCKED' || toKey === 'JUNK') await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
      const r = await client.messageMove(uids, dest, { uid: true });
      const map = r && r.uidMap ? r.uidMap : null;
      return { ok: true, dest, from: folder, uids: map ? uids.map(u => map.get(u)).filter(Boolean) : [] };
    } finally { lock.release(); }
  });
}
async function freeFolderSize(folderKey) {
  return withImap(async client => {
    const folder = await resolveFolder(client, folderKey);
    const lock = await client.getMailboxLock(folder);
    try {
      let count = 0, bytes = 0;
      if (client.mailbox.exists) for await (const m of client.fetch('1:*', { size: true })) { count++; bytes += m.size || 0; }
      return { count, bytes };
    } finally { lock.release(); }
  });
}
async function freeEmpty(folderKey) {
  return withImap(async client => {
    const folder = await resolveFolder(client, folderKey);
    const dest = (await folders(client)).trash;
    const lock = await client.getMailboxLock(folder);
    try {
      const uids = (await client.search({ all: true }, { uid: true })) || [];
      if (uids.length) { await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true }); await client.messageMove(uids, dest, { uid: true }); }
      return { ok: true, moved: uids.length };
    } finally { lock.release(); }
  });
}
/* Range dans « Indésirables » les mails Free déjà présents dont l'expéditeur est bloqué (client IMAP déjà verrouillé sur INBOX) */
async function sweepInbox(client, targets) {
  const found = new Set();
  for (const t of targets) {
    const uids = (await client.search({ from: t }, { uid: true })) || [];
    if (!uids.length) continue;
    for await (const m of client.fetch(uids, { envelope: true }, { uid: true })) { const f = addr(m.envelope.from); if (f.email && isBlocked(f.email, [t])) found.add(m.uid); }
  }
  const uids = [...found];
  if (uids.length) { await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true }); await ensureFolder(client, BLOCK_LABEL); await client.messageMove(uids, BLOCK_LABEL, { uid: true }); }
  return uids.length;
}
async function freeSend(o) {
  const from = S.free.name ? { name: S.free.name, address: S.free.user } : S.free.user;
  const mail = { from, to: o.to || undefined, cc: o.cc || undefined, bcc: o.bcc || undefined, subject: o.subject || '', text: o.text || '',
    inReplyTo: o.inReplyTo || undefined, references: o.references || undefined,
    attachments: (o.attachments || []).map(a => ({ filename: a.name, content: a.b64, encoding: 'base64', contentType: a.mime })) };
  const transporter = nodemailer.createTransport(Object.assign({}, C.smtp, { auth: { user: S.free.user, pass: dec(S.free.pass) } }));
  const info = await transporter.sendMail(mail);
  const raw = await new MailComposer(Object.assign({}, mail, { messageId: info.messageId, date: new Date() })).compile().build();
  await withImap(async client => { const f = await folders(client); await client.append(f.sent, raw, ['\\Seen']); }).catch(e => log('copie Envoyés impossible', e.message));
  return { ok: true, id: info.messageId };
}

/* ---------- Blocage : règles Gmail « Indésirables », appliquées aussi à Free ---------- */
let blockedCache = { at: 0, list: [] };
async function blockedTargets() {
  if (!S.gmail) return [];
  if (Date.now() - blockedCache.at < 10 * 60000) return blockedCache.list;
  try {
    const labels = ((await gapi('labels')) || {}).labels || [];
    const l = labels.find(x => x.name === BLOCK_LABEL);
    const fs_ = l ? (((await gapi('settings/filters')) || {}).filter || []).filter(f => f.action && (f.action.addLabelIds || []).includes(l.id) && f.criteria && f.criteria.from) : [];
    blockedCache = { at: Date.now(), list: fs_.map(f => f.criteria.from.toLowerCase()) };
  } catch (e) { log('règles Gmail illisibles', e.message); }
  return blockedCache.list;
}
const isBlocked = (email, targets) => targets.some(t => email === t || (!t.includes('@') && (email.endsWith('@' + t) || email.endsWith('.' + t))));

/* ---------- Notifications ---------- */
async function push(payload) {
  const dead = [];
  await Promise.all(S.subs.map(s => webpush.sendNotification(s, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'normal' }).catch(e => { if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.endpoint); else log('push', e.statusCode || e.message); })));
  if (dead.length) { S.subs = S.subs.filter(s => !dead.includes(s.endpoint)); save(); }
}
const total = () => (S.badge.gmail || 0) + (S.badge.free || 0);
function localHour(tz) { try { const p = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: tz }).formatToParts(new Date()).find(x => x.type === 'hour'); return parseInt(p.value, 10) % 24; } catch (e) { return new Date().getHours(); } }
function isQuiet() {
  const p = S.prefs || {};
  if (!p.quiet) return false;
  const h = localHour(p.tz || 'Europe/Paris'), a = +p.quietStart, b = +p.quietEnd;
  return a === b ? false : a < b ? (h >= a && h < b) : (h >= a || h < b);
}

/* ---------- Surveillance ---------- */
async function pollGmail() {
  if (!S.gmail) return [];
  const fresh = [];
  const primary = !!(S.prefs && S.prefs.primaryOnly);
  if (primary) {
    const t = (await gapi('threads?' + new URLSearchParams({ q: 'in:inbox category:primary is:unread', maxResults: 100 }))) || {};
    S.badge.gmail = (t.threads || []).length;
  } else {
    const inbox = await gapi('labels/INBOX');
    S.badge.gmail = (inbox && inbox.threadsUnread) || 0;
  }
  const r = (await gapi('messages?' + new URLSearchParams({ q: 'in:inbox is:unread newer_than:2d' + (primary ? ' category:primary' : ''), maxResults: 25 }))) || {};
  const ids = (r.messages || []).map(m => m.id);
  const known = new Set(S.seen.gmail);
  const first = !S.seen.gmailInit;
  for (const id of ids) if (!known.has(id) && !first) fresh.push(id);
  S.seen.gmail = ids.concat(S.seen.gmail.filter(x => !ids.includes(x))).slice(0, 400);
  S.seen.gmailInit = true;
  const out = [];
  for (const id of fresh.slice(0, 5)) {
    try {
      const m = await gapi('messages/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject');
      const h = n => ((m.payload.headers || []).find(x => x.name.toLowerCase() === n.toLowerCase()) || {}).value || '';
      const fm = h('From').match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
      out.push({ acc: 'gmail', from: fm ? (fm[1] || fm[2]) : h('From'), subject: h('Subject') || '(sans objet)', url: C.appUrl + '#/thread/' + m.threadId });
    } catch (e) {}
  }
  return out;
}
async function pollFree() {
  if (!S.free) return [];
  const targets = await blockedTargets();
  return withImap(async client => {
    const lock = await client.getMailboxLock('INBOX');
    const out = [];
    try {
      const unseen = (await client.search({ seen: false }, { uid: true })) || [];
      const last = S.seen.freeUid || 0;
      const fresh = S.seen.freeInit ? unseen.filter(u => u > last) : [];
      S.seen.freeUid = Math.max(last, ...unseen, client.mailbox.uidNext ? client.mailbox.uidNext - 1 : 0);
      S.seen.freeInit = true;
      const sig = targets.slice().sort().join(',');
      if (sig && sig !== S.seen.sweepSig) {
        try {
          const n = await sweepInbox(client, targets);
          S.seen.sweepSig = sig;
          if (n) log('Free : ' + n + ' mail(s) d’expéditeurs bloqués rangés dans ' + BLOCK_LABEL);
        } catch (e) { log('nettoyage Free', e.message); }
      }
      const toBlock = [];
      if (fresh.length) {
        for await (const m of client.fetch(fresh, { envelope: true }, { uid: true })) {
          const f = addr(m.envelope.from);
          if (f.email && isBlocked(f.email, targets)) { toBlock.push(m.uid); continue; }
          out.push({ acc: 'free', from: f.name || f.email, subject: m.envelope.subject || '(sans objet)', url: C.appUrl + '#/free/INBOX/' + m.uid });
        }
      }
      if (toBlock.length) {
        await client.messageFlagsAdd(toBlock, ['\\Seen'], { uid: true });
        await ensureFolder(client, BLOCK_LABEL);
        await client.messageMove(toBlock, BLOCK_LABEL, { uid: true });
      }
      const st = await client.status('INBOX', { unseen: true });
      S.badge.free = st.unseen || 0;
    } finally { lock.release(); }
    return out;
  });
}
let polling = false;
let pollP = null, badgeTimer = null;
/* Pastille seule : quand des mails sont lus ailleurs (PC, Gmail web…), on remet le chiffre de l'iPhone à jour */
function scheduleBadgeSync() {
  if (!S.subs.length || isQuiet()) return;
  clearTimeout(badgeTimer);
  const wait = Math.max(5000, 120000 - (Date.now() - (S.lastBadgePush || 0)));
  badgeTimer = setTimeout(async () => {
    if (isQuiet() || total() === S.lastBadgeSent) return;
    S.lastBadgePush = Date.now(); S.lastBadgeSent = total(); save();
    await push({ type: 'badge', badge: total() }).catch(() => {});
  }, wait);
}
function poll() { if (!pollP) pollP = pollOnce().finally(() => { pollP = null; }); return pollP; }
async function pollOnce() {
  if (polling) return; polling = true;
  try {
    const before = total();
    const news = [];
    try { news.push(...await pollGmail()); } catch (e) { log('poll Gmail', e.message); }
    try { news.push(...await pollFree()); } catch (e) { log('poll Free', e.message); }
    save();
    if (news.length) log('nouveaux mails', news.length, 'pastille', total());
    if (news.length && isQuiet()) {
      // Heures calmes : on garde en attente, résumé au réveil
      S.pending = (S.pending || []).concat(news).slice(-50); save();
    } else if ((news.length || (S.pending || []).length) && S.subs.length) {
      const night = S.pending || [];
      const all = night.concat(news);
      S.pending = []; save();
      const one = all.length === 1;
      await push({ title: night.length ? all.length + (all.length > 1 ? ' mails reçus' : ' mail reçu') + ' cette nuit' : one ? all[0].from + (S.free && S.gmail ? ' · ' + (all[0].acc === 'free' ? 'Free' : 'Gmail') : '') : all.length + ' nouveaux mails',
        body: one ? all[0].subject : all.slice(-4).reverse().map(n => n.from + ' : ' + n.subject).join('\n'),
        badge: total(), url: one ? all[0].url : C.appUrl + '#/list/INBOX', tag: 'mailbox-new', silent: !!(S.prefs && S.prefs.silent) });
    } else if (before !== total()) { log('pastille', total()); if (total() < before) scheduleBadgeSync(); }
    if (news.length) S.lastBadgeSent = total();
  } finally { polling = false; }
}

/* ---------- Routes ---------- */
const routes = {
  'GET /health': async () => ({ ok: true, gmail: !!S.gmail, free: !!S.free, subs: S.subs.length }),
  'GET /status': async () => ({ gmail: S.gmail ? { email: S.gmail.email } : null, free: S.free ? { email: S.free.user, name: S.free.name || '' } : null, subs: S.subs.length, badge: { gmail: S.badge.gmail, free: S.badge.free, total: total() }, vapid: C.vapidPub, ai: !!S.ai }),
  'GET /gmail/token': async () => { const t = await gmailToken(); return { access_token: t.access_token, expires_in: Math.floor((t.exp - Date.now()) / 1000), scope: t.scope, email: S.gmail.email }; },
  'DELETE /gmail': async () => { S.gmail = null; gTok = null; save(); return { ok: true }; },
  'POST /push/subscribe': async (q, b) => { if (!b.subscription || !b.subscription.endpoint) throw Object.assign(new Error('abonnement invalide'), { code: 400 }); S.subs = S.subs.filter(s => s.endpoint !== b.subscription.endpoint).concat([b.subscription]); save(); return { ok: true, count: S.subs.length }; },
  'POST /push/test': async () => { await push({ title: 'MailBox', body: 'Les notifications fonctionnent.', badge: total(), url: C.appUrl, tag: 'mailbox-test' }); return { ok: true, count: S.subs.length }; },
  'GET /prefs': async () => S.prefs,
  'POST /prefs': async (q, b) => {
    const p = Object.assign({}, S.prefs);
    if (typeof b.silent === 'boolean') p.silent = b.silent;
    if (typeof b.quiet === 'boolean') p.quiet = b.quiet;
    if (typeof b.primaryOnly === 'boolean') { p.primaryOnly = b.primaryOnly; S.seen.gmailInit = false; }
    if (Number.isInteger(b.quietStart) && b.quietStart >= 0 && b.quietStart < 24) p.quietStart = b.quietStart;
    if (Number.isInteger(b.quietEnd) && b.quietEnd >= 0 && b.quietEnd < 24) p.quietEnd = b.quietEnd;
    if (typeof b.tz === 'string' && b.tz.length < 60) { try { new Intl.DateTimeFormat('fr', { timeZone: b.tz }); p.tz = b.tz; } catch (e) {} }
    S.prefs = p; save(); return p;
  },
  'GET /badge': async q => {
    // fresh=1 : l'appli vient de lire/supprimer, on attend un relevé à jour (5 s max)
    if (q.get('fresh')) await Promise.race([poll().catch(() => {}), new Promise(r => setTimeout(r, 5000))]); else poll().catch(() => {});
    S.lastBadgeSent = total();
    return { gmail: S.badge.gmail, free: S.badge.free, total: total() };
  },
  'POST /free/account': async (q, b) => {
    if (!b.email || !b.password) throw Object.assign(new Error('Adresse et mot de passe requis'), { code: 400 });
    const user = b.email.trim().toLowerCase();
    const client = new ImapFlow(Object.assign({}, C.imap, { auth: { user, pass: b.password }, logger: false }));
    try { await client.connect(); await client.logout(); } catch (e) {
      if (e.authenticationFailed || /auth/i.test(e.responseText || '')) throw Object.assign(new Error('Connexion Free refusée : vérifie l’adresse et le mot de passe'), { code: 401 });
      throw Object.assign(new Error('Serveur Free injoignable : ' + (e.code || e.message)), { code: 502 });
    }
    S.free = { user, pass: enc(b.password), name: (b.name || '').trim() }; S.seen.freeInit = false; S.seen.sweepSig = ''; save();
    poll().catch(() => {}); startIdle().catch(() => {});
    return { ok: true, email: user };
  },
  'DELETE /free/account': async () => { S.free = null; S.badge.free = 0; save(); startIdle().catch(() => {}); return { ok: true }; },
  'GET /free/folders': async q => withImap(async c => {
    const f = await folders(c);
    if (q.get('tree') === '1') {
      const list = await c.list();
      const skip = new Set(['INBOX', f.sent, f.trash, f.junk, f.drafts]);
      const user = list.filter(m => !skip.has(m.path) && !(m.flags && m.flags.has('\\Noselect')) && !m.specialUse);
      const out = [];
      for (const m of user) {
        let unseen = 0, messages = 0; try { const st = await c.status(m.path, { unseen: true, messages: true }); unseen = st.unseen || 0; messages = st.messages || 0; } catch (e) {}
        out.push({ path: m.path, name: m.name, delim: m.delimiter || '/', unseen, messages });
      }
      return { folders: out };
    }
    return f;
  }),
  'GET /free/list': async q => freeList(q.get('folder') || 'INBOX', q.get('unread') === '1', +q.get('before') || 0, Math.min(+q.get('limit') || 25, 50)),
  'GET /free/search': async q => freeSearch((q.get('q') || '').slice(0, 200), Math.min(+q.get('limit') || 30, 50)),
  'GET /free/message': async q => freeMessage(q.get('folder') || 'INBOX', +q.get('uid')),
  'GET /free/attachment': async q => freeAttachment(q.get('folder') || 'INBOX', +q.get('uid'), +q.get('idx')),
  'POST /free/flags': async (q, b) => freeFlags(b.folder || 'INBOX', b.uids || [], b.seen, b.flagged),
  'POST /free/move': async (q, b) => {
    const r = await freeMove(b.folder || 'INBOX', b.uids || [], b.to);
    // un mail remis en réception (annulation) n'est pas un nouveau mail : pas de notification
    if (r.dest === 'INBOX' && r.uids.length) { S.seen.freeUid = Math.max(S.seen.freeUid || 0, ...r.uids); save(); }
    return r;
  },
  'POST /free/send': async (q, b) => freeSend(b),
  'POST /free/readall': async (q, b) => withImap(async client => {
    const folder = await resolveFolder(client, (b && b.folder) || 'INBOX');
    const lock = await client.getMailboxLock(folder);
    try {
      const uids = (await client.search({ seen: false }, { uid: true })) || [];
      if (uids.length) await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
      if (folder === 'INBOX') { S.badge.free = 0; save(); }
      return { ok: true, count: uids.length, uids, folder };
    } finally { lock.release(); }
  }),
  'POST /unsubscribe': async (q, b) => {
    const url = String(b.url || '');
    if (!/^https:\/\//i.test(url)) throw Object.assign(new Error('Lien de désabonnement invalide'), { code: 400 });
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click', redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw Object.assign(new Error('L’expéditeur a refusé la demande (' + r.status + ')'), { code: 502 });
    return { ok: true };
  },
  'POST /free/folder-create': async (q, b) => withImap(async client => {
    const path = String(b.path || '').trim();
    if (!path || path.length > 200) throw Object.assign(new Error('Nom de dossier invalide'), { code: 400 });
    const list = await client.list();
    if (list.some(m => m.path.toLowerCase() === path.toLowerCase())) throw Object.assign(new Error('Ce dossier existe déjà'), { code: 409 });
    await client.mailboxCreate(path);
    try { await client.mailboxSubscribe(path); } catch (e) {}
    return { ok: true, path };
  }),
  'POST /free/folder-delete': async (q, b) => withImap(async client => {
    const path = String(b.path || '');
    const f = await folders(client);
    if (!path || ['INBOX', f.sent, f.trash, f.junk, f.drafts, BLOCK_LABEL].includes(path)) throw Object.assign(new Error('Dossier protégé'), { code: 400 });
    const st = await client.status(path, { messages: true });
    if (st.messages) throw Object.assign(new Error('Le dossier n’est pas vide'), { code: 409 });
    await client.mailboxDelete(path);
    return { ok: true };
  }),
  'GET /free/waiting': async () => freeWaiting(),
  'POST /ai/key': async (q, b) => {
    const k = String(b.key || '').trim();
    if (!k) { S.ai = null; save(); return { ok: true, ai: false }; }
    const r = await fetch(C.aiUrl.replace(/chat\/completions$/, 'models'), { headers: { Authorization: 'Bearer ' + k } }).catch(() => null);
    if (!r || r.status === 401) throw Object.assign(new Error('Clé refusée par Groq'), { code: 400 });
    S.ai = { key: enc(k) }; save(); return { ok: true, ai: true };
  },
  'POST /transfer/free-to-gmail': async (q, b) => {
    if (!S.free || !S.gmail) throw Object.assign(new Error('Gmail et Free doivent être reliés au relais'), { code: 409 });
    if (S.transfer && S.transfer.state === 'running') throw Object.assign(new Error('Un transfert est déjà en cours'), { code: 409 });
    const path = String(b.path || ''), label = String(b.label || '').trim().replace(/^\/|\/$/g, '');
    if (!path || !label || path === 'INBOX' || path === BLOCK_LABEL) throw Object.assign(new Error('Dossier invalide'), { code: 400 });
    S.transfer = { path, label, deleteSource: !!b.deleteSource, total: 0, done: 0, failed: 0, state: 'running', startedAt: Date.now(), doneUids: {} };
    save();
    runTransfer(S.transfer);
    return { ok: true };
  },
  'GET /transfer/status': async () => { const t = S.transfer; return t ? { path: t.path, label: t.label, total: t.total, done: t.done, failed: t.failed, state: t.state, error: t.error || '', deleteSource: t.deleteSource } : { state: 'none' }; },
  'POST /ai/folders': async (q, b) => aiFolders(Array.isArray(b.folders) ? b.folders : [], b.focus),
  'POST /free/folder-rename': async (q, b) => withImap(async client => {
    const from = String(b.from || ''), to = String(b.to || '');
    if (!from || !to || from === 'INBOX' || from === BLOCK_LABEL) throw Object.assign(new Error('Dossier protégé'), { code: 400 });
    const list = await client.list();
    if (list.some(m => m.path === to)) {
      // le dossier cible existe : on y verse les mails puis on supprime l'ancien
      const lock = await client.getMailboxLock(from);
      try { const uids = (await client.search({ all: true }, { uid: true })) || []; if (uids.length) await client.messageMove(uids, to, { uid: true }); } finally { lock.release(); }
      if (!list.some(m => m.path.startsWith(from + (m.delimiter || '/')))) await client.mailboxDelete(from);
      return { ok: true, merged: true };
    }
    const dl = b.delim || '/';
    const parent = to.includes(dl) ? to.slice(0, to.lastIndexOf(dl)) : '';
    if (parent && !list.some(m => m.path === parent)) { try { await client.mailboxCreate(parent); } catch (e) {} }
    await client.mailboxRename(from, to);
    return { ok: true };
  }),
  'POST /ai/search': async (q, b) => aiSearch(String(b.q || '').slice(0, 300), String(b.today || '')),
  'GET /free/size': async q => freeFolderSize(q.get('folder') || 'BLOCKED'),
  'POST /free/empty': async (q, b) => freeEmpty(b.folder || 'BLOCKED'),
  'POST /free/block': async (q, b) => {
    const t = (b.target || '').toLowerCase(); if (!t) throw Object.assign(new Error('cible manquante'), { code: 400 });
    blockedCache.at = 0;
    return withImap(async client => {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const uids = (await client.search({ from: t }, { uid: true })) || [];
        if (uids.length) { await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true }); await ensureFolder(client, BLOCK_LABEL); await client.messageMove(uids, BLOCK_LABEL, { uid: true }); }
        return { ok: true, moved: uids.length };
      } finally { lock.release(); }
    });
  }
};

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const q = u.searchParams;
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  try {
    // Connexion Google (navigation, pas d'en-tête Authorization possible)
    if (req.method === 'GET' && u.pathname === '/auth/google/start') {
      if (!authed(req, q)) return send(res, 401, { error: 'code d’accès invalide' });
      const st = crypto.randomBytes(16).toString('hex');
      oauthStates.set(st, Date.now() + 10 * 60000);
      return redirect(res, 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: C.gClientId, redirect_uri: C.publicUrl + '/auth/google/callback', response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: st, login_hint: q.get('hint') || '' }));
    }
    if (req.method === 'GET' && u.pathname === '/auth/google/callback') {
      const st = q.get('state'); const exp = oauthStates.get(st); oauthStates.delete(st);
      if (!exp || exp < Date.now()) return redirect(res, C.appUrl + '#/settings?relay=erreur-session');
      if (q.get('error')) return redirect(res, C.appUrl + '#/settings?relay=refus');
      const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: q.get('code'), client_id: C.gClientId, client_secret: C.gClientSecret, redirect_uri: C.publicUrl + '/auth/google/callback', grant_type: 'authorization_code' }) });
      const j = await r.json();
      if (!r.ok || !j.refresh_token) { log('échange OAuth', j.error || 'pas de refresh_token'); return redirect(res, C.appUrl + '#/settings?relay=erreur-google'); }
      S.gmail = { refresh: enc(j.refresh_token), email: '' }; S.seen.gmailInit = false;
      gTok = { access_token: j.access_token, exp: Date.now() + j.expires_in * 1000, scope: j.scope };
      try { S.gmail.email = (await gapi('profile')).emailAddress; } catch (e) {}
      save(); poll().catch(() => {});
      return redirect(res, C.appUrl + '#/settings?relay=gmail-ok');
    }
    const h = routes[req.method + ' ' + u.pathname];
    if (!h) return send(res, 404, { error: 'introuvable' });
    if (u.pathname !== '/health' && !authed(req)) return send(res, 401, { error: 'code d’accès invalide' });
    const b = req.method === 'POST' ? await body(req) : {};
    send(res, 200, await h(q, b));
  } catch (e) {
    log(req.method, u.pathname, e.message);
    send(res, e.code && e.code >= 400 && e.code < 600 ? e.code : 500, { error: e.message });
  }
});
/* ---------- Free en temps réel (IMAP IDLE) ---------- */
let idle = null, idleUser = null, idleTimer = null, idleDebounce = null;
async function startIdle() {
  clearTimeout(idleTimer);
  if (idle && (!S.free || S.free.user !== idleUser)) { const c = idle; idle = null; await c.logout().catch(() => {}); }
  if (!S.free || idle) return;
  const client = new ImapFlow(Object.assign({}, C.imap, { auth: { user: S.free.user, pass: dec(S.free.pass) }, logger: false, maxIdleTime: 9 * 60000 }));
  idle = client; idleUser = S.free.user;
  const again = () => { if (idle === client) { idle = null; idleTimer = setTimeout(() => startIdle().catch(() => {}), 30000); } };
  client.on('close', again); client.on('error', e => log('IDLE Free', e.message));
  client.on('exists', () => { clearTimeout(idleDebounce); idleDebounce = setTimeout(() => poll().catch(() => {}), 1500); });
  try { await client.connect(); await client.mailboxOpen('INBOX'); log('Free en temps réel (IDLE) actif'); } catch (e) { log('IDLE Free impossible', e.message); again(); }
}
server.listen(C.port, () => {
  log('Relais MailBox prêt sur le port ' + C.port);
  setTimeout(() => poll().catch(() => {}), 3000);
  setInterval(() => poll().catch(() => {}), C.pollMs);
  setTimeout(() => startIdle().catch(() => {}), 5000);
  // reprise d'un transfert interrompu par un redémarrage
  if (S.transfer && S.transfer.state === 'running') { S.transfer.total = S.transfer.deleteSource ? S.transfer.done : 0; setTimeout(() => runTransfer(S.transfer), 8000); }
});
process.on('SIGTERM', () => { save(); process.exit(0); });
