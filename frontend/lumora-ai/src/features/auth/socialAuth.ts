export function isGoogleAuthEnabled() {
  return import.meta.env.VITE_GOOGLE_AUTH_ENABLED === 'true'
}

export function getAuthApiBaseUrl() {
  return `${(import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/+$/, '')}/v1`
}

export function getGoogleAuthStartUrl() {
  return `${getAuthApiBaseUrl()}/auth/oauth/google/start`
}

export function getGoogleAuthErrorMessage(errorCode?: string | null) {
  switch (errorCode) {
    case 'OAUTH_INVALID_STATE':
      return 'This Google sign-in attempt expired or could not be verified safely. Please try again.'
    case 'OAUTH_LINK_FAILED':
      return 'This Google account could not be linked securely. Use a Google account with a verified email, or sign in with your existing Lumora password if you already have one.'
    case 'OAUTH_PROVIDER_ERROR':
      return 'Google sign-in could not be completed right now. Please try again in a moment.'
    default:
      return 'Google sign-in could not be completed. Please try again.'
  }
}
