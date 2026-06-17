import { Outlet } from 'react-router-dom'
import { BookOpen, GraduationCap, LayoutDashboard, User } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

const sidebarNav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/documents', label: 'Documents', icon: BookOpen },
  { to: '/flashcards', label: 'Flashcards', icon: GraduationCap },
  { to: '/profile', label: 'Profile', icon: User },
]

const AppShell = () => {
  const location = useLocation()

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
          <div className="h-8 w-8 rounded-lg bg-emerald-600" />
          <span className="text-xl font-bold text-gray-900">Lumora</span>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {sidebarNav.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

export default AppShell