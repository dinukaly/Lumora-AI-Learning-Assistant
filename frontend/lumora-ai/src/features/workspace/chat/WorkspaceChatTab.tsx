import { useEffect, useMemo, useRef, useState } from 'react'
import { skipToken } from '@reduxjs/toolkit/query'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { apiSlice } from '@/app/apiSlice'
import type { AppDispatch } from '@/app/store'
import type { DocumentData } from '@/features/documents/documentsApi'
import {
  useGetConversationQuery,
  useListConversationsQuery,
  type ConversationCitation,
  type ConversationDetail,
  type ConversationListItem,
  type ConversationMessage,
} from './conversationsApi'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertCircle,
  Bot,
  FileSearch,
  Loader2,
  MessageSquarePlus,
  SendHorizonal,
  Sparkles,
  User,
} from 'lucide-react'

interface WorkspaceChatTabProps {
  document: DocumentData
}

interface StreamingMessageState {
  conversationId?: string
  userMessage: string
  assistantContent: string
}

export function WorkspaceChatTab({ document }: WorkspaceChatTabProps) {
  const dispatch = useAppDispatch()
  const accessToken = useAppSelector((state) => state.auth.accessToken)
  const currentUser = useAppSelector((state) => state.auth.user)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [streamingState, setStreamingState] = useState<StreamingMessageState | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const messageViewportRef = useRef<HTMLDivElement | null>(null)

  const {
    data: conversationList,
    isLoading: isConversationListLoading,
  } = useListConversationsQuery(
    document.status === 'READY' ? { documentId: document._id, page: 1, limit: 10 } : skipToken,
  )

  const {
    data: conversationDetail,
    isFetching: isConversationDetailFetching,
  } = useGetConversationQuery(selectedConversationId ?? skipToken)

  useEffect(() => {
    if (!conversationList?.conversations.length) {
      setSelectedConversationId(null)
      return
    }

    const conversationStillExists = conversationList.conversations.some(
      (conversation) => conversation.id === selectedConversationId,
    )

    if (!selectedConversationId || !conversationStillExists) {
      setSelectedConversationId(conversationList.conversations[0].id)
    }
  }, [conversationList, selectedConversationId])

  useEffect(() => {
    const viewport = messageViewportRef.current
    if (!viewport) return

    viewport.scrollTop = viewport.scrollHeight
  }, [conversationDetail, streamingState, isConversationDetailFetching])

  const displayMessages = useMemo(() => {
    return buildDisplayMessages(conversationDetail, streamingState)
  }, [conversationDetail, streamingState])

  const citations = useMemo(() => {
    return [...displayMessages]
      .reverse()
      .flatMap((message) => message.citations ?? [])
      .filter((citation, index, items) => {
        const signature = `${citation.pageNumber ?? 'na'}:${citation.snippet ?? ''}`
        return (
          items.findIndex(
            (item) => `${item.pageNumber ?? 'na'}:${item.snippet ?? ''}` === signature,
          ) === index
        )
      })
      .slice(0, 5)
  }, [displayMessages])

  const chatDisabled = document.status !== 'READY' || !accessToken

  async function handleSendMessage() {
    const message = draft.trim()
    if (!message || !accessToken || isStreaming || document.status !== 'READY') {
      return
    }

    setDraft('')
    setStreamError(null)
    setIsStreaming(true)
    setStreamingState({
      conversationId: selectedConversationId ?? undefined,
      userMessage: message,
      assistantContent: '',
    })

    const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

    try {
      const response = await fetch(`${apiBaseUrl}/v1/ai/chat?stream=true`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          conversationId: selectedConversationId ?? undefined,
          documentId: document._id,
          message,
        }),
      })

      if (!response.ok || !response.body) {
        throw new Error(`Chat request failed (${response.status})`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent = 'message'
      let finalConversationId = selectedConversationId ?? null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() ?? ''

        for (const block of blocks) {
          const parsed = parseSseBlock(block, currentEvent)
          currentEvent = parsed.nextEvent

          if (!parsed.data) continue

          if (parsed.event === 'conversation' && parsed.data.conversationId) {
            finalConversationId = parsed.data.conversationId as string
            setStreamingState((current) =>
              current
                ? {
                    ...current,
                    conversationId: finalConversationId ?? undefined,
                  }
                : current,
            )
            setSelectedConversationId(finalConversationId)
          } else if (parsed.event === 'chunk' && typeof parsed.data.content === 'string') {
            const chunkContent = parsed.data.content
            setStreamingState((current) =>
              current
                ? {
                    ...current,
                    assistantContent: current.assistantContent + chunkContent,
                  }
                : current,
            )
          } else if (parsed.event === 'done') {
            if (
              parsed.data
              && parsed.data.conversationId
              && typeof parsed.data.conversationId === 'string'
            ) {
              finalConversationId = parsed.data.conversationId
              setSelectedConversationId(finalConversationId)
            }

            await refreshConversationData(dispatch, finalConversationId)
            setStreamingState(null)
          } else if (parsed.event === 'error' && typeof parsed.data.message === 'string') {
            throw new Error(parsed.data.message)
          }
        }
      }

      if (buffer.trim()) {
        const parsed = parseSseBlock(buffer, currentEvent)
        const bufferedConversationId =
          parsed.data && typeof parsed.data.conversationId === 'string'
            ? parsed.data.conversationId
            : null

        if (parsed.event === 'done' && bufferedConversationId) {
          finalConversationId = bufferedConversationId
          setSelectedConversationId(finalConversationId)
          await refreshConversationData(dispatch, finalConversationId)
          setStreamingState(null)
        }
      }

      await dispatch(
        apiSlice.util.invalidateTags([
          { type: 'Conversations', id: 'LIST' },
          { type: 'Conversations', id: selectedConversationId ?? 'LIST' },
        ]),
      )
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Failed to stream assistant response'
      setDraft(message)
      setStreamError(messageText)
    } finally {
      setIsStreaming(false)
      setStreamingState(null)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-6">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-gray-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Document Chat</CardTitle>
                <CardDescription>
                  Ask grounded questions and get answers tied back to this document.
                </CardDescription>
              </div>
              <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                {document.status === 'READY' ? 'Grounded answers ready' : 'Chat unlocks when processing is complete'}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 p-4 sm:p-6">
            <div
              ref={messageViewportRef}
              className="max-h-[32rem] min-h-[24rem] space-y-4 overflow-y-auto rounded-2xl bg-gray-50 p-4"
            >
              {displayMessages.length === 0 && !isConversationDetailFetching ? (
                <div className="flex h-full min-h-[18rem] flex-col items-center justify-center gap-4 text-center">
                  <div className="rounded-2xl bg-emerald-100 p-4 text-emerald-700">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-base font-semibold text-gray-900">Start a grounded conversation</p>
                    <p className="max-w-md text-sm text-gray-500">
                      Ask for explanations, summaries, or clarifications. Every answer will stay scoped to this document and include citations when available.
                    </p>
                  </div>
                </div>
              ) : (
                displayMessages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    userName={currentUser?.name}
                  />
                ))
              )}

              {isConversationDetailFetching && !streamingState && (
                <div className="flex items-center justify-center py-6 text-sm text-gray-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Refreshing conversation…
                </div>
              )}
            </div>

            {streamError && (
              <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{streamError}</span>
              </div>
            )}

            {document.status !== 'READY' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {document.status === 'PROCESSING'
                  ? 'We’ll unlock chat as soon as processing finishes and the document is ready.'
                  : 'This document needs a successful processing pass before grounded chat can run.'}
              </div>
            )}

            <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void handleSendMessage()
                  }
                }}
                disabled={chatDisabled || isStreaming}
                placeholder={
                  document.status === 'READY'
                    ? 'Ask what this document says, or request an explanation…'
                    : 'Chat becomes available when the document is ready.'
                }
                className="min-h-[7rem] w-full resize-none rounded-xl border border-transparent bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-emerald-200 focus:bg-emerald-50/40"
                aria-label="Document chat message"
              />

              <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-gray-500">
                  Enter sends • Shift+Enter adds a new line
                </div>
                <Button
                  onClick={() => void handleSendMessage()}
                  disabled={chatDisabled || isStreaming || !draft.trim()}
                  className="sm:min-w-32"
                >
                  {isStreaming ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Streaming…
                    </>
                  ) : (
                    <>
                      <SendHorizonal className="h-4 w-4" />
                      Send
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Saved conversations</CardTitle>
            <CardDescription>Recent chats for this document stay attached here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isConversationListLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading history…
              </div>
            ) : conversationList?.conversations.length ? (
              conversationList.conversations.map((conversation) => (
                <ConversationListButton
                  key={conversation.id}
                  conversation={conversation}
                  isActive={conversation.id === selectedConversationId}
                  onSelect={() => setSelectedConversationId(conversation.id)}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                <div className="mb-2 flex items-center gap-2 text-gray-700">
                  <MessageSquarePlus className="h-4 w-4" />
                  No saved chats yet
                </div>
                Your first question will create a conversation for this document automatically.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest citations</CardTitle>
            <CardDescription>Recent grounded references from this workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {citations.length ? (
              citations.map((citation, index) => (
                <CitationCard key={`${citation.pageNumber ?? 'na'}-${index}`} citation={citation} />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                Ask a question and we’ll surface page-level citations here.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  userName,
}: {
  message: ConversationMessage
  userName?: string
}) {
  const isAssistant = message.role === 'assistant'

  return (
    <div className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`flex max-w-[85%] gap-3 ${
          isAssistant ? 'flex-row' : 'flex-row-reverse'
        }`}
      >
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
            isAssistant ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-900 text-white'
          }`}
        >
          {isAssistant ? <Bot className="h-5 w-5" /> : <User className="h-5 w-5" />}
        </div>

        <div className="space-y-2">
          <div className={`text-xs font-semibold ${isAssistant ? 'text-emerald-700' : 'text-gray-500'}`}>
            {isAssistant ? 'Lumora' : userName || 'You'}
          </div>

          <div
            className={`rounded-3xl px-4 py-3 text-sm leading-7 shadow-sm ${
              isAssistant
                ? 'bg-white text-gray-800 ring-1 ring-gray-200'
                : 'bg-gray-900 text-white'
            }`}
          >
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>

          {isAssistant && message.citations?.length ? (
            <div className="grid gap-2">
              {message.citations.slice(0, 3).map((citation, index) => (
                <CitationCard
                  key={`${message.id}-${citation.pageNumber ?? 'na'}-${index}`}
                  citation={citation}
                  compact
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function CitationCard({
  citation,
  compact = false,
}: {
  citation: ConversationCitation
  compact?: boolean
}) {
  return (
    <div className={`rounded-2xl border border-emerald-100 bg-emerald-50/70 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
        <FileSearch className="h-3.5 w-3.5" />
        Page {citation.pageNumber ?? 'Unknown'}
      </div>
      {citation.snippet ? (
        <p className="mt-2 text-sm leading-6 text-emerald-950">{citation.snippet}</p>
      ) : (
        <p className="mt-2 text-sm text-emerald-900">Grounded reference saved for this response.</p>
      )}
    </div>
  )
}

function ConversationListButton({
  conversation,
  isActive,
  onSelect,
}: {
  conversation: ConversationListItem
  isActive: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
        isActive
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900 shadow-sm'
          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <div className="line-clamp-1 text-sm font-semibold">{conversation.title}</div>
      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
        <span>{conversation.messageCount} messages</span>
        <span>{formatRelativeDate(conversation.updatedAt)}</span>
      </div>
    </button>
  )
}

function buildDisplayMessages(
  conversationDetail: ConversationDetail | undefined,
  streamingState: StreamingMessageState | null,
) {
  const baseMessages = conversationDetail?.messages ?? []

  if (!streamingState) {
    return baseMessages
  }

  const pendingMessages: ConversationMessage[] = [
    {
      id: `pending-user-${streamingState.userMessage}`,
      role: 'user',
      content: streamingState.userMessage,
      createdAt: new Date().toISOString(),
    },
  ]

  if (streamingState.assistantContent) {
    pendingMessages.push({
      id: `pending-assistant-${streamingState.userMessage}`,
      role: 'assistant',
      content: streamingState.assistantContent,
      createdAt: new Date().toISOString(),
    })
  }

  return [...baseMessages, ...pendingMessages]
}

function formatRelativeDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

async function refreshConversationData(
  dispatch: AppDispatch,
  conversationId: string | null,
) {
  if (!conversationId) return

  await dispatch(
    apiSlice.util.invalidateTags([
      { type: 'Conversations', id: 'LIST' },
      { type: 'Conversations', id: conversationId },
    ]),
  )
}

function parseSseBlock(block: string, currentEvent: string) {
  let event = currentEvent
  const dataLines: string[] = []

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
  }

  const dataText = dataLines.join('\n')

  return {
    event,
    nextEvent: event,
    data: dataText ? (JSON.parse(dataText) as Record<string, unknown>) : null,
  }
}

export default WorkspaceChatTab
