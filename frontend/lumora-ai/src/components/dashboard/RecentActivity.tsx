import { FileText, GraduationCap, HelpCircle, type LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

interface ActivityItem {
  id: string
  icon: LucideIcon
  iconBgClass: string
  iconColorClass: string
  title: string
  description: string
  time: string
}

const activities: ActivityItem[] = [
  {
    id: '1',
    icon: FileText,
    iconBgClass: 'bg-blue-100',
    iconColorClass: 'text-blue-600',
    title: 'Uploaded a document',
    description: 'Machine Learning Fundamentals.pdf',
    time: '2 hours ago',
  },
  {
    id: '2',
    icon: HelpCircle,
    iconBgClass: 'bg-purple-100',
    iconColorClass: 'text-purple-600',
    title: 'Completed a quiz',
    description: 'Linear Algebra Basics — 85% score',
    time: '5 hours ago',
  },
  {
    id: '3',
    icon: GraduationCap,
    iconBgClass: 'bg-amber-100',
    iconColorClass: 'text-amber-600',
    title: 'Reviewed flashcards',
    description: 'Data Structures — 12 cards reviewed',
    time: '1 day ago',
  },
  {
    id: '4',
    icon: FileText,
    iconBgClass: 'bg-blue-100',
    iconColorClass: 'text-blue-600',
    title: 'Uploaded a document',
    description: 'React Advanced Patterns.pdf',
    time: '2 days ago',
  },
]

const RecentActivity = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-gray-100">
          {activities.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.id} className="flex items-start gap-4 px-6 py-4">
                <div className={`rounded-lg p-2 ${item.iconBgClass}`}>
                  <Icon className={`h-4 w-4 ${item.iconColorClass}`} />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium text-gray-900">{item.title}</p>
                  <p className="text-sm text-gray-500">{item.description}</p>
                </div>
                <span className="whitespace-nowrap text-xs text-gray-400">{item.time}</span>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

export { RecentActivity }