import { BookOpen, FileText, GraduationCap, Plus, Sparkles } from 'lucide-react'
import { StatCard } from '../../components/dashboard/StatCard'
import { RecentActivity } from '../../components/dashboard/RecentActivity'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'

const DashboardPage = () => {
  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, User</h1>
        <p className="mt-1 text-sm text-gray-500">Here is your learning overview for today.</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={FileText}
          label="Total Documents"
          value={4}
          trend={{ value: '2 this week', positive: true }}
          iconBgClass="bg-emerald-100"
          iconColorClass="text-emerald-600"
        />
        <StatCard
          icon={GraduationCap}
          label="Flashcards"
          value={48}
          trend={{ value: '12 reviewed', positive: true }}
          iconBgClass="bg-amber-100"
          iconColorClass="text-amber-600"
        />
        <StatCard
          icon={BookOpen}
          label="Quizzes Completed"
          value={6}
          trend={{ value: '85% avg score', positive: true }}
          iconBgClass="bg-purple-100"
          iconColorClass="text-purple-600"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentActivity />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Jump back into learning</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-start gap-2" variant="default">
              <Plus className="h-4 w-4" />
              Upload a Document
            </Button>
            <Button className="w-full justify-start gap-2" variant="outline">
              <Sparkles className="h-4 w-4" />
              Generate Flashcards
            </Button>
            <Button className="w-full justify-start gap-2" variant="outline">
              <Sparkles className="h-4 w-4" />
              Take a Quiz
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default DashboardPage