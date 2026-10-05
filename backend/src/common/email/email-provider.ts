export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SentEmailResult {
  provider: 'console' | 'resend' | 'sendgrid' | 'smtp';
  messageId?: string;
}

export interface EmailProvider {
  send(input: SendEmailInput): Promise<SentEmailResult>;
}
