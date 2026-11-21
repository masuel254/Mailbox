'use strict';
/* ---------- Pertinence : lire dans le corps des mails ----------
   Gmail trouve les mails qui contiennent les mots, mais les trie par date et son extrait (snippet) ne montre que le début.
   Ici on lit le texte des meilleurs candidats, on repère le passage où les mots apparaissent ensemble et on note chaque mail. */
const STOPW = new Set(['le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'ou', 'a', 'à', 'au', 'aux', 'en', 'pour', 'par', 'sur', 'mon', 'ma', 'mes', 'avec', 'dans', 'que', 'qui', 'd', 'l']);
const searchWords = q => [...new Set(nrm(String(q).replace(/\b(from|to|subject|in|is|has|label|category|after|before|newer_than|older_than|larger|filename):\S*/gi, ' ').replace(/[()"]/g, ' ').replace(/\bOR\b/g, ' ')).split(/[^a-z0-9@.\-]+/).filter(w => w.length > 1 && !STOPW.has(w)))];
const bodyCache = new Map();
async function threadText(id, g) {
  if (bodyCache.has(id)) return bodyCache.get(id);
  const t = await (g != null ? bgApi('threads/' + id + '?format=full', g) : api('threads/' + id + '?format=full')).catch(() => null);
  if (!t && g != null && !bgAlive(g)) return '';
  const txt = t ? (t.messages || []).map(m => hdr(m, 'Subject') + '\n' + plainOf(m).split('\n').filter(l => !/^\s*>/.test(l)).join('\n')).join('\n\n').replace(/\s+/g, ' ').slice(0, 20000) : '';
  bodyCache.set(id, txt); if (bodyCache.size > 400) bodyCache.delete(bodyCache.keys().next().value);
  return txt;
}
// Meilleur passage : la fenêtre de ~160 caractères qui contient le plus de mots différents
function bestPassage(text, words) {
  const low = nrm(text); if (!words.length || !low) return { hits: 0, near: false, excerpt: '' };
  const pos = []; // mot entier (pluriel accepté) : « porte » trouve « portes » mais pas « portefeuille »
  words.forEach((w, wi) => { let i = -1; let n = 0; while ((i = low.indexOf(w, i + 1)) !== -1 && n < 60) { const after = low.slice(i + w.length, i + w.length + 2); if ((!i || !/[a-z0-9]/.test(low[i - 1])) && (!/^([a-z0-9]|-[a-z])/.test(after) || /^[sx](?![a-z0-9])/.test(after)) && !(i > 1 && low[i - 1] === '-' && /[a-z]/.test(low[i - 2]))) { pos.push([i, wi]); n++; } } });
  if (!pos.length) return { hits: 0, near: false, excerpt: '' };
  pos.sort((a, b) => a[0] - b[0]);
  let best = { k: 0, at: pos[0][0] };
  for (let i = 0; i < pos.length; i++) { const seen = new Set(); for (let j = i; j < pos.length && pos[j][0] - pos[i][0] < 70; j++) seen.add(pos[j][1]); if (seen.size > best.k) best = { k: seen.size, at: pos[i][0] }; }
  const all = new Set(pos.map(p => p[1])).size;
  // expressions : deux mots cherchés qui se suivent dans le bon ordre (« porte d’entrée », « devis de ma porte »)
  let pairs = 0;
  for (let k = 0; k + 1 < words.length; k++) if (pos.some(a => a[1] === k && pos.some(b => b[1] === k + 1 && b[0] > a[0] && b[0] - a[0] - words[k].length <= 14))) pairs++;
  const s = Math.max(0, best.at - 25), e = Math.min(text.length, best.at + 190);
  return { hits: all, near: best.k, pairs, excerpt: (s ? '…' : '') + text.slice(s, e).trim() + (e < text.length ? '…' : '') };
}
const PROMO_RE = /no-?reply|newsletter|news@|marketing|promo|offre|mailing|info@|bonjour@|hello@|e\.?mail\./i;
function relScore(it, words, passage) {
  const subj = nrm(it.subject); let sc = 0;
  words.forEach(w => { if (subj.includes(w)) sc += 3; });
  sc += (passage.pairs || 0) * 5 + passage.hits * 1.5 + (passage.near >= Math.min(2, words.length) ? 4 : 0) + (passage.near === words.length && words.length > 1 ? 4 : 0);
  if (words.length > 1 && nrm(passage.excerpt + ' ' + it.subject).includes(words.join(' '))) sc += 3;
  if (it.mine || it.count > 1) sc += 2;
  // classé dans un de tes dossiers dont le nom reprend les mots cherchés : signal très fort
  if (it.labelHit) sc += 3 + 3 * it.labelHit;
  // pubs et newsletters : fortement déclassées (elles parlent de tout, mais ne sont presque jamais le mail cherché)
  if (it.promo || PROMO_RE.test(it.fromEmail || '')) sc = Math.min(sc * 0.3, 4);
  return sc;
}
async function enrich(items, words, max, g) {
  const top = items.slice(0, max);
  await pool(top, g != null ? 3 : 5, async it => {
    if (g != null && !bgAlive(g)) { it.passage = { hits: 0, near: 0, excerpt: '' }; it.rel = -99; return; }
    const text = it.acc === 'free' ? (it.subject + ' ' + (it.body || it.snippet)) : await threadText(it.id, g);
    const p = bestPassage(text, words);
    it.passage = p; it.rel = relScore(it, words, p);
  });
  return top;
}
// « Les plus pertinents » en tête d'une recherche par mots : mails personnels (hors pubs) lus en entier, triés par pertinence
/* Dossiers dont le nom contient les mots cherchés (ex. « Maison/Porte Devis » pour « devis porte entrée ») */
async function labelGrab(words, cand, n) {
  if (!(settings.clientId || relayGmailOn()) || !words.length) return;
  let labs = []; try { labs = await getLabels(); } catch (e) { return; }
  const hits = labs.map(l => ({ l, k: words.filter(w => nrm(l.name).split(/[^a-z0-9]+/).some(x => x === w || x === w + 's' || x + 's' === w)).length })).filter(x => x.k >= Math.min(2, words.length)).sort((a, b) => b.k - a.k).slice(0, 3);
  await Promise.all(hits.map(async ({ l, k }) => {
    const r = (await api('threads?' + new URLSearchParams({ labelIds: l.id, maxResults: n || 25 })).catch(() => null)) || {};
    const ts = await pool(r.threads || [], 6, t => threadMeta(t).catch(() => null));
    ts.filter(Boolean).forEach(t => { const it = cand.get(t.id) || Object.assign(summarize(t), { acc: 'gmail' }); it.labelHit = Math.max(it.labelHit || 0, k); cand.set(t.id, it); });
  }));
}
// Requêtes Gmail plus souples que « tous les mots » : chaque paire de mots, mails envoyés compris, sans limite de date
const pairQueries = words => { const out = []; for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) out.push(words[i] + ' ' + words[j]); return out.slice(0, 6); };
async function bestMatches(q) {
  const box = $('#best'); if (!box) return;
  const src = state.aiNote && state.aiNote.q === q && state.aiNote.ask ? state.aiNote.ask : q;
  const words = searchWords(src); if (!words.length || /\b(from|to|larger|filename):/i.test(q)) return;
  const bc = (state.bestCache || (state.bestCache = {}))[q];
  if (bc && Date.now() - bc.at < 15 * 60000) { box.innerHTML = bc.html; return; }
  const g = bgGen;
  box.innerHTML = '<div class="ai-note"><span>Lecture des mails pour trouver les plus pertinents…</span></div>';
  const base = words.join(' ');
  const cand = new Map();
  const grab = async (gq, n) => {
    const r = (await bgApi('threads?' + new URLSearchParams({ q: gq, maxResults: n }), g).catch(() => null)) || {};
    const ts = await pool(r.threads || [], 3, t => bgAlive(g) ? threadMeta(t).catch(() => null) : null);
    ts.filter(Boolean).forEach(t => { if (!cand.has(t.id)) cand.set(t.id, Object.assign(summarize(t), { acc: 'gmail' })); });
  };
  const jobs = [];
  const NOPUB = ' -category:promotions -category:social -category:forums';
  if (settings.clientId || relayGmailOn()) {
    jobs.push(grab(base + NOPUB, 25), grab('in:sent ' + base, 15), labelGrab(words, cand, 20));
    if (words.length >= 3) pairQueries(words).slice(0, 3).forEach(p => jobs.push(grab(p + NOPUB, 10), grab('in:sent ' + p, 8)));
  }
  if (freeOn()) jobs.push(rapi('/free/search?' + new URLSearchParams({ q: base, limit: '20' })).then(r => (r.items || []).forEach(x => { const it = freeItem(x); it.body = x.text || ''; cand.set(it.id, it); })).catch(() => {}));
  await Promise.all(jobs);
  if (!$('#best')) return;
  // priorité de lecture : dossiers correspondants, mails envoyés et échanges, puis les autres
  if (!bgAlive(g)) return;
  const all = await enrich([...cand.values()].sort((a, b) => ((b.labelHit || 0) - (a.labelHit || 0)) || ((b.mine ? 1 : 0) - (a.mine ? 1 : 0)) || (b.date - a.date)), words, 45, g);
  if (!bgAlive(g)) { const bx = $('#best'); if (bx) bx.innerHTML = ''; return; }
  let best = all.filter(x => x.rel >= 6 && x.passage.hits >= Math.min(2, words.length)).sort((a, b) => b.rel - a.rel || b.date - a.date);
  if (best.length) best = best.filter(x => x.rel >= best[0].rel * 0.5).slice(0, 6);
  if (!$('#best')) return;
  if (!best.length) { box.innerHTML = ''; return; }
  state.showAcc = freeOn(); state.dayMode = false;
  box.innerHTML = `<h2 class="sec">Les plus pertinents · ${best.length}</h2>` + best.map(i => itemHTML(Object.assign({}, i, { snippet: '« ' + i.passage.excerpt + ' »' }), '')).join('') + '<h2 class="sec">Tous les résultats, du plus récent au plus ancien</h2>';
  state.bestCache[q] = { at: Date.now(), html: box.innerHTML };
}
