import { useState } from 'react'
import { FileWarning, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import AdminPagination from './AdminPagination'
import {
  type AdminDocumentStatus,
  useDeleteAdminDocumentMutation,
  useListAdminDocumentsQuery,
} from './adminApi'
import { formatDateTime, formatFileSize } from './adminFormatting'

const AdminDocumentsPage = () => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | AdminDocumentStatus>('ALL')
  const [ownerIdFilter, setOwnerIdFilter] = useState('')
  const [page, setPage] = useState(1)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const [documentToDelete, setDocumentToDelete] = useState<{ id: string; title: string } | null>(null)

  const { data, isLoading, isFetching } = useListAdminDocumentsQuery({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    ownerId: ownerIdFilter || undefined,
    page,
    limit: 10,
  })
  const [deleteDocument, { isLoading: isDeleting }] = useDeleteAdminDocumentMutation()

  const handleDelete = async () => {
    if (!documentToDelete) return

    setFeedback(null)

    try {
      await deleteDocument(documentToDelete.id).unwrap()
      setFeedback({ tone: 'success', message: 'Document and related artifacts deleted.' })
      setDocumentToDelete(null)
    } catch {
      setFeedback({ tone: 'error', message: 'Could not delete the document.' })
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Document Management</CardTitle>
          <CardDescription>Review content across all users and remove records that should no longer remain on the platform.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
            <label className="space-y-2 text-sm">
              <span className="font-medium text-gray-700">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as 'ALL' | AdminDocumentStatus)
                  setPage(1)
                }}
                className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-gray-400"
              >
                <option value="ALL">All statuses</option>
                <option value="UPLOADED">UPLOADED</option>
                <option value="PROCESSING">PROCESSING</option>
                <option value="READY">READY</option>
                <option value="FAILED">FAILED</option>
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-medium text-gray-700">Owner ID</span>
              <input
                value={ownerIdFilter}
                onChange={(event) => {
                  setOwnerIdFilter(event.target.value)
                  setPage(1)
                }}
                placeholder="Optional Mongo user id"
                className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none transition focus:border-gray-400"
              />
            </label>
          </div>

          {feedback && (
            <div className={`rounded-lg border px-4 py-3 text-sm ${feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
              {feedback.message}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Documents</CardTitle>
            <CardDescription>{isFetching ? 'Refreshing results…' : 'Cross-user document library view.'}</CardDescription>
          </div>
          <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            {data?.total ?? 0} total
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : data?.documents.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-[0.06em] text-gray-500">
                    <tr>
                      <th className="px-6 py-3">Document</th>
                      <th className="px-6 py-3">Owner</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Study Output</th>
                      <th className="px-6 py-3">Updated</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.documents.map((document) => (
                      <tr key={document.id} className="border-t border-gray-200 align-top">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900">{document.title}</p>
                            <p className="text-gray-500">{document.originalFileName}</p>
                            <p className="mt-1 text-xs text-gray-400">
                              {formatFileSize(document.fileSize)}{document.subjectTag ? ` · ${document.subjectTag}` : ''}
                            </p>
                            {document.processingError && (
                              <p className="mt-2 text-xs text-rose-600">{document.processingError}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-900">{document.owner.name}</p>
                          <p className="text-gray-500">{document.owner.email}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={statusBadgeClass(document.status)}>{document.status}</span>
                        </td>
                        <td className="px-6 py-4 text-gray-500">
                          <p>{document.flashcardCount ?? 0} flashcards</p>
                          <p>{document.quizCount ?? 0} quizzes</p>
                        </td>
                        <td className="px-6 py-4 text-gray-500">{formatDateTime(document.updatedAt)}</td>
                        <td className="px-6 py-4">
                          <div className="flex justify-end">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setDocumentToDelete({ id: document.id, title: document.title })}
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <AdminPagination
                page={data.page}
                totalPages={data.totalPages}
                total={data.total}
                onPageChange={setPage}
              />
            </>
          ) : (
            <div className="px-6 py-16 text-center">
              <FileWarning className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-gray-700">No documents matched the current filters.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(documentToDelete)}
        onClose={() => {
          if (!isDeleting) setDocumentToDelete(null)
        }}
        onConfirm={() => void handleDelete()}
        title="Delete document"
        description={`Delete "${documentToDelete?.title ?? ''}" and all related study data, jobs, and conversations.`}
        confirmLabel={isDeleting ? 'Deleting…' : 'Delete document'}
      />
    </div>
  )
}

function statusBadgeClass(status: AdminDocumentStatus) {
  const baseClass = 'inline-flex rounded-full px-2.5 py-1 text-xs font-medium'

  switch (status) {
    case 'READY':
      return `${baseClass} bg-emerald-50 text-emerald-700`
    case 'FAILED':
      return `${baseClass} bg-rose-50 text-rose-700`
    case 'PROCESSING':
      return `${baseClass} bg-amber-50 text-amber-700`
    default:
      return `${baseClass} bg-gray-100 text-gray-700`
  }
}

export default AdminDocumentsPage
