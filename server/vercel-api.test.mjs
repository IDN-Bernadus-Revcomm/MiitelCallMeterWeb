import { test } from 'node:test';
import assert from 'node:assert/strict';
import session from '../api/session.js';
import login from '../api/auth/login.js';
import summary from '../api/summary.js';
import logout from '../api/auth/logout.js';
import customers from '../api/master/customers.js';
import numbers from '../api/master/numbers.js';
import masterWorkspace from '../api/master/workspace.js';

test('Vercel endpoints provide authenticated server-side proxy, never a client token',async()=>{
  const old={...process.env};
  const oldFetch=globalThis.fetch;
  const access='local-test-access-key-not-a-deployed-secret';
  const backend='local-test-backend-key-not-a-deployed-secret';
  const admin='local-test-admin-key-not-a-deployed-secret';
  try{
    process.env.APP_ACCESS_TOKEN=access;
    process.env.BACKEND_API_TOKEN=backend;
    process.env.ADMIN_ACCESS_TOKEN=admin;
    process.env.BACKEND_URL='https://api.example.test';
    const base='https://frontend.example.test';
    const initial=await session.fetch(new Request(base+'/api/session'));
    assert.equal(initial.status,200);
    const state=await initial.json();
    assert.equal(state.authenticated,false);
    assert.equal(state.configured,true);
    assert.equal(state.maxUploadBytes,4*1024*1024);
    assert.equal((await summary.fetch(new Request(base+'/api/summary'))).status,401);
    assert.equal((await customers.fetch(new Request(base+'/api/master/customers'))).status,401);
    const signedIn=await login.fetch(new Request(base+'/api/auth/login',{
      method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({token:access})
    }));
    assert.equal(signedIn.status,200);
    const cookie=signedIn.headers.get('Set-Cookie');
    assert.ok(cookie?.includes('HttpOnly; Secure; SameSite=Strict'));
    assert.ok(!cookie.includes(access));
    const signedCookie=cookie.split(';')[0];
    globalThis.fetch=async(url,options)=>{
      assert.equal(url.href,'https://api.example.test/call-charge/summary?company=demo-company');
      assert.equal(options.headers.Authorization,'Bearer '+backend);
      assert.equal(options.redirect,'error');
      return Response.json([{company_key:'demo-company'}]);
    };
    const result=await summary.fetch(new Request(base+'/api/summary?company=demo-company',{headers:{cookie:signedCookie}}));
    assert.equal(result.status,200);
    assert.deepEqual(await result.json(),[{company_key:'demo-company'}]);
    globalThis.fetch=async(url,options)=>{
      assert.equal(url.href,'https://api.example.test/master/numbers?q=021&limit=25&offset=0');
      assert.equal(options.headers.Authorization,'Bearer '+backend);
      return Response.json({rows:[],hasMore:false});
    };
    const master=await numbers.fetch(new Request(base+'/api/master/numbers?q=021&limit=25&offset=0&unexpected=ignore',{headers:{cookie:signedCookie}}));
    assert.equal(master.status,200);
    assert.deepEqual(await master.json(),{rows:[],hasMore:false});
    assert.equal((await numbers.fetch(new Request(base+'/api/master/numbers',{method:'POST',headers:{cookie:signedCookie}}))).status,405);
    assert.equal((await customers.fetch(new Request(base+'/api/master/customers',{method:'POST',headers:{cookie:signedCookie,'Content-Type':'application/json'},body:'{}'}))).status,403);
    const adminLogin=await login.fetch(new Request(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',origin:base},body:JSON.stringify({token:admin})}));
    const adminCookie=adminLogin.headers.get('Set-Cookie').split(';')[0];
    assert.equal((await (await session.fetch(new Request(base+'/api/session',{headers:{cookie:adminCookie}}))).json()).masterWriteEnabled,true);
    globalThis.fetch=async(url,options)=>{
      assert.equal(url.href,'https://api.example.test/master/customers');assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,'Bearer '+backend);
      return Response.json({id:'demo'});
    };
    const saved=await customers.fetch(new Request(base+'/api/master/customers',{method:'POST',headers:{cookie:adminCookie,origin:base,'Content-Type':'application/json'},body:JSON.stringify({customer_name:'Demo'})}));
    assert.equal(saved.status,200);
    const actionUrl=base+'/api/master/workspace?resource=number-actions';
    assert.equal((await masterWorkspace.fetch(new Request(actionUrl,{method:'POST',headers:{cookie:signedCookie,'Content-Type':'application/json'},body:'{}'}))).status,403);
    globalThis.fetch=async(url,options)=>{assert.equal(url.href,'https://api.example.test/master/number-actions');assert.equal(options.method,'POST');return Response.json({id:'demo'});};
    assert.equal((await masterWorkspace.fetch(new Request(actionUrl,{method:'POST',headers:{cookie:adminCookie,'Content-Type':'application/json'},body:'{}'}))).status,200);
    const pricingUrl=base+'/api/master/workspace?resource=pricing-save';
    assert.equal((await masterWorkspace.fetch(new Request(pricingUrl,{method:'POST',headers:{cookie:signedCookie,'Content-Type':'application/json'},body:'{}'}))).status,403);
    globalThis.fetch=async(url,options)=>{assert.equal(url.href,'https://api.example.test/master/pricing-save');assert.equal(options.method,'POST');return Response.json({id:'demo',status:'inactive'});};
    assert.equal((await masterWorkspace.fetch(new Request(pricingUrl,{method:'POST',headers:{cookie:adminCookie,'Content-Type':'application/json'},body:'{}'}))).status,200);
    assert.equal((await masterWorkspace.fetch(new Request(base+'/api/master/workspace?resource=unknown',{headers:{cookie:adminCookie}}))).status,405);
    const signedOut=await logout.fetch(new Request(base+'/api/auth/logout',{method:'POST',headers:{origin:base,cookie:signedCookie}}));
    assert.ok(signedOut.headers.get('Set-Cookie').includes('Max-Age=0'));
  }finally{
    globalThis.fetch=oldFetch;
    process.env=old;
  }
});
