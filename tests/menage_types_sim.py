"""Ménage IA par type (relais de test 8898 + faux Gmail 8991). python3 tests/menage_types_sim.py"""
import asyncio, sys, os, json, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from fake_gmail import mock
from playwright.async_api import async_playwright
SET = "const _s=JSON.parse(localStorage.getItem('ml.settings'));Object.assign(_s,{relayUrl:'http://localhost:8898',relayToken:'s'});localStorage.setItem('ml.settings',JSON.stringify(_s));localStorage.setItem('ml.tipGestures','true');"
fails = []
def check(c, w): print(('ok   ' if c else 'ÉCHEC ') + w); c or fails.append(w)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 844})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        for s in (mock, SET): await pg.add_init_script(s)
        await pg.goto('http://localhost:8765/#/menage'); await pg.wait_for_timeout(2500)
        t = await pg.text_content('#mj')
        check('Par type de mail' in t and 'Codes et liens' in t and 'Suivi de colis' in t, 'section « Par type de mail »')
        await pg.screenshot(path='/tmp/mjt.png', full_page=True)
        # ne garder que les codes
        for k in ['t:colis', 't:ar', 't:dispo']: await pg.click(f'[data-k="{k}"]')
        await pg.evaluate("document.querySelectorAll('#mj [data-k^=\"n:\"]').forEach(c=>{ if(c.checked) c.click(); })")
        txt = await pg.text_content('#mj-apply'); check(txt.startswith('Ranger 15 '), 'total = 15 codes : ' + txt)
        await pg.click('#mj-apply'); await pg.wait_for_timeout(4000)
        check(not errs, 'aucune erreur JavaScript ' + (errs[0] if errs else ''))
        await b.close()
    print('\nTOUT EST BON' if not fails else '\nÉCHEC'); sys.exit(1 if fails else 0)
asyncio.run(main())
