import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession,verifySession,equalSecret } from './auth.mjs';
test('session signature and expiry',()=>{
  const secret='test-only-secret-that-is-not-a-live-key';
  const session=createSession(secret,100000);
  assert.equal(verifySession(session,secret,100001),true);
  assert.equal(verifySession(session,secret,100000+8*60*60*1000),false);
  assert.equal(verifySession(session+'x',secret,100001),false);
  assert.equal(verifySession(session,'wrong-secret',100001),false);
  assert.equal(equalSecret(secret,secret),true);
});
