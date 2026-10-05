/**
 * Web Push, for real where it can be: the server's record of a browser's subscription (the status the client reconciles against), and an
 * actual VAPID-signed, encrypted push sent by the production sender to a local stand-in for a push service, then checked and decrypted the
 * way a browser would. What cannot be proved here is a vendor's push service (FCM, Mozilla, Apple) accepting it: see the report.
 */
import assert from 'node:assert/strict';
import { createECDH, createPublicKey, createDecipheriv, hkdfSync, randomBytes, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer as createHttps } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import webpush from 'web-push';
import { loadConfig } from '../src/config.js';
import { createPushSender, sendPush, type PushSender, type PushTarget } from '../src/modules/push.js';
import { setup } from './helpers.js';

type T = Awaited<ReturnType<typeof setup>>;
const sub = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/status-${n}-aaaaaaaaaaaaaaaaaaaa`, keys: { p256dh: 'p'.repeat(40) + n, auth: 'a'.repeat(16) + n } });

describe('push subscription status (what the browser reconciles against)', () => {
  let t: T;
  let fail: number | null = null;
  const sender: PushSender = {
    async send(_t: PushTarget) {
      if (fail) throw Object.assign(new Error('push service'), { statusCode: fail });
    },
  };
  const status = async (token: string | undefined, endpoint: string) => t.call('POST', '/push/status', token, { endpoint });
  let a: Awaited<ReturnType<T['signIn']>>;
  let b: Awaited<ReturnType<T['signIn']>>;

  before(async () => {
    const keys = webpush.generateVAPIDKeys();
    t = await setup({ env: { WEB_PUSH_VAPID_PUBLIC_KEY: keys.publicKey, WEB_PUSH_VAPID_PRIVATE_KEY: keys.privateKey, WEB_PUSH_SUBJECT: 'mailto:ops@pact.test' }, push: sender });
    a = await t.signIn('08010000011');
    b = await t.signIn('08010000012');
  });
  after(async () => t.close());

  it('needs a session', async () => {
    assert.equal((await status(undefined, sub(1).endpoint)).status, 401);
  });

  it('none before subscribing, active after, none after turning it off', async () => {
    assert.equal((await status(a.accessToken, sub(1).endpoint)).body.status, 'none');
    assert.equal((await t.call('POST', '/push/subscribe', a.accessToken, sub(1))).status, 200);
    assert.equal((await status(a.accessToken, sub(1).endpoint)).body.status, 'active');
    await t.call('POST', '/push/unsubscribe', a.accessToken, { endpoint: sub(1).endpoint });
    assert.equal((await status(a.accessToken, sub(1).endpoint)).body.status, 'none');
  });

  it('answers only for the caller: someone else’s subscription is "none", and says nothing about whose it is', async () => {
    await t.call('POST', '/push/subscribe', a.accessToken, sub(2));
    assert.equal((await status(b.accessToken, sub(2).endpoint)).body.status, 'none');
    assert.equal((await status(a.accessToken, sub(2).endpoint)).body.status, 'active');
  });

  it('a push service answering 410 Gone makes it "disabled"; subscribing again with a new one is "active"', async () => {
    fail = 410;
    await sendPush(t.ctx, [a.user.id], { body: 'hello', url: '/app/home' });
    fail = null;
    assert.equal((await status(a.accessToken, sub(2).endpoint)).body.status, 'disabled');
    assert.equal((await t.call('POST', '/push/subscribe', a.accessToken, sub(3))).status, 200);
    assert.equal((await status(a.accessToken, sub(3).endpoint)).body.status, 'active');
    // The same browser re-saving a disabled endpoint brings it back.
    assert.equal((await t.call('POST', '/push/subscribe', a.accessToken, sub(2))).status, 200);
    assert.equal((await status(a.accessToken, sub(2).endpoint)).body.status, 'active');
  });

  it('a browser that signs in as someone else takes the subscription over, and the first person no longer has it', async () => {
    await t.call('POST', '/push/subscribe', b.accessToken, sub(2));
    assert.equal((await status(b.accessToken, sub(2).endpoint)).body.status, 'active');
    assert.equal((await status(a.accessToken, sub(2).endpoint)).body.status, 'none');
  });

  it('there is still no way to list subscriptions', async () => {
    assert.equal((await t.call('GET', '/push/status', a.accessToken)).status, 404);
    assert.equal((await t.call('GET', '/push/subscriptions', a.accessToken)).status, 404);
  });
});

/** RFC 8291 (aes128gcm) decryption with the subscriber's private key: what a browser does with the body it is handed. */
function decrypt(body: Buffer, subscriber: ReturnType<typeof createECDH>, auth: Buffer) {
  const salt = body.subarray(0, 16);
  const idLen = body[20];
  const senderPub = body.subarray(21, 21 + idLen);
  const cipher = body.subarray(21 + idLen);
  const secret = subscriber.computeSecret(senderPub);
  const uaPub = subscriber.getPublicKey();
  const prk = Buffer.from(hkdfSync('sha256', secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, senderPub]), 32));
  const cek = Buffer.from(hkdfSync('sha256', prk, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', prk, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
  return plain.subarray(0, plain.lastIndexOf(0x02)).toString('utf8');
}

describe('web push delivery by the production sender', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pact-push-'));
  const vapid = webpush.generateVAPIDKeys();
  const received: { headers: Record<string, string | string[] | undefined>; body: Buffer; method?: string; url?: string }[] = [];
  let server: ReturnType<typeof createHttps>;
  let origin = '';
  let respond = 201;
  const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;

  before(async () => {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=127.0.0.1'], { stdio: 'ignore' });
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // the stand-in push service has a throwaway certificate
    server = createHttps({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) }, (req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        received.push({ headers: req.headers, body: Buffer.concat(chunks), method: req.method, url: req.url });
        res.writeHead(respond);
        res.end();
      });
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    const addr = server.address() as { port: number };
    origin = `https://127.0.0.1:${addr.port}`;
  });
  after(() => {
    server.close();
    if (prevTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
  });

  it('sends a VAPID-signed, encrypted push that a browser holding the subscription keys can read', async () => {
    const config = loadConfig({ NODE_ENV: 'test', WEB_PUSH_VAPID_PUBLIC_KEY: vapid.publicKey, WEB_PUSH_VAPID_PRIVATE_KEY: vapid.privateKey, WEB_PUSH_SUBJECT: 'mailto:ops@pact.test' });
    const sender = createPushSender(config)!;
    assert.ok(sender, 'push is configured from the three VAPID settings');
    const browser = createECDH('prime256v1');
    browser.generateKeys();
    const auth = randomBytes(16);
    const endpoint = `${origin}/push/device-1`;
    const payload = JSON.stringify({ title: 'PACT', body: 'Sarah is in for Friday.', url: '/app/home' });
    await sender.send({ endpoint, p256dh: browser.getPublicKey().toString('base64url'), auth: auth.toString('base64url') }, payload);

    const r = received.at(-1)!;
    assert.equal(r.method, 'POST');
    assert.equal(r.url, '/push/device-1');
    assert.equal(r.headers['content-encoding'], 'aes128gcm');
    assert.ok(Number(r.headers.ttl) > 0);

    // The VAPID header: a JWT signed (ES256) by our private key, for this push service, that anyone with the public key can verify.
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(String(r.headers.authorization));
    assert.ok(m, `authorization: ${r.headers.authorization}`);
    assert.equal(m![2], vapid.publicKey, 'the key in the header is the one the browser subscribed with');
    const [h, p, sig] = m![1].split('.');
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    assert.equal(claims.aud, origin);
    assert.equal(claims.sub, 'mailto:ops@pact.test');
    assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600);
    const pub = Buffer.from(vapid.publicKey, 'base64url');
    const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
    assert.ok(verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')), 'signature verifies with the public key');

    assert.equal(decrypt(r.body, browser, auth), payload, 'the payload arrives intact');
  });

  it('a push service answering 410 surfaces as a status the sender’s caller can act on (the subscription gets disabled)', async () => {
    respond = 410;
    const config = loadConfig({ NODE_ENV: 'test', WEB_PUSH_VAPID_PUBLIC_KEY: vapid.publicKey, WEB_PUSH_VAPID_PRIVATE_KEY: vapid.privateKey, WEB_PUSH_SUBJECT: 'mailto:ops@pact.test' });
    const browser = createECDH('prime256v1');
    browser.generateKeys();
    await assert.rejects(
      () => createPushSender(config)!.send({ endpoint: `${origin}/push/gone`, p256dh: browser.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') }, '{}'),
      (e: { statusCode?: number }) => e.statusCode === 410,
    );
    respond = 201;
  });

  it('a malformed VAPID key makes the send fail rather than silently succeed', () => {
    const bad = loadConfig({ NODE_ENV: 'test', WEB_PUSH_VAPID_PUBLIC_KEY: 'not-a-key', WEB_PUSH_VAPID_PRIVATE_KEY: 'nope', WEB_PUSH_SUBJECT: 'mailto:ops@pact.test' });
    return assert.rejects(() => createPushSender(bad)!.send({ endpoint: `${origin}/push/x`, p256dh: 'x'.repeat(87), auth: 'y'.repeat(22) }, '{}'));
  });
});
