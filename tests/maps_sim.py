"""Agenda : ajouter un lieu / lien Google Maps à un événement TimeTree. TEST=maps_sim.py sh tests/run.sh"""
import asyncio, sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from fake_gmail import mock
from playwright.async_api import async_playwright
G = open(os.path.join(os.path.dirname(__file__), 'fake_google.js')).read()
SET = "const _s=JSON.parse(localStorage.getItem('ml.settings'));Object.assign(_s,{relayUrl:'http://localhost:8899',relayToken:'s'});localStorage.setItem('ml.settings',JSON.stringify(_s));localStorage.setItem('ml.tipGestures','true');window.__opened=[];window.open=u=>{window.__opened.push(u);};"
LONG = 'https://www.google.com/maps/place/BYD+Calais/@50.93,1.86,17z/data=' + 'x' * 220
fails = []
def check(c, w): print(('ok   ' if c else 'ÉCHEC ') + w); c or fails.append(w)
async def main():
    open('/tmp/ttposts.log', 'w').close()
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 844})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        for s in (mock, G, SET): await pg.add_init_script(s)
        await pg.goto('http://localhost:8765/#/agenda'); await pg.wait_for_timeout(500)
        await pg.evaluate("LS.set('agMode','list')"); await pg.goto('http://localhost:8765/#/agenda?x=1'); await pg.wait_for_timeout(3000)
        ok = await pg.evaluate("(()=>{const b=[...document.querySelectorAll('[data-tt]')].find(x=>x.textContent.includes('Piscine')||x.textContent.includes('Vacances'));if(!b)return false;b.click();return true;})()")
        check(ok, 'événement TimeTree trouvé'); await pg.wait_for_timeout(400)
        check(await pg.is_visible('#tt-loc'), 'bouton « Ajouter un lieu ou un lien Google Maps »')
        await pg.screenshot(path='/tmp/mp1.png')
        await pg.click('#tt-loc'); await pg.wait_for_timeout(500)
        check(await pg.evaluate("document.activeElement && document.activeElement.id") == 'ev-loc', 'champ Lieu prêt à remplir')
        await pg.click('#ev-gm'); await pg.wait_for_timeout(300)
        op = await pg.evaluate("[...document.querySelectorAll('a')].length >= 0")
        check(await pg.is_visible('#ev-gm-tip'), 'explication « Partager › Copier le lien »')
        await pg.fill('#ev-loc', LONG); await pg.screenshot(path='/tmp/mp2.png')
        await pg.click('#ev-ok'); await pg.wait_for_timeout(2000)
        log = open('/tmp/ttposts.log').read()
        check('PUT' in log, 'modification envoyée à TimeTree')
        body = json.loads(log.split(' ', 2)[2]) if log.startswith('PUT') else {}
        ev = body.get('event', body)
        check(ev.get('location', 'x') == '' and LONG in ev.get('note', ''), 'lien long rangé dans la note, pas coupé ' + str({k: str(v)[:40] for k, v in ev.items() if k in ('location', 'note')}))
        check(not errs, 'aucune erreur JavaScript ' + (errs[0] if errs else ''))
        await b.close()
    print('\nTOUT EST BON' if not fails else '\nÉCHEC'); sys.exit(1 if fails else 0)
asyncio.run(main())
