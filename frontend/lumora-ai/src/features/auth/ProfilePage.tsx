import { useEffect, useState } from 'react'
import {
  AlertCircle,
  KeyRound,
  Mail,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
} from 'lucide-react'
import { useAppDispatch } from '@/app/hooks'
import { getApiErrorMessage, getApiFormErrorState } from '@/app/apiErrors'
import { enqueueToast } from '@/app/uiSlice'
import { updateUser } from './authSlice'
import {
  useChangePasswordMutation,
  useGetProfileQuery,
  useResendVerificationEmailMutation,
  useUpdateProfileMutation,
  useUploadAvatarMutation,
  type User,
} from './authApi'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const inputClassName =
  'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500'
const inputErrorClassName =
  'mt-1 block w-full rounded-lg border border-red-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500'
const AVATAR_MAX_UPLOAD_BYTES = 2 * 1024 * 1024
const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function getInitials(name?: string) {
  if (!name) return 'U'

  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || 'U'
}

function formatDate(value?: string | null) {
  if (!value) return 'Not available'

  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getSafeProfileDefaults(profile?: User) {
  return {
    name: profile?.name ?? '',
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`
  }

  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`
}

function getAvatarFileError(file: File) {
  if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
    return 'Choose a JPEG, PNG, or WebP image.'
  }

  if (file.size > AVATAR_MAX_UPLOAD_BYTES) {
    return `Choose an image ${formatBytes(AVATAR_MAX_UPLOAD_BYTES)} or smaller.`
  }

  return null
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  )
}

const ProfilePage = () => {
  const dispatch = useAppDispatch()
  const { data: profile, isLoading, isFetching } = useGetProfileQuery()
  const [updateProfile, { isLoading: isSavingProfile }] = useUpdateProfileMutation()
  const [uploadAvatar, { isLoading: isUploadingAvatar }] = useUploadAvatarMutation()
  const [changePassword, { isLoading: isChangingPassword }] = useChangePasswordMutation()
  const [resendVerificationEmail, { isLoading: isResendingVerification }] =
    useResendVerificationEmailMutation()

  const [name, setName] = useState('')
  const [profileFormError, setProfileFormError] = useState<string | null>(null)
  const [profileFieldErrors, setProfileFieldErrors] = useState<Record<string, string>>({})
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordFormError, setPasswordFormError] = useState<string | null>(null)
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!profile) return

    const defaults = getSafeProfileDefaults(profile)
    setName(defaults.name)
    dispatch(updateUser(profile))
  }, [dispatch, profile])

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(avatarFile)
    setAvatarPreviewUrl(objectUrl)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [avatarFile])

  const handleProfileSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setProfileFormError(null)
    setProfileFieldErrors({})

    try {
      const updatedProfile = await updateProfile({
        name: name.trim(),
      }).unwrap()

      dispatch(updateUser(updatedProfile))
      dispatch(
        enqueueToast({
          id: crypto.randomUUID(),
          title: 'Profile saved',
          description: 'Your account details have been updated.',
          tone: 'success',
        }),
      )
    } catch (error) {
      const nextErrorState = getApiFormErrorState(error)
      setProfileFormError(nextErrorState.formError)
      setProfileFieldErrors(nextErrorState.fieldErrors)
    }
  }

  const uploadSelectedAvatar = async (file: File) => {
    setAvatarError(null)
    setAvatarFile(file)

    try {
      const result = await uploadAvatar(file).unwrap()
      setAvatarFile(null)
      dispatch(updateUser(result.user))
      dispatch(
        enqueueToast({
          id: crypto.randomUUID(),
          title: 'Avatar updated',
          description: result.message,
          tone: 'success',
        }),
      )
    } catch (error) {
      const nextErrorState = getApiFormErrorState(error)
      setAvatarError(nextErrorState.formError)
    }
  }

  const handleAvatarSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setAvatarError(null)

    if (!file) {
      setAvatarFile(null)
      return
    }

    const fileError = getAvatarFileError(file)
    if (fileError) {
      setAvatarFile(null)
      setAvatarError(fileError)
      event.target.value = ''
      return
    }

    void uploadSelectedAvatar(file)
    event.target.value = ''
  }

  const handleAvatarInputClick = (event: React.MouseEvent<HTMLInputElement>) => {
    event.currentTarget.value = ''
  }

  const renderEditableAvatar = (size: 'large' | 'small') => {
    const avatarSize = size === 'large' ? 'h-20 w-20' : 'h-16 w-16'
    const editSize = size === 'large' ? 'h-8 w-8' : 'h-7 w-7'

    return (
      <div className="relative w-fit">
        <Avatar className={`${avatarSize} border border-white shadow-sm`}>
          <AvatarImage src={avatarPreview} />
          <AvatarFallback className="bg-emerald-100 text-base font-semibold text-emerald-700">
            {getInitials(name || profile?.name)}
          </AvatarFallback>
        </Avatar>
        <label
          htmlFor="profile-avatar-file"
          className={`absolute -bottom-1 -right-1 inline-flex ${editSize} cursor-pointer items-center justify-center rounded-full border border-white bg-gray-900 text-white shadow-sm transition hover:bg-gray-700`}
          aria-label="Change profile image"
          title="Change profile image"
        >
          <Pencil className="h-3.5 w-3.5" />
        </label>
      </div>
    )
  }

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setPasswordFormError(null)
    setPasswordFieldErrors({})

    try {
      const result = await changePassword({ currentPassword, newPassword }).unwrap()

      setCurrentPassword('')
      setNewPassword('')
      dispatch(
        enqueueToast({
          id: crypto.randomUUID(),
          title: 'Password updated',
          description: result.message,
          tone: 'success',
        }),
      )
    } catch (error) {
      const nextErrorState = getApiFormErrorState(error)
      setPasswordFormError(nextErrorState.formError)
      setPasswordFieldErrors(nextErrorState.fieldErrors)
    }
  }

  const handleResendVerification = async () => {
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

  if (isLoading && !profile) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="space-y-2">
          <div className="h-9 w-40 rounded bg-gray-200" />
          <div className="h-5 w-80 rounded bg-gray-100" />
        </div>
        <div className="h-64 rounded-xl border border-gray-200 bg-white" />
        <div className="h-80 rounded-xl border border-gray-200 bg-white" />
        <div className="h-72 rounded-xl border border-gray-200 bg-white" />
      </div>
    )
  }

  if (!profile) {
    return (
      <Card className="mx-auto max-w-3xl">
        <CardHeader>
          <CardTitle>Profile unavailable</CardTitle>
          <CardDescription>We could not load your account details.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const avatarPreview = avatarPreviewUrl || profile.avatar || undefined
  const profileDefaults = getSafeProfileDefaults(profile)
  const hasProfileChanges = name !== profileDefaults.name
  const hasPasswordChanges = currentPassword.length > 0 || newPassword.length > 0
  const canChangePassword = profile.hasPassword !== false

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Account</h1>
          <p className="mt-2 text-sm text-gray-500">
            Manage the basics here: your name, profile image, verification status, and password.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          {profile.disabledAt ? 'Account disabled' : 'Account active'}
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="flex items-center gap-4">
              {renderEditableAvatar('large')}
              <div>
                <p className="text-lg font-semibold text-gray-900">{name || profile.name}</p>
                <p className="mt-1 text-sm text-gray-500">{profile.email}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {profile.role === 'ADMIN' && (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      Admin
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      profile.emailVerifiedAt
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {profile.emailVerifiedAt ? 'Email verified' : 'Email not verified'}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <DetailItem label="Sign-in method" value="Email and password" />
              <DetailItem label="Member since" value={formatDate(profile.createdAt)} />
              <DetailItem label="Last login" value={formatDate(profile.lastLoginAt)} />
              <DetailItem label="Status" value={profile.disabledAt ? 'Disabled' : 'Healthy'} />
            </div>
          </div>
        </CardContent>
      </Card>

      {!profile.emailVerifiedAt && (
        <Card className="border-amber-200 bg-amber-50/80">
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-950">Email verification is still pending.</p>
              <p className="text-sm text-amber-900">
                We&apos;ll send the verification link to <span className="font-semibold">{profile.email}</span>.
              </p>
            </div>
            <Button onClick={() => void handleResendVerification()} disabled={isResendingVerification}>
              <RefreshCw className={`h-4 w-4 ${isResendingVerification ? 'animate-spin' : ''}`} />
              {isResendingVerification ? 'Sending email...' : 'Resend verification email'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Profile settings</CardTitle>
          <CardDescription>Update your display name and profile image.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleProfileSubmit}>
            {profileFormError && (
              <div
                className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{profileFormError}</span>
              </div>
            )}

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="profile-name" className="block text-sm font-medium text-gray-700">
                  Display name
                </label>
                <input
                  id="profile-name"
                  type="text"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                    setProfileFormError(null)
                    setProfileFieldErrors((current) => ({ ...current, name: '' }))
                  }}
                  className={profileFieldErrors.name ? inputErrorClassName : inputClassName}
                  aria-invalid={Boolean(profileFieldErrors.name)}
                  aria-describedby={profileFieldErrors.name ? 'profile-name-error' : undefined}
                  placeholder="Your display name"
                />
                {profileFieldErrors.name && (
                  <p id="profile-name-error" className="mt-1 text-sm text-red-600">
                    {profileFieldErrors.name}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="profile-email" className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <div className="relative mt-1">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    id="profile-email"
                    type="email"
                    value={profile.email}
                    disabled
                    className="block w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm text-gray-500"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Email changes are not available in the current account flow.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex items-start gap-4">
                  {renderEditableAvatar('small')}
                  <div>
                    <p className="text-sm font-medium text-gray-900">Profile image</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Use the pencil on the avatar to upload a JPEG, PNG, or WebP image up to {formatBytes(AVATAR_MAX_UPLOAD_BYTES)}.
                    </p>
                    {avatarFile && (
                      <p className="mt-2 text-xs text-gray-600">
                        {isUploadingAvatar ? `Uploading ${avatarFile.name}...` : `Selected: ${avatarFile.name}`}
                      </p>
                    )}
                    {avatarError && (
                      <p className="mt-2 text-sm text-red-600" role="alert">
                        {avatarError}
                      </p>
                    )}
                  </div>
                </div>

                <input
                  id="profile-avatar-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onClick={handleAvatarInputClick}
                  onChange={handleAvatarSelect}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-500">
                {isFetching ? 'Refreshing account details...' : 'Changes are applied immediately after save.'}
              </p>
              <Button
                type="submit"
                disabled={isSavingProfile || !hasProfileChanges}
                className="sm:min-w-36"
              >
                <Save className="h-4 w-4" />
                {isSavingProfile ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {canChangePassword && (
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Change the password for your local account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={handlePasswordSubmit}>
              {passwordFormError && (
                <div
                  className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{passwordFormError}</span>
                </div>
              )}

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label htmlFor="current-password" className="block text-sm font-medium text-gray-700">
                    Current password
                  </label>
                  <input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => {
                      setCurrentPassword(event.target.value)
                      setPasswordFormError(null)
                      setPasswordFieldErrors((current) => ({ ...current, currentPassword: '' }))
                    }}
                    className={passwordFieldErrors.currentPassword ? inputErrorClassName : inputClassName}
                    aria-invalid={Boolean(passwordFieldErrors.currentPassword)}
                    aria-describedby={passwordFieldErrors.currentPassword ? 'current-password-error' : undefined}
                    placeholder="Enter your current password"
                  />
                  {passwordFieldErrors.currentPassword && (
                    <p id="current-password-error" className="mt-1 text-sm text-red-600">
                      {passwordFieldErrors.currentPassword}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">
                    New password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => {
                      setNewPassword(event.target.value)
                      setPasswordFormError(null)
                      setPasswordFieldErrors((current) => ({ ...current, newPassword: '' }))
                    }}
                    className={passwordFieldErrors.newPassword ? inputErrorClassName : inputClassName}
                    aria-invalid={Boolean(passwordFieldErrors.newPassword)}
                    aria-describedby={passwordFieldErrors.newPassword ? 'new-password-error' : 'new-password-help'}
                    placeholder="Minimum 8 characters"
                  />
                  {passwordFieldErrors.newPassword ? (
                    <p id="new-password-error" className="mt-1 text-sm text-red-600">
                      {passwordFieldErrors.newPassword}
                    </p>
                  ) : (
                    <p id="new-password-help" className="mt-1 text-xs text-gray-500">
                      Use at least 8 characters for the current local-auth flow.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-white p-2 text-emerald-600 shadow-sm">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Local password</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Password changes update your local sign-in credential only.
                    </p>
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={isChangingPassword || !hasPasswordChanges}
                  className="sm:min-w-40"
                >
                  {isChangingPassword ? 'Updating...' : 'Update password'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default ProfilePage
