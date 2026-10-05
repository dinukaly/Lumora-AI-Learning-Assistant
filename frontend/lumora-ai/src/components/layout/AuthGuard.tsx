import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { useRefreshTokenMutation } from '@/features/auth/authApi'
import { logout, setTokens } from '@/features/auth/authSlice'

const AuthGuard = () => {
  const dispatch = useAppDispatch()
  const { isAuthenticated, accessToken, user } = useAppSelector((state) => state.auth)
  const [refreshToken, { isLoading, isError }] = useRefreshTokenMutation()

  useEffect(() => {
    if (!user || accessToken) {
      return
    }

    void refreshToken()
      .unwrap()
      .then((data) => {
        dispatch(setTokens(data))
      })
      .catch(() => {
        dispatch(logout())
      })
  }, [accessToken, dispatch, refreshToken, user])

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (user && !accessToken) {
    if (isError) {
      return <Navigate to="/login" replace />
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="rounded-lg border border-gray-200 bg-white px-5 py-4 text-sm text-gray-600 shadow-sm">
          {isLoading ? 'Restoring your session...' : 'Preparing your workspace...'}
        </div>
      </div>
    )
  }

  return <Outlet />
}

export default AuthGuard
