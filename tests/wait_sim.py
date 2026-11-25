"""Accueil « En attente de réponse » : glisser à gauche pour retirer, annulable ; mails à soi-même exclus. TEST=wait_sim.py sh tests/run.sh"""
import asyncio, sys, os, json, time
sys.path.insert(0, os.path.dirname(__file__))
from fake_gmail import mock
from playwright.async_api import async_playwright
G = open(os.path.join(os.path.dirname(__file__), 'fake_google.js')).read()
now = int(time.time() * 1000)
W = [{'id': 'w1', 'acc': 'gmail', 'to': 'Destrez Maxime', 'toEmail': 'max@x.fr', 'subject': 'Intervention', 'date': now - 3 * 864e5},
     {'id': 'w2', 'acc': 'gmail', 'to': 'Claire', 'toEmail': 'claire@ami.fr', 'subject': 'Dîner', 'date': now - 5 * 864e5}]
SET = "localStorage.setItem('ml.tipGestures','true');localStorage.setItem('ml.todayWait', JSON.stringify({at: Date.now(), items: %s}))" % json.dumps(W)
fails = []
def check(c, w): print(('ok   ' if c else 'ÉCHEC ') + w); c or fails.append(w)
SW = """async () => { const a = document.querySelector('#td-wait .td-w'); const r = a.getBoundingClientRect(); const y = r.top + r.height / 2;
  const T = x => new Touch({ identifier: 1, target: a, clientX: x, clientY: y });
  a.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [T(300)], changedTouches: [T(300)] }));
  for (let x = 290; x >= 180; x -= 10) { a.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [T(x)], changedTouches: [T(x)] })); await new Promise(r => setTimeout(r, 16)); }
  a.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [T(180)] })); await new Promise(r => setTimeout(r, 300)); }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 844}, has_touch=True)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        for s in (mock, G, SET): await pg.add_init_script(s)
        await pg.goto('http://localhost:8765/#/today'); await pg.wait_for_timeout(3000)
        n = lambda: pg.evaluate("document.querySelectorAll('#td-wait .td-swipe').length")
        check(await n() == 2, 'deux mails en attente')
        await pg.evaluate(SW.replace("setTimeout(r, 300)", "setTimeout(r, 30)"))
        check(await pg.evaluate("!!document.querySelector('#td-wait .td-w[data-open]')"), 'glisser : bouton Retirer visible')
        await pg.evaluate("document.querySelector('#td-wait .td-w[data-open]').dispatchEvent(new MouseEvent('click', {bubbles: true}))"); await pg.wait_for_timeout(100)
        check(await pg.evaluate("!!document.querySelector('#td-wait .td-w[data-open]')"), 'le clic fantôme d’iOS ne le referme pas')
        await pg.evaluate("renderToday(false, true)"); await pg.wait_for_timeout(1200)
        check(await pg.evaluate("!!document.querySelector('#td-wait .td-w[data-open]')"), 'reste ouvert malgré une actualisation automatique')
        await pg.screenshot(path='/tmp/wait1.png')
        await pg.click('#td-wait .td-del'); await pg.wait_for_timeout(400)
        check(await n() == 1, 'retiré de la liste')
        check('w1' in await pg.evaluate("localStorage.getItem('ml.waitHide')"), 'mémorisé')
        await pg.click('#toast button'); await pg.wait_for_timeout(1500)
        check(await n() == 2, 'Annuler le remet')
        check(not errs, 'aucune erreur JavaScript ' + (errs[0] if errs else ''))
        await b.close()
    print('\nTOUT EST BON' if not fails else '\nÉCHEC'); sys.exit(1 if fails else 0)
asyncio.run(main())
