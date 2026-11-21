'use strict';
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
  const tc = $('#t-clean'); if (tc) tc.onclick = () => senderCleanSheet(ctx.fromEmail, ctx.from, state.unsub);
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
      if (ctx.fromList) { reDraw(); }
      toast('Revient le ' + new Date(until).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }) + ' à ' + new Date(until).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
      if (!ctx.fromList) goBack();
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
    try { const r = await rapi('/ai/search', { method: 'POST', body: { q: val, today: new Date().toISOString().slice(0, 10) } });
      // garde-fous : pas de limite de date ni de recherche limitée à l'objet si la demande n'en parle pas
      if (!/\b(jour|semaine|mois|an|ans|année|hier|récent|dernier|derniers|depuis|avant|après|20\d\d|janv|févr|mars|avril|mai|juin|juil|août|sept|oct|nov|déc)/i.test(val)) r.q = r.q.replace(/\b(newer_than|older_than|after|before):\S+/gi, ' ');
      if (!/\b(objet|sujet|intitul)/i.test(val)) r.q = r.q.replace(/\bsubject:/gi, '');
      r.q = r.q.replace(/\s+/g, ' ').trim() || val;
      state.aiNote = { ask: val, q: r.q, resume: r.resume }; location.hash = '#/search/' + encodeURIComponent(r.q); return; }
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
  try { await labelGrab(searchWords(question), cand, 20); } catch (e) {}
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
/* ---------- Ménage IA : l'IA repère les pubs sans intérêt, l'utilisateur valide, tout part dans « Ménage IA » ---------- */
let menageT = null;
async function renderMenage() {
  clearTimeout(menageT);
  const v = $('#view');
  if (!$('#mj')) v.innerHTML = `<div class="top"><a class="back" href="#/labels">${ICON.back}Dossiers</a></div><h1 class="thread-title">✦ Ménage IA</h1><div id="mj"><div class="loading">Chargement…</div></div>`;
  const box = $('#mj');
  if (!relayOn()) { box.innerHTML = '<div class="empty">Le Ménage IA tourne sur ton relais : configure-le dans Réglages.</div>'; return; }
  let r;
  try { r = await rapi('/menage'); } catch (e) { box.innerHTML = `<div class="empty">${esc(e.status === 404 ? 'Ton relais n’est pas à jour : lance la commande Termius.' : e.message)}</div>`; return; }
  const fmt = n => Number(n || 0).toLocaleString('fr-FR');
  const guards = `<div class="card mj-guard"><b>🛡 Jamais touchés</b><div><span>Pièces jointes</span><span>Factures, reçus</span><span>Commandes, billets</span><span>Tes réponses</span><span>Tes correspondants</span><span>Suivis</span></div></div>`;
  if (r.status === 'running') {
    const tot = (r.g.total || 0) + (r.f.total || 0), done = (r.g.done || 0) + (r.f.done || 0), pct = tot ? Math.round(done / tot * 100) : 0;
    box.innerHTML = `<div class="card mj-run"><b>${esc(r.phase || 'Analyse')}…</b><div class="mj-bar"><span style="width:${pct}%"></span></div><small>${fmt(done)} / ${fmt(tot)} mails lus · ${fmt(r.excluded)} mis de côté par les garde-fous</small>
      ${r.waitUntil > Date.now() ? `<p class="fhint" style="margin:6px 0 0;color:var(--accent)">⏸ Gmail impose une pause (trop de lectures ce matin). Reprise automatique vers ${new Date(r.waitUntil).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.</p>` : ''}
      <p class="fhint" style="margin:6px 0 0">Tu peux fermer l’appli : l’analyse continue sur ton serveur et tu reçois une notification à la fin.</p></div>${guards}`;
    menageT = setTimeout(() => { if ((location.hash || '').startsWith('#/menage')) renderMenage(); }, 3000);
    return;
  }
  if (r.status !== 'done') {
    box.innerHTML = `<p class="fhint">L’IA lit l’en-tête de tous tes mails (expéditeur et objet, jamais le contenu), les regroupe par expéditeur et te propose ceux qui ne sont que de la pub. Rien n’est supprimé : tu vérifies, puis les mails choisis partent dans le dossier « Ménage IA ».</p>
      ${r.status === 'error' ? `<p style="color:var(--danger)">Dernière analyse interrompue : ${esc(r.error || '')}</p>` : ''}${guards}
      <button class="btn primary" id="mj-go" style="width:100%;margin-top:12px">Lancer l’analyse</button><p class="fhint" style="text-align:center">Compte 20 à 30 minutes pour une grosse boîte Gmail.</p>`;
    $('#mj-go').onclick = async () => { $('#mj-go').disabled = true; try { await rapi('/menage/start', { method: 'POST' }); } catch (e) { toast(e.message); } renderMenage(); };
    return;
  }
  const groups = r.groups || [], vir = groups.filter(g => g.v === 'virer' && !g.applied), kept = groups.filter(g => g.v !== 'virer'), done = groups.filter(g => g.applied);
  // Expéditeurs mixtes (pubs + commandes/factures) : décochés par défaut, leurs factures restent de toute façon
  const sel = new Set(LS.get('mjSel', null) || vir.filter(g => g.kept / (g.count + g.kept) < 0.2).map(g => g.key));
  const total = () => vir.filter(g => sel.has(g.key)).reduce((a, g) => a + g.count, 0);
  const row = (g, chk) => `<label class="mj-row">${chk ? `<input type="checkbox" data-k="${esc(g.key)}" ${sel.has(g.key) ? 'checked' : ''}>` : ''}<span class="mj-av">${esc(initials(g.name))}</span><span class="mj-nm"><b>${esc(g.name)}</b><small>${esc(g.why || '')}${g.kept ? ' · ' + g.kept + ' commandes/factures gardées' : ''}</small><small class="mj-sub">${esc((g.subjects || []).join(' · '))}</small></span><span class="mj-n">${fmt(g.count)}</span></label>`;
  let showAll = false;
  const draw = () => {
    const list = showAll ? vir : vir.slice(0, 25);
    box.innerHTML = `<p class="fhint" style="margin:0 0 8px">Analyse du ${esc(new Date(r.end || r.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} · ${fmt(r.scanned)} mails lus</p>
      <div class="mj-met"><div><b>${fmt(vir.reduce((a, g) => a + g.count, 0))}</b><span>mails de pub proposés</span></div><div><b>${vir.length}</b><span>expéditeurs</span></div></div>
      ${guards}
      ${vir.length ? `<h2 class="sec"><span>Proposés au ménage</span><button class="sec-btn" id="mj-all">${sel.size ? 'Tout décocher' : 'Tout cocher'}</button></h2><div class="card">${list.map(g => row(g, true)).join('')}${vir.length > list.length ? `<button class="mj-more" id="mj-more">Voir les ${vir.length - list.length} autres</button>` : ''}</div>` : '<div class="empty">Rien à virer : ta boîte est propre.</div>'}
      ${kept.length ? `<details class="mj-kept"><summary>Gardés par l’IA · ${kept.length} expéditeurs</summary><div class="card">${kept.slice(0, 80).map(g => row(g, false)).join('')}</div></details>` : ''}
      ${done.length ? `<p class="fhint">${fmt(r.applied)} mails déjà rangés dans « Ménage IA ».</p>` : ''}
      <div class="mj-foot">${vir.length ? `<button class="btn primary" id="mj-apply">Ranger ${fmt(total())} mails dans « Ménage IA »</button>` : ''}
        <div class="mj-2"><button class="btn" id="mj-open">Ouvrir le dossier</button><button class="btn danger" id="mj-empty">Vider le dossier</button></div>
        <button class="btn" id="mj-again">Relancer une analyse</button></div>`;
    $$('[data-k]', box).forEach(c => c.onchange = () => { c.checked ? sel.add(c.dataset.k) : sel.delete(c.dataset.k); LS.set('mjSel', [...sel]); const b = $('#mj-apply'); if (b) b.textContent = 'Ranger ' + fmt(total()) + ' mails dans « Ménage IA »'; });
    const all = $('#mj-all'); if (all) all.onclick = () => { if (sel.size) sel.clear(); else vir.forEach(g => sel.add(g.key)); LS.set('mjSel', [...sel]); draw(); };
    const more = $('#mj-more'); if (more) more.onclick = () => { showAll = true; draw(); };
    const ap = $('#mj-apply'); if (ap) ap.onclick = async () => {
      const keys = vir.filter(g => sel.has(g.key)).map(g => g.key); if (!keys.length) { toast('Coche au moins un expéditeur'); return; }
      ap.disabled = true; ap.textContent = 'Rangement en cours…';
      try { const o = await rapi('/menage/apply', { method: 'POST', body: { keys } }); LS.del('mjSel'); Object.keys(state.lists).forEach(k => delete state.lists[k]); badgeNow(0); toast(fmt(o.gmail + o.free) + ' mails rangés dans « Ménage IA »'); renderMenage(); }
      catch (e) { ap.disabled = false; toast('Échec : ' + e.message); draw(); }
    };
    $('#mj-open').onclick = async () => { try { const ls = await getLabels(true); const l = ls.find(x => x.name === 'Ménage IA'); if (l) location.hash = '#/list/' + encodeURIComponent(l.id); else if (freeOn() && r.applied) location.hash = '#/list/F:MENAGE'; else toast('Le dossier est encore vide : clique d’abord sur « Ranger »'); } catch (e) { toast(e.message); } };
    $('#mj-empty').onclick = async () => { if (!confirm('Envoyer tout le dossier « Ménage IA » à la corbeille ? (récupérable 30 jours)')) return; try { const o = await rapi('/menage/empty', { method: 'POST' }); toast(fmt(o.gmail + o.free) + ' mails envoyés à la corbeille'); } catch (e) { toast(e.message); } };
    $('#mj-again').onclick = async () => { if (!confirm('Relancer une analyse complète ?')) return; LS.del('mjSel'); try { await rapi('/menage/start', { method: 'POST' }); } catch (e) { toast(e.message); } renderMenage(); };
  };
  draw();
}
/* ---------- Envois programmés et rappels « pas de réponse » ---------- */
async function renderScheduled() {
  const v = $('#view');
  v.innerHTML = `<div class="top"><a class="back" href="#/labels">${ICON.back}Dossiers</a></div><h1 class="thread-title">Programmés et relances</h1><div id="sch"><div class="loading">Chargement…</div></div>`;
  let r;
  try { r = await rapi('/scheduled'); } catch (e) { $('#sch').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const when = ms => new Date(ms).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) + ' à ' + new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const items = r.items || [], fol = (r.follows || []).filter(f => !f.done);
  $('#sch').innerHTML = (items.length ? `<h2 class="sec">Envois programmés · ${items.length}</h2><div class="card">${items.map(x => `<div class="sch-row"><span class="sch-b"><b>${esc(x.subject)}</b><small>À ${esc(x.to)} · ${x.failed ? '⚠️ échec : ' + esc(x.failed) : esc(when(x.at))}${x.followDays ? ' · relance ' + x.followDays + ' j' : ''}</small></span><button class="btn" data-now="${esc(x.id)}">Envoyer</button><button class="btn danger" data-cx="${esc(x.id)}">Annuler</button></div>`).join('')}</div>` : '')
    + (fol.length ? `<h2 class="sec">Rappels « pas de réponse » · ${fol.length}</h2><div class="card">${fol.map(x => `<div class="sch-row"><span class="sch-b"><b>${esc(x.subject)}</b><small>${esc(x.to || x.toEmail)} · vérifié le ${esc(when(x.due))}</small></span><button class="btn" data-fx="${esc(x.id)}">Retirer</button></div>`).join('')}</div>` : '')
    || '<div class="empty">Rien de programmé. Dans Écrire : « Envoyer plus tard » et « Relance si pas de réponse ».</div>';
  $$('[data-cx]').forEach(b => b.onclick = async () => { try { await rapi('/schedule/cancel', { method: 'POST', body: { id: b.dataset.cx } }); toast('Envoi annulé'); renderScheduled(); } catch (e) { toast(e.message); } });
  $$('[data-now]').forEach(b => b.onclick = async () => { b.disabled = true; try { await rapi('/schedule/now', { method: 'POST', body: { id: b.dataset.now } }); toast('Message envoyé'); renderScheduled(); } catch (e) { b.disabled = false; toast(e.message); } });
  $$('[data-fx]').forEach(b => b.onclick = async () => { try { await rapi('/follow/cancel', { method: 'POST', body: { id: b.dataset.fx } }); toast('Rappel retiré'); renderScheduled(); } catch (e) { toast(e.message); } });
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
    <a class="set-link" href="#/waiting"><span class="set-t">⏳ En attente</span><span class="set-s">Sans réponse</span><span class="chev-r" aria-hidden="true"></span></a>
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
        + (LS.get('outboxN', 0) ? `<a class="set-link" href="#/outbox"><span class="set-t">📤 À envoyer · ${LS.get('outboxN', 0)}</span><span class="set-s">Sans réseau</span><span class="chev-r" aria-hidden="true"></span></a>` : '')
        + `<a class="set-link" href="#/menage"><span class="set-t">✦ Ménage IA</span><span class="set-s">Virer les pubs</span><span class="chev-r" aria-hidden="true"></span></a>`
        + `<a class="set-link" href="#/blocked"><span class="set-t">⛔️ Bloqués</span><span class="set-s">Expéditeurs bloqués</span><span class="chev-r" aria-hidden="true"></span></a>`
        + `<a class="set-link" href="#/scheduled"><span class="set-t">⏱ Programmés</span><span class="set-s">Envois et relances</span><span class="chev-r" aria-hidden="true"></span></a>`
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
