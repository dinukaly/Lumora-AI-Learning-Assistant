import User from '../users/user.model.js';
import { RegisterDTO, LoginDTO } from './auth.dto.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../common/utils/jwt.js';

export class AuthService {
  static async register(data: RegisterDTO) {
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
      throw new Error('User already exists');
    }

    const user = new User({
      name: data.name,
      email: data.email,
      passwordHash: data.password, // Will be hashed by pre-save hook
    });

    await user.save();

    const payload = { userId: user._id.toString(), role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      accessToken,
      refreshToken,
    };
  }

  static async login(data: LoginDTO) {
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

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      accessToken,
      refreshToken,
    };
  }

  static async refresh(token: string) {
    let payload: { userId: string; role: 'USER' | 'ADMIN' };

    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new Error('Invalid refresh token');
    }

    const user = await User.findById(payload.userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.disabledAt) {
      throw new Error('Account is disabled');
    }

    const newPayload = { userId: user._id.toString(), role: user.role };
    const accessToken = generateAccessToken(newPayload);
    const refreshToken = generateRefreshToken(newPayload);

    return { accessToken, refreshToken };
  }

  static async logout() {
    // In a stateless JWT setup, logout is handled by the client (deleting tokens).
    // For refresh token invalidation, we would need a database of valid tokens.
    // For now, we'll return success.
    return { message: 'Logged out successfully' };
  }
}
