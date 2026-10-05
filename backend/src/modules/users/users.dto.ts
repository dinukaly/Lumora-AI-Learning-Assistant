import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  avatar: z.string().url().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});

const expoPushTokenSchema = z
  .string()
  .trim()
  .regex(/^(Expo|Exponent)PushToken\[[^\]]+\]$/, 'Token must be a valid Expo push token');

export const registerPushTokenSchema = z.object({
  token: expoPushTokenSchema,
});

export const removePushTokenSchema = z.object({
  token: expoPushTokenSchema,
});

export type UpdateProfileDTO = z.infer<typeof updateProfileSchema>;
export type ChangePasswordDTO = z.infer<typeof changePasswordSchema>;
export type RegisterPushTokenDTO = z.infer<typeof registerPushTokenSchema>;
export type RemovePushTokenDTO = z.infer<typeof removePushTokenSchema>;
