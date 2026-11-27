import { test } from 'node:test';
import assert from 'node:assert/strict';
import session from '../api/session.js';
import login from '../api/auth/login.js';
import summary from '../api/summary.js';
import logout from '../api/auth/logout.js';

test('Vercel endpoints provide authenticated server-side proxy, never a client token',async()=>{
  const old={...process.env};
  const oldFetch=globalThis.fetch;
  const access='local-test-access-key-not-a-deployed-secret';
  const backend='local-test-backend-key-not-a-deployed-secret';
  try{
    process.env.APP_ACCESS_TOKEN=access;
    process.env.BACKEND_API_TOKEN=backend;
    process.env.BACKEND_URL='https://api.example.test';
    const base='https://frontend.example.test';
    const initial=await session.fetch(new Request(base+'/api/session'));
    assert.equal(initial.status,200);
    const state=await initial.json();
    assert.equal(state.authenticated,false);
    assert.equal(state.configured,true);
    assert.equal(state.maxUploadBytes,4*1024*1024);
    assert.equal((await summary.fetch(new Request(base+'/api/summary'))).status,401);
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
    const signedOut=await logout.fetch(new Request(base+'/api/auth/logout',{method:'POST',headers:{origin:base,cookie:signedCookie}}));
    assert.ok(signedOut.headers.get('Set-Cookie').includes('Max-Age=0'));
  }finally{
    globalThis.fetch=oldFetch;
    process.env=old;
  }
});
