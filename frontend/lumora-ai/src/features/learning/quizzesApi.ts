import { apiSlice } from '@/app/apiSlice'

export type QuizDifficulty = 'EASY' | 'MEDIUM' | 'HARD'

export interface QuizListItem {
  id: string
  documentId: string
  title: string
  questionCount: number
  createdBy: string
  createdAt: string
  latestScore?: number
  latestTotalQuestions?: number
  latestCompletedAt?: string
}

export interface QuizQuestion {
  id: number
  question: string
  options: string[]
}

export interface QuizDetail {
  id: string
  documentId: string
  title: string
  questions: QuizQuestion[]
  createdBy: string
  createdAt: string
}

export interface QuizSubmissionResult {
  attemptId: string
  score: number
  totalQuestions: number
  results: Array<{
    questionIndex: number
    selected: number
    correct: number
    explanation?: string
  }>
}

export const quizzesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listQuizzes: builder.query<{ quizzes: QuizListItem[] }, { documentId?: string } | void>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params?.documentId) searchParams.set('documentId', params.documentId)
        const qs = searchParams.toString()
        return `/learning/quizzes${qs ? `?${qs}` : ''}`
      },
      providesTags: (result) =>
        result
          ? [
              ...result.quizzes.map(({ id }) => ({ type: 'Quizzes' as const, id })),
              { type: 'Quizzes', id: 'LIST' },
            ]
          : [{ type: 'Quizzes', id: 'LIST' }],
    }),

    getQuiz: builder.query<QuizDetail, string>({
      query: (quizId) => `/learning/quizzes/${quizId}`,
      providesTags: (_result, _error, quizId) => [{ type: 'Quizzes', id: quizId }],
    }),

    submitQuiz: builder.mutation<QuizSubmissionResult, { quizId: string; answers: number[] }>({
      query: ({ quizId, answers }) => ({
        url: `/learning/quizzes/${quizId}/submit`,
        method: 'POST',
        body: { answers },
      }),
      invalidatesTags: (_result, _error, { quizId }) => [
        { type: 'Quizzes', id: quizId },
        { type: 'Quizzes', id: 'LIST' },
      ],
    }),

    generateQuiz: builder.mutation<
      { jobId: string; message: string },
      { documentId: string; questionCount?: number; difficulty?: QuizDifficulty; topic?: string }
    >({
      query: (body) => ({
        url: '/ai/generate-quiz',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Quizzes', id: 'LIST' }],
    }),
  }),
})

export const {
  useListQuizzesQuery,
  useGetQuizQuery,
  useSubmitQuizMutation,
  useGenerateQuizMutation,
} = quizzesApi
