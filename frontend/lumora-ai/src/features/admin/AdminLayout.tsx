import { BarChart3, BellRing, FileStack, LayoutDashboard, Shield, Users, Workflow } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'

const adminNavItems = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/documents', label: 'Documents', icon: FileStack },
  { to: '/admin/jobs', label: 'Jobs', icon: Workflow },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/notifications', label: 'Broadcast', icon: BellRing },
] as const

const AdminLayout = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
            <Shield className="h-3.5 w-3.5" />
            Admin workspace
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-gray-900">Admin Console</h1>
          <p className="mt-1 text-sm text-gray-500">
            Operate users, content, jobs, analytics, and platform-wide communication from one place.
          </p>
        </div>
      </div>

      <nav className="overflow-x-auto border-b border-gray-200">
        <div className="flex min-w-max gap-2 pb-3">
          {adminNavItems.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/admin'}
                className={({ isActive }) =>
                  cn(
                    'inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          })}
        </div>
      </nav>

      <Outlet />
    </div>
  )
}

export default AdminLayout
