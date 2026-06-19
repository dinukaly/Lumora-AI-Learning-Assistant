import { FileText, Loader2, AlertCircle, CheckCircle2, Upload, Trash2 } from 'lucide-react'
import type { DocumentData, DocumentStatus } from '@/features/documents/documentsApi'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const STATUS_CONFIG: Record<DocumentStatus, { label: string; bgClass: string; textClass: string; icon: typeof Upload }> = {
  UPLOADED: { label: 'Uploaded', bgClass: 'bg-blue-100', textClass: 'text-blue-700', icon: Upload },
  PROCESSING: { label: 'Processing', bgClass: 'bg-amber-100', textClass: 'text-amber-700', icon: Loader2 },
  READY: { label: 'Ready', bgClass: 'bg-emerald-100', textClass: 'text-emerald-700', icon: CheckCircle2 },
  FAILED: { label: 'Failed', bgClass: 'bg-red-100', textClass: 'text-red-700', icon: AlertCircle },
}

function formatFileSize(bytes?: number): string {
  if (bytes == null) return 'Unknown'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface DocumentCardProps {
  document: DocumentData
  onDelete: (id: string, title: string) => void
}

const DocumentCard = ({ document, onDelete }: DocumentCardProps) => {
  const statusCfg = STATUS_CONFIG[document.status]
  const StatusIcon = statusCfg.icon

  return (
    <Card className="group transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-gray-100 p-2.5">
            <FileText className="h-5 w-5 text-gray-500" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-gray-900">{document.title}</h3>
            <p className="mt-0.5 truncate text-xs text-gray-500">{document.originalFileName}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
            onClick={() => onDelete(document._id, document.title)}
            title="Delete document"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.bgClass} ${statusCfg.textClass}`}>
            <StatusIcon className={`h-3 w-3 ${document.status === 'PROCESSING' ? 'animate-spin' : ''}`} />
            {statusCfg.label}
          </span>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>{formatFileSize(document.fileSize)}</span>
            <span>{formatDate(document.createdAt)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export { DocumentCard }