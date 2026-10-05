import { BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AdminUsageAnalyticsResponse } from './adminApi'
import { formatCompactNumber, formatCurrency } from './adminFormatting'

interface AdminUsageChartProps {
  data: AdminUsageAnalyticsResponse['data']
  metric: 'requests' | 'tokens' | 'cost'
  granularity: 'day' | 'hour'
}

const metricStyles = {
  requests: {
    barClassName: 'bg-emerald-500',
    label: 'Requests',
    emptyMessage: 'No requests recorded for this range.',
  },
  tokens: {
    barClassName: 'bg-sky-500',
    label: 'Tokens',
    emptyMessage: 'No token usage recorded for this range.',
  },
  cost: {
    barClassName: 'bg-violet-500',
    label: 'Cost',
    emptyMessage: 'No cost data recorded for this range.',
  },
} as const

const AdminUsageChart = ({ data, metric, granularity }: AdminUsageChartProps) => {
  const metricStyle = metricStyles[metric]
  const maxValue = Math.max(...data.map((entry) => entry[metric]), 0)

  if (data.length === 0) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 text-center">
        <BarChart3 className="h-8 w-8 text-gray-300" />
        <p className="mt-3 text-sm font-medium text-gray-700">{metricStyle.emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid h-64 grid-cols-[repeat(auto-fit,minmax(2.5rem,1fr))] items-end gap-2">
        {data.map((entry) => {
          const value = entry[metric]
          const height = maxValue > 0 ? Math.max((value / maxValue) * 100, 6) : 6

          return (
            <div key={`${metric}-${entry.date}`} className="flex h-full min-w-0 flex-col justify-end gap-2">
              <div className="text-center text-[11px] font-medium text-gray-500">
                {formatMetricValue(metric, value)}
              </div>
              <div
                className={cn('w-full rounded-t-md transition-all', metricStyle.barClassName)}
                style={{ height: `${height}%` }}
                title={`${metricStyle.label}: ${formatMetricValue(metric, value)}`}
              />
              <div className="truncate text-center text-[11px] text-gray-400">
                {formatBucketLabel(entry.date, granularity)}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-gray-500">
        {metricStyle.label} by {granularity === 'hour' ? 'hour' : 'day'} in UTC buckets.
      </p>
    </div>
  )
}

function formatMetricValue(metric: 'requests' | 'tokens' | 'cost', value: number) {
  if (metric === 'cost') return formatCurrency(value)
  return formatCompactNumber(value)
}

function formatBucketLabel(value: string, granularity: 'day' | 'hour') {
  if (granularity === 'hour') {
    return value.slice(11, 16)
  }

  return value.slice(5)
}

export default AdminUsageChart
