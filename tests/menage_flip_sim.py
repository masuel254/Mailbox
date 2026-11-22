"""Ménage IA : un expéditeur « gardé par l'IA » passe « à virer ». TEST=menage_flip_sim.py sh tests/run.sh"""
import asyncio, sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from fake_gmail import mock
from playwright.async_api import async_playwright
G = open(os.path.join(os.path.dirname(__file__), 'fake_google.js')).read()
SET = "const _s=JSON.parse(localStorage.getItem('ml.settings'));Object.assign(_s,{relayUrl:'http://localhost:8899',relayToken:'s',freeEmail:'testuser'});localStorage.setItem('ml.settings',JSON.stringify(_s));localStorage.setItem('ml.tipGestures','true');"
MJ = {'status': 'done', 'at': 1, 'end': 1, 'scanned': 100, 'g': {'done': 100}, 'f': {'done': 0}, 'applied': 0, 'groups': [
  {'key': 'n:pandora', 'name': 'Pandora', 'emails': ['n@pandora.net'], 'count': 50, 'kept': 0, 'v': 'virer', 'why': 'promo', 'subjects': ['Charms']},
  {'key': 'n:eedomus', 'name': 'eedomus', 'emails': ['alert@eedomus.com'], 'count': 1267, 'kept': 1, 'v': 'garder', 'why': 'alertes domotique', 'subjects': ['Batterie faible']},
  {'key': 'n:credit agricole', 'name': 'Crédit Agricole', 'emails': ['ca@ca.fr'], 'count': 320, 'kept': 21, 'v': 'garder', 'why': 'banque', 'subjects': ['Virement']}]}
fails = []
def check(c, w): print(('ok   ' if c else 'ÉCHEC ') + w); c or fails.append(w)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 844})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        for s in (mock, G, SET): await pg.add_init_script(s)
        posted = []
        async def r_menage(route): await route.fulfill(status=200, content_type='application/json', body=json.dumps(MJ))
        async def r_verdict(route):
            posted.append(json.loads(route.request.post_data)); await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
        await pg.route('**/menage/verdict', r_verdict); await pg.route('**/menage', r_menage)
        await pg.goto('http://localhost:8765/#/menage'); await pg.wait_for_timeout(2500)
        await pg.click('.mj-kept summary'); await pg.fill('#mj-kq', 'eedo'); await pg.wait_for_timeout(200)
        check(await pg.evaluate("document.querySelectorAll('#mj-klist .mj-row').length") == 1, 'recherche « eedo » dans les gardés')
        await pg.click('[data-vir="n:eedomus"]'); await pg.wait_for_timeout(600)
        check(posted == [{'key': 'n:eedomus', 'v': 'virer'}], 'verdict envoyé au serveur')
        txt = await pg.text_content('#mj-apply')
        check('1 317' in txt.replace(' ', ' ').replace('\xa0', ' '), 'eedomus coché et ajouté au total : ' + txt)
        check(await pg.evaluate("[...document.querySelectorAll('[data-k]')].map(c=>c.dataset.k).includes('n:eedomus')"), 'eedomus dans « Proposés au ménage »')
        await pg.screenshot(path='/tmp/flip.png')
        check(not errs, 'aucune erreur JavaScript ' + (errs[0] if errs else ''))
        await b.close()
    print('\nTOUT EST BON' if not fails else '\nÉCHEC'); sys.exit(1 if fails else 0)
asyncio.run(main())
