import User, { IUser } from '../users/user.model.js';
import type {
  ListAdminUsersDTO,
  SetAdminUserDisabledDTO,
  UpdateAdminUserRoleDTO,
} from './admin.dto.js';

type AdminUserSummary = {
  id: string;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
  avatar?: string;
  lastLoginAt?: Date;
  disabledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type AdminUserListResult = {
  users: AdminUserSummary[];
  total: number;
  page: number;
  totalPages: number;
};

export class AdminService {
  static async listUsers(query: ListAdminUsersDTO): Promise<AdminUserListResult> {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};

    if (query.role) {
      filter.role = query.role;
    }

    if (query.search) {
      const searchRegex = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-passwordHash')
        .lean(),
      User.countDocuments(filter),
    ]);

    return {
      users: users.map(mapAdminUserSummary),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  static async updateUserRole(
    adminUserId: string,
    targetUserId: string,
    data: UpdateAdminUserRoleDTO,
  ): Promise<AdminUserSummary> {
    const user = await User.findById(targetUserId).select('-passwordHash');
    if (!user) {
      throw new Error('User not found');
    }

    if (user.id === adminUserId && data.role !== 'ADMIN') {
      throw new Error('Admins cannot remove their own admin role');
    }

    user.role = data.role;
    await user.save();

    return mapAdminUserSummary(user.toObject());
  }

  static async setUserDisabled(
    adminUserId: string,
    targetUserId: string,
    data: SetAdminUserDisabledDTO,
  ): Promise<AdminUserSummary> {
    const user = await User.findById(targetUserId).select('-passwordHash');
    if (!user) {
      throw new Error('User not found');
    }

    if (user.id === adminUserId && data.disabled) {
      throw new Error('Admins cannot disable their own account');
    }

    user.disabledAt = data.disabled ? user.disabledAt ?? new Date() : null;
    await user.save();

    return mapAdminUserSummary(user.toObject());
  }
}

function mapAdminUserSummary(user: Omit<IUser, 'comparePassword'> | Record<string, unknown>): AdminUserSummary {
  return {
    id: String(user._id),
    name: String(user.name),
    email: String(user.email),
    role: user.role as 'USER' | 'ADMIN',
    avatar: user.avatar ? String(user.avatar) : undefined,
    lastLoginAt: user.lastLoginAt ? new Date(String(user.lastLoginAt)) : undefined,
    disabledAt: user.disabledAt ? new Date(String(user.disabledAt)) : null,
    createdAt: new Date(String(user.createdAt)),
    updatedAt: new Date(String(user.updatedAt)),
  };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
