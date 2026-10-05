import { apiSlice } from '@/app/apiSlice'

export interface User {
  id: string
  name: string
  email: string
  role: 'USER' | 'ADMIN'
  avatar?: string
  avatarStorageKey?: string
  preferences?: Record<string, unknown>
  lastLoginAt?: string
  disabledAt?: string | null
  createdAt?: string
  updatedAt?: string
  emailVerifiedAt?: string | null
  authProviders?: Array<'local' | 'google' | 'apple'>
  hasPassword?: boolean
  lockedUntil?: string | null
}

type AuthProvider = NonNullable<User['authProviders']>[number]
type RawUser = User & { _id?: string }

interface AuthResponse {
  user: User
  accessToken: string
  emailVerificationRequired?: boolean
  verificationEmailSent?: boolean
  message?: string
}

interface LoginRequest {
  email: string
  password: string
}

interface RegisterRequest {
  name: string
  email: string
  password: string
}

interface RefreshResponse {
  accessToken: string
}

interface VerifyEmailResponse {
  message: string
}

interface UpdateProfileRequest {
  name?: string
  avatar?: string
}

interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

interface AvatarUploadResponse {
  user: User
  avatar: { url: string }
  message: string
}

function normalizeUser(user: RawUser): User {
  const authProviders: AuthProvider[] =
    Array.isArray(user.authProviders) && user.authProviders.length > 0
      ? Array.from(new Set<AuthProvider>(user.authProviders))
      : user.hasPassword === false
        ? []
        : ['local']

  return {
    ...user,
    id: user.id || user._id || '',
    authProviders,
    hasPassword: typeof user.hasPassword === 'boolean' ? user.hasPassword : authProviders.includes('local'),
  }
}

function normalizeAuthResponse(response: AuthResponse): AuthResponse {
  return {
    ...response,
    user: normalizeUser(response.user as RawUser),
  }
}

export const authApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<AuthResponse, LoginRequest>({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
      transformResponse: (response: AuthResponse) => normalizeAuthResponse(response),
    }),
    register: builder.mutation<AuthResponse, RegisterRequest>({
      query: (data) => ({
        url: '/auth/register',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response: AuthResponse) => normalizeAuthResponse(response),
    }),
    refreshToken: builder.mutation<RefreshResponse, void>({
      query: () => ({
        url: '/auth/refresh',
        method: 'POST',
      }),
    }),
    logout: builder.mutation<{ message: string }, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
    }),
    resendVerificationEmail: builder.mutation<{ message: string }, void>({
      query: () => ({
        url: '/auth/verification/resend',
        method: 'POST',
      }),
    }),
    verifyEmail: builder.mutation<VerifyEmailResponse, string>({
      query: (token) => ({
        url: `/auth/verification/verify?token=${encodeURIComponent(token)}`,
        method: 'GET',
      }),
    }),
    getProfile: builder.query<User, void>({
      query: () => '/users/me',
      transformResponse: (response: RawUser) => normalizeUser(response),
      providesTags: ['User'],
    }),
    updateProfile: builder.mutation<User, UpdateProfileRequest>({
      query: (body) => ({
        url: '/users/me',
        method: 'PATCH',
        body,
      }),
      transformResponse: (response: RawUser) => normalizeUser(response),
      invalidatesTags: ['User'],
    }),
    uploadAvatar: builder.mutation<AvatarUploadResponse, File>({
      query: (file) => {
        const body = new FormData()
        body.append('avatar', file)

        return {
          url: '/users/me/avatar',
          method: 'POST',
          body,
        }
      },
      transformResponse: (response: { user: RawUser; avatar: { url: string }; message: string }) => ({
        ...response,
        user: normalizeUser(response.user),
      }),
      invalidatesTags: ['User'],
    }),
    changePassword: builder.mutation<{ message: string }, ChangePasswordRequest>({
      query: (body) => ({
        url: '/users/me/password',
        method: 'PATCH',
        body,
      }),
    }),
  }),
})

export const {
  useLoginMutation,
  useRegisterMutation,
  useRefreshTokenMutation,
  useLogoutMutation,
  useResendVerificationEmailMutation,
  useVerifyEmailMutation,
  useGetProfileQuery,
  useLazyGetProfileQuery,
  useUpdateProfileMutation,
  useUploadAvatarMutation,
  useChangePasswordMutation,
} = authApi
