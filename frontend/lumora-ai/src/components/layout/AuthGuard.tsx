import { Navigate, Outlet } from 'react-router-dom'
import { useAppSelector } from '@/app/hooks'

const AuthGuard = () => {
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export default AuthGuard