import { useEffect, useRef, useState } from 'react'
import { Loader2, Plus, FileText, AlertCircle } from 'lucide-react'
import { useListDocumentsQuery, useUploadDocumentMutation, useDeleteDocumentMutation } from '@/features/documents/documentsApi'
import { DocumentCard } from '@/components/documents/DocumentCard'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

const DocumentsPage = () => {
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null)
  const [shouldPollDocuments, setShouldPollDocuments] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading, isError, refetch } = useListDocumentsQuery(undefined, {
    pollingInterval: shouldPollDocuments ? 5000 : 0,
    refetchOnFocus: true,
    refetchOnReconnect: true,
    skipPollingIfUnfocused: true,
  })
  const [uploadDocument, { isLoading: isUploading }] = useUploadDocumentMutation()
  const [deleteDocument, { isLoading: isDeleting }] = useDeleteDocumentMutation()

  useEffect(() => {
    const hasActiveDocument = data?.documents.some((document) =>
      document.status === 'UPLOADED' || document.status === 'PROCESSING',
    ) ?? false

    setShouldPollDocuments(hasActiveDocument)
  }, [data?.documents])

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)
    formData.append('title', file.name.replace(/\.[^/.]+$/, ''))

    try {
      await uploadDocument(formData).unwrap()
      setShouldPollDocuments(true)
      void refetch()
    } catch {
      // Error handling could show a toast in the future
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      await deleteDocument(deleteTarget.id).unwrap()
    } catch {
      // Error handling could show a toast in the future
    }
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your learning materials</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button onClick={handleUploadClick} disabled={isUploading}>
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Upload Document
              </>
            )}
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <AlertCircle className="h-12 w-12 text-red-400" />
          <p className="mt-4 text-sm">Failed to load documents. Please try again.</p>
        </div>
      )}

      {data && data.documents.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-20">
          <FileText className="h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-sm font-medium text-gray-600">No documents yet</h3>
          <p className="mt-1 text-xs text-gray-400">Upload your first PDF to get started</p>
          <Button variant="outline" className="mt-6" onClick={handleUploadClick}>
            <Plus className="h-4 w-4" />
            Upload Document
          </Button>
        </div>
      )}

      {data && data.documents.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {data.documents.map((doc) => (
            <DocumentCard
              key={doc._id}
              document={doc}
              onDelete={(id, title) => setDeleteTarget({ id, title })}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Document"
        description={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        confirmVariant="destructive"
      />
    </div>
  )
}

export default DocumentsPage
