"""Retour dans l'appli : réception après plus de 20 s d'absence, sauf écriture d'un mail. Zoom : barres masquées. TEST=resume_sim.py sh tests/run.sh"""
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from fake_gmail import mock
from playwright.async_api import async_playwright
G = open(os.path.join(os.path.dirname(__file__), 'fake_google.js')).read()
fails = []
def check(c, w): print(('ok   ' if c else 'ÉCHEC ') + w); c or fails.append(w)
# simule « appli quittée il y a X s » puis retour
AWAY = """s => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'));
  const t = Date.now; Date.now = () => t() + s * 1000;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); Date.now = t; }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 844})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(mock); await pg.add_init_script(G); await pg.add_init_script("localStorage.setItem('ml.tipGestures','true')")
        await pg.goto('http://localhost:8765/#/list/INBOX'); await pg.wait_for_timeout(2500)
        await pg.click('#list a.item'); await pg.wait_for_timeout(1500)
        check((await pg.evaluate('location.hash')).startswith('#/thread/'), 'dans un mail')
        await pg.evaluate(AWAY, 5); await pg.wait_for_timeout(500)
        check((await pg.evaluate('location.hash')).startswith('#/thread/'), 'retour éclair (5 s) : reste dans le mail')
        await pg.evaluate(AWAY, 120); await pg.wait_for_timeout(1500)
        check(await pg.evaluate('location.hash') == '#/list/INBOX', 'retour après 2 min : réception')
        check(await pg.evaluate("!!document.querySelector('#list a.item')"), 'la réception est affichée')
        await pg.goto('http://localhost:8765/#/compose'); await pg.wait_for_timeout(1500)
        await pg.evaluate(AWAY, 300); await pg.wait_for_timeout(500)
        check(await pg.evaluate('location.hash') == '#/compose', 'mail en cours d’écriture : on ne quitte pas')
        await pg.evaluate("document.body.classList.add('zoomed')")
        check(await pg.evaluate("getComputedStyle(document.querySelector('#tabbar')).opacity") == '0', 'zoomé : barre du bas masquée')
        check(not errs, 'aucune erreur JavaScript ' + (errs[0] if errs else ''))
        await b.close()
    print('\nTOUT EST BON' if not fails else '\nÉCHEC'); sys.exit(1 if fails else 0)
asyncio.run(main())
