import { AlertCircle, BookOpen, FileText, GraduationCap, MessageSquare, Plus, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppSelector } from '@/app/hooks'
import { RecentActivity, type ActivityItem } from '@/components/dashboard/RecentActivity'
import { StatCard } from '@/components/dashboard/StatCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useGetLearningProgressQuery } from './progressApi'
import { useListNotificationsQuery } from '@/features/notifications/notificationsApi'
import { formatRelativeTime, getNotificationPresentation } from '@/features/notifications/notificationUi'

const DashboardPage = () => {
  const navigate = useNavigate()
  const user = useAppSelector((state) => state.auth.user)
  const {
    data: progress,
    isLoading: isProgressLoading,
    isError: isProgressError,
    refetch: refetchProgress,
  } = useGetLearningProgressQuery()
  const {
    data: notificationsData,
    isLoading: isNotificationsLoading,
  } = useListNotificationsQuery({ page: 1, limit: 5 })

  const activityItems: ActivityItem[] = (notificationsData?.notifications ?? []).map((notification) => {
    const presentation = getNotificationPresentation(notification.type)

    return {
      id: notification.id,
      icon: presentation.icon,
      iconBgClass: presentation.iconBgClass,
      iconColorClass: presentation.iconColorClass,
      title: notification.title,
      description: notification.body,
      time: formatRelativeTime(notification.createdAt),
    }
  })

  const progressCards = [
    {
      icon: FileText,
      label: 'Total Documents',
      value: isProgressLoading ? '—' : progress?.totalDocuments ?? 0,
      trend: progress
        ? { value: `${progress.documentsReady} ready`, tone: 'neutral' as const }
        : undefined,
      iconBgClass: 'bg-emerald-100',
      iconColorClass: 'text-emerald-600',
    },
    {
      icon: GraduationCap,
      label: 'Flashcards Reviewed',
      value: isProgressLoading ? '—' : progress?.flashcardsReviewed ?? 0,
      trend: progress
        ? {
            value: progress.flashcardsDue === 0 ? 'Nothing due right now' : `${progress.flashcardsDue} due now`,
            tone: progress.flashcardsDue === 0 ? 'positive' as const : 'neutral' as const,
          }
        : undefined,
      iconBgClass: 'bg-amber-100',
      iconColorClass: 'text-amber-600',
    },
    {
      icon: BookOpen,
      label: 'Quizzes Completed',
      value: isProgressLoading ? '—' : progress?.quizzesCompleted ?? 0,
      trend: progress
        ? { value: `${progress.averageQuizScore}% avg score`, tone: 'positive' as const }
        : undefined,
      iconBgClass: 'bg-violet-100',
      iconColorClass: 'text-violet-600',
    },
    {
      icon: MessageSquare,
      label: 'Chat Messages',
      value: isProgressLoading ? '—' : progress?.totalChatMessages ?? 0,
      trend: progress
        ? { value: `${progress.totalQuizzes} quizzes available`, tone: 'neutral' as const }
        : undefined,
      iconBgClass: 'bg-sky-100',
      iconColorClass: 'text-sky-600',
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.name ?? 'there'}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Here&apos;s your current learning progress and the latest system updates.
        </p>
      </div>

      {!user?.emailVerifiedAt && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-950">Verify your email to unlock learning features.</p>
                <p className="text-sm text-amber-800">
                  Your account works for profile access and verification management, but documents, AI tools, flashcards, and quizzes are still locked.
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate('/verify-email/pending')}>
              Open verification help
            </Button>
          </CardContent>
        </Card>
      )}

      {isProgressError && (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-rose-600" />
              <div>
                <p className="text-sm font-medium text-rose-900">Couldn&apos;t load your progress summary.</p>
                <p className="text-sm text-rose-700">Try refreshing the dashboard data and we&apos;ll pull it again.</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => void refetchProgress()}>
              Refresh progress
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {progressCards.map((card) => (
          <StatCard
            key={card.label}
            icon={card.icon}
            label={card.label}
            value={card.value}
            trend={card.trend}
            iconBgClass={card.iconBgClass}
            iconColorClass={card.iconColorClass}
          />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <RecentActivity
            title="Recent Notifications"
            items={activityItems}
            loading={isNotificationsLoading}
            emptyMessage="Notifications about document processing and study generation will appear here."
          />

          <Card>
            <CardHeader>
              <CardTitle>Learning Progress</CardTitle>
              <CardDescription>Keep an eye on readiness, review load, and study momentum.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <ProgressMetric
                label="Documents ready"
                value={
                  isProgressLoading
                    ? 'Loading…'
                    : `${progress?.documentsReady ?? 0} / ${progress?.totalDocuments ?? 0}`
                }
                description="Documents available for chat, flashcards, and quizzes."
              />
              <ProgressMetric
                label="Flashcards due"
                value={isProgressLoading ? 'Loading…' : String(progress?.flashcardsDue ?? 0)}
                description="Cards currently waiting for another review."
              />
              <ProgressMetric
                label="Total flashcards"
                value={isProgressLoading ? 'Loading…' : String(progress?.totalFlashcards ?? 0)}
                description="All cards generated across your learning materials."
              />
              <ProgressMetric
                label="Average quiz score"
                value={isProgressLoading ? 'Loading…' : `${progress?.averageQuizScore ?? 0}%`}
                description="Average score across completed quiz attempts."
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Jump back into learning</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full justify-start gap-2"
                variant="default"
                onClick={() => navigate(user?.emailVerifiedAt ? '/documents' : '/verify-email/pending')}
              >
                <Plus className="h-4 w-4" />
                {user?.emailVerifiedAt ? 'Upload or open documents' : 'Verify email to unlock documents'}
              </Button>
              <Button
                className="w-full justify-start gap-2"
                variant="outline"
                onClick={() => navigate(user?.emailVerifiedAt ? '/flashcards' : '/verify-email/pending')}
              >
                <Sparkles className="h-4 w-4" />
                {user?.emailVerifiedAt ? 'Review flashcards' : 'Unlock flashcards'}
              </Button>
              <Button
                className="w-full justify-start gap-2"
                variant="outline"
                onClick={() => navigate(user?.emailVerifiedAt ? '/quizzes' : '/verify-email/pending')}
              >
                <Sparkles className="h-4 w-4" />
                {user?.emailVerifiedAt ? 'Take a quiz' : 'Unlock quizzes'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Study Snapshot</CardTitle>
              <CardDescription>A quick read on your current workload.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <SnapshotRow
                label="Unread notifications"
                value={notificationsData?.unreadCount ?? 0}
              />
              <SnapshotRow
                label="Ready documents"
                value={progress?.documentsReady ?? 0}
              />
              <SnapshotRow
                label="Flashcards due"
                value={progress?.flashcardsDue ?? 0}
              />
              <SnapshotRow
                label="Chat messages"
                value={progress?.totalChatMessages ?? 0}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function ProgressMetric({
  label,
  value,
  description,
}: {
  label: string
  value: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
      <p className="mt-2 text-sm text-gray-500">{description}</p>
    </div>
  )
}

function SnapshotRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
      <span className="text-gray-600">{label}</span>
      <span className="font-semibold text-gray-900">{value}</span>
    </div>
  )
}

export default DashboardPage
