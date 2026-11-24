"""Anniversaires : import, liste, agenda (bandeau, gâteau du mois), fiche, rappel serveur. TEST=bday_sim.py sh tests/run.sh"""
import asyncio, sys, os, json, datetime, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from fake_gmail import mock
from playwright.async_api import async_playwright
G = open(os.path.join(os.path.dirname(__file__), 'fake_google.js')).read()
SET = "const _s=JSON.parse(localStorage.getItem('ml.settings'));Object.assign(_s,{relayUrl:'http://localhost:8899',relayToken:'s'});localStorage.setItem('ml.settings',JSON.stringify(_s));localStorage.setItem('ml.tipGestures','true');"
t = datetime.date.today(); d2 = t + datetime.timedelta(days=2)
TXT = f"{t.day:02d}/{t.month:02d} Olivier Henot\n{d2.day:02d}/{d2.month:02d}/1980 Samuel Morieux\n28/09/1971 Laurent Van Holderbeke mariage\n29/02 Bissextile Test\nligne invalide\n"
fails = []
def check(c, w): print(('ok   ' if c else 'ÉCHEC ') + w); c or fails.append(w)
def req(p, body=None):
    r = urllib.request.Request('http://localhost:8899' + p, data=json.dumps(body).encode() if body is not None else None, headers={'Authorization': 'Bearer s', 'Content-Type': 'application/json'}, method='POST' if body is not None else 'GET')
    return json.loads(urllib.request.urlopen(r, timeout=30).read())
async def main():
    o = req('/bdays/import', {'text': TXT}); check(o['added'] == 4 and o['read'] == 4, f'import : 4 lues, 4 ajoutées ({o})')
    o = req('/bdays/import', {'text': TXT}); check(o['added'] == 0, 'réimport : doublons ignorés')
    l = req('/bdays')['list']; lv = next(x for x in l if x['name'].startswith('Laurent'))
    check(lv['type'] == 'mariage' and lv['year'] == 1971 and lv['date'] == '09-28', 'mariage et année reconnus')
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 844})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        for s in (mock, G, SET, "localStorage.setItem('ml.agMode', JSON.stringify('month'))"): await pg.add_init_script(s)
        await pg.goto('http://localhost:8765/#/agenda'); await pg.wait_for_timeout(2500)
        bn = await pg.text_content('.bd-banner') or ''
        check('Olivier Henot' in bn and 'Samuel' in bn, 'bandeau : ' + bn.strip()[:80])
        check(await pg.evaluate(f"!!document.querySelector('.mcell.bd[data-d=\"{t.isoformat()}\"]')"), 'vue Mois : gâteau sur le jour')
        rows = await pg.evaluate("[...document.querySelectorAll('.bd-ev b')].map(x=>x.textContent)")
        check(any('Olivier Henot' in r for r in rows), 'détail du jour : anniversaire en tête ' + str(rows))
        await pg.screenshot(path='/tmp/bd1.png', full_page=True)
        await pg.goto('http://localhost:8765/#/bdays'); await pg.wait_for_timeout(1500)
        txt = await pg.text_content('#bd-list')
        check('Olivier Henot' in txt and 'Aura' in txt and '4 dates' in txt, 'écran Anniversaires')
        await pg.screenshot(path='/tmp/bd2.png', full_page=True)
        await pg.click('[data-bd]'); await pg.wait_for_timeout(300)
        await pg.fill('#bs-name', 'Olivier Hénot'); await pg.select_option('#bs-x', '1'); await pg.click('#bs-ok'); await pg.wait_for_timeout(800)
        l = req('/bdays')['list']; check(any(x['name'] == 'Olivier Hénot' and x['extra'] == 1 for x in l), 'modification enregistrée (nom, rappel la veille)')
        await pg.click('#bd-add'); await pg.fill('#bs-name', 'Nouveau Contact'); await pg.click('#bs-ok'); await pg.wait_for_timeout(800)
        check(len(req('/bdays')['list']) == 5, 'ajout depuis l’écran')
        await pg.fill('#bd-q', 'nouveau'); await pg.wait_for_timeout(200); await pg.click('[data-bd]'); await pg.wait_for_timeout(300)
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.click('#bs-del'); await pg.wait_for_timeout(800)
        check(len(req('/bdays')['list']) == 4, 'suppression')
        check(not errs, 'aucune erreur JavaScript ' + (errs[0] if errs else ''))
        await b.close()
    print('\nTOUT EST BON' if not fails else '\nÉCHEC'); sys.exit(1 if fails else 0)
asyncio.run(main())
