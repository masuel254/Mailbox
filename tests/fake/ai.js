require('http').createServer((q, r) => { let b=''; q.on('data', d => b += d); q.on('end', () => { r.setHeader('Content-Type','application/json');
 if (q.url.endsWith('/models')) return r.end('{"data":[]}');
 const sys = JSON.parse(b).messages[0].content; let c;
 if (/en tâche/.test(sys)) c = { title: 'Envoyer le devis à Claire', due: '2026-11-25T09:00' };
 else if (/résumes/.test(sys)) c = { resume: 'Claire propose un point jeudi.', points: ['Point MRP V3'], chronologie: [{date:'18/11',qui:'Claire',fait:'propose jeudi'},{date:'19/11',qui:'Samuel',fait:'accepte'}], engagements: [{qui:'Samuel',quoi:'envoyer le devis',quand:'mardi'}], echeances: [{quoi:'Envoyer le devis', date:'2026-11-24'}] };
 else if (/propositions de réponse/.test(sys)) c = { variants: [{label:'Accepter', body:'Bonjour Claire,\nJeudi 10h me va.\nSamuel'},{label:'Décliner', body:'Bonjour,\nPas dispo.\nSamuel'}] };
 else if (/choisis le dossier/.test(sys)) c = { folder: 'Maison', why: 'facture énergie' };
 else if (/synthèse de son agenda/.test(sys)) { require('fs').writeFileSync('/tmp/agin.txt', JSON.parse(b).messages[1].content); c = { titre: 'Une semaine chargée en début de semaine', resume: 'Trois rendez-vous, dont un dîner familial dimanche.', jours: [{ jour: 'vendredi 20', points: ['Comité produit à 9 h en visio'] }], attention: ['Déjeuner samedi puis dîner à Calais dimanche'], libre: ['Jeudi après-midi libre'], preparer: ['Ordre du jour du comité'] }; }
 else if (/repères un rendez-vous/.test(sys)) c = { found: true, title: 'Point MRP V3', start: '2026-11-26T10:00', end: null, allDay: false, location: 'Visio', note: 'Proposé par Claire' };
 else if (/retrouver des mails/.test(sys)) c = { queries: ['Pergola'], resume: 'portail', indices: 'artisan' };
 else if (/évalues des mails candidats/.test(sys)) c = { results: [{ i: 0, score: 9, why: 'intervention portail' }], contact: { name: 'EDF', email: 'c@edf.fr' } };
 else if (/écran d’accueil/.test(sys)) c = { resume: 'Claire attend ta réponse pour jeudi ; comité produit à 9 h.', mails: [{ i: 0, tag: 'Travail' }] };
 else c = { q: 'devred', resume: 'x' };
 r.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(c) } }] })); }); }).listen(8977);
