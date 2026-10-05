import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAppSelector } from '@/app/hooks'

const VerifiedGuard = () => {
  const location = useLocation()
  const user = useAppSelector((state) => state.auth.user)

  if (!user?.emailVerifiedAt) {
    return (
      <Navigate
        to="/verify-email/pending"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }

  return <Outlet />
}

export default VerifiedGuard
