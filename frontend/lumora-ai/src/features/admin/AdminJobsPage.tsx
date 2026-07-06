import { useState } from 'react'
import { RotateCcw, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import AdminPagination from './AdminPagination'
import {
  type AdminJobStatus,
  type AdminJobType,
  useListAdminJobsQuery,
  useRetryAdminJobMutation,
} from './adminApi'
import { formatDateTime } from './adminFormatting'

const AdminJobsPage = () => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | AdminJobStatus>('ALL')
  const [typeFilter, setTypeFilter] = useState<'ALL' | AdminJobType>('ALL')
  const [page, setPage] = useState(1)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)

  const { data, isLoading, isFetching } = useListAdminJobsQuery({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    type: typeFilter === 'ALL' ? undefined : typeFilter,
    page,
    limit: 10,
  })
  const [retryJob] = useRetryAdminJobMutation()

  const handleRetry = async (jobId: string) => {
    setFeedback(null)
    setActiveJobId(jobId)

    try {
      await retryJob(jobId).unwrap()
      setFeedback({ tone: 'success', message: 'Job re-queued successfully.' })
    } catch {
      setFeedback({ tone: 'error', message: 'Could not retry that job.' })
    } finally {
      setActiveJobId(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Job Monitor</CardTitle>
          <CardDescription>Track queue health, inspect failures, and re-queue failed jobs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="font-medium text-gray-700">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as 'ALL' | AdminJobStatus)
                  setPage(1)
                }}
                className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-gray-400"
              >
                <option value="ALL">All statuses</option>
                <option value="QUEUED">QUEUED</option>
                <option value="RUNNING">RUNNING</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="FAILED">FAILED</option>
                <option value="RETRYING">RETRYING</option>
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-medium text-gray-700">Type</span>
              <select
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value as 'ALL' | AdminJobType)
                  setPage(1)
                }}
                className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-gray-400"
              >
                <option value="ALL">All types</option>
                <option value="TEXT_EXTRACTION">TEXT_EXTRACTION</option>
                <option value="CHUNKING_EMBEDDING">CHUNKING_EMBEDDING</option>
                <option value="SUMMARY_GENERATION">SUMMARY_GENERATION</option>
                <option value="FLASHCARD_GENERATION">FLASHCARD_GENERATION</option>
                <option value="QUIZ_GENERATION">QUIZ_GENERATION</option>
              </select>
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
            <CardTitle>Jobs</CardTitle>
            <CardDescription>{isFetching ? 'Refreshing results…' : 'Live backend queue state.'}</CardDescription>
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
          ) : data?.jobs.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-[0.06em] text-gray-500">
                    <tr>
                      <th className="px-6 py-3">Job</th>
                      <th className="px-6 py-3">Document</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Attempts</th>
                      <th className="px-6 py-3">Updated</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobs.map((job) => {
                      const isRetryable = job.status === 'FAILED'
                      const isBusy = activeJobId === job.id

                      return (
                        <tr key={job.id} className="border-t border-gray-200 align-top">
                          <td className="px-6 py-4">
                            <div>
                              <p className="font-medium text-gray-900">{job.type}</p>
                              <p className="text-gray-500">Progress: {job.progress}%</p>
                              {job.error && <p className="mt-2 text-xs text-rose-600">{job.error}</p>}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {job.document ? (
                              <div>
                                <p className="font-medium text-gray-900">{job.document.title}</p>
                                <p className="text-gray-500">{job.document.owner.email}</p>
                              </div>
                            ) : (
                              <span className="text-gray-400">No linked document</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={statusBadgeClass(job.status)}>{job.status}</span>
                          </td>
                          <td className="px-6 py-4 text-gray-500">{job.attempts}</td>
                          <td className="px-6 py-4 text-gray-500">{formatDateTime(job.updatedAt)}</td>
                          <td className="px-6 py-4">
                            <div className="flex justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!isRetryable || isBusy}
                                onClick={() => void handleRetry(job.id)}
                              >
                                <RotateCcw className="h-4 w-4" />
                                Retry
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
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
              <Workflow className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-gray-700">No jobs matched the current filters.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function statusBadgeClass(status: AdminJobStatus) {
  const baseClass = 'inline-flex rounded-full px-2.5 py-1 text-xs font-medium'

  switch (status) {
    case 'FAILED':
      return `${baseClass} bg-rose-50 text-rose-700`
    case 'RUNNING':
    case 'RETRYING':
      return `${baseClass} bg-amber-50 text-amber-700`
    case 'COMPLETED':
      return `${baseClass} bg-emerald-50 text-emerald-700`
    default:
      return `${baseClass} bg-gray-100 text-gray-700`
  }
}

export default AdminJobsPage
