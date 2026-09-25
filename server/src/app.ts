import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z, ZodError } from 'zod';
import * as C from '../../shared/contracts.js';
import type { AuthTokensDTO } from '../../shared/contracts.js';
import type { Config } from './config.js';
import type { Ctx, ReqMeta } from './context.js';
import type { Db } from './db/index.js';
import { AppError, badRequest, conflict, notFound, unauthorized } from './lib/errors.js';
import * as auth from './modules/auth.js';
import { reconcile } from './modules/ledger.js';
import * as pacts from './modules/pacts.js';
import * as users from './modules/users.js';
import * as wallet from './modules/wallet.js';
import { handleWebhook } from './modules/webhooks.js';
import { createPaystackProvider } from './payments/paystack.js';
import type { PaymentProvider } from './payments/provider.js';
import { createSandboxProvider } from './payments/sandbox.js';
import { createSms, type SmsSender } from './payments/sms.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    sessionId: string;
  }
}

const REFRESH_COOKIE = 'pact_rt';

export interface BuildOptions {
  config: Config;
  db: Db;
  provider?: PaymentProvider;
  sms?: SmsSender;
  now?: () => Date;
}

export async function buildApp({ config, db, provider, sms, now = () => new Date() }: BuildOptions) {
  const app = Fastify({
    logger: config.isTest
      ? false
      : {
          level: config.LOG_LEVEL,
          // Never log credentials, codes, PINs or account numbers.
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', '*.pin', '*.currentPin', '*.newPin', '*.accountNumber', '*.bvn', '*.refreshToken', '*.signupToken'],
            censor: '[redacted]',
          },
          transport: config.isProd ? undefined : { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } },
        },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 64 * 1024,
    genReqId: (req) => (typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id'].length < 80 ? req.headers['x-request-id'] : randomUUID()),
  });

  const ctx: Ctx = {
    config,
    db,
    provider: provider ?? (config.PAYMENTS_PROVIDER === 'paystack' ? createPaystackProvider(config) : createSandboxProvider(config)),
    sms: sms ?? createSms(config, app.log),
    log: app.log,
    now,
  };
  app.decorate('ctx', ctx);

  /* ---------------------------------------------------------------- security */

  await app.register(helmet, {
    contentSecurityPolicy: config.SERVE_STATIC
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            frameAncestors: ["'none'"],
            formAction: ["'self'", 'https://checkout.paystack.com'],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
    hsts: config.isProd ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
  });

  const origins = new Set([config.APP_ORIGIN, ...config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)]);
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || origins.has(origin)),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Pact-Client', 'X-Request-Id'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    maxAge: 600,
  });
  await app.register(cookie, { secret: config.HASH_SECRET });
  // In-memory limits per instance; point this at Redis when running more than one API instance.
  await app.register(rateLimit, {
    global: config.RATE_LIMIT_ENABLED,
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: { code: 'rate_limited', message: `Too many requests. Try again in ${Math.ceil(context.ttl / 1000)} seconds.` },
    }),
  });

  app.setErrorHandler((err: Error & { statusCode?: number; validation?: unknown }, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details }, requestId: req.id });
    }
    if (err instanceof ZodError) {
      const fields = Object.fromEntries(err.issues.map((i) => [i.path.join('.') || '_', i.message]));
      return reply.status(400).send({ error: { code: 'invalid_request', message: Object.values(fields)[0] ?? 'Check the details and try again.', details: { fields } }, requestId: req.id });
    }
    if (err.statusCode === 429) return reply.status(429).send({ ...(err as unknown as object), requestId: req.id });
    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: { code: 'bad_request', message: 'The request couldn’t be processed.' }, requestId: req.id });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({ error: { code: 'internal', message: 'Something went wrong on our side. Nothing was charged. Try again.' }, requestId: req.id });
  });

  /* ---------------------------------------------------------------- helpers */

  const meta = (req: FastifyRequest): ReqMeta => ({ ip: req.ip ?? null, userAgent: (req.headers['user-agent'] as string) ?? null });
  const parse = <T extends z.ZodType>(schema: T, data: unknown): z.infer<T> => schema.parse(data ?? {});
  const isWeb = (req: FastifyRequest) => req.headers['x-pact-client'] === 'web';

  const requireAuth = async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    const { userId, sessionId } = await auth.authenticate(ctx, header.slice(7));
    req.userId = userId;
    req.sessionId = sessionId;
  };

  /** Browsers keep the refresh token in an httpOnly cookie; native apps keep it in secure storage. */
  const sendTokens = (req: FastifyRequest, reply: FastifyReply, tokens: AuthTokensDTO, extra: Record<string, unknown> = {}) => {
    if (isWeb(req) && tokens.refreshToken) {
      reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
        httpOnly: true,
        secure: config.isProd,
        sameSite: 'strict',
        path: '/api/auth',
        maxAge: config.REFRESH_TOKEN_TTL_DAYS * 86_400,
      });
      const { refreshToken: _omit, ...rest } = tokens;
      return { ...extra, ...rest };
    }
    return { ...extra, ...tokens };
  };

  /**
   * Idempotency-Key for every request that moves money. A retry with the same key
   * replays the first response instead of charging twice. The PIN is excluded from
   * the fingerprint so a corrected PIN can reuse the key after a failure.
   */
  const idempotent = async <T>(req: FastifyRequest, reply: FastifyReply, route: string, fn: () => Promise<T>) => {
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 8 || key.length > 100) throw badRequest('idempotency_key_required', 'Missing Idempotency-Key header.');
    const { pin: _pin, ...fingerprint } = (req.body ?? {}) as Record<string, unknown>;
    const hash = createHash('sha256').update(`${route}:${JSON.stringify(fingerprint, Object.keys(fingerprint).sort())}`).digest('base64url');
    const ins = await db.query(
      'INSERT INTO idempotency_keys (user_id, key, route, request_hash) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING key',
      [req.userId, key, route, hash],
    );
    if (!ins.rowCount) {
      const prior = await db.query<{ route: string; request_hash: string; status_code: number | null; response: unknown }>(
        'SELECT route, request_hash, status_code, response FROM idempotency_keys WHERE user_id = $1 AND key = $2',
        [req.userId, key],
      );
      const p = prior.rows[0];
      if (!p || p.route !== route || p.request_hash !== hash) throw new AppError(422, 'idempotency_mismatch', 'This request key was already used for a different request.');
      if (p.status_code === null) throw conflict('request_in_progress', 'This request is already being processed.');
      reply.header('Idempotent-Replayed', 'true');
      return reply.status(p.status_code).send(p.response);
    }
    try {
      const out = await fn();
      await db.query('UPDATE idempotency_keys SET status_code = $3, response = $4 WHERE user_id = $1 AND key = $2', [req.userId, key, 200, JSON.stringify(out)]);
      return out;
    } catch (err) {
      await db.query('DELETE FROM idempotency_keys WHERE user_id = $1 AND key = $2', [req.userId, key]);
      throw err;
    }
  };

  const strict = (max: number, minutes = 1) =>
    config.RATE_LIMIT_ENABLED ? { config: { rateLimit: { max, timeWindow: `${minutes} minute` } } } : {};

  /* ---------------------------------------------------------------- routes */

  await app.register(
    async (api: FastifyInstance) => {
      api.get('/health', async () => {
        await db.query('SELECT 1');
        return { ok: true };
      });

      api.get('/config', async () => ({
        provider: ctx.provider.name,
        sandbox: ctx.provider.name === 'sandbox',
        exposeDevCodes: config.exposeDevCodes,
      }));

      /* ---------- auth */
      api.post('/auth/otp/request', strict(5), async (req) => {
        const body = parse(C.OtpRequestBody, req.body);
        return auth.requestOtp(ctx, body.phone, meta(req));
      });

      api.post('/auth/otp/verify', strict(10), async (req, reply) => {
        const body = parse(C.OtpVerifyBody, req.body);
        const out = await auth.verifyOtp(ctx, body.phone, body.code, body.device, meta(req));
        if (out.status === 'signed_in') {
          const { status, ...tokens } = out;
          return sendTokens(req, reply, tokens, { status });
        }
        return out;
      });

      api.post('/auth/signup', strict(5), async (req, reply) => {
        const body = parse(C.SignupBody, req.body);
        const tokens = await auth.signup(ctx, body, meta(req));
        return sendTokens(req, reply, tokens);
      });

      api.post('/auth/refresh', strict(30), async (req, reply) => {
        const body = parse(C.RefreshBody, req.body);
        // Cookie refresh requires the custom header: a cross-site form can't send it.
        const token = body.refreshToken ?? (isWeb(req) ? req.cookies[REFRESH_COOKIE] : undefined);
        if (!token) throw unauthorized('Sign in to continue.');
        try {
          return sendTokens(req, reply, await auth.refresh(ctx, token, meta(req)));
        } catch (err) {
          reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
          throw err;
        }
      });

      api.post('/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
        await auth.revokeSession(ctx, req.userId, req.sessionId);
        reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
        return { ok: true };
      });

      /* ---------- invite previews (public, so a shared link can show what it's for) */
      api.get<{ Params: { code: string } }>('/invites/:code', strict(60), async (req) => {
        if (!/^[A-Za-z0-9]{6,12}$/.test(req.params.code)) throw notFound('Invite');
        const { id: _id, ...preview } = await pacts.preview(ctx, req.params.code);
        return preview;
      });

      /* ---------- webhooks: raw body for signature verification */
      await api.register(async (hooks) => {
        hooks.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => done(null, body));
        hooks.post<{ Params: { provider: string } }>('/webhooks/:provider', strict(600), async (req, reply) => {
          if (req.params.provider !== ctx.provider.name) return reply.status(404).send({ ok: false });
          const out = await handleWebhook(ctx, String(req.body ?? ''), req.headers);
          return reply.status(out.status).send(out.body);
        });
      });

      /* ---------- everything below requires a session */
      await api.register(async (priv) => {
        priv.addHook('preHandler', requireAuth);

        priv.get('/me', async (req) => users.me(ctx, req.userId));
        priv.patch('/me', async (req) => users.updateProfile(ctx, req.userId, parse(C.UpdateProfileBody, req.body)));
        priv.post('/me/kyc/bvn', strict(5, 10), async (req) => {
          const body = parse(C.VerifyBvnBody, req.body);
          return users.verifyBvn(ctx, req.userId, body.bvn, body.dateOfBirth, meta(req));
        });
        priv.post('/me/pin', strict(5), async (req) => {
          const body = parse(C.ChangePinBody, req.body);
          await auth.changePin(ctx, req.userId, body.currentPin, body.newPin, meta(req));
          return { ok: true };
        });
        priv.get('/me/sessions', async (req) => users.listSessions(ctx, req.userId, req.sessionId));
        priv.delete<{ Params: { id: string } }>('/me/sessions/:id', async (req) => {
          await auth.revokeSession(ctx, req.userId, z.string().uuid().parse(req.params.id));
          return { ok: true };
        });
        priv.post('/me/sessions/revoke-others', async (req) => {
          await auth.revokeAllSessions(ctx, req.userId, req.sessionId);
          return { ok: true };
        });

        /* ---------- wallet */
        priv.get('/wallet', async (req) => wallet.getWallet(ctx, req.userId));
        priv.get<{ Querystring: { cursor?: string } }>('/wallet/transactions', async (req) => wallet.listTransactions(ctx, req.userId, req.query.cursor));
        priv.post('/wallet/topups', strict(10), async (req, reply) =>
          idempotent(req, reply, 'topup', () => {
            const body = parse(C.TopupBody, req.body);
            return wallet.initTopup(ctx, req.userId, body.amount, body.channel, meta(req));
          }),
        );
        priv.get<{ Params: { ref: string } }>('/wallet/topups/:ref', async (req) => wallet.getTopup(ctx, req.userId, req.params.ref));
        priv.post('/wallet/withdrawals', strict(5), async (req, reply) =>
          idempotent(req, reply, 'withdraw', () => wallet.withdraw(ctx, req.userId, parse(C.WithdrawBody, req.body), meta(req))),
        );
        priv.get<{ Params: { ref: string } }>('/wallet/withdrawals/:ref', async (req) => wallet.getWithdrawal(ctx, req.userId, req.params.ref));

        priv.get('/banks', async () => wallet.listBanks(ctx));
        priv.get('/bank-accounts', async (req) => wallet.listBankAccounts(ctx, req.userId));
        priv.post('/bank-accounts/resolve', strict(10), async (req) => {
          const body = parse(C.ResolveBankBody, req.body);
          return wallet.resolveBankAccount(ctx, req.userId, body.bankCode, body.accountNumber);
        });
        priv.post('/bank-accounts', strict(5), async (req) => wallet.addBankAccount(ctx, req.userId, parse(C.AddBankBody, req.body), meta(req)));
        priv.delete<{ Params: { id: string } }>('/bank-accounts/:id', async (req) => {
          await wallet.removeBankAccount(ctx, req.userId, z.string().uuid().parse(req.params.id), meta(req));
          return { ok: true };
        });

        /* ---------- pacts */
        priv.get('/pacts', async (req) => pacts.listPacts(ctx, req.userId));
        priv.post('/pacts', strict(10), async (req, reply) =>
          idempotent(req, reply, 'create_pact', () => pacts.createPact(ctx, req.userId, parse(C.CreatePactBody, req.body) as never, meta(req))),
        );
        priv.get<{ Params: { id: string } }>('/pacts/:id', async (req) => pacts.getPact(ctx, req.userId, req.params.id));
        priv.post<{ Params: { id: string } }>('/pacts/:id/contributions', strict(20), async (req, reply) =>
          idempotent(req, reply, `contribute:${req.params.id}`, () => {
            const body = parse(C.ContributeBody, req.body);
            return pacts.contribute(ctx, req.userId, req.params.id, body.amount, body.pin, meta(req));
          }),
        );
        priv.post<{ Params: { id: string } }>('/pacts/:id/invites', strict(20), async (req) => {
          const body = parse(C.InviteBody, req.body);
          return pacts.inviteMore(ctx, req.userId, req.params.id, body.userIds, body.phones);
        });
        priv.post<{ Params: { id: string } }>('/pacts/:id/accept', async (req) => pacts.acceptInvite(ctx, req.userId, req.params.id));
        priv.post<{ Params: { id: string } }>('/pacts/:id/leave', async (req) => {
          await pacts.leave(ctx, req.userId, req.params.id);
          return { ok: true };
        });
        priv.post<{ Params: { id: string } }>('/pacts/:id/release', strict(5), async (req, reply) =>
          idempotent(req, reply, `release:${req.params.id}`, () => pacts.release(ctx, req.userId, req.params.id, parse(C.PinBody, req.body).pin, meta(req))),
        );
        priv.post<{ Params: { id: string } }>('/pacts/:id/cancel', strict(5), async (req, reply) =>
          idempotent(req, reply, `cancel:${req.params.id}`, () => pacts.cancel(ctx, req.userId, req.params.id, parse(C.PinBody, req.body).pin, meta(req))),
        );
        priv.post<{ Params: { id: string } }>('/pacts/:id/nudge', strict(5), async (req) => pacts.nudge(ctx, req.userId, req.params.id));
        priv.post<{ Params: { code: string } }>('/invites/:code/join', strict(20), async (req) => pacts.joinByCode(ctx, req.userId, req.params.code));

        priv.get('/activity', async (req) => pacts.feed(ctx, req.userId));
        priv.get('/people/recent', async (req) => pacts.recentPeople(ctx, req.userId));

        priv.get<{ Querystring: { cursor?: string } }>('/notifications', async (req) => users.listNotifications(ctx, req.userId, req.query.cursor));
        priv.post('/notifications/read', async (req) => {
          const body = parse(z.object({ ids: z.array(z.string().uuid()).max(100).optional() }), req.body);
          await users.markNotificationsRead(ctx, req.userId, body.ids);
          return { ok: true };
        });

        /* ---------- sandbox checkout (development and demos only) */
        if (ctx.provider.name === 'sandbox') {
          const sandbox = ctx.provider as ReturnType<typeof createSandboxProvider>;
          priv.get<{ Params: { ref: string } }>('/sandbox/checkout/:ref', async (req) => {
            const t = await wallet.getTopup(ctx, req.userId, req.params.ref);
            const acct = `99${createHash('sha256').update(req.userId).digest('hex').replace(/\D/g, '').slice(0, 8).padEnd(8, '0')}`;
            return { ...t, total: t.amount + t.fee, transferAccount: { bankName: 'Sandbox Partner Bank', accountNumber: acct, accountName: 'PACT Collections' } };
          });
          priv.post<{ Params: { ref: string } }>('/sandbox/checkout/:ref/complete', async (req) => {
            const { outcome } = parse(z.object({ outcome: z.enum(['success', 'failed']) }), req.body);
            const t = await wallet.getTopup(ctx, req.userId, req.params.ref);
            if (t.status !== 'pending') return t;
            const body = JSON.stringify({
              event: outcome === 'success' ? 'charge.success' : 'charge.failed',
              data: { id: Date.now(), reference: t.reference, amount: t.amount + t.fee, gateway_response: outcome === 'success' ? 'Approved' : 'Declined by issuer' },
            });
            // Delivered through the public webhook route, signature and all.
            await app.inject({ method: 'POST', url: `/api/webhooks/sandbox`, headers: { 'content-type': 'application/json', 'x-paystack-signature': sandbox.sign(body) }, payload: body });
            return wallet.getTopup(ctx, req.userId, req.params.ref);
          });
        }
      });

      /* ---------- operations: ledger reconciliation, behind a separate token */
      api.get('/ops/reconcile', async (req, reply) => {
        const token = process.env.OPS_TOKEN;
        if (!token || req.headers.authorization !== `Bearer ${token}`) return reply.status(404).send();
        return reconcile(db);
      });
    },
    { prefix: '/api' },
  );

  /* ---------------------------------------------------------------- web app */

  const dist = resolve(process.cwd(), 'dist');
  if (config.SERVE_STATIC && existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist, wildcard: false, maxAge: '1h', immutable: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: { code: 'not_found', message: 'Not found.' } });
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    });
  }

  return { app, ctx };
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: Ctx;
  }
}
