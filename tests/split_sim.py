"""Fil Gmail de plusieurs mails sans réponse de ma part : une ligne par mail. TEST=split_sim.py sh tests/run.sh"""
import asyncio, sys, os, json, time
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
H = lambda **k: [{"name": n, "value": v} for n, v in k.items()]
now = int(time.time() * 1000)
def msg(i, t, frm, lab, dt, snip): return {"id": i, "threadId": t, "labelIds": lab, "snippet": snip, "internalDate": str(dt), "payload": {"mimeType": "text/plain", "headers": H(From=frm, To='sam@gmail.com', Subject='Votre demande Enedis'), "body": {"data": ""}}}
E = 'Enedis <ne-pas-repondre@enedis.fr>'
T = {"t9": {"id": "t9", "messages": [msg('m91', 't9', E, ['INBOX'], now - 4e5, 'Demande 1'), msg('m92', 't9', E, ['INBOX', 'UNREAD'], now - 3e5, 'Demande 2'), msg('m93', 't9', E, ['INBOX', 'UNREAD'], now - 2e5, 'Demande 3')]},
     "t8": {"id": "t8", "messages": [msg('m81', 't8', 'Paul <p@ex.fr>', ['INBOX'], now - 9e5, 'Question'), msg('m82', 't8', 'Samuel <sam@gmail.com>', ['SENT'], now - 8e5, 'Réponse'), msg('m83', 't8', 'Paul <p@ex.fr>', ['INBOX'], now - 7e5, 'Merci')]}}
mock = """
window.__T=%s; window.__calls=[];
const _f=window.fetch;
window.fetch=async(u,o)=>{u=String(u);const J=x=>new Response(JSON.stringify(x),{status:200,headers:{'Content-Type':'application/json'}});
 if(!u.includes('googleapis'))return _f(u,o);
 window.__calls.push((o&&o.method||'GET')+' '+u.replace(/.*gmail\\/v1\\/users\\/me\\//,''));
 if(u.includes('/threads?'))return J({threads:[{id:'t9'},{id:'t8'}]});
 let m=u.match(/threads\\/(t\\d)(\\?|$)/); if(m)return J(window.__T[m[1]]);
 m=u.match(/messages\\/(m\\d+)(\\?|$)/); if(m){for(const t of Object.values(window.__T))for(const x of t.messages)if(x.id===m[1])return J(x);}
 if(u.endsWith('/labels'))return J({labels:[]});
 if(u.includes('profile'))return J({emailAddress:'sam@gmail.com'});
 return J({});};
localStorage.setItem('ml.settings',JSON.stringify({clientId:'x.apps.googleusercontent.com',email:'sam@gmail.com',fontSize:18,theme:'dark',images:true,readable:true}));
localStorage.setItem('ml.token',JSON.stringify({v:'tok',exp:Date.now()+3e6}));localStorage.setItem('ml.tipGestures','true');
""" % json.dumps(T)
fails = []
def check(c, w): print(('ok   ' if c else 'ÉCHEC ') + w); c or fails.append(w)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 844})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(mock)
        await pg.goto('http://localhost:8765/#/list/INBOX'); await pg.wait_for_timeout(1500)
        ids = await pg.evaluate("[...document.querySelectorAll('#list .item')].map(a=>a.dataset.id)")
        check(sorted(i for i in ids if i.startswith('t9')) == ['t9.m91', 't9.m92', 't9.m93'], 'Enedis : 3 lignes ' + str(ids))
        check(ids.count('t8') == 1, 'vraie conversation (j’ai répondu) : 1 ligne')
        cnt = await pg.evaluate("[...document.querySelectorAll('#list .item[data-id^=\"t9\"] .count')].length")
        check(cnt == 0, 'pas de (3) sur les lignes séparées')
        await pg.screenshot(path='/tmp/split1.png')
        await pg.click('.item[data-id="t9.m92"]'); await pg.wait_for_timeout(1000)
        n = await pg.evaluate("document.querySelectorAll('.msg, .m-card, [data-mid]').length")
        body = await pg.text_content('#view')
        check('Demande 2' in body and 'Demande 1' not in body and 'Demande 3' not in body, 'ouverture : ce seul mail')
        calls = await pg.evaluate('window.__calls')
        check(any(c.startswith('POST') and 'messages/m92/modify' in c for c in calls), 'marqué lu : ce message seulement')
        check(not any('threads/t9/' in c for c in calls), 'aucune action sur tout le fil')
        await pg.screenshot(path='/tmp/split2.png')
        await pg.click('#t-trash'); await pg.wait_for_timeout(800)
        calls = await pg.evaluate('window.__calls')
        check(any(c.startswith('POST') and 'messages/m92/trash' in c for c in calls), 'Supprimer : ce message seulement')
        ids = await pg.evaluate("[...document.querySelectorAll('#list .item')].map(a=>a.dataset.id)")
        check('t9.m92' not in ids and 't9.m91' in ids and 't9.m93' in ids, 'les deux autres restent ' + str(ids))
        check(not errs, 'aucune erreur JavaScript ' + (errs[0] if errs else ''))
        await b.close()
    print('\nTOUT EST BON' if not fails else '\nÉCHEC'); sys.exit(1 if fails else 0)
asyncio.run(main())
