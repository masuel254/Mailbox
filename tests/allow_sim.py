"""Expéditeurs de confiance Free : un mail Anthropic classé en indésirables par Free revient dans la réception ;
« Pas indésirable » ajoute un expéditeur et récupère ses mails. Lancé par : TEST=allow_sim.py sh tests/run.sh"""
import json, time, urllib.request, sys
R = 'http://localhost:8899'; H = {'Authorization': 'Bearer s', 'Content-Type': 'application/json'}
def req(p, body=None):
    r = urllib.request.Request(R + p, data=json.dumps(body).encode() if body is not None else None, headers=H, method='POST' if body is not None else 'GET')
    return json.loads(urllib.request.urlopen(r, timeout=60).read())
fails = []
def check(c, w): print(('ok   ' if c else 'ÉCHEC ') + w); c or fails.append(w)
def subjects(folder): return [m['subject'] for m in req('/free/list?folder=' + folder + '&limit=50').get('items', [])]
for _ in range(20):
    if any('code de connexion' in s for s in subjects('INBOX')): break
    time.sleep(3)
check(any('code de connexion' in s for s in subjects('INBOX')), 'mail Anthropic remis dans la réception automatiquement')
check(not any('code de connexion' in s for s in subjects('JUNK')), 'plus dans les indésirables de Free')
check(any('Soldes' in s for s in subjects('JUNK')), 'les vraies pubs restent dans les indésirables')
o = req('/free/allow', {'add': 'chaussea.fr'})
check(o.get('moved') == 1 and 'chaussea.fr' in o['list'], '« Pas indésirable » sur Chaussea : ajouté et récupéré tout de suite')
o = req('/free/allow', {'remove': 'chaussea.fr'})
check('chaussea.fr' not in o['list'] and 'anthropic.com' in o['list'], 'retrait d’un expéditeur de confiance')
print('\nTOUT EST BON' if not fails else '\nÉCHEC'); sys.exit(1 if fails else 0)
