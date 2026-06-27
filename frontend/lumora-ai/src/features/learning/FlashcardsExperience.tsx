import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppDispatch } from '@/app/hooks'
import { enqueueToast } from '@/app/uiSlice'
import { useListDocumentsQuery, type DocumentData } from '@/features/documents/documentsApi'
import {
  useGenerateFlashcardsMutation,
  useListFlashcardsQuery,
  useReviewFlashcardMutation,
  type FlashcardDifficulty,
  type FlashcardItem,
} from './flashcardsApi'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertCircle,
  BookOpenCheck,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCcw,
  RotateCw,
  Sparkles,
} from 'lucide-react'

interface FlashcardsExperienceProps {
  documentId?: string
  documentTitle?: string
  documentStatus?: DocumentData['status']
  embedded?: boolean
}

export function FlashcardsExperience({
  documentId,
  documentTitle,
  documentStatus,
  embedded = false,
}: FlashcardsExperienceProps) {
  const dispatch = useAppDispatch()
  const [selectedDocumentId, setSelectedDocumentId] = useState(documentId ?? '')
  const [dueOnly, setDueOnly] = useState(false)
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)

  const { data: documentsData } = useListDocumentsQuery(undefined, {
    skip: embedded,
  })

  useEffect(() => {
    if (documentId) {
      setSelectedDocumentId(documentId)
    }
  }, [documentId])

  const effectiveDocumentId = embedded ? documentId : selectedDocumentId || undefined
  const selectedDocument = useMemo(() => {
    if (embedded) {
      return documentId
        ? ({
            _id: documentId,
            title: documentTitle ?? 'Selected document',
            status: documentStatus ?? 'READY',
          } as Pick<DocumentData, '_id' | 'title' | 'status'>)
        : null
    }

    return documentsData?.documents.find((document) => document._id === effectiveDocumentId) ?? null
  }, [documentId, documentStatus, documentTitle, documentsData?.documents, effectiveDocumentId, embedded])

  const allCardsQuery = useListFlashcardsQuery({
    documentId: effectiveDocumentId,
    page: 1,
    limit: 100,
  })
  const visibleCardsQuery = useListFlashcardsQuery({
    documentId: effectiveDocumentId,
    dueOnly,
    page: 1,
    limit: 100,
  })
  const dueCardsQuery = useListFlashcardsQuery({
    documentId: effectiveDocumentId,
    dueOnly: true,
    page: 1,
    limit: 1,
  })

  const [reviewFlashcard, { isLoading: isReviewing }] = useReviewFlashcardMutation()
  const [generateFlashcards, { isLoading: isGenerating }] = useGenerateFlashcardsMutation()

  const allCards = useMemo(() => allCardsQuery.data?.flashcards ?? [], [allCardsQuery.data?.flashcards])
  const visibleCards = useMemo(
    () => visibleCardsQuery.data?.flashcards ?? [],
    [visibleCardsQuery.data?.flashcards],
  )
  const dueCount = dueCardsQuery.data?.total ?? 0

  useEffect(() => {
    if (visibleCards.length === 0) {
      setActiveCardId(null)
      setRevealed(false)
      return
    }

    const stillExists = visibleCards.some((card) => card.id === activeCardId)
    if (!activeCardId || !stillExists) {
      const preferredCard = visibleCards.find((card) => isDue(card.nextReviewAt)) ?? visibleCards[0]
      setActiveCardId(preferredCard.id)
      setRevealed(false)
    }
  }, [activeCardId, visibleCards])

  const activeCard = useMemo(() => {
    return visibleCards.find((card) => card.id === activeCardId) ?? null
  }, [activeCardId, visibleCards])

  const reviewedCount = allCards.filter((card) => card.reviewCount > 0).length
  const reviewedProgress = allCards.length > 0 ? Math.round((reviewedCount / allCards.length) * 100) : 0
  const avgSuccessRate = allCards.length > 0
    ? Math.round(
        allCards.reduce((total, card) => {
          if (card.reviewCount === 0) return total
          return total + card.successCount / card.reviewCount
        }, 0) / allCards.length * 100,
      )
    : 0

  const interactionDisabled = selectedDocument?.status !== 'READY'

  async function handleGenerateFlashcards() {
    if (!effectiveDocumentId) {
      dispatch(
        enqueueToast({
          id: `flashcards-select-${Date.now()}`,
          tone: 'info',
          title: 'Choose a document first',
          description: 'Select a document before starting flashcard generation.',
        }),
      )
      return
    }

    try {
      const result = await generateFlashcards({
        documentId: effectiveDocumentId,
        count: 12,
      }).unwrap()

      dispatch(
        enqueueToast({
          id: result.jobId,
          tone: 'info',
          title: 'Flashcard generation queued',
          description: 'Give it a moment, then refresh this view to load the new deck.',
        }),
      )
    } catch (error) {
      dispatch(
        enqueueToast({
          id: `flashcards-generate-error-${Date.now()}`,
          tone: 'error',
          title: 'Could not queue flashcards',
          description: error instanceof Error ? error.message : 'Please try again.',
        }),
      )
    }
  }

  async function handleReview(difficulty: FlashcardDifficulty) {
    if (!activeCard) return

    try {
      await reviewFlashcard({ id: activeCard.id, difficulty }).unwrap()
      setRevealed(false)
      dispatch(
        enqueueToast({
          id: `flashcard-review-${activeCard.id}-${Date.now()}`,
          tone: 'success',
          title: 'Review saved',
          description: `Scheduled next review as ${difficulty.toLowerCase()}.`,
        }),
      )
    } catch (error) {
      dispatch(
        enqueueToast({
          id: `flashcard-review-error-${Date.now()}`,
          tone: 'error',
          title: 'Review failed',
          description: error instanceof Error ? error.message : 'Please try again.',
        }),
      )
    }
  }

  const topSection = embedded ? (
    <div className="space-y-2">
      <h2 className="text-xl font-semibold text-gray-900">Document Flashcards</h2>
      <p className="text-sm text-gray-500">
        Review cards generated from {documentTitle ?? 'this document'}.
      </p>
    </div>
  ) : (
    <div className="space-y-2">
      <h1 className="text-3xl font-bold text-gray-900">Flashcards</h1>
      <p className="text-sm text-gray-500">
        Review due cards, generate new decks, and keep active recall moving forward.
      </p>
    </div>
  )

  return (
    <div className={embedded ? 'space-y-6' : 'space-y-8 p-8'}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        {topSection}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {!embedded && (
            <select
              value={selectedDocumentId}
              onChange={(event) => setSelectedDocumentId(event.target.value)}
              className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-emerald-400"
              aria-label="Filter flashcards by document"
            >
              <option value="">All documents</option>
              {documentsData?.documents.map((document) => (
                <option key={document._id} value={document._id}>
                  {document.title}
                </option>
              ))}
            </select>
          )}

          <Button variant="outline" onClick={() => setDueOnly((current) => !current)}>
            <CheckCircle2 className="h-4 w-4" />
            {dueOnly ? 'Showing due only' : 'Show due only'}
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              void allCardsQuery.refetch()
              void visibleCardsQuery.refetch()
              void dueCardsQuery.refetch()
            }}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>

          <Button
            onClick={() => void handleGenerateFlashcards()}
            disabled={isGenerating || !effectiveDocumentId || interactionDisabled}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Queueing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Flashcards
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Total cards"
          value={allCardsQuery.data?.total ?? 0}
          description="Cards available in this selection"
        />
        <MetricCard
          title="Due now"
          value={dueCount}
          description="Ready for immediate review"
        />
        <MetricCard
          title="Progress"
          value={`${reviewedProgress}%`}
          description={`${reviewedCount} reviewed • ${avgSuccessRate}% average success`}
        />
      </div>

      {selectedDocument && selectedDocument.status !== 'READY' && (
        <Card className="border-amber-200 bg-amber-50/80">
          <CardHeader>
            <CardTitle className="text-amber-900">Flashcards unavailable for this document</CardTitle>
            <CardDescription className="text-amber-800">
              {selectedDocument.status === 'PROCESSING'
                ? 'Wait for processing to finish before generating or reviewing flashcards.'
                : 'This document needs a successful processing pass before flashcards can be used.'}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Review deck</CardTitle>
            <CardDescription>
              Flip the card, reveal the answer, then score your recall.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {(allCardsQuery.isLoading || visibleCardsQuery.isLoading) && (
              <div className="flex min-h-[22rem] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              </div>
            )}

            {!allCardsQuery.isLoading && visibleCardsQuery.isError && (
              <div className="flex min-h-[22rem] flex-col items-center justify-center gap-3 text-center text-red-700">
                <AlertCircle className="h-10 w-10 text-red-400" />
                <p className="text-sm">Couldn&apos;t load flashcards. Please refresh and try again.</p>
              </div>
            )}

            {!allCardsQuery.isLoading && !visibleCardsQuery.isError && !activeCard && (
              <div className="flex min-h-[22rem] flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
                <div className="rounded-2xl bg-emerald-100 p-4 text-emerald-700">
                  <BookOpenCheck className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                  <p className="text-base font-semibold text-gray-900">No flashcards ready yet</p>
                  <p className="max-w-md text-sm text-gray-500">
                    Generate a deck for a ready document, or switch off the due-only filter if you want to browse all cards.
                  </p>
                </div>
              </div>
            )}

            {activeCard && (
              <div className="space-y-6">
                <FlashcardReviewCard
                  flashcard={activeCard}
                  revealed={revealed}
                  onFlip={() => setRevealed((current) => !current)}
                />

                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="outline" onClick={() => setRevealed((current) => !current)}>
                    <RotateCw className="h-4 w-4" />
                    {revealed ? 'Hide answer' : 'Show answer'}
                  </Button>

                  <div className="text-xs text-gray-500">
                    Next review {formatDateTime(activeCard.nextReviewAt)}
                  </div>
                </div>

                {revealed && (
                  <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">How well did you remember it?</p>
                      <p className="mt-1 text-sm text-gray-500">
                        We&apos;ll schedule the next review based on your confidence.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <ReviewButton
                        label="Hard"
                        tone="hard"
                        disabled={isReviewing}
                        onClick={() => void handleReview('HARD')}
                      />
                      <ReviewButton
                        label="Good"
                        tone="medium"
                        disabled={isReviewing}
                        onClick={() => void handleReview('MEDIUM')}
                      />
                      <ReviewButton
                        label="Easy"
                        tone="easy"
                        disabled={isReviewing}
                        onClick={() => void handleReview('EASY')}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Deck overview</CardTitle>
              <CardDescription>
                Browse cards and jump to a specific prompt.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {visibleCards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => {
                    setActiveCardId(card.id)
                    setRevealed(false)
                  }}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    card.id === activeCardId
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 shadow-sm'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="line-clamp-2 text-sm font-semibold">{card.front}</div>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                    <span>{card.reviewCount} reviews</span>
                    <span>{isDue(card.nextReviewAt) ? 'Due now' : formatRelativeDate(card.nextReviewAt)}</span>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {selectedDocument && (
            <Card>
              <CardHeader>
                <CardTitle>Source document</CardTitle>
                <CardDescription>Jump back into the underlying study material.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-gray-600">
                <div className="rounded-2xl bg-gray-50 px-4 py-3">
                  <div className="font-semibold text-gray-900">{selectedDocument.title}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-gray-500">
                    {selectedDocument.status}
                  </div>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link to={`/workspace/${selectedDocument._id}`}>
                    <FileText className="h-4 w-4" />
                    Open workspace
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  title,
  value,
  description,
}: {
  title: string
  value: number | string
  description: string
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500">{description}</p>
      </CardContent>
    </Card>
  )
}

function FlashcardReviewCard({
  flashcard,
  revealed,
  onFlip,
}: {
  flashcard: FlashcardItem
  revealed: boolean
  onFlip: () => void
}) {
  return (
    <button
      type="button"
      onClick={onFlip}
      className="group w-full text-left"
      aria-pressed={revealed}
      aria-label={revealed ? 'Hide flashcard answer' : 'Reveal flashcard answer'}
    >
      <div className="relative min-h-[20rem] [perspective:1400px]">
        <div
          className={`relative h-full min-h-[20rem] w-full rounded-[2rem] transition-transform duration-500 [transform-style:preserve-3d] ${
            revealed ? '[transform:rotateY(180deg)]' : ''
          }`}
        >
          <FlashcardFace
            tone="front"
            eyebrow="Prompt"
            content={flashcard.front}
            footer="Tap or click to reveal the answer"
          />
          <FlashcardFace
            tone="back"
            eyebrow="Answer"
            content={flashcard.back}
            footer="Now choose how confidently you recalled it"
            back
          />
        </div>
      </div>
    </button>
  )
}

function FlashcardFace({
  eyebrow,
  content,
  footer,
  tone,
  back = false,
}: {
  eyebrow: string
  content: string
  footer: string
  tone: 'front' | 'back'
  back?: boolean
}) {
  return (
    <div
      className={`absolute inset-0 flex min-h-[20rem] flex-col justify-between rounded-[2rem] border p-8 shadow-sm [backface-visibility:hidden] ${
        tone === 'front'
          ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 text-gray-900'
          : 'border-sky-200 bg-gradient-to-br from-sky-50 via-white to-indigo-50 text-gray-900'
      } ${back ? '[transform:rotateY(180deg)]' : ''}`}
    >
      <div className="space-y-4">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">{eyebrow}</div>
        <div className="text-2xl font-semibold leading-10">{content}</div>
      </div>
      <div className="text-sm text-gray-500">{footer}</div>
    </div>
  )
}

function ReviewButton({
  label,
  tone,
  disabled,
  onClick,
}: {
  label: string
  tone: 'hard' | 'medium' | 'easy'
  disabled?: boolean
  onClick: () => void
}) {
  const toneClassName =
    tone === 'hard'
      ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
      : tone === 'medium'
        ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-w-24 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${toneClassName}`}
    >
      {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
    </button>
  )
}

function isDue(dateString: string) {
  return new Date(dateString).getTime() <= Date.now()
}

function formatRelativeDate(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default FlashcardsExperience
