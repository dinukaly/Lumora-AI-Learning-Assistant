import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAppDispatch } from '@/app/hooks'
import { getApiFormErrorState } from '@/app/apiErrors'
import { enqueueToast } from '@/app/uiSlice'
import { useLoginMutation } from './authApi'
import { setCredentials } from './authSlice'
import { BrandMark } from '@/components/layout/Brand'
import GoogleAuthButton from './GoogleAuthButton'

const INPUT_BASE_CLASS =
  'mt-1 block w-full rounded-lg border px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1'

function getInputClassName(hasError: boolean) {
  return `${INPUT_BASE_CLASS} ${
    hasError
      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 focus:border-emerald-500 focus:ring-emerald-500'
  }`
}

const LoginPage = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [login, { isLoading }] = useLoginMutation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setFieldErrors({})

    try {
      const result = await login({ email, password }).unwrap()
      dispatch(setCredentials(result))
      const isVerified = Boolean(result.user.emailVerifiedAt)
      dispatch(
        enqueueToast({
          id: crypto.randomUUID(),
          title: isVerified ? 'Signed in' : 'Verification still required',
          description: isVerified
            ? `Welcome back, ${result.user.name}.`
            : 'You can access your account, but protected learning features stay locked until your email is verified.',
          tone: 'success',
        }),
      )
      navigate(isVerified ? '/dashboard' : '/verify-email/pending')
    } catch (error) {
      const nextErrorState = getApiFormErrorState(error)
      setFormError(nextErrorState.formError)
      setFieldErrors(nextErrorState.fieldErrors)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <BrandMark className="mx-auto mb-4 h-12 w-12 rounded-xl" />
          <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="mt-1 text-gray-500">Sign in to continue to Lumora</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              {formError}
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setFormError(null)
                setFieldErrors((current) => ({ ...current, email: '' }))
              }}
              required
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              className={getInputClassName(Boolean(fieldErrors.email))}
              placeholder="you@example.com"
            />
            {fieldErrors.email && (
              <p id="email-error" className="mt-1 text-sm text-red-600">
                {fieldErrors.email}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setFormError(null)
                setFieldErrors((current) => ({ ...current, password: '' }))
              }}
              required
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
              className={getInputClassName(Boolean(fieldErrors.password))}
              placeholder="Enter your password"
            />
            {fieldErrors.password && (
              <p id="password-error" className="mt-1 text-sm text-red-600">
                {fieldErrors.password}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <div className="mt-6">
          <GoogleAuthButton mode="login" disabled={isLoading} />
        </div>
        <p className="mt-6 text-center text-sm text-gray-500">
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-emerald-600 hover:text-emerald-500">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}

export default LoginPage
