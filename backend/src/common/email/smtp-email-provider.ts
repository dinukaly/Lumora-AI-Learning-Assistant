import nodemailer from 'nodemailer';
import { config } from '../../config/index.js';
import type { EmailProvider, SendEmailInput, SentEmailResult } from './email-provider.js';

export class SmtpEmailProvider implements EmailProvider {
  private transporter = nodemailer.createTransport({
    host: config.email.smtp.host,
    port: config.email.smtp.port,
    secure: config.email.smtp.secure,
    auth: config.email.smtp.user
      ? {
          user: config.email.smtp.user,
          pass: config.email.smtp.password,
        }
      : undefined,
  });

  async send(input: SendEmailInput): Promise<SentEmailResult> {
    if (!config.email.smtp.host) {
      throw new Error('SMTP_HOST is required when EMAIL_PROVIDER=smtp');
    }

    const info = await this.transporter.sendMail({
      from: config.email.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });

    return {
      provider: 'smtp',
      messageId: info.messageId,
    };
  }
}
