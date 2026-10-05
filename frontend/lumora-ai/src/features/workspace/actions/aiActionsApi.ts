import { apiSlice } from '@/app/apiSlice'

export interface AIActionsCitation {
  chunkId: string
  documentId: string
  pageNumber: number
  snippet: string
}

export interface SummaryArtifact {
  artifactId: string
  summary: string
  takeaways: string[]
  citations: AIActionsCitation[]
  sourceChunkIds: string[]
  createdAt: string
}

export interface ConceptsArtifact {
  artifactId: string
  concepts: Array<{
    title: string
    description: string
  }>
  citations: AIActionsCitation[]
  sourceChunkIds: string[]
  createdAt: string
}

export interface LatestAIActionsResponse {
  documentId: string
  summary: SummaryArtifact | null
  concepts: ConceptsArtifact | null
}

export interface ExplainConceptResponse {
  documentId: string
  topic: string
  explanation: string
  citations: AIActionsCitation[]
}

export const aiActionsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getLatestActions: builder.query<LatestAIActionsResponse, string>({
      query: (documentId) => `/ai/actions/latest?documentId=${documentId}`,
      providesTags: (_result, _error, documentId) => [{ type: 'AIActions', id: documentId }],
    }),

    summarizeDocument: builder.mutation<
      { documentId: string; summary: string; takeaways: string[]; citations: AIActionsCitation[] },
      { documentId: string }
    >({
      query: (body) => ({
        url: '/ai/summarize-document',
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { documentId }) => [{ type: 'AIActions', id: documentId }],
    }),

    extractConcepts: builder.mutation<
      {
        documentId: string
        concepts: Array<{ title: string; description: string }>
        citations: AIActionsCitation[]
      },
      { documentId: string }
    >({
      query: (body) => ({
        url: '/ai/extract-concepts',
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { documentId }) => [{ type: 'AIActions', id: documentId }],
    }),

    explainConcept: builder.mutation<
      ExplainConceptResponse,
      { documentId: string; topic: string }
    >({
      query: (body) => ({
        url: '/ai/explain-concept',
        method: 'POST',
        body,
      }),
    }),
  }),
})

export const {
  useGetLatestActionsQuery,
  useSummarizeDocumentMutation,
  useExtractConceptsMutation,
  useExplainConceptMutation,
} = aiActionsApi
