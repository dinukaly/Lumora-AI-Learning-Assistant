import { useEffect, useEffectEvent, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { apiSlice } from '@/app/apiSlice'
import { enqueueToast } from '@/app/uiSlice'
import { setTokens } from '@/features/auth/authSlice'
import { useRefreshTokenMutation } from '@/features/auth/authApi'
import { documentsApi, type DocumentData } from '@/features/documents/documentsApi'

interface DocumentStatusEvent {
  documentId: string
  status: DocumentData['status']
  title: string
  processingError?: string
}

interface NotificationEvent {
  notification: {
    id: string
    type: 'DOCUMENT_READY' | 'PROCESSING_FAILED' | 'FLASHCARDS_READY' | 'QUIZ_READY' | string
    title: string
    body: string
    metadata?: Record<string, unknown>
  }
}

function getSocketBaseUrl() {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
  const url = new URL(apiUrl)
  url.pathname = url.pathname.replace(/\/api(?:\/v\d+)?\/?$/i, '') || '/'
  return url.toString().replace(/\/$/, '')
}

function applyDocumentStatusUpdate(document: DocumentData, event: DocumentStatusEvent) {
  document.status = event.status
  document.updatedAt = new Date().toISOString()

  if (event.processingError) {
    document.processingError = event.processingError
  } else {
    delete document.processingError
  }
}

export function RealtimeBridge() {
  const dispatch = useAppDispatch()
  const { isAuthenticated, accessToken } = useAppSelector((state) => state.auth)
  const socketRef = useRef<Socket | null>(null)
  const refreshingRef = useRef(false)
  const [refreshToken] = useRefreshTokenMutation()

  const handleDocumentStatus = useEffectEvent((event: DocumentStatusEvent) => {
    dispatch(
      documentsApi.util.updateQueryData('listDocuments', undefined, (draft) => {
        const document = draft.documents.find((item) => item._id === event.documentId)
        if (document) {
          applyDocumentStatusUpdate(document, event)
        }
      }),
    )

    dispatch(
      documentsApi.util.updateQueryData('getDocument', event.documentId, (draft) => {
        applyDocumentStatusUpdate(draft, event)
      }),
    )

    dispatch(
      apiSlice.util.invalidateTags([
        { type: 'Documents', id: event.documentId },
        { type: 'Documents', id: 'LIST' },
      ]),
    )
  })

  const handleNotification = useEffectEvent((event: NotificationEvent) => {
    if (event.notification.type === 'DOCUMENT_READY') {
      dispatch(
        enqueueToast({
          id: event.notification.id,
          title: event.notification.title,
          description: event.notification.body,
          tone: 'success',
        }),
      )
      return
    }

    if (event.notification.type === 'PROCESSING_FAILED') {
      dispatch(
        enqueueToast({
          id: event.notification.id,
          title: event.notification.title,
          description: event.notification.body,
          tone: 'error',
        }),
      )
      return
    }

    if (event.notification.type === 'FLASHCARDS_READY' || event.notification.type === 'QUIZ_READY') {
      dispatch(
        enqueueToast({
          id: event.notification.id,
          title: event.notification.title,
          description: event.notification.body,
          tone: 'info',
        }),
      )
    }
  })

  useEffect(() => {
    if (!isAuthenticated || accessToken || refreshingRef.current) {
      return
    }

    refreshingRef.current = true
    void refreshToken()
      .unwrap()
      .then((result) => {
        dispatch(setTokens(result))
      })
      .catch(() => {
        // Let existing auth flow handle invalid refresh sessions.
      })
      .finally(() => {
        refreshingRef.current = false
      })
  }, [accessToken, dispatch, isAuthenticated, refreshToken])

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      socketRef.current?.disconnect()
      socketRef.current = null
      return
    }

    const socket = io(getSocketBaseUrl(), {
      auth: { token: accessToken },
      transports: ['websocket'],
    })

    socket.on('document:status', handleDocumentStatus)
    socket.on('notification:new', handleNotification)
    socketRef.current = socket

    return () => {
      socket.off('document:status', handleDocumentStatus)
      socket.off('notification:new', handleNotification)
      socket.disconnect()
      if (socketRef.current === socket) {
        socketRef.current = null
      }
    }
  }, [accessToken, handleDocumentStatus, handleNotification, isAuthenticated])

  return null
}
