import { apiSlice } from '@/app/apiSlice'

export type DocumentStatus = 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED'

export interface DocumentData {
  _id: string
  ownerId: string
  title: string
  originalFileName: string
  storageUrl: string
  status: DocumentStatus
  pageCount?: number
  fileSize?: number
  subjectTag?: string
  processingError?: string
  flashcardCount?: number
  quizCount?: number
  createdAt: string
  updatedAt: string
}

interface DocumentDetailResponse {
  document: DocumentData
}

interface DocumentsListResponse {
  documents: DocumentData[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

interface ListDocumentsParams {
  page?: number
  limit?: number
  status?: DocumentStatus
}

export const documentsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listDocuments: builder.query<DocumentsListResponse, ListDocumentsParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params?.page) searchParams.set('page', String(params.page))
        if (params?.limit) searchParams.set('limit', String(params.limit))
        if (params?.status) searchParams.set('status', params.status)
        const qs = searchParams.toString()
        return `/documents${qs ? `?${qs}` : ''}`
      },
      providesTags: (result) =>
        result
          ? [
              ...result.documents.map(({ _id }) => ({ type: 'Documents' as const, id: _id })),
              { type: 'Documents', id: 'LIST' },
            ]
          : [{ type: 'Documents', id: 'LIST' }],
    }),

    getDocument: builder.query<DocumentData, string>({
      query: (id) => `/documents/${id}`,
      transformResponse: (response: DocumentDetailResponse) => response.document,
      providesTags: (_result, _error, id) => [{ type: 'Documents', id }],
    }),

    uploadDocument: builder.mutation<{ message: string; document: DocumentData }, FormData>({
      query: (formData) => ({
        url: '/documents/upload',
        method: 'POST',
        body: formData,
      }),
      invalidatesTags: [{ type: 'Documents', id: 'LIST' }],
    }),

    deleteDocument: builder.mutation<{ message: string }, string>({
      query: (id) => ({
        url: `/documents/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Documents', id: 'LIST' },
        { type: 'Documents', id },
      ],
    }),
  }),
})

export const {
  useListDocumentsQuery,
  useGetDocumentQuery,
  useUploadDocumentMutation,
  useDeleteDocumentMutation,
} = documentsApi
