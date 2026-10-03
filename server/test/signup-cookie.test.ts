/**
 * The credential between "code verified" and "account created". In a browser it lives in an httpOnly cookie that page scripts cannot
 * read, and /auth/signup is the only route that receives it. Native clients keep the explicit token.
 */
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { after, before, describe, it } from 'node:test';
import { setup } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;

describe('web signup continuation', () => {
  let t: T;
  let n = 0;
  before(async () => (t = await setup()));
  after(async () => t.close());

  const web = { 'x-pact-client': 'web', origin: 'http://localhost:5173', 'content-type': 'application/json' };
  const post = (url: string, payload: unknown, headers: Record<string, string> = web) => t.app.inject({ method: 'POST', url: `/api${url}`, headers, payload: JSON.stringify(payload) });
  const phone = () => `0803${String(7000000 + ++n * 13).slice(0, 7)}`;
  const cookieOf = (res: { headers: Record<string, unknown> }, name: string) => {
    const raw = ([] as string[]).concat((res.headers['set-cookie'] as string | string[] | undefined) ?? []).find((c) => c.startsWith(`${name}=`));
    return raw;
  };
  const verify = async (ph: string, headers = web) => {
    const otp = JSON.parse((await post('/auth/otp/request', { phone: ph }, headers)).body);
    return post('/auth/otp/verify', { phone: ph, code: otp.devCode }, headers);
  };
  const profile = { firstName: 'Nia', lastName: 'Cookie', pin: '2468' };

  it('hands a browser the credential in an httpOnly cookie and not in the response', async () => {
    const res = await verify(phone());
    const body = JSON.parse(res.body);
    assert.equal(body.status, 'needs_profile');
    assert.equal(body.signupToken, undefined, 'the page never sees it');
    assert.ok(!res.body.includes('eyJ'), 'no JWT anywhere in the body');
    const c = cookieOf(res, 'pact_su')!;
    assert.match(c, /HttpOnly/i);
    assert.match(c, /SameSite=Strict/i);
    assert.match(c, /Path=\/api\/auth\/signup/);
    assert.match(c, /Max-Age=1200/);
  });

  it('verify, then a refresh of the page, then signup with nothing but the cookie; the cookie is cleared', async () => {
    const res = await verify(phone());
    const cookie = cookieOf(res, 'pact_su')!.split(';')[0];
    // A reload loses all page state; the browser still sends the cookie.
    const done = await post('/auth/signup', profile, { ...web, cookie });
    assert.equal(done.statusCode, 200, done.body);
    const out = JSON.parse(done.body);
    assert.ok(out.accessToken && out.user.firstName === 'Nia');
    assert.equal(out.refreshToken, undefined, 'the refresh token is a cookie for browsers');
    assert.match(cookieOf(done, 'pact_rt') ?? '', /HttpOnly/i);
    assert.match(cookieOf(done, 'pact_su') ?? '', /Max-Age=0|Expires=Thu, 01 Jan 1970/i, 'signup cookie cleared');
  });

  it('refuses a missing, expired or reused continuation', async () => {
    const none = await post('/auth/signup', profile);
    assert.equal(none.statusCode, 400);
    assert.equal(JSON.parse(none.body).error.code, 'signup_expired');

    const expired = await new SignJWT({ phone: '+2348030000001', purpose: 'signup' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .setIssuer('pact-api')
      .setAudience('pact-signup')
      .sign(new TextEncoder().encode(t.ctx.config.JWT_SECRET));
    const old = await post('/auth/signup', profile, { ...web, cookie: `pact_su=${expired}` });
    assert.equal(JSON.parse(old.body).error.code, 'signup_expired');
    assert.match(cookieOf(old, 'pact_su') ?? '', /Max-Age=0|Expires=Thu, 01 Jan 1970/i, 'a dead continuation is cleared');

    const res = await verify(phone());
    const cookie = cookieOf(res, 'pact_su')!.split(';')[0];
    assert.equal((await post('/auth/signup', profile, { ...web, cookie })).statusCode, 200);
    const again = await post('/auth/signup', profile, { ...web, cookie });
    assert.equal(again.statusCode, 400, 'the number already has an account');
    assert.equal(JSON.parse(again.body).error.code, 'already_registered');
  });

  it('refuses a request that comes from another site, before reading the cookie', async () => {
    const res = await verify(phone());
    const cookie = cookieOf(res, 'pact_su')!.split(';')[0];
    const evil = await post('/auth/signup', profile, { ...web, origin: 'https://evil.example', cookie });
    assert.equal(evil.statusCode, 401);
    // And the legitimate continuation still works afterwards: nothing was consumed.
    assert.equal((await post('/auth/signup', profile, { ...web, cookie })).statusCode, 200);
  });

  it('a request that is not from the web client cannot use the cookie route', async () => {
    const res = await verify(phone());
    const cookie = cookieOf(res, 'pact_su')!.split(';')[0];
    const native = await post('/auth/signup', profile, { 'content-type': 'application/json', cookie });
    assert.equal(JSON.parse(native.body).error.code, 'signup_expired');
  });

  it('native clients keep the explicit token', async () => {
    const native = { 'content-type': 'application/json' };
    const res = await verify(phone(), native as never);
    const body = JSON.parse(res.body);
    assert.ok(body.signupToken && body.signupToken.length > 20, 'the token is in the body for native apps');
    assert.equal(cookieOf(res, 'pact_su'), undefined);
    const done = await post('/auth/signup', { ...profile, signupToken: body.signupToken }, native as never);
    assert.equal(done.statusCode, 200);
    assert.ok(JSON.parse(done.body).refreshToken, 'native gets the refresh token in the body');
  });
});
