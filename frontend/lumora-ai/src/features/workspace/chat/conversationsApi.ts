import { apiSlice } from '@/app/apiSlice'

export interface ConversationListItem {
  id: string
  documentId: string | null
  title: string
  messageCount: number
  updatedAt: string
  createdAt: string
}

export interface ConversationCitation {
  chunkId?: string
  documentId?: string
  pageNumber?: number
  snippet?: string
}

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  citations?: ConversationCitation[]
  tokenUsage?: {
    prompt?: number
    completion?: number
    total?: number
  }
  createdAt: string
}

export interface ConversationDetail {
  id: string
  documentId: string | null
  title: string
  contextSummary?: string
  messages: ConversationMessage[]
  updatedAt: string
  createdAt: string
}

interface ListConversationsResponse {
  conversations: ConversationListItem[]
  total: number
  page: number
  totalPages: number
}

interface ListConversationsParams {
  documentId?: string
  page?: number
  limit?: number
}

export const conversationsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listConversations: builder.query<ListConversationsResponse, ListConversationsParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params?.documentId) searchParams.set('documentId', params.documentId)
        if (params?.page) searchParams.set('page', String(params.page))
        if (params?.limit) searchParams.set('limit', String(params.limit))
        const qs = searchParams.toString()
        return `/conversations${qs ? `?${qs}` : ''}`
      },
      providesTags: (result) =>
        result
          ? [
              ...result.conversations.map(({ id }) => ({ type: 'Conversations' as const, id })),
              { type: 'Conversations', id: 'LIST' },
            ]
          : [{ type: 'Conversations', id: 'LIST' }],
    }),

    getConversation: builder.query<ConversationDetail, string>({
      query: (conversationId) => `/conversations/${conversationId}`,
      providesTags: (_result, _error, conversationId) => [{ type: 'Conversations', id: conversationId }],
    }),
  }),
})

export const { useListConversationsQuery, useGetConversationQuery } = conversationsApi
