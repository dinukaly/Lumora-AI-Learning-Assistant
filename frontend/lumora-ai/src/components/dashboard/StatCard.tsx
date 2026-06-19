import { type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '../ui/card'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: number
  trend?: {
    value: string
    positive: boolean
  }
  iconBgClass?: string
  iconColorClass?: string
}

const StatCard = ({ icon: Icon, label, value, trend, iconBgClass = 'bg-emerald-100', iconColorClass = 'text-emerald-600' }: StatCardProps) => {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className={`rounded-lg p-3 ${iconBgClass}`}>
            <Icon className={`h-6 w-6 ${iconColorClass}`} />
          </div>
        </div>
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            {trend && (
              <span className={`text-sm font-medium ${trend.positive ? 'text-emerald-600' : 'text-red-500'}`}>
                {trend.positive ? '+' : ''}{trend.value}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export { StatCard }