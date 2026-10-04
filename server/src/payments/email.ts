import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.js';

export interface Email {
  to: string;
  subject: string;
  text: string;
}

/** Provider-agnostic: business code only ever calls `send`. */
export interface EmailSender {
  send(email: Email): Promise<void>;
}

export function createEmail(config: Config, log: FastifyBaseLogger): EmailSender {
  if (config.EMAIL_PROVIDER === 'resend') {
    return {
      async send({ to, subject, text }) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: config.EMAIL_FROM, to: [to], subject, text }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`Email failed with ${res.status}`);
      },
    };
  }
  // Development and tests: the message is logged, never sent.
  return {
    async send({ to, subject, text }) {
      log.info({ to }, `[email:dev] ${subject}: ${text}`);
    },
  };
}
