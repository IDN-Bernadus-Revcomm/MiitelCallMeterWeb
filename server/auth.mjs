import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x,y);
}

export function createSession(secret, now = Date.now()) {
  const body = `${now + 8*60*60*1000}.${randomBytes(24).toString('hex')}`;
  return `${body}.${createHmac('sha256',secret).update(body).digest('hex')}`;
}

export function verifySession(value, secret, now = Date.now()) {
  if (!secret || typeof value !== 'string') return false;
  const [expires,nonce,signature,...rest] = value.split('.');
  if (rest.length || !/^\d+$/.test(expires || '') ||
      !/^[a-f0-9]{48}$/.test(nonce || '') || !/^[a-f0-9]{64}$/.test(signature || '')) return false;
  if (Number(expires) <= now) return false;
  const expected = createHmac('sha256',secret).update(`${expires}.${nonce}`).digest('hex');
  return equalSecret(signature,expected);
}
