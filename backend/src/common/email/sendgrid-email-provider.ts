import { config } from '../../config/index.js';
import type { EmailProvider, SendEmailInput, SentEmailResult } from './email-provider.js';

export class SendGridEmailProvider implements EmailProvider {
  async send(input: SendEmailInput): Promise<SentEmailResult> {
    if (!config.email.sendgrid.apiKey) {
      throw new Error('SENDGRID_API_KEY is required when EMAIL_PROVIDER=sendgrid');
    }

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.email.sendgrid.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: {
          email: extractEmailAddress(config.email.from),
          name: extractDisplayName(config.email.from),
        },
        personalizations: [
          {
            to: [{ email: input.to }],
            subject: input.subject,
          },
        ],
        content: [
          {
            type: 'text/plain',
            value: input.text,
          },
          {
            type: 'text/html',
            value: input.html,
          },
        ],
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`SendGrid email send failed (${response.status}): ${responseText}`);
    }

    return {
      provider: 'sendgrid',
      messageId: response.headers.get('x-message-id') || undefined,
    };
  }
}

function extractEmailAddress(from: string) {
  const match = from.match(/<([^>]+)>/);
  return (match?.[1] || from).trim();
}

function extractDisplayName(from: string) {
  const match = from.match(/^(.*?)\s*<[^>]+>$/);
  return match?.[1]?.trim().replace(/^"(.*)"$/, '$1') || undefined;
}
