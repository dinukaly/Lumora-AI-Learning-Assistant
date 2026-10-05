import { apiSlice } from '@/app/apiSlice'

export type NotificationType =
  | 'DOCUMENT_READY'
  | 'PROCESSING_FAILED'
  | 'FLASHCARDS_READY'
  | 'QUIZ_READY'
  | 'SYSTEM'
  | 'ADMIN_BROADCAST'

export interface NotificationItem {
  id: string
  type: NotificationType | string
  title: string
  body: string
  metadata?: Record<string, unknown>
  readAt: string | null
  createdAt: string
}

export interface ListNotificationsParams {
  unreadOnly?: boolean
  page?: number
  limit?: number
}

export interface NotificationsListResponse {
  notifications: NotificationItem[]
  unreadCount: number
  total: number
  page: number
  totalPages: number
}

export const notificationsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listNotifications: builder.query<NotificationsListResponse, ListNotificationsParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params?.unreadOnly) searchParams.set('unreadOnly', 'true')
        if (params?.page) searchParams.set('page', String(params.page))
        if (params?.limit) searchParams.set('limit', String(params.limit))
        const qs = searchParams.toString()
        return `/notifications${qs ? `?${qs}` : ''}`
      },
      providesTags: (result) =>
        result
          ? [
              ...result.notifications.map(({ id }) => ({ type: 'Notifications' as const, id })),
              { type: 'Notifications', id: 'LIST' },
            ]
          : [{ type: 'Notifications', id: 'LIST' }],
    }),

    markNotificationRead: builder.mutation<{ id: string; readAt: string }, string>({
      query: (notificationId) => ({
        url: `/notifications/${notificationId}/read`,
        method: 'PATCH',
      }),
      invalidatesTags: (_result, _error, notificationId) => [
        { type: 'Notifications', id: notificationId },
        { type: 'Notifications', id: 'LIST' },
      ],
    }),

    markAllNotificationsRead: builder.mutation<{ message: string }, void>({
      query: () => ({
        url: '/notifications/read-all',
        method: 'PATCH',
      }),
      invalidatesTags: [{ type: 'Notifications', id: 'LIST' }],
    }),
  }),
})

export const {
  useListNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} = notificationsApi
