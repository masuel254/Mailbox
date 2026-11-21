'use strict';
/* ---------- Accueil « Aujourd'hui » : ce qui compte ce matin, en un écran ----------
   En bref (IA) · À traiter (non lus de vraies personnes) · Agenda du jour · En attente de réponse · Revient aujourd'hui */
async function todayMails() {
  let items = [];
  if (useIndex(curAcc())) {
    const ix = await rapi('/inbox');
    if (ix && ix.v) { applyIndex(ix); items = (ix.g || []).map(t => Object.assign(summarize(t), { acc: 'gmail' })).concat((ix.f || []).map(freeItem)); }
  } else {
    const jobs = [];
    if (settings.clientId || relayGmailOn()) jobs.push((async () => { const r = (await api('threads?' + new URLSearchParams({ q: 'in:inbox is:unread', maxResults: 30 }))) || {}; const ts = await pool(r.threads || [], 8, t => threadMeta(t).catch(() => null)); ts.filter(Boolean).forEach(t => items.push(Object.assign(summarize(t), { acc: 'gmail' }))); })());
    if (freeOn()) jobs.push(rapi('/free/list?' + new URLSearchParams({ folder: 'INBOX', unread: '1', limit: '30' })).then(r => (r.items || []).forEach(x => items.push(freeItem(x)))).catch(() => {}));
    await Promise.all(jobs);
  }
  return items.filter(i => i.unread && !isGone(i.id) && !i.promo && !i.spam && !NOREPLY_RE.test(i.fromEmail || '') && !isMe(i.fromEmail || '')).sort((a, b) => b.date - a.date);
}
async function todayAgenda() {
  const from = startOfDay(new Date()), to = addDays(from, 1), out = [];
  const p = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: 50 });
  const jobs = [gx('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + p).then(r => ((r || {}).items || []).filter(e => e.status !== 'cancelled').forEach(e => { const t = evTimes(e); out.push({ s: t.s, e: t.e, allDay: t.allDay, title: e.summary || '(sans titre)', loc: e.location || '', src: 'Google', color: EV_COLORS[e.colorId] || '#8fb6ff' }); })).catch(() => {})];
  if (relayOn()) jobs.push(rapi('/timetree/events?' + new URLSearchParams({ from: from.getTime(), to: to.getTime() })).then(r => (r.items || []).forEach(x => { const s = x.allDay ? new Date(x.date + 'T00:00') : new Date(x.start), e = x.allDay ? addDays(new Date(x.endDate + 'T00:00'), 1) : new Date(x.end); if (s < to && e > from) out.push({ s, e, allDay: x.allDay, title: x.title, loc: x.location || mapLinkIn(x.note), src: 'TimeTree · ' + x.cal, color: x.color || '#4caf8f' }); })).catch(() => {}));
  await Promise.all(jobs);
  return out.sort((a, b) => (b.allDay - a.allDay) || (a.s - b.s));
}
async function todayWaiting(force) {
  const c = LS.get('todayWait', null);
  if (c && !force && Date.now() - c.at < 30 * 60000) return c.items;
  const items = [], day = 864e5, now = Date.now();
  const jobs = [];
  if (settings.clientId || relayGmailOn()) jobs.push((async () => {
    const r = (await api('threads?' + new URLSearchParams({ q: 'in:sent newer_than:14d older_than:3d', maxResults: 12 }))) || {};
    const ts = await pool(r.threads || [], 4, t => threadMeta(t).catch(() => null));
    ts.filter(Boolean).forEach(t => { const ms = t.messages || [], last = ms[ms.length - 1] || {}; const tos = splitAddrs(hdr(last, 'To')).map(parseAddr).filter(x => x.email && !isMe(x.email)); if ((last.labelIds || []).includes('SENT') && +last.internalDate < now - 3 * day && tos.length) items.push({ id: t.id, acc: 'gmail', subject: hdr(ms[0], 'Subject') || '(sans objet)', to: tos[0].name || tos[0].email, toEmail: tos[0].email.toLowerCase(), date: +last.internalDate }); });
  })().catch(() => {}));
  if (freeOn()) jobs.push(rapi('/free/waiting').then(r => (r.theirs || []).forEach(x => { const it = freeItem(x); items.push({ id: it.id, acc: 'free', folder: it.folder, uid: it.uid, subject: it.subject, to: it.to, toEmail: it.toEmail, date: it.date }); })).catch(() => {}));
  await Promise.all(jobs);
  items.sort((a, b) => a.date - b.date);
  LS.set('todayWait', { at: Date.now(), items: items.slice(0, 8) });
  return items.slice(0, 8);
}
let todayT = null;
function onIndexChange() { if ((location.hash || '').startsWith('#/today')) { clearTimeout(todayT); todayT = setTimeout(() => renderToday(false, true), 1200); } }
async function renderToday(force, quiet) {
  const v = $('#view');
  const now = new Date();
  const hello = now.getHours() < 5 ? 'Bonne nuit' : now.getHours() < 18 ? 'Bonjour' : 'Bonsoir';
  const first = String(settings.myName || '').trim();
  if (!quiet || !$('#td')) v.innerHTML = `<div class="sticky-head"><div class="top"><div class="td-hello"><h1>${esc(hello + (first ? ' ' + first : ''))}</h1><small>${esc(now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}</small></div>
      <button class="icon-btn" id="btn-refresh" aria-label="Actualiser">${ICON.refresh}</button><a class="icon-btn" href="#/settings" aria-label="Réglages">${ICON.gear}</a></div>
      <div class="home-seg" role="tablist"><a role="tab" aria-selected="true" class="on" href="#/today">Aujourd’hui</a><a role="tab" aria-selected="false" href="#/list/INBOX">Tous les mails<span id="seg-n"></span></a></div></div>
    <div id="td"><div class="td-brief" id="td-brief"><b>✦ En bref</b><span class="td-load">Je prépare ta journée…</span></div>
    <h2 class="sec" id="td-mh">À traiter</h2><div class="card td-card" id="td-mails"><div class="loading">Chargement…</div></div>
    <h2 class="sec"><span>Agenda du jour</span><a class="sec-btn" href="#/agenda">Semaine</a></h2><div class="card td-card" id="td-ag"><div class="loading">Chargement…</div></div>
    <div id="td-wait"></div><div id="td-snz"></div></div>`;
  const rb = $('#btn-refresh'); if (rb) rb.onclick = () => renderToday(true);
  const sn = $('#seg-n'); if (sn && state.counts && state.counts.own) sn.textContent = ' · ' + state.counts.own;
  state.listCtx = null; state.current = 'today';
  const [mails, ag, wait, snz] = await Promise.all([
    todayMails().catch(e => { if (e.message !== 'auth') toast(e.message); return []; }),
    todayAgenda().catch(() => []),
    todayWaiting(force).catch(() => []),
    relayOn() ? rapi('/snoozed').then(r => (r.items || []).filter(x => x.until < addDays(startOfDay(new Date()), 1).getTime())).catch(() => []) : Promise.resolve([])
  ]);
  if (!$('#td')) return;
  // Agenda du jour
  const hm = d => hhmm(d);
  $('#td-ag').innerHTML = ag.length ? ag.map(x => { const soon = !x.allDay && x.s > now ? Math.round((x.s - now) / 60000) : null;
    return `<a class="td-ev" href="#/agenda" data-day="1"><span class="td-t">${x.allDay ? 'Journée' : hm(x.s)}</span><span class="td-eb" style="--c:${esc(x.color)}"><b>${esc(x.title)}</b><small>${x.loc ? locChip(x.loc) + ' · ' : ''}${esc(x.src)}${soon !== null && soon < 600 ? ' · dans ' + (soon >= 60 ? Math.floor(soon / 60) + ' h ' + String(soon % 60).padStart(2, '0') : soon + ' min') : ''}</small></span></a>`; }).join('') : '<div class="empty small">Rien de prévu aujourd’hui.</div>';
  $$('[data-day]', $('#td-ag')).forEach(a => a.onclick = () => { state.agDay = startOfDay(new Date()); LS.set('agMode', 'day'); });
  // En attente de réponse
  $('#td-wait').innerHTML = wait.length ? `<h2 class="sec">En attente de réponse · ${wait.length}</h2><div class="card td-card">${wait.map((w, i) => { const d = Math.floor((Date.now() - w.date) / 864e5);
    return `<div class="td-w"><a href="${w.acc === 'free' ? '#/free/' + encodeURIComponent(w.folder) + '/' + w.uid : '#/thread/' + encodeURIComponent(w.id)}"><b>${esc(w.to || w.toEmail)} · ${esc(w.subject)}</b><small>Envoyé il y a ${d} jour${d > 1 ? 's' : ''}</small></a><button class="btn" data-rel="${i}">Relancer</button></div>`; }).join('')}</div>` : '';
  $$('[data-rel]').forEach(b => b.onclick = () => { const w = wait[+b.dataset.rel]; state.composeFrom = { mode: 'new', to: w.to && w.to !== w.toEmail ? '"' + w.to.replace(/"/g, '') + '" <' + w.toEmail + '>' : w.toEmail, subject: /^re\s*:/i.test(w.subject) ? w.subject : 'Re: ' + w.subject, prefill: 'Bonjour,\n\nJe me permets de revenir vers vous concernant mon message du ' + new Date(w.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + '. Avez-vous pu en prendre connaissance ?\n\nBien cordialement,\n' }; location.hash = '#/compose?mode=new&t=' + Date.now(); });
  // Revient aujourd'hui
  $('#td-snz').innerHTML = snz.length ? `<h2 class="sec">Revient aujourd’hui</h2><div class="card td-card">${snz.map(x => `<div class="td-w"><span><b>${esc(x.from || 'Mail')} · ${esc(x.subject)}</b><small>Revient à ${esc(new Date(x.until).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))}</small></span></div>`).join('')}</div>` : '';
  // À traiter + En bref : l'IA trie les non lus ; sans IA, on garde les mails de personnes réelles
  let pick = mails.slice(0, 6).map(m => ({ m, tag: '' })), resume = '';
  const waitLines = wait.map(w => w.to + ' · ' + w.subject + ' · sans réponse depuis ' + Math.floor((Date.now() - w.date) / 864e5) + ' j');
  const agLines = ag.map(x => (x.allDay ? 'journée' : hm(x.s)) + ' · ' + x.title + (x.loc && !isMapUrl(x.loc) ? ' · ' + x.loc : ''));
  if (settings.ai && relayOn() && mails.length + ag.length + wait.length) {
    const sig = mails.map(m => m.id).join(',') + '|' + agLines.join(',') + '|' + waitLines.length + '|' + dayKey(now);
    let ai = LS.get('todayAI', null);
    if (!ai || ai.sig !== sig || force) {
      try {
        const r = await rapi('/ai/today', { method: 'POST', body: { now: now.toLocaleString('fr-FR'), mails: mails.slice(0, 40).map((m, i) => ({ i, from: m.fromName || m.from, email: m.fromEmail, subject: m.subject, snippet: m.snippet })), agenda: agLines, waiting: waitLines } });
        ai = { sig, r }; LS.set('todayAI', ai);
      } catch (e) { ai = null; }
    }
    if (ai && ai.r) { resume = ai.r.resume || ''; if (Array.isArray(ai.r.mails)) pick = ai.r.mails.filter(x => mails[x.i]).slice(0, 6).map(x => ({ m: mails[x.i], tag: x.tag || '' })); }
  }
  if (!$('#td')) return;
  if (!resume) { const parts = []; parts.push(pick.length ? pick.length + ' mail' + (pick.length > 1 ? 's' : '') + ' à traiter' : 'Aucun mail important en attente'); const timed = ag.filter(x => !x.allDay); if (ag.length) parts.push(ag.length + ' événement' + (ag.length > 1 ? 's' : '') + ' aujourd’hui' + (timed.length ? ', le premier à ' + hm(timed[0].s) : '')); if (wait.length) parts.push(wait.length + ' mail' + (wait.length > 1 ? 's' : '') + ' sans réponse'); resume = parts.join(' · ') + '.'; }
  $('#td-brief').innerHTML = `<b>✦ En bref</b><span>${esc(resume)}</span>`;
  $('#td-mh').innerHTML = `<span>À traiter${pick.length ? ' · ' + pick.length : ''}</span>${mails.length > pick.length ? `<a class="sec-btn" href="#/list/UNREAD">Tous les non lus · ${mails.length}</a>` : ''}`;
  state.showAcc = freeOn(); state.dayMode = false;
  $('#td-mails').innerHTML = pick.length ? pick.map(x => { let h = itemHTML(x.m, 'u'); if (x.tag) h = h.replace('<span class="chips">', `<span class="chips"><span class="chip tagc">${esc(x.tag)}</span>`); return h; }).join('') : '<div class="empty small">Rien qui attende une réponse de ta part.</div>';
}
