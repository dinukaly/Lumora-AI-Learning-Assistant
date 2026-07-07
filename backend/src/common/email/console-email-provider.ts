import type { EmailProvider, SendEmailInput, SentEmailResult } from './email-provider.js';

export class ConsoleEmailProvider implements EmailProvider {
  async send(input: SendEmailInput): Promise<SentEmailResult> {
    console.info('[email:console]', JSON.stringify(input, null, 2));

    return {
      provider: 'console',
      messageId: `console-${Date.now()}`,
    };
  }
}
