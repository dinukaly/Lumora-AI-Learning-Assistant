import { config } from '../../config/index.js';
import type { EmailProvider, SendEmailInput, SentEmailResult } from './email-provider.js';

export class ResendEmailProvider implements EmailProvider {
  async send(input: SendEmailInput): Promise<SentEmailResult> {
    if (!config.email.resend.apiKey) {
      throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.email.resend.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.email.from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Resend email send failed (${response.status}): ${responseText}`);
    }

    const responseJson = await response.json() as { id?: string };

    return {
      provider: 'resend',
      messageId: responseJson.id,
    };
  }
}
