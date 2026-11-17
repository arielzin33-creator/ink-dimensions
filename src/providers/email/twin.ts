// Offline email twin: keeps messages in memory for tests and local development. Never logs them.
import type { EmailMessage, EmailProvider } from './types.js';

export type TwinEmail = EmailProvider & { sent: EmailMessage[] };

export function createTwinEmail(): TwinEmail {
  const sent: EmailMessage[] = [];
  return {
    name: 'twin',
    real: false,
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}
