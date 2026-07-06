import mongoose from 'mongoose';
import User, { IUser } from '../users/user.model.js';
import Document, { DocumentStatus } from '../documents/document.model.js';
import JobModel, { JobStatus, JobType } from '../jobs/job.model.js';
import UsageEvent from '../analytics/usage-event.model.js';
import { DocumentsService } from '../documents/documents.service.js';
import { retryStoredJob } from '../../common/queue/index.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type {
  BroadcastAdminNotificationDTO,
  GetAdminUsageAnalyticsDTO,
  ListAdminDocumentsDTO,
  ListAdminJobsDTO,
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

type AdminDocumentSummary = {
  id: string;
  title: string;
  originalFileName: string;
  status: DocumentStatus;
  pageCount?: number;
  fileSize?: number;
  subjectTag?: string;
  processingError?: string;
  flashcardCount?: number;
  quizCount?: number;
  owner: {
    id: string;
    name: string;
    email: string;
    role: 'USER' | 'ADMIN';
    disabledAt?: Date | null;
  };
  createdAt: Date;
  updatedAt: Date;
};

type AdminDocumentListResult = {
  documents: AdminDocumentSummary[];
  total: number;
  page: number;
  totalPages: number;
};

type AdminJobSummary = {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  error?: string;
  attempts: number;
  bullJobId?: string;
  createdAt: Date;
  updatedAt: Date;
  document?: {
    id: string;
    title: string;
    status: DocumentStatus;
    owner: {
      id: string;
      name: string;
      email: string;
      role: 'USER' | 'ADMIN';
    };
  };
};

type AdminJobListResult = {
  jobs: AdminJobSummary[];
  total: number;
  page: number;
  totalPages: number;
};

type AdminStatsResult = {
  totalUsers: number;
  activeUsers: number;
  totalDocuments: number;
  processingFailures: number;
  totalAIRequests: number;
  totalTokensUsed: number;
  estimatedCost: number;
};

type AdminUsageAnalyticsResult = {
  data: Array<{
    date: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;
};

type AdminBroadcastResult = {
  message: string;
  createdCount: number;
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

  static async listDocuments(query: ListAdminDocumentsDTO): Promise<AdminDocumentListResult> {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};

    if (query.status) {
      filter.status = query.status;
    }

    if (query.ownerId) {
      if (!mongoose.Types.ObjectId.isValid(query.ownerId)) {
        throw new Error('Invalid owner ID');
      }

      filter.ownerId = new mongoose.Types.ObjectId(query.ownerId);
    }

    const [documents, total] = await Promise.all([
      Document.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-extractedText -extractedPages')
        .populate('ownerId', 'name email role disabledAt')
        .lean(),
      Document.countDocuments(filter),
    ]);

    return {
      documents: documents.map(mapAdminDocumentSummary),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  static async deleteDocument(documentId: string) {
    return DocumentsService.deleteDocumentAsAdmin(documentId);
  }

  static async listJobs(query: ListAdminJobsDTO): Promise<AdminJobListResult> {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};

    if (query.status) {
      filter.status = query.status;
    }

    if (query.type) {
      filter.type = query.type;
    }

    const [jobs, total] = await Promise.all([
      JobModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'documentId',
          select: 'title status ownerId',
          populate: {
            path: 'ownerId',
            select: 'name email role',
          },
        })
        .lean(),
      JobModel.countDocuments(filter),
    ]);

    return {
      jobs: jobs.map(mapAdminJobSummary),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  static async retryJob(jobId: string): Promise<AdminJobSummary> {
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      throw new Error('Invalid job ID');
    }

    const job = await JobModel.findById(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    if (job.status !== 'FAILED') {
      throw new Error('Only failed jobs can be retried');
    }

    const retriedJob = await retryStoredJob(job);
    const populatedJob = await JobModel.findById(retriedJob._id)
      .populate({
        path: 'documentId',
        select: 'title status ownerId',
        populate: {
          path: 'ownerId',
          select: 'name email role',
        },
      })
      .lean();

    if (!populatedJob) {
      throw new Error('Job not found');
    }

    return mapAdminJobSummary(populatedJob);
  }

  static async getStats(): Promise<AdminStatsResult> {
    const activeThreshold = new Date();
    activeThreshold.setDate(activeThreshold.getDate() - 30);

    const [
      totalUsers,
      activeUsers,
      totalDocuments,
      processingFailures,
      usageSummary,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({
        disabledAt: null,
        lastLoginAt: { $gte: activeThreshold },
      }),
      Document.countDocuments(),
      Document.countDocuments({ status: 'FAILED' }),
      UsageEvent.aggregate<{ _id: null; totalRequests: number; totalTokens: number; totalCost: number }>([
        {
          $group: {
            _id: null,
            totalRequests: { $sum: 1 },
            totalTokens: { $sum: '$tokensUsed' },
            totalCost: { $sum: { $ifNull: ['$costEstimate', 0] } },
          },
        },
      ]),
    ]);

    return {
      totalUsers,
      activeUsers,
      totalDocuments,
      processingFailures,
      totalAIRequests: usageSummary[0]?.totalRequests ?? 0,
      totalTokensUsed: usageSummary[0]?.totalTokens ?? 0,
      estimatedCost: Number(((usageSummary[0]?.totalCost ?? 0) as number).toFixed(4)),
    };
  }

  static async getUsageAnalytics(query: GetAdminUsageAnalyticsDTO): Promise<AdminUsageAnalyticsResult> {
    const { from, to, granularity } = query;
    const range = resolveUsageAnalyticsRange(from, to);
    const format = granularity === 'hour' ? '%Y-%m-%dT%H:00:00.000Z' : '%Y-%m-%d';

    const data = await UsageEvent.aggregate<{
      _id: string;
      requests: number;
      tokens: number;
      cost: number;
    }>([
      {
        $match: {
          createdAt: {
            $gte: range.from,
            $lte: range.to,
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format,
              date: '$createdAt',
              timezone: 'UTC',
            },
          },
          requests: { $sum: 1 },
          tokens: { $sum: '$tokensUsed' },
          cost: { $sum: { $ifNull: ['$costEstimate', 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return {
      data: data.map((entry) => ({
        date: entry._id,
        requests: entry.requests,
        tokens: entry.tokens,
        cost: Number(entry.cost.toFixed(4)),
      })),
    };
  }

  static async broadcastNotification(
    input: BroadcastAdminNotificationDTO,
    adminUserId: string,
  ): Promise<AdminBroadcastResult> {
    const result = await NotificationsService.broadcastAdminNotification({
      title: input.title,
      body: input.body,
      metadata: {
        createdBy: adminUserId,
      },
    });

    return {
      message: 'Broadcast notification sent successfully',
      createdCount: result.createdCount,
    };
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

function mapAdminDocumentSummary(document: Record<string, unknown>): AdminDocumentSummary {
  const owner = asRecord(document.ownerId);

  return {
    id: String(document._id),
    title: String(document.title),
    originalFileName: String(document.originalFileName),
    status: document.status as DocumentStatus,
    pageCount: typeof document.pageCount === 'number' ? document.pageCount : undefined,
    fileSize: typeof document.fileSize === 'number' ? document.fileSize : undefined,
    subjectTag: typeof document.subjectTag === 'string' ? document.subjectTag : undefined,
    processingError: typeof document.processingError === 'string' ? document.processingError : undefined,
    flashcardCount: typeof document.flashcardCount === 'number' ? document.flashcardCount : undefined,
    quizCount: typeof document.quizCount === 'number' ? document.quizCount : undefined,
    owner: {
      id: String(owner?._id),
      name: String(owner?.name),
      email: String(owner?.email),
      role: owner?.role as 'USER' | 'ADMIN',
      disabledAt: owner?.disabledAt ? new Date(String(owner.disabledAt)) : null,
    },
    createdAt: new Date(String(document.createdAt)),
    updatedAt: new Date(String(document.updatedAt)),
  };
}

function mapAdminJobSummary(job: Record<string, unknown>): AdminJobSummary {
  const document = asRecord(job.documentId);
  const owner = asRecord(document?.ownerId);

  return {
    id: String(job._id),
    type: job.type as JobType,
    status: job.status as JobStatus,
    progress: typeof job.progress === 'number' ? job.progress : 0,
    error: typeof job.error === 'string' ? job.error : undefined,
    attempts: typeof job.attempts === 'number' ? job.attempts : 0,
    bullJobId: typeof job.bullJobId === 'string' ? job.bullJobId : undefined,
    createdAt: new Date(String(job.createdAt)),
    updatedAt: new Date(String(job.updatedAt)),
    document: document
      ? {
          id: String(document._id),
          title: String(document.title),
          status: document.status as DocumentStatus,
          owner: {
            id: String(owner?._id),
            name: String(owner?.name),
            email: String(owner?.email),
            role: owner?.role as 'USER' | 'ADMIN',
          },
        }
      : undefined,
  };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function resolveUsageAnalyticsRange(from?: string, to?: string) {
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  const parsedFrom = from ? new Date(from) : defaultFrom;
  const parsedTo = to ? new Date(to) : now;

  if (Number.isNaN(parsedFrom.getTime()) || Number.isNaN(parsedTo.getTime())) {
    throw new Error('Invalid date range');
  }

  if (parsedFrom > parsedTo) {
    throw new Error('"from" must be less than or equal to "to"');
  }

  return { from: parsedFrom, to: parsedTo };
}
