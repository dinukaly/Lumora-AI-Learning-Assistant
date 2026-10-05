import { useMemo, useState } from 'react'
import { BarChart3, DollarSign, Sigma, TrendingUp } from 'lucide-react'
import { StatCard } from '@/components/dashboard/StatCard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useGetAdminStatsQuery, useGetAdminUsageAnalyticsQuery, type UsageGranularity } from './adminApi'
import AdminUsageChart from './AdminUsageChart'
import { formatCompactNumber, formatCurrency, toRangeEndIso, toRangeStartIso } from './adminFormatting'

const AdminAnalyticsPage = () => {
  const [granularity, setGranularity] = useState<UsageGranularity>('day')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const queryArgs = useMemo(() => ({
    granularity,
    from: toRangeStartIso(fromDate),
    to: toRangeEndIso(toDate),
  }), [fromDate, granularity, toDate])

  const { data: stats, isLoading: isStatsLoading } = useGetAdminStatsQuery()
  const { data: analytics, isLoading: isAnalyticsLoading, isError } = useGetAdminUsageAnalyticsQuery(queryArgs)

  const totals = useMemo(() => {
    const data = analytics?.data ?? []

    return data.reduce((accumulator, entry) => ({
      requests: accumulator.requests + entry.requests,
      tokens: accumulator.tokens + entry.tokens,
      cost: accumulator.cost + entry.cost,
    }), { requests: 0, tokens: 0, cost: 0 })
  }, [analytics?.data])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Usage Analytics</CardTitle>
          <CardDescription>Inspect request volume, token load, and recorded cost over time.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[12rem_1fr_1fr]">
          <div className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Granularity</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setGranularity('day')}
                className={`h-10 rounded-md px-4 text-sm font-medium ${granularity === 'day' ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                Day
              </button>
              <button
                type="button"
                onClick={() => setGranularity('hour')}
                className={`h-10 rounded-md px-4 text-sm font-medium ${granularity === 'hour' ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                Hour
              </button>
            </div>
          </div>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-gray-700">From date</span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none transition focus:border-gray-400"
            />
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-gray-700">To date</span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none transition focus:border-gray-400"
            />
          </label>
        </CardContent>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="Range Requests"
          value={isAnalyticsLoading ? '—' : formatCompactNumber(totals.requests)}
          iconBgClass="bg-emerald-100"
          iconColorClass="text-emerald-600"
        />
        <StatCard
          icon={Sigma}
          label="Range Tokens"
          value={isAnalyticsLoading ? '—' : formatCompactNumber(totals.tokens)}
          iconBgClass="bg-sky-100"
          iconColorClass="text-sky-600"
        />
        <StatCard
          icon={DollarSign}
          label="Range Cost"
          value={isAnalyticsLoading ? '—' : formatCurrency(totals.cost)}
          iconBgClass="bg-violet-100"
          iconColorClass="text-violet-600"
        />
        <StatCard
          icon={BarChart3}
          label="Lifetime Requests"
          value={isStatsLoading ? '—' : formatCompactNumber(stats?.totalAIRequests ?? 0)}
          iconBgClass="bg-amber-100"
          iconColorClass="text-amber-600"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Request Volume</CardTitle>
            <CardDescription>Request counts grouped by the selected UTC bucket.</CardDescription>
          </CardHeader>
          <CardContent>
            {isAnalyticsLoading ? (
              <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
            ) : (
              <AdminUsageChart data={analytics?.data ?? []} metric="requests" granularity={granularity} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost Trend</CardTitle>
            <CardDescription>Estimated cost over the same selected range.</CardDescription>
          </CardHeader>
          <CardContent>
            {isAnalyticsLoading ? (
              <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
            ) : (
              <AdminUsageChart data={analytics?.data ?? []} metric="cost" granularity={granularity} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Analytics Table</CardTitle>
          <CardDescription>Raw grouped usage buckets from the backend aggregation.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isError ? (
            <div className="px-6 py-16 text-center text-sm text-rose-700">
              The selected date range is invalid. Adjust the range and try again.
            </div>
          ) : analytics?.data.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-[0.06em] text-gray-500">
                  <tr>
                    <th className="px-6 py-3">Bucket</th>
                    <th className="px-6 py-3">Requests</th>
                    <th className="px-6 py-3">Tokens</th>
                    <th className="px-6 py-3">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.data.map((entry) => (
                    <tr key={entry.date} className="border-t border-gray-200">
                      <td className="px-6 py-4 font-medium text-gray-900">{entry.date}</td>
                      <td className="px-6 py-4 text-gray-600">{formatCompactNumber(entry.requests)}</td>
                      <td className="px-6 py-4 text-gray-600">{formatCompactNumber(entry.tokens)}</td>
                      <td className="px-6 py-4 text-gray-600">{formatCurrency(entry.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-16 text-center text-sm text-gray-500">
              No usage rows were returned for the selected range.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default AdminAnalyticsPage
