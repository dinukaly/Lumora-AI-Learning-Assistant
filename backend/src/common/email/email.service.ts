import { config } from '../../config/index.js';
import { ConsoleEmailProvider } from './console-email-provider.js';
import type { EmailProvider, SendEmailInput, SentEmailResult } from './email-provider.js';
import { ResendEmailProvider } from './resend-email-provider.js';
import { SmtpEmailProvider } from './smtp-email-provider.js';

function createProviderFromConfig(): EmailProvider {
  switch (config.email.provider) {
    case 'resend':
      return new ResendEmailProvider();
    case 'smtp':
      return new SmtpEmailProvider();
    case 'console':
    default:
      return new ConsoleEmailProvider();
  }
}

export class EmailService {
  private static provider: EmailProvider = createProviderFromConfig();

  static setProviderForTesting(provider: EmailProvider) {
    this.provider = provider;
  }

  static resetProviderForTesting() {
    this.provider = createProviderFromConfig();
  }

  static async send(input: SendEmailInput): Promise<SentEmailResult> {
    return this.provider.send(input);
  }
}
