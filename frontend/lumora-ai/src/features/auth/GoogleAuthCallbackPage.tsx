import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { useAppDispatch } from '@/app/hooks'
import { enqueueToast } from '@/app/uiSlice'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getApiErrorMessage } from '@/app/apiErrors'
import { logout, setCredentials, setTokens } from './authSlice'
import { useLazyGetProfileQuery, useRefreshTokenMutation } from './authApi'
import { getGoogleAuthErrorMessage } from './socialAuth'

type CallbackState = 'loading' | 'success' | 'error'

export default function GoogleAuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [refreshToken] = useRefreshTokenMutation()
  const [loadProfile] = useLazyGetProfileQuery()
  const [callbackState, setCallbackState] = useState<CallbackState>('loading')
  const [resolvedErrorMessage, setResolvedErrorMessage] = useState<string | null>(null)
  const hasStartedRef = useRef(false)

  const provider = searchParams.get('provider')
  const status = searchParams.get('status')
  const code = searchParams.get('code')

  const callbackErrorMessage = useMemo(() => {
    if (resolvedErrorMessage) {
      return resolvedErrorMessage
    }

    if (provider !== 'google') {
      return 'This callback is only available for Google sign-in.'
    }

    if (status !== 'success') {
      return getGoogleAuthErrorMessage(code)
    }

    return null
  }, [code, provider, resolvedErrorMessage, status])

  useEffect(() => {
    if (hasStartedRef.current) {
      return
    }

    hasStartedRef.current = true

    if (provider !== 'google') {
      setCallbackState('error')
      return
    }

    if (status !== 'success') {
      setCallbackState('error')
      return
    }

    const completeGoogleAuth = async () => {
      try {
        const refreshed = await refreshToken().unwrap()
        dispatch(setTokens(refreshed))
        const profile = await loadProfile().unwrap()
        dispatch(
          setCredentials({
            user: profile,
            accessToken: refreshed.accessToken,
          }),
        )
        dispatch(
          enqueueToast({
            id: crypto.randomUUID(),
            title: 'Signed in with Google',
            description: profile.emailVerifiedAt
              ? `Welcome to Lumora, ${profile.name}.`
              : 'Your account is ready. Verify your email if you still need to unlock protected learning features.',
            tone: 'success',
          }),
        )
        setCallbackState('success')
        navigate(profile.emailVerifiedAt ? '/dashboard' : '/verify-email/pending', { replace: true })
      } catch (error) {
        dispatch(logout())
        setResolvedErrorMessage(getApiErrorMessage(error))
        setCallbackState('error')
      }
    }

    void completeGoogleAuth()
  }, [dispatch, loadProfile, navigate, provider, refreshToken, status])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <Card className="w-full max-w-lg shadow-sm">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
            {callbackState === 'loading' ? (
              <Loader2 className="h-7 w-7 animate-spin" />
            ) : callbackState === 'success' ? (
              <CheckCircle2 className="h-7 w-7" />
            ) : (
              <AlertCircle className="h-7 w-7" />
            )}
          </div>
          <div className="space-y-2">
            <CardTitle>
              {callbackState === 'loading'
                ? 'Finishing Google sign-in'
                : callbackState === 'success'
                  ? 'Google sign-in complete'
                  : 'Google sign-in problem'}
            </CardTitle>
            <CardDescription>
              {callbackState === 'loading'
                ? 'Hang tight while we finish your Lumora session.'
                : callbackState === 'success'
                  ? 'Your Lumora account is ready.'
                  : 'We could not complete Google sign-in safely.'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {callbackState === 'error' && callbackErrorMessage && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{callbackErrorMessage}</span>
            </div>
          )}

          {callbackState !== 'loading' && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="sm:min-w-44">
                <Link to="/login">Go to sign in</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/register">Create account</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
