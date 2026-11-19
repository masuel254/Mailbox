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
  const find = (use, re) => (list.find(m => m.specialUse === use) || list.find(m => re.test(m.path)) || {}).path;
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
          try { const p = await simpleParser(m.source); snippet = (p.text || '').replace(/\s+/g, ' ').trim().slice(0, 160); } catch (e) {}
          items.push({ uid: m.uid, folder, subject: m.envelope.subject || '(sans objet)', from: addr(m.envelope.from), to: (m.envelope.to || []).map(x => x.name || x.address).join(', '), date: +new Date(m.internalDate || m.envelope.date), seen: m.flags.has('\\Seen'), flagged: m.flags.has('\\Flagged'), snippet });
        }
      }
      items.sort((a, b) => b.date - a.date);
      return { folder, items, more: total > uids.length };
    } finally { lock.release(); }
  });
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
      await client.messageMove(uids, dest, { uid: true });
      return { ok: true, dest };
    } finally { lock.release(); }
  });
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
  const inbox = await gapi('labels/INBOX');
  S.badge.gmail = (inbox && inbox.threadsUnread) || 0;
  const r = (await gapi('messages?' + new URLSearchParams({ q: 'in:inbox is:unread newer_than:2d', maxResults: 25 }))) || {};
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
async function poll() {
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
    } else if (before !== total()) log('pastille', total());
  } finally { polling = false; }
}

/* ---------- Routes ---------- */
const routes = {
  'GET /health': async () => ({ ok: true, gmail: !!S.gmail, free: !!S.free, subs: S.subs.length }),
  'GET /status': async () => ({ gmail: S.gmail ? { email: S.gmail.email } : null, free: S.free ? { email: S.free.user, name: S.free.name || '' } : null, subs: S.subs.length, badge: { gmail: S.badge.gmail, free: S.badge.free, total: total() }, vapid: C.vapidPub }),
  'GET /gmail/token': async () => { const t = await gmailToken(); return { access_token: t.access_token, expires_in: Math.floor((t.exp - Date.now()) / 1000), scope: t.scope, email: S.gmail.email }; },
  'DELETE /gmail': async () => { S.gmail = null; gTok = null; save(); return { ok: true }; },
  'POST /push/subscribe': async (q, b) => { if (!b.subscription || !b.subscription.endpoint) throw Object.assign(new Error('abonnement invalide'), { code: 400 }); S.subs = S.subs.filter(s => s.endpoint !== b.subscription.endpoint).concat([b.subscription]); save(); return { ok: true, count: S.subs.length }; },
  'POST /push/test': async () => { await push({ title: 'MailBox', body: 'Les notifications fonctionnent.', badge: total(), url: C.appUrl, tag: 'mailbox-test' }); return { ok: true, count: S.subs.length }; },
  'GET /prefs': async () => S.prefs,
  'POST /prefs': async (q, b) => {
    const p = Object.assign({}, S.prefs);
    if (typeof b.silent === 'boolean') p.silent = b.silent;
    if (typeof b.quiet === 'boolean') p.quiet = b.quiet;
    if (Number.isInteger(b.quietStart) && b.quietStart >= 0 && b.quietStart < 24) p.quietStart = b.quietStart;
    if (Number.isInteger(b.quietEnd) && b.quietEnd >= 0 && b.quietEnd < 24) p.quietEnd = b.quietEnd;
    if (typeof b.tz === 'string' && b.tz.length < 60) { try { new Intl.DateTimeFormat('fr', { timeZone: b.tz }); p.tz = b.tz; } catch (e) {} }
    S.prefs = p; save(); return p;
  },
  'GET /badge': async () => { poll().catch(() => {}); return { gmail: S.badge.gmail, free: S.badge.free, total: total() }; },
  'POST /free/account': async (q, b) => {
    if (!b.email || !b.password) throw Object.assign(new Error('Adresse et mot de passe requis'), { code: 400 });
    const user = b.email.trim().toLowerCase();
    const client = new ImapFlow(Object.assign({}, C.imap, { auth: { user, pass: b.password }, logger: false }));
    try { await client.connect(); await client.logout(); } catch (e) {
      if (e.authenticationFailed || /auth/i.test(e.responseText || '')) throw Object.assign(new Error('Connexion Free refusée : vérifie l’adresse et le mot de passe'), { code: 401 });
      throw Object.assign(new Error('Serveur Free injoignable : ' + (e.code || e.message)), { code: 502 });
    }
    S.free = { user, pass: enc(b.password), name: (b.name || '').trim() }; S.seen.freeInit = false; save();
    poll().catch(() => {});
    return { ok: true, email: user };
  },
  'DELETE /free/account': async () => { S.free = null; S.badge.free = 0; save(); return { ok: true }; },
  'GET /free/folders': async () => withImap(async c => { const f = await folders(c); return f; }),
  'GET /free/list': async q => freeList(q.get('folder') || 'INBOX', q.get('unread') === '1', +q.get('before') || 0, Math.min(+q.get('limit') || 25, 50)),
  'GET /free/message': async q => freeMessage(q.get('folder') || 'INBOX', +q.get('uid')),
  'GET /free/attachment': async q => freeAttachment(q.get('folder') || 'INBOX', +q.get('uid'), +q.get('idx')),
  'POST /free/flags': async (q, b) => freeFlags(b.folder || 'INBOX', b.uids || [], b.seen, b.flagged),
  'POST /free/move': async (q, b) => freeMove(b.folder || 'INBOX', b.uids || [], b.to),
  'POST /free/send': async (q, b) => freeSend(b),
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
server.listen(C.port, () => { log('Relais MailBox prêt sur le port ' + C.port); setTimeout(() => poll().catch(() => {}), 3000); setInterval(() => poll().catch(() => {}), C.pollMs); });
process.on('SIGTERM', () => { save(); process.exit(0); });
