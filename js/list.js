'use strict';
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
    ${['INBOX', 'UNREAD'].includes(key) ? `<div class="home-seg" role="tablist"><a role="tab" aria-selected="false" href="#/today">Aujourd’hui</a><a role="tab" aria-selected="true" class="on" href="#/list/INBOX">Tous les mails<span id="seg-n">${state.counts && state.counts.own ? ' · ' + state.counts.own : ''}</span></a></div>` : ''}
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
  $('#btn-refresh').onclick = () => loadList(key, q, cacheKey, plain, 'fresh');
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
  // Sinon, copie plus complète gardée dans IndexedDB (tous les dossiers, lisible hors connexion)
  if (!cached && !isSearch) IDB.get('list:' + cacheKey).then(d => { if (d && d.v && d.v.items && state.current === cacheKey && !state.lists[cacheKey]) { state.lists[cacheKey] = Object.assign(d.v, { at: 0, stale: true }); drawList(state.lists[cacheKey], plain); } });
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
    // Réception et non lus : lus en un seul appel dans l'index tenu par le relais (même source que la pastille)
    if ((key === 'INBOX' || key === 'UNREAD') && !more && useIndex(acc)) {
      // Relais pas encore mis à jour (pas d'index) : lecture classique, sans bloquer
      const ix = await rapi('/inbox' + (reset === 'fresh' ? '?fresh=1' : '')).catch(e => { if (e.status === 404) state.noIndex = true; return null; });
      // Index incomplet (Gmail ou Free pas encore relu par le relais, ou en pause) : lecture classique
      const ready = ix && ix.v && (ix.gReady !== false || acc === 'free') && (ix.fReady !== false || acc === 'gmail') && (ix.gmail || acc === 'free' || !relayGmailOn());
      if (ready && !(ix.err && ((ix.err.gmail && acc !== 'free') || (ix.err.free && acc !== 'gmail')))) { applyIndex(ix, true); return; }
    }
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
    const data = { at: Date.now(), next, freeBefore, freeMore, items: more ? (ids => prev.items.concat(fresh.filter(i => !ids.has(i.id))))(new Set(prev.items.map(i => i.id))) : fresh, grown: !!more };
    state.lists[cacheKey] = data;
    if (['INBOX', 'UNREAD', 'SENT'].includes(key) && !more) { try { LS.set('list:' + cacheKey, { next: data.next, freeBefore: data.freeBefore, freeMore: data.freeMore, items: data.items.slice(0, 40) }); } catch (e) {} }
    if (key !== 'SEARCH' && !more) IDB.set('list:' + cacheKey, { at: Date.now(), v: { next: data.next, freeBefore: data.freeBefore, freeMore: data.freeMore, items: data.items.slice(0, 100) } });
    if (state.current === cacheKey) { const y = scrollY; drawList(data, plain); if (reset && y) scrollTo(0, y); }
    // Recherche de l'assistant qui ne trouve presque rien : on bascule seul sur la recherche par le sens
    if (key === 'SEARCH' && !more && settings.ai && state.aiNote && state.aiNote.q === q && !state.aiNote.auto && data.items.length < 3) { state.aiNote.auto = true; toast('Peu de résultats, je cherche par le sens…'); location.hash = '#/smart/' + encodeURIComponent(state.aiNote.ask); }
    if (key === 'INBOX' || key === 'UNREAD') updateBadge();
  } catch (e) {
    if (e.message === 'auth') return;
    const l = $('#list'); if (!l || state.current !== cacheKey) return;
    // Hors connexion : on garde la liste enregistrée à l'écran plutôt que de l'effacer
    if (state.lists[cacheKey] && state.lists[cacheKey].items && state.lists[cacheKey].items.length) toast('Hors connexion : liste enregistrée affichée');
    else l.innerHTML = `<div class="empty">Impossible de charger : ${esc(e.message)}</div>`;
  }
}

/* ---------- Index de la réception tenu par le relais ----------
   Une seule source pour la liste, les compteurs et la pastille ; le relais prévient dès qu'elle change (attente longue). */
const useIndex = acc => relayOn() && (relayGmailOn() || (acc === 'free' && freeOn())) && !settings.noIndex && !state.noIndex;
function applyIndex(ix, direct) {
  if (!ix || !ix.v) return;
  state.ixV = ix.v;
  const g = (ix.g || []).map(t => Object.assign(summarize(t), { acc: 'gmail' }));
  const f = (ix.f || []).map(freeItem);
  const accs = freeOn() ? ['all', 'gmail', 'free'] : ['gmail'];
  accs.forEach(a => ['INBOX', 'UNREAD'].forEach(k => {
    const ck = (a !== 'gmail' ? a + '|' : '') + k;
    const prev = state.lists[ck];
    // une liste déjà allongée (« plus anciens ») garde ses mails anciens, seuls les récents sont remplacés
    let items = (a === 'free' ? [] : g).concat(a === 'gmail' ? [] : f).filter(i => k === 'INBOX' || i.unread).sort((x, y) => y.date - x.date);
    if (prev && prev.grown && k === 'INBOX') { const ids = new Set(items.map(i => i.id)); const oldest = items.length ? items[items.length - 1].date : 0; items = items.concat(prev.items.filter(i => !ids.has(i.id) && i.date < oldest)); }
    const data = { at: Date.now(), ix: ix.v, next: prev && prev.grown ? prev.next : k === 'INBOX' && a !== 'free' ? ix.gNext : null, freeBefore: prev && prev.grown ? prev.freeBefore : ix.fBefore, freeMore: prev && prev.grown ? prev.freeMore : k === 'INBOX' && a !== 'gmail' ? ix.fMore : false, items, grown: prev && prev.grown };
    state.lists[ck] = data;
    IDB.set('list:' + ck, { at: Date.now(), v: { next: data.next, freeBefore: data.freeBefore, freeMore: data.freeMore, items: items.slice(0, 100) } });
    if (k === 'INBOX' || k === 'UNREAD') { try { LS.set('list:' + ck, { next: data.next, freeBefore: data.freeBefore, freeMore: data.freeMore, items: items.slice(0, 40) }); } catch (e) {} }
    if (state.current === ck && !state.sel && $('#list')) { const y = scrollY; drawList(data, false); if (y) scrollTo(0, y); }
  }));
  if (ix.badge) paintBadge(ix.badge);
  if (ix.err && (ix.err.gmail || ix.err.free) && direct) toast((ix.err.gmail ? 'Gmail : ' + ix.err.gmail : 'Free : ' + ix.err.free));
  if (typeof onIndexChange === 'function') onIndexChange();
}
let ixLoop = false;
async function watchInbox() {
  if (ixLoop || !useIndex(curAcc())) return;
  ixLoop = true;
  try {
    while (document.visibilityState === 'visible' && useIndex(curAcc())) {
      let r = null;
      try { r = await rapi('/inbox?wait=1&v=' + (state.ixV || 0)); } catch (e) { if (e.status === 404) { state.noIndex = true; break; } await sleep(20000); continue; }
      if (r && r.same) { if (r.badge) paintBadge(r.badge); } else if (r && r.gReady !== false && r.fReady !== false) applyIndex(r); else if (r) { state.ixV = r.v; if (r.badge) paintBadge(r.badge); }
    }
  } finally { ixLoop = false; }
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
  const auto = it.promo || NOREPLY_RE.test(it.fromEmail || '') ? ' auto' : '';
  return `<a class="item ${cls}${sel}${auto}" data-id="${esc(it.id)}" href="${href}">
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
    if (lastOwn !== null && own !== lastOwn && !useIndex(curAcc())) refreshVisibleList();
    lastOwn = own;
    paintCounts(n, own, cnt);
  } catch (e) {}
}
// Pastille, compteur « Non lus » et compteurs par compte : toujours écrits ensemble, depuis les mêmes chiffres
function paintBadge(r) { const n = r.total || 0, a = curAcc(); paintCounts(n, a === 'free' ? r.free || 0 : a === 'gmail' ? r.gmail || 0 : n, { all: n, gmail: r.gmail || 0, free: r.free || 0 }); }
function paintCounts(n, own, cnt) {
  const b = $('#badge-inbox'); if (b) { b.hidden = !n; b.textContent = n > 99 ? '99+' : n; }
  const f = $('#fcount'); if (f) f.textContent = own ? '· ' + own : '';
  const sn = $('#seg-n'); if (sn) sn.textContent = own ? ' · ' + own : '';
  if (cnt) $$('.acc-n').forEach(el => { const v = cnt[el.dataset.n] || 0; el.textContent = v ? v + ' non lu' + (v > 1 ? 's' : '') : 'à jour'; });
  state.counts = { n, own, cnt };
  if (navigator.setAppBadge) { n ? navigator.setAppBadge(n).catch(() => {}) : navigator.clearAppBadge().catch(() => {}); }
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
    // Appui long : menu d'actions du mail (en mode sélection, il coche simplement le mail)
    timer = setTimeout(() => { longDone = true; if (navigator.vibrate) navigator.vibrate(15); if (state.sel) toggleSel(a); else mailMenu(a); }, 480);
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
/* Menu d'un mail (appui long) : chaque action se fait en un geste, avec « Annuler » dans le bandeau */
function mailMenu(a) {
  const id = a.dataset.id, it = findItem(id); if (!it) return;
  const ctx = { acc: it.acc, id: it.id, subject: it.subject, from: it.fromName || it.from, fromEmail: it.fromEmail, folder: it.folder, uid: it.uid, fromList: true };
  openSheet(`<span class="grip"></span><h2 class="am-t">${esc(it.fromName || it.from)}</h2><p class="fhint am-s">${esc(it.subject)}</p>
    <div class="amenu">
      <button class="btn" data-a="${it.unread ? 'read' : 'unread'}">${ICON.unread}${it.unread ? 'Marquer lu' : 'Marquer non lu'}</button>
      <button class="btn" data-a="star">${it.starred ? ICON.starOn + 'Ne plus suivre' : ICON.star + 'Suivre'}</button>
      <button class="btn" data-a="snooze">${ICON.clock}Plus tard</button>
      <button class="btn" data-a="archive">${ICON.archive}Archiver</button>
      <span id="am-sug" class="am-wide"></span>
      <button class="btn am-wide" data-a="file">${ICON.tag}Classer dans…</button>
      <button class="btn danger" data-a="trash">${ICON.trash}Supprimer</button>
      <button class="btn" data-a="block">${ICON.block}Bloquer</button>
      ${it.fromEmail ? `<button class="btn am-wide" data-a="clean">${ICON.trash}Tous les mails de ${esc(it.fromName || it.fromEmail)}</button>` : ''}
      <button class="btn am-wide" data-a="select">${ICON.check}Sélectionner plusieurs mails</button>
    </div>`);
  const go = async k => {
    closeSheet();
    if (k === 'read' || k === 'unread' || k === 'trash' || k === 'archive') return swipeAct(id, k);
    if (k === 'snooze') return snoozeSheet(ctx);
    if (k === 'block') return quickBlock(it);
    if (k === 'clean') return senderCleanSheet(it.fromEmail, it.fromName || it.from, null);
    if (k === 'select') { enterSelect(); const row = $(`#list a.item[data-id="${CSS.escape(id)}"]`); if (row) toggleSel(row); return; }
    if (k === 'file') return it.acc === 'free' ? freeMoveSheet(id, it.folder, it.uid) : labelSheet(id, it.labels);
    if (k === 'star') {
      if (it.starred) return unstarRow(id);
      try { if (it.acc === 'free') await rapi('/free/flags', { method: 'POST', body: { folder: it.folder, uids: [it.uid], flagged: true } }); else await api('threads/' + id + '/modify', { method: 'POST', body: { addLabelIds: ['STARRED'] } });
        patchCached(id, i => Object.assign({}, i, { starred: true })); reDraw(); toast('Mail suivi'); } catch (e) { toast(e.message); }
    }
  };
  $$('.amenu [data-a]').forEach(b => b.onclick = () => go(b.dataset.a));
  // Classer en un geste : le dossier où sont déjà les mails de cet expéditeur
  if (it.acc === 'gmail' && it.fromEmail) getLabels().then(ls => suggestFolder(ctx, ls.filter(l => l.type === 'user' && l.name !== BLOCK_LABEL).map(l => ({ key: l.id, name: l.name })), (key, why) => {
    const box = $('#am-sug'), l = labelById(key); if (!box || !l) return;
    box.innerHTML = `<button class="btn primary" id="am-file">${ICON.tag}Classer dans « ${esc(l.name)} »</button><small class="fhint">${esc(why)}</small>`;
    $('#am-file').onclick = async () => {
      closeSheet(); hideGone([id]);
      try {
        await api('threads/' + id + '/modify', { method: 'POST', body: { addLabelIds: [key], removeLabelIds: ['INBOX'] } });
        Object.entries(state.lists).forEach(([k, d]) => { d.items = d.items.filter(i => i.id !== id || !['INBOX', 'UNREAD'].includes(keyOf(k))); }); reDraw();
        undoToast('Classé dans « ' + l.name + ' »', () => api('threads/' + id + '/modify', { method: 'POST', body: { addLabelIds: ['INBOX'], removeLabelIds: [key] } }));
        badgeNow(0);
      } catch (e) { gone.delete(id); reDraw(); toast(e.message); }
    };
  })).catch(() => {});
}
async function swipeAct(id, kind) {
  let r;
  if (kind === 'trash') hideGone([id]);
  try { r = await act([id], kind); } catch (e) { gone.delete(id); reDraw(); return; }
  if (!r.ok) { gone.delete(id); toast('Action impossible'); reDraw(); return; }
  Object.entries(state.lists).forEach(([k, d]) => { d.items = d.items.map(i => i.id === id ? ACT_PATCH[kind](i, k) : i).filter(Boolean); });
  reDraw();
  undoToast(kind === 'trash' ? 'Mail supprimé' : kind === 'archive' ? 'Mail archivé' : kind === 'read' ? 'Marqué comme lu' : 'Marqué comme non lu', r.undo);
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
  // Hors connexion : l'action est notée et rejouée au retour du réseau
  if (!navigator.onLine) { queueAction({ t: 'act', ids, kind }); toast('Hors connexion : fait au retour du réseau'); return { ok: ids.length, undo: async () => { LS.set('pendingActs', LS.get('pendingActs', []).filter(a => !(a.t === 'act' && a.kind === kind && a.ids.join() === ids.join()))); } }; }
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
