import { apiSlice } from '@/app/apiSlice'

export type AdminRole = 'USER' | 'ADMIN'
export type AdminDocumentStatus = 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED'
export type AdminJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'RETRYING'
export type AdminJobType =
  | 'TEXT_EXTRACTION'
  | 'CHUNKING_EMBEDDING'
  | 'SUMMARY_GENERATION'
  | 'FLASHCARD_GENERATION'
  | 'QUIZ_GENERATION'
export type UsageGranularity = 'day' | 'hour'

export interface AdminUserSummary {
  id: string
  name: string
  email: string
  role: AdminRole
  avatar?: string
  lastLoginAt?: string
  disabledAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminUsersResponse {
  users: AdminUserSummary[]
  total: number
  page: number
  totalPages: number
}

export interface AdminDocumentSummary {
  id: string
  title: string
  originalFileName: string
  status: AdminDocumentStatus
  pageCount?: number
  fileSize?: number
  subjectTag?: string
  processingError?: string
  flashcardCount?: number
  quizCount?: number
  owner: {
    id: string
    name: string
    email: string
    role: AdminRole
    disabledAt?: string | null
  }
  createdAt: string
  updatedAt: string
}

export interface AdminDocumentsResponse {
  documents: AdminDocumentSummary[]
  total: number
  page: number
  totalPages: number
}

export interface AdminJobSummary {
  id: string
  type: AdminJobType
  status: AdminJobStatus
  progress: number
  error?: string
  attempts: number
  bullJobId?: string
  createdAt: string
  updatedAt: string
  document?: {
    id: string
    title: string
    status: AdminDocumentStatus
    owner: {
      id: string
      name: string
      email: string
      role: AdminRole
    }
  }
}

export interface AdminJobsResponse {
  jobs: AdminJobSummary[]
  total: number
  page: number
  totalPages: number
}

export interface AdminStatsResponse {
  totalUsers: number
  activeUsers: number
  totalDocuments: number
  processingFailures: number
  totalAIRequests: number
  totalTokensUsed: number
  estimatedCost: number
}

export interface AdminUsageAnalyticsResponse {
  data: Array<{
    date: string
    requests: number
    tokens: number
    cost: number
  }>
}

export interface ListAdminUsersParams {
  search?: string
  role?: AdminRole
  page?: number
  limit?: number
}

export interface ListAdminDocumentsParams {
  status?: AdminDocumentStatus
  ownerId?: string
  page?: number
  limit?: number
}

export interface ListAdminJobsParams {
  status?: AdminJobStatus
  type?: AdminJobType
  page?: number
  limit?: number
}

export interface GetAdminUsageAnalyticsParams {
  from?: string
  to?: string
  granularity?: UsageGranularity
}

export const adminApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAdminStats: builder.query<AdminStatsResponse, void>({
      query: () => '/admin/stats',
      providesTags: [{ type: 'Admin', id: 'STATS' }],
    }),

    listAdminUsers: builder.query<AdminUsersResponse, ListAdminUsersParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params?.search) searchParams.set('search', params.search)
        if (params?.role) searchParams.set('role', params.role)
        if (params?.page) searchParams.set('page', String(params.page))
        if (params?.limit) searchParams.set('limit', String(params.limit))
        const qs = searchParams.toString()
        return `/admin/users${qs ? `?${qs}` : ''}`
      },
      providesTags: [{ type: 'Admin', id: 'USERS' }],
    }),

    updateAdminUserRole: builder.mutation<AdminUserSummary, { id: string; role: AdminRole }>({
      query: ({ id, role }) => ({
        url: `/admin/users/${id}/role`,
        method: 'PATCH',
        body: { role },
      }),
      invalidatesTags: [
        { type: 'Admin', id: 'USERS' },
        { type: 'Admin', id: 'STATS' },
      ],
    }),

    setAdminUserDisabled: builder.mutation<AdminUserSummary, { id: string; disabled: boolean }>({
      query: ({ id, disabled }) => ({
        url: `/admin/users/${id}/disable`,
        method: 'PATCH',
        body: { disabled },
      }),
      invalidatesTags: [
        { type: 'Admin', id: 'USERS' },
        { type: 'Admin', id: 'STATS' },
      ],
    }),

    listAdminDocuments: builder.query<AdminDocumentsResponse, ListAdminDocumentsParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params?.status) searchParams.set('status', params.status)
        if (params?.ownerId) searchParams.set('ownerId', params.ownerId)
        if (params?.page) searchParams.set('page', String(params.page))
        if (params?.limit) searchParams.set('limit', String(params.limit))
        const qs = searchParams.toString()
        return `/admin/documents${qs ? `?${qs}` : ''}`
      },
      providesTags: [{ type: 'Admin', id: 'DOCUMENTS' }],
    }),

    deleteAdminDocument: builder.mutation<{ message: string }, string>({
      query: (id) => ({
        url: `/admin/documents/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [
        { type: 'Admin', id: 'DOCUMENTS' },
        { type: 'Admin', id: 'JOBS' },
        { type: 'Admin', id: 'STATS' },
      ],
    }),

    listAdminJobs: builder.query<AdminJobsResponse, ListAdminJobsParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params?.status) searchParams.set('status', params.status)
        if (params?.type) searchParams.set('type', params.type)
        if (params?.page) searchParams.set('page', String(params.page))
        if (params?.limit) searchParams.set('limit', String(params.limit))
        const qs = searchParams.toString()
        return `/admin/jobs${qs ? `?${qs}` : ''}`
      },
      providesTags: [{ type: 'Admin', id: 'JOBS' }],
    }),

    retryAdminJob: builder.mutation<AdminJobSummary, string>({
      query: (id) => ({
        url: `/admin/jobs/${id}/retry`,
        method: 'POST',
      }),
      invalidatesTags: [{ type: 'Admin', id: 'JOBS' }],
    }),

    getAdminUsageAnalytics: builder.query<AdminUsageAnalyticsResponse, GetAdminUsageAnalyticsParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params?.from) searchParams.set('from', params.from)
        if (params?.to) searchParams.set('to', params.to)
        if (params?.granularity) searchParams.set('granularity', params.granularity)
        const qs = searchParams.toString()
        return `/admin/analytics/usage${qs ? `?${qs}` : ''}`
      },
      providesTags: [{ type: 'Admin', id: 'ANALYTICS' }],
    }),

    broadcastAdminNotification: builder.mutation<
      { message: string; createdCount: number },
      { title: string; body: string }
    >({
      query: (body) => ({
        url: '/admin/notifications/broadcast',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Notifications', id: 'LIST' }],
    }),
  }),
})

export const {
  useGetAdminStatsQuery,
  useListAdminUsersQuery,
  useUpdateAdminUserRoleMutation,
  useSetAdminUserDisabledMutation,
  useListAdminDocumentsQuery,
  useDeleteAdminDocumentMutation,
  useListAdminJobsQuery,
  useRetryAdminJobMutation,
  useGetAdminUsageAnalyticsQuery,
  useBroadcastAdminNotificationMutation,
} = adminApi
