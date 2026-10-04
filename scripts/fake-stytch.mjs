// A local stand-in for the two Stytch endpoints PACT uses, for browser tests. NOT Stytch: it proves only PACT's side of the integration.
// POST /v1/otps/email/login_or_create, POST /v1/otps/authenticate (Basic auth checked), and GET /__code?email= for the test to read the code.
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 8793);
const PROJECT = process.env.STYTCH_PROJECT_ID ?? 'project-test-e2e';
const SECRET = process.env.STYTCH_SECRET ?? 'secret-test-e2e';
const sends = [];
const spent = new Set();
const userFor = (email) => `user-test-${Buffer.from(email).toString('hex').slice(0, 24)}`;
const read = (req) => new Promise((res) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => res(s)); });

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (status, o) => (res.writeHead(status, { 'content-type': 'application/json' }), res.end(JSON.stringify(o)));
  if (url.pathname === '/__code') {
    const s = [...sends].reverse().find((x) => x.email === url.searchParams.get('email'));
    return send(s ? 200 : 404, { code: s?.code ?? null });
  }
  if (req.headers.authorization !== `Basic ${Buffer.from(`${PROJECT}:${SECRET}`).toString('base64')}`) return send(401, { error_type: 'unauthorized_credentials' });
  const body = JSON.parse((await read(req)) || '{}');
  if (url.pathname === '/v1/otps/email/login_or_create') {
    const n = sends.length + 1;
    const s = { email: body.email, methodId: `email-test-${n}`, code: String(400000 + n) };
    sends.push(s);
    return send(200, { email_id: s.methodId, user_id: userFor(body.email), user_created: true, status_code: 200 });
  }
  if (url.pathname === '/v1/otps/authenticate') {
    const s = sends.find((x) => x.methodId === body.method_id);
    if (!s || spent.has(s.methodId) || s.code !== body.code) return send(400, { error_type: 'otp_code_not_found', status_code: 400 });
    spent.add(s.methodId);
    return send(200, { user_id: userFor(s.email), status_code: 200 });
  }
  send(404, { error_type: 'not_found' });
}).listen(port, '127.0.0.1', () => console.log(`fake stytch on ${port}`));
