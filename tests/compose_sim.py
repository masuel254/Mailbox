"""Destinataires : contacts fréquents au focus, recherche dès 1 lettre, carnet d'adresses. TEST=compose_sim.py sh tests/run.sh"""
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from fake_gmail import mock
from playwright.async_api import async_playwright
G = open(os.path.join(os.path.dirname(__file__), 'fake_google.js')).read()
SET = "const _s=JSON.parse(localStorage.getItem('ml.settings'));Object.assign(_s,{relayUrl:'http://localhost:8899',relayToken:'s',freeEmail:'testuser',myName:'Samuel'});localStorage.setItem('ml.settings',JSON.stringify(_s));localStorage.setItem('ml.tipGestures','true');"
# carnet connu (comme après une première synchro des contacts)
BOOK = "localStorage.setItem('ml.gcontacts', JSON.stringify({at: Date.now(), list: [{name:'Claire Martin',emails:['claire@ami.fr'],count:40,last:Date.now()},{name:'Thomas',emails:['thomas@x.fr'],count:25,last:Date.now()},{name:'Élodie Durand',emails:['elodie@y.fr'],count:3},{name:'Newsletter',emails:['noreply@shop.fr'],count:90}]}));"
fails = []
def check(c, w): print(('ok   ' if c else 'ÉCHEC ') + w); c or fails.append(w)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 844}, has_touch=True)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        for s in (mock, G, SET, BOOK): await pg.add_init_script(s)
        await pg.goto('http://localhost:8765/#/compose'); await pg.wait_for_timeout(2500)
        await pg.focus('#c-to'); await pg.wait_for_timeout(600)
        fav = await pg.evaluate("[...document.querySelectorAll('.sugg-fav button b')].map(b => b.textContent)")
        check(fav[:2] == ['Claire', 'Thomas'] and 'noreply' not in ' '.join(fav), f'champ vide : contacts fréquents proposés {fav}')
        await pg.screenshot(path='/tmp/c1.png')
        await pg.tap('.sugg-fav button[data-i="0"]'); await pg.wait_for_timeout(300)
        v = await pg.input_value('#c-to'); check('claire@ami.fr' in v, 'un toucher ajoute Claire : ' + v)
        await pg.type('#c-to', 'e'); await pg.wait_for_timeout(300)
        s = await pg.evaluate("[...document.querySelectorAll('.sugg:not(.sugg-fav) button small')].map(b => b.textContent)")
        check('elodie@y.fr' in s, f'recherche dès 1 lettre (« e ») : {s}')
        await pg.fill('#c-to', ''); await pg.click('#c-book'); await pg.wait_for_timeout(500)
        await pg.screenshot(path='/tmp/c2.png')
        await pg.fill('#cp-q', 'elo'); await pg.wait_for_timeout(200)
        n = await pg.evaluate("document.querySelectorAll('.cp-row').length"); check(n == 1, 'carnet : recherche sans accent « elo » trouve Élodie')
        await pg.click('.cp-row input'); await pg.fill('#cp-q', ''); await pg.wait_for_timeout(200)
        await pg.click('.cp-chip[data-e="thomas@x.fr"]'); await pg.wait_for_timeout(200)
        t = await pg.text_content('#cp-ok'); check('2 destinataires' in t, 'carnet : 2 choisis (' + t + ')')
        await pg.screenshot(path='/tmp/c3.png')
        await pg.click('#cp-ok'); await pg.wait_for_timeout(300)
        v = await pg.input_value('#c-to'); check('elodie@y.fr' in v and 'thomas@x.fr' in v and 'Élodie Durand' in v, 'ajoutés dans À : ' + v)
        check(not errs, 'aucune erreur JavaScript ' + (errs[0] if errs else ''))
        await b.close()
    print('\nTOUT EST BON' if not fails else '\nÉCHEC'); sys.exit(1 if fails else 0)
asyncio.run(main())
