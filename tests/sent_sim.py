"""Envoyés : le glissement à gauche ne propose que Supprimer (pas Bloquer). TEST=sent_sim.py sh tests/run.sh"""
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from fake_gmail import mock
from playwright.async_api import async_playwright
G = open(os.path.join(os.path.dirname(__file__), 'fake_google.js')).read()
SET = "localStorage.setItem('ml.tipGestures','true');"
fails = []
def check(c, w): print(('ok   ' if c else 'ÉCHEC ') + w); c or fails.append(w)
SWIPE = """async sel => { const a = document.querySelector(sel); const r = a.getBoundingClientRect(); const y = r.top + r.height / 2;
  const T = x => new Touch({ identifier: 1, target: a, clientX: x, clientY: y });
  a.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [T(300)], changedTouches: [T(300)] }));
  for (let x = 290; x >= 200; x -= 10) { a.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [T(x)], changedTouches: [T(x)] })); await new Promise(r => setTimeout(r, 16)); }
  a.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [T(200)] })); await new Promise(r => setTimeout(r, 400));
  return [...document.querySelectorAll('[data-tray]')].map(b => b.dataset.tray); }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 844}, has_touch=True)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        for s in (mock, G, SET): await pg.add_init_script(s)
        for key, want in (('SENT', ['trash']), ('INBOX', ['block', 'trash'])):
            await pg.goto('http://localhost:8765/#/list/' + key); await pg.wait_for_timeout(2500)
            got = await pg.evaluate(SWIPE, '#list a.item')
            check(got == want, f'{key} : tiroir {got}')
        check(not errs, 'aucune erreur JavaScript ' + (errs[0] if errs else ''))
        await b.close()
    print('\nTOUT EST BON' if not fails else '\nÉCHEC'); sys.exit(1 if fails else 0)
asyncio.run(main())
