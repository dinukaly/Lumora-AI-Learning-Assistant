import { Bell, ChevronRight, LogOut, Search, Settings, Shield, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useLogoutMutation } from '@/features/auth/authApi'
import { logout } from '@/features/auth/authSlice'
import {
  useListNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  type NotificationItem,
} from '@/features/notifications/notificationsApi'
import {
  formatRelativeTime,
  getNotificationPresentation,
  getNotificationTargetPath,
} from '@/features/notifications/notificationUi'

function formatBadgeCount(count: number) {
  if (count > 9) return '9+'
  return String(count)
}

export const TopBar = () => {
  const { user } = useAppSelector((state) => state.auth)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [logoutApi] = useLogoutMutation()
  const [markNotificationRead] = useMarkNotificationReadMutation()
  const [markAllNotificationsRead, { isLoading: isMarkingAllRead }] = useMarkAllNotificationsReadMutation()
  const {
    data: notificationsData,
    isLoading: isNotificationsLoading,
  } = useListNotificationsQuery({ page: 1, limit: 8 })

  const unreadCount = notificationsData?.unreadCount ?? 0
  const notifications = notificationsData?.notifications ?? []

  const handleLogout = async () => {
    try {
      await logoutApi().unwrap()
    } catch {
      // Ignore logout errors and continue clearing local auth state.
    }
    dispatch(logout())
    navigate('/login')
  }

  const handleNotificationSelect = async (notification: NotificationItem) => {
    if (!notification.readAt) {
      try {
        await markNotificationRead(notification.id).unwrap()
      } catch {
        // Leave navigation available even if the read mutation fails.
      }
    }

    navigate(getNotificationTargetPath(notification))
  }

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return

    try {
      await markAllNotificationsRead().unwrap()
    } catch {
      // Keep the current list visible if the mutation fails.
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-8">
      <div className="flex flex-1 items-center">
        <div className="relative hidden w-full max-w-md md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search documents..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative text-gray-500 hover:text-gray-700">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                  {formatBadgeCount(unreadCount)}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[22rem] p-0">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Notifications</p>
                <p className="text-xs text-gray-500">
                  {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                disabled={unreadCount === 0 || isMarkingAllRead}
                onClick={() => void handleMarkAllRead()}
              >
                Mark all read
              </Button>
            </div>

            <div className="max-h-[24rem] overflow-y-auto">
              {isNotificationsLoading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="flex gap-3">
                      <div className="h-9 w-9 rounded-lg bg-gray-100" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-28 rounded bg-gray-100" />
                        <div className="h-3 w-full rounded bg-gray-50" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : notifications.length > 0 ? (
                notifications.map((notification) => {
                  const presentation = getNotificationPresentation(notification.type)
                  const Icon = presentation.icon

                  return (
                    <DropdownMenuItem
                      key={notification.id}
                      className="cursor-pointer items-start gap-3 rounded-none px-4 py-3 focus:bg-gray-50"
                      onSelect={() => {
                        void handleNotificationSelect(notification)
                      }}
                    >
                      <div className={`mt-0.5 rounded-lg p-2 ${presentation.iconBgClass}`}>
                        <Icon className={`h-4 w-4 ${presentation.iconColorClass}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium text-gray-900">{notification.title}</p>
                              {!notification.readAt && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-gray-500">{notification.body}</p>
                            <p className="mt-2 text-[11px] text-gray-400">
                              {formatRelativeTime(notification.createdAt)}
                            </p>
                          </div>
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
                        </div>
                      </div>
                    </DropdownMenuItem>
                  )
                })
              ) : (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  No notifications yet. We&apos;ll show updates here as your documents and study tools finish processing.
                </div>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="mx-2 h-6 w-[1px] bg-gray-200" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 p-1 hover:bg-gray-100">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback className="bg-emerald-100 font-medium text-emerald-700">
                  {user?.name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-left sm:block">
                <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/profile')}>
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </DropdownMenuItem>
            {user?.role === 'ADMIN' && (
              <DropdownMenuItem onClick={() => navigate('/admin')}>
                <Shield className="mr-2 h-4 w-4" />
                <span>Admin Console</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Logout</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
