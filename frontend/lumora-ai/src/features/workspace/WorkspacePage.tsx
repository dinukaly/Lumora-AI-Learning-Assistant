import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { skipToken } from '@reduxjs/toolkit/query'
import {
  AlertCircle,
  BookOpen,
  Brain,
  ChevronLeft,
  FileText,
  Loader2,
  MessageSquare,
  NotebookTabs,
  Sparkles,
} from 'lucide-react'
import { useGetDocumentQuery, type DocumentData } from '@/features/documents/documentsApi'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type WorkspaceTabKey = 'content' | 'chat' | 'actions' | 'flashcards' | 'quizzes'

interface WorkspaceTab {
  key: WorkspaceTabKey
  label: string
  icon: typeof FileText
  description: string
}

const WORKSPACE_TABS: WorkspaceTab[] = [
  {
    key: 'content',
    label: 'Content',
    icon: FileText,
    description: 'View the original PDF and core document details.',
  },
  {
    key: 'chat',
    label: 'Chat',
    icon: MessageSquare,
    description: 'Ask grounded questions about this document.',
  },
  {
    key: 'actions',
    label: 'AI Actions',
    icon: Sparkles,
    description: 'Run summaries, concept extraction, and more.',
  },
  {
    key: 'flashcards',
    label: 'Flashcards',
    icon: BookOpen,
    description: 'Review cards generated from this document.',
  },
  {
    key: 'quizzes',
    label: 'Quizzes',
    icon: Brain,
    description: 'Take or generate quizzes based on the content.',
  },
]

const STATUS_STYLES: Record<DocumentData['status'], string> = {
  UPLOADED: 'bg-sky-100 text-sky-800',
  PROCESSING: 'bg-amber-100 text-amber-800',
  READY: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-800',
}

function formatFileSize(bytes?: number) {
  if (bytes == null) return 'Unknown'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function WorkspacePlaceholder({
  title,
  description,
  bullets,
}: {
  title: string
  description: string
  bullets: string[]
}) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-gray-600">
        {bullets.map((bullet) => (
          <div key={bullet} className="rounded-lg bg-gray-50 px-4 py-3">
            {bullet}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function WorkspaceContentTab({ document }: { document: DocumentData }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-gray-100">
          <CardTitle>PDF Viewer</CardTitle>
          <CardDescription>
            The original document is embedded below for quick reading and reference.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="aspect-[4/5] min-h-[32rem] w-full bg-gray-100">
            <iframe
              src={document.storageUrl}
              title={`${document.title} PDF viewer`}
              className="h-full w-full"
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Document Snapshot</CardTitle>
            <CardDescription>Fast context for the rest of the workspace tabs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-600">
            <div className="flex items-center justify-between">
              <span>Status</span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[document.status]}`}
              >
                {document.status}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Pages</span>
              <span>{document.pageCount ?? 'Pending'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>File size</span>
              <span>{formatFileSize(document.fileSize)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Uploaded</span>
              <span>{formatDate(document.createdAt)}</span>
            </div>
            {document.subjectTag && (
              <div className="flex items-center justify-between">
                <span>Subject</span>
                <span>{document.subjectTag}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {document.status === 'PROCESSING' && (
          <Card className="border-amber-200 bg-amber-50/70">
            <CardHeader>
              <CardTitle className="text-amber-900">Processing in progress</CardTitle>
              <CardDescription className="text-amber-800">
                The realtime bridge will keep this workspace fresh as the document finishes.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {document.status === 'FAILED' && document.processingError && (
          <Card className="border-red-200 bg-red-50/80">
            <CardHeader>
              <CardTitle className="text-red-900">Processing failed</CardTitle>
              <CardDescription className="text-red-800">
                {document.processingError}
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  )
}

export default function WorkspacePage() {
  const { documentId } = useParams<{ documentId: string }>()
  const [activeTab, setActiveTab] = useState<WorkspaceTabKey>('content')

  const { data: document, isLoading, isError } = useGetDocumentQuery(documentId ?? skipToken)

  const activeTabConfig = useMemo(
    () => WORKSPACE_TABS.find((tab) => tab.key === activeTab) ?? WORKSPACE_TABS[0],
    [activeTab],
  )

  if (!documentId) {
    return <Navigate to="/documents" replace />
  }

  let mainContent: React.ReactNode = null

  if (isLoading) {
    mainContent = (
      <div className="flex min-h-[26rem] items-center justify-center rounded-3xl border border-gray-200 bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    )
  } else if (isError || !document) {
    mainContent = (
      <Card className="border-red-200 bg-red-50/70">
        <CardContent className="flex min-h-[20rem] flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="h-10 w-10 text-red-500" />
          <div>
            <p className="text-base font-semibold text-red-900">Workspace unavailable</p>
            <p className="mt-1 text-sm text-red-800">
              We couldn&apos;t load this document. Please head back to the library and try again.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/documents">Back to documents</Link>
          </Button>
        </CardContent>
      </Card>
    )
  } else if (activeTab === 'content') {
    mainContent = <WorkspaceContentTab document={document} />
  } else if (activeTab === 'chat') {
    mainContent = (
      <WorkspacePlaceholder
        title="Chat tab is next"
        description="This workspace shell is ready for the grounded chat experience in the next task."
        bullets={[
          'Document-aware conversation UI will land in the Chat tab.',
          'Citations and grounded responses will connect here once the chat endpoint is implemented.',
        ]}
      />
    )
  } else if (activeTab === 'actions') {
    mainContent = (
      <WorkspacePlaceholder
        title="AI Actions are staged"
        description="Summary and extraction tools will plug into this panel in the upcoming workspace tasks."
        bullets={[
          'Quick actions will run summaries and concept extraction here.',
          'This area is intentionally reserved so the tabbed flow is in place now.',
        ]}
      />
    )
  } else if (activeTab === 'flashcards') {
    mainContent = (
      <WorkspacePlaceholder
        title="Flashcards tab prepared"
        description="Document-specific flashcard review will be added here during the learning-tools phase."
        bullets={[
          'Generated flashcards for this document will appear here.',
          'This keeps the document workspace stable before the learning APIs arrive.',
        ]}
      />
    )
  } else {
    mainContent = (
      <WorkspacePlaceholder
        title="Quizzes tab prepared"
        description="Quiz generation and review will connect into this tab in the next learning tasks."
        bullets={[
          'Document-specific quizzes will live here.',
          'The tab exists now so navigation and layout are already stable.',
        ]}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <Button asChild variant="ghost" size="sm" className="w-fit px-0 text-gray-500 hover:bg-transparent">
            <Link to="/documents">
              <ChevronLeft className="h-4 w-4" />
              Back to documents
            </Link>
          </Button>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                <NotebookTabs className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {document?.title ?? 'Document workspace'}
                </h1>
                <p className="text-sm text-gray-500">
                  Centralize reading, AI help, and study tools for a single document.
                </p>
              </div>
            </div>
          </div>
        </div>

        {document && (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[document.status]}`}
            >
              {document.status}
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
              {document.originalFileName}
            </span>
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Workspace Tabs</CardTitle>
            <CardDescription>{activeTabConfig.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {WORKSPACE_TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = tab.key === activeTab

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                    isActive
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 shadow-sm'
                      : 'border-transparent bg-gray-50 text-gray-700 hover:border-gray-200 hover:bg-white'
                  }`}
                >
                  <Icon className={`mt-0.5 h-4 w-4 ${isActive ? 'text-emerald-700' : 'text-gray-400'}`} />
                  <div>
                    <div className="text-sm font-semibold">{tab.label}</div>
                    <div className="mt-1 text-xs leading-relaxed text-gray-500">{tab.description}</div>
                  </div>
                </button>
              )
            })}
          </CardContent>
        </Card>

        <div>{mainContent}</div>
      </div>
    </div>
  )
}
