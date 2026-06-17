import User from './user.model.js';
import { UpdateProfileDTO, ChangePasswordDTO } from './users.dto.js';

export class UsersService {
  static async getProfile(userId: string) {
    const user = await User.findById(userId).select('-passwordHash');
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  static async updateProfile(userId: string, data: UpdateProfileDTO) {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: data },
      { new: true, runValidators: true },
    ).select('-passwordHash');

    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  static async changePassword(userId: string, data: ChangePasswordDTO) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const isMatch = await user.comparePassword(data.currentPassword);
    if (!isMatch) {
      throw new Error('Current password is incorrect');
    }

    user.passwordHash = data.newPassword;
    await user.save();

    return { message: 'Password updated successfully' };
  }
}