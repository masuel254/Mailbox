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
const SCOPE = 'https://mail.google.com/ https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.settings.basic https://www.googleapis.com/auth/contacts https://www.googleapis.com/auth/calendar';
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
/* Pause générale quand Google demande de ralentir : le relais arrête ses lectures de fond un moment */
let gBackoff = { until: 0, ms: 0 };
const gRateHit = () => { gBackoff.ms = Math.min(20 * 60000, gBackoff.ms ? gBackoff.ms * 2 : 3 * 60000); gBackoff.until = Date.now() + gBackoff.ms; log('Gmail demande de ralentir : pause des lectures de fond ' + Math.round(gBackoff.ms / 60000) + ' min'); };
const gPaused = () => Date.now() < gBackoff.until;
async function gapi(p, opt = {}) {
  const t = await gmailToken();
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + p, { method: opt.method || 'GET', headers: Object.assign({ Authorization: 'Bearer ' + t.access_token }, opt.body ? { 'Content-Type': 'application/json' } : {}), body: opt.body ? JSON.stringify(opt.body) : undefined });
  if (!r.ok) { let why = ''; try { const j = await r.json(); why = (j.error && ((j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || j.error.status || j.error.message)) || ''; } catch (e) {} if (r.status === 429 || /rate|quota/i.test(why)) { if (!gPaused()) gRateHit(); } throw new Error('Gmail ' + r.status + (why ? ' ' + why : '')); }
  if (gBackoff.ms && !gPaused()) gBackoff.ms = 0;
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
/* Dossiers spam du fournisseur (Junk, Spam, Courrier indésirable…) : leur contenu est regroupé dans « Indésirables » */
const JUNK_RE = /^(junk|spam|bulk|courrier ind|junk e-?mail)/i;
function junkPaths(list) {
  return list.filter(m => nfc(m.path) !== nfc(BLOCK_LABEL) && nfc(m.name) !== nfc(BLOCK_LABEL) && !(m.flags && m.flags.has('\\Noselect')) && (m.specialUse === '\\Junk' || JUNK_RE.test(m.name || '') || JUNK_RE.test(m.path))).map(m => m.path);
}
async function sweepJunk(client) {
  let n = 0;
  for (const path of junkPaths(await client.list())) {
    let st; try { st = await client.status(path, { messages: true }); } catch (e) { continue; }
    if (!st.messages) continue;
    const lock = await client.getMailboxLock(path);
    try {
      const uids = (await client.search({ all: true }, { uid: true })) || [];
      if (uids.length) { await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true }); await client.messageMove(uids, await blockPath(client), { uid: true }); n += uids.length; }
    } finally { lock.release(); }
  }
  return n;
}
/* Retrouve le vrai dossier « Indésirables » chez Free, même si son nom est encodé autrement (accents, casse, préfixe) */
const nfc = x => String(x || '').normalize('NFC').toLowerCase();
async function blockPath(client) {
  const list = await client.list();
  const hit = list.find(m => nfc(m.path) === nfc(BLOCK_LABEL)) || list.find(m => nfc(m.name) === nfc(BLOCK_LABEL));
  return hit ? hit.path : ensureFolder(client, BLOCK_LABEL);
}
async function ensureFolder(client, name) { try { await client.mailboxCreate(name); } catch (e) { /* existe déjà */ } return name; }
async function resolveFolder(client, key) {
  const f = await folders(client);
  if (key === 'INBOX') return 'INBOX';
  if (key === 'SENT') return f.sent;
  if (key === 'TRASH') return f.trash;
  if (key === 'JUNK') return f.junk;
  if (key === 'ARCHIVE') return f.archive || ensureFolder(client, 'Archives');
  if (key === 'BLOCKED') return blockPath(client);
  if (f.all.find(m => m.path === key)) return key;
  throw Object.assign(new Error('Dossier inconnu'), { code: 400 });
}
const snip = t => (t || '').replace(/(^|\s)[^\s{}][^{}]{0,300}\{[^{}]*\}/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
const hasAtt = n => !!n && ((n.disposition === 'attachment') || (n.disposition === 'inline' && !/^text\//.test(n.type || '') && n.parameters && n.dispositionParameters && n.dispositionParameters.filename) || (n.childNodes || []).some(hasAtt));
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
        for await (const m of client.fetch(uids, { envelope: true, flags: true, internalDate: true, bodyStructure: true, source: { start: 0, maxLength: 6000 } }, { uid: true })) {
          let snippet = '';
          try { const p = await simpleParser(m.source); snippet = snip(p.text); } catch (e) {}
          items.push({ uid: m.uid, folder, subject: m.envelope.subject || '(sans objet)', from: addr(m.envelope.from), to: (m.envelope.to || []).map(x => x.name || x.address).join(', '), date: +new Date(m.internalDate || m.envelope.date), seen: m.flags.has('\\Seen'), flagged: m.flags.has('\\Flagged'), snippet, att: hasAtt(m.bodyStructure) });
        }
      }
      items.sort((a, b) => b.date - a.date);
      return { folder, items, more: total > uids.length };
    } finally { lock.release(); }
  });
}
async function freeSearch(q, limit, deep) {
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
  // une requête sans aucun mot, expéditeur ni objet (ex. seulement une période) ramènerait tous les mails : on l'ignore
  const useful = qq => ['text', 'from', 'to', 'subject', 'larger'].some(k => qq[k]);
  if (!queries.length || !queries.every(useful)) { const u = queries.filter(useful); if (!u.length) return { items: [] }; queries.length = 0; queries.push(...u); }
  return withImap(async client => {
    const f = await folders(client);
    const items = [], seen = new Set();
    const skip = new Set([f.trash, f.junk, f.drafts, 'Mis de côté'].filter(Boolean));
    const extra = (f.all || []).filter(m => !(m.flags && m.flags.has('\\Noselect')) && !skip.has(m.path) && !['INBOX', f.sent, f.archive, BLOCK_LABEL].includes(m.path) && !/^(contacts|chats|calendar|notes|emailed contacts|deleted messages)$/i.test(m.path)).map(m => m.path);
    const list = await client.list();
    const blk = (list.find(m => nfc(m.path) === nfc(BLOCK_LABEL)) || {}).path || BLOCK_LABEL;
    // deep : seconde passe dans la corbeille et le spam seulement (mails supprimés ou jugés indésirables)
    const order = deep
      ? [...new Set([f.trash, ...list.filter(m => /^deleted messages$/i.test(m.path)).map(m => m.path), f.junk, ...junkPaths(list)].filter(p => p && list.some(m => m.path === p)))]
      : ['INBOX', f.sent, f.archive, blk].filter(Boolean).concat(extra.filter(p => nfc(p) !== nfc(BLOCK_LABEL))).slice(0, 40);
    for (const folder of order) {
      let lock; try { lock = await client.getMailboxLock(folder); } catch (e) { continue; }
      try {
        let uids = [];
        for (const qq of queries) uids.push(...((await client.search(qq, { uid: true })) || []));
        uids = [...new Set(uids)].sort((a, b) => b - a).slice(0, limit * 2);
        if (uids.length) for await (const m of client.fetch(uids, { envelope: true, flags: true, internalDate: true, size: true, source: { start: 0, maxLength: 20000 } }, { uid: true })) {
          let snippet = '', text = '';
          try { const p = await simpleParser(m.source); text = p.text || ''; snippet = snip(text); } catch (e) {}
          if (!anyOf && words.length > 1) { const hay = ((m.envelope.subject || '') + ' ' + JSON.stringify(m.envelope.from || []) + ' ' + text).toLowerCase(); if (!words.slice(1).every(w => hay.includes(w))) continue; }
          const key = folder + ':' + m.uid; if (seen.has(key)) continue; seen.add(key);
          items.push({ text: text.replace(/\s+/g, ' ').slice(0, 4000), uid: m.uid, folder, subject: m.envelope.subject || '(sans objet)', from: addr(m.envelope.from), to: (m.envelope.to || []).map(x => x.name || x.address).join(', '), toEmail: ((m.envelope.to || [])[0] || {}).address || '', date: +new Date(m.internalDate || m.envelope.date), seen: m.flags.has('\\Seen'), flagged: m.flags.has('\\Flagged'), snippet, size: m.size || 0, mine: folder === f.sent });
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
async function aiCall(sys, user, maxTokens) {
  if (!S.ai) throw Object.assign(new Error('Assistant IA non configuré (Réglages)'), { code: 400 });
  const out = await aiJSON(sys, user, maxTokens);
  if (!out) throw Object.assign(new Error('Réponse de l’IA illisible, réessaie'), { code: 502 });
  return out;
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
    'RÈGLES IMPORTANTES : n’ajoute JAMAIS de limite de date (newer_than, after, before) si la demande ne parle pas d’une période ; n’utilise JAMAIS subject: sauf si la demande parle explicitement de l’objet ; des mots-clés simples sans opérateur cherchent dans tout le mail (objet ET corps), c’est ce qu’il faut par défaut ; n’utilise OR qu’entre synonymes d’un même mot, entre parenthèses, ex. devis (porte OR portail). ' +
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
      // contrôle : les mails ont-ils vraiment quitté le dossier d'origine ?
      let left = [];
      try { left = (await client.search({ uid: uids.join(',') }, { uid: true })) || []; } catch (e) {}
      log('Free : déplacement ' + folder + ' → ' + dest + ' de ' + uids.length + ' mail(s)' + (left.length ? ', ENCORE PRÉSENTS : ' + left.join(',') : ', ok'));
      if (left.length) throw Object.assign(new Error('Free n’a pas déplacé le mail (encore dans ' + folder + ')'), { code: 502 });
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
/* Vider la corbeille Gmail + Free côté serveur : continue même si l'iPhone se met en veille.
   On relit toujours la première page (pas de pageToken : effacer décale les pages et en ferait sauter). */
let trashJob = null;
const pause = ms => new Promise(r => setTimeout(r, ms));
async function runEmptyTrash(job) {
  log('vidage corbeille : début' + (S.gmail ? '' : ' (Gmail non relié au relais)'));
  if (S.gmail) {
    let tries = 0;
    while (true) {
      try {
        const r = (await gapi('messages?' + new URLSearchParams({ labelIds: 'TRASH', includeSpamTrash: 'true', maxResults: 500 }))) || {};
        const ids = (r.messages || []).map(m => m.id);
        if (!ids.length) break;
        await gapi('messages/batchDelete', { method: 'POST', body: { ids } });
        job.gmail += ids.length; tries = 0;
        await pause(400);
      } catch (e) {
        log('vidage corbeille Gmail :', e.message);
        if (/insufficient|scope|PERMISSION/i.test(e.message)) { job.error = 'scope'; break; }
        if (/ 429| 403|rate|quota|5\d\d/i.test(e.message) && tries < 12) { tries++; await pause(3000 * tries); continue; }
        job.error = e.message; break;
      }
    }
  }
  if (S.free) { try { job.free = (await freePurge('TRASH')).deleted || 0; } catch (e) { job.error = job.error || 'Free : ' + e.message; } }
  job.running = false; job.end = Date.now();
  log('corbeille vidée : Gmail ' + job.gmail + ', Free ' + job.free + (job.error ? ' (' + job.error + ')' : ''));
}
/* Corbeille Free : effacement définitif (uniquement la corbeille) */
async function freePurge(folderKey) {
  if (folderKey !== 'TRASH') throw Object.assign(new Error('Seule la corbeille peut être vidée définitivement'), { code: 400 });
  return withImap(async client => {
    const folder = await resolveFolder(client, 'TRASH');
    const lock = await client.getMailboxLock(folder);
    try {
      const uids = (await client.search({ all: true }, { uid: true })) || [];
      if (uids.length) await client.messageDelete(uids, { uid: true });
      return { ok: true, deleted: uids.length };
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
    const uids = (await client.search({ from: t.startsWith('name:') ? t.slice(5) : t }, { uid: true }).catch(() => [])) || [];
    if (!uids.length) continue;
    for await (const m of client.fetch(uids, { envelope: true }, { uid: true })) { const f = addr(m.envelope.from); if (isBlocked(f.email, [t], f.name)) found.add(m.uid); }
  }
  const uids = [...found];
  if (uids.length) { await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true }); await client.messageMove(uids, await blockPath(client), { uid: true }); }
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

async function senderPurge(email, dry) {
  email = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw Object.assign(new Error('Adresse invalide'), { code: 400 });
  const out = { gmail: 0, free: 0 };
  if (S.gmail) {
    let ids = [], tok = null;
    do { const r = await gapi('messages?' + new URLSearchParams(Object.assign({ q: 'from:' + email + ' -in:trash', maxResults: 500 }, tok ? { pageToken: tok } : {}))); ids = ids.concat(((r && r.messages) || []).map(m => m.id)); tok = r && r.nextPageToken; } while (tok && ids.length < 5000);
    out.gmail = ids.length;
    if (!dry) for (let i = 0; i < ids.length; i += 1000) await gapi('messages/batchModify', { method: 'POST', body: { ids: ids.slice(i, i + 1000), addLabelIds: ['TRASH'], removeLabelIds: ['INBOX', 'UNREAD'] } });
  }
  if (S.free) await withImap(async client => {
    const f = await folders(client), list = await client.list();
    for (const m of list) {
      if (m.flags && m.flags.has('\\Noselect')) continue;
      if ([f.trash, f.sent, f.drafts].includes(m.path)) continue;
      let lock = null;
      try { lock = await client.getMailboxLock(m.path); const uids = (await client.search({ from: email }, { uid: true })) || []; out.free += uids.length; if (!dry && uids.length) await client.messageMove(uids, f.trash, { uid: true }); }
      catch (e) { log('nettoyage ' + m.path, e.message); } finally { if (lock) lock.release(); }
    }
  });
  if (!dry) { log('Nettoyage ' + email + ' : Gmail ' + out.gmail + ', Free ' + out.free); poll().catch(() => {}); }
  return out;
}
/* ---------- Blocage : règles Gmail « Indésirables », appliquées aussi à Free ---------- */
let blockedCache = { at: 0, list: [] };
let resweep = { running: false, moved: 0, done: 0, total: 0 };
/* Liste des expéditeurs bloqués gardée sur le serveur : elle survit aux redémarrages et aux pauses de Gmail */
async function blockedTargets() {
  const local = S.blocked || [];
  const merge = l => [...new Set(local.concat(l || []))];
  if (!S.gmail || gPaused()) return merge(blockedCache.list);
  if (Date.now() - blockedCache.at < 10 * 60000) return merge(blockedCache.list);
  try {
    const labels = ((await gapi('labels')) || {}).labels || [];
    const l = labels.find(x => x.name === BLOCK_LABEL);
    const fs_ = l ? (((await gapi('settings/filters')) || {}).filter || []).filter(f => f.action && (f.action.addLabelIds || []).includes(l.id) && f.criteria && f.criteria.from) : [];
    blockedCache = { at: Date.now(), list: fs_.map(f => { const v = f.criteria.from.trim(); return /^".*"$/.test(v) ? 'name:' + v.slice(1, -1) : v.toLowerCase(); }) };
    S.blocked = [...new Set((S.blocked || []).concat(blockedCache.list))]; save();
  } catch (e) { log('règles Gmail illisibles', e.message); }
  return merge(blockedCache.list);
}
// Cibles : adresse, domaine, ou « name:Nom affiché » (pour les expéditeurs qui changent d'adresse à chaque envoi)
const normName = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/["'«»]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const isBlocked = (email, targets, name) => targets.some(t => t.startsWith('name:') ? !!name && normName(name) === normName(t.slice(5)) : !!email && (email === t || (!t.includes('@') && (email.endsWith('@' + t) || email.endsWith('.' + t)))));

/* ---------- TimeTree (lecture seule, API web non officielle) ----------
   Connexion par mail + mot de passe (gardé chiffré), relecture des calendriers toutes les 15 min.
   Rien n'est jamais écrit dans TimeTree. */
const { rrulestr } = require('rrule');
const TT = process.env.TT_URL || 'https://timetreeapp.com/api/v1';
const TT_HDR = { 'Content-Type': 'application/json', 'X-Timetreea': 'web/2.1.0/fr' };
let ttSess = null, ttLoginAt = 0, ttBusy = null;
async function ttLogin(user, pass) {
  // TimeTree limite les connexions : jamais plus d'une tentative par minute
  if (Date.now() - ttLoginAt < 60000 && !user) throw Object.assign(new Error('TimeTree : nouvelle connexion trop rapprochée'), { code: 429 });
  ttLoginAt = Date.now();
  const r = await fetch(TT + '/auth/email/signin', { method: 'PUT', headers: TT_HDR, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ uid: user || S.timetree.user, password: pass || dec(S.timetree.pass), uuid: crypto.randomBytes(16).toString('hex') }) });
  if (r.status !== 200) {
    let code = null; try { code = ((await r.json()).error || {}).code; } catch (e) {}
    if (code === -702) throw Object.assign(new Error('TimeTree : mail ou mot de passe incorrect'), { code: 401 });
    if (code === -495) throw Object.assign(new Error('TimeTree limite les connexions, réessaie dans quelques minutes'), { code: 429 });
    throw Object.assign(new Error('TimeTree : connexion refusée (' + r.status + ')'), { code: 502 });
  }
  const sc = (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie') || '']).join(';');
  const m = sc.match(/_session_id=([^;]+)/);
  if (!m) throw Object.assign(new Error('TimeTree : session introuvable'), { code: 502 });
  return m[1];
}
async function ttGet(p, retried) {
  if (!ttSess) ttSess = await ttLogin();
  const r = await fetch(TT + p, { headers: Object.assign({ Cookie: '_session_id=' + ttSess }, TT_HDR), signal: AbortSignal.timeout(20000) });
  if ((r.status === 401 || r.status === 403) && !retried) { ttSess = null; return ttGet(p, true); }
  if (!r.ok) throw new Error('TimeTree ' + r.status);
  return r.json();
}
// Jeton anti-falsification exigé par TimeTree pour toute écriture (lu dans la page d'accueil, session ouverte)
let ttCsrf = null;
async function ttGetCsrf() {
  if (!ttSess) ttSess = await ttLogin();
  const r = await fetch(TT.replace(/\/api\/v1$/, '') + '/', { headers: { Cookie: '_session_id=' + ttSess, 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
  const m = (await r.text()).match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/i);
  if (!m) throw new Error('TimeTree : jeton d’écriture introuvable');
  return (ttCsrf = m[1]);
}
async function ttCreate(calId, ev, retried) {
  if (!ttSess) ttSess = await ttLogin();
  const csrf = ttCsrf || await ttGetCsrf();
  const r = await fetch(TT + '/calendar/' + encodeURIComponent(calId) + '/event', { method: 'POST', signal: AbortSignal.timeout(20000),
    headers: Object.assign({ Cookie: '_session_id=' + ttSess, 'x-csrf-token': csrf }, TT_HDR), body: JSON.stringify(ev) });
  if ((r.status === 401 || r.status === 403 || r.status === 422) && !retried) { if (r.status === 401) ttSess = null; ttCsrf = null; return ttCreate(calId, ev, true); }
  if (!r.ok) { let t = ''; try { t = (await r.text()).slice(0, 200); } catch (e) {} throw Object.assign(new Error('TimeTree a refusé l’événement (' + r.status + ')'), { code: 502, detail: t }); }
  return r.json().catch(() => ({}));
}
async function ttDelete(calId, uuid, retried) {
  if (!ttSess) ttSess = await ttLogin();
  const csrf = ttCsrf || await ttGetCsrf();
  const url = TT + '/calendar/' + encodeURIComponent(calId) + '/event/' + encodeURIComponent(uuid);
  const hdr = Object.assign({ Cookie: '_session_id=' + ttSess, 'x-csrf-token': csrf }, TT_HDR);
  let r = await fetch(url, { method: 'DELETE', headers: hdr, signal: AbortSignal.timeout(20000) });
  if ([400, 405, 415].includes(r.status)) {
    // ancienne forme attendue par TimeTree : l'événement complet dans le corps
    const cur = await fetch(url, { headers: hdr, signal: AbortSignal.timeout(20000) }).then(x => x.json()).catch(() => null);
    if (cur && cur.event) r = await fetch(url, { method: 'DELETE', headers: hdr, body: JSON.stringify(cur.event), signal: AbortSignal.timeout(20000) });
  }
  if ((r.status === 401 || r.status === 403 || r.status === 422) && !retried) { if (r.status === 401) ttSess = null; ttCsrf = null; return ttDelete(calId, uuid, true); }
  if (r.status === 404) return { ok: true, already: true };
  if (!r.ok) throw Object.assign(new Error('TimeTree a refusé la suppression (' + r.status + ')'), { code: 502 });
  return { ok: true };
}
async function ttUpdate(calId, uuid, body, retried) {
  if (!ttSess) ttSess = await ttLogin();
  const csrf = ttCsrf || await ttGetCsrf();
  const r = await fetch(TT + '/calendar/' + encodeURIComponent(calId) + '/event/' + encodeURIComponent(uuid), { method: 'PUT', signal: AbortSignal.timeout(20000),
    headers: Object.assign({ Cookie: '_session_id=' + ttSess, 'x-csrf-token': csrf }, TT_HDR), body: JSON.stringify(body) });
  if ((r.status === 401 || r.status === 403 || r.status === 422) && !retried) { if (r.status === 401) ttSess = null; ttCsrf = null; return ttUpdate(calId, uuid, body, true); }
  if (r.status === 404) throw Object.assign(new Error('Événement TimeTree introuvable (supprimé ailleurs ?)'), { code: 404 });
  if (!r.ok) { let t = ''; try { t = (await r.text()).slice(0, 200); } catch (e) {} throw Object.assign(new Error('TimeTree a refusé la modification (' + r.status + ')'), { code: 502, detail: t }); }
  return r.json().catch(() => ({}));
}
const ttColor = c => typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : (c || '');
async function ttSync() {
  if (!S.timetree) return;
  if (ttBusy) return ttBusy;
  ttBusy = (async () => {
    try {
      const cals = ((await ttGet('/calendars?since=0')).calendars || []).filter(c => !c.deactivated_at);
      const out = [];
      for (const c of cals.slice(0, 10)) {
        let labels = {};
        try { ((await ttGet('/calendar/' + c.id + '/labels')).calendar_labels || []).forEach(l => { labels[l.id] = ttColor(l.color); }); } catch (e) {}
        let j = await ttGet('/calendar/' + c.id + '/events/sync'), evs = j.events || [], n = 0;
        while (j.chunk === true && n++ < 40) { j = await ttGet('/calendar/' + c.id + '/events/sync?since=' + j.since); evs = evs.concat(j.events || []); }
        evs.filter(e => e && !e.deactivated_at && e.type !== 1 && e.category !== 2 && e.start_at != null).forEach(e => {
          let lid = e.label_id; if (lid == null) { try { const x = e.relationships.label.data.id; lid = +String(x).split(',').pop(); } catch (er) {} }
          out.push({ id: e.uuid || e.id, calId: c.id, cal: c.name || 'TimeTree', title: e.title || '(sans titre)', start: e.start_at, end: e.end_at || e.start_at, allDay: !!e.all_day,
            tz: e.start_timezone || 'UTC', location: e.location || '', note: e.note || '', rec: Array.isArray(e.recurrences) ? e.recurrences : [], color: labels[lid] || ttColor(c.color) || '#4caf8f' });
        });
      }
      S.ttCache = { at: Date.now(), cals: cals.map(c => c.name), calIds: cals.map(c => ({ id: c.id, name: c.name })), events: out, error: null }; save();
      log('TimeTree : ' + out.length + ' événement(s) dans ' + cals.length + ' calendrier(s)');
    } catch (e) {
      S.ttCache = Object.assign({}, S.ttCache || { events: [] }, { error: e.message }); save();
      log('TimeTree', e.message);
    } finally { ttBusy = null; }
  })();
  return ttBusy;
}
// Date « murale » d'un instant dans un fuseau (pour les journées entières)
const ttDay = (ms, tz) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); } catch (e) { return new Date(ms).toISOString().slice(0, 10); } };
function ttExpand(from, to) {
  const res = [];
  for (const e of ((S.ttCache || {}).events || [])) {
    const dur = Math.max(0, e.end - e.start);
    let starts = [e.start];
    const rr = e.rec.filter(x => /^(RRULE|EXDATE|RDATE)/i.test(x));
    if (rr.some(x => /^RRULE/i.test(x))) {
      try {
        const dt = new Date(e.start).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
        const set = rrulestr('DTSTART:' + dt + '\n' + rr.join('\n'), { forceset: true });
        starts = set.between(new Date(from - dur - 864e5), new Date(to + 864e5), true).map(d => +d);
      } catch (er) { starts = [e.start]; }
    }
    for (const s of starts.slice(0, 400)) {
      if (s + dur < from - 864e5 || s > to + 864e5) continue;
      res.push(e.allDay
        ? { id: e.id + ':' + s, uuid: e.id, calId: e.calId, recurring: starts.length > 1 || e.rec.some(x => /^RRULE/i.test(x)), cal: e.cal, title: e.title, allDay: true, date: ttDay(s, e.tz), endDate: ttDay(s + dur, e.tz), location: e.location, note: e.note, color: e.color }
        : { id: e.id + ':' + s, uuid: e.id, calId: e.calId, recurring: e.rec.some(x => /^RRULE/i.test(x)), cal: e.cal, title: e.title, allDay: false, start: s, end: s + dur, location: e.location, note: e.note, color: e.color });
    }
  }
  return res;
}

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
  if (!S.gmail || gPaused()) return [];
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
      if (S.contacts && S.contacts.list) addContact(h('From'), Date.now());
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
      if (sig && (sig !== S.seen.sweepSig || Date.now() - (S.seen.sweepAt || 0) > 6 * 3600e3)) {
        S.seen.sweepAt = Date.now();
        try {
          const n = await sweepInbox(client, targets);
          S.seen.sweepSig = sig;
          if (n) log('Free : ' + n + ' mail(s) d’expéditeurs bloqués rangés dans ' + BLOCK_LABEL);
        } catch (e) { log('nettoyage Free', e.message); }
      }
      const toBlock = [], toFile = {};
      if (fresh.length) {
        for await (const m of client.fetch(fresh, { envelope: true }, { uid: true })) {
          const f = addr(m.envelope.from);
          if (isBlocked(f.email, targets, f.name)) { toBlock.push(m.uid); continue; }
          const rule = (S.rules || []).find(r => f.email && isBlocked(f.email, [r.from]));
          if (rule) { (toFile[rule.folder] = toFile[rule.folder] || []).push(m.uid); }
          out.push({ acc: 'free', from: f.name || f.email, subject: m.envelope.subject || '(sans objet)', url: C.appUrl + '#/free/INBOX/' + m.uid });
        }
      }
      for (const [folder, uids] of Object.entries(toFile)) { try { await ensureFolder(client, folder); await client.messageMove(uids, folder, { uid: true }); } catch (e) { log('règle Free', folder, e.message); } }
      if (toBlock.length) {
        await client.messageFlagsAdd(toBlock, ['\\Seen'], { uid: true });
        await client.messageMove(toBlock, await blockPath(client), { uid: true });
      }
      const st = await client.status('INBOX', { unseen: true, messages: true, uidNext: true, highestModseq: true });
      S.badge.free = st.unseen || 0;
      freeSig = [st.messages, st.uidNext, st.unseen, st.highestModseq].join(':');
    } finally { lock.release(); }
    try { const n = await sweepJunk(client); if (n) log('Free : ' + n + ' spam(s) regroupé(s) dans ' + BLOCK_LABEL); } catch (e) { log('spam Free', e.message); }
    return out;
  });
}
const RELAY_V = '4.11.1';
/* ---------- Index de la réception : source unique pour l'appli ----------
   Le relais tient la liste à jour (Gmail + Free) et l'appli la lit en un seul appel ; quand quelque chose change
   (nouveau mail, lu, supprimé, ailleurs ou dans l'appli), le numéro de version change et l'appli est prévenue tout de suite. */
const IX = { v: 1, at: 0, g: [], gNext: null, gHist: null, f: [], fMore: false, fBefore: 0, fSig: '', badge: '', err: {} };
let ixWaiters = [], freeSig = '';
const gMeta = new Map();
const trimThread = t => ({ id: t.id, historyId: t.historyId, messages: (t.messages || []).map((m, i, a) => ({ id: m.id, threadId: m.threadId, labelIds: m.labelIds || [], internalDate: m.internalDate, sizeEstimate: m.sizeEstimate,
  snippet: i === a.length - 1 ? m.snippet : '', payload: { mimeType: (m.payload || {}).mimeType, headers: ((m.payload || {}).headers || []).filter(h => /^(from|to|subject|cc|date)$/i.test(h.name)) } })) });
async function ixGmail(force) {
  if (!S.gmail || gPaused()) return false;
  const prof = await gapi('profile');
  if (!force && prof && prof.historyId === IX.gHist && IX.g.length) return false;
  const primary = !!(S.prefs && S.prefs.primaryOnly);
  const p1 = new URLSearchParams({ maxResults: 30 }); if (primary) p1.set('q', 'in:inbox category:primary'); else p1.set('labelIds', 'INBOX');
  const p2 = new URLSearchParams({ q: 'in:inbox is:unread' + (primary ? ' category:primary' : ''), maxResults: 50 });
  const [a, b] = await Promise.all([gapi('threads?' + p1), gapi('threads?' + p2)]);
  const list = [], seen = new Set();
  for (const t of ((a && a.threads) || []).concat((b && b.threads) || [])) if (!seen.has(t.id)) { seen.add(t.id); list.push(t); }
  const out = [];
  for (let i = 0; i < list.length; i += 6) await Promise.all(list.slice(i, i + 6).map(async t => {
    const c = gMeta.get(t.id);
    if (c && c.h === t.historyId) { out.push(c.t); return; }
    const full = await gapi('threads/' + t.id + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Cc&metadataHeaders=Date');
    if (!full) return;
    const tr = trimThread(full); gMeta.set(t.id, { h: t.historyId, t: tr }); out.push(tr);
  }));
  if (gMeta.size > 2000) [...gMeta.keys()].slice(0, 500).forEach(k => gMeta.delete(k));
  IX.g = out; IX.gNext = (a && a.nextPageToken) || null; IX.gHist = prof && prof.historyId;
  return true;
}
async function ixFree(force) {
  if (!S.free) { if (IX.f.length) { IX.f = []; return true; } return false; }
  if (!force && freeSig && freeSig === IX.fSig && IX.f.length) return false;
  const [r, u] = await Promise.all([freeList('INBOX', false, 0, 30), freeList('INBOX', true, 0, 40)]);
  const m = new Map(); r.items.concat(u.items).forEach(x => m.set(x.uid, x));
  IX.f = [...m.values()].sort((x, y) => y.date - x.date);
  IX.fMore = r.more; IX.fBefore = r.items.length ? Math.min(...r.items.map(x => x.uid)) : 0; IX.fSig = freeSig;
  return true;
}
async function ixRefresh(force) {
  let ch = false;
  try { if (await ixGmail(force)) ch = true; delete IX.err.gmail; } catch (e) { IX.err.gmail = e.message; }
  try { if (await ixFree(force)) ch = true; delete IX.err.free; } catch (e) { IX.err.free = e.message; }
  const bs = S.badge.gmail + '/' + S.badge.free;
  if (bs !== IX.badge) { IX.badge = bs; ch = true; }
  if (ch) { IX.v++; IX.at = Date.now(); const w = ixWaiters; ixWaiters = []; w.forEach(f => f()); }
  return ch;
}
const ixOut = () => ({ gReady: !S.gmail || !!IX.gHist, fReady: !S.free || !!IX.fSig || IX.f.length > 0, v: IX.v, at: IX.at, g: IX.g, gNext: IX.gNext, f: IX.f, fMore: IX.fMore, fBefore: IX.fBefore, badge: { gmail: S.badge.gmail, free: S.badge.free, total: total() }, err: IX.err, gmail: !!S.gmail, free: !!S.free });
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
/* ---------- Carnet des correspondants (pour « tous les échanges avec … ») ---------- */
const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function addContact(raw, ts) {
  const m = String(raw || '').match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/) || [null, '', raw];
  const email = String(m[2] || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
  const me = [S.gmail && S.gmail.email, S.free && S.free.user].filter(Boolean).map(x => x.toLowerCase());
  if (me.includes(email) || /no-?reply|ne-?pas-?repondre|mailer-daemon|notification/i.test(email)) return;
  const c = S.contacts.list[email] || (S.contacts.list[email] = { n: '', c: 0, t: 0 });
  if (m[1] && m[1].trim() && !c.n) c.n = m[1].trim().slice(0, 80);
  c.c++; c.t = Math.max(c.t, ts || 0);
}
let contactsBusy = false;
let contactsRetryAt = 0;
async function buildContacts() {
  // Lecture lourde (jusqu'à 3 000 en-têtes) : jamais pendant une pause Gmail, et pas plus d'un essai par demi-heure après un échec
  if (contactsBusy || gPaused() || Date.now() < contactsRetryAt) return; contactsBusy = true;
  const old = S.contacts;
  S.contacts = { list: {}, at: 0 };
  try {
    if (S.gmail) {
      for (const [q, hs] of [['in:sent', ['To', 'Cc']], ['-in:sent -category:promotions -category:social', ['From']]]) {
        let ids = [], page = null;
        do { const r = (await gapi('messages?' + new URLSearchParams(Object.assign({ q, maxResults: 500 }, page ? { pageToken: page } : {})))) || {}; ids.push(...(r.messages || []).map(m => m.id)); page = r.nextPageToken; } while (page && ids.length < 1500);
        for (let i = 0; i < ids.length; i += 4) {
          if (gPaused()) throw new Error('Gmail en pause, carnet repoussé');
          await Promise.all(ids.slice(i, i + 4).map(id => gapi('messages/' + id + '?format=metadata' + hs.map(h => '&metadataHeaders=' + h).join('')).then(m => {
            (m.payload.headers || []).forEach(h => String(h.value).split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).forEach(a => addContact(a, +m.internalDate)));
          }).catch(() => {})));
          await pause(150);
        }
      }
    }
    if (S.free) await withImap(async client => {
      const f = await folders(client);
      for (const folder of (f.all || []).filter(x => !(x.flags && x.flags.has('\\Noselect')) && ![f.trash, f.junk, BLOCK_LABEL].includes(x.path)).map(x => x.path).slice(0, 40)) {
        let lock; try { lock = await client.getMailboxLock(folder); } catch (e) { continue; }
        try {
          const n = client.mailbox.exists || 0; if (!n) continue;
          for await (const m of client.fetch(Math.max(1, n - 1500) + ':*', { envelope: true, internalDate: true })) {
            const e = m.envelope || {}, ts = +new Date(m.internalDate || e.date);
            (folder === f.sent ? (e.to || []).concat(e.cc || []) : (e.from || [])).forEach(a => addContact((a.name ? '"' + a.name + '" ' : '') + '<' + a.address + '>', ts));
          }
        } finally { lock.release(); }
      }
    });
    S.contacts.at = Date.now(); save();
    log('carnet des correspondants : ' + Object.keys(S.contacts.list).length + ' adresses');
  } catch (e) {
    log('carnet', e.message);
    // échec : on garde l'ancien carnet plutôt qu'un carnet vide, nouvel essai dans 30 min
    if (old && old.at) S.contacts = old;
    contactsRetryAt = Date.now() + 30 * 60000;
  }
  finally { contactsBusy = false; }
}
function findContacts(q) {
  const STOP = new Set(['les', 'des', 'du', 'de', 'la', 'le', 'un', 'une', 'avec', 'mes', 'nos', 'mon', 'ma', 'tous', 'toutes', 'echanges', 'echange', 'mails', 'mail', 'retrouve', 'retrouver', 'moi', 'et', 'en', 'au', 'aux', 'pour', 'chez', 'entre', 'societe', 'entreprise', 'monsieur', 'madame']);
  const words = norm(q).replace(/[^a-z0-9@.\- ]/g, ' ').split(/\s+/).filter(Boolean);
  const out = [];
  for (const [email, c] of Object.entries((S.contacts && S.contacts.list) || {})) {
    const hay = norm(email + ' ' + c.n).replace(/[^a-z0-9]/g, '');
    const hayS = hay.replace(/s/g, '');
    const toks = norm(email + ' ' + c.n).split(/[^a-z0-9]+/);
    let best = 0;
    // fenêtres de 1 à 4 mots consécutifs collés : « aciers du littoral » → « aciersdulittoral »
    for (let i = 0; i < words.length; i++) for (let k = 1; k <= 4 && i + k <= words.length; k++) {
      const win = words.slice(i, i + k);
      if (k === 1 && STOP.has(win[0])) continue;
      const glued = win.join('').replace(/[^a-z0-9]/g, ''), core = win.filter(w => !STOP.has(w)).join('').replace(/[^a-z0-9]/g, '');
      for (const g of [glued, core]) {
        if (g.length >= 5 && hay.includes(g)) best = Math.max(best, g.length);
        // singulier/pluriel : « acier du littoral » doit trouver « lesaciersdulittoral »
        const gs = g.replace(/s/g, '');
        if (gs.length >= 6 && hayS.includes(gs)) best = Math.max(best, gs.length - 1);
      }
      if (k === 1 && win[0].length >= 3 && toks.includes(win[0])) best = Math.max(best, win[0].length + 3);
    }
    if (best) out.push({ email, name: c.n, count: c.c, last: c.t, score: best });
  }
  return out.sort((a, b) => (b.score - a.score) || (b.count - a.count)).slice(0, 8);
}

/* ---------- Tâches (rappels) et mails mis de côté ---------- */
const SNOOZE = 'Mis de côté';
async function gLabelId(name) {
  const all = ((await gapi('labels')) || {}).labels || [];
  const l = all.find(x => x.name === name);
  return l ? l.id : (await gapi('labels', { method: 'POST', body: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' } })).id;
}
async function snooze(b) {
  const until = +b.until;
  if (!until || until < Date.now()) throw Object.assign(new Error('Date invalide'), { code: 400 });
  const item = { id: crypto.randomBytes(6).toString('hex'), acc: b.acc, until, subject: String(b.subject || '').slice(0, 200), from: String(b.from || '').slice(0, 120) };
  if (b.acc === 'gmail') {
    const lab = await gLabelId(SNOOZE);
    await gapi('threads/' + encodeURIComponent(b.threadId) + '/modify', { method: 'POST', body: { addLabelIds: [lab], removeLabelIds: ['INBOX', 'UNREAD'] } });
    item.threadId = b.threadId;
  } else {
    const r = await withImap(async client => {
      const folder = await resolveFolder(client, b.folder || 'INBOX');
      await ensureFolder(client, SNOOZE);
      const lock = await client.getMailboxLock(folder);
      try { await client.messageFlagsAdd([+b.uid], ['\\Seen'], { uid: true }); return await client.messageMove([+b.uid], SNOOZE, { uid: true }); } finally { lock.release(); }
    });
    const nu = r && r.uidMap ? r.uidMap.get(+b.uid) : null;
    if (!nu) throw new Error('Déplacement impossible');
    item.uid = nu;
  }
  S.snoozed = (S.snoozed || []).concat(item); save();
  return { ok: true, id: item.id };
}
async function unsnooze(item) {
  if (item.acc === 'gmail') {
    const lab = await gLabelId(SNOOZE);
    await gapi('threads/' + encodeURIComponent(item.threadId) + '/modify', { method: 'POST', body: { addLabelIds: ['INBOX', 'UNREAD'], removeLabelIds: [lab] } });
  } else {
    await withImap(async client => {
      const lock = await client.getMailboxLock(SNOOZE);
      try {
        await client.messageFlagsRemove([item.uid], ['\\Seen'], { uid: true });
        const r = await client.messageMove([item.uid], 'INBOX', { uid: true });
        const nu = r && r.uidMap ? r.uidMap.get(item.uid) : null;
        if (nu) S.seen.freeUid = Math.max(S.seen.freeUid || 0, nu);
      } finally { lock.release(); }
    });
  }
}
/* ---------- Envoi programmé et rappel « pas de réponse » ---------- */
const SCHED_DIR = path.join(C.dataDir, 'sched');
async function gSendRaw(rawB64u, threadId) {
  if (rawB64u.length < 4500000) return gapi('messages/send', { method: 'POST', body: threadId ? { raw: rawB64u, threadId } : { raw: rawB64u } });
  const t = await gmailToken(), bd = 'mb' + crypto.randomBytes(8).toString('hex');
  const mime = Buffer.from(rawB64u.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const body = Buffer.concat([Buffer.from('--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(threadId ? { threadId } : {}) + '\r\n--' + bd + '\r\nContent-Type: message/rfc822\r\n\r\n'), mime, Buffer.from('\r\n--' + bd + '--')]);
  const r = await fetch('https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart', { method: 'POST', headers: { Authorization: 'Bearer ' + t.access_token, 'Content-Type': 'multipart/related; boundary=' + bd }, body });
  if (!r.ok) throw new Error('Gmail ' + r.status);
  return r.json();
}
function addFollow(f) {
  const days = Math.min(Math.max(+f.days || 0, 0), 60);
  if (!days) return null;
  const it = { id: crypto.randomBytes(6).toString('hex'), acc: f.acc === 'free' ? 'free' : 'gmail', sentAt: +f.sentAt || Date.now(), due: (+f.sentAt || Date.now()) + days * 864e5, days,
    to: String(f.to || '').slice(0, 300), toEmail: String(f.toEmail || '').toLowerCase().slice(0, 200), subject: String(f.subject || '').slice(0, 200), threadId: f.threadId || null, messageId: f.messageId || null };
  S.follows = (S.follows || []).concat(it); save();
  return it;
}
async function sendScheduled(it) {
  const job = JSON.parse(dec(fs.readFileSync(path.join(SCHED_DIR, it.id), 'utf8')));
  let threadId = null, messageId = null;
  if (it.acc === 'gmail') { const r = await gSendRaw(job.raw, job.threadId); threadId = r && r.threadId; }
  else { const r = await freeSend(job.free); messageId = r.id; }
  try { fs.unlinkSync(path.join(SCHED_DIR, it.id)); } catch (e) {}
  if (it.followDays) addFollow({ acc: it.acc, days: it.followDays, sentAt: Date.now(), to: it.to, toEmail: it.toEmail, subject: it.subject, threadId, messageId });
  log('Envoi programmé parti : ' + it.subject);
}
// A-t-on reçu une réponse depuis l'envoi ?
async function hasReply(f) {
  if (f.acc === 'gmail' && f.threadId) {
    const t = await gapi('threads/' + encodeURIComponent(f.threadId) + '?format=metadata&metadataHeaders=From');
    const me = (S.gmail.email || '').toLowerCase();
    return ((t && t.messages) || []).some(m => +m.internalDate > f.sentAt + 1000 && !(((m.payload.headers || []).find(h => h.name.toLowerCase() === 'from') || {}).value || '').toLowerCase().includes(me));
  }
  if (f.acc === 'free') return withImap(async client => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const crit = f.messageId ? { or: [{ header: { 'in-reply-to': f.messageId } }, { header: { references: f.messageId } }] } : { from: f.toEmail };
      const uids = (await client.search(Object.assign({ since: new Date(f.sentAt - 864e5) }, crit), { uid: true })) || [];
      return uids.length > 0;
    } finally { lock.release(); }
  });
  return true;
}
/* ---------- Ménage IA ----------
   Lit l'en-tête de tous les mails (pas le contenu), regroupe par expéditeur, demande à l'IA lesquels sont de la pub sans intérêt,
   puis range les mails choisis dans le dossier « Ménage IA » (rien n'est supprimé sans action de l'utilisateur).
   Jamais proposés : pièces jointes, factures / commandes / billets…, conversations où l'utilisateur a répondu, mails suivis, ses correspondants. */
const MENAGE = 'Ménage IA';
const MENAGE_FILE = path.join(C.dataDir, 'menage.json');
const KEEP_RE = /factur|re[çc]u\b|re[çc]us\b|commande|billet|contrat|devis|invoice|receipt|order|r[ée]servation|booking|livraison|exp[ée]di|relev[ée]|imp[oô]t|attestation|mot de passe|password|\bcode\b|s[ée]curit|rendez-vous|ordonnance|r[ée]sultat|bulletin|avis d.?[ée]ch[ée]ance|[ée]ch[ée]ancier|sinistre|remboursement/i;
let MJ = { status: 'idle' };
try { MJ = JSON.parse(dec(fs.readFileSync(MENAGE_FILE, 'utf8'))); if (MJ.status === 'running') MJ.status = 'idle'; } catch (e) {}
const mjSave = () => { try { fs.writeFileSync(MENAGE_FILE, enc(JSON.stringify(MJ))); } catch (e) { log('ménage IA : sauvegarde', e.message); } };
const mjPublic = () => { const o = Object.assign({}, MJ); delete o.refs; return o; };
async function gWait() { while (gPaused()) await pause(5000); }
async function menageScan() {
  MJ = { status: 'running', phase: 'Préparation', at: Date.now(), g: { done: 0, total: 0 }, f: { done: 0, total: 0 }, scanned: 0, excluded: 0 };
  const groups = new Map(), sentTo = new Set(), sentThreads = new Set();
  const BASEQ_G = '-in:sent -in:drafts -in:trash -in:spam -is:starred -has:attachment -label:"' + MENAGE + '" -label:"' + BLOCK_LABEL + '" -subject:(facture OR reçu OR commande OR billet OR contrat OR devis OR invoice OR receipt OR réservation OR livraison OR relevé OR impôts OR attestation OR remboursement)';
  const keyOf = (name, email) => { const n = normName(name); return n && n.length >= 3 && !n.includes('@') ? 'n:' + n : 'e:' + email; };
  const add = (name, email, subject, unsub, ref) => {
    email = String(email || '').toLowerCase(); if (!email) return;
    const k = keyOf(name, email);
    let g = groups.get(k); if (!g) { g = { key: k, name: name || email, emails: new Set(), count: 0, kept: 0, subjects: [], unsub: false, g: [], f: {} }; groups.set(k, g); }
    g.emails.add(email);
    if (KEEP_RE.test(subject || '')) { g.kept++; MJ.excluded++; return; }
    g.count++; if (unsub) g.unsub = true;
    if (g.subjects.length < 6 && subject && !g.subjects.includes(subject)) g.subjects.push(String(subject).slice(0, 90));
    if (ref.gs) g.gs = (g.gs || 0) + 1; else if (ref.g) g.g.push(ref.g); else (g.f[ref.folder] = g.f[ref.folder] || []).push(ref.uid);
  };
  try {
    if (S.gmail) {
      MJ.phase = 'Gmail : mes envois';
      let page = null, sentIds = [];
      do { await gWait(); const r = (await gapi('messages?' + new URLSearchParams(Object.assign({ q: 'in:sent', maxResults: 500 }, page ? { pageToken: page } : {})))) || {}; (r.messages || []).forEach(m => { sentThreads.add(m.threadId); sentIds.push(m.id); }); page = r.nextPageToken; } while (page && sentIds.length < 20000);
      for (let i = 0; i < Math.min(sentIds.length, 800); i += 4) {
        await gWait(); MJ.phase = 'Gmail : mes envois (' + i + ' / ' + Math.min(sentIds.length, 800) + ')';
        await Promise.all(sentIds.slice(i, i + 4).map(id => gapi('messages/' + id + '?format=metadata&metadataHeaders=To&metadataHeaders=Cc').then(m => ((m && m.payload.headers) || []).forEach(h => String(h.value).split(',').forEach(a => { const x = addr(a.trim()); if (x.email) sentTo.add(x.email.toLowerCase()); }))).catch(() => {})));
        await pause(260);
      }
      // Gmail limite fortement la lecture mail par mail : on lit un échantillon (les 2 500 plus récents) pour découvrir les expéditeurs,
      // puis, pour ceux que l'IA juge sans intérêt, on récupère tous leurs mails d'un coup par une recherche « from: » (très rapide)
      MJ.phase = 'Gmail : liste des mails';
      const BASEQ = BASEQ_G;
      const ids = []; page = null;
      do {
        await gWait();
        const r = (await gapi('messages?' + new URLSearchParams(Object.assign({ q: BASEQ, maxResults: 500 }, page ? { pageToken: page } : {})))) || {};
        (r.messages || []).forEach(m => { if (sentThreads.has(m.threadId)) MJ.excluded++; else ids.push(m.id); });
        page = r.nextPageToken; MJ.gAll = ids.length;
      } while (page && ids.length < 80000);
      const sample = ids.slice(0, 2500);
      MJ.g.total = sample.length; MJ.phase = 'Gmail : expéditeurs (échantillon des ' + sample.length + ' plus récents)';
      for (let i = 0; i < sample.length; i += 4) {
        await gWait();
        await Promise.all(sample.slice(i, i + 4).map(id => gapi('messages/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=List-Unsubscribe').then(m => {
          if (!m) return;
          const h = n => ((m.payload.headers || []).find(x => x.name.toLowerCase() === n) || {}).value || '';
          const f = addr(h('from'));
          if (sentTo.has(String(f.email).toLowerCase())) { MJ.excluded++; return; }
          add(f.name, f.email, h('subject'), !!h('list-unsubscribe'), { gs: m.id });
        }).catch(() => {})));
        MJ.g.done = Math.min(i + 4, sample.length); MJ.scanned = MJ.g.done + MJ.f.done;
        await pause(260);
      }
    }
    if (S.free) {
      MJ.phase = 'Free : lecture des dossiers';
      await withImap(async client => {
        const fo = await folders(client), dest = await blockPath(client);
        const boxes = (await client.list()).filter(m => !(m.flags && m.flags.has('\\Noselect')) && ![fo.sent, fo.trash, fo.drafts, fo.junk, dest, MENAGE].includes(m.path));
        for (const b of boxes) {
          let lock = null;
          try {
            lock = await client.getMailboxLock(b.path);
            if (!client.mailbox.exists) continue;
            MJ.f.total += client.mailbox.exists;
            for await (const m of client.fetch('1:*', { uid: true, envelope: true, flags: true, bodyStructure: true, headers: ['list-unsubscribe'] }, { uid: true })) {
              MJ.f.done++; MJ.scanned = MJ.g.done + MJ.f.done;
              const f = addr(m.envelope.from), fl = m.flags || new Set();
              const att = JSON.stringify(m.bodyStructure || {}).match(/"disposition":"attachment"|"type":"application\/pdf"|"type":"image\//i);
              if (fl.has('\\Flagged') || fl.has('\\Answered') || att || sentTo.has(String(f.email).toLowerCase())) { MJ.excluded++; continue; }
              add(f.name, f.email, m.envelope.subject, /list-unsubscribe/i.test(String(m.headers || '')), { folder: b.path, uid: m.uid });
            }
          } catch (e) { log('ménage IA ' + b.path, e.message); } finally { if (lock) lock.release(); }
        }
      });
    }
    // Les expéditeurs rares (moins de 3 mails) sont souvent des personnes : on ne les propose pas
    const cands = [...groups.values()].filter(g => g.count + (g.gs || 0) >= 2 && (g.count >= 3 || (g.gs || 0) >= 2 || g.unsub)).sort((a, b) => (b.count + (b.gs || 0) * 10) - (a.count + (a.gs || 0) * 10)).slice(0, 600);
    // count : mails Free + mails Gmail de l'échantillon, en attendant le décompte complet Gmail ci-dessous
    cands.forEach(g => { g.count += g.gs || 0; });
    MJ.phase = 'L’IA examine ' + cands.length + ' expéditeurs';
    const verdict = new Map();
    for (let i = 0; i < cands.length; i += 25) {
      const part = cands.slice(i, i + 25);
      try {
        const r = await aiCall('Tu fais le ménage dans la messagerie personnelle de Samuel. Pour chaque expéditeur (nom, adresse, nombre de mails, lien de désabonnement, objets récents), réponds "virer" si ce sont des publicités, promotions, newsletters commerciales ou notifications sans valeur durable ; "garder" si cela peut avoir une utilité : banque, assurance, administration, impôts, santé, travail, école, association, personnes, voyages, services dont il est client et qui envoient des informations utiles. En cas de doute : garder. Réponds UNIQUEMENT en JSON {"items":[{"i":numéro,"v":"virer"|"garder","why":"6 mots max"}]}.',
          part.map((g, j) => j + '. ' + g.name + ' <' + [...g.emails].slice(0, 2).join(', ') + '> · ' + g.count + ' mails' + (g.unsub ? ' · désabonnement' : '') + ' · objets : ' + g.subjects.slice(0, 5).join(' | ')).join('\n'), 1800);
        (r.items || []).forEach(x => { const g = part[x.i]; if (g) verdict.set(g.key, { v: x.v === 'virer' ? 'virer' : 'garder', why: String(x.why || '').slice(0, 60) }); });
      } catch (e) { log('ménage IA : avis', e.message); }
      MJ.phase = 'L’IA examine ' + cands.length + ' expéditeurs (' + Math.min(i + 25, cands.length) + ')';
    }
    // Décompte complet Gmail des expéditeurs à virer : une recherche par adresse, mêmes garde-fous que plus haut
    if (S.gmail) {
      const vir = cands.filter(g => (verdict.get(g.key) || {}).v === 'virer');
      let k = 0;
      for (const g of vir) {
        MJ.phase = 'Gmail : décompte complet (' + (++k) + ' / ' + vir.length + ' expéditeurs)';
        const before = g.count; g.count -= g.gs || 0;
        for (const em of [...g.emails].slice(0, 8)) {
          let pg = null;
          do {
            await gWait();
            const r = (await gapi('messages?' + new URLSearchParams(Object.assign({ q: 'from:' + em + ' ' + BASEQ_G, maxResults: 500 }, pg ? { pageToken: pg } : {}))).catch(() => null)) || {};
            (r.messages || []).forEach(m => { if (!sentThreads.has(m.threadId)) g.g.push(m.id); });
            pg = r.nextPageToken;
          } while (pg && g.g.length < 20000);
        }
        g.g = [...new Set(g.g)]; g.count += g.g.length;
        if (!g.count) g.count = before;
        await pause(150);
      }
    }
    MJ.refs = {};
    MJ.groups = cands.map(g => { const v = verdict.get(g.key) || { v: 'garder', why: 'non examiné' }; MJ.refs[g.key] = { g: g.g, f: g.f };
      return { key: g.key, name: g.name, emails: [...g.emails].slice(0, 5), count: g.count, kept: g.kept, unsub: g.unsub, subjects: g.subjects.slice(0, 3), v: v.v, why: v.why, gCount: g.g.length, fCount: Object.values(g.f).reduce((a, x) => a + x.length, 0) }; });
    MJ.status = 'done'; MJ.end = Date.now(); MJ.phase = 'Terminé';
    const n = MJ.groups.filter(g => g.v === 'virer').reduce((a, g) => a + g.count, 0);
    log('Ménage IA : ' + MJ.scanned + ' mails lus, ' + n + ' proposés au ménage');
    if (S.subs.length) push({ title: '✦ Ménage IA terminé', body: n + ' mails de pub proposés au ménage. Ouvre l’appli pour vérifier.', url: C.appUrl + '#/menage', tag: 'mailbox-menage', badge: total() }).catch(() => {});
  } catch (e) { MJ.status = 'error'; MJ.error = e.message; log('Ménage IA', e.message); }
  mjSave();
}
async function menageApply(keys) {
  const out = { gmail: 0, free: 0 };
  const sel = (MJ.groups || []).filter(g => keys.includes(g.key));
  const gIds = [].concat(...sel.map(g => (MJ.refs[g.key] || {}).g || []));
  if (S.gmail && gIds.length) {
    const labels = ((await gapi('labels')) || {}).labels || [];
    let lab = labels.find(l => l.name === MENAGE);
    if (!lab) lab = await gapi('labels', { method: 'POST', body: { name: MENAGE, labelListVisibility: 'labelShow', messageListVisibility: 'show' } });
    const userLabs = labels.filter(l => l.type === 'user' && l.id !== lab.id).map(l => l.id);
    for (let i = 0; i < gIds.length; i += 1000) {
      const ids = gIds.slice(i, i + 1000);
      await gWait();
      await gapi('messages/batchModify', { method: 'POST', body: { ids, addLabelIds: [lab.id], removeLabelIds: ['INBOX', 'UNREAD'] } });
      for (let j = 0; j < userLabs.length; j += 40) await gapi('messages/batchModify', { method: 'POST', body: { ids, removeLabelIds: userLabs.slice(j, j + 40) } });
      out.gmail += ids.length;
    }
  }
  if (S.free) await withImap(async client => {
    await ensureFolder(client, MENAGE);
    const byFolder = {};
    sel.forEach(g => Object.entries((MJ.refs[g.key] || {}).f || {}).forEach(([fd, uids]) => { byFolder[fd] = (byFolder[fd] || []).concat(uids); }));
    for (const [fd, uids] of Object.entries(byFolder)) {
      let lock = null;
      try { lock = await client.getMailboxLock(fd); for (let i = 0; i < uids.length; i += 500) { await client.messageFlagsAdd(uids.slice(i, i + 500), ['\\Seen'], { uid: true }); await client.messageMove(uids.slice(i, i + 500), MENAGE, { uid: true }); } out.free += uids.length; }
      catch (e) { log('Ménage IA : déplacement ' + fd, e.message); } finally { if (lock) lock.release(); }
    }
  });
  sel.forEach(g => { g.applied = true; delete MJ.refs[g.key]; });
  MJ.applied = (MJ.applied || 0) + out.gmail + out.free; mjSave();
  log('Ménage IA : ' + (out.gmail + out.free) + ' mails rangés dans « ' + MENAGE + ' »');
  poll().catch(() => {});
  return out;
}
async function menageEmpty() {
  const out = { gmail: 0, free: 0 };
  if (S.gmail) {
    const lab = ((((await gapi('labels')) || {}).labels) || []).find(l => l.name === MENAGE);
    if (lab) { let page = null; do { const r = (await gapi('messages?' + new URLSearchParams(Object.assign({ labelIds: lab.id, maxResults: 500 }, page ? { pageToken: page } : {})))) || {}; const ids = (r.messages || []).map(m => m.id); if (ids.length) { await gapi('messages/batchModify', { method: 'POST', body: { ids, addLabelIds: ['TRASH'], removeLabelIds: [lab.id] } }); out.gmail += ids.length; } page = r.nextPageToken; } while (page); }
  }
  if (S.free) await withImap(async client => {
    const fo = await folders(client); let lock = null;
    try { lock = await client.getMailboxLock(MENAGE); if (client.mailbox.exists) { out.free = client.mailbox.exists; await client.messageMove('1:*', fo.trash); } } catch (e) {} finally { if (lock) lock.release(); }
  });
  log('Ménage IA : dossier vidé (' + (out.gmail + out.free) + ' mails à la corbeille)');
  return out;
}
async function checkTimers() {
  const now = Date.now();
  for (const it of (S.scheduled || []).filter(x => x.at <= now && !x.failed)) {
    try { await sendScheduled(it); S.scheduled = S.scheduled.filter(x => x.id !== it.id); save(); }
    catch (e) { it.tries = (it.tries || 0) + 1; log('envoi programmé', e.message); if (it.tries >= 5) { it.failed = e.message; if (S.subs.length) await push({ title: '⚠️ Envoi programmé échoué', body: it.subject + ' : ' + e.message, url: C.appUrl + '#/scheduled', tag: 'mailbox-sched-' + it.id, badge: total() }).catch(() => {}); } save(); }
  }
  for (const f of (S.follows || []).filter(x => x.due <= now && !x.done)) {
    let replied = false;
    try { replied = await hasReply(f); } catch (e) { log('rappel sans réponse', e.message); continue; }
    f.done = true; f.replied = replied; f.checkedAt = now; save();
    if (!replied && S.subs.length) await push({ title: '⏳ Pas de réponse de ' + (f.to || f.toEmail || 'ton destinataire'), body: f.subject + ' · envoyé il y a ' + f.days + ' j', url: C.appUrl + (f.acc === 'gmail' && f.threadId ? '#/thread/' + f.threadId : '#/waiting'), tag: 'mailbox-follow-' + f.id, badge: total() }).catch(() => {});
  }
  S.follows = (S.follows || []).filter(x => !x.done || now - x.checkedAt < 14 * 864e5);
  for (const it of (S.snoozed || []).filter(x => x.until <= now)) {
    try { await unsnooze(it); } catch (e) { log('remise en réception', e.message); }
    S.snoozed = S.snoozed.filter(x => x.id !== it.id); save();
    if (S.subs.length && !isQuiet()) await push({ title: '↩︎ ' + (it.from || 'Mail') + ' revient', body: it.subject, url: C.appUrl + (it.acc === 'gmail' ? '#/thread/' + it.threadId : '#/list/INBOX'), tag: 'mailbox-snooze-' + it.id, badge: total(), silent: !!(S.prefs && S.prefs.silent) });
  }
  for (const t of (S.tasks || []).filter(x => !x.done && x.due && !x.notified && x.due <= now)) {
    t.notified = true; save();
    if (S.subs.length) await push({ title: '⏰ ' + t.title, body: t.ref && t.ref.subject ? (t.ref.from ? t.ref.from + ' · ' : '') + t.ref.subject : 'Tâche à faire', url: C.appUrl + '#/tasks', tag: 'mailbox-task-' + t.id, badge: total(), silent: false });
  }
}
async function pollOnce() {
  if (polling) return; polling = true;
  try { await checkTimers(); } catch (e) { log('rappels', e.message); }
  try {
    const before = total();
    const news = [];
    try { news.push(...await pollGmail()); } catch (e) { log('poll Gmail', e.message); }
    try { news.push(...await pollFree()); } catch (e) { log('poll Free', e.message); }
    await ixRefresh().catch(e => log('index réception', e.message));
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
  'POST /timetree/account': async (q, b) => {
    const user = String(b.email || '').trim().toLowerCase();
    if (!user || !b.password) throw Object.assign(new Error('Mail et mot de passe TimeTree requis'), { code: 400 });
    ttSess = await ttLogin(user, b.password);
    S.timetree = { user, pass: enc(b.password) }; S.ttCache = null; save();
    await ttSync();
    return { ok: true, email: user, events: ((S.ttCache || {}).events || []).length, cals: (S.ttCache || {}).cals || [], error: (S.ttCache || {}).error || null };
  },
  'DELETE /timetree/account': async () => { S.timetree = null; S.ttCache = null; ttSess = null; save(); return { ok: true }; },
  // Création d'un événement dans un calendrier TimeTree (uniquement sur demande explicite depuis l'app)
  'POST /timetree/event': async (q, b) => {
    if (!S.timetree) throw Object.assign(new Error('TimeTree non connecté'), { code: 400 });
    if (!(S.ttCache || {}).calIds) await ttSync();
    const cal = ((S.ttCache || {}).calIds || []).find(c => String(c.id) === String(b.cal));
    if (!cal) throw Object.assign(new Error('Calendrier TimeTree inconnu'), { code: 400 });
    const title = String(b.title || '').trim().slice(0, 200);
    if (!title) throw Object.assign(new Error('Titre manquant'), { code: 400 });
    let start_at, end_at, tz = String(b.tz || 'UTC');
    if (b.allDay) {
      const [y1, m1, d1] = String(b.date).split('-').map(Number), [y2, m2, d2] = String(b.endDate || b.date).split('-').map(Number);
      start_at = Date.UTC(y1, m1 - 1, d1); end_at = Date.UTC(y2, m2 - 1, d2); tz = 'UTC';
    } else { start_at = +b.start; end_at = Math.max(+b.end || 0, start_at); }
    if (!start_at || isNaN(start_at)) throw Object.assign(new Error('Date invalide'), { code: 400 });
    const r = await ttCreate(cal.id, { title, all_day: !!b.allDay, start_at, start_timezone: tz, end_at, end_timezone: tz, category: 1, note: String(b.note || '').slice(0, 2000), location: String(b.location || '').slice(0, 200), attendees: [], recurrences: [], alerts: [], file_uuids: [] });
    log('TimeTree : événement « ' + title + ' » créé dans ' + cal.name);
    setTimeout(() => ttSync().catch(() => {}), 1500);
    return { ok: true, cal: cal.name, uuid: (r.event || {}).uuid || null };
  },
  'POST /timetree/delete': async (q, b) => {
    if (!S.timetree) throw Object.assign(new Error('TimeTree non connecté'), { code: 400 });
    const ev = ((S.ttCache || {}).events || []).find(e => e.id === b.uuid && String(e.calId) === String(b.cal));
    if (!ev) throw Object.assign(new Error('Événement TimeTree introuvable, actualise l’agenda'), { code: 404 });
    await ttDelete(ev.calId, ev.id);
    S.ttCache.events = S.ttCache.events.filter(e => e !== ev); save();
    log('TimeTree : événement « ' + ev.title + ' » supprimé de ' + ev.cal);
    setTimeout(() => ttSync().catch(() => {}), 1500);
    return { ok: true };
  },
  // Modification d'un événement TimeTree existant (envoi partiel : seuls les champs modifiables)
  'POST /timetree/update': async (q, b) => {
    if (!S.timetree) throw Object.assign(new Error('TimeTree non connecté'), { code: 400 });
    const ev = ((S.ttCache || {}).events || []).find(e => e.id === b.uuid && String(e.calId) === String(b.cal));
    if (!ev) throw Object.assign(new Error('Événement TimeTree introuvable, actualise l’agenda'), { code: 404 });
    const title = String(b.title || '').trim().slice(0, 200);
    if (!title) throw Object.assign(new Error('Titre manquant'), { code: 400 });
    const body = { title, note: String(b.note || '').slice(0, 2000), location: String(b.location || '').slice(0, 200) };
    // Pour une série récurrente, on ne touche pas aux dates (elles déplaceraient toute la série)
    const isRec = (ev.rec || []).some(x => /^RRULE/i.test(x));
    if (!isRec) {
      let start_at, end_at, tz = String(ev.tz || b.tz || 'UTC');
      if (b.allDay) {
        const [y1, m1, d1] = String(b.date).split('-').map(Number), [y2, m2, d2] = String(b.endDate || b.date).split('-').map(Number);
        start_at = Date.UTC(y1, m1 - 1, d1); end_at = Date.UTC(y2, m2 - 1, d2); tz = 'UTC';
      } else { start_at = +b.start; end_at = Math.max(+b.end || 0, start_at); if (tz === 'UTC' && b.tz) tz = String(b.tz); }
      if (!start_at || isNaN(start_at)) throw Object.assign(new Error('Date invalide'), { code: 400 });
      Object.assign(body, { all_day: !!b.allDay, start_at, start_timezone: tz, end_at, end_timezone: tz });
    }
    await ttUpdate(ev.calId, ev.id, body);
    Object.assign(ev, { title: body.title, note: body.note, location: body.location });
    if (body.start_at) Object.assign(ev, { allDay: body.all_day, start: body.start_at, end: body.end_at, tz: body.start_timezone });
    save();
    log('TimeTree : événement « ' + title + ' » modifié dans ' + ev.cal);
    setTimeout(() => ttSync().catch(() => {}), 1500);
    return { ok: true, recurring: isRec };
  },
  'GET /timetree/events': async q => {
    if (!S.timetree) return { enabled: false, items: [] };
    const c = S.ttCache;
    if (!c || !c.at || !c.calIds) await ttSync();
    else if (Date.now() - c.at > 15 * 60000 || q.get('fresh')) ttSync();
    const from = +q.get('from') || Date.now(), to = +q.get('to') || from + 31 * 864e5;
    return { enabled: true, email: S.timetree.user, at: (S.ttCache || {}).at || 0, error: (S.ttCache || {}).error || null, cals: (S.ttCache || {}).cals || [], calIds: (S.ttCache || {}).calIds || [], items: ttExpand(from, to) };
  },
  'GET /health': async () => ({ ok: true, gmail: !!S.gmail, free: !!S.free, subs: S.subs.length }),
  'GET /status': async () => ({ relayVersion: RELAY_V, gmail: S.gmail ? { email: S.gmail.email } : null, free: S.free ? { email: S.free.user, name: S.free.name || '' } : null, subs: S.subs.length, badge: { gmail: S.badge.gmail, free: S.badge.free, total: total() }, vapid: C.vapidPub, ai: !!S.ai, timetree: S.timetree ? { email: S.timetree.user } : null }),
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
  // Réception complète (Gmail + Free) ; avec v=… et wait=1, on attend (25 s max) qu'elle change avant de répondre
  'GET /inbox': async q => {
    if (q.get('fresh')) { await Promise.race([poll().catch(() => {}), new Promise(r => setTimeout(r, 6000))]); }
    else if (!IX.at) { await Promise.race([ixRefresh(true).catch(() => {}), new Promise(r => setTimeout(r, 15000))]); }
    if (q.get('wait') && +q.get('v') === IX.v) await new Promise(r => { ixWaiters.push(r); setTimeout(() => { ixWaiters = ixWaiters.filter(f => f !== r); r(); }, 25000); });
    if (+q.get('v') === IX.v) return { v: IX.v, same: true, badge: { gmail: S.badge.gmail, free: S.badge.free, total: total() } };
    return ixOut();
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
    S.free = { user, pass: enc(b.password), name: (b.name || '').trim() }; S.seen.freeInit = false; S.seen.sweepSig = ''; save(); setTimeout(buildContacts, 3000);
    poll().catch(() => {}); startIdle().catch(() => {});
    return { ok: true, email: user };
  },
  'DELETE /free/account': async () => { S.free = null; S.badge.free = 0; save(); startIdle().catch(() => {}); return { ok: true }; },
  'GET /free/folders': async q => withImap(async c => {
    const f = await folders(c);
    if (q.get('tree') === '1') {
      const list = await c.list();
      const skip = new Set(['INBOX', f.sent, f.trash, f.junk, f.drafts].concat(junkPaths(list)));
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
  'GET /free/search': async q => freeSearch((q.get('q') || '').slice(0, 200), Math.min(+q.get('limit') || 30, 50), q.get('deep') === '1'),
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
  'GET /contacts': async q => {
    if (!S.contacts || !S.contacts.at) { buildContacts(); return { building: true, items: [] }; }
    if (Date.now() - S.contacts.at > 7 * 864e5) buildContacts();
    return { items: findContacts(String(q.get('q') || '').slice(0, 200)) };
  },
  // Correspondants les plus fréquents (carnet bâti à partir des mails), pour l'onglet Contacts
  'GET /contacts/top': async q => {
    if (!S.contacts || !S.contacts.at) { buildContacts(); return { building: true, items: [] }; }
    const n = Math.min(+q.get('n') || 400, 1000);
    return { items: Object.entries(S.contacts.list).map(([email, c]) => ({ email, name: c.n || '', count: c.c, last: c.t })).sort((a, b) => b.count - a.count).slice(0, n) };
  },
  'POST /ai/event': async (q, b) => aiCall('Tu repères un rendez-vous, une réunion, un appel ou un événement daté proposé ou confirmé dans un mail adressé à Samuel. Date du jour : ' + (b.today || '') + '. Réponds UNIQUEMENT en JSON {"found":true|false,"title":"titre court, 6 mots max","start":"AAAA-MM-JJTHH:MM","end":"AAAA-MM-JJTHH:MM ou null","allDay":true|false,"location":"lieu ou visio ou vide","note":"une phrase de contexte"}. Si aucune date ou heure précise n’est proposée, found=false. Si seule la date est connue, allDay=true. Durée par défaut 1 h.', 'Objet : ' + (b.subject || '') + '\nDe : ' + (b.from || '') + '\n\n' + String(b.text || '').slice(0, 6000), 400),
  'GET /tasks': async () => ({ tasks: S.tasks || [] }),
  'POST /tasks': async (q, b) => {
    S.tasks = S.tasks || [];
    let t = b.id ? S.tasks.find(x => x.id === b.id) : null;
    if (!t) { t = { id: crypto.randomBytes(6).toString('hex'), created: Date.now(), done: false }; S.tasks.push(t); }
    if (b.title !== undefined) t.title = String(b.title).slice(0, 200);
    if (b.note !== undefined) t.note = String(b.note).slice(0, 1000);
    if (b.due !== undefined) { const d = +b.due || 0; if (d !== t.due) t.notified = false; t.due = d; }
    if (b.done !== undefined) t.done = !!b.done;
    if (b.ref) t.ref = { acc: b.ref.acc, url: String(b.ref.url || ''), subject: String(b.ref.subject || '').slice(0, 200), from: String(b.ref.from || '').slice(0, 120) };
    if (!t.title) t.title = 'Tâche';
    S.tasks = S.tasks.filter(x => !x.done || x.id === t.id || Date.now() - (x.doneAt || x.created) < 30 * 864e5);
    if (b.done === true) t.doneAt = Date.now();
    save(); return { ok: true, task: t };
  },
  'POST /tasks/delete': async (q, b) => { S.tasks = (S.tasks || []).filter(x => x.id !== b.id); save(); return { ok: true }; },
  'GET /snoozed': async () => ({ items: S.snoozed || [] }),
  // Envoi programmé : le mail (chiffré) attend sur le serveur et part à l'heure dite, même iPhone éteint
  'POST /schedule': async (q, b) => {
    const at = +b.at;
    if (!at || at < Date.now() + 30000) throw Object.assign(new Error('Choisis un moment dans le futur'), { code: 400 });
    const acc = b.acc === 'free' ? 'free' : 'gmail';
    if (acc === 'gmail' && !b.raw) throw Object.assign(new Error('Mail vide'), { code: 400 });
    if (acc === 'free' && !b.free) throw Object.assign(new Error('Mail vide'), { code: 400 });
    const it = { id: crypto.randomBytes(8).toString('hex'), acc, at, to: String(b.to || '').slice(0, 300), toEmail: String(b.toEmail || '').toLowerCase(), subject: String(b.subject || '(sans objet)').slice(0, 200), followDays: Math.min(Math.max(+b.followDays || 0, 0), 60) };
    fs.mkdirSync(SCHED_DIR, { recursive: true });
    fs.writeFileSync(path.join(SCHED_DIR, it.id), enc(JSON.stringify(acc === 'gmail' ? { raw: b.raw, threadId: b.threadId || null } : { free: b.free })));
    S.scheduled = (S.scheduled || []).concat(it); save();
    log('Envoi programmé le ' + new Date(at).toISOString() + ' : ' + it.subject);
    return { ok: true, id: it.id };
  },
  'GET /scheduled': async () => ({ items: (S.scheduled || []).slice().sort((a, b) => a.at - b.at), follows: (S.follows || []).filter(f => !f.done || !f.replied).slice().sort((a, b) => a.due - b.due) }),
  'POST /schedule/cancel': async (q, b) => { S.scheduled = (S.scheduled || []).filter(x => x.id !== b.id); try { fs.unlinkSync(path.join(SCHED_DIR, String(b.id).replace(/[^a-f0-9]/g, ''))); } catch (e) {} save(); return { ok: true }; },
  'POST /schedule/now': async (q, b) => { const it = (S.scheduled || []).find(x => x.id === b.id); if (!it) throw Object.assign(new Error('Introuvable'), { code: 404 }); await sendScheduled(it); S.scheduled = S.scheduled.filter(x => x.id !== it.id); save(); return { ok: true }; },
  'POST /follow': async (q, b) => { const it = addFollow(b); return { ok: true, id: it && it.id }; },
  'POST /follow/cancel': async (q, b) => { S.follows = (S.follows || []).filter(x => x.id !== b.id); save(); return { ok: true }; },
  // Nettoyage par expéditeur : combien de mails, puis tout à la corbeille (Gmail + Free, récupérable 30 jours)
  'GET /sender/count': async q => senderPurge(String(q.get('email') || ''), true),
  'POST /sender/purge': async (q, b) => senderPurge(String(b.email || ''), false),
  'POST /snooze': async (q, b) => snooze(b),
  'POST /snooze/cancel': async (q, b) => { const it = (S.snoozed || []).find(x => x.id === b.id); if (!it) return { ok: true }; await unsnooze(it); S.snoozed = S.snoozed.filter(x => x.id !== it.id); save(); return { ok: true }; },
  'POST /free/rule': async (q, b) => { const from = String(b.from || '').toLowerCase().trim(), folder = String(b.folder || '').trim(); if (!from || !folder) throw Object.assign(new Error('Règle incomplète'), { code: 400 }); S.rules = (S.rules || []).filter(r => r.from !== from).concat({ from, folder }); save(); return { ok: true }; },
  'POST /ai/task': async (q, b) => aiCall('Tu transformes un mail en tâche à faire pour son destinataire (Samuel). Date du jour : ' + (b.today || new Date().toISOString().slice(0, 16)) + '. Réponds UNIQUEMENT en JSON {"title":"verbe à l’infinitif + objet, 8 mots max","due":"AAAA-MM-JJTHH:MM ou null"}. Si le mail fixe une échéance, mets la veille ou le jour même à 9:00 ; sinon null.', 'Objet : ' + (b.subject || '') + '\nDe : ' + (b.from || '') + '\n\n' + String(b.text || '').slice(0, 6000), 400),
  'POST /ai/agenda': async (q, b) => aiCall('Tu es l’assistant de Samuel. Tu fais la synthèse de son agenda pour ' + (b.scope === 'week' ? 'la semaine' : b.scope === 'weekend' ? 'le week-end (samedi et dimanche)' : 'la journée') + ' indiquée, en français, ton direct et utile, phrases courtes, sans tirets cadratins, sans rien inventer (n’utilise que les événements fournis). Chaque ligne numérotée est un événement réel à prendre en compte, y compris les événements sur plusieurs jours (voyage, vacances, déplacement) qui couvrent toute la période et les événements [TimeTree] (agenda familial) : ne dis jamais qu’il n’y a aucun événement si la liste en contient. Repère : les moments chargés, les enchaînements serrés ou chevauchements, les déplacements (lieux différents proches dans le temps), les créneaux libres utiles, ce qu’il faut préparer, et les événements familiaux (calendrier TimeTree). Date et heure actuelles : ' + (b.now || '') + '. Réponds UNIQUEMENT en JSON {"titre":"une phrase d’accroche","resume":"2 à 3 phrases","jours":[{"jour":"lundi 23","points":["…"]}],"attention":["conflits, enchaînements serrés, oublis possibles"],"libre":["créneaux libres notables"],"preparer":["choses à préparer"]}. Pour une journée, jours contient un seul élément. Listes vides si rien.', String(b.text || '').slice(0, 9000), 1400),
  // Accueil « Aujourd'hui » : tri des mails non lus qui demandent une action + résumé de la journée
  'POST /ai/today': async (q, b) => aiCall('Tu prépares l’écran d’accueil du matin de Samuel. Date et heure : ' + String(b.now || '') + '. Parmi les mails non lus fournis, garde UNIQUEMENT ceux qui attendent vraiment une action ou une réponse de Samuel (question, devis, rendez-vous, document à fournir, message personnel d’un proche ou d’un professionnel) ; écarte publicités, newsletters, notifications automatiques, reçus et alertes. 6 au maximum, du plus important au moins important, avec une étiquette courte (1 à 2 mots : Devis, Famille, Rendez-vous, Facture, Travail, Question…). Puis écris un résumé « En bref » de 2 phrases maximum, concret, qui cite les éléments les plus importants de la journée (mails retenus, agenda, relances), sans formule creuse ni tiret cadratin. Si rien d’important, dis-le simplement. Réponds UNIQUEMENT en JSON {"resume":"…","mails":[{"i":numéro,"tag":"…"}]}.',
    'MAILS NON LUS :\n' + (b.mails || []).slice(0, 40).map(x => x.i + '. ' + x.from + (x.email ? ' <' + x.email + '>' : '') + ' · ' + x.subject + ' · ' + String(x.snippet || '').slice(0, 160)).join('\n') + '\n\nAGENDA DU JOUR :\n' + ((b.agenda || []).join('\n') || 'rien') + '\n\nSANS RÉPONSE :\n' + ((b.waiting || []).join('\n') || 'rien'), 900),
  'POST /ai/summary': async (q, b) => aiCall('Tu résumes un mail ou un échange de mails pour Samuel, en français, de façon factuelle (n’invente rien). Date du jour : ' + (b.today || '') + '. Réponds UNIQUEMENT en JSON {"resume":"2 à 3 phrases","points":["…"],"chronologie":[{"date":"JJ/MM","qui":"…","fait":"…"}],"engagements":[{"qui":"…","quoi":"…","quand":"… ou vide"}],"echeances":[{"quoi":"…","date":"AAAA-MM-JJ"}]}. Listes vides si rien. Chronologie seulement s’il y a plusieurs messages.', String(b.text || '').slice(0, 14000), 1800),
  'POST /ai/reply': async (q, b) => aiCall('Tu rédiges des propositions de réponse pour Samuel à ce mail, en français, ton naturel et courtois, phrases courtes, sans formules creuses ni tirets cadratins. Signe « Samuel ». ' + (b.intent ? 'Consigne de Samuel : ' + String(b.intent).slice(0, 300) + '. Donne 2 variantes de longueur différente. ' : 'Donne 3 variantes : une qui accepte ou confirme, une qui décline ou reporte poliment, une qui demande une précision. ') + 'Réponds UNIQUEMENT en JSON {"variants":[{"label":"2 à 3 mots","body":"texte complet"}]}.', 'Objet : ' + (b.subject || '') + '\n\n' + String(b.text || '').slice(0, 8000), 1800),
  'POST /ai/classify': async (q, b) => aiCall('Tu choisis le dossier le plus adapté pour ranger un mail parmi une liste fournie. Réponds UNIQUEMENT en JSON {"folder":"chemin exact recopié depuis la liste, ou vide si aucun ne convient","why":"8 mots max"}.', 'Dossiers :\n' + (b.folders || []).slice(0, 300).join('\n') + '\n\nMail — De : ' + (b.from || '') + '\nObjet : ' + (b.subject || '') + '\n' + String(b.text || '').slice(0, 2500), 300),
  'POST /ai/smart': async (q, b) => aiCall('Tu aides Samuel à retrouver des mails à partir d’une description vague, en raisonnant sur le sens et non sur les mots exacts. Date du jour : ' + (b.today || '') + '. Déduis : le type de mail et le contexte (ex. un artisan venu réparer quelque chose → devis, facture, intervention, rendez-vous, SAV, nom du métier comme serrurier, motorisation, menuiserie), les mots que les mails contiendraient vraiment (synonymes, termes techniques, marques), les expéditeurs probables, et la période (« il y a quelque temps » = derniers 6 à 18 mois). Si Samuel parle de « nos échanges », cherche aussi dans ses envois (in:sent). Propose 5 à 7 requêtes Gmail courtes et complémentaires, avec OR entre synonymes, sans guillemets. Réponds UNIQUEMENT en JSON {"queries":["…"],"resume":"ce que tu cherches, une phrase","indices":"ce qui distinguera les bons mails, une phrase"}.', String(b.q || '').slice(0, 300), 900),
  'POST /ai/rank': async (q, b) => aiCall('Tu évalues des mails candidats pour la demande de Samuel. Pour chacun, juge s’il correspond VRAIMENT au sens de la demande (sujet, interlocuteur, période, nature du mail), pas seulement à un mot commun ; un échange où Samuel a répondu compte plus quand il parle de « nos échanges ». Les publicités et newsletters (marquées « pub ») ne correspondent presque jamais à ce que cherche Samuel : note-les bas sauf si la demande les vise. Note de 0 à 10, garde ceux notés 5 ou plus, 15 au maximum, du plus au moins pertinent. Si les meilleurs résultats viennent d’une même personne ou entreprise, indique-la dans "contact". Réponds UNIQUEMENT en JSON {"results":[{"i":numéro,"score":0-10,"why":"pourquoi, 12 mots max"}],"contact":{"name":"…","email":"adresse exacte vue dans les candidats ou vide"}}.', 'Demande : ' + String(b.q || '').slice(0, 300) + (b.indices ? '\\nIndices : ' + String(b.indices).slice(0, 300) : '') + '\\n\\nCandidats :\\n' + (b.items || []).slice(0, 50).map(x => x.i + '. ' + x.date + ' · ' + x.from + (x.email ? ' <' + x.email + '>' : '') + (x.n > 1 ? ' · échange de ' + x.n + ' messages' : '') + (x.mine ? ' · Samuel a écrit' : '') + (x.promo ? ' · pub' : '') + ' · ' + x.subject + ' · ' + String(x.snippet || '').slice(0, 230)).join('\\n'), 1600),
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
  'POST /free/purge': async (q, b) => freePurge(b.folder),
  'POST /trash/empty': async () => {
    if (!trashJob || !trashJob.running) { trashJob = { running: true, gmail: 0, free: 0, error: null, start: Date.now() }; runEmptyTrash(trashJob).catch(e => { trashJob.running = false; trashJob.error = e.message; }); }
    return trashJob;
  },
  'GET /trash/empty': async () => trashJob || { running: false, gmail: 0, free: 0, error: null },
  // Ménage complet Free : tous les dossiers, tous les bloqués (adresse, domaine, nom), en arrière-plan
  'POST /free/resweep': async () => {
    if (!S.free) throw Object.assign(new Error('Free non connecté'), { code: 400 });
    if (resweep.running) return resweep;
    resweep = { running: true, moved: 0, done: 0, total: 0, at: Date.now() };
    blockedCache.at = 0;
    (async () => {
      try {
        const targets = await blockedTargets();
        await withImap(async client => {
          const dest = await blockPath(client), f = await folders(client);
          const boxes = (await client.list()).filter(m => !(m.flags && m.flags.has('\\Noselect')) && ![dest, f.trash, f.sent, f.drafts].includes(m.path));
          resweep.total = boxes.length;
          for (const m of boxes) {
            let lock = null;
            try { lock = await client.getMailboxLock(m.path); const n = await sweepInbox(client, targets); resweep.moved += n; }
            catch (e) { log('ménage Free ' + m.path, e.message); } finally { if (lock) lock.release(); }
            resweep.done++;
          }
        });
        log('Free : ménage complet, ' + resweep.moved + ' mail(s) rangé(s) dans Indésirables');
      } catch (e) { resweep.error = e.message; log('ménage Free', e.message); }
      resweep.running = false; resweep.end = Date.now();
    })();
    return resweep;
  },
  'GET /free/resweep': async () => resweep,
  'GET /menage': async () => mjPublic(),
  'POST /menage/start': async () => { if (!S.ai) throw Object.assign(new Error('Assistant IA non configuré (Réglages)'), { code: 400 }); if (MJ.status !== 'running') menageScan(); await pause(300); return mjPublic(); },
  'POST /menage/apply': async (q, b) => { if (MJ.status !== 'done') throw Object.assign(new Error('Aucune analyse terminée'), { code: 400 }); return menageApply((b.keys || []).map(String)); },
  'POST /menage/empty': async () => menageEmpty(),
  // Nombre de mails par dossier Free (et total)
  'GET /free/stats': async () => {
    if (!S.free) throw Object.assign(new Error('Free non connecté'), { code: 400 });
    return withImap(async client => {
      const out = [];
      for (const m of await client.list()) {
        if (m.flags && m.flags.has('\\Noselect')) continue;
        try { const st = await client.status(m.path, { messages: true }); out.push({ name: m.name, path: m.path, messages: st.messages || 0 }); } catch (e) {}
      }
      return { total: out.reduce((a, x) => a + x.messages, 0), folders: out };
    });
  },
  'POST /free/block': async (q, b) => {
    const t = (b.target || '').toLowerCase(); if (!t) throw Object.assign(new Error('cible manquante'), { code: 400 });
    const nm = b.name && String(b.name).trim().length >= 3 && !String(b.name).includes('@') ? 'name:' + String(b.name).trim() : null;
    blockedCache.at = 0;
    const add = [t].concat(nm ? [nm] : []).filter(x => !(S.blocked || []).includes(x));
    if (add.length) { S.blocked = (S.blocked || []).concat(add); save(); }
    // Tous ses anciens mails (réception et autres dossiers) rejoignent Indésirables ; corbeille, envoyés, brouillons exclus
    return withImap(async client => {
      const dest = await blockPath(client), f = await folders(client);
      let moved = 0;
      for (const m of await client.list()) {
        if ((m.flags && m.flags.has('\\Noselect')) || [dest, f.trash, f.sent, f.drafts].includes(m.path)) continue;
        let lock = null;
        try {
          lock = await client.getMailboxLock(m.path);
          // par adresse/domaine, puis par nom affiché (vérifié sur l'enveloppe pour ne pas ratisser large)
          const set = new Set((await client.search({ from: t }, { uid: true })) || []);
          if (nm) { const cand = (await client.search({ from: nm.slice(5) }, { uid: true })) || []; if (cand.length) for await (const m of client.fetch(cand, { envelope: true }, { uid: true })) { if (isBlocked('', [nm], addr(m.envelope.from).name)) set.add(m.uid); } }
          const uids = [...set];
          if (uids.length) { await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true }); await client.messageMove(uids, dest, { uid: true }); moved += uids.length; }
        } catch (e) { log('Free : blocage dans ' + m.path, e.message); } finally { if (lock) lock.release(); }
      }
      log('Free : blocage de ' + t + ', ' + moved + ' mail(s) rangé(s) dans Indésirables');
      return { ok: true, moved };
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
  try { await client.connect(); await client.mailboxOpen('INBOX'); log('Free en temps réel (IDLE) actif'); client.list().then(l => log('Free dossiers : ' + l.map(m => m.path + (m.specialUse ? ' [' + m.specialUse + ']' : '') + (m.flags && m.flags.has('\\Noselect') ? ' [noselect]' : '')).join(' | ') + ' ; spam regroupé depuis : ' + (junkPaths(l).join(', ') || 'aucun'))).catch(() => {}); } catch (e) { log('IDLE Free impossible', e.message); again(); }
}
server.listen(C.port, () => {
  log('Relais MailBox prêt sur le port ' + C.port);
  setTimeout(() => poll().catch(() => {}), 3000);
  setInterval(() => poll().catch(() => {}), C.pollMs);
  setInterval(() => { if (S.timetree) ttSync().catch(() => {}); }, 15 * 60000);
  setTimeout(() => startIdle().catch(() => {}), 5000);
  setTimeout(() => { if (!S.contacts || !S.contacts.at || Date.now() - S.contacts.at > 7 * 864e5) buildContacts(); }, 20000);
  // reprise d'un transfert interrompu par un redémarrage
  if (S.transfer && S.transfer.state === 'running') { S.transfer.total = S.transfer.deleteSource ? S.transfer.done : 0; setTimeout(() => runTransfer(S.transfer), 8000); }
});
process.on('SIGTERM', () => { save(); process.exit(0); });
