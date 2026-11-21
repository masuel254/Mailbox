import asyncio, json, base64, sys
from playwright.async_api import async_playwright
def b(s): return base64.urlsafe_b64encode(s.encode()).decode().rstrip('=')
H=lambda **k:[{"name":n,"value":v} for n,v in k.items()]
html='<html><head><style>body{background:#fff}</style></head><body><table width="600" bgcolor="#eee"><tr><td><p style="font-size:11px;color:#999">Bonjour Samuel,</p><p>Voici le <a href="https://example.com/x">lien</a> et le point du jour.</p><img src="https://t.example/p.gif" width="1" height="1"></td></tr></table><div class="gmail_quote">Le lun. a écrit : <blockquote>ancien</blockquote></div><script>alert(1)</script><img src=x onerror="alert(2)"></body></html>'
threads={"t1":{"id":"t1","messages":[{"id":"m1","threadId":"t1","labelIds":["INBOX","UNREAD","Label_1"],"snippet":"Je te propose qu&#39;on fasse le point","internalDate":"1795400000000","payload":{"mimeType":"multipart/alternative","headers":H(From='Claire Dubois <claire@ex.fr>',To='Samuel <sam@gmail.com>',Subject='Point MRP V3 jeudi 10h',Date='x',**{"Message-ID":"<abc@ex>"}),"parts":[{"mimeType":"text/plain","headers":H(**{"Content-Type":"text/plain; charset=UTF-8"}),"body":{"data":b("Bonjour")}},{"mimeType":"text/html","headers":H(**{"Content-Type":"text/html; charset=UTF-8"}),"body":{"data":b(html)}},{"mimeType":"application/pdf","filename":"devis.pdf","headers":[],"body":{"attachmentId":"a1","size":120000}}]}}]},
 "t2":{"id":"t2","messages":[{"id":"m2","threadId":"t2","labelIds":["INBOX"],"snippet":"Le client valide la franchise","internalDate":"1795300000000","payload":{"mimeType":"text/plain","headers":H(From='Julien Martin <j@ex.fr>',To='sam@gmail.com',Subject='Re: Devis flotte 12 véhicules'),"body":{"data":b("Le client valide.\n\nLe lun., Samuel a écrit :\n> question")}}},{"id":"m3","threadId":"t2","labelIds":["SENT"],"snippet":"Merci","internalDate":"1795310000000","payload":{"mimeType":"text/plain","headers":H(From='Samuel <sam@gmail.com>',To='Julien Martin <j@ex.fr>',Subject='Re: Devis'),"body":{"data":b("Merci")}}}]}}
mock="""
window.__T=%s; window.__sent=null;
const _f=window.fetch;
window.fetch=async(u,o)=>{u=String(u);const J=x=>new Response(JSON.stringify(x),{status:200,headers:{'Content-Type':'application/json'}});
 if(!u.includes('googleapis'))return _f(u,o);
 if(u.includes('/threads?'))return J({threads:[{id:'t1'},{id:'t2'}]});
 let m=u.match(/threads\\/(t\\d)(\\?|$)/); if(m)return J(window.__T[m[1]]);
 if(u.includes('/modify'))return J({});
 if(u.includes('labels/INBOX'))return J({threadsUnread:1});
 if(u.match(/labels\\/Label/))return J({threadsUnread:2});
 if(u.endsWith('/labels'))return J({labels:[{id:'Label_1',name:'Travail',type:'user',color:{backgroundColor:'#4a86e8'}},{id:'Label_2',name:'Clients',type:'user'}]});
 if(u.includes('profile'))return J({emailAddress:'sam@gmail.com'});
 if(u.includes('messages/send')){window.__sent=JSON.parse(o.body);return J({id:'s'});}
 return J({});};
localStorage.setItem('ml.settings',JSON.stringify({clientId:'x.apps.googleusercontent.com',email:'sam@gmail.com',fontSize:18,theme:'dark',images:true,readable:true}));
localStorage.setItem('ml.token',JSON.stringify({v:'tok',exp:Date.now()+3e6}));
""" % json.dumps(threads)
async def main():
    async with async_playwright() as p:
        br=await p.chromium.launch()
        pg=await br.new_page(viewport={'width':390,'height':844},device_scale_factor=2)
        errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:(errs.append('DIALOG '+d.message),asyncio.ensure_future(d.dismiss())))
        await pg.add_init_script(mock)
        await pg.goto('http://localhost:8765/#/list/INBOX'); await pg.wait_for_timeout(800)
        await pg.screenshot(path='/home/claude/test/1-list.png',full_page=True)
        await pg.goto('http://localhost:8765/#/thread/t1'); await pg.wait_for_timeout(800)
        await pg.screenshot(path='/home/claude/test/2-thread.png',full_page=True)
        await pg.click('#t-label'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='/home/claude/test/3-label.png')
        await pg.click('[data-close]')
        await pg.click('#r-all'); await pg.wait_for_timeout(400)
        await pg.screenshot(path='/home/claude/test/4-compose.png')
        await pg.fill('#c-body','Réponse avec accents éàç')
        await pg.click('#send'); await pg.wait_for_timeout(400)
        sent=await pg.evaluate('window.__sent')
        raw=base64.urlsafe_b64decode(sent['raw']+'==').decode()
        print(raw[:600]); print('threadId',sent.get('threadId'))
        await pg.goto('http://localhost:8765/#/thread/t2'); await pg.wait_for_timeout(600)
        await pg.screenshot(path='/home/claude/test/5-thread2.png',full_page=True)
        await pg.goto('http://localhost:8765/#/settings'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='/home/claude/test/6-settings.png',full_page=True)
        print('ERRS',errs)
        await br.close()
if __name__=="__main__": asyncio.run(main())
