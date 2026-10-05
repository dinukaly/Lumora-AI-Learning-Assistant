import { apiSlice } from '@/app/apiSlice'

export type FlashcardDifficulty = 'EASY' | 'MEDIUM' | 'HARD'

export interface FlashcardItem {
  id: string
  documentId: string
  front: string
  back: string
  difficulty: FlashcardDifficulty
  nextReviewAt: string
  reviewCount: number
  successCount: number
}

export interface FlashcardsListResponse {
  flashcards: FlashcardItem[]
  total: number
  page: number
  totalPages: number
}

export interface ListFlashcardsParams {
  documentId?: string
  dueOnly?: boolean
  page?: number
  limit?: number
}

export const flashcardsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listFlashcards: builder.query<FlashcardsListResponse, ListFlashcardsParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params?.documentId) searchParams.set('documentId', params.documentId)
        if (params?.dueOnly) searchParams.set('dueOnly', 'true')
        if (params?.page) searchParams.set('page', String(params.page))
        if (params?.limit) searchParams.set('limit', String(params.limit))
        const qs = searchParams.toString()
        return `/learning/flashcards${qs ? `?${qs}` : ''}`
      },
      providesTags: (result) =>
        result
          ? [
              ...result.flashcards.map(({ id }) => ({ type: 'Flashcards' as const, id })),
              { type: 'Flashcards', id: 'LIST' },
            ]
          : [{ type: 'Flashcards', id: 'LIST' }],
    }),

    reviewFlashcard: builder.mutation<
      { id: string; nextReviewAt: string; reviewCount: number; successCount: number },
      { id: string; difficulty: FlashcardDifficulty }
    >({
      query: ({ id, difficulty }) => ({
        url: `/learning/flashcards/${id}/review`,
        method: 'POST',
        body: { difficulty },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Flashcards', id },
        { type: 'Flashcards', id: 'LIST' },
      ],
    }),

    generateFlashcards: builder.mutation<
      { jobId: string; message: string },
      { documentId: string; count?: number; topic?: string }
    >({
      query: (body) => ({
        url: '/ai/generate-flashcards',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Flashcards', id: 'LIST' }],
    }),
  }),
})

export const {
  useListFlashcardsQuery,
  useReviewFlashcardMutation,
  useGenerateFlashcardsMutation,
} = flashcardsApi
