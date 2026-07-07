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
  const expirationWindow = formatVerificationExpirationWindow();

  return [
    `Hi ${input.name},`,
    '',
    'Welcome to Lumora.',
    '',
    'Verify your email to unlock protected learning features and keep your account active.',
    `This link expires in ${expirationWindow}.`,
    input.verificationLink,
    '',
    'If the button or link does not open, copy and paste the URL into your browser.',
    '',
    'If you did not create this account, you can ignore this email.',
  ].join('\n');
}

function buildVerificationHtml(input: { name: string; verificationLink: string }) {
  const expirationWindow = formatVerificationExpirationWindow();
  const safeName = escapeHtml(input.name);
  const safeLink = escapeHtmlAttribute(input.verificationLink);
  const visibleLink = escapeHtml(input.verificationLink);

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <title>Verify your Lumora email</title>',
    '</head>',
    '<body style="margin:0;padding:0;background-color:#f5f5f4;color:#18181b;font-family:Arial,Helvetica,sans-serif;">',
    '  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">',
    '    Verify your email to unlock protected learning features in Lumora.',
    '  </div>',
    '  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f5f5f4;padding:32px 16px;">',
    '    <tr>',
    '      <td align="center">',
    '        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e7e5e4;border-radius:24px;overflow:hidden;">',
    '          <tr>',
    '            <td style="background:linear-gradient(135deg,#18181b 0%,#3f3f46 100%);padding:24px 28px 22px;">',
    '              <div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:#d6d3d1;margin-bottom:10px;">Learning assistant</div>',
    '              <div style="font-size:32px;line-height:1.1;font-weight:700;color:#fafaf9;">Lumora</div>',
    '            </td>',
    '          </tr>',
    '          <tr>',
    '            <td style="padding:32px 28px 12px;">',
    `              <p style="margin:0 0 14px;font-size:16px;line-height:1.7;color:#18181b;">Hi ${safeName},</p>`,
    '              <p style="margin:0 0 14px;font-size:16px;line-height:1.7;color:#3f3f46;">Welcome to Lumora. Verify your email to unlock protected learning features and keep your account active.</p>',
    `              <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#57534e;">This verification link expires in ${escapeHtml(expirationWindow)}.</p>`,
    '              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">',
    '                <tr>',
    `                  <td style="border-radius:999px;background-color:#18181b;"><a href="${safeLink}" style="display:inline-block;padding:14px 22px;font-size:15px;font-weight:700;line-height:1;color:#fafaf9;text-decoration:none;">Verify email</a></td>`,
    '                </tr>',
    '              </table>',
    '              <div style="margin:0 0 24px;padding:16px 18px;border-radius:18px;background-color:#fafaf9;border:1px solid #e7e5e4;">',
    '                <div style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#78716c;">Direct link</div>',
    `                <div style="font-size:13px;line-height:1.8;word-break:break-all;color:#44403c;"><a href="${safeLink}" style="color:#18181b;text-decoration:underline;">${visibleLink}</a></div>`,
    '              </div>',
    '              <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#57534e;">If you did not create this account, you can safely ignore this email.</p>',
    '            </td>',
    '          </tr>',
    '          <tr>',
    '            <td style="padding:0 28px 28px;">',
    '              <div style="border-top:1px solid #e7e5e4;padding-top:18px;font-size:12px;line-height:1.7;color:#78716c;">This message was sent by Lumora to help you verify your account and unlock protected study features.</div>',
    '            </td>',
    '          </tr>',
    '        </table>',
    '      </td>',
    '    </tr>',
    '  </table>',
    '</body>',
    '</html>',
  ].join('');
}

function formatVerificationExpirationWindow() {
  const totalMinutes = config.email.verificationTokenTtlMinutes;

  if (totalMinutes % (60 * 24) === 0) {
    const days = totalMinutes / (60 * 24);
    return days === 1 ? '1 day' : `${days} days`;
  }

  if (totalMinutes % 60 === 0) {
    const hours = totalMinutes / 60;
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }

  return totalMinutes === 1 ? '1 minute' : `${totalMinutes} minutes`;
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
