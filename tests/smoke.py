"""Test de fumée MailBox : ouvre chaque écran et les gestes principaux, échoue à la moindre erreur JavaScript.
Lancé par tests/run.sh (qui démarre les faux serveurs IMAP, TimeTree, IA et le relais) ; aussi appelé par release.sh."""
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from fake_gmail import mock
from playwright.async_api import async_playwright
G = open(os.path.join(os.path.dirname(__file__), 'fake_google.js')).read()
APP = os.environ.get('APP', 'http://localhost:8765/')
RELAY = os.environ.get('RELAY', 'http://localhost:8899')
SET = "const _s=JSON.parse(localStorage.getItem('ml.settings'));Object.assign(_s,{relayUrl:'%s',relayToken:'s',ai:true,freeEmail:'testuser',myName:'Samuel'});localStorage.setItem('ml.settings',JSON.stringify(_s));localStorage.setItem('ml.tipGestures','true');" % RELAY
TOUCH = """([sel, ms]) => new Promise(res => { const el = document.querySelector(sel); const r = el.getBoundingClientRect();
  const t = new Touch({ identifier: 1, target: el, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
  el.dispatchEvent(new TouchEvent('touchstart', { touches: [t], targetTouches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
  setTimeout(() => { el.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [t], bubbles: true, cancelable: true })); res(); }, ms); })"""
fails = []
def check(cond, what):
    print(('ok   ' if cond else 'ÉCHEC ') + what)
    if not cond: fails.append(what)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='dark', has_touch=True)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))
        await pg.add_init_script(mock); await pg.add_init_script(G); await pg.add_init_script(SET)
        async def go(h, wait=1800):
            await pg.goto(APP + h); await pg.wait_for_timeout(wait)
        await go('', 3000)
        check(await pg.locator('#list').count() == 1, 'ouverture sur Tous les mails')
        await pg.click('.home-seg a >> nth=0'); await pg.wait_for_timeout(3500)
        check(await pg.locator('#td').count() == 1, 'accueil Aujourd’hui')
        check('Claire' in await pg.inner_text('#td-mails'), 'À traiter contient le mail de Claire')
        for _ in range(8):
            if 'Piscine' in await pg.inner_text('#td-ag'): break
            await pg.wait_for_timeout(1000); await pg.evaluate("renderToday(true)"); await pg.wait_for_timeout(1500)
        check('Piscine' in await pg.inner_text('#td-ag'), 'agenda du jour avec TimeTree')
        await pg.click('.home-seg a >> nth=1'); await pg.wait_for_timeout(4000)
        check('#/list/INBOX' in pg.url and await pg.locator('#list a.item').count() >= 2, 'Aujourd’hui puis Tous les mails : reste sur la réception')
        await pg.evaluate(TOUCH, ["#list a.item", 650]); await pg.wait_for_timeout(500)
        check(await pg.locator('.amenu').count() == 1, 'appui long sur un mail : menu d’actions')
        await pg.evaluate("closeSheet()")
        await go('#/thread/t1', 2000)
        check(await pg.locator('.msg-body').count() >= 1, 'conversation ouverte')
        await pg.click('[data-fs="1"]'); check(await pg.evaluate('settings.fontSize') == 19, 'A+ agrandit le texte')
        await pg.click('#t-more'); await pg.click('#t-clean'); await pg.wait_for_timeout(1500)
        check(await pg.locator('.sc-n, #sheet .empty').count() >= 1, 'nettoyage par expéditeur : comptage')
        await pg.evaluate("closeSheet()")
        await go('#/compose', 1200)
        await pg.fill('#c-to', 'cla'); await pg.wait_for_timeout(800)
        check(await pg.locator('.sugg button').count() >= 1, 'destinataires suggérés')
        await pg.fill('#c-subj', 'Test brouillon'); await pg.fill('#c-body', 'Bonjour'); await pg.wait_for_timeout(1000)
        await go('#/compose', 1200)
        check(await pg.input_value('#c-subj') == 'Test brouillon', 'brouillon restauré')
        await pg.click('#c-later'); await pg.wait_for_timeout(300)
        check(await pg.locator('#sheet [data-q]').count() >= 1, 'envoyer plus tard : choix de date')
        await pg.evaluate("closeSheet()")
        for mode in ['day', 'week', 'month', 'list']:
            await go('#/agenda', 1200); await pg.click(f'#ag-seg [data-m={mode}]'); await pg.wait_for_timeout(1200)
            check(await pg.locator('#ag-list').count() == 1, 'agenda vue ' + mode)
        await pg.click('#ag-seg [data-m=week]'); await pg.wait_for_timeout(800)
        await pg.click('#ag-new'); await pg.wait_for_timeout(300)
        check(await pg.locator('#ev-rem').count() == 1, 'événement : options rappel/répétition/invités')
        await pg.evaluate("closeSheet()")
        await go('#/contacts', 1500)
        await pg.click('.ct-row >> nth=0'); await pg.wait_for_timeout(1500)
        check(await pg.locator('#cs-feed').count() == 1, 'fiche contact : échanges et rendez-vous')
        await pg.evaluate("closeSheet()")
        for h in ['#/labels', '#/scheduled', '#/outbox', '#/blocked', '#/menage', '#/settings', '#/tasks', '#/waiting', '#/search/devis']:
            await go(h, 1800); check(len(await pg.inner_text('#view')) > 20, 'écran ' + h)
        check(not errs, 'aucune erreur JavaScript' + (' : ' + ' | '.join(errs[:3]) if errs else ''))
        await b.close()
    print('\n' + ('TOUT EST BON' if not fails else str(len(fails)) + ' échec(s)'))
    sys.exit(1 if fails else 0)
asyncio.run(main())
