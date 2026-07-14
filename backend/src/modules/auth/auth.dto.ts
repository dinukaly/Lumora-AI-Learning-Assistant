import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(8),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const refreshSchema = z.object({
  refreshToken: z.string(),
});

export const verifyEmailQuerySchema = z.object({
  token: z.string().min(1),
});

export const mobileGoogleOauthStartQuerySchema = z.object({
  callbackUrl: z.string().min(1),
});

export type RegisterDTO = z.infer<typeof registerSchema>;
export type LoginDTO = z.infer<typeof loginSchema>;
export type RefreshDTO = z.infer<typeof refreshSchema>;
export type VerifyEmailQueryDTO = z.infer<typeof verifyEmailQuerySchema>;
export type MobileGoogleOauthStartQueryDTO = z.infer<typeof mobileGoogleOauthStartQuerySchema>;
