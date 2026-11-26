"""Contacts : date de naissance -> Google (birthdays) + liste Anniversaires. TEST=ctbd_sim.py sh tests/run.sh"""
import asyncio, sys, os, json, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from fake_gmail import mock
from playwright.async_api import async_playwright
G = open(os.path.join(os.path.dirname(__file__), 'fake_google.js')).read()
SET = "const _s=JSON.parse(localStorage.getItem('ml.settings'));Object.assign(_s,{relayUrl:'http://localhost:8899',relayToken:'s'});localStorage.setItem('ml.settings',JSON.stringify(_s));localStorage.setItem('ml.tipGestures','true');window.__w=window.__w||[];"
fails = []
def check(c, w): print(('ok   ' if c else 'ÉCHEC ') + w); c or fails.append(w)
def req(p):
    r = urllib.request.Request('http://localhost:8899' + p, headers={'Authorization': 'Bearer s'}); return json.loads(urllib.request.urlopen(r, timeout=30).read())
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 844})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        for s in (mock, G, SET): await pg.add_init_script(s)
        await pg.goto('http://localhost:8765/#/contacts'); await pg.wait_for_timeout(2000)
        await pg.click('.ct-row:has-text("Antoine Martin")'); await pg.wait_for_timeout(300)
        await pg.click('#cs-edit'); await pg.wait_for_timeout(300)
        check(await pg.is_visible('#ce-bd'), 'champ Date de naissance présent')
        check(await pg.input_value('#ce-first') == 'Antoine' and await pg.input_value('#ce-last') == 'Martin', 'prénom et nom séparés')
        await pg.screenshot(path='/tmp/ctbd1.png')
        await pg.select_option('#ce-bd', '12'); await pg.select_option('#ce-bm', '3'); await pg.fill('#ce-by', '1971')
        await pg.click('#ce-ok'); await pg.wait_for_timeout(1500)
        w = await pg.evaluate('window.__w')
        check(any('"givenName":"Antoine","familyName":"Martin"' in x for x in w), 'prénom/nom envoyés à Google')
        check(any('updateContact' in x and 'birthdays' in x and '"month":3' in x and '"day":12' in x and '"year":1971' in x for x in w), 'envoyé à Google : ' + (w[-1][:160] if w else 'rien'))
        l = req('/bdays')['list']; a = [x for x in l if x['name'] == 'Antoine Martin']
        check(len(a) == 1 and a[0]['date'] == '03-12' and a[0]['year'] == 1971 and a[0]['email'] == 'a.martin@gmail.com', 'ajouté aux Anniversaires ' + str(a))
        t = await pg.text_content('#toast'); check('anniversaire ajouté' in (t or ''), 'message : ' + str(t))
        # deuxième enregistrement : pas de doublon
        await pg.click('.ct-row:has-text("Antoine Martin")'); await pg.wait_for_timeout(300); await pg.click('#cs-edit'); await pg.wait_for_timeout(300)
        await pg.select_option('#ce-bd', '12'); await pg.select_option('#ce-bm', '3'); await pg.fill('#ce-by', '1971'); await pg.click('#ce-ok'); await pg.wait_for_timeout(1200)
        check(len([x for x in req('/bdays')['list'] if x['name'] == 'Antoine Martin']) == 1, 'pas de doublon')
        # jour seul -> refus
        await pg.click('.ct-row:has-text("Claire Dubois")'); await pg.wait_for_timeout(300); await pg.click('#cs-edit'); await pg.wait_for_timeout(300)
        await pg.select_option('#ce-bd', '5'); await pg.click('#ce-ok'); await pg.wait_for_timeout(400)
        check('jour et le mois' in (await pg.text_content('#toast') or ''), 'jour sans mois refusé')
        await pg.select_option('#ce-bd', '31'); await pg.select_option('#ce-bm', '2'); await pg.click('#ce-ok'); await pg.wait_for_timeout(400)
        check('existe pas' in (await pg.text_content('#toast') or ''), '31 février refusé')
        # agenda : bandeau / écran anniversaires
        await pg.goto('http://localhost:8765/#/bdays'); await pg.wait_for_timeout(1500)
        check('Antoine Martin' in (await pg.text_content('#bd-list') or ''), 'visible dans Anniversaires')
        check(not errs, 'aucune erreur JavaScript ' + (errs[0] if errs else ''))
        await b.close()
    print('\nTOUT EST BON' if not fails else '\nÉCHEC'); sys.exit(1 if fails else 0)
asyncio.run(main())
