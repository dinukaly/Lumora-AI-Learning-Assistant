import { config } from '../../config/index.js';
import User from '../users/user.model.js';

type PushPayload = {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type ExpoPushResult = {
  status: 'ok' | 'error';
  message?: string;
  details?: {
    error?: string;
    [key: string]: unknown;
  };
};

type ExpoPushResponse = {
  data?: ExpoPushResult[];
};

export class PushNotificationsService {
  static async sendNotification(payload: PushPayload) {
    if (!config.pushNotifications.enabled) {
      return;
    }

    const user = await User.findById(payload.userId).select('expoPushTokens').lean();
    if (!user || !Array.isArray(user.expoPushTokens) || user.expoPushTokens.length === 0) {
      return;
    }

    const normalizedTokens = [...new Set(user.expoPushTokens.map((token) => token.trim()))];
    const validTokens = normalizedTokens.filter(isExpoPushToken);
    const invalidStoredTokens = normalizedTokens.filter((token) => !isExpoPushToken(token));

    if (invalidStoredTokens.length > 0) {
      await User.updateOne(
        { _id: payload.userId },
        { $pull: { expoPushTokens: { $in: invalidStoredTokens } } },
      );
    }

    if (validTokens.length === 0) {
      return;
    }

    const response = await fetch(config.pushNotifications.expoSendUrl, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(
        validTokens.map<ExpoPushMessage>((token) => ({
          to: token,
          title: payload.title,
          body: payload.body,
          data: payload.data,
        })),
      ),
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.warn('Expo push send failed', response.status, responseText);
      return;
    }

    const result = (await response.json()) as ExpoPushResponse;
    const invalidReturnedTokens = collectInvalidTokens(validTokens, result.data ?? []);

    if (invalidReturnedTokens.length > 0) {
      await User.updateOne(
        { _id: payload.userId },
        { $pull: { expoPushTokens: { $in: invalidReturnedTokens } } },
      );
    }
  }
}

function buildHeaders() {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };

  if (config.pushNotifications.accessToken) {
    headers.Authorization = `Bearer ${config.pushNotifications.accessToken}`;
  }

  return headers;
}

function collectInvalidTokens(tokens: string[], results: ExpoPushResult[]) {
  const invalidTokens: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'error' && result.details?.error === 'DeviceNotRegistered') {
      invalidTokens.push(tokens[index]);
    }
  });

  return invalidTokens;
}

function isExpoPushToken(token: string) {
  return /^(Expo|Exponent)PushToken\[[^\]]+\]$/.test(token);
}
