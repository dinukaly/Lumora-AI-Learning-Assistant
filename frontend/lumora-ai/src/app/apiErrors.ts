export interface ApiFormErrorState {
  formError: string | null
  fieldErrors: Record<string, string>
  errorCode?: string
  statusCode?: number
}

interface ApiErrorPayload {
  error?: {
    code?: unknown
    message?: unknown
    details?: unknown
  }
}

interface ApiFieldIssue {
  path?: unknown
  message?: unknown
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getNestedPayload(error: unknown): ApiErrorPayload | null {
  if (!isObject(error) || !('data' in error) || !isObject(error.data)) {
    return null
  }

  return error.data as ApiErrorPayload
}

function getStatusCode(error: unknown): number | undefined {
  if (!isObject(error) || !('status' in error)) {
    return undefined
  }

  return typeof error.status === 'number' ? error.status : undefined
}

function getTransportErrorMessage(error: unknown): string | null {
  if (!isObject(error) || !('status' in error)) {
    return null
  }

  if (error.status === 'FETCH_ERROR') {
    return 'Unable to reach the server. Check your connection and try again.'
  }

  if (error.status === 'PARSING_ERROR') {
    return 'Received an unexpected response. Please try again.'
  }

  if (error.status === 'TIMEOUT_ERROR') {
    return 'The request timed out. Please try again.'
  }

  return null
}

function getFieldErrors(details: unknown): Record<string, string> {
  if (!Array.isArray(details)) {
    return {}
  }

  return details.reduce<Record<string, string>>((acc, issue) => {
    if (!isObject(issue)) {
      return acc
    }

    const typedIssue = issue as ApiFieldIssue
    const path = Array.isArray(typedIssue.path) ? typedIssue.path[0] : undefined
    const message = typeof typedIssue.message === 'string' ? typedIssue.message : undefined

    if (typeof path === 'string' && message) {
      acc[path] = message
    }

    return acc
  }, {})
}

function getFallbackMessage(code: string | undefined, message: string | undefined, fieldErrors: Record<string, string>) {
  if (code === 'UNAUTHORIZED') {
    return 'Email or password is incorrect.'
  }

  if (code === 'FORBIDDEN' && message === 'Account is disabled') {
    return 'This account has been disabled. Contact support if this seems incorrect.'
  }

  if (code === 'EMAIL_UNVERIFIED') {
    return 'Verify your email to unlock this feature.'
  }

  if (message === 'User already exists') {
    return 'An account with this email already exists.'
  }

  if (code === 'VALIDATION_ERROR' && Object.keys(fieldErrors).length > 0) {
    return 'Please correct the highlighted fields.'
  }

  if (message) {
    return message
  }

  return 'Please try again.'
}

export function getApiFormErrorState(error: unknown): ApiFormErrorState {
  const transportMessage = getTransportErrorMessage(error)
  if (transportMessage) {
    return {
      formError: transportMessage,
      fieldErrors: {},
      statusCode: getStatusCode(error),
    }
  }

  const payload = getNestedPayload(error)
  const nestedError = payload?.error
  const code = typeof nestedError?.code === 'string' ? nestedError.code : undefined
  const message = typeof nestedError?.message === 'string' ? nestedError.message : undefined
  const fieldErrors = getFieldErrors(nestedError?.details)
  const fallbackMessage = getFallbackMessage(code, message, fieldErrors)

  return {
    formError: fallbackMessage,
    fieldErrors,
    errorCode: code,
    statusCode: getStatusCode(error),
  }
}

export function getApiErrorMessage(error: unknown) {
  const { formError } = getApiFormErrorState(error)
  return formError ?? 'Please try again.'
}
