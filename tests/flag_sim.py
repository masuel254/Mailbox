"""Drapeau « Suivre » : bouton dans le mail (Gmail et Free), drapeau dans la liste, mail dans Suivis. TEST=flag_sim.py sh tests/run.sh"""
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from fake_gmail import mock
from playwright.async_api import async_playwright
G = open(os.path.join(os.path.dirname(__file__), 'fake_google.js')).read()
SET = "const _s=JSON.parse(localStorage.getItem('ml.settings'));Object.assign(_s,{relayUrl:'http://localhost:8899',relayToken:'s',freeEmail:'testuser'});localStorage.setItem('ml.settings',JSON.stringify(_s));localStorage.setItem('ml.tipGestures','true');"
fails = []
def check(c, w): print(('ok   ' if c else 'ÉCHEC ') + w); c or fails.append(w)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 844})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: print('  console:', m.text[:400]) if 'flag' in m.text else None)
        for s in (mock, G, SET): await pg.add_init_script(s)
        await pg.goto('http://localhost:8765/#/list/INBOX'); await pg.wait_for_timeout(3000)
        it = await pg.evaluate("(({id, folder, uid}) => ({id, folder, uid}))(state.lists[state.current].items.find(i => i.acc === 'free' && !i.starred))")
        fid = it['id']; furl = 'http://localhost:8765/#/free/' + it['folder'] + '/' + str(it['uid'])
        await pg.goto(furl); await pg.wait_for_timeout(2000)
        check(await pg.evaluate("!!document.querySelector('#t-flag')"), 'Free : drapeau en haut du mail')
        await pg.click('#t-flag'); await pg.wait_for_timeout(1200)
        print('  toast:', await pg.text_content('#toast'))
        check(await pg.evaluate("document.querySelector('#t-flag').classList.contains('on')"), 'Free : drapeau activé')
        await pg.screenshot(path='/tmp/flag1.png')
        await pg.goto('http://localhost:8765/#/list/STARRED'); await pg.wait_for_timeout(3000)
        ids = await pg.evaluate("(state.lists[state.current] || {items: []}).items.map(i => i.id)")
        check(fid in ids, 'Free : le mail est dans Suivis')
        check(await pg.evaluate(f"!!document.querySelector('#list a.item[data-id=\"{fid}\"] .star.flag')"), 'drapeau visible dans la liste')
        await pg.screenshot(path='/tmp/flag2.png')
        await pg.goto(furl); await pg.wait_for_timeout(2000); await pg.click('#t-flag'); await pg.wait_for_timeout(1200)
        check(not await pg.evaluate("document.querySelector('#t-flag').classList.contains('on')"), 'Free : drapeau retiré')
        await pg.goto('http://localhost:8765/#/list/INBOX'); await pg.wait_for_timeout(2500)
        gid = await pg.evaluate("state.lists[state.current].items.find(i => i.acc !== 'free').id")
        await pg.goto('http://localhost:8765/#/thread/' + gid); await pg.wait_for_timeout(2000)
        check(await pg.evaluate("!!document.querySelector('#t-flag')"), 'Gmail : drapeau en haut du mail')
        check(not errs, 'aucune erreur JavaScript ' + (errs[0] if errs else ''))
        await b.close()
    print('\nTOUT EST BON' if not fails else '\nÉCHEC'); sys.exit(1 if fails else 0)
asyncio.run(main())
