import crypto from 'crypto';
import { config } from '../../config/index.js';
import { EmailService } from '../../common/email/index.js';
import User from '../users/user.model.js';
import AuthIdentity from './auth-identity.model.js';
import EmailVerificationToken from './email-verification-token.model.js';

const EMAIL_VERIFY_PURPOSE = 'EMAIL_VERIFY';

export class EmailVerificationError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'NOT_FOUND'
      | 'TOKEN_EXPIRED'
      | 'TOKEN_INVALID',
  ) {
    super(message);
    this.name = 'EmailVerificationError';
  }
}

export class EmailVerificationService {
  static async sendVerificationEmailForUser(userId: string) {
    const user = await User.findById(userId).select('email name emailVerifiedAt');
    if (!user) {
      throw new EmailVerificationError('User not found', 'NOT_FOUND');
    }

    if (user.emailVerifiedAt) {
      return {
        sent: false,
        alreadyVerified: true,
      };
    }

    const latestToken = await EmailVerificationToken.findOne({
      userId: user._id,
      purpose: EMAIL_VERIFY_PURPOSE,
      consumedAt: null,
    }).sort({ createdAt: -1 });

    const cooldownMs = config.email.verificationResendCooldownSeconds * 1000;
    if (
      latestToken
      && latestToken.createdAt
      && Date.now() - latestToken.createdAt.getTime() < cooldownMs
    ) {
      return {
        sent: false,
        alreadyVerified: false,
        throttled: true,
      };
    }

    await EmailVerificationToken.deleteMany({
      userId: user._id,
      purpose: EMAIL_VERIFY_PURPOSE,
      consumedAt: null,
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashVerificationToken(rawToken);
    const expiresAt = new Date(
      Date.now() + config.email.verificationTokenTtlMinutes * 60 * 1000,
    );

    await EmailVerificationToken.create({
      userId: user._id,
      tokenHash,
      email: user.email,
      purpose: EMAIL_VERIFY_PURPOSE,
      expiresAt,
    });

    const verificationLink = `${config.email.verificationUrlBase}?token=${encodeURIComponent(rawToken)}`;

    await EmailService.send({
      to: user.email,
      subject: 'Verify your Lumora email',
      text: buildVerificationText({ name: user.name, verificationLink }),
      html: buildVerificationHtml({ name: user.name, verificationLink }),
    });

    return {
      sent: true,
      alreadyVerified: false,
      throttled: false,
    };
  }

  static async verifyEmailToken(rawToken: string) {
    const tokenHash = hashVerificationToken(rawToken);
    const tokenRecord = await EmailVerificationToken.findOne({
      tokenHash,
      purpose: EMAIL_VERIFY_PURPOSE,
    });

    if (!tokenRecord) {
      throw new EmailVerificationError(
        'Verification token is invalid or has expired',
        'TOKEN_EXPIRED',
      );
    }

    if (tokenRecord.consumedAt || tokenRecord.expiresAt.getTime() <= Date.now()) {
      throw new EmailVerificationError(
        'Verification token is invalid or has expired',
        'TOKEN_EXPIRED',
      );
    }

    const user = await User.findById(tokenRecord.userId);
    if (!user) {
      throw new EmailVerificationError('User not found', 'NOT_FOUND');
    }

    const verificationTime = user.emailVerifiedAt ?? new Date();
    user.emailVerifiedAt = verificationTime;
    await user.save();
    await AuthIdentity.updateOne(
      {
        userId: user._id,
        provider: 'local',
      },
      {
        $set: {
          emailAtProvider: user.email,
          emailVerifiedAtProvider: true,
        },
      },
    );

    tokenRecord.consumedAt = verificationTime;
    await tokenRecord.save();
    await EmailVerificationToken.updateMany(
      {
        userId: user._id,
        purpose: EMAIL_VERIFY_PURPOSE,
        consumedAt: null,
        _id: { $ne: tokenRecord._id },
      },
      {
        $set: { consumedAt: verificationTime },
      },
    );

    return {
      message: 'Email verified successfully',
    };
  }
}

function hashVerificationToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildVerificationText(input: { name: string; verificationLink: string }) {
  return [
    `Hi ${input.name},`,
    '',
    'Thanks for creating your Lumora account.',
    'Verify your email to unlock protected learning features:',
    input.verificationLink,
    '',
    'If you did not create this account, you can ignore this email.',
  ].join('\n');
}

function buildVerificationHtml(input: { name: string; verificationLink: string }) {
  return [
    `<p>Hi ${escapeHtml(input.name)},</p>`,
    '<p>Thanks for creating your Lumora account.</p>',
    '<p>Verify your email to unlock protected learning features:</p>',
    `<p><a href="${escapeHtmlAttribute(input.verificationLink)}">${escapeHtml(input.verificationLink)}</a></p>`,
    '<p>If you did not create this account, you can ignore this email.</p>',
  ].join('');
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value);
}
