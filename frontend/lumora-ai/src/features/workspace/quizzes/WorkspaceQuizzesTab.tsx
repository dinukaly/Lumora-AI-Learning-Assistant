import type { DocumentData } from '@/features/documents/documentsApi'
import QuizzesExperience from '@/features/learning/QuizzesExperience'

interface WorkspaceQuizzesTabProps {
  document: DocumentData
}

export function WorkspaceQuizzesTab({ document }: WorkspaceQuizzesTabProps) {
  return (
    <QuizzesExperience
      documentId={document._id}
      documentTitle={document.title}
      documentStatus={document.status}
      embedded
    />
  )
}

export default WorkspaceQuizzesTab
