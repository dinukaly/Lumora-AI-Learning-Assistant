import { useState } from 'react'
import { AlertCircle, Shield, UserCheck, UserX } from 'lucide-react'
import { useAppSelector } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import AdminPagination from './AdminPagination'
import {
  type AdminRole,
  useListAdminUsersQuery,
  useSetAdminUserDisabledMutation,
  useUpdateAdminUserRoleMutation,
} from './adminApi'
import { formatDateTime } from './adminFormatting'

const AdminUsersPage = () => {
  const currentUser = useAppSelector((state) => state.auth.user)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'ALL' | AdminRole>('ALL')
  const [page, setPage] = useState(1)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const [activeUserId, setActiveUserId] = useState<string | null>(null)

  const { data, isLoading, isFetching } = useListAdminUsersQuery({
    search: search || undefined,
    role: roleFilter === 'ALL' ? undefined : roleFilter,
    page,
    limit: 10,
  })
  const [updateUserRole] = useUpdateAdminUserRoleMutation()
  const [setUserDisabled] = useSetAdminUserDisabledMutation()

  const handleRoleChange = async (userId: string, role: AdminRole) => {
    setFeedback(null)
    setActiveUserId(userId)

    try {
      await updateUserRole({ id: userId, role }).unwrap()
      setFeedback({ tone: 'success', message: `Updated role to ${role}.` })
    } catch {
      setFeedback({ tone: 'error', message: 'Could not update the user role.' })
    } finally {
      setActiveUserId(null)
    }
  }

  const handleDisabledToggle = async (userId: string, disabled: boolean) => {
    setFeedback(null)
    setActiveUserId(userId)

    try {
      await setUserDisabled({ id: userId, disabled }).unwrap()
      setFeedback({ tone: 'success', message: disabled ? 'User disabled.' : 'User re-enabled.' })
    } catch {
      setFeedback({ tone: 'error', message: 'Could not change the account status.' })
    } finally {
      setActiveUserId(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>Search users, adjust platform roles, and disable or re-enable accounts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem]">
            <label className="space-y-2 text-sm">
              <span className="font-medium text-gray-700">Search</span>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder="Search by name or email"
                className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none transition focus:border-gray-400"
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-medium text-gray-700">Role</span>
              <select
                value={roleFilter}
                onChange={(event) => {
                  setRoleFilter(event.target.value as 'ALL' | AdminRole)
                  setPage(1)
                }}
                className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-gray-400"
              >
                <option value="ALL">All roles</option>
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
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
            <CardTitle>Users</CardTitle>
            <CardDescription>{isFetching ? 'Refreshing results…' : 'Live admin-backed account list.'}</CardDescription>
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
          ) : data?.users.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-[0.06em] text-gray-500">
                    <tr>
                      <th className="px-6 py-3">User</th>
                      <th className="px-6 py-3">Role</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Last Login</th>
                      <th className="px-6 py-3">Created</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((user) => {
                      const isSelf = currentUser?.id === user.id
                      const isBusy = activeUserId === user.id
                      const isDisabled = Boolean(user.disabledAt)

                      return (
                        <tr key={user.id} className="border-t border-gray-200 align-top">
                          <td className="px-6 py-4">
                            <div>
                              <p className="font-medium text-gray-900">{user.name}</p>
                              <p className="text-gray-500">{user.email}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Shield className="mt-0.5 h-4 w-4 text-gray-400" />
                              <select
                                value={user.role}
                                disabled={isBusy}
                                onChange={(event) => void handleRoleChange(user.id, event.target.value as AdminRole)}
                                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-gray-400 disabled:opacity-60"
                              >
                                <option value="USER">USER</option>
                                <option value="ADMIN">ADMIN</option>
                              </select>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${isDisabled ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                              {isDisabled ? 'Disabled' : 'Active'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-500">{formatDateTime(user.lastLoginAt)}</td>
                          <td className="px-6 py-4 text-gray-500">{formatDateTime(user.createdAt)}</td>
                          <td className="px-6 py-4">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant={isDisabled ? 'outline' : 'destructive'}
                                size="sm"
                                disabled={isBusy || isSelf}
                                onClick={() => void handleDisabledToggle(user.id, !isDisabled)}
                              >
                                {isDisabled ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                                {isDisabled ? 'Enable' : 'Disable'}
                              </Button>
                            </div>
                            {isSelf && (
                              <p className="mt-2 text-right text-xs text-gray-400">Your account cannot be disabled here.</p>
                            )}
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
              <AlertCircle className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-gray-700">No users matched the current filters.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default AdminUsersPage
