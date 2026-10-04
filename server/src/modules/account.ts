import type { AccountDTO } from '../../../shared/contracts.js';
import type { Ctx, ReqMeta } from '../context.js';
import { AppError, badRequest } from '../lib/errors.js';
import { track } from '../lib/events.js';
import { normalizeNgPhone } from '../lib/phone.js';
import { claimPhoneInvites, consumeOtp, getUser, issueOtp, verifyPin } from './auth.js';
import { consumeEmailOtp, EMAIL_OTP_TTL_MS, issueEmailOtp } from './emailAuth.js';
import { addIdentity, findEmailOwner, isEmailIdentity, maskEmail, normalizeEmail, userIdentities } from './identities.js';
import { STYTCH_CODE_TTL_MS } from '../payments/stytch.js';
import { sendStytchCode, verifyStytchCode } from './stytchAuth.js';
import { audit, notify } from './platform.js';

/**
 * Managing how an account is reached. Every route here is for the signed-in person and acts only on their own user id: a flow that
 * links an identity can never create a second user, and an identity that belongs to someone else is a conflict, never a move.
 */

/** A safe summary for Profile: what is connected, never provider subjects or ids. */
export async function getAccount(ctx: Ctx, userId: string): Promise<AccountDTO> {
  const [ids, user] = await Promise.all([userIdentities(ctx.db, userId), getUser(ctx.db, userId)]);
  const email = ids.find(isEmailIdentity);
  const google = ids.find((i) => i.provider === 'google');
  const phone = ids.find((i) => i.provider === 'phone');
  return {
    // A Stytch identity's subject is its user id, so the address always comes from the verified `email` column.
    email: email ? { address: email.email ?? email.provider_subject } : null,
    google: google ? { connected: true, email: google.email } : { connected: false, email: null },
    phone: phone ? { number: phone.phone! } : null,
    hasPin: !!user.pin_hash,
    signInMethods: ids.length,
  };
}

/** The ways a person can sign in count; removing the last one would lock them out. */
const assertNotLast = async (ctx: Ctx, userId: string) => {
  if ((await userIdentities(ctx.db, userId)).length <= 1) throw new AppError(409, 'last_sign_in_method', 'This is your only way to sign in. Add another first.');
};

/* ---------------------------------------------------------------- email */

export async function requestEmailLink(ctx: Ctx, userId: string, rawEmail: string, meta: ReqMeta) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw badRequest('invalid_email', 'Enter a valid email address.');
  // The same answer whether or not the address is taken: a conflict surfaces only once its owner has proved they hold it.
  if (ctx.config.EMAIL_AUTH_PROVIDER === 'stytch') {
    await sendStytchCode(ctx, email, 'link', meta, userId);
    return { email: maskEmail(email), expiresInSec: STYTCH_CODE_TTL_MS / 1000 };
  }
  const code = await issueEmailOtp(ctx, email, 'link', meta, userId);
  return { email: maskEmail(email), expiresInSec: EMAIL_OTP_TTL_MS / 1000, ...(ctx.config.exposeEmailCodes ? { devCode: code } : {}) };
}

/** Adds a verified email, or replaces the current one (which needs the PIN when there is one, and tells the old address). */
export async function verifyEmailLink(ctx: Ctx, userId: string, rawEmail: string, code: string, pin: string | undefined, meta: ReqMeta) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw badRequest('invalid_email', 'Enter a valid email address.');
  const [user, ids] = await Promise.all([getUser(ctx.db, userId), userIdentities(ctx.db, userId)]);
  const current = ids.find(isEmailIdentity);
  if (current && (current.email ?? current.provider_subject) === email) return getAccount(ctx, userId);
  if (current && user.pin_hash) {
    if (!pin) throw new AppError(403, 'pin_required', 'Enter your PIN to change your email.');
    await verifyPin(ctx, userId, pin, meta);
  }
  const viaStytch = ctx.config.EMAIL_AUTH_PROVIDER === 'stytch';
  const stytchUserId = viaStytch ? (await verifyStytchCode(ctx, email, code, 'link', meta, userId)).stytchUserId : null;
  if (!viaStytch) await consumeEmailOtp(ctx, email, code, 'link', meta, userId);
  try {
    await ctx.db.tx(async (q) => {
      // The address may already belong to someone else through another door (Google, an older email identity): a conflict, never shared.
      const holder = await findEmailOwner(q, email);
      if (holder && holder.user_id !== userId) throw new AppError(409, 'identity_taken', 'This sign-in method is already connected to another PACT account.');
      if (current) await q.query('DELETE FROM user_identities WHERE id = $1', [current.id]);
      if (stytchUserId) await addIdentity(q, userId, 'stytch', stytchUserId, { email });
      else await addIdentity(q, userId, 'email', email, { email });
      await audit(q, { actorId: userId, action: current ? 'email_changed' : 'email_identity_linked', ip: meta.ip });
      await track(q, ctx.config, 'identity_linked', { userId, key: `idl:${userId}:email:${email.length}:${ctx.now().getTime()}`, props: { provider: 'email' } }, true);
      if (current) await notify(q, [userId], { type: 'security', title: 'Email changed', body: 'The email you sign in with was changed. If this wasn’t you, contact support now.' });
    });
  } catch (err) {
    if (err instanceof AppError && err.code === 'identity_taken') await audit(ctx.db, { actorId: userId, action: 'auth_provider_conflict', ip: meta.ip, metadata: { provider: 'email' } });
    throw err;
  }
  if (current?.email) await ctx.email.send({ to: current.email, subject: 'Your PACT email was changed', text: 'The email you use to sign in to PACT was changed. If this wasn’t you, contact support now.' }).catch(() => undefined);
  return getAccount(ctx, userId);
}

/* ---------------------------------------------------------------- phone: a trust layer, attached to the account already signed in */

export async function requestPhoneLink(ctx: Ctx, userId: string, rawPhone: string, meta: ReqMeta) {
  const phone = normalizeNgPhone(rawPhone);
  if (!phone) throw badRequest('invalid_phone', 'Enter a valid Nigerian mobile number.');
  if ((await userIdentities(ctx.db, userId)).some((i) => i.provider === 'phone')) throw new AppError(409, 'phone_already_verified', 'Your phone is already verified.');
  const code = await issueOtp(ctx, phone, 'link', meta);
  await track(ctx.db, ctx.config, 'phone_verification_started', { userId, key: `pvs:${userId}:${ctx.now().getTime()}`, props: {} });
  return { phone, expiresInSec: 300, ...(ctx.config.exposeDevCodes ? { devCode: code } : {}) };
}

/** Proves the number, attaches it to THIS account, and only then hands over any invite sent to that number. */
export async function verifyPhoneLink(ctx: Ctx, userId: string, rawPhone: string, code: string, meta: ReqMeta) {
  const phone = normalizeNgPhone(rawPhone);
  if (!phone) throw badRequest('invalid_phone', 'Enter a valid Nigerian mobile number.');
  await consumeOtp(ctx, phone, code, 'link', meta);
  let claimed = 0;
  try {
    claimed = await ctx.db.tx(async (q) => {
      if ((await userIdentities(q, userId)).some((i) => i.provider === 'phone')) throw new AppError(409, 'phone_already_verified', 'Your phone is already verified.');
      await addIdentity(q, userId, 'phone', phone, { phone });
      // The compatibility mirror: unique, so a number that already sits on another row is a conflict too.
      const mirror = await q.query('UPDATE users SET phone = $2, updated_at = now() WHERE id = $1 AND phone IS NULL AND NOT EXISTS (SELECT 1 FROM users WHERE phone = $2)', [userId, phone]);
      if (!mirror.rowCount) throw new AppError(409, 'identity_taken', 'This sign-in method is already connected to another PACT account.');
      const n = await claimPhoneInvites(q, userId, phone);
      await audit(q, { actorId: userId, action: 'phone_identity_verified', ip: meta.ip });
      await track(q, ctx.config, 'phone_verified', { userId, key: `pv:${userId}`, props: { claimed_invites: n > 0 } }, true);
      await track(q, ctx.config, 'identity_linked', { userId, key: `idl:${userId}:phone`, props: { provider: 'phone' } }, true);
      return n;
    });
  } catch (err) {
    if (err instanceof AppError && err.code === 'identity_taken') await audit(ctx.db, { actorId: userId, action: 'auth_provider_conflict', ip: meta.ip, metadata: { provider: 'phone' } });
    throw err;
  }
  return { account: await getAccount(ctx, userId), claimedInvites: claimed };
}

/* ---------------------------------------------------------------- unlink */

export async function unlink(ctx: Ctx, userId: string, provider: 'google' | 'email' | 'phone', pin: string | undefined, meta: ReqMeta) {
  const [user, ids] = await Promise.all([getUser(ctx.db, userId), userIdentities(ctx.db, userId)]);
  const target = ids.find((i) => (provider === 'email' ? isEmailIdentity(i) : i.provider === provider));
  if (!target) throw new AppError(404, 'not_connected', 'That isn’t connected.');
  await assertNotLast(ctx, userId);
  if (user.pin_hash) {
    if (!pin) throw new AppError(403, 'pin_required', 'Enter your PIN to disconnect.');
    await verifyPin(ctx, userId, pin, meta);
  }
  await ctx.db.tx(async (q) => {
    await q.query('DELETE FROM user_identities WHERE id = $1', [target.id]);
    if (provider === 'phone') await q.query('UPDATE users SET phone = NULL, updated_at = now() WHERE id = $1', [userId]);
    await audit(q, { actorId: userId, action: 'identity_unlinked', ip: meta.ip, metadata: { provider } });
  });
  return getAccount(ctx, userId);
}

/* ---------------------------------------------------------------- step-up */

/** Money-adjacent actions need a verified phone. Social features never call this. */
export async function assertPhoneVerified(ctx: Ctx, userId: string) {
  const has = (await userIdentities(ctx.db, userId)).some((i) => i.provider === 'phone');
  if (!has) throw new AppError(403, 'phone_required', 'Verify your phone number to do this. It keeps your money safe.');
}
