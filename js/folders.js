'use strict';
/* ---------- Classement (libellés Gmail) ---------- */
async function labelSheet(threadId, current) {
  current = current instanceof Set ? current : new Set(current || []);
  let labels;
  try { labels = await getLabels(true); } catch (e) { toast(e.message); return; }
  labels = labels.filter(l => l.name !== BLOCK_LABEL);
  // Tes dossiers tels que tu les as rangés : « Maison › Chaudière », sous-dossiers en retrait sous leur parent
  const rows = [{ id: 'INBOX', name: 'Boîte de réception', c: 'var(--gmail)', d: 0, leaf: 'Boîte de réception' }].concat(labels.map(l => { const p = l.name.split('/'); return { id: l.id, name: l.name, c: labelColor(l), d: p.length - 1, leaf: p[p.length - 1], par: p.slice(0, -1).join(' › ') }; }));
  openSheet(`<span class="grip"></span><h2>Classer dans…</h2>
    <div id="lab-sug"></div>
    ${rows.length > 10 ? '<label class="f" style="margin:0 0 6px"><span class="sr">Chercher un dossier</span><input id="lab-find" type="search" placeholder="Chercher un dossier (ex. chaudière)" autocomplete="off"></label>' : ''}
    <div id="lab-rows">${rows.map(r => `<label class="check" data-n="${esc(nrm(r.name))}" style="padding-left:${r.d * 22}px"><input type="checkbox" value="${esc(r.id)}" ${current.has(r.id) ? 'checked' : ''}><span class="sw" style="--c:${esc(r.c)}"></span><span>${r.d ? `<small style="display:block;color:var(--muted);font-size:.75rem">${esc(r.par)} ›</small>` : ''}${esc(r.leaf)}</span></label>`).join('')}</div>
    <p style="margin:6px 0;color:var(--muted);font-size:.8rem">Ce sont tes dossiers Gmail : le classement apparaît aussi dans Gmail. Pour un sous-dossier, écris par exemple « Maison/Chaudière ».</p>
    <form id="newlab" style="display:flex;gap:8px;margin-top:6px"><label class="f" style="flex:1"><span class="sr">Nouveau libellé</span><input id="newlab-name" placeholder="Nouveau libellé"></label><button class="btn" type="submit">Créer</button></form>
    ${state.thread && state.thread.id === threadId ? `<label class="switch" style="margin-top:6px">Toujours ranger les mails de cet expéditeur dans le dossier coché<input type="checkbox" id="lab-rule"></label>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"><button class="btn" data-close>Annuler</button><button class="btn primary" id="lab-ok">Valider</button></div>`);
  const lf = $('#lab-find'); if (lf) lf.oninput = () => { const v = nrm(lf.value.trim()); $$('#lab-rows .check').forEach(r => { r.hidden = v && !r.dataset.n.includes(v); }); };
  const ctx = state.thread && state.thread.id === threadId ? readCtx() : null;
  if (ctx) suggestFolder(ctx, labels.map(l => ({ key: l.id, name: l.name })), (key, why) => {
    const box = $('#lab-sug'); if (!box) return;
    const l = labels.find(x => x.id === key); if (!l) return;
    box.innerHTML = `<div class="sug"><span>💡 <b>${esc(l.name.split('/').join(' › '))}</b><small>${esc(why)}</small></span><button class="btn primary" id="sug-go">Ranger ici</button></div>`;
    $('#sug-go').onclick = async () => { closeSheet(); try { await api('threads/' + threadId + '/modify', { method: 'POST', body: { addLabelIds: [key], removeLabelIds: ['INBOX'] } }); patchCached(threadId, () => null); toast('Rangé dans ' + l.name.split('/').pop()); badgeNow(0); goBack(); } catch (e) { if (e.message !== 'auth') toast(e.message); } };
  });
  $('#newlab').onsubmit = async e => {
    e.preventDefault();
    const n = $('#newlab-name').value.trim(); if (!n) return;
    try { const l = await api('labels', { method: 'POST', body: { name: n, labelListVisibility: 'labelShow', messageListVisibility: 'show' } }); current.add(l.id); await getLabels(true); closeSheet(); labelSheet(threadId, current); }
    catch (er) { if (er.message !== 'auth') toast(er.message); }
  };
  $('#lab-ok').onclick = async () => {
    const checked = new Set($$('#sheet input[type=checkbox]').filter(i => i.checked).map(i => i.value));
    const ids = rows.map(r => r.id);
    const add = ids.filter(i => checked.has(i) && !current.has(i));
    const rem = ids.filter(i => !checked.has(i) && current.has(i));
    const rule = $('#lab-rule') && $('#lab-rule').checked && ctx && ctx.fromEmail ? add.find(i => i !== 'INBOX') : null;
    closeSheet();
    if (rule) api('settings/filters', { method: 'POST', body: { criteria: { from: ctx.fromEmail }, action: { addLabelIds: [rule], removeLabelIds: ['INBOX'] } } }).then(() => toast('Règle créée : les prochains mails de ' + ctx.fromEmail + ' iront directement dans ce dossier')).catch(e => toast(e.message === 'scope' ? 'Autorisation des règles manquante (Réglages › Comptes)' : 'Règle : ' + e.message));
    if (!add.length && !rem.length) return;
    try {
      await api('threads/' + threadId + '/modify', { method: 'POST', body: { addLabelIds: add, removeLabelIds: rem } });
      Object.keys(state.lists).forEach(k => delete state.lists[k]);
      toast('Classé');
      if (rem.includes('INBOX')) goBack(); else renderThread(threadId);
      badgeNow(0);
    } catch (e) { if (e.message !== 'auth') toast(e.message); }
  };
}
function openSheet(html) {
  const s = $('#sheet');
  s.innerHTML = `<div class="panel" role="dialog" aria-modal="true">${html}</div>`;
  s.hidden = false;
  s.onclick = e => { if (e.target === s || e.target.closest('[data-close]')) closeSheet(); };
}
function closeSheet() { const s = $('#sheet'); if (s) { s.hidden = true; s.innerHTML = ''; } }

/* ---------- Libellés (navigation) ---------- */
/* ---------- Dossiers : Gmail + Free, arborescence, favoris, recherche ---------- */
const FOLD_ICON = '<svg class="fic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
function buildTree(items, sep) {
  // items : [{ key, full, href, n }] ; regroupe par chemin « A/B/C »
  const root = { children: new Map() };
  for (const it of items) {
    const parts = it.full.split(sep); let node = root, path = '';
    parts.forEach((p, i) => {
      path = path ? path + sep + p : p;
      if (!node.children.has(p)) node.children.set(p, { name: p, path, children: new Map() });
      node = node.children.get(p);
      if (i === parts.length - 1) Object.assign(node, it);
    });
  }
  const sum = n => { n.total = (n.n || 0) + [...n.children.values()].reduce((a, c) => a + sum(c), 0); return n.total; };
  [...root.children.values()].forEach(sum);
  return root;
}
/* Suivi : en attente de réponse */
/* ---------- Guide d'utilisation intégré ---------- */
const GUIDE = [
  ['☀️', 'Aujourd’hui et gestes', `
    <p>Reçus s'ouvre sur <b>Aujourd’hui</b> : un résumé « En bref », les mails qui attendent vraiment une réponse, l'agenda du jour, les mails envoyés restés sans réponse (bouton <b>Relancer</b>) et ceux mis de côté qui reviennent. <b>Tous les mails</b>, en haut, donne la réception complète. Réglages › Affichage : ton prénom et l'écran d'ouverture.</p>
    <p><b>Tirer vers le bas</b> actualise n'importe quelle liste. La réception se met aussi à jour toute seule dès qu'un mail arrive ou est lu ailleurs.</p>
    <p><b>Appui long</b> sur un mail : toutes ses actions (lu, suivre, plus tard, archiver, classer dans le dossier habituel en un geste, supprimer, bloquer, tous les mails de l'expéditeur, sélection multiple). Sur un dossier : ouvrir, déplacer, supprimer. Dans l'agenda (Semaine) : appui long sur un événement puis glisser sur un autre jour pour le déplacer.</p>
    <p>Dans un mail : <b>A−</b> / <b>A+</b> en haut pour la taille du texte, <b>Texte seul</b> sous les newsletters lourdes, <b>Tous ses mails</b> pour tout supprimer d'un expéditeur (et se désabonner).</p>
    <p>Écrire : destinataires proposés dès 2 lettres, brouillon enregistré à chaque frappe, signature (Réglages), <b>Envoyer plus tard</b> et <b>Relance si pas de réponse</b>. Tout ce qui est programmé : Dossiers › Programmés et relances.</p>`],
  ['👋', 'Prise en main', `
    <p>MailBox réunit <b>Gmail</b> (pastille bleue) et <b>Free</b> (pastille rose) dans une seule appli, plus lisible que Gmail.</p>
    <p>En bas : <b>Reçus</b>, <b>Envoyés</b>, <b>Agenda</b>, <b>Écrire</b>, <b>Contacts</b>, <b>Dossiers</b>. Les envois Gmail et Free sont réunis dans Envoyés, les <b>Réglages</b> derrière la roue dentée en haut de Reçus. Le chiffre sur Reçus et sur l'icône de l'iPhone est le nombre de mails non lus.</p>
    <p>Un mail <b>non lu</b> a un cadre jaune et un rond jaune plein. Les mails sont groupés par jour (Aujourd’hui, Hier, Mardi 17 novembre…), avec l’heure à droite. Un mail <b>lu</b> est simplement en gris. L'étiquette <b>Gmail</b> ou <b>Free</b> en bas à droite indique la boîte.</p>
    <div class="tip">Les mots de passe ne sont jamais dans l'appli ni sur GitHub : Gmail passe par Google, Free par ton serveur, chiffré.</div>`],
  ['👆', 'Les gestes', `
    <div class="gges"><span>← court<br><b>Supprimer</b></span><span>←← jusqu'au bord<br><b>Bloquer</b></span><span>→<br><b>Lu / non lu</b></span></div>
    <p><b>Appui long</b> sur un mail : mode sélection. Coche plusieurs mails (ou « Tout sélectionner ») puis Lu, Non lu, Archiver, Supprimer ou Bloquer.</p>
    <p><b>Depuis le bord gauche</b> de l'écran, glisse vers la droite pour revenir en arrière.</p>
    <p>Dans <b>Dossiers</b> : balaye un dossier à gauche pour le supprimer, à droite pour le déplacer ou le renommer.</p>
    <div class="tip">Après chaque action, un bouton <b>Annuler</b> reste 6 secondes en bas de l'écran.</div>`],
  ['📥', 'Réception et non lus', `
    <p>Les onglets <b>Tous / Gmail / Free</b> filtrent par boîte, avec le nombre de non lus de chacune. Le bouton <b>Non lus</b> n'affiche que ceux-là.</p>
    <p><b>Tout marquer lu</b> (à droite de « Non lus ») passe toute la boîte en lu, avec Annuler.</p>
    <p>Une 📎 dans la liste signale un mail avec pièce jointe ; dans le mail, les pièces jointes s’affichent en cartes en haut, avant le texte, avec <b>Ouvrir</b>.</p>
    <p>Dans un mail : <b>Répondre</b>, <b>À tous</b>, <b>Transférer</b>, <b>Classer</b>, <b>Archiver</b>, <b>Bloquer</b>, <b>Suivre</b> (étoile). Les citations des anciens messages sont repliées.</p>
    <p><b>Se désabonner</b> : sur une newsletter, une barre en haut du mail permet de se désinscrire en un appui.</p>
    <p>Réglages › Affichage › <b>Principal seulement</b> masque Promotions, Réseaux sociaux, etc. de la réception et du compteur.</p>`],
  ['✍️', 'Écrire', `
    <p>Le champ <b>De</b> permet de choisir l'adresse d'envoi : Gmail ou Free. L'envoi Free apparaît aussi dans les Envoyés Free.</p>
    <p>En transférant un mail, ses pièces jointes suivent.</p>`],
  ['⛔', 'Bloquer et indésirables', `
    <p>Bloquer range automatiquement <b>tous les mails de la marque</b> (ex. toutes les adresses @aliexpress.com) dans « Indésirables », côté Gmail et Free : <b>pas de notification, pas de pastille</b>.</p>
    <p>Glisse un mail vers la gauche : les boutons <b>Bloquer</b> et <b>Supprimer</b> apparaissent. Glisser jusqu’au bout supprime seulement, sans bloquer.</p>
    <p>Réglages › <b>Voir les mails indésirables</b> : taille occupée et <b>Tout supprimer</b> (vers la corbeille).</p>
    <p>Réglages › <b>Voir les expéditeurs bloqués</b> : tri par date ou A → Z, <b>Débloquer</b>, et « Regrouper par marque ».</p>
    <div class="tip">Une adresse Gmail, Hotmail, Free… est bloquée seule, jamais tout le domaine.</div>`],
  ['📁', 'Dossiers', `
    <p>Gmail et Free sont rangés en accordéons. La flèche jaune déplie les sous-dossiers. Le chiffre est le nombre de non lus.</p>
    <p><b>☆</b> épingle un dossier dans les Favoris, en haut. <b>Chercher un dossier</b> filtre par nom.</p>
    <p><b>＋</b> crée un dossier (Gmail ou Free, au premier niveau ou dans un autre).</p>
    <p>Un dossier « thème » (ex. Maison) affiche ses sous-dossiers en haut : ses mails sont dedans.</p>
    <p>Dans un dossier : <b>Tout marquer lu</b>, <b>Tout supprimer</b>, sélection et gestes comme dans la réception.</p>
    <p><b>⏳ En attente de réponse</b> : les mails reçus de vraies personnes sans réponse de ta part, et tes envois restés sans réponse.</p>`],
  ['🧹', 'Ranger et transférer', `
    <p><b>Ranger</b> liste les dossiers vraiment vides à supprimer (décoche ceux à garder : ils ne seront plus proposés).</p>
    <p><b>✦ Remplacer INBOX par des thèmes</b> : l'IA propose de regrouper tes dossiers en grands thèmes. Le plan est groupé par thème ; <b>✎</b> change le thème, en crée un nouveau ou renomme ; rien n'est appliqué sans ta validation, aucun mail n'est supprimé.</p>
    <p><b>Free → Gmail</b> : balaye un dossier Free vers la droite › onglet <b>Vers Gmail</b>. Les mails sont copiés avec dates, pièces jointes et état lu/non lu ; le transfert tourne sur ton serveur et reprend tout seul s'il est interrompu. Une barre en haut de Dossiers suit la progression.</p>`],
  ['✅', 'Tâches et rappels', `
    <p>Dans un mail, <b>À faire</b> transforme le mail en tâche : l’assistant propose l’intitulé et la date, tu ajustes (Ce soir, Demain 8 h, Lundi 8 h ou date précise).</p>
    <p>À l’heure dite, une <b>notification</b> te le rappelle, même pendant les heures calmes.</p>
    <p>Dossiers › <b>✅ Tâches</b> : en retard (en rouge), aujourd’hui, à venir, sans date. Le rond coche la tâche (avec Annuler), un appui sur le texte la modifie, <b>Mail</b> rouvre le mail d’origine, <b>＋</b> ajoute une tâche libre.</p>`],
  ['⏰', 'Plus tard et annuler l’envoi', `
    <p><b>Plus tard</b> dans un mail : il quitte la réception et revient, non lu, au moment choisi, avec une notification. En attendant il est dans le dossier « Mis de côté ».</p>
    <p><b>Annuler l’envoi</b> : après Envoyer, tu as 6 secondes pour toucher Annuler ; le message reste à l’écran.</p>`],
  ['✦', 'Assistant IA', `
    <p><b>Résumer</b> (en haut d’un mail) : résumé, points clés, suivi de l’échange (qui a dit quoi, quand), engagements et échéances. Chaque échéance a un bouton <b>+ Tâche</b>.</p>
    <p>Tu peux aussi écrire dans la loupe « tous les échanges avec les Aciers du Littoral » : l’appli retrouve l’adresse dans le carnet de tes correspondants (construit sur ton serveur à partir de tes mails) et ouvre directement vos échanges.</p>
    <p><b>👤 Tous les échanges avec…</b> (sous le titre d’un mail) : toute ta correspondance avec cette personne, dans les deux sens, Gmail et Free. <b>Retracer l’historique</b> y fait relire les échanges par l’IA : résumé, chronologie, engagements en cours et échéances (avec + Tâche).</p>
    <p><b>Réponse IA</b> : 3 propositions (accepter, décliner, demander une précision) ou selon ta consigne (« accepter jeudi, proposer 10 h »). <b>Utiliser et modifier</b> ouvre la réponse pré-remplie.</p>
    <p><b>Classer</b> : une suggestion 💡 apparaît en haut (là où sont déjà les mails de cet expéditeur, sinon « Suggérer un dossier »). La case <b>Toujours ranger…</b> crée une règle automatique pour les prochains mails.</p>
    <p><b>Recherche</b> : écris une phrase dans la loupe (« la promo Devred de mon anniversaire », « mes plus gros mails »). Une longue phrase (« un gars est venu réparer mon portail il y a quelque temps, retrouve nos échanges ») part directement en recherche par le sens ; une phrase courte qui trouve moins de 3 mails y bascule toute seule sur la <b>recherche par le sens</b> : il déduit les expéditeurs probables, les synonymes et la période, examine jusqu’à 80 mails Gmail et Free, tous dossiers confondus, puis les classe en « Correspond le mieux » et « Peut-être aussi », avec la raison de chaque résultat. Si une personne ou une entreprise ressort, <b>Tous les échanges avec…</b> affiche toute votre correspondance.</p>
    <div class="tip">Ces fonctions envoient à Groq le texte du mail concerné, uniquement quand tu touches le bouton. Le rangement des dossiers n’envoie que leurs noms.</div>`],
  ['🔔', 'Pastille et notifications', `
    <p>Le serveur prévient l'iPhone à chaque nouveau mail : notification <b>discrète</b> (sans son) et pastille sur l'icône.</p>
    <p><b>Heures calmes</b> (22 h – 7 h par défaut) : rien la nuit, un seul résumé au réveil.</p>
    <p><b>Pastille seule, sans notification</b> : Réglages de l'iPhone › Notifications › MailBox › décoche Écran verrouillé, Centre de notifications et Bannières ; laisse Pastilles.</p>
    <p>Si tu lis tes mails ailleurs (PC), la pastille de l'iPhone se recale dans les 2 minutes.</p>`],
  ['🛠', 'Mises à jour et dépannage', `
    <p><b>Mettre à jour l'appli</b> : Réglages › Application › Mettre à jour (ou le bandeau jaune quand il apparaît).</p>
    <p><b>Mettre à jour le serveur</b> (quand c'est indiqué) : dans Termius, colle :</p>
    <code>curl -fsSL https://raw.githubusercontent.com/masuel254/Mailbox/main/relay/install.sh | sudo bash</code>
    <p>Ta configuration, Gmail, Free et la clé IA sont conservés. n8n n'est pas touché.</p>
    <p><b>Voir ce qui se passe sur le serveur</b> :</p>
    <code>sudo docker logs mailbox-relay 2>&1 | tail -20</code>
    <p><b>Un mail affiche des caractères bizarres</b> : mets l'appli à jour, ils sont réparés automatiquement.</p>
    <p><b>Gmail demande de ralentir</b> : attends une minute, l'appli réessaie seule.</p>
    <div class="tip">Ne partage jamais le code d'accès du relais, ni la capture qui l'affiche à la fin d'une installation.</div>`]
];
function renderGuide() {
  const v = $('#view');
  v.innerHTML = `<div class="sticky-head"><a class="back back-sm" href="#/settings">${ICON.back}Réglages</a><div class="top"><h1>Guide MailBox</h1></div>
    <div class="searchbar"><input type="search" id="gq" placeholder="Chercher : bloquer, dossier, pastille…" autocomplete="off"></div></div>
    <div id="guide">${GUIDE.map(([ic, t, body], i) => `<details class="set gsec" data-g="${i}"><summary><span class="gic">${ic}</span><span class="set-t">${esc(t)}</span><span class="chev" aria-hidden="true"></span></summary><div class="card gbody">${body}</div></details>`).join('')}
    <p class="fhint" style="text-align:center;margin-top:14px">MailBox v${esc(APP_VERSION)}</p></div>`;
  const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  $('#gq').oninput = e => {
    const q = norm(e.target.value.trim());
    $$('#guide .gsec').forEach(d => { const hit = !q || norm(d.textContent).includes(q); d.hidden = !hit; d.open = !!q && hit; });
  };
}
async function renderWaiting() {
  const v = $('#view');
  v.innerHTML = `<div class="top"><a class="back" href="#/labels">${ICON.back}Dossiers</a></div><h1 class="thread-title">En attente</h1>
    <p class="fhint">Tes mails envoyés sans réponse depuis plus de 3 jours, et les mails de vraies personnes (hors newsletters) auxquels tu n'as pas répondu depuis 2 semaines.</p>
    <div id="list"><div class="loading">Analyse de tes échanges…</div></div>`;
  const day = 86400000, now = Date.now();
  const md = '&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=List-Unsubscribe&metadataHeaders=Precedence';
  const theirs = [], mine = [];
  const jobs = [];
  if (settings.clientId || relayGmailOn()) jobs.push((async () => {
    const [a, b] = await Promise.all([
      api('threads?' + new URLSearchParams({ q: 'in:sent newer_than:30d older_than:3d', maxResults: 40 })),
      api('threads?' + new URLSearchParams({ q: 'in:inbox newer_than:14d -category:promotions -category:social -category:updates -category:forums', maxResults: 40 }))]);
    const ta = await pool((a && a.threads) || [], 4, t => api('threads/' + t.id + '?format=metadata' + md).catch(() => null));
    const tb = await pool((b && b.threads) || [], 4, t => api('threads/' + t.id + '?format=metadata' + md).catch(() => null));
    ta.filter(Boolean).forEach(t => { const ms = t.messages || [], last = ms[ms.length - 1] || {}; if ((last.labelIds || []).includes('SENT') && +last.internalDate < now - 3 * day && !splitAddrs(hdr(last, 'To')).map(parseAddr).every(x => isMe(x.email))) theirs.push(Object.assign(summarize(t), { acc: 'gmail' })); });
    tb.filter(Boolean).forEach(t => { const ms = t.messages || [], last = ms[ms.length - 1] || {}; const fr = parseAddr(hdr(last, 'From')).email || '';
      if (!(last.labelIds || []).includes('SENT') && !hdr(last, 'List-Unsubscribe') && !/bulk|list/i.test(hdr(last, 'Precedence')) && !isMe(fr) && !/no-?reply|ne-pas-repondre|notification|newsletter/i.test(fr)) mine.push(Object.assign(summarize(t), { acc: 'gmail' })); });
  })().catch(e => { if (e.message !== 'auth') toast('Gmail : ' + e.message); }));
  if (freeOn()) jobs.push(rapi('/free/waiting').then(r => { (r.theirs || []).forEach(x => theirs.push(freeItem(x))); (r.mine || []).forEach(x => mine.push(freeItem(x))); }).catch(e => toast('Free : ' + e.message)));
  await Promise.all(jobs);
  const l = $('#list'); if (!l) return;
  state.showAcc = freeOn();
  theirs.sort((a, b) => a.date - b.date); mine.sort((a, b) => b.date - a.date);
  const age = d => { const n = Math.floor((now - d) / day); return n <= 0 ? 'aujourd’hui' : n === 1 ? 'depuis hier' : 'depuis ' + n + ' j'; };
  l.innerHTML = (mine.length ? `<h2 class="sec unread">À traiter · ${mine.length}</h2>` + mine.map(i => itemHTML(Object.assign({}, i, { unread: false }), '')).join('') : '')
    + (theirs.length ? `<h2 class="sec">Sans réponse de leur part · ${theirs.length}</h2>` + theirs.map(i => itemHTML(Object.assign({}, i, { snippet: 'Envoyé, sans réponse ' + age(i.date) }), '', true)).join('') : '')
    || '<div class="empty">Rien en attente : tout est à jour.</div>';
}
/* Ranger : dossiers vides + plan de rangement proposé par l'IA, appliqué seulement sur validation */
// Dossiers techniques que certains serveurs (dont Free) recréent tout seuls : inutile de les proposer
const SERVER_DIRS = /^(contacts|chats|calendar|calendrier|notes|tasks|tâches|journal|outbox|boîte d'envoi|emailed contacts)$/i;
function emptyFolders(g, f) {
  const out = [], keep = new Set(LS.get('tidyKeep', []));
  for (const list of [g, f]) for (const x of list) {
    if (x.m !== 0 || x.full === BLOCK_LABEL || keep.has(x.key)) continue;
    if (x.acc === 'free' && SERVER_DIRS.test(x.full)) continue;
    const pre = x.full + (x.delim || '/');
    if (list.some(y => y.full.startsWith(pre) && y.m !== 0)) continue;
    out.push(x);
  }
  return out.sort((a, b) => b.full.length - a.full.length);
}
const disp = x => x.acc === 'free' && x.delim && x.delim !== '/' ? x.full.split(x.delim).join('/') : x.full;
async function gEnsureLabel(name) {
  const labels = await getLabels(true);
  let l = labels.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (l) return l;
  const parts = name.split('/');
  for (let i = 1; i < parts.length; i++) { const p = parts.slice(0, i).join('/'); if (!labels.some(x => x.name.toLowerCase() === p.toLowerCase())) { try { await api('labels', { method: 'POST', body: { name: p } }); } catch (e) {} } }
  l = await api('labels', { method: 'POST', body: { name } });
  await getLabels(true);
  return l;
}
async function gMergeLabel(src, dstName) {
  const dst = await gEnsureLabel(dstName);
  let page = null;
  do {
    const p = new URLSearchParams({ labelIds: src.id, maxResults: 500 }); if (page) p.set('pageToken', page);
    const r = (await api('messages?' + p.toString())) || {};
    const ids = (r.messages || []).map(m => m.id);
    for (let i = 0; i < ids.length; i += 1000) await api('messages/batchModify', { method: 'POST', body: { ids: ids.slice(i, i + 1000), addLabelIds: [dst.id], removeLabelIds: [src.id] } });
    page = r.nextPageToken;
  } while (page);
  await api('labels/' + encodeURIComponent(src.id), { method: 'DELETE' });
}
async function gMove(from, to, mergeRoot) {
  const labels = await getLabels(true);
  const sub = labels.filter(l => l.name === from || l.name.startsWith(from + '/')).sort((a, b) => b.name.length - a.name.length);
  if (!sub.length) throw new Error('dossier introuvable');
  const parent = to.includes('/') ? to.slice(0, to.lastIndexOf('/')) : '';
  if (parent) { try { await gEnsureLabel(parent); } catch (e) { /* parent réservé (ex. INBOX) : Gmail accepte quand même le chemin */ } }
  for (const l of sub) {
    const nn = to + l.name.slice(from.length);
    const exists = (await getLabels()).find(x => x.name.toLowerCase() === nn.toLowerCase() && x.id !== l.id);
    if (exists || (mergeRoot && l.name === from)) await gMergeLabel(l, nn);
    else await api('labels/' + encodeURIComponent(l.id), { method: 'PATCH', body: { name: nn } });
  }
  await getLabels(true);
}
/* Vérifie réellement qu'un dossier Gmail est vide (le compteur de Gmail peut être en retard après un déplacement) */
async function gIsEmpty(id) { const r = (await api('messages?' + new URLSearchParams({ labelIds: id, maxResults: 1, includeSpamTrash: 'true' }))) || {}; return !(r.messages && r.messages.length); }
async function tidySheet(g, f) {
  openSheet('<span class="grip"></span><h2>Ranger mes dossiers</h2><div class="loading">Vérification des dossiers vides…</div>');
  const cand = emptyFolders(g, f);
  const ok = await pool(cand, 6, x => x.acc === 'gmail' ? gIsEmpty(x.id).catch(() => false) : Promise.resolve(true));
  const lines = cand.filter((x, i) => ok[i]).map(x => ({ kind: 'del', x, on: true }));
  const draw = focus => {
    const sc = ($('.tidy-list') || {}).scrollTop || 0;
    const dels = lines.filter(l => l.kind === 'del'), ai = lines.filter(l => l.kind !== 'del');
    openSheet(`<span class="grip"></span><h2>Ranger mes dossiers</h2>
      <div class="tidy-list">
        <h3 class="tidy-h">Dossiers vides · ${dels.length}</h3>
        ${dels.length ? dels.map(l => `<label class="switch"><span><span class="dot tdot" style="background:var(--${l.x.acc})"></span>Supprimer <b>${esc(disp(l.x).split('/').join(' › '))}</b></span><input type="checkbox" data-i="${lines.indexOf(l)}" ${l.on ? 'checked' : ''}></label>`).join('') : '<p class="fhint">Aucun dossier vide.</p>'}
        <h3 class="tidy-h">Proposition de l'IA${ai.length ? ' · ' + ai.length + ` <button class="sec-btn" id="tidy-toggle" type="button">${ai.every(l => l.on) ? 'Tout décocher' : 'Tout cocher'}</button>` : ''}</h3>
        ${ai.length ? (() => {
          // regroupé par dossier d'arrivée : un bloc par thème, une ligne courte par dossier déplacé
          const groups = new Map();
          ai.forEach(l => { const parts = l.to.split('/'); const raw = (l.kind === 'merge' ? parts : parts.slice(0, -1)).join('/'); const dest = raw.split('/').join(' › ') || 'Premier niveau'; const k = l.acc + '|' + dest; if (!groups.has(k)) groups.set(k, { acc: l.acc, dest, raw, items: [] }); groups.get(k).items.push(l); });
          return [...groups.values()].sort((a, c) => a.dest.localeCompare(c.dest, 'fr')).map(gr => `<div class="tgroup"><div class="tgroup-h"><span class="dot tdot" style="background:var(--${gr.acc})"></span><span>→ ${esc(gr.dest)}</span><button class="tedit" type="button" data-gedit="${esc(gr.acc + '|' + gr.raw)}" aria-label="Renommer ce thème">✎</button><small>${gr.items.length}</small><input type="checkbox" class="tg-all" data-g="${esc(gr.acc + '|' + gr.dest)}" ${gr.items.every(l => l.on) ? 'checked' : ''} aria-label="Tout le groupe"></div>
            ${gr.items.map(l => { const fp = l.from.split('/'), leaf = fp.pop(), np = l.to.split('/').pop(); return `<label class="trow"><span class="tname"><span class="tl"><b>${esc(leaf)}</b>${l.kind === 'merge' ? ' <em>fusionné</em>' : np !== leaf ? ' <em>→ ' + esc(np) + '</em>' : ''}</span><small>${esc(fp.length ? 'depuis ' + fp.join(' › ') : 'depuis le premier niveau')}</small></span><button class="tedit" type="button" data-edit="${lines.indexOf(l)}" aria-label="Changer la destination">✎</button><input type="checkbox" data-i="${lines.indexOf(l)}" data-gk="${esc(gr.acc + '|' + gr.dest)}" ${l.on ? 'checked' : ''}></label>`; }).join('')}</div>`).join('');
        })()
          : settings.ai ? `<button class="btn primary" id="tidy-themes" type="button">✦ Remplacer INBOX par des thèmes</button><button class="btn" id="tidy-ai" type="button">✦ Proposer un rangement général</button><p class="fhint">L’IA ne reçoit que les noms de tes dossiers et leur nombre de mails. Rien n’est appliqué sans ta validation, et aucun mail n’est supprimé.</p>`
          : '<p class="fhint">Active l’assistant IA dans Réglages › Relais et notifications pour obtenir une proposition.</p>'}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"><button class="btn" data-close>Annuler</button><button class="btn primary" id="tidy-ok">Appliquer (${lines.filter(l => l.on).length})</button></div>`);
    if (sc && $('.tidy-list')) $('.tidy-list').scrollTop = sc;
    if (typeof focus === 'number') { const c = $('.tidy-list input[data-i="' + focus + '"]'); const r = c && c.closest('.trow'); if (r) { r.scrollIntoView({ block: 'center' }); r.classList.add('flash'); } }
    $$('.tidy-list input[data-i]').forEach(c => c.onchange = () => { lines[+c.dataset.i].on = c.checked; $('#tidy-ok').textContent = 'Appliquer (' + lines.filter(l => l.on).length + ')'; });
    // Modifier une proposition : autre thème, nouveau thème ou autre nom
    $$('.tidy-list [data-edit]').forEach(b => b.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      const l = lines[+b.dataset.edit], row = b.closest('.trow');
      if (row.nextElementSibling && row.nextElementSibling.classList.contains('tedit-box')) { row.nextElementSibling.remove(); return; }
      const parts = l.to.split('/'), curDest = (l.kind === 'merge' ? parts : parts.slice(0, -1)).join('/'), curName = l.kind === 'merge' ? l.from.split('/').pop() : parts[parts.length - 1];
      const themes = new Set(lines.filter(x => x.kind !== 'del' && x.acc === l.acc).map(x => { const p = x.to.split('/'); return (x.kind === 'merge' ? p : p.slice(0, -1)).join('/'); }).filter(Boolean));
      (l.acc === 'gmail' ? g : f).forEach(x => { if (!x.full.includes(x.delim || '/') && x.full !== BLOCK_LABEL && x.full !== l.from) themes.add(x.full); });
      const box = document.createElement('div'); box.className = 'tedit-box';
      box.innerHTML = `<label class="f">Ranger dans<select class="te-dest"><option value="">— Premier niveau —</option>${[...themes].sort((a, c) => a.localeCompare(c, 'fr')).map(t => `<option value="${esc(t)}" ${t === curDest ? 'selected' : ''}>${esc(t.split('/').join(' › '))}</option>`).join('')}<option value="__new">＋ Nouveau thème…</option></select></label>
        <label class="f te-newl" hidden>Nom du nouveau thème<input class="te-new" autocomplete="off" placeholder="ex. Maison"></label>
        <label class="f">Nom du dossier<input class="te-name" value="${esc(curName)}" autocomplete="off"></label>
        <div style="display:flex;gap:8px"><button class="btn" type="button" data-x>Annuler</button><button class="btn primary" type="button" data-ok>Valider</button></div>`;
      row.after(box);
      const sel = $('.te-dest', box); sel.onchange = () => { $('.te-newl', box).hidden = sel.value !== '__new'; if (sel.value === '__new') $('.te-new', box).focus(); };
      $('[data-x]', box).onclick = () => box.remove();
      $('[data-ok]', box).onclick = () => {
        const dest = sel.value === '__new' ? $('.te-new', box).value.trim().replace(/\s*\/\s*/g, '/') : sel.value;
        const name = $('.te-name', box).value.trim().replace(/[\/]/g, '-');
        if (!name || (sel.value === '__new' && !dest)) { toast('Complète le nom'); return; }
        l.kind = 'move'; l.to = dest ? dest + '/' + name : name; l.on = l.to !== l.from; l.why = 'modifié par toi';
        draw(lines.indexOf(l)); toast('« ' + name + ' » → ' + (dest ? dest.split('/').join(' › ') : 'premier niveau'));
      };
    });
    // Renommer tout un thème proposé
    $$('.tidy-list [data-gedit]').forEach(b => b.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      const [acc, raw] = [b.dataset.gedit.split('|')[0], b.dataset.gedit.slice(b.dataset.gedit.indexOf('|') + 1)];
      const head = b.closest('.tgroup-h');
      if (head.nextElementSibling && head.nextElementSibling.classList.contains('tedit-box')) { head.nextElementSibling.remove(); return; }
      const box = document.createElement('div'); box.className = 'tedit-box';
      box.innerHTML = `<label class="f">Nouveau nom du thème<input class="te-name" value="${esc(raw)}" autocomplete="off"></label><div style="display:flex;gap:8px"><button class="btn" type="button" data-x>Annuler</button><button class="btn primary" type="button" data-ok>Renommer</button></div>`;
      head.after(box);
      $('[data-x]', box).onclick = () => box.remove();
      $('[data-ok]', box).onclick = () => {
        const nv = $('.te-name', box).value.trim().replace(/\s*\/\s*/g, '/'); if (!nv) return;
        lines.filter(x => x.kind !== 'del' && x.acc === acc).forEach(x => { if (x.to === raw) x.to = nv; else if (x.to.startsWith(raw + '/')) x.to = nv + x.to.slice(raw.length); });
        draw();
      };
    });
    $$('.tidy-list .tg-all').forEach(c => c.onchange = () => { $$('.tidy-list input[data-gk]').filter(x => x.dataset.gk === c.dataset.g).forEach(x => { x.checked = c.checked; lines[+x.dataset.i].on = c.checked; }); $('#tidy-ok').textContent = 'Appliquer (' + lines.filter(l => l.on).length + ')'; });
    const tt = $('#tidy-toggle'); if (tt) tt.onclick = () => { const ai = lines.filter(l => l.kind !== 'del'), v = !ai.every(l => l.on); ai.forEach(l => l.on = v); draw(); };
    const runAI = async (ab, focus) => {
      $$('#tidy-ai,#tidy-themes').forEach(x => x.disabled = true); ab.textContent = 'L’IA étudie tes dossiers…';
      const ask = (list, acc) => list.length ? rapi('/ai/folders', { method: 'POST', body: { folders: list.map(x => ({ name: disp(x), n: x.m })), focus } }).then(r => (r.actions || []).map(a => ({ kind: a.type, acc, from: a.from, to: a.to, why: a.why, on: true, x: list.find(x => disp(x) === a.from) }))) : Promise.resolve([]);
      try {
        const [ga, fa] = await Promise.all([ask(g.filter(x => x.m !== 0), 'gmail'), ask(f.filter(x => x.m !== 0), 'free').catch(e => { toast('Free : ' + e.message); return []; })]);
        lines.push(...ga, ...fa);
        if (!ga.length && !fa.length) toast('L’IA ne voit rien à améliorer');
      } catch (e) { toast('IA : ' + e.message); }
      draw();
    };
    const ab = $('#tidy-ai'); if (ab) ab.onclick = () => runAI(ab, '');
    const at = $('#tidy-themes'); if (at) at.onclick = () => runAI(at, 'themes');
    $('#tidy-ok').onclick = async () => {
      // les dossiers vides décochés sont mémorisés : ils ne seront plus proposés
      const keep = new Set(LS.get('tidyKeep', [])); lines.filter(l => l.kind === 'del' && !l.on).forEach(l => keep.add(l.x.key)); LS.set('tidyKeep', [...keep]);
      const todo = lines.filter(l => l.on); if (!todo.length) { closeSheet(); return; }
      const b = $('#tidy-ok'); b.disabled = true; $$('.tidy-list input').forEach(c => c.disabled = true);
      let ok = 0; const errs = [];
      for (const [i, l] of todo.entries()) {
        b.textContent = (i + 1) + ' / ' + todo.length + '…';
        try {
          if (l.kind === 'del') {
            if (l.x.acc === 'gmail') { if (!(await gIsEmpty(l.x.id))) throw new Error('pas vide, conservé'); await api('labels/' + encodeURIComponent(l.x.id), { method: 'DELETE' }); }
            else await rapi('/free/folder-delete', { method: 'POST', body: { path: l.x.full } });
          } else if (l.acc === 'gmail') await gMove(l.from, l.to, l.kind === 'merge');
          else { const dl = (l.x && l.x.delim) || '/'; await rapi('/free/folder-rename', { method: 'POST', body: { from: l.from.split('/').join(dl), to: l.to.split('/').join(dl), delim: dl } }); }
          ok++;
        } catch (e) { errs.push((l.kind === 'del' ? disp(l.x) : l.from) + ' : ' + e.message); }
      }
      closeSheet(); state.folders = null; labelsCache = null; state.lists = {}; LS.del('foldersCache');
      toast(ok + ' action' + (ok > 1 ? 's' : '') + ' appliquée' + (ok > 1 ? 's' : '') + (errs.length ? ' · ' + errs.length + ' en échec' : ''));
      if (errs.length) console.warn(errs);
      renderLabels();
    };
  };
  draw();
}
/* Balayage à gauche sur un dossier : le supprimer */
/* Geste iPhone : balayer depuis le bord gauche de l'écran pour revenir */
(() => {
  let sx = -1, sy = 0;
  document.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX < 24 ? t.clientX : -1; sy = t.clientY; }, { passive: true });
  document.addEventListener('touchend', e => {
    if (sx < 0) return; const t = e.changedTouches[0];
    if (t.clientX - sx > 90 && Math.abs(t.clientY - sy) < 60) { const b = document.querySelector('#view .back'); if (b) b.click(); }
    sx = -1;
  }, { passive: true });
})();
function bindFolderSwipe(box, find, onDelete, onMove) {
  let sx = 0, sy = 0, cur = null, lock = null, dx = 0, bg = null, swiped = false;
  const reset = () => { if (cur) { cur.style.transition = 'transform .2s'; cur.style.transform = ''; } if (bg) { const g = bg; setTimeout(() => g.remove(), 200); } cur = null; bg = null; lock = null; dx = 0; };
  // Appui long : menu des actions du dossier (les mêmes que les glissements, en visible)
  let lt = null, longed = false;
  const menu = a => { const x = find(a.dataset.k); if (!x) return; if (navigator.vibrate) navigator.vibrate(12);
    openSheet(`<span class="grip"></span><h2>${esc(String(x.full || x.name || '').split(x.delim || '/').pop())}</h2><div class="amenu">
      <a class="btn" href="${esc(a.getAttribute('href'))}" data-close>📂 Ouvrir</a><button class="btn" id="fm-mv">↪︎ Déplacer dans…</button><button class="btn danger" id="fm-del">${ICON.trash}Supprimer le dossier</button></div>
      <p class="fhint" style="margin:6px 2px 0">Raccourcis : glisser à droite pour déplacer, à gauche pour supprimer.</p><button class="btn" data-close>Fermer</button>`);
    $('#fm-mv').onclick = () => { closeSheet(); onMove(x); }; $('#fm-del').onclick = () => { closeSheet(); onDelete(x); }; };
  box.addEventListener('touchstart', e => { const a = e.target.closest('a.frow[data-k]'); if (!a || e.target.closest('button')) return; cur = a; swiped = false; longed = false; lock = null; dx = 0; sx = e.touches[0].clientX; sy = e.touches[0].clientY; clearTimeout(lt); lt = setTimeout(() => { if (!lock && cur === a) { longed = true; menu(a); } }, 500); }, { passive: true });
  box.addEventListener('touchmove', e => {
    if (!cur) return;
    const mx = e.touches[0].clientX - sx, my = e.touches[0].clientY - sy;
    if (Math.abs(mx) > 8 || Math.abs(my) > 8) clearTimeout(lt);
    if (!lock && (Math.abs(mx) > 10 || Math.abs(my) > 10)) lock = Math.abs(mx) > Math.abs(my) * 1.3 && sx > 24 ? 'h' : 'v';
    if (lock !== 'h') return;
    e.preventDefault();
    dx = Math.max(-170, Math.min(170, mx));
    if (bg && (dx < 0) !== bg.classList.contains('left')) { bg.remove(); bg = null; }
    if (!bg) { bg = document.createElement('div'); bg.className = 'swipe-bg fswipe' + (dx < 0 ? ' left' : ''); bg.innerHTML = dx < 0 ? `<span>${ICON.trash}Supprimer</span>` : `<span>${ICON.folder || ''}Déplacer</span>`; cur.parentNode.style.position = 'relative'; bg.style.top = cur.offsetTop + 'px'; bg.style.height = cur.offsetHeight + 'px'; cur.parentNode.insertBefore(bg, cur); cur.style.position = 'relative'; cur.style.zIndex = 1; cur.style.background = 'var(--surface)'; }
    bg.classList.toggle('on', Math.abs(dx) > 90);
    cur.style.transform = 'translateX(' + dx + 'px)';
  }, { passive: false });
  box.addEventListener('touchend', () => {
    clearTimeout(lt); if (longed) swiped = true;
    if (lock === 'h' && cur) { swiped = true; if (Math.abs(dx) > 90) { const x = find(cur.dataset.k); if (navigator.vibrate) navigator.vibrate(10); if (x) (dx < 0 ? onDelete : onMove)(x); } }
    reset();
  });
  box.addEventListener('click', e => { if (swiped && e.target.closest('a.frow')) { e.preventDefault(); swiped = false; } }, true);
}
let xferTimer = null;
async function watchTransfer() {
  clearTimeout(xferTimer);
  const bar = $('#xfer-bar'); if (!bar) return;
  let t; try { t = await rapi('/transfer/status'); } catch (e) { return; }
  if (!t || t.state === 'none' || (t.state !== 'running' && LS.get('xferSeen', '') === t.path + t.label + t.done)) { bar.hidden = true; return; }
  const pct = t.total ? Math.round(100 * t.done / t.total) : 0;
  bar.hidden = false;
  bar.className = 'xfer-bar' + (t.state === 'error' ? ' err' : '');
  bar.innerHTML = t.state === 'running'
    ? `<b>Transfert Free → Gmail</b><span>${esc(t.path)} → ${esc(t.label.split('/').join(' › '))} · ${t.done} / ${t.total || '…'}${t.failed ? ' · ' + t.failed + ' en échec' : ''}</span><i style="width:${pct}%"></i>`
    : t.state === 'done' ? `<b>Transfert terminé ✓</b><span>${t.done} mail${t.done > 1 ? 's' : ''} dans Gmail › ${esc(t.label.split('/').join(' › '))}${t.failed ? ' · ' + t.failed + ' en échec (restés dans Free)' : ''}</span><button class="sec-btn" id="xfer-ok">OK</button>`
    : `<b>Transfert interrompu</b><span>${esc(t.error)} · ${t.done} mails copiés. Relance le transfert : il reprend là où il s'est arrêté.</span><button class="sec-btn" id="xfer-ok">OK</button>`;
  const ok = $('#xfer-ok'); if (ok) ok.onclick = () => { LS.set('xferSeen', t.path + t.label + t.done); bar.hidden = true; state.folders = null; LS.del('foldersCache'); renderLabels(); };
  // dossiers Free en cours de transfert : grisés avec la progression
  $$('a.frow[data-k^="f:"]').forEach(a => { const p = a.dataset.k.slice(2); const on = t.state === 'running' && (p === t.path || p.startsWith(t.path + '/') || p.startsWith(t.path + '.')); a.classList.toggle('xfering', on); });
  if (t.state === 'running') { state.xferRunning = true; xferTimer = setTimeout(watchTransfer, 3000); }
  else if (state.xferRunning) { state.xferRunning = false; state.folders = null; LS.del('foldersCache'); labelsCache = null; setTimeout(renderLabels, 300); }
}
function moveFolderSheet(x, all) {
  if (x.full === BLOCK_LABEL) { toast('Le dossier Indésirables est protégé'); return; }
  const sep = x.delim || '/';
  const parts = x.full.split(sep), leaf = parts.pop(), curParent = parts.join(sep);
  const paths = new Set();
  all.filter(y => y.acc === x.acc).forEach(y => { const ps = y.full.split(y.delim || '/'); for (let i = 1; i <= ps.length; i++) paths.add(ps.slice(0, i).join(sep)); });
  const targets = [...paths].filter(p => p !== x.full && !p.startsWith(x.full + sep) && p !== BLOCK_LABEL).sort((a, b) => a.localeCompare(b, 'fr')).map(full => ({ full }));
  const canXfer = x.acc === 'free' && relayOn() && relayGmailOn();
  openSheet(`<span class="grip"></span><h2>Déplacer « ${esc(leaf)} »</h2>
    ${canXfer ? `<div class="accounts" role="tablist" style="margin:0"><button class="on" data-mvt="free"><span class="acc-l"><span class="dot" style="background:var(--free)"></span>Dans Free</span></button><button data-mvt="gmail"><span class="acc-l"><span class="dot" style="background:var(--gmail)"></span>Vers Gmail</span></button></div>` : ''}
    <div class="mv-free" style="display:flex;flex-direction:column;gap:10px">
    <p style="margin:0;color:var(--muted);font-size:.85rem"><span class="dot tdot" style="background:var(--${x.acc})"></span>Ses mails et sous-dossiers suivent. Si un dossier du même nom existe déjà à l’arrivée, les deux sont fusionnés.</p>
    <label class="f">Ranger dans<select id="mv-parent"><option value="">— Premier niveau —</option>${targets.map(y => `<option value="${esc(y.full)}" ${y.full === curParent ? 'selected' : ''}>${esc(y.full.split(sep).join(' › '))}</option>`).join('')}</select></label>
    <label class="f">Nom<input id="mv-name" value="${esc(leaf)}" autocomplete="off"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"><button class="btn" data-close>Annuler</button><button class="btn primary" id="mv-ok">Déplacer</button></div></div>
    ${canXfer ? `<div class="xfer" hidden>
      <p style="margin:0;color:var(--muted);font-size:.8rem;line-height:1.45">Les mails de ce dossier${all.some(y => y.acc === 'free' && y.full.startsWith(x.full + sep)) ? ' et de ses sous-dossiers' : ''} sont copiés dans Gmail, avec leurs dates, pièces jointes et état lu/non lu. Ça se fait sur ton serveur : tu peux fermer l'appli.</p>
      <label class="f">Dossier Gmail d'arrivée<select id="xf-parent"><option value="">— Premier niveau —</option>${[...new Set(all.filter(y => y.acc === 'gmail').flatMap(y => { const ps = y.full.split('/'); return ps.map((_, i) => ps.slice(0, i + 1).join('/')); }))].filter(p => p !== BLOCK_LABEL).sort((a, c) => a.localeCompare(c, 'fr')).map(p => `<option value="${esc(p)}" ${p.toLowerCase() === curParent.split(sep).join('/').toLowerCase() ? 'selected' : ''}>${esc(p.split('/').join(' › '))}</option>`).join('')}</select></label>
      <label class="f">Nom dans Gmail<input id="xf-name" value="${esc(leaf)}" autocomplete="off"></label>
      <label class="switch">Ensuite, mettre les mails Free à la corbeille et supprimer le dossier Free<input type="checkbox" id="xf-del" checked></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="btn" data-close>Annuler</button><button class="btn primary" id="xf-ok">Transférer</button></div></div>` : ''}`);
  $$('[data-mvt]').forEach(b => b.onclick = () => { const gm = b.dataset.mvt === 'gmail'; $$('[data-mvt]').forEach(y => y.classList.toggle('on', y === b)); $('.mv-free').style.display = gm ? 'none' : 'flex'; $('.xfer').hidden = !gm; });
  const xf = $('#xf-ok'); if (xf) xf.onclick = async () => {
    const name = $('#xf-name').value.trim().replace(/[\/]/g, '-'); if (!name) { toast('Donne un nom'); return; }
    const parent = $('#xf-parent').value, label = parent ? parent + '/' + name : name;
    xf.disabled = true; xf.textContent = 'Démarrage…';
    try { await rapi('/transfer/free-to-gmail', { method: 'POST', body: { path: x.full, label, deleteSource: $('#xf-del').checked } }); closeSheet(); toast('Transfert lancé vers Gmail › ' + label.split('/').join(' › ')); state.folders = null; LS.del('foldersCache'); renderLabels(); }
    catch (e) { xf.disabled = false; xf.textContent = 'Transférer vers Gmail'; toast(e.message); }
  };
  $('#mv-ok').onclick = async () => {
    const name = $('#mv-name').value.trim().replace(/[\/]/g, '-'); if (!name) { toast('Donne un nom'); return; }
    const parent = $('#mv-parent').value, to = parent ? parent + sep + name : name;
    if (to === x.full) { closeSheet(); return; }
    const b = $('#mv-ok'); b.disabled = true; b.textContent = 'Déplacement…';
    try {
      if (x.acc === 'gmail') await gMove(x.full, to, false);
      else await rapi('/free/folder-rename', { method: 'POST', body: { from: x.full, to, delim: sep } });
      closeSheet(); state.folders = null; labelsCache = null; state.lists = {}; LS.del('foldersCache');
      if (parent) { const o = new Set(LS.get('openFolders', [])); let p = ''; parent.split(sep).forEach(seg => { p = p ? p + '/' + seg : seg; o.add(x.acc + ':' + p); }); LS.set('openFolders', [...o]); }
      toast('« ' + name + ' » déplacé' + (parent ? ' dans ' + parent.split(sep).pop() : ' au premier niveau')); renderLabels();
    } catch (e) { b.disabled = false; b.textContent = 'Déplacer'; toast('Échec : ' + e.message); }
  };
}
function deleteFolderSheet(x, all) {
  if (x.full === BLOCK_LABEL) { toast('Le dossier Indésirables est protégé'); return; }
  const sep = x.delim || '/';
  const kids = all.filter(y => y.acc === x.acc && y.full.startsWith(x.full + sep));
  const name = x.full.split(sep).join(' › ');
  const nMails = x.m > 0 ? x.m : 0;
  const cnt = nMails ? `Ses ${nMails} mail${nMails > 1 ? 's' : ''}` : 'Ses mails éventuels';
  const what = x.m === 0 ? 'Le dossier est vide.' : x.acc === 'gmail'
    ? `${cnt} ne sont pas effacés : ils restent dans Gmail (« Tous les messages », et la réception pour ceux qui y sont).`
    : `${cnt} partent dans la corbeille Free.`;
  openSheet(`<span class="grip"></span><h2>Supprimer « ${esc(name)} » ?</h2>
    <p style="margin:0;color:var(--muted);font-size:.85rem;line-height:1.5"><span class="dot tdot" style="background:var(--${x.acc})"></span>${x.acc === 'gmail' ? 'Gmail' : 'Free'}. ${what}${kids.length ? ` Ses ${kids.length} sous-dossier${kids.length > 1 ? 's sont' : ' est'} supprimé${kids.length > 1 ? 's' : ''} aussi.` : ''}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"><button class="btn" data-close>Annuler</button><button class="btn danger" id="fdel-ok">Supprimer</button></div>`);
  $('#fdel-ok').onclick = async () => {
    const b = $('#fdel-ok'); b.disabled = true; b.textContent = 'Suppression…';
    const list = kids.concat([x]).sort((a, c) => c.full.length - a.full.length);
    let err = null;
    for (const y of list) {
      try {
        if (y.acc === 'gmail') await api('labels/' + encodeURIComponent(y.id), { method: 'DELETE' });
        else { if (y.m !== 0) await rapi('/free/empty', { method: 'POST', body: { folder: y.full } }); await rapi('/free/folder-delete', { method: 'POST', body: { path: y.full } }); }
      } catch (e) { err = y.full + ' : ' + e.message; break; }
    }
    closeSheet(); state.folders = null; labelsCache = null; state.lists = {}; LS.del('foldersCache');
    toast(err ? 'Échec : ' + err : 'Dossier supprimé');
    renderLabels();
  };
}
