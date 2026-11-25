"""Barre du bas décalée (bug iOS simulé) : elle est recollée en bas de l'écran. TEST=bar_sim.py sh tests/run.sh"""
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from fake_gmail import mock
from playwright.async_api import async_playwright
G = open(os.path.join(os.path.dirname(__file__), 'fake_google.js')).read()
fails = []
def check(c, w): print(('ok   ' if c else 'ÉCHEC ') + w); c or fails.append(w)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 844})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(mock); await pg.add_init_script(G); await pg.add_init_script("localStorage.setItem('ml.tipGestures','true')")
        await pg.goto('http://localhost:8765/#/list/INBOX'); await pg.wait_for_timeout(2500)
        await pg.click('#list a.item'); await pg.wait_for_timeout(1500)
        bot = "() => Math.round(document.querySelector('.reply-bar').getBoundingClientRect().bottom)"
        check(await pg.evaluate(bot) == 844, 'barre Répondre en bas au départ')
        # on simule iOS qui garde une hauteur périmée : la barre se retrouve 330 px trop haut
        await pg.evaluate("document.querySelector('.reply-bar').style.bottom = '330px'")
        check(await pg.evaluate(bot) == 514, 'barre décalée (bug simulé)')
        await pg.wait_for_timeout(1800)
        check(await pg.evaluate(bot) == 844, 'dans les 1,5 s : recollée en bas')
        await pg.evaluate("document.querySelector('.reply-bar').style.bottom = ''"); await pg.mouse.wheel(0, -100); await pg.wait_for_timeout(600)
        check(await pg.evaluate(bot) == 844, 'bug disparu : pas de décalage inverse')
        check(not errs, 'aucune erreur JavaScript ' + (errs[0] if errs else ''))
        await b.close()
    print('\nTOUT EST BON' if not fails else '\nÉCHEC'); sys.exit(1 if fails else 0)
asyncio.run(main())
