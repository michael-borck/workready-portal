const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../session.js'), 'utf8');

function client(transport) {
    const stored = new Map();
    const ctx = {URL, Headers, FormData, AbortController, DOMException, Set, Promise, console,
        localStorage:{removeItem(){}},
        sessionStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},
        history:{replaceState(){}}, document:{addEventListener(){}},
        window:{fetch:transport,location:{href:'https://portal.example/'},WORKREADY_CONFIG:{API_BASE:'https://api.example'}},
    };
    vm.createContext(ctx); vm.runInContext(source,ctx);
    return {api:ctx.window.WRSession,stored};
}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});}

test('contractor code is used only for POST login; authenticated requests use the session',async()=>{
    const calls=[];
    const c=client(async(url,opts)=>{calls.push([url,opts]);return url.endsWith('/auth/login')?json({token:'session-token'}):json({handle:'persona@example.test'});});
    await c.api.login('WR-ABCD-EFGH');
    await c.api.fetch('https://api.example/api/v1/tasks/1?code=WR-ABCD-EFGH');
    assert.equal(calls[0][0],'https://api.example/api/v1/auth/login');
    assert.equal(JSON.parse(calls[0][1].body).code,'WR-ABCD-EFGH');
    assert.equal(calls[2][0],'https://api.example/api/v1/tasks/1');
    assert.equal(calls[2][1].headers.get('Authorization'),'Bearer session-token');
});

test('late login after logout cannot recreate a session',async()=>{
    let complete;
    const calls=[];
    const c=client((url,opts)=>{calls.push(url);return url.endsWith('/login')?new Promise(r=>complete=r):Promise.resolve(json({}));});
    const login=c.api.login('WR-ABCD-EFGH');
    await c.api.logout();
    complete(json({token:'late-token'}));
    await assert.rejects(login,e=>e.name==='AbortError');
    assert.equal(c.api.active(),false);
    assert.ok(calls.includes('https://api.example/api/v1/auth/logout'));
});

test('late state parsing after signout is discarded',async()=>{
    let finish;
    const c=client(async(url)=>url.endsWith('/login')?json({token:'token'}):json({}));
    await c.api.login('WR-ABCD-EFGH');
    const pending=client(async()=>({json:()=>new Promise(resolve=>finish=resolve)}));
    const response=await pending.api.fetch('https://api.example/api/v1/me/state');
    const parsed=response.json();
    await pending.api.logout();finish({handle:'previous student'});
    await assert.rejects(parsed,e=>e.name==='AbortError');
});

test('failed login leaves no stored credential',async()=>{
    const c=client(async()=>json({detail:'Unknown code'},401));
    await assert.rejects(c.api.login('bad'),/Unknown code/);
    assert.equal(c.api.active(),false);
});
