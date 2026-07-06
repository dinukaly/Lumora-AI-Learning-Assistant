import { z } from 'zod';

const adminRoleSchema = z.enum(['USER', 'ADMIN']);

export const listAdminUsersSchema = z.object({
  search: z.string().trim().min(1).optional(),
  role: adminRoleSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateAdminUserRoleSchema = z.object({
  role: adminRoleSchema,
});

export const setAdminUserDisabledSchema = z.object({
  disabled: z.boolean().default(true),
});

export type ListAdminUsersDTO = z.infer<typeof listAdminUsersSchema>;
export type UpdateAdminUserRoleDTO = z.infer<typeof updateAdminUserRoleSchema>;
export type SetAdminUserDisabledDTO = z.infer<typeof setAdminUserDisabledSchema>;
