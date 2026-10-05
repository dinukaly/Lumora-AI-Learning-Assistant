import {
  Bell,
  BookOpenCheck,
  FileCheck2,
  FileWarning,
  ShieldAlert,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import type { NotificationItem } from './notificationsApi'

interface NotificationPresentation {
  icon: LucideIcon
  iconBgClass: string
  iconColorClass: string
}

export function getNotificationPresentation(type: NotificationItem['type']): NotificationPresentation {
  switch (type) {
    case 'DOCUMENT_READY':
      return {
        icon: FileCheck2,
        iconBgClass: 'bg-emerald-100',
        iconColorClass: 'text-emerald-600',
      }
    case 'PROCESSING_FAILED':
      return {
        icon: FileWarning,
        iconBgClass: 'bg-rose-100',
        iconColorClass: 'text-rose-600',
      }
    case 'FLASHCARDS_READY':
      return {
        icon: Sparkles,
        iconBgClass: 'bg-amber-100',
        iconColorClass: 'text-amber-600',
      }
    case 'QUIZ_READY':
      return {
        icon: BookOpenCheck,
        iconBgClass: 'bg-violet-100',
        iconColorClass: 'text-violet-600',
      }
    case 'ADMIN_BROADCAST':
      return {
        icon: ShieldAlert,
        iconBgClass: 'bg-slate-100',
        iconColorClass: 'text-slate-700',
      }
    default:
      return {
        icon: Bell,
        iconBgClass: 'bg-sky-100',
        iconColorClass: 'text-sky-600',
      }
  }
}

export function getNotificationTargetPath(notification: NotificationItem) {
  const documentId = typeof notification.metadata?.documentId === 'string'
    ? notification.metadata.documentId
    : null

  if (documentId) {
    return `/workspace/${documentId}`
  }

  if (notification.type === 'QUIZ_READY') {
    return '/quizzes'
  }

  if (notification.type === 'FLASHCARDS_READY') {
    return '/flashcards'
  }

  return '/dashboard'
}

export function formatRelativeTime(dateString: string) {
  const timestamp = new Date(dateString).getTime()
  if (Number.isNaN(timestamp)) {
    return 'Just now'
  }

  const diffMs = Date.now() - timestamp
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000))

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString))
}
