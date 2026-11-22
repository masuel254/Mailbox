"""Simulations « lu qui revient » : swipe lu/non lu sur Gmail et Free, puis le relais renvoie une liste périmée
(pause Google, retard de Gmail) ; le mail doit garder l'état choisi. Lancé par : TEST=swipe_sim.py sh tests/run.sh"""
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from fake_gmail import mock
from playwright.async_api import async_playwright
G = open(os.path.join(os.path.dirname(__file__), 'fake_google.js')).read()
APP = 'http://localhost:8765/'; RELAY = 'http://localhost:8899'
SET = "const _s=JSON.parse(localStorage.getItem('ml.settings'));Object.assign(_s,{relayUrl:'%s',relayToken:'s',ai:true,freeEmail:'testuser',myName:'Samuel'});localStorage.setItem('ml.settings',JSON.stringify(_s));localStorage.setItem('ml.tipGestures','true');" % RELAY
fails = []
def check(cond, what):
    print(('ok   ' if cond else 'ÉCHEC ') + what)
    if not cond: fails.append(what)
# état « non lu » d'un mail dans la liste affichée
UNREAD = "id => { const a = document.querySelector(`#list a.item[data-id=\"${id}\"]`); return a ? a.classList.contains('u') || !!a.closest('.u') || (state.lists[state.current].items.find(i => i.id === id) || {}).unread : null; }"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 390, 'height': 844}, has_touch=True)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(mock); await pg.add_init_script(G); await pg.add_init_script(SET)
        await pg.goto(APP + '#/list/INBOX'); await pg.wait_for_timeout(5000)
        # Liste « Tous » : Gmail (t1) + Free
        items = await pg.evaluate("(state.lists[state.current] || {items: []}).items.filter(i => i.unread).map(i => i.id)")
        fid = next((i for i in items if i.startswith('f:')), None); gid = next((i for i in items if not i.startswith('f:')), None)
        check(bool(fid) and bool(gid), f'départ : un non lu Gmail ({gid}) et un non lu Free ({fid})')
        # ce que l'utilisateur voit : la ligne du mail a la classe « u » quand elle est affichée non lue
        unread = lambda i: pg.evaluate("id => { const a = document.querySelector(`#list a.item[data-id=\"${CSS.escape(id)}\"]`); return a ? a.classList.contains('u') : null; }", i)
        # index périmé tel que le relais l'aurait envoyé avant les actions
        stale = await pg.evaluate("rapi('/inbox?v=0')")
        gstale = await pg.evaluate("id => api('threads/' + id + '?format=metadata')", gid)
        async def push_stale(extra_v):
            await pg.evaluate("([ix, g, n]) => applyIndex(Object.assign({}, ix, { v: ix.v + n, at: Date.now() - 60000, g: g ? [g].concat(ix.g || []) : ix.g }))", [stale, gstale, extra_v])
            await pg.wait_for_timeout(300)
        for acc, mid in (('Free', fid), ('Gmail', gid)):
            # 1. swipe lu
            await pg.evaluate("id => swipeAct(id, 'read')", mid); await pg.wait_for_timeout(800)
            check(await unread(mid) is False, f'{acc} : lu tout de suite après le swipe')
            # 2. le relais renvoie une liste périmée (pause Google / retard Gmail) : 3 fois
            for k in range(3): await push_stale(100 + k + (0 if acc == 'Free' else 10))
            check(await unread(mid) is False, f'{acc} : reste lu malgré 3 listes périmées du relais')
            # 3. le relais a bien été prévenu (sa copie est corrigée)
            ix = await pg.evaluate("rapi('/inbox?v=0')")
            if acc == 'Free':
                uid = int(mid.split(':')[1]); f = next((x for x in ix.get('f', []) if x['uid'] == uid), None)
                check(f is not None and f['seen'] is True, 'Free : la copie du relais est à jour (lu)')
            # 4. annuler : non lu, puis liste périmée « lu »
            await pg.evaluate("id => swipeAct(id, 'unread')", mid); await pg.wait_for_timeout(800)
            check(await unread(mid) is True, f'{acc} : non lu tout de suite après annulation')
        # 5. échec réel : Free refuse → le mail revient non lu (vérité) et un message s'affiche
        await pg.route('**/free/flags', lambda r: r.fulfill(status=500, body='{"error":"Free indisponible"}'))
        await pg.evaluate("id => swipeAct(id, 'read')", fid); await pg.wait_for_timeout(1200)
        check(await unread(fid) is True, 'Free en panne : le mail redevient non lu (pas de faux « lu »)')
        await pg.unroute('**/free/flags')
        # 6. une liste du relais plus récente et conforme fait oublier le changement local
        await pg.evaluate("id => swipeAct(id, 'read')", fid); await pg.wait_for_timeout(2500)
        fresh = await pg.evaluate("rapi('/inbox?v=0')")
        await pg.evaluate("ix => applyIndex(Object.assign({}, ix, { v: ix.v + 500, at: Date.now() }))", fresh); await pg.wait_for_timeout(300)
        check(await pg.evaluate("id => !localPatch.has(id)", fid), 'changement confirmé par le relais : mémoire locale libérée')
        # 7. sélection multiple « lu » puis liste périmée
        await pg.evaluate("id => swipeAct(id, 'unread')", fid); await pg.wait_for_timeout(1200)
        await pg.evaluate("([a, b]) => { enterSelect(); state.sel = new Set([a, b]); updateSelBar(); }", [fid, gid])
        await pg.evaluate("() => document.querySelector('#sel-read').click()"); await pg.wait_for_timeout(1500)
        await push_stale(900)
        check(await unread(fid) is False and await unread(gid) is False, 'sélection multiple « lu » : reste lu malgré une liste périmée')
        check(not errs, 'aucune erreur JavaScript' + (' : ' + errs[0] if errs else ''))
        await b.close()
    print('\nTOUT EST BON' if not fails else '\n' + str(len(fails)) + ' ÉCHEC(S)')
    sys.exit(1 if fails else 0)
asyncio.run(main())
