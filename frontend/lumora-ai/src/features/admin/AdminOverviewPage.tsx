import { Activity, AlertTriangle, Bot, DollarSign, FileText, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatCard } from '@/components/dashboard/StatCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useGetAdminStatsQuery, useGetAdminUsageAnalyticsQuery, useListAdminJobsQuery, useListAdminUsersQuery } from './adminApi'
import AdminUsageChart from './AdminUsageChart'
import { formatCompactNumber, formatCurrency, formatDateTime } from './adminFormatting'

const AdminOverviewPage = () => {
  const { data: stats, isLoading: isStatsLoading } = useGetAdminStatsQuery()
  const { data: usageAnalytics, isLoading: isAnalyticsLoading } = useGetAdminUsageAnalyticsQuery({ granularity: 'day' })
  const { data: jobsData, isLoading: isJobsLoading } = useListAdminJobsQuery({
    status: 'FAILED',
    page: 1,
    limit: 5,
  })
  const { data: usersData, isLoading: isUsersLoading } = useListAdminUsersQuery({
    page: 1,
    limit: 5,
  })

  const statCards = [
    {
      icon: Users,
      label: 'Total Users',
      value: isStatsLoading ? '—' : stats?.totalUsers ?? 0,
      trend: stats ? { value: `${stats.activeUsers} active`, tone: 'positive' as const } : undefined,
      iconBgClass: 'bg-sky-100',
      iconColorClass: 'text-sky-600',
    },
    {
      icon: FileText,
      label: 'Documents',
      value: isStatsLoading ? '—' : stats?.totalDocuments ?? 0,
      trend: stats ? { value: `${stats.processingFailures} failed`, tone: 'negative' as const } : undefined,
      iconBgClass: 'bg-amber-100',
      iconColorClass: 'text-amber-600',
    },
    {
      icon: Bot,
      label: 'AI Requests',
      value: isStatsLoading ? '—' : formatCompactNumber(stats?.totalAIRequests ?? 0),
      trend: stats ? { value: `${formatCompactNumber(stats.totalTokensUsed)} tokens`, tone: 'neutral' as const } : undefined,
      iconBgClass: 'bg-emerald-100',
      iconColorClass: 'text-emerald-600',
    },
    {
      icon: DollarSign,
      label: 'Estimated Cost',
      value: isStatsLoading ? '—' : formatCurrency(stats?.estimatedCost ?? 0),
      trend: stats ? { value: `${stats.processingFailures} processing failures`, tone: 'negative' as const } : undefined,
      iconBgClass: 'bg-violet-100',
      iconColorClass: 'text-violet-600',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Usage Trend</CardTitle>
            <CardDescription>Recent request volume across recorded AI activity.</CardDescription>
          </CardHeader>
          <CardContent>
            {isAnalyticsLoading ? (
              <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
            ) : (
              <AdminUsageChart data={usageAnalytics?.data ?? []} metric="requests" granularity="day" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platform Snapshot</CardTitle>
            <CardDescription>Immediate operational checks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <SnapshotRow label="Active users" value={stats ? String(stats.activeUsers) : '—'} />
            <SnapshotRow label="Failed documents" value={stats ? String(stats.processingFailures) : '—'} />
            <SnapshotRow label="Total tokens used" value={stats ? formatCompactNumber(stats.totalTokensUsed) : '—'} />
            <SnapshotRow label="Estimated cost" value={stats ? formatCurrency(stats.estimatedCost) : '—'} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Recently Created Users</CardTitle>
              <CardDescription>Newest accounts entering the platform.</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/users">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {isUsersLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-lg bg-gray-100" />
                ))}
              </div>
            ) : usersData?.users.length ? (
              usersData.users.map((user) => (
                <div key={user.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
                    <p className="truncate text-xs text-gray-500">{user.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-gray-700">{user.role}</p>
                    <p className="text-xs text-gray-400">{formatDateTime(user.createdAt)}</p>
                  </div>
                </div>
              ))
            ) : (
              <EmptyCopy message="No users found." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Failed Jobs</CardTitle>
              <CardDescription>Jobs currently needing attention.</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/jobs">Open jobs</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {isJobsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-lg bg-gray-100" />
                ))}
              </div>
            ) : jobsData?.jobs.length ? (
              jobsData.jobs.map((job) => (
                <div key={job.id} className="rounded-lg border border-gray-200 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{job.type}</p>
                      <p className="truncate text-xs text-gray-500">
                        {job.document ? `${job.document.title} · ${job.document.owner.email}` : 'No document context'}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {job.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">{job.error ?? 'No error message recorded.'}</p>
                </div>
              ))
            ) : (
              <EmptyCopy message="No failed jobs right now." />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Operational Notes</CardTitle>
          <CardDescription>Quick links for routine admin actions.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <QuickLinkCard
            icon={Users}
            title="User controls"
            description="Search users, adjust roles, and disable accounts."
            href="/admin/users"
          />
          <QuickLinkCard
            icon={Activity}
            title="Job monitoring"
            description="Watch failures, inspect progress, and retry jobs."
            href="/admin/jobs"
          />
          <QuickLinkCard
            icon={Bot}
            title="Broadcast updates"
            description="Send one message to every user account in the system."
            href="/admin/notifications"
          />
        </CardContent>
      </Card>
    </div>
  )
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
      <span className="text-gray-600">{label}</span>
      <span className="font-semibold text-gray-900">{value}</span>
    </div>
  )
}

function EmptyCopy({ message }: { message: string }) {
  return <p className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">{message}</p>
}

function QuickLinkCard({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: typeof Users
  title: string
  description: string
  href: string
}) {
  return (
    <Link to={href} className="rounded-lg border border-gray-200 p-4 transition-colors hover:border-gray-300 hover:bg-gray-50">
      <div className="inline-flex rounded-lg bg-gray-100 p-2 text-gray-700">
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-sm font-medium text-gray-900">{title}</p>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </Link>
  )
}

export default AdminOverviewPage
