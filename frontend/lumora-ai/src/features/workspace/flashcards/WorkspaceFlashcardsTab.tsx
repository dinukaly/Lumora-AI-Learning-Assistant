import type { DocumentData } from '@/features/documents/documentsApi'
import FlashcardsExperience from '@/features/learning/FlashcardsExperience'

interface WorkspaceFlashcardsTabProps {
  document: DocumentData
}

export function WorkspaceFlashcardsTab({ document }: WorkspaceFlashcardsTabProps) {
  return (
    <FlashcardsExperience
      documentId={document._id}
      documentTitle={document.title}
      documentStatus={document.status}
      embedded
    />
  )
}

export default WorkspaceFlashcardsTab
