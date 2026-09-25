import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.js';

export interface SmsSender {
  send(to: string, message: string): Promise<void>;
}

export function createSms(config: Config, log: FastifyBaseLogger): SmsSender {
  if (config.SMS_PROVIDER === 'termii') {
    return {
      async send(to, message) {
        const res = await fetch('https://api.ng.termii.com/api/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: config.TERMII_API_KEY, to: to.replace('+', ''), from: config.TERMII_SENDER_ID, sms: message, type: 'plain', channel: 'dnd' }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`SMS failed with ${res.status}`);
      },
    };
  }
  return {
    async send(to, message) {
      log.info({ to }, `[sms:dev] ${message}`);
    },
  };
}
