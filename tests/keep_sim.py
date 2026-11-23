"""« Toujours garder » côté Free : le mail de Chaussea quitte les indésirables pour la réception. TEST=keep_sim.py sh tests/run.sh"""
import json, time, urllib.request, sys
R = 'http://localhost:8899'; H = {'Authorization': 'Bearer s', 'Content-Type': 'application/json'}
def req(p, body=None):
    r = urllib.request.Request(R + p, data=json.dumps(body).encode() if body is not None else None, headers=H, method='POST' if body is not None else 'GET')
    return json.loads(urllib.request.urlopen(r, timeout=60).read())
fails = []
def check(c, w): print(('ok   ' if c else 'ÉCHEC ') + w); c or fails.append(w)
subj = lambda f: [m['subject'] for m in req('/free/list?folder=' + f + '&limit=50').get('items', [])]
time.sleep(5)
t0 = time.time(); o = req('/sender/keep', {'target': 'chaussea.fr', 'name': 'Chaussea'}); dt = time.time() - t0
check(o.get('free') == 1, f'Free : 1 mail remis en réception ({o}) en {dt:.1f} s')
check(any('Soldes' in s for s in subj('INBOX')) and not any('Soldes' in s for s in subj('JUNK')), 'Chaussea est dans la réception, plus dans les indésirables')
check('chaussea.fr' in req('/free/allow')['list'], 'Chaussea ajouté aux acceptés Free')
print('\nTOUT EST BON' if not fails else '\nÉCHEC'); sys.exit(1 if fails else 0)
