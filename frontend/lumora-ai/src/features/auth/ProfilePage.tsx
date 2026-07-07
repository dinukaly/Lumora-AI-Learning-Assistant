import { useEffect, useState } from 'react'
import { AlertCircle, ImageUp, KeyRound, Mail, Save, ShieldCheck, Upload, X } from 'lucide-react'
import { useAppDispatch } from '@/app/hooks'
import { getApiFormErrorState } from '@/app/apiErrors'
import { enqueueToast } from '@/app/uiSlice'
import { updateUser } from './authSlice'
import {
  useChangePasswordMutation,
  useGetProfileQuery,
  useUpdateProfileMutation,
  useUploadAvatarMutation,
  type User,
} from './authApi'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

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

const ProfilePage = () => {
  const dispatch = useAppDispatch()
  const { data: profile, isLoading, isFetching } = useGetProfileQuery()
  const [updateProfile, { isLoading: isSavingProfile }] = useUpdateProfileMutation()
  const [uploadAvatar, { isLoading: isUploadingAvatar }] = useUploadAvatarMutation()
  const [changePassword, { isLoading: isChangingPassword }] = useChangePasswordMutation()

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
  }, [profile])

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

    setAvatarFile(file)
  }

  const handleAvatarUpload = async () => {
    if (!avatarFile) return

    setAvatarError(null)

    try {
      const result = await uploadAvatar(avatarFile).unwrap()
      setAvatarFile(null)
      dispatch(updateUser(result.user))
      dispatch(
        enqueueToast({
          id: crypto.randomUUID(),
          title: 'Avatar uploaded',
          description: result.message,
          tone: 'success',
        }),
      )
    } catch (error) {
      const nextErrorState = getApiFormErrorState(error)
      setAvatarError(nextErrorState.formError)
    }
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

  if (isLoading && !profile) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-9 w-48 rounded bg-gray-200" />
          <div className="h-5 w-72 rounded bg-gray-100" />
        </div>
        <div className="grid gap-6 xl:grid-cols-[20rem,minmax(0,1fr)]">
          <div className="h-72 rounded-xl border border-gray-200 bg-white" />
          <div className="space-y-6">
            <div className="h-96 rounded-xl border border-gray-200 bg-white" />
            <div className="h-72 rounded-xl border border-gray-200 bg-white" />
          </div>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <Card>
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Profile</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-500">
            Manage your account details, keep your avatar current, and update your password.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          {profile.disabledAt ? 'Account disabled' : 'Account active'}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[20rem,minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Account summary</CardTitle>
            <CardDescription>
              Your current account identity and visible profile state.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-200 bg-gray-50 px-5 py-6 text-center">
              <Avatar className="h-24 w-24 border border-white shadow-sm">
                <AvatarImage src={avatarPreview} />
                <AvatarFallback className="bg-emerald-100 text-xl font-semibold text-emerald-700">
                  {getInitials(name || profile.name)}
                </AvatarFallback>
              </Avatar>
              <p className="mt-4 text-base font-semibold text-gray-900">{name || profile.name}</p>
              <p className="mt-1 text-sm text-gray-500">{profile.email}</p>
              {avatarFile ? (
                <p className="mt-3 text-xs text-gray-500">Previewing {avatarFile.name}</p>
              ) : avatarPreview ? (
                <p className="mt-3 text-xs text-gray-500">Your uploaded avatar is visible across Lumora.</p>
              ) : (
                <p className="mt-3 text-xs text-gray-500">
                  No avatar set yet. Upload an image to personalize your account.
                </p>
              )}
            </div>

            <Separator />

            <dl className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-gray-500">Role</dt>
                <dd className="font-medium text-gray-900">{profile.role}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-gray-500">Sign-in method</dt>
                <dd className="font-medium text-gray-900">Email and password</dd>
              </div>
              {'emailVerifiedAt' in profile && (
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-gray-500">Email verification</dt>
                  <dd className="font-medium text-gray-900">
                    {profile.emailVerifiedAt ? 'Verified' : 'Unverified'}
                  </dd>
                </div>
              )}
              <div className="flex items-start justify-between gap-4">
                <dt className="text-gray-500">Member since</dt>
                <dd className="font-medium text-gray-900">{formatDate(profile.createdAt)}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-gray-500">Last login</dt>
                <dd className="font-medium text-gray-900">{formatDate(profile.lastLoginAt)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Edit profile</CardTitle>
              <CardDescription>
                Update your display name and upload a profile image.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={handleProfileSubmit}>
                {profileFormError && (
                  <div
                    className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                    role="alert"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{profileFormError}</span>
                  </div>
                )}

                <div className="grid gap-5 lg:grid-cols-2">
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
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="rounded-full bg-white p-2 text-emerald-600 shadow-sm">
                        <ImageUp className="h-4 w-4" />
                      </div>
                      <div>
                        <label htmlFor="profile-avatar-file" className="block text-sm font-medium text-gray-900">
                          Avatar image
                        </label>
                        <p className="mt-1 text-xs text-gray-500">
                          Upload a JPEG, PNG, or WebP image up to {formatBytes(AVATAR_MAX_UPLOAD_BYTES)}.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <label
                        htmlFor="profile-avatar-file"
                        className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                      >
                        <Upload className="h-4 w-4" />
                        Choose image
                      </label>
                      <input
                        id="profile-avatar-file"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={handleAvatarSelect}
                      />
                      <Button
                        type="button"
                        disabled={!avatarFile || isUploadingAvatar}
                        onClick={() => void handleAvatarUpload()}
                        className="sm:min-w-32"
                      >
                        {isUploadingAvatar ? 'Uploading...' : 'Upload avatar'}
                      </Button>
                    </div>
                  </div>

                  {avatarFile && (
                    <div className="mt-4 flex flex-col gap-3 rounded-lg border border-emerald-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{avatarFile.name}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {formatBytes(avatarFile.size)} selected for upload.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAvatarFile(null)
                          setAvatarError(null)
                        }}
                      >
                        <X className="h-4 w-4" />
                        Clear
                      </Button>
                    </div>
                  )}

                  {avatarError && (
                    <p className="mt-3 text-sm text-red-600" role="alert">
                      {avatarError}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-gray-500">
                    {isFetching ? 'Refreshing account details…' : 'Changes are applied immediately after save.'}
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

          <Card>
            <CardHeader>
              <CardTitle>Change password</CardTitle>
              <CardDescription>
                Use your current password to confirm the change before setting a new one.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={handlePasswordSubmit}>
                {passwordFormError && (
                  <div
                    className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                    role="alert"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{passwordFormError}</span>
                  </div>
                )}

                <div className="grid gap-5 lg:grid-cols-2">
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
                      <p className="text-sm font-medium text-gray-900">Local password security</p>
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

          <Card>
            <CardHeader>
              <CardTitle>Current account details</CardTitle>
              <CardDescription>
                Visible account metadata from the existing backend profile response.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500">Profile</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">{profile.name}</p>
                <p className="mt-1 text-sm text-gray-500">Public display name</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500">Identity</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">Local account</p>
                <p className="mt-1 text-sm text-gray-500">Email and password sign-in</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500">Status</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">
                  {profile.disabledAt ? 'Disabled' : 'Healthy'}
                </p>
                <p className="mt-1 text-sm text-gray-500">No account restrictions reported</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
