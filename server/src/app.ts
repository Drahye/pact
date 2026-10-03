import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z, ZodError } from 'zod';
import * as C from '../../shared/contracts.js';
import type { AuthTokensDTO } from '../../shared/contracts.js';
import type { Config } from './config.js';
import type { Ctx, ReqMeta } from './context.js';
import type { Db } from './db/index.js';
import { askPreviewText, injectOg, planPreviewText, splitPreviewText, unavailablePreview } from './lib/og.js';
import { postgresRateLimitStore, rateLimitKey } from './lib/rateLimitStore.js';
import { AppError, badRequest, conflict, notFound, unauthorized } from './lib/errors.js';
import * as auth from './modules/auth.js';
import * as asks from './modules/asks.js';
import * as circles from './modules/circles.js';
import * as conversation from './modules/conversation.js';
import { reconcile } from './modules/ledger.js';
import * as pactMoney from './modules/pactMoney.js';
import * as pledges from './modules/pledges.js';
import * as orders from './modules/orders.js';
import * as pacts from './modules/pacts.js';
import * as plans from './modules/plans.js';
import * as splits from './modules/splits.js';
import * as home from './modules/home.js';
import * as pactPlan from './modules/pactPlan.js';
import * as users from './modules/users.js';
import * as wallet from './modules/wallet.js';
import { CLIENT_EVENTS, pactId as pactPseudo, track, visitorId } from './lib/events.js';
import { recordClientEvent } from './modules/events.js';
import { reqSerializer, sanitizeUrl } from './lib/logSafe.js';
import { handleWebhook } from './modules/webhooks.js';
import { createPaystackProvider } from './payments/paystack.js';
import type { PaymentProvider } from './payments/provider.js';
import { createSandboxProvider } from './payments/sandbox.js';
import { createSms, type SmsSender } from './payments/sms.js';
import { createPushSender, pushPublicConfig, removeSubscription, saveSubscription, type PushSender } from './modules/push.js';

/**
 * HTML revalidates on every visit, so a deploy reaches people immediately; Vite's content-hashed
 * files can be cached for a year because a new build gets new names.
 */
export function staticCacheControl(filePath: string): string {
  const path = filePath.replace(/\\/g, '/');
  if (path.endsWith('.html')) return 'no-cache, no-store, must-revalidate';
  if (/\/assets\/[^/]*-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i.test(path)) return 'public, max-age=31536000, immutable';
  // Metadata that changes with releases: always revalidate (ETag makes the check cheap).
  if (/\/(manifest\.webmanifest|favicon\.[a-z]+|sw\.js|robots\.txt)$/.test(path)) return 'no-cache';
  // Unhashed images and icons: reuse for an hour, then revalidate.
  return 'public, max-age=3600, must-revalidate';
}

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    sessionId: string;
  }
}

const REFRESH_COOKIE = 'pact_rt';
/** Web only: the short-lived credential between "code verified" and "account created". Never readable by page scripts. */
const SIGNUP_COOKIE = 'pact_su';
const SIGNUP_COOKIE_PATH = '/api/auth/signup';
const SIGNUP_WINDOW_SEC = 20 * 60;

export interface BuildOptions {
  config: Config;
  db: Db;
  provider?: PaymentProvider;
  sms?: SmsSender;
  push?: PushSender | null;
  now?: () => Date;
  /** Tests: capture log output. */
  logStream?: { write: (line: string) => void };
}

export async function buildApp({ config, db, provider, sms, push, now = () => new Date(), logStream }: BuildOptions) {
  const app = Fastify({
    logger: config.isTest && !logStream
      ? false
      : {
          level: config.LOG_LEVEL,
          // Never log credentials, codes, PINs or account numbers.
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', '*.pin', '*.currentPin', '*.newPin', '*.accountNumber', '*.bvn', '*.refreshToken', '*.signupToken'],
            censor: '[redacted]',
          },
          // Capability links carry a secret in the path; the request log never keeps it.
          serializers: { req: reqSerializer },
          ...(logStream ? { stream: logStream } : { transport: config.isProd ? undefined : { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } } }),
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
    push: push === undefined ? createPushSender(config) : push,
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

  // Production is HTTPS only. Behind a proxy, redirect anything that arrived over plain HTTP.
  if (config.isProd && config.TRUST_PROXY) {
    app.addHook('onRequest', async (req, reply) => {
      if (req.headers['x-forwarded-proto'] === 'http') return reply.redirect(`https://${req.headers.host}${req.url}`, 301);
    });
  }

  const origins = new Set([config.APP_ORIGIN, ...config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)]);
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || origins.has(origin)),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Pact-Client', 'X-Request-Id'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    maxAge: 600,
  });
  await app.register(cookie, { secret: config.HASH_SECRET });
  // Counters live in Postgres so every instance shares them (RATE_LIMIT_STORE=memory for one process).
  await app.register(rateLimit, {
    global: config.RATE_LIMIT_ENABLED,
    ...(config.RATE_LIMIT_STORE === 'postgres' ? { store: postgresRateLimitStore(db) } : {}),
    // A counter hiccup shouldn't take the API down; the sensitive limits (OTP, PIN, invites) are enforced separately.
    skipOnError: true,
    max: 300,
    timeWindow: '1 minute',
    // IPv6 counts per /64: one household or phone gets a whole block, so rotating
    // addresses inside it would otherwise skip the limit and flood the counters table.
    keyGenerator: (req) => rateLimitKey(req.ip),
    onExceeded: (req) => {
      req.log.warn({ route: req.routeOptions.url, ip: req.ip }, 'rate limit exceeded');
      void db
        .query(`INSERT INTO audit_log (action, target_type, target_id, ip) VALUES ('security.rate_limited', 'route', $1, $2)`, [req.routeOptions.url ?? sanitizeUrl(req.url), req.ip])
        .catch(() => undefined);
    },
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: { code: 'rate_limited', message: `Too many requests. Try again in ${Math.ceil(context.ttl / 1000)} seconds.` },
    }),
  });

  // Personal and financial data must never sit in a shared cache.
  app.addHook('onSend', async (req, reply) => {
    if (req.url.startsWith('/api/') && !reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'no-store');
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
    return reply.status(500).send({ error: { code: 'internal', message: 'Something went wrong on our side. Try again.' }, requestId: req.id });
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
        deployEnv: config.deployEnv,
        exposeDevCodes: config.exposeDevCodes,
        push: pushPublicConfig(config),
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
        // Browsers never see the signup credential: it rides in an httpOnly cookie that only /auth/signup can read.
        if (isWeb(req) && out.status === 'needs_profile' && out.signupToken) {
          reply.setCookie(SIGNUP_COOKIE, out.signupToken, { httpOnly: true, secure: config.isProd, sameSite: 'strict', path: SIGNUP_COOKIE_PATH, maxAge: SIGNUP_WINDOW_SEC });
          const { signupToken: _omit, ...rest } = out;
          return rest;
        }
        return out;
      });

      api.post('/auth/signup', strict(5), async (req, reply) => {
        const body = parse(C.SignupBody, req.body);
        let signupToken = body.signupToken;
        if (!signupToken && isWeb(req)) {
          // Same origin check as the refresh cookie: a request from another site is refused before anything is read.
          const origin = req.headers.origin;
          if (origin && !origins.has(origin)) throw unauthorized('Sign in to continue.');
          signupToken = req.cookies[SIGNUP_COOKIE];
        }
        if (!signupToken) throw badRequest('signup_expired', 'Your verification expired. Start again with your phone number.');
        try {
          const tokens = await auth.signup(ctx, { ...body, signupToken }, meta(req));
          reply.clearCookie(SIGNUP_COOKIE, { path: SIGNUP_COOKIE_PATH });
          return sendTokens(req, reply, tokens);
        } catch (err) {
          // An expired or spent continuation is gone either way.
          if (err instanceof AppError && ['signup_expired', 'already_registered'].includes(err.code)) reply.clearCookie(SIGNUP_COOKIE, { path: SIGNUP_COOKIE_PATH });
          throw err;
        }
      });

      api.post('/auth/refresh', strict(30), async (req, reply) => {
        const body = parse(C.RefreshBody, req.body);
        // Cookie refresh requires the custom header: a cross-site form can't send it.
        // Cookie-based refresh also checks where the request came from (CSRF defence in depth,
        // on top of SameSite=Strict and the custom header).
        const origin = req.headers.origin;
        if (!body.refreshToken && origin && !origins.has(origin)) throw unauthorized('Sign in to continue.');
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
        const { id, ...preview } = await pacts.preview(ctx, req.params.code);
        // One event per visitor per Pact per day. The visitor is a daily pseudonym; the address and browser are never stored.
        const m = meta(req);
        await track(ctx.db, config, 'invite_previewed', {
          pactId: id,
          actor: visitorId(config, m.ip, m.userAgent, ctx.now().toISOString().slice(0, 10)),
          key: `v:${visitorId(config, m.ip, m.userAgent, ctx.now().toISOString().slice(0, 10))}:${pactPseudo(config, id)}`,
          props: { status: preview.status === 'open' ? 'open' : preview.status === 'funded' ? 'funded' : 'closed', has_pay_account: !!preview.bankAccount },
        });
        return preview;
      });

      /* ---------- Circle invite previews (public: a shared link shows what it is for before anyone signs in) */
      api.get<{ Params: { token: string } }>('/circle-invites/:token', strict(60), async (req) => circles.previewInvite(ctx, req.params.token, meta(req)));

      /* ---------- Ask share links (public: the question is visible before anyone signs in) */
      api.get<{ Params: { token: string }; Querystring: { auth?: string } }>('/ask-links/:token', strict(120), async (req) => asks.previewLink(ctx, req.params.token, meta(req), req.query.auth === '1' ? 'signed_in' : 'signed_out'));
      api.post<{ Params: { token: string } }>('/ask-links/:token/started', strict(60), async (req) => {
        const b = parse(z.object({ signedIn: z.boolean().optional() }), req.body ?? {});
        return asks.markStarted(ctx, req.params.token, meta(req), b.signedIn ? 'signed_in' : 'signed_out');
      });
      api.post<{ Params: { token: string } }>('/ask-links/:token/step', strict(60), async (req) => {
        const b = parse(z.object({ step: z.enum(['auth_started', 'join_prompt']), signedIn: z.boolean().optional() }), req.body);
        return asks.recordLinkStep(ctx, req.params.token, b.step, meta(req), b.signedIn ? 'signed_in' : 'signed_out');
      });

      /* ---------- Plan share links (public: the plan is visible before anyone signs in) */
      api.get<{ Params: { token: string } }>('/plan-links/:token', strict(120), async (req) => plans.previewLink(ctx, req.params.token, meta(req)));

      /* ---------- Split share links (public: a safe summary is visible before anyone signs in) */
      api.get<{ Params: { token: string } }>('/split-links/:token', strict(120), async (req) => splits.previewLink(ctx, req.params.token, meta(req)));

      /* ---------- Recap share links (public: a safe, celebratory summary) */
      api.get<{ Params: { token: string } }>('/recap-links/:token', strict(120), async (req) => home.previewShared(ctx, req.params.token, meta(req)));

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
          await auth.changePin(ctx, req.userId, req.sessionId, body.currentPin, body.newPin, meta(req));
          return { ok: true };
        });
        priv.post('/me/pin/reset/request', strict(3, 15), async (req) => auth.requestPinReset(ctx, req.userId, meta(req)));
        priv.post('/me/pin/reset', strict(5, 15), async (req) => {
          const body = parse(C.PinResetBody, req.body);
          await auth.resetPin(ctx, req.userId, req.sessionId, body.code, body.newPin, meta(req));
          return { ok: true };
        });
        priv.get('/me/export', strict(3, 60), async (req, reply) => {
          reply.header('Content-Disposition', 'attachment; filename="pact-my-data.json"');
          reply.header('Cache-Control', 'no-store');
          return users.exportData(ctx, req.userId);
        });
        priv.post('/me/close', strict(3, 60), async (req, reply) => {
          await auth.verifyPin(ctx, req.userId, parse(C.PinBody, req.body).pin, meta(req));
          await users.closeAccount(ctx, req.userId, meta(req));
          reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
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
            return wallet.initTopup(ctx, req.userId, body.amount, body.channel, meta(req), body.pactId);
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
        priv.post<{ Params: { id: string } }>('/pacts/:id/accept', async (req) =>
          pacts.acceptInvite(ctx, req.userId, req.params.id, parse(C.ParticipationBody.partial(), req.body).participation ?? null),
        );
        priv.patch<{ Params: { id: string } }>('/pacts/:id/participation', strict(20), async (req) =>
          pactPlan.setParticipation(ctx, req.userId, req.params.id, parse(C.ParticipationBody, req.body).participation),
        );
        priv.post<{ Params: { id: string } }>('/pacts/:id/split-rest', strict(5), async (req) => pactPlan.splitRest(ctx, req.userId, req.params.id));

        /* ---------- the plan: budget, tasks, memory */
        priv.post<{ Params: { id: string } }>('/pacts/:id/budget', strict(30), async (req) => pactPlan.addBudgetItem(ctx, req.userId, req.params.id, parse(C.BudgetItemBody, req.body)));
        priv.patch<{ Params: { id: string; itemId: string } }>('/pacts/:id/budget/:itemId', strict(30), async (req) =>
          pactPlan.updateBudgetItem(ctx, req.userId, req.params.id, req.params.itemId, parse(C.BudgetItemPatchBody, req.body)),
        );
        priv.delete<{ Params: { id: string; itemId: string } }>('/pacts/:id/budget/:itemId', strict(30), async (req) =>
          pactPlan.removeBudgetItem(ctx, req.userId, req.params.id, req.params.itemId),
        );
        priv.post<{ Params: { id: string } }>('/pacts/:id/tasks', strict(30), async (req) => pactPlan.createTask(ctx, req.userId, req.params.id, parse(C.TaskCreateBody, req.body)));
        priv.patch<{ Params: { id: string; taskId: string } }>('/pacts/:id/tasks/:taskId', strict(60), async (req) =>
          pactPlan.updateTask(ctx, req.userId, req.params.id, req.params.taskId, parse(C.TaskPatchBody, req.body)),
        );
        priv.delete<{ Params: { id: string; taskId: string } }>('/pacts/:id/tasks/:taskId', strict(30), async (req) =>
          pactPlan.deleteTask(ctx, req.userId, req.params.id, req.params.taskId),
        );
        priv.put<{ Params: { id: string } }>('/pacts/:id/memory', strict(20), async (req) => pactPlan.saveMemory(ctx, req.userId, req.params.id, parse(C.MemoryBody, req.body)));
        priv.get<{ Params: { id: string; photoId: string } }>('/pacts/:id/memory/photos/:photoId', async (req, reply) => {
          const photo = await pactPlan.getPhoto(ctx, req.userId, req.params.id, req.params.photoId);
          return reply
            .header('Content-Type', photo.mime)
            .header('Cache-Control', 'private, max-age=3600')
            .header('Content-Disposition', 'inline')
            .header('X-Content-Type-Options', 'nosniff')
            .send(photo.data);
        });
        priv.delete<{ Params: { id: string; photoId: string } }>('/pacts/:id/memory/photos/:photoId', strict(20), async (req) =>
          pactPlan.deletePhoto(ctx, req.userId, req.params.id, req.params.photoId),
        );
        // Photo uploads: raw image bytes, only three image types, 8 MB before re-encoding.
        await priv.register(async (uploads) => {
          uploads.addContentTypeParser(['image/jpeg', 'image/png', 'image/webp'], { parseAs: 'buffer', bodyLimit: 8 * 1024 * 1024 }, (_req, body, done) => done(null, body));
          uploads.post<{ Params: { id: string } }>('/pacts/:id/memory/photos', { bodyLimit: 8 * 1024 * 1024, ...strict(12, 10) }, async (req) =>
            pactPlan.addPhoto(ctx, req.userId, req.params.id, req.body as Buffer),
          );
          uploads.post<{ Params: { id: string; payoutId: string } }>('/pacts/:id/payouts/:payoutId/receipt', { bodyLimit: 8 * 1024 * 1024, ...strict(12, 10) }, async (req) =>
            pactMoney.addReceipt(ctx, req.userId, req.params.id, req.params.payoutId, req.body as Buffer),
          );
        });
        priv.post<{ Params: { id: string } }>('/pacts/:id/leave', async (req) => {
          await pacts.leave(ctx, req.userId, req.params.id);
          return { ok: true };
        });
        /* ---------- conversation: comments, reactions, updates and the pin, all attached to activity */
        priv.get<{ Params: { id: string; aid: string } }>('/pacts/:id/activity/:aid', async (req) => conversation.getThread(ctx, req.userId, req.params.id, req.params.aid));
        priv.post<{ Params: { id: string; aid: string } }>('/pacts/:id/activity/:aid/comments', strict(30), async (req, reply) =>
          idempotent(req, reply, `comment:${req.params.id}:${req.params.aid}`, () => conversation.addComment(ctx, req.userId, req.params.id, req.params.aid, parse(C.CommentBody, req.body).body, meta(req))),
        );
        priv.delete<{ Params: { id: string; cid: string } }>('/pacts/:id/comments/:cid', strict(30), async (req) => conversation.deleteComment(ctx, req.userId, req.params.id, req.params.cid, meta(req)));
        priv.put<{ Params: { id: string; aid: string } }>('/pacts/:id/activity/:aid/reactions', strict(120), async (req) => {
          const body = parse(C.ReactBody, req.body);
          return conversation.react(ctx, req.userId, req.params.id, req.params.aid, body.reaction, body.on);
        });
        priv.post<{ Params: { id: string } }>('/pacts/:id/updates', strict(20), async (req, reply) =>
          idempotent(req, reply, `update:${req.params.id}`, () => conversation.postUpdate(ctx, req.userId, req.params.id, parse(C.UpdateBody, req.body).body, meta(req))),
        );
        priv.delete<{ Params: { id: string; aid: string } }>('/pacts/:id/updates/:aid', strict(20), async (req) => conversation.deleteUpdate(ctx, req.userId, req.params.id, req.params.aid, meta(req)));
        priv.put<{ Params: { id: string } }>('/pacts/:id/pin', strict(30), async (req) => conversation.pin(ctx, req.userId, req.params.id, parse(C.PinItemBody, req.body).activityId, meta(req)));
        priv.post<{ Params: { id: string } }>('/pacts/:id/complete', strict(5), async (req, reply) =>
          idempotent(req, reply, `complete:${req.params.id}`, () => {
            const body = parse(C.CompleteBody, req.body ?? {});
            return pacts.completePact(ctx, req.userId, req.params.id, body, meta(req));
          }),
        );
        priv.post<{ Params: { id: string } }>('/pacts/:id/release', strict(5), async (req, reply) =>
          idempotent(req, reply, `release:${req.params.id}`, () => pacts.release(ctx, req.userId, req.params.id, parse(C.PinBody, req.body).pin, meta(req))),
        );
        priv.post<{ Params: { id: string } }>('/pacts/:id/release/approve', strict(5), async (req) =>
          pacts.decideRelease(ctx, req.userId, req.params.id, 'approve', parse(C.PinBody, req.body).pin, meta(req)),
        );
        priv.post<{ Params: { id: string } }>('/pacts/:id/release/decline', strict(10), async (req) => pacts.decideRelease(ctx, req.userId, req.params.id, 'decline', null, meta(req)));
        priv.post<{ Params: { id: string } }>('/pacts/:id/cancel', strict(5), async (req, reply) =>
          idempotent(req, reply, `cancel:${req.params.id}`, () => pacts.cancel(ctx, req.userId, req.params.id, parse(C.PinBody, req.body).pin, meta(req))),
        );
        priv.post<{ Params: { id: string } }>('/pacts/:id/nudge', strict(5), async (req) => pacts.nudge(ctx, req.userId, req.params.id));

        priv.post<{ Params: { id: string } }>('/pacts/:id/items', strict(30), async (req) => orders.addItem(ctx, req.userId, req.params.id, parse(C.ItemBody, req.body)));
        priv.patch<{ Params: { id: string; itemId: string } }>('/pacts/:id/items/:itemId', strict(30), async (req) =>
          orders.updateItem(ctx, req.userId, req.params.id, req.params.itemId, parse(C.ItemPatchBody, req.body)),
        );
        priv.post<{ Params: { id: string } }>('/pacts/:id/orders', strict(30), async (req, reply) =>
          idempotent(req, reply, `order:${req.params.id}`, () => orders.placeOrder(ctx, req.userId, req.params.id, parse(C.OrderBody, req.body), meta(req))),
        );
        priv.delete<{ Params: { id: string; orderId: string } }>('/pacts/:id/orders/:orderId', strict(30), async (req) =>
          orders.cancelOrder(ctx, req.userId, req.params.id, req.params.orderId, meta(req)),
        );
        priv.put<{ Params: { id: string } }>('/pacts/:id/pledge', strict(20), async (req) => pledges.setPledge(ctx, req.userId, req.params.id, parse(C.PledgeBody, req.body)));
        priv.delete<{ Params: { id: string } }>('/pacts/:id/pledge', strict(20), async (req) => pledges.cancelPledge(ctx, req.userId, req.params.id));

        /* ---------- money in by bank transfer, money out to vendors */
        priv.post<{ Params: { id: string } }>('/pacts/:id/bank-account', strict(5), async (req) => pactMoney.openPactAccount(ctx, req.userId, req.params.id, meta(req)));
        priv.patch<{ Params: { id: string; transferId: string } }>('/pacts/:id/transfers/:transferId', strict(30), async (req) =>
          pactMoney.assignTransfer(ctx, req.userId, req.params.id, req.params.transferId, parse(C.AssignTransferBody, req.body).userId, meta(req)),
        );
        priv.put<{ Params: { id: string } }>('/pacts/:id/co-organizer', strict(10), async (req) =>
          pactMoney.setCoOrganizer(ctx, req.userId, req.params.id, parse(C.CoOrganizerBody, req.body).userId, meta(req)),
        );
        priv.post<{ Params: { id: string } }>('/pacts/:id/payouts/resolve', strict(10), async (req) => {
          const body = parse(C.ResolveBankBody, req.body);
          return pactMoney.resolveVendor(ctx, req.userId, req.params.id, body.bankCode, body.accountNumber);
        });
        priv.post<{ Params: { id: string } }>('/pacts/:id/payouts', strict(5), async (req, reply) =>
          idempotent(req, reply, `payout:${req.params.id}`, () => pactMoney.requestVendorPayment(ctx, req.userId, req.params.id, parse(C.VendorPayBody, req.body), meta(req))),
        );
        priv.post<{ Params: { id: string; payoutId: string } }>('/pacts/:id/payouts/:payoutId/approve', strict(10), async (req) =>
          pactMoney.decideVendorPayment(ctx, req.userId, req.params.id, req.params.payoutId, 'approve', parse(C.PinBody, req.body).pin, meta(req)),
        );
        priv.post<{ Params: { id: string; payoutId: string } }>('/pacts/:id/payouts/:payoutId/reject', strict(10), async (req) =>
          pactMoney.decideVendorPayment(ctx, req.userId, req.params.id, req.params.payoutId, 'reject', null, meta(req)),
        );
        priv.post<{ Params: { id: string; payoutId: string } }>('/pacts/:id/payouts/:payoutId/cancel', strict(10), async (req) =>
          pactMoney.decideVendorPayment(ctx, req.userId, req.params.id, req.params.payoutId, 'cancel', null, meta(req)),
        );
        priv.get<{ Params: { id: string; payoutId: string } }>('/pacts/:id/payouts/:payoutId/receipt', async (req, reply) => {
          const r = await pactMoney.getReceipt(ctx, req.userId, req.params.id, req.params.payoutId);
          return reply
            .header('Content-Type', r.mime)
            .header('Cache-Control', 'private, max-age=3600')
            .header('Content-Disposition', 'inline')
            .header('X-Content-Type-Options', 'nosniff')
            .send(r.data);
        });
        priv.post<{ Params: { code: string } }>('/invites/:code/join', strict(20), async (req) =>
          pacts.joinByCode(ctx, req.userId, req.params.code, parse(C.ParticipationBody.partial(), req.body).participation ?? null),
        );

        /* ---------- Circles */
        priv.get('/circles', async (req) => circles.listCircles(ctx, req.userId));
        priv.post('/circles', strict(10), async (req) => circles.createCircle(ctx, req.userId, parse(C.CreateCircleBody, req.body), meta(req)));
        priv.get<{ Params: { id: string } }>('/circles/:id', async (req) => circles.getCircle(ctx, req.userId, req.params.id));
        priv.patch<{ Params: { id: string } }>('/circles/:id', strict(30), async (req) => circles.updateCircle(ctx, req.userId, req.params.id, parse(C.UpdateCircleBody, req.body), meta(req)));
        priv.post<{ Params: { id: string } }>('/circles/:id/leave', strict(20), async (req) => circles.leaveCircle(ctx, req.userId, req.params.id, meta(req)));
        priv.delete<{ Params: { id: string; userId: string } }>('/circles/:id/members/:userId', strict(30), async (req) => circles.removeMember(ctx, req.userId, req.params.id, req.params.userId, meta(req)));
        priv.post<{ Params: { id: string } }>('/circles/:id/invites', strict(30), async (req) => circles.ensureInvite(ctx, req.userId, req.params.id, meta(req)));
        priv.post<{ Params: { id: string } }>('/circles/:id/invites/reset', strict(10), async (req) => circles.resetInvite(ctx, req.userId, req.params.id, meta(req)));
        /* ---------- Plans */
        priv.get('/plans/needs-you', async (req) => plans.needsYou(ctx, req.userId));
        priv.get<{ Params: { id: string } }>('/circles/:id/plans', async (req) => plans.listCirclePlans(ctx, req.userId, req.params.id));
        priv.post<{ Params: { id: string } }>('/circles/:id/plans', strict(20), async (req) => plans.createPlan(ctx, req.userId, req.params.id, parse(C.CreatePlanBody, req.body), meta(req)));
        priv.get<{ Params: { id: string }; Querystring: { from?: string } }>('/plans/:id', async (req) => plans.getPlan(ctx, req.userId, req.params.id, req.query.from === 'home' ? 'home' : req.query.from === 'circle' ? 'circle' : undefined));
        priv.patch<{ Params: { id: string } }>('/plans/:id', strict(30), async (req) => plans.updatePlan(ctx, req.userId, req.params.id, parse(C.UpdatePlanBody, req.body), meta(req)));
        priv.put<{ Params: { id: string } }>('/plans/:id/rsvp-open', strict(20), async (req) => plans.setRsvpOpen(ctx, req.userId, req.params.id, parse(C.PlanRsvpOpenBody, req.body).open, meta(req)));
        priv.post<{ Params: { id: string } }>('/plans/:id/status', strict(20), async (req) => plans.setStatus(ctx, req.userId, req.params.id, parse(C.PlanStatusBody, req.body).status, meta(req)));
        priv.put<{ Params: { id: string } }>('/plans/:id/rsvp', strict(60), async (req) => plans.rsvpAsMember(ctx, req.userId, req.params.id, parse(C.PlanRsvpBody, req.body).status));
        priv.post<{ Params: { id: string } }>('/plans/:id/tasks', strict(40), async (req) => plans.addTask(ctx, req.userId, req.params.id, parse(C.PlanTaskBody, req.body)));
        priv.patch<{ Params: { id: string; taskId: string } }>('/plans/:id/tasks/:taskId', strict(60), async (req) => plans.patchTask(ctx, req.userId, req.params.id, req.params.taskId, parse(C.PlanTaskPatchBody, req.body)));
        priv.delete<{ Params: { id: string; taskId: string } }>('/plans/:id/tasks/:taskId', strict(40), async (req) => plans.deleteTask(ctx, req.userId, req.params.id, req.params.taskId));
        priv.post<{ Params: { id: string } }>('/plans/:id/asks', strict(30), async (req) => plans.linkAsk(ctx, req.userId, req.params.id, parse(C.LinkAskBody, req.body).askId));
        priv.delete<{ Params: { id: string; askId: string } }>('/plans/:id/asks/:askId', strict(30), async (req) => plans.unlinkAsk(ctx, req.userId, req.params.id, req.params.askId));
        priv.get<{ Params: { id: string } }>('/plans/:id/pact-draft', strict(30), async (req) => plans.pactDraft(ctx, req.userId, req.params.id));
        priv.post<{ Params: { id: string } }>('/plans/:id/shared', strict(60), async (req) => plans.recordShared(ctx, req.userId, req.params.id, parse(C.AskSharedBody, req.body).via));
        priv.post<{ Params: { id: string } }>('/plans/:id/share/reset', strict(10), async (req) => plans.resetShare(ctx, req.userId, req.params.id, meta(req)));
        priv.get('/home', strict(120), async (req) => home.getHome(ctx, req.userId));
        const RecapKind = z.enum(['plan', 'pact', 'split']);
        priv.get<{ Params: { kind: string; id: string }; Querystring: { from?: string } }>('/recaps/:kind/:id', async (req) => home.getRecap(ctx, req.userId, parse(RecapKind, req.params.kind), req.params.id, req.query.from === 'home' ? 'home' : 'object'));
        priv.post<{ Params: { kind: string; id: string } }>('/recaps/:kind/:id/share', strict(20), async (req) => home.enableShare(ctx, req.userId, parse(RecapKind, req.params.kind), req.params.id, meta(req)));
        priv.delete<{ Params: { kind: string; id: string } }>('/recaps/:kind/:id/share', strict(20), async (req) => home.revokeShare(ctx, req.userId, parse(RecapKind, req.params.kind), req.params.id, meta(req)));
        priv.post<{ Params: { kind: string; id: string } }>('/recaps/:kind/:id/shared', strict(60), async (req) => home.recordRecapShared(ctx, req.userId, parse(RecapKind, req.params.kind), req.params.id, parse(C.SplitSharedBody, req.body).via));
        priv.get('/splits/needs-you', async (req) => splits.needsYou(ctx, req.userId));
        priv.get<{ Params: { id: string } }>('/circles/:id/splits', async (req) => splits.listCircleSplits(ctx, req.userId, req.params.id));
        priv.post<{ Params: { id: string }; Querystring: { from?: string } }>('/circles/:id/splits', strict(20), async (req) =>
          splits.createSplit(ctx, req.userId, req.params.id, parse(C.CreateSplitBody, req.body), meta(req), req.query.from === 'home' ? 'home' : req.query.from === 'nav' ? 'nav' : 'circle'),
        );
        priv.get<{ Params: { id: string }; Querystring: { from?: string } }>('/splits/:id', async (req) => splits.getSplit(ctx, req.userId, req.params.id, req.query.from === 'home' ? 'home' : req.query.from === 'circle' ? 'circle' : undefined));
        priv.patch<{ Params: { id: string } }>('/splits/:id', strict(30), async (req) => splits.updateSplit(ctx, req.userId, req.params.id, parse(C.UpdateSplitBody, req.body), meta(req)));
        priv.post<{ Params: { id: string } }>('/splits/:id/cancel', strict(10), async (req) => splits.cancelSplit(ctx, req.userId, req.params.id, meta(req)));
        priv.put<{ Params: { id: string; userId: string } }>('/splits/:id/shares/:userId', strict(60), async (req) =>
          splits.settleShare(ctx, req.userId, req.params.id, req.params.userId, parse(C.SplitSettleBody, req.body).settled, meta(req)),
        );
        priv.post<{ Params: { id: string } }>('/splits/:id/shared', strict(60), async (req) => splits.recordShared(ctx, req.userId, req.params.id, parse(C.SplitSharedBody, req.body).via));
        priv.get<{ Params: { token: string } }>('/split-links/:token/mine', strict(120), async (req) => splits.myLinkState(ctx, req.userId, req.params.token, true));
        priv.put<{ Params: { token: string } }>('/split-links/:token/settle', strict(30), async (req) => {
          const b = parse(C.SplitSettleBody, req.body);
          return splits.settleViaLink(ctx, req.userId, req.params.token, b.settled, b.afterAuth === true, meta(req));
        });
        priv.post<{ Params: { token: string } }>('/split-links/:token/join-circle', strict(20), async (req) => splits.joinCircleFromSplit(ctx, req.userId, req.params.token, meta(req)));
        priv.post<{ Params: { token: string } }>('/split-links/:token/shared', strict(60), async (req) => splits.recordLinkShared(ctx, req.userId, req.params.token, parse(C.SplitSharedBody, req.body).via));
        priv.get<{ Params: { token: string } }>('/plan-links/:token/mine', strict(120), async (req) => plans.myLinkState(ctx, req.userId, req.params.token));
        priv.put<{ Params: { token: string } }>('/plan-links/:token/rsvp', strict(60), async (req) => {
          const b = parse(C.PlanRsvpBody, req.body);
          return plans.rsvpViaLink(ctx, req.userId, req.params.token, b.status, b.afterAuth === true);
        });
        priv.post<{ Params: { token: string } }>('/plan-links/:token/join-circle', strict(20), async (req) => plans.joinCircleFromPlan(ctx, req.userId, req.params.token, meta(req)));
        priv.post<{ Params: { token: string } }>('/plan-links/:token/shared', strict(60), async (req) => plans.recordLinkShared(ctx, req.userId, req.params.token, parse(C.AskSharedBody, req.body).via));

        /* ---------- Ask the group */
        priv.get('/asks/needs-you', async (req) => asks.needsYou(ctx, req.userId));
        priv.get<{ Params: { id: string }; Querystring: { from?: string } }>('/asks/:id', async (req) => asks.getAsk(ctx, req.userId, req.params.id, req.query.from === 'home' ? 'home' : req.query.from === 'circle' ? 'circle' : undefined));
        priv.put<{ Params: { id: string } }>('/asks/:id/response', strict(60), async (req) => asks.respondAsMember(ctx, req.userId, req.params.id, parse(C.AskResponseBody, req.body)));
        priv.post<{ Params: { id: string } }>('/asks/:id/close', strict(20), async (req) => asks.closeAsk(ctx, req.userId, req.params.id, meta(req)));
        priv.post<{ Params: { id: string } }>('/asks/:id/shared', strict(60), async (req) => asks.recordShared(ctx, req.userId, req.params.id, parse(C.AskSharedBody, req.body).via));
        priv.post<{ Params: { id: string } }>('/asks/:id/share/reset', strict(10), async (req) => asks.resetShare(ctx, req.userId, req.params.id, meta(req)));
        priv.get<{ Params: { id: string } }>('/circles/:id/asks', async (req) => asks.listCircleAsks(ctx, req.userId, req.params.id));
        priv.post<{ Params: { id: string } }>('/circles/:id/asks', strict(20), async (req) => asks.createAsk(ctx, req.userId, req.params.id, parse(C.CreateAskBody, req.body), meta(req)));
        priv.get<{ Params: { token: string } }>('/ask-links/:token/mine', strict(120), async (req) => asks.myLinkState(ctx, req.userId, req.params.token));
        priv.put<{ Params: { token: string } }>('/ask-links/:token/response', strict(60), async (req) => {
          const b = parse(C.AskResponseBody, req.body);
          return asks.respondViaLink(ctx, req.userId, req.params.token, b, b.afterAuth === true);
        });
        priv.post<{ Params: { token: string } }>('/ask-links/:token/auth-completed', strict(30), async (req) => asks.authCompleted(ctx, req.userId, req.params.token));
        priv.post<{ Params: { token: string } }>('/ask-links/:token/reshared', strict(60), async (req) => asks.reshared(ctx, req.userId, req.params.token, parse(C.AskSharedBody, req.body).via));
        priv.post<{ Params: { token: string } }>('/ask-links/:token/join-circle', strict(20), async (req) => asks.joinCircleFromAsk(ctx, req.userId, req.params.token, meta(req)));
        priv.post<{ Params: { token: string } }>('/circle-invites/:token/join', strict(20), async (req) => circles.joinByToken(ctx, req.userId, req.params.token, meta(req)));

        priv.get('/activity', async (req) => pacts.feed(ctx, req.userId));
        priv.get('/people/recent', async (req) => pacts.recentPeople(ctx, req.userId));

        priv.get<{ Querystring: { cursor?: string } }>('/notifications', async (req) => users.listNotifications(ctx, req.userId, req.query.cursor));
        priv.get<{ Params: { id: string } }>('/notifications/:id', async (req) => users.getNotification(ctx, req.userId, req.params.id));
        priv.post('/notifications/read', async (req) => {
          const body = parse(z.object({ ids: z.array(z.string().uuid()).max(100).optional() }), req.body);
          await users.markNotificationsRead(ctx, req.userId, body.ids);
          return { ok: true };
        });

        /* ---------- first-time onboarding events (what someone looked at or chose; never text) */
        const OnboardingEvent = z.object({ name: z.enum(CLIENT_EVENTS), props: z.record(z.string(), z.union([z.string().max(40), z.boolean(), z.number()])).optional() });
        priv.post('/me/onboarding-event', strict(60), async (req) => {
          await recordClientEvent(ctx, req.userId, parse(OnboardingEvent, req.body));
          return { ok: true };
        });

        /* ---------- browser push (optional; best-effort) */
        const SubscribeBody = z.object({
          endpoint: z.string().url().max(1000),
          keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
        });
        priv.post('/push/subscribe', strict(20), async (req) => {
          await saveSubscription(ctx, req.userId, parse(SubscribeBody, req.body));
          return { ok: true };
        });
        priv.post('/push/unsubscribe', strict(30), async (req) => {
          await removeSubscription(ctx, req.userId, parse(z.object({ endpoint: z.string().max(1000) }), req.body).endpoint);
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
          // Stands in for someone paying a Pact's account number from their bank app.
          priv.post<{ Params: { number: string } }>('/sandbox/pact-accounts/:number/transfers', async (req) => {
            const body = parse(
              z.object({
                amount: z.number().int().min(100).max(100_000_000_00),
                senderName: z.string().trim().min(2).max(60),
                senderBank: z.string().trim().max(60).default('Guaranty Trust Bank'),
                senderAccount: z.string().regex(/^\d{10}$/).optional(),
              }),
              req.body,
            );
            const payload = JSON.stringify({
              event: 'charge.success',
              data: {
                id: Date.now(),
                reference: `DVA_${randomUUID()}`,
                amount: body.amount,
                currency: 'NGN',
                channel: 'dedicated_nuban',
                authorization: {
                  channel: 'dedicated_nuban',
                  receiver_bank_account_number: req.params.number,
                  sender_name: body.senderName.toUpperCase(),
                  sender_bank: body.senderBank,
                  sender_bank_account_number: body.senderAccount ?? '0123456789',
                },
              },
            });
            const res = await app.inject({ method: 'POST', url: `/api/webhooks/sandbox`, headers: { 'content-type': 'application/json', 'x-paystack-signature': sandbox.sign(payload) }, payload });
            return { ok: res.statusCode === 200 };
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
    // Cache policy is set per file in setHeaders (cacheControl is off), so it applies to every way a
    // file leaves this server: a direct hit, `/` serving index.html, and the SPA fallback below.
    await app.register(fastifyStatic, {
      root: dist,
      wildcard: false,
      cacheControl: false,
      setHeaders: (res, path) => res.header('Cache-Control', staticCacheControl(path)),
    });
    const indexHtml = readFileSync(resolve(dist, 'index.html'), 'utf8');
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: { code: 'not_found', message: 'Not found.' } });
      // A shared Ask link: the same page for everyone, with a real title, description and card for crawlers.
      const share = /^\/a\/([A-Za-z0-9_-]{32,64})\/?(?:\?.*)?$/.exec(req.url);
      if (share) {
        const origin = config.APP_ORIGIN.replace(/\/$/, '');
        const image = `${origin}/brand/og-ask.png`;
        const row = await db
          .query<{ title: string; type: 'choice' | 'attendance'; status: string; closes_at: Date | null; name: string; emoji: string; n: number }>(
            `SELECT a.title, a.type, a.status, a.closes_at, c.name, c.emoji, (SELECT COUNT(*)::int FROM ask_responses r WHERE r.ask_id = a.id) AS n
               FROM asks a JOIN circles c ON c.id = a.circle_id WHERE a.share_token = $1 AND a.share_revoked_at IS NULL`,
            [share[1]],
          )
          .catch(() => null);
        const r = row?.rows[0];
        const meta = r
          ? { ...askPreviewText({ circleName: r.name, circleEmoji: r.emoji, title: r.title, type: r.type, responses: r.n, closed: r.status === 'closed' || (!!r.closes_at && r.closes_at <= ctx.now()) }), url: `${origin}/a/${share[1]}`, image, noindex: true }
          : { ...unavailablePreview, image };
        return reply.header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex, nofollow').type('text/html').send(injectOg(indexHtml, meta));
      }
      // A shared Plan link: the same idea, with when, where and how many are in.
      const planShare = /^\/p\/([A-Za-z0-9_-]{32,64})\/?(?:\?.*)?$/.exec(req.url);
      if (planShare) {
        const origin = config.APP_ORIGIN.replace(/\/$/, '');
        const image = `${origin}/brand/og-ask.png`;
        const row = await db
          .query<{ title: string; status: string; date: string | null; end_date: string | null; location: string | null; name: string; emoji: string; n: number }>(
            `SELECT p.title, p.status, p.date::text AS date, p.end_date::text AS end_date, p.location, c.name, c.emoji,
                    (SELECT COUNT(*)::int FROM plan_rsvps r WHERE r.plan_id = p.id AND r.status = 'in') AS n
               FROM plans p JOIN circles c ON c.id = p.circle_id WHERE p.share_token = $1`,
            [planShare[1]],
          )
          .catch(() => null);
        const r = row?.rows[0];
        const meta = r
          ? { ...planPreviewText({ title: r.title, circleName: r.name, circleEmoji: r.emoji, date: r.date, endDate: r.end_date, location: r.location, going: r.n, status: r.status }), url: `${origin}/p/${planShare[1]}`, image, noindex: true }
          : { ...unavailablePreview, description: 'This plan is no longer available.', image };
        return reply.header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex, nofollow').type('text/html').send(injectOg(indexHtml, meta));
      }
      // A shared Split link: deliberately generic. A debt is never put in a link preview.
      const splitShare = /^\/s\/([A-Za-z0-9_-]{32,64})\/?(?:\?.*)?$/.exec(req.url);
      if (splitShare) {
        const origin = config.APP_ORIGIN.replace(/\/$/, '');
        const image = `${origin}/brand/og-ask.png`;
        const row = await db.query<{ title: string }>('SELECT title FROM splits WHERE share_token = $1', [splitShare[1]]).catch(() => null);
        const meta = row?.rows[0]
          ? { ...splitPreviewText(row.rows[0].title), url: `${origin}/s/${splitShare[1]}`, image, noindex: true }
          : { ...unavailablePreview, description: 'This split is no longer available.', image };
        return reply.header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex, nofollow').type('text/html').send(injectOg(indexHtml, meta));
      }
      // A shared recap: a generic celebratory card. No names, no amounts.
      const recapShare = /^\/r\/([A-Za-z0-9_-]{32,64})\/?(?:\?.*)?$/.exec(req.url);
      if (recapShare) {
        const origin = config.APP_ORIGIN.replace(/\/$/, '');
        const image = `${origin}/brand/og-ask.png`;
        const row = await db
          .query<{ title: string }>(
            `SELECT COALESCE(p.title, a.title, s.title) AS title FROM recap_links r
               LEFT JOIN plans p ON r.kind = 'plan' AND p.id = r.object_id LEFT JOIN pacts a ON r.kind = 'pact' AND a.id = r.object_id LEFT JOIN splits s ON r.kind = 'split' AND s.id = r.object_id
              WHERE r.token = $1 AND r.revoked_at IS NULL`,
            [recapShare[1]],
          )
          .catch(() => null);
        const meta = row?.rows[0]
          ? { title: row.rows[0].title, description: 'We made it happen.', url: `${origin}/r/${recapShare[1]}`, image, noindex: true }
          : { ...unavailablePreview, description: 'This recap is no longer available.', image };
        return reply.header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex, nofollow').type('text/html').send(injectOg(indexHtml, meta));
      }
      return reply.sendFile('index.html');
    });
  } else {
    // Fastify's own 404 writes "Route GET:<url> not found" to the log, URL and all. Answer with the API's JSON shape instead.
    app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: 'not_found', message: 'Not found.' } }));
  }

  return { app, ctx };
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: Ctx;
  }
}
