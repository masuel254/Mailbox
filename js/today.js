'use strict';
/* ---------- Accueil « Aujourd'hui » : ce qui compte ce matin, en un écran ----------
   En bref (IA) · À traiter (non lus de vraies personnes) · Agenda du jour · En attente de réponse · Revient aujourd'hui */
async function todayMails() {
  let items = [];
  let done = false;
  if (useIndex(curAcc())) {
    const ix = await rapi('/inbox').catch(() => null);
    if (ix && ix.v && ix.gReady !== false && ix.fReady !== false && !(ix.err && (ix.err.gmail || ix.err.free))) { applyIndex(ix); items = (ix.g || []).flatMap(t => gRows(t, 'INBOX')).concat((ix.f || []).map(freeItem)); done = true; }
  }
  if (!done) {
    const jobs = [];
    if (settings.clientId || relayGmailOn()) jobs.push((async () => { const r = (await api('threads?' + new URLSearchParams({ q: 'in:inbox is:unread', maxResults: 30 }))) || {}; const ts = await pool(r.threads || [], 8, t => threadMeta(t).catch(() => null)); ts.filter(Boolean).forEach(t => gRows(t, 'INBOX').forEach(i => items.push(i))); })());
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
  let fol = [];
  if (relayOn()) jobs.push(loadFollows(force).then(r => { fol = r; }).catch(() => {}));
  await Promise.all(jobs);
  items.sort((a, b) => a.date - b.date);
  // mails marqués « J'attends une réponse » : en tête, même envoyés aujourd'hui ; ils remplacent la détection automatique du même mail
  const fItems = fol.map(f => ({ id: 'fw:' + f.id, fid: f.id, acc: f.acc, folder: f.folder, uid: f.uid, threadId: f.threadId, subject: f.subject, to: f.to, toEmail: f.toEmail, date: f.sentAt, due: f.due, done: f.done }));
  const key = x => (x.toEmail || '').toLowerCase() + '|' + String(x.subject || '').replace(/^((re|tr|fwd?)\s*:\s*)+/i, '').trim().toLowerCase();
  const fk = new Set(fItems.map(key));
  const all = fItems.concat(items.filter(x => !fk.has(key(x))).slice(0, 8));
  LS.set('todayWait', { at: Date.now(), items: all });
  return all;
}
let todayT = null;
function onIndexChange() { if ((location.hash || '').startsWith('#/today')) { clearTimeout(todayT); todayT = setTimeout(() => { if ((location.hash || '').startsWith('#/today')) renderToday(false, true); }, 1200); } }
async function renderToday(force, quiet) {
  clearTimeout(todayT);
  const v = $('#view');
  // écran quitté entre-temps : on ne réaffiche surtout pas l'accueil par-dessus
  const h0 = location.hash || '';
  if (h0 && !h0.startsWith('#/today') && !(h0 === '' && settings.home === 'today')) return;
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
  let [mails, ag, wait, snz] = await Promise.all([
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
  // En attente de réponse (sans les mails envoyés à soi-même, ni ceux retirés d'un glissement)
  const hidden = new Set(LS.get('waitHide', []));
  wait = wait.filter(w => !hidden.has(w.id) && !isMe(w.toEmail || ''));
  // une ligne ouverte (bouton Retirer visible) : on ne redessine pas la liste par-dessus (actualisations automatiques)
  const keepOpen = !!document.querySelector('#td-wait .td-w[data-open]');
  if (!keepOpen) $('#td-wait').innerHTML = wait.length ? `<h2 class="sec">En attente de réponse · ${wait.length}</h2><div class="card td-card">${wait.map((w, i) => { const d = Math.floor((Date.now() - w.date) / 864e5);
    return `<div class="td-swipe"><button type="button" class="td-del" data-hide="${esc(w.id)}"><span style="font-size:1.1rem">✕</span><small>Retirer</small></button><div class="td-w"><a href="${w.acc === 'free' ? '#/free/' + encodeURIComponent(w.folder) + '/' + w.uid : '#/thread/' + encodeURIComponent(w.threadId || w.id)}"><b>${w.fid ? '⏳ ' : ''}${esc(w.to || w.toEmail)} · ${esc(w.subject)}</b><small>${d < 1 ? 'Envoyé aujourd’hui' : 'Envoyé il y a ' + d + ' jour' + (d > 1 ? 's' : '')}${w.fid ? (w.done ? ' · relance faite, toujours rien' : ' · relance ' + esc(new Date(w.due).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }))) : ''}</small></a><button class="btn" data-rel="${i}">Relancer</button></div></div>`; }).join('')}</div>` : '';
  // glisser à gauche : « Retirer » (n'est plus suivi ici ; le mail n'est pas supprimé)
  if (!keepOpen) $$('#td-wait .td-w').forEach(row => {
    let x0 = 0, y0 = 0, dx = 0, on = null;
    row.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; on = null; $$('#td-wait .td-w[data-open]').forEach(r => { if (r !== row) { r.style.transform = ''; delete r.dataset.open; } }); }, { passive: true });
    row.addEventListener('touchmove', e => { const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0; if (on === null) on = Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my); if (!on) return;
      dx = Math.max(-110, Math.min(0, mx + (row.dataset.open ? -96 : 0))); row.style.transition = 'none'; row.style.transform = `translateX(${dx}px)`; }, { passive: true });
    row.addEventListener('touchend', () => { if (!on) return; row.dataset.sw = Date.now(); row.style.transition = ''; if (dx < -45) { row.style.transform = 'translateX(-96px)'; row.dataset.open = 1; } else { row.style.transform = ''; delete row.dataset.open; } });
    // le clic qu'iOS envoie juste après un glissement ne doit ni ouvrir le mail ni refermer le bouton
    row.addEventListener('click', e => { if (Date.now() - (+row.dataset.sw || 0) < 500) { e.preventDefault(); e.stopPropagation(); return; } if (row.dataset.open) { e.preventDefault(); e.stopPropagation(); row.style.transform = ''; delete row.dataset.open; } }, true);
  });
  if (!keepOpen) $$('[data-hide]').forEach(b => b.onclick = () => {
    const id = b.dataset.hide;
    // mail marqué « J'attends une réponse » : on arrête le suivi sur le relais (annulable)
    if (id.startsWith('fw:')) { const fid = id.slice(3), w0 = wait.find(x => x.id === id);
      rapi('/follow/cancel', { method: 'POST', body: { id: fid } }).then(() => loadFollows(true)).catch(e => toast(e.message));
      b.closest('.td-swipe').remove(); LS.del('todayWait'); const h = $('#td-wait .sec'); const n = $$('#td-wait .td-swipe').length; if (h) h.textContent = 'En attente de réponse · ' + n; if (!n) $('#td-wait').innerHTML = '';
      undoToast('Ne plus attendre', () => rapi('/follow', { method: 'POST', body: { acc: w0.acc, threadId: w0.threadId, folder: w0.folder, uid: w0.uid, to: w0.to, toEmail: w0.toEmail, subject: w0.subject, sentAt: w0.date, due: w0.due, days: Math.max(1, Math.round((w0.due - w0.date) / 864e5)), manual: true } }).then(() => { LS.del('todayWait'); return loadFollows(true); }).then(() => renderToday(false, true)));
      return; }
    const l = LS.get('waitHide', []); l.push(id); LS.set('waitHide', l.slice(-200));
    b.closest('.td-swipe').remove(); const h = $('#td-wait .sec'); const n = $$('#td-wait .td-swipe').length; if (h) h.textContent = 'En attente de réponse · ' + n; if (!n) $('#td-wait').innerHTML = '';
    undoToast('Retiré de « En attente »', () => { LS.set('waitHide', LS.get('waitHide', []).filter(x => x !== id)); renderToday(false, true); });
  });
  if (!keepOpen) $$('[data-rel]').forEach(b => b.onclick = () => { const w = wait[+b.dataset.rel]; state.composeFrom = { mode: 'new', to: w.to && w.to !== w.toEmail ? '"' + w.to.replace(/"/g, '') + '" <' + w.toEmail + '>' : w.toEmail, subject: /^re\s*:/i.test(w.subject) ? w.subject : 'Re: ' + w.subject, prefill: 'Bonjour,\n\nJe me permets de revenir vers vous concernant mon message du ' + new Date(w.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + '. Avez-vous pu en prendre connaissance ?\n\nBien cordialement,\n' }; location.hash = '#/compose?mode=new&t=' + Date.now(); });
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
