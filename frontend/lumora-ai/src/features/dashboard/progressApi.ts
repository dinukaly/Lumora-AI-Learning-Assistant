import { apiSlice } from '@/app/apiSlice'

export interface LearningProgressSummary {
  totalDocuments: number
  documentsReady: number
  totalFlashcards: number
  flashcardsDue: number
  flashcardsReviewed: number
  totalQuizzes: number
  quizzesCompleted: number
  averageQuizScore: number
  totalChatMessages: number
}

export const progressApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getLearningProgress: builder.query<LearningProgressSummary, void>({
      query: () => '/learning/progress',
      providesTags: [{ type: 'Progress', id: 'SUMMARY' }],
    }),
  }),
})

export const { useGetLearningProgressQuery } = progressApi
