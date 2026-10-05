import { useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { updateUser } from './authSlice'
import { useVerifyEmailMutation } from './authApi'
import { getApiErrorMessage } from '@/app/apiErrors'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const user = useAppSelector((state) => state.auth.user)
  const token = searchParams.get('token') ?? ''
  const [verifyEmail, { isLoading, isSuccess, error, data }] = useVerifyEmailMutation()
  const hasRequestedRef = useRef(false)

  useEffect(() => {
    if (!token || hasRequestedRef.current) {
      return
    }

    hasRequestedRef.current = true
    void verifyEmail(token)
  }, [token, verifyEmail])

  useEffect(() => {
    if (!isSuccess || !user) {
      return
    }

    dispatch(
      updateUser({
        ...user,
        emailVerifiedAt: new Date().toISOString(),
      }),
    )
  }, [dispatch, isSuccess, user])

  const errorMessage = token ? getApiErrorMessage(error) : 'This verification link is missing a token.'

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <Card className="w-full max-w-lg shadow-sm">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            {isLoading ? (
              <Loader2 className="h-7 w-7 animate-spin" />
            ) : isSuccess ? (
              <CheckCircle2 className="h-7 w-7" />
            ) : (
              <MailCheck className="h-7 w-7" />
            )}
          </div>
          <div className="space-y-2">
            <CardTitle>
              {isLoading
                ? 'Verifying your email'
                : isSuccess
                  ? 'Email verified'
                  : 'Verification link problem'}
            </CardTitle>
            <CardDescription>
              {isLoading
                ? 'Hang tight while we confirm your account.'
                : isSuccess
                  ? data?.message ?? 'Your account is now unlocked for protected learning features.'
                  : 'We could not complete email verification with this link.'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {!isLoading && !isSuccess && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            {isSuccess ? (
              <>
                {user ? (
                  <Button onClick={() => navigate('/dashboard')} className="sm:min-w-44">
                    Continue to dashboard
                  </Button>
                ) : (
                  <Button asChild className="sm:min-w-44">
                    <Link to="/login">Sign in</Link>
                  </Button>
                )}
                <Button variant="outline" asChild>
                  <Link to="/profile">Open profile</Link>
                </Button>
              </>
            ) : (
              <>
                {user ? (
                  <Button onClick={() => navigate('/verify-email/pending')} className="sm:min-w-44">
                    Open verification help
                  </Button>
                ) : (
                  <Button asChild className="sm:min-w-44">
                    <Link to="/login">Go to sign in</Link>
                  </Button>
                )}
                <Button variant="outline" asChild>
                  <Link to="/register">Create account</Link>
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
