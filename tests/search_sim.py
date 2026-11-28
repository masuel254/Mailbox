"""Recherche : ordre par mois, envoyés inclus, recherche gardée ; Classer avec sous-dossiers. TEST=search_sim.py sh tests/run.sh"""
import asyncio, sys, os, json, time
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
H = lambda **k: [{"name": n, "value": v} for n, v in k.items()]
now = int(time.time() * 1000); D = 86400000
def th(t, frm, lab, dt, subj): return {"id": t, "messages": [{"id": 'm' + t, "threadId": t, "labelIds": lab, "snippet": subj, "internalDate": str(dt), "payload": {"mimeType": "text/plain", "headers": H(From=frm, To='Paul <p@ex.fr>', Subject=subj), "body": {"data": ""}}}]}
T = {"ta": th('ta', 'Chauffagiste <c@ex.fr>', ['INBOX', 'UNREAD'], now - 70 * D, 'Chaudière devis ancien non lu'),
     "tb": th('tb', 'Samuel <sam@gmail.com>', ['SENT'], now - 2 * D, 'Chaudière ma relance'),
     "tc": th('tc', 'Chauffagiste <c@ex.fr>', ['Label_9'], now - 35 * D, 'Chaudière facture')}
mock = """
window.__T=%s; window.__calls=[];
const _f=window.fetch;
window.fetch=async(u,o)=>{u=String(u);const J=x=>new Response(JSON.stringify(x),{status:200,headers:{'Content-Type':'application/json'}});
 if(!u.includes('googleapis'))return _f(u,o);
 window.__calls.push((o&&o.method||'GET')+' '+decodeURIComponent(u.replace(/.*gmail\\/v1\\/users\\/me\\//,'')));
 if(u.includes('/threads?'))return J({threads:u.includes('q=')?[{id:'ta'},{id:'tb'},{id:'tc'}]:[{id:'ta'}]});
 let m=u.match(/threads\\/(t\\w)(\\?|$)/); if(m)return J(window.__T[m[1]]);
 if(u.endsWith('/labels'))return J({labels:[{id:'Label_8',name:'Maison',type:'user'},{id:'Label_9',name:'Maison/Chaudière',type:'user'},{id:'Label_7',name:'Travail',type:'user'}]});
 if(u.includes('profile'))return J({emailAddress:'sam@gmail.com'});
 return J({});};
localStorage.setItem('ml.settings',JSON.stringify({clientId:'x.apps.googleusercontent.com',email:'sam@gmail.com',fontSize:15,theme:'dark',images:true,readable:true}));
localStorage.setItem('ml.token',JSON.stringify({v:'tok',exp:Date.now()+3e6}));localStorage.setItem('ml.tipGestures','true');
""" % json.dumps(T)
fails = []
def check(c, w): print(('ok   ' if c else 'ÉCHEC ') + w); c or fails.append(w)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 844})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(mock)
        await pg.goto('http://localhost:8765/#/list/INBOX'); await pg.wait_for_timeout(1200)
        await pg.click('#btn-search'); await pg.fill('#q', 'chaudière'); await pg.press('#q', 'Enter'); await pg.wait_for_timeout(1500)
        ids = await pg.evaluate("[...document.querySelectorAll('#list .item')].map(a=>a.dataset.id)")
        check(ids == ['tb', 'tc', 'ta'], 'du plus récent au plus ancien, non lu compris ' + str(ids))
        heads = await pg.evaluate("[...document.querySelectorAll('#list .day-h')].map(a=>a.textContent)")
        check(len(heads) >= 2 and all(any(c.isdigit() for c in h) for h in heads), 'intertitres par mois ' + str(heads))
        check('Envoyé' in (await pg.text_content('#list .item[data-id="tb"]')) and 'Reçu' in (await pg.text_content('#list .item[data-id="tc"]')), 'Envoyé / Reçu précisé')
        fs = await pg.evaluate("getComputedStyle(document.querySelector('#q')).fontSize")
        check(float(fs[:-2]) >= 16, 'champ de recherche ≥ 16 px (pas de zoom iPhone) ' + fs)
        check(await pg.is_visible('#tabbar'), 'barre du bas visible')
        await pg.screenshot(path='/tmp/s1.png')
        await pg.click('.item[data-id="tc"]'); await pg.wait_for_timeout(800)
        await pg.click('#back'); await pg.wait_for_timeout(800)
        check('#/search/' in await pg.evaluate('location.hash') and await pg.input_value('#q') == 'chaudière', 'retour : recherche gardée')
        await pg.goto('http://localhost:8765/#/list/INBOX'); await pg.wait_for_timeout(800)
        await pg.click('#btn-search'); await pg.wait_for_timeout(800)
        check('#/search/chaudi' in await pg.evaluate('decodeURIComponent(location.hash)'), 'loupe : reprend la dernière recherche')
        # Classer depuis la liste (menu appui long → Classer dans…) et depuis le mail
        await pg.goto('http://localhost:8765/#/thread/ta'); await pg.wait_for_timeout(800)
        await pg.click('#t-label'); await pg.wait_for_timeout(600)
        t = await pg.text_content('#sheet')
        check('Chaudière' in t and 'Maison ›' in t, 'Classer : Maison › Chaudière visible')
        await pg.screenshot(path='/tmp/s2.png')
        await pg.evaluate("document.querySelector('#sheet [data-close]').click()")
        await pg.evaluate("labelSheet('ta', ['Label_7'])"); await pg.wait_for_timeout(600)
        check(await pg.is_visible('#lab-rows'), 'Classer depuis la liste (libellés en tableau) s’ouvre')
        check(not errs, 'aucune erreur JavaScript ' + (errs[0] if errs else ''))
        await b.close()
    print('\nTOUT EST BON' if not fails else '\nÉCHEC'); sys.exit(1 if fails else 0)
asyncio.run(main())
