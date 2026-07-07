import User from '../users/user.model.js';
import { RegisterDTO, LoginDTO } from './auth.dto.js';
import AuthIdentity from './auth-identity.model.js';
import {
  RefreshSessionService,
  type RefreshSessionContext,
  isRefreshSessionRevoked,
} from './refresh-session.service.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../common/utils/jwt.js';

function mapAuthUser(user: {
  _id: { toString(): string };
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
}) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export class AuthService {
  static async register(data: RegisterDTO, context?: RefreshSessionContext) {
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
      throw new Error('User already exists');
    }

    const user = new User({
      name: data.name,
      email: data.email,
      passwordHash: data.password,
      authProviderSummary: ['local'],
    });

    await user.save();
    await AuthIdentity.create({
      userId: user._id,
      provider: 'local',
      emailAtProvider: user.email,
      emailVerifiedAtProvider: false,
    });

    const payload = { userId: user._id.toString(), role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    await RefreshSessionService.createSession({
      userId: user._id,
      refreshToken,
      ...context,
    });

    return {
      user: mapAuthUser(user),
      accessToken,
      refreshToken,
    };
  }

  static async login(data: LoginDTO, context?: RefreshSessionContext) {
    const user = await User.findOne({ email: data.email });
    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (user.disabledAt) {
      throw new Error('Account is disabled');
    }

    const isMatch = await user.comparePassword(data.password);
    if (!isMatch) {
      throw new Error('Invalid credentials');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const payload = { userId: user._id.toString(), role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    await RefreshSessionService.createSession({
      userId: user._id,
      refreshToken,
      ...context,
    });

    return {
      user: mapAuthUser(user),
      accessToken,
      refreshToken,
    };
  }

  static async refresh(token: string, context?: RefreshSessionContext) {
    const session = await RefreshSessionService.findSessionByToken(token);
    if (!session) {
      throw new Error('Invalid refresh token');
    }

    if (isRefreshSessionRevoked(session)) {
      await RefreshSessionService.revokeFamily(session.familyId, 'REUSED');
      throw new Error('Refresh token reuse detected');
    }

    let payload: { userId: string; role: 'USER' | 'ADMIN' };

    try {
      payload = verifyRefreshToken(token);
    } catch {
      await RefreshSessionService.revokeSession(session._id, 'ROTATED');
      throw new Error('Invalid refresh token');
    }

    const user = await User.findById(payload.userId);
    if (!user) {
      await RefreshSessionService.revokeFamily(session.familyId, 'REUSED');
      throw new Error('User not found');
    }

    if (user.disabledAt) {
      await RefreshSessionService.revokeUserSessions(user._id, 'ACCOUNT_DISABLED');
      throw new Error('Account is disabled');
    }

    const newPayload = { userId: user._id.toString(), role: user.role };
    const accessToken = generateAccessToken(newPayload);
    const refreshToken = generateRefreshToken(newPayload);
    const nextSession = await RefreshSessionService.createSession({
      userId: user._id,
      familyId: session.familyId,
      refreshToken,
      ...context,
    });

    await RefreshSessionService.revokeSession(session._id, 'ROTATED', {
      replacedBySessionId: nextSession._id,
    });

    return { accessToken, refreshToken };
  }

  static async logout(refreshToken?: string | null) {
    if (refreshToken) {
      await RefreshSessionService.revokeSessionByToken(refreshToken, 'LOGOUT');
    }

    return { message: 'Logged out successfully' };
  }
}
