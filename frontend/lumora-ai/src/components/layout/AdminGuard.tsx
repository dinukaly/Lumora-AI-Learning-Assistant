import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAppSelector } from '@/app/hooks'

const AdminGuard = () => {
  const user = useAppSelector((state) => state.auth.user)
  const location = useLocation()

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

export default AdminGuard
