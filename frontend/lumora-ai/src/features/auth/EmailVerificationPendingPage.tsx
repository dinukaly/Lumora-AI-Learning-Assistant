import { useMemo, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, MailCheck, RefreshCw, ShieldCheck } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { getApiErrorMessage } from '@/app/apiErrors'
import { enqueueToast } from '@/app/uiSlice'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useResendVerificationEmailMutation } from './authApi'

export default function EmailVerificationPendingPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const user = useAppSelector((state) => state.auth.user)
  const [resendVerificationEmail, { isLoading: isResending }] = useResendVerificationEmailMutation()

  const fromPath = useMemo(() => {
    if (
      typeof location.state === 'object'
      && location.state !== null
      && 'from' in location.state
      && typeof location.state.from === 'string'
    ) {
      return location.state.from
    }

    return null
  }, [location.state])

  const handleResend = async () => {
    try {
      const result = await resendVerificationEmail().unwrap()
      dispatch(
        enqueueToast({
          id: crypto.randomUUID(),
          title: 'Verification email sent',
          description: result.message,
          tone: 'success',
        }),
      )
    } catch (error) {
      dispatch(
        enqueueToast({
          id: crypto.randomUUID(),
          title: 'Could not resend email',
          description: getApiErrorMessage(error),
          tone: 'error',
        }),
      )
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-3xl items-center justify-center py-8">
      <Card className="w-full border-amber-200 bg-white shadow-sm">
        <CardHeader className="space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <MailCheck className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <CardTitle>Verify your email to unlock learning features</CardTitle>
            <CardDescription className="max-w-2xl">
              You can keep managing your account, but document uploads, AI tools, flashcards, and quizzes stay locked until your email is verified.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            <p className="font-medium text-gray-900">Verification email</p>
            <p className="mt-1 break-all">{user?.email ?? 'Your account email'}</p>
            <p className="mt-3 text-gray-500">
              Open the email we sent, then use the verification link to finish activating your account.
            </p>
          </div>

          {fromPath && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">That area is locked until verification is complete.</p>
                <p className="mt-1 text-amber-800">
                  Verify your email first, then you can go back to <span className="font-semibold">{fromPath}</span>.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <StatusCard
              title="Allowed now"
              description="Log in, view your profile, resend verification, and sign out."
              icon={<ShieldCheck className="h-4 w-4 text-emerald-700" />}
              tone="emerald"
            />
            <StatusCard
              title="Locked for now"
              description="Documents, AI chat, AI actions, flashcards, and quizzes."
              icon={<AlertCircle className="h-4 w-4 text-amber-700" />}
              tone="amber"
            />
            <StatusCard
              title="Next step"
              description="Verify the email, then return to your learning workspace."
              icon={<ArrowRight className="h-4 w-4 text-sky-700" />}
              tone="sky"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => void handleResend()} disabled={isResending} className="sm:min-w-48">
              <RefreshCw className={`h-4 w-4 ${isResending ? 'animate-spin' : ''}`} />
              {isResending ? 'Sending email...' : 'Resend verification email'}
            </Button>
            <Button variant="outline" onClick={() => navigate('/profile')}>
              Go to profile
            </Button>
            {fromPath ? (
              <Button variant="ghost" onClick={() => navigate(fromPath)}>
                Try again
              </Button>
            ) : (
              <Button variant="ghost" asChild>
                <Link to="/dashboard">Back to dashboard</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatusCard({
  title,
  description,
  icon,
  tone,
}: {
  title: string
  description: string
  icon: ReactNode
  tone: 'emerald' | 'amber' | 'sky'
}) {
  const toneClassName =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50'
        : 'border-sky-200 bg-sky-50'

  return (
    <div className={`rounded-xl border p-4 ${toneClassName}`}>
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm font-semibold text-gray-900">{title}</p>
      </div>
      <p className="mt-2 text-sm text-gray-700">{description}</p>
    </div>
  )
}
