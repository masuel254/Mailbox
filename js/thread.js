'use strict';
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
  try { [t] = await Promise.all([cachedFetch('th:' + id, () => api('threads/' + encodeURIComponent(id) + '?format=full')), getLabels().catch(() => [])]); }
  catch (e) { if (e.message !== 'auth') v.querySelector('.loading').outerHTML = `<div class="empty">Impossible d'ouvrir : ${esc(e.message)}</div>`; return; }
  const msgs = (t.messages || []).filter(m => !(m.labelIds || []).includes('TRASH') || (t.messages || []).every(x => (x.labelIds || []).includes('TRASH')));
  const labels = new Set(msgs.flatMap(m => m.labelIds || []));
  const subject = hdr(msgs[0] || {}, 'Subject') || '(sans objet)';
  const starred = labels.has('STARRED');
  state.thread = { id, msgs, labels, subject };
  if (labels.has('UNREAD')) {
    api('threads/' + id + '/modify', { method: 'POST', body: { removeLabelIds: ['UNREAD'] } }).then(() => badgeNow(1)).catch(e => { if (isNetErr(e)) queueAction({ t: 'gmodify', id, body: { removeLabelIds: ['UNREAD'] } }); });
    patchCached(id, i => Object.assign({}, i, { unread: false }));
  }
  const lastM = msgs[msgs.length - 1] || {};
  const unsubH = hdr(lastM, 'List-Unsubscribe'), unsubP = hdr(lastM, 'List-Unsubscribe-Post');
  const chips = [...labels].map(l => l === 'INBOX' ? '<span class="chip">Réception</span>' : (labelById(l) ? `<span class="chip lab" style="--c:${esc(labelColor(labelById(l)))}">${esc(labelById(l).name)}</span>` : '')).join('');
  v.innerHTML = `
    <div class="top"><a class="back" href="#" id="back">${ICON.back}Retour</a>${FS_CTL}</div>
    <h1 class="thread-title">${esc(subject)}</h1>
    <div class="thread-chips">${chips}</div>
    ${(() => { const other = msgs.map(m => parseAddr(hdr(m, 'From'))).filter(a => a.email && !isMe(a.email)).pop() || splitAddrs(hdr(lastM, 'To')).map(parseAddr).find(a => a.email && !isMe(a.email)); return other ? contactLink(other.name, other.email.toLowerCase()) : ''; })()}
    ${unsubH ? '<div class="unsub-bar"><span>Mail de liste de diffusion</span><button class="btn" id="t-unsub">Se désabonner</button></div>' : ''}
    <div class="toolbar">
      <button id="t-archive">${ICON.archive}Archiver</button>
      <button id="t-label">${ICON.tag}Classer</button>
      <button id="t-block">${ICON.block}Bloquer</button>
      <button id="t-clean">${ICON.trash}Tous ses mails</button>
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
  state.unsub = unsubH ? { h: unsubH, post: unsubP, acc: 'gmail' } : null;
  const un = $('#t-unsub'); if (un) un.onclick = () => unsubscribe(unsubH, unsubP, 'gmail', (hdr(lastM, 'From').match(/^\s*"?([^"<]*?)"?\s*</) || [])[1] || hdr(lastM, 'From'));
}
async function renderFree(folder, uid) {
  const v = $('#view');
  v.innerHTML = `<div class="top"><a class="back" href="#" id="back">${ICON.back}Retour</a></div><div class="loading">Ouverture…</div>`;
  $('#back').onclick = e => { e.preventDefault(); goBack(); };
  let m;
  try { m = await cachedFetch('fm:' + folder + ':' + uid, () => rapi('/free/message?' + new URLSearchParams({ folder, uid }))); }
  catch (e) { v.querySelector('.loading').outerHTML = `<div class="empty">Impossible d'ouvrir : ${esc(e.message)}</div>`; return; }
  const id = 'f:' + uid + ':' + folder;
  if (!m.seen) { rapi('/free/flags', { method: 'POST', body: { folder, uids: [uid], seen: true } }).then(() => badgeNow(1)).catch(e => { if (isNetErr(e)) queueAction({ t: 'fflags', body: { folder, uids: [uid], seen: true } }); }); patchCached(id, i => Object.assign({}, i, { unread: false })); }
  state.freeMsg = m;
  v.innerHTML = `
    <div class="top"><a class="back" href="#" id="back">${ICON.back}Retour</a>${FS_CTL}</div>
    <h1 class="thread-title">${esc(m.subject)}</h1>
    <div class="thread-chips"><span class="chip acc-free">Free</span><span class="chip">${esc(folder === 'INBOX' ? 'Réception' : folder)}</span></div>
    ${(() => { if (m.from.email && !isMe(m.from.email)) return contactLink(m.from.name, m.from.email.toLowerCase()); const t = splitAddrs(m.to || '').map(parseAddr).find(a => a.email && !isMe(a.email)); return t ? contactLink(t.name, t.email.toLowerCase()) : ''; })()}
    ${m.unsub ? '<div class="unsub-bar"><span>Mail de liste de diffusion</span><button class="btn" id="t-unsub">Se désabonner</button></div>' : ''}
    <div class="toolbar">
      <button id="t-archive">${ICON.archive}Archiver</button>
      <button id="t-fmove">${ICON.tag}Classer</button>
      <button id="t-block">${ICON.block}Bloquer</button>
      <button id="t-clean">${ICON.trash}Tous ses mails</button>
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
  const att = a => a.data ? Promise.resolve(a.data) : cachedFetch('fatt:' + folder + ':' + uid + ':' + a.idx, () => rapi('/free/attachment?' + new URLSearchParams({ folder, uid, idx: a.idx })).then(r => r.data), 'att').then(d => { a.data = d; return d; });
  renderBody(null, $('#msgs .content'), { acc: { html: fixMojibake(m.html), text: fixMojibake(m.text), att: m.attachments || [] }, att });
  const move = async (to, label) => { try { await rapi('/free/move', { method: 'POST', body: { folder, uids: [uid], to } }); patchCached(id, () => null); toast(label); badgeNow(0); goBack(); } catch (e) { toast(e.message); } };
  $('#t-archive').onclick = () => move('ARCHIVE', 'Archivé');
  $('#t-trash').onclick = () => move('TRASH', 'Placé dans la corbeille');
  $('#t-unread').onclick = async () => { try { await rapi('/free/flags', { method: 'POST', body: { folder, uids: [uid], seen: false } }); patchCached(id, i => Object.assign({}, i, { unread: true })); toast('Marqué non lu'); badgeNow(0); goBack(); } catch (e) { toast(e.message); } };
  $('#t-block').onclick = () => { goBack(); quickBlock({ id, fromEmail: m.from.email, fromName: m.from.name }); };
  $('#t-fmove').onclick = () => freeMoveSheet(id, folder, uid);
  state.thread = null; state.freeCtx = { id, folder, uid };
  bindReadTools();
  state.unsub = m.unsub ? { h: m.unsub, post: m.unsubPost, acc: 'free' } : null;
  const un = $('#t-unsub'); if (un) un.onclick = () => unsubscribe(m.unsub, m.unsubPost, 'free', m.from.name || m.from.email);
  $('#r-reply').onclick = () => openCompose('reply', null, m);
  $('#r-all').onclick = () => openCompose('all', null, m);
  $('#r-fwd').onclick = () => openCompose('fwd', null, m);
}
/* Désabonnement (en-tête List-Unsubscribe) : un clic si l'expéditeur le permet, sinon mail de désinscription ou page web */
// Envoi de la demande de désabonnement : lien « un clic » via le relais, sinon mail, sinon page web de l'expéditeur
async function doUnsubscribe(h, post, acc) {
  const links = (h.match(/<[^>]+>/g) || []).map(x => x.slice(1, -1).trim());
  const web = links.find(u => /^https:/i.test(u)), mail = links.find(u => /^mailto:/i.test(u));
  if (web && /one-click/i.test(post || '') && relayOn()) { await rapi('/unsubscribe', { method: 'POST', body: { url: web } }); return 'ok'; }
  if (mail) {
    const u = new URL(mail.replace(/^mailto:/i, 'mailto://'));
    const to = decodeURIComponent(mail.replace(/^mailto:/i, '').split('?')[0]);
    const subject = u.searchParams.get('subject') || 'unsubscribe', body = u.searchParams.get('body') || 'unsubscribe';
    if (acc === 'free') await rapi('/free/send', { method: 'POST', body: { to, subject, text: body } });
    else await api('messages/send', { method: 'POST', body: { raw: buildRaw({ to, subject, body }) } });
    return 'ok';
  }
  if (web) { window.open(web, '_blank', 'noopener'); return 'web'; }
  throw new Error('aucun lien utilisable');
}
/* Nettoyage par expéditeur : tous ses mails à la corbeille (Gmail + Free), avec désabonnement en option */
async function senderCleanSheet(email, name, unsub) {
  email = String(email || '').toLowerCase();
  if (!email) { toast('Expéditeur inconnu'); return; }
  openSheet(`<span class="grip"></span><h2>Tous les mails de ${esc(name || email)}</h2><p class="fhint" style="margin:0">${esc(email)}</p><div id="sc-n" class="loading">Je compte…</div>
    ${unsub ? '<label class="switch">Me désabonner aussi<input type="checkbox" id="sc-un" checked></label>' : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="btn" data-close>Annuler</button><button class="btn danger" id="sc-ok" disabled>Tout supprimer</button></div>`);
  const count = async () => {
    if (relayOn() && (relayGmailOn() || freeOn())) return rapi('/sender/count?' + new URLSearchParams({ email }));
    let n = 0, tok = null; do { const r = await api('messages?' + new URLSearchParams(Object.assign({ q: 'from:' + email + ' -in:trash', maxResults: 500 }, tok ? { pageToken: tok } : {}))); n += (r.messages || []).length; tok = r.nextPageToken; } while (tok && n < 5000);
    return { gmail: n, free: 0 };
  };
  let c;
  try { c = await count(); } catch (e) { const el = $('#sc-n'); if (el) el.outerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const total = (c.gmail || 0) + (c.free || 0), el = $('#sc-n'); if (!el) return;
  el.className = 'sc-n'; el.innerHTML = total ? `<b>${total} mail${total > 1 ? 's' : ''}</b>${freeOn() ? ` <small>Gmail ${c.gmail || 0} · Free ${c.free || 0}</small>` : ''}<br><small>Ils vont à la corbeille (récupérables 30 jours).</small>` : 'Aucun mail de cet expéditeur.';
  const ok = $('#sc-ok'); ok.disabled = !total && !unsub; if (!total) ok.textContent = 'Me désabonner';
  ok.onclick = async () => {
    ok.disabled = true; ok.textContent = 'Suppression…';
    try {
      if ($('#sc-un') && $('#sc-un').checked) { try { await doUnsubscribe(unsub.h, unsub.post, unsub.acc); } catch (e) { toast('Désabonnement impossible : ' + e.message); } }
      if (total) {
        if (relayOn() && (relayGmailOn() || freeOn())) await rapi('/sender/purge', { method: 'POST', body: { email } });
        else { let ids = [], tok = null; do { const r = await api('messages?' + new URLSearchParams(Object.assign({ q: 'from:' + email + ' -in:trash', maxResults: 500 }, tok ? { pageToken: tok } : {}))); ids = ids.concat((r.messages || []).map(m => m.id)); tok = r.nextPageToken; } while (tok); for (let i = 0; i < ids.length; i += 1000) await api('messages/batchModify', { method: 'POST', body: { ids: ids.slice(i, i + 1000), addLabelIds: ['TRASH'], removeLabelIds: ['INBOX', 'UNREAD'] } }); }
      }
      closeSheet(); Object.keys(state.lists).forEach(k => { state.lists[k] = Object.assign({}, state.lists[k], { items: state.lists[k].items.filter(i => i.fromEmail !== email) }); });
      toast(total ? total + ' mail' + (total > 1 ? 's' : '') + ' de ' + (name || email) + ' supprimé' + (total > 1 ? 's' : '') : 'Désabonnement envoyé');
      badgeNow(0); if (location.hash.startsWith('#/thread/') || location.hash.startsWith('#/free/')) goBack(); else route();
    } catch (e) { ok.disabled = false; ok.textContent = 'Tout supprimer'; toast('Échec : ' + e.message); }
  };
}
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
      if (await doUnsubscribe(h, post, acc) === 'web') { closeSheet(); return; }
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
    try { await api('threads/' + id + '/modify', { method: 'POST', body }); }
    catch (e) { if (!isNetErr(e)) throw e; queueAction({ t: 'gmodify', id, body }); msg += ' (appliqué au retour du réseau)'; }
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
  // Texte seul : la newsletter réduite à son texte, sans mise en page ni images
  let textOnly = false;
  const body = document.createElement('div');
  body.className = 'msg-body';
  const host = document.createElement('div');
  body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const tools = document.createElement('div');
  tools.className = 'msg-tools';
  const draw = () => {
    const plainMode = acc.html == null || textOnly;
    const html = !plainMode ? cleanHtml(acc.html, readable, showImages) : textToHtml(acc.text && acc.text.trim() ? acc.text : htmlText(acc.html || ''));
    shadow.innerHTML = `<style>${bodyCss(readable && !plainMode, plainMode)}</style><div class="mail">${html}</div>`;
    shadow.querySelectorAll('img[src^="cid:"]').forEach(img => {
      const cid = img.getAttribute('src').slice(4);
      const a = acc.att.find(x => x.cid === cid);
      if (a) fetcher(a).then(b64 => { img.src = 'data:' + a.mime + ';base64,' + b64; }).catch(() => {});
    });
    tools.innerHTML = (acc.html != null && !textOnly ? `<button data-t="mode">${readable ? 'Mise en forme d’origine' : 'Mode lisible'}</button>` : '') +
      (acc.html != null ? `<button data-t="text">${textOnly ? 'Version mise en page' : 'Texte seul'}</button>` : '') +
      (!showImages && shadow.querySelector('img[data-src]') ? '<button data-t="img">Afficher les images</button>' : '');
    $$('button', tools).forEach(b => b.onclick = () => { if (b.dataset.t === 'mode') readable = !readable; else if (b.dataset.t === 'text') textOnly = !textOnly; else showImages = true; draw(); });
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
  if (!attCache[k]) attCache[k] = cachedFetch('att:' + msgId + ':' + a.id, () => api('messages/' + msgId + '/attachments/' + a.id).then(r => r.data.replace(/-/g, '+').replace(/_/g, '/')), 'att');
  return attCache[k];
}
async function openAttachment(fetcher, a, btn) {
  const label = btn.querySelector('.s') || btn; const old = label.textContent; label.textContent = '…';
  try {
    const b64 = await fetcher(a);
    const name = a.name || 'piece-jointe';
    const isPdf = /pdf/i.test(a.mime || '') || /\.pdf$/i.test(name);
    const isImg = !isPdf && (/^image\/(png|jpe?g|gif|webp|bmp|svg)/i.test(a.mime || '') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(name));
    const type = isPdf ? 'application/pdf' : (a.mime || 'application/octet-stream');
    const blob = new Blob([b64ToBytes(b64)], { type });
    if (isPdf) await pdfViewer(blob, name);
    else if (isImg) { const url = URL.createObjectURL(blob); fileViewer(name, `<img src="${url}" alt="${esc(name)}">`, blob); setTimeout(() => URL.revokeObjectURL(url), 600000); }
    else shareFile(blob, name, true);
  } catch (e) { if (e.message !== 'auth') toast('Pièce jointe indisponible'); }
  label.textContent = old;
}
// Partager / enregistrer via la feuille de partage de l'iPhone (Fichiers, Mail, AirDrop…)
async function shareFile(blob, name, fallbackOpen) {
  const f = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; if (fallbackOpen) { link.target = '_blank'; link.rel = 'noopener'; }
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
// Visionneuse plein écran (image ou PDF), avec Partager
function fileViewer(name, inner, blob) {
  const v = document.createElement('div'); v.className = 'fviewer';
  v.innerHTML = `<div class="fv-bar"><button class="fv-x" aria-label="Fermer">✕</button><b>${esc(name)}</b><button class="fv-share">Partager</button></div><div class="fv-body">${inner}</div>`;
  document.body.appendChild(v); document.body.style.overflow = 'hidden';
  const close = () => { v.remove(); document.body.style.overflow = ''; window.removeEventListener('hashchange', close); };
  $('.fv-x', v).onclick = close; window.addEventListener('hashchange', close);
  $('.fv-share', v).onclick = () => shareFile(blob, name);
  return v;
}
let pdfjsP = null;
const loadPdfjs = () => pdfjsP || (pdfjsP = new Promise((res, rej) => {
  const sc = document.createElement('script'); sc.src = 'vendor/pdf.min.js';
  sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; res(window.pdfjsLib); };
  sc.onerror = () => { pdfjsP = null; rej(new Error('Lecteur PDF indisponible (réseau)')); };
  document.head.appendChild(sc);
}));
async function pdfViewer(blob, name) {
  const v = fileViewer(name, '<div class="loading">Ouverture du PDF…</div>', blob);
  const body = $('.fv-body', v);
  try {
    const lib = await loadPdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    body.innerHTML = '';
    const w = Math.min(body.clientWidth || innerWidth, 900) - 8, dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (let n = 1; n <= Math.min(doc.numPages, 60); n++) {
      if (!v.isConnected) return;
      const page = await doc.getPage(n);
      const vp0 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: (w / vp0.width) * dpr });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; c.style.width = w + 'px'; c.className = 'fv-page';
      body.appendChild(c);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    }
    if (doc.numPages > 60) body.insertAdjacentHTML('beforeend', '<p class="fhint" style="text-align:center">Les 60 premières pages sont affichées. « Partager » pour le document complet.</p>');
  } catch (e) { body.innerHTML = `<div class="empty">Impossible d’afficher ce PDF ici (${esc(e.message)}). Touche « Partager » pour l’ouvrir dans une autre app.</div>`; }
}
