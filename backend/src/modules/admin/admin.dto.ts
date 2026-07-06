import { z } from 'zod';

const adminRoleSchema = z.enum(['USER', 'ADMIN']);
const documentStatusSchema = z.enum(['UPLOADED', 'PROCESSING', 'READY', 'FAILED']);
const jobStatusSchema = z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRYING']);
const jobTypeSchema = z.enum([
  'TEXT_EXTRACTION',
  'CHUNKING_EMBEDDING',
  'SUMMARY_GENERATION',
  'FLASHCARD_GENERATION',
  'QUIZ_GENERATION',
]);
const usageGranularitySchema = z.enum(['day', 'hour']);

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

export const listAdminDocumentsSchema = z.object({
  status: documentStatusSchema.optional(),
  ownerId: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listAdminJobsSchema = z.object({
  status: jobStatusSchema.optional(),
  type: jobTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const getAdminUsageAnalyticsSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  granularity: usageGranularitySchema.default('day'),
});

export const broadcastAdminNotificationSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1000),
});

export type ListAdminUsersDTO = z.infer<typeof listAdminUsersSchema>;
export type UpdateAdminUserRoleDTO = z.infer<typeof updateAdminUserRoleSchema>;
export type SetAdminUserDisabledDTO = z.infer<typeof setAdminUserDisabledSchema>;
export type ListAdminDocumentsDTO = z.infer<typeof listAdminDocumentsSchema>;
export type ListAdminJobsDTO = z.infer<typeof listAdminJobsSchema>;
export type GetAdminUsageAnalyticsDTO = z.infer<typeof getAdminUsageAnalyticsSchema>;
export type BroadcastAdminNotificationDTO = z.infer<typeof broadcastAdminNotificationSchema>;
