"""« J'attends une réponse » sur un mail envoyé (Gmail t2 + Free Sent). TEST=wait2_sim.py sh tests/run.sh"""
import asyncio, sys, os, json, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from fake_gmail import mock
from playwright.async_api import async_playwright
G = open(os.path.join(os.path.dirname(__file__), 'fake_google.js')).read()
SET = "const _s=JSON.parse(localStorage.getItem('ml.settings'));Object.assign(_s,{relayUrl:'http://localhost:8899',relayToken:'s'});localStorage.setItem('ml.settings',JSON.stringify(_s));localStorage.setItem('ml.tipGestures','true');"
fails = []
def check(c, w): print(('ok   ' if c else 'ÉCHEC ') + w); c or fails.append(w)
def req(p):
    r = urllib.request.Request('http://localhost:8899' + p, headers={'Authorization': 'Bearer s'}); return json.loads(urllib.request.urlopen(r, timeout=30).read())
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 844})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        for s in (mock, G, SET): await pg.add_init_script(s)
        await pg.goto('http://localhost:8765/#/thread/t2'); await pg.wait_for_timeout(1500)
        check(await pg.is_visible('#t-wait') and not await pg.is_visible('#t-block'), 'mail envoyé : « J’attends » à la place de Bloquer')
        await pg.click('#t-wait'); await pg.wait_for_timeout(300); await pg.screenshot(path='/tmp/w1.png')
        await pg.click('[data-wd="3"]'); await pg.wait_for_timeout(1000)
        f = req('/follows')['items']
        check(len(f) == 1 and f[0]['threadId'] == 't2' and f[0]['toEmail'] == 'j@ex.fr' and f[0]['due'] > f[0]['sentAt'], 'suivi enregistré ' + str(f)[:160])
        check('Attendue' in await pg.text_content('#t-wait'), 'bouton passe à « Attendue »')
        # Free : mail envoyé
        await pg.goto('http://localhost:8765/#/list/INBOX'); await pg.wait_for_timeout(500)
        await pg.goto('http://localhost:8765/#/free/Sent/1'); await pg.wait_for_timeout(2500)
        check(await pg.is_visible('#t-wait'), 'Free envoyé : bouton présent')
        await pg.click('#t-wait'); await pg.wait_for_timeout(300); await pg.click('[data-wd="7"]'); await pg.wait_for_timeout(1000)
        f = req('/follows')['items']
        check(len(f) == 2 and any(x['acc'] == 'free' and x['messageId'] for x in f), 'Free suivi avec Message-ID')
        # Aujourd'hui
        await pg.goto('http://localhost:8765/#/today'); await pg.wait_for_timeout(3000)
        t = await pg.text_content('#td-wait')
        check('⏳' in t and 'relance' in t and 'Devis toiture' in t, 'Aujourd’hui : en attente, avec date de relance')
        await pg.screenshot(path='/tmp/w2.png', full_page=True)
        # Retirer (bouton caché du glissement)
        await pg.evaluate("document.querySelector('#td-wait [data-hide^=\"fw:\"]').click()"); await pg.wait_for_timeout(1000)
        check(len(req('/follows')['items']) == 1, 'Retirer = ne plus attendre (relais)')
        # Ne plus attendre depuis le mail
        await pg.goto('http://localhost:8765/#/thread/t2'); await pg.wait_for_timeout(1500)
        await pg.evaluate("LS.del('follows')"); await pg.reload(); await pg.wait_for_timeout(1500)
        check(not errs, 'aucune erreur JavaScript ' + (errs[0] if errs else ''))
        await b.close()
    print('\nTOUT EST BON' if not fails else '\nÉCHEC'); sys.exit(1 if fails else 0)
asyncio.run(main())
