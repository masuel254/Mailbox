'use strict';
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
  // Signature (Réglages) : ajoutée au-dessus de la citation
  const sigOf = a => String((a === 'free' ? settings.sigFree : settings.sigGmail) || '').trim();
  const startAcc = fm ? 'free' : 'gmail';
  if (sigOf(startAcc) && !src.prefill) body = '\n\n' + sigOf(startAcc) + body;
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
    </form>
    <div class="c-opts">
      <button type="button" class="btn" id="c-later">${ICON.clock}<span>Envoyer plus tard</span></button>
      <label class="c-follow">Relance si pas de réponse<select id="c-follow"><option value="0">Non</option><option value="2">2 jours</option><option value="3">3 jours</option><option value="5">5 jours</option><option value="7">1 semaine</option></select></label>
    </div>
    <p class="fhint" id="c-draft-h" style="margin:6px 4px 0"></p>`;
  const ta = $('#c-body');
  const added = [];
  ta.value = body;
  // Brouillon enregistré sur l'iPhone à chaque frappe : rien n'est perdu si l'appli se ferme
  const dKey = 'draft:' + mode + ':' + (threadId || (fm ? fm.folder + '/' + fm.uid : '') || (m ? m.id : '') || 'new');
  const snap = () => ({ to: $('#c-to').value, cc: $('#c-cc').value, bcc: $('#c-bcc').value, subject: $('#c-subj').value, body: ta.value, from: $('#c-from') ? $('#c-from').value : 'gmail', at: Date.now() });
  const initial = JSON.stringify(Object.assign(snap(), { at: 0 }));
  const dirty = () => JSON.stringify(Object.assign(snap(), { at: 0 })) !== initial || added.length;
  let dT = null;
  const saveDraft = () => { clearTimeout(dT); dT = setTimeout(() => { if (!dirty()) return; LS.set(dKey, snap()); const h = $('#c-draft-h'); if (h) h.textContent = 'Brouillon enregistré à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }, 700); };
  const dropDraft = () => { clearTimeout(dT); LS.del(dKey); };
  const old = LS.get(dKey, null);
  if (old && Date.now() - old.at < 14 * 864e5 && (old.body !== body || old.to !== to)) {
    $('#c-to').value = old.to || ''; $('#c-cc').value = old.cc || ''; $('#c-bcc').value = old.bcc || ''; $('#c-subj').value = old.subject || ''; ta.value = old.body || '';
    if (old.cc || old.bcc) { $('#row-cc').hidden = false; $('#row-bcc').hidden = false; }
    if (old.from && $('#c-from')) $('#c-from').value = old.from;
    toast('Brouillon du ' + new Date(old.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' restauré', { label: 'Repartir de zéro', run: () => { dropDraft(); renderCompose(params); } });
  }
  ['#c-to', '#c-cc', '#c-bcc', '#c-subj'].forEach(s => $(s).addEventListener('input', saveDraft)); ta.addEventListener('input', saveDraft);
  // Changer d'expéditeur échange la signature
  if ($('#c-from')) $('#c-from').onchange = e => { const a = e.target.value, b = a === 'free' ? 'gmail' : 'free'; if (sigOf(b) && ta.value.includes(sigOf(b))) ta.value = ta.value.replace(sigOf(b), sigOf(a)); else if (sigOf(a) && !ta.value.includes(sigOf(a))) { const qi = ta.value.search(/\n\nLe .* a écrit :\n|\n\n---------- Message transféré/); ta.value = qi >= 0 ? ta.value.slice(0, qi) + '\n\n' + sigOf(a) + ta.value.slice(qi) : ta.value.replace(/\s*$/, '') + '\n\n' + sigOf(a); } saveDraft(); };
  ['#c-to', '#c-cc', '#c-bcc'].forEach(s => addrSuggest($(s), saveDraft));
  // Envoi programmé
  let laterAt = 0;
  const laterBtn = $('#c-later');
  const setLater = at => { laterAt = at; laterBtn.querySelector('span').textContent = at ? 'Envoi le ' + new Date(at).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) + ' à ' + new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + ' ✕' : 'Envoyer plus tard'; laterBtn.classList.toggle('on', !!at); $('#send').lastChild.textContent = at ? 'Programmer' : 'Envoyer'; };
  laterBtn.onclick = () => {
    if (!relayOn()) { toast('L’envoi programmé passe par ton relais : configure-le dans Réglages'); return; }
    if (laterAt) { setLater(0); return; }
    const q = quickDates();
    openSheet(`<span class="grip"></span><h2>Envoyer plus tard</h2><p class="fhint" style="margin:0">Le mail attend sur ton serveur et part tout seul, même iPhone éteint.</p>
      <div class="qd">${q.map((x, i) => `<button class="btn" data-q="${i}">${esc(x[0])}<small>${esc(x[1].toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }))}</small></button>`).join('')}</div>
      <label class="f">Ou une date précise<input type="datetime-local" id="cl-at"></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="btn" data-close>Annuler</button><button class="btn primary" id="cl-ok">Choisir</button></div>`);
    const pick = at => { if (!at || at < Date.now() + 60000) { toast('Choisis un moment dans le futur'); return; } closeSheet(); setLater(at); };
    $$('[data-q]').forEach(b => b.onclick = () => pick(q[+b.dataset.q][1].getTime()));
    $('#cl-ok').onclick = () => pick(new Date($('#cl-at').value).getTime());
  };
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, window.innerHeight * 0.45) + 'px'; };
  ta.addEventListener('input', grow); grow();
  setTimeout(() => { if (!to) $('#c-to').focus(); else { ta.focus(); ta.setSelectionRange(0, 0); } }, 50);
  // Retour : le brouillon reste enregistré (pas de question), avec un « Supprimer » dans le bandeau
  $('#back').onclick = e => { e.preventDefault(); if (dirty()) { clearTimeout(dT); LS.set(dKey, snap()); toast('Brouillon enregistré', { label: 'Supprimer', run: () => { dropDraft(); toast('Brouillon supprimé'); } }); } else dropDraft(); goBack(); };
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
    const follow = +$('#c-follow').value || 0;
    const viaFreeX = $('#c-from') && $('#c-from').value === 'free';
    const toEmail = (parseAddr(splitAddrs(o.to)[0] || '').email || '').toLowerCase();
    if (follow && !relayOn()) { toast('Le rappel passe par ton relais : configure-le dans Réglages'); btn.disabled = false; btn.lastChild.textContent = laterAt ? 'Programmer' : 'Envoyer'; return; }
    if (laterAt) {
      try {
        const atts = (fwdAtts.length ? await Promise.all(fwdAtts.map(async a => ({ name: a.name, mime: a.mime, b64: await fetchAtt(a) }))) : []).concat(added.map(a => ({ name: a.name, mime: a.mime, b64: a.b64 })));
        const oo = Object.assign({}, o, atts.length ? { attachments: atts } : {});
        await rapi('/schedule', { method: 'POST', body: Object.assign({ acc: viaFreeX ? 'free' : 'gmail', at: laterAt, to: o.to, toEmail, subject: o.subject, followDays: follow },
          viaFreeX ? { free: { to: o.to, cc: o.cc, bcc: o.bcc, subject: o.subject, text: o.body, inReplyTo: o.inReplyTo, references: o.references, attachments: oo.attachments } } : { raw: buildRaw(oo), threadId }) });
        dropDraft(); state.composeFrom = null;
        toast('Programmé pour le ' + new Date(laterAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }) + ' à ' + new Date(laterAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), { label: 'Voir', run: () => { location.hash = '#/scheduled'; } });
        goBack();
      } catch (e) { btn.disabled = false; btn.lastChild.textContent = 'Programmer'; toast('Échec : ' + e.message); }
      return;
    }
    // Annuler l'envoi : 6 secondes pour se raviser
    const cancelled = await new Promise(res => { const t = setTimeout(() => res(false), 6200); toast('Envoi dans quelques secondes…', { label: 'Annuler', run: () => { clearTimeout(t); res(true); } }); });
    if (cancelled) { btn.disabled = false; btn.lastChild.textContent = 'Envoyer'; toast('Envoi annulé, ton message est toujours là'); return; }
    try {
      o.attachments = (fwdAtts.length ? await Promise.all(fwdAtts.map(async a => ({ name: a.name, mime: a.mime, b64: await fetchAtt(a) }))) : []).concat(added.map(a => ({ name: a.name, mime: a.mime, b64: a.b64 })));
      if (!o.attachments.length) delete o.attachments;
      const viaFree = $('#c-from') && $('#c-from').value === 'free';
      let sent = null;
      if (viaFree) sent = await rapi('/free/send', { method: 'POST', body: { to: o.to, cc: o.cc, bcc: o.bcc, subject: o.subject, text: o.body, inReplyTo: o.inReplyTo, references: o.references, attachments: o.attachments } });
      else sent = await gmailSend(o, threadId);
      dropDraft();
      if (follow) rapi('/follow', { method: 'POST', body: { acc: viaFree ? 'free' : 'gmail', days: follow, sentAt: Date.now(), to: parseAddr(splitAddrs(o.to)[0] || '').name || toEmail, toEmail, subject: o.subject, threadId: sent && sent.threadId, messageId: sent && sent.id && viaFree ? sent.id : null } }).then(() => toast('Je te préviens si pas de réponse sous ' + follow + ' jours')).catch(e => toast('Rappel non enregistré : ' + e.message));
      Object.keys(state.lists).forEach(k => delete state.lists[k]);
      state.composeFrom = null;
      toast('Message envoyé');
      goBack();
    } catch (e) { btn.disabled = false; btn.lastChild.textContent = 'Envoyer'; if (e.message !== 'auth') toast('Échec : ' + e.message); }
  };
}

/* Destinataires suggérés : contacts Google + correspondants fréquents, dès les premières lettres */
function addrSuggest(input, onPick) {
  if (!input) return;
  const box = document.createElement('div'); box.className = 'sugg'; box.hidden = true;
  input.closest('.row').after(box);
  let list = null;
  const pool = async () => { if (list) return list; const c = LS.get('gcontacts', null); list = c ? c.list : []; if (!list.length) { try { list = await loadContacts(); } catch (e) { list = []; } } return list; };
  const nz = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const draw = async () => {
    const parts = input.value.split(/[,;]/), cur = nz(parts[parts.length - 1].trim());
    if (cur.length < 2) { box.hidden = true; return; }
    const got = new Set(parts.slice(0, -1).map(x => (parseAddr(x).email || '').toLowerCase()));
    const res = [];
    (await pool()).forEach(p => p.emails.forEach(e => { if (got.has(e)) return; const n = nz(p.name), em = nz(e); const sc = n.startsWith(cur) || em.startsWith(cur) ? 3 : n.split(/\s+/).some(w => w.startsWith(cur)) ? 2 : n.includes(cur) || em.includes(cur) ? 1 : 0; if (sc) res.push({ p, e, sc: sc * 1000 + (p.count || 0) + ((p.last || 0) > Date.now() - 90 * 864e5 ? 50 : 0) }); }));
    res.sort((a, b) => b.sc - a.sc);
    const top = res.slice(0, 6);
    box.hidden = !top.length;
    box.innerHTML = top.map((r, i) => `<button type="button" data-i="${i}"><b>${esc(r.p.name && r.p.name !== r.e ? r.p.name : r.e)}</b><small>${esc(r.e)}</small></button>`).join('');
    $$('[data-i]', box).forEach(b => b.onmousedown = b.ontouchstart = ev => {
      ev.preventDefault(); const r = top[+b.dataset.i];
      parts[parts.length - 1] = (r.p.name && r.p.name !== r.e ? '"' + r.p.name.replace(/"/g, '') + '" <' + r.e + '>' : r.e);
      input.value = parts.map(x => x.trim()).filter(Boolean).join(', ') + ', '; box.hidden = true; input.focus(); if (onPick) onPick();
    });
  };
  input.addEventListener('input', draw);
  input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 200));
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
