import { skipToken } from '@reduxjs/toolkit/query'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Brain,
  ChevronDown,
  ChevronUp,
  FileSearch,
  Lightbulb,
  Loader2,
  RefreshCcw,
  Sparkles,
} from 'lucide-react'
import { enqueueToast } from '@/app/uiSlice'
import { useAppDispatch } from '@/app/hooks'
import type { DocumentData } from '@/features/documents/documentsApi'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MarkdownContent } from '@/components/ui/markdown-content'
import {
  useExplainConceptMutation,
  useExtractConceptsMutation,
  useGetLatestActionsQuery,
  useSummarizeDocumentMutation,
  type AIActionsCitation,
  type ConceptsArtifact,
  type ExplainConceptResponse,
  type SummaryArtifact,
} from './aiActionsApi'

type ActiveResultView = 'summary' | 'concepts' | 'takeaways'
type DeepDiveKind = 'concept' | 'takeaway'

export default function WorkspaceActionsTab({ document }: { document: DocumentData }) {
  const dispatch = useAppDispatch()
  const [activeView, setActiveView] = useState<ActiveResultView>('summary')
  const [deepDiveTarget, setDeepDiveTarget] = useState<{
    topic: string
    kind: DeepDiveKind
  } | null>(null)
  const [deepDiveResult, setDeepDiveResult] = useState<ExplainConceptResponse | null>(null)

  const latestActionsQuery = useGetLatestActionsQuery(
    document.status === 'READY' ? document._id : skipToken,
  )
  const [summarizeDocument, { isLoading: isSummarizing }] = useSummarizeDocumentMutation()
  const [extractConcepts, { isLoading: isExtractingConcepts }] = useExtractConceptsMutation()
  const [explainConcept, { isLoading: isExplainingConcept }] = useExplainConceptMutation()

  const savedSummary = latestActionsQuery.data?.summary ?? null
  const savedConcepts = latestActionsQuery.data?.concepts ?? null

  useEffect(() => {
    if (savedSummary) {
      setActiveView((current) => (current === 'concepts' && savedConcepts ? current : 'summary'))
      return
    }

    if (savedConcepts) {
      setActiveView('concepts')
    }
  }, [savedConcepts, savedSummary])

  useEffect(() => {
    setDeepDiveTarget(null)
    setDeepDiveResult(null)
  }, [activeView, document._id, savedConcepts?.artifactId, savedSummary?.artifactId])

  const displayedCitations = useMemo(() => {
    if (deepDiveResult) {
      return deepDiveResult.citations
    }

    if (activeView === 'concepts') {
      return savedConcepts?.citations ?? []
    }

    return savedSummary?.citations ?? []
  }, [activeView, deepDiveResult, savedConcepts?.citations, savedSummary?.citations])

  const takeaways = savedSummary?.takeaways ?? []

  async function handleGenerateSummary(targetView: 'summary' | 'takeaways') {
    try {
      await summarizeDocument({ documentId: document._id }).unwrap()
      setActiveView(targetView)
      await latestActionsQuery.refetch()
      dispatch(
        enqueueToast({
          id: `ai-actions-summary-${Date.now()}`,
          tone: 'success',
          title: targetView === 'takeaways' ? 'Key takeaways ready' : 'Summary ready',
          description: 'The latest document summary has been generated and saved.',
        }),
      )
    } catch (error) {
      dispatch(
        enqueueToast({
          id: `ai-actions-summary-error-${Date.now()}`,
          tone: 'error',
          title: 'Could not generate summary',
          description: getApiErrorMessage(error),
        }),
      )
    }
  }

  async function handleGenerateConcepts() {
    try {
      await extractConcepts({ documentId: document._id }).unwrap()
      setActiveView('concepts')
      await latestActionsQuery.refetch()
      dispatch(
        enqueueToast({
          id: `ai-actions-concepts-${Date.now()}`,
          tone: 'success',
          title: 'Key concepts ready',
          description: 'The latest concept list has been generated and saved.',
        }),
      )
    } catch (error) {
      dispatch(
        enqueueToast({
          id: `ai-actions-concepts-error-${Date.now()}`,
          tone: 'error',
          title: 'Could not extract concepts',
          description: getApiErrorMessage(error),
        }),
      )
    }
  }

  async function handleExplainTopic(topic: string, kind: DeepDiveKind) {
    const normalizedTopic = topic.trim()
    if (!normalizedTopic) {
      return
    }

    if (
      deepDiveResult
      && deepDiveTarget
      && deepDiveTarget.topic === normalizedTopic
      && deepDiveTarget.kind === kind
    ) {
      setDeepDiveTarget(null)
      setDeepDiveResult(null)
      return
    }

    setDeepDiveTarget({ topic: normalizedTopic, kind })
    setDeepDiveResult(null)

    try {
      const result = await explainConcept({
        documentId: document._id,
        topic: normalizedTopic,
      }).unwrap()

      setDeepDiveResult(result)
    } catch (error) {
      setDeepDiveTarget(null)
      dispatch(
        enqueueToast({
          id: `ai-actions-deep-dive-error-${Date.now()}`,
          tone: 'error',
          title: 'Could not explain this item',
          description: getApiErrorMessage(error),
        }),
      )
    }
  }

  const actionsDisabled = document.status !== 'READY'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-900">AI Actions</h2>
          <p className="text-sm text-gray-500">
            Run quick grounded actions for summaries, concepts, and takeaways from this document.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => void latestActionsQuery.refetch()}
          disabled={actionsDisabled || latestActionsQuery.isFetching}
        >
          {latestActionsQuery.isFetching ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Refreshing...
            </>
          ) : (
            <>
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </>
          )}
        </Button>
      </div>

      {document.status !== 'READY' && (
        <Card className="border-amber-200 bg-amber-50/80">
          <CardHeader>
            <CardTitle className="text-amber-900">AI Actions unavailable for this document</CardTitle>
            <CardDescription className="text-amber-800">
              {document.status === 'PROCESSING'
                ? 'Wait for processing to finish before running summary and concept tools.'
                : 'This document needs a successful processing pass before AI Actions can be used.'}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <ActionCard
          title="Document summary"
          description="Generate a concise grounded summary of the full document."
          icon={Sparkles}
          buttonLabel="Generate summary"
          isLoading={isSummarizing}
          disabled={actionsDisabled || isSummarizing || isExtractingConcepts}
          onRun={() => void handleGenerateSummary('summary')}
        />
        <ActionCard
          title="Key concepts"
          description="Extract the most important concepts with short explanations."
          icon={Brain}
          buttonLabel="Extract concepts"
          isLoading={isExtractingConcepts}
          disabled={actionsDisabled || isSummarizing || isExtractingConcepts}
          onRun={() => void handleGenerateConcepts()}
        />
        <ActionCard
          title="Key takeaways"
          description="Pull out the main takeaways you should remember."
          icon={Lightbulb}
          buttonLabel="Generate takeaways"
          isLoading={isSummarizing}
          disabled={actionsDisabled || isSummarizing || isExtractingConcepts}
          onRun={() => void handleGenerateSummary('takeaways')}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>
              {activeView === 'summary'
                ? 'Latest summary'
                : activeView === 'concepts'
                  ? 'Latest concepts'
                  : 'Latest takeaways'}
            </CardTitle>
            <CardDescription>
              Saved AI Action results reload here without regenerating every time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {latestActionsQuery.isLoading ? (
              <div className="flex min-h-[16rem] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              </div>
            ) : latestActionsQuery.isError ? (
              <div className="flex min-h-[16rem] flex-col items-center justify-center gap-3 text-center text-red-700">
                <AlertCircle className="h-10 w-10 text-red-400" />
                <p className="text-sm">Couldn&apos;t load saved AI Action results. Try refreshing.</p>
              </div>
            ) : activeView === 'concepts' ? (
              savedConcepts ? (
                <ConceptResultsView
                  artifact={savedConcepts}
                  deepDiveTarget={deepDiveTarget}
                  deepDiveResult={deepDiveResult}
                  isExplainingConcept={isExplainingConcept}
                  onExplain={handleExplainTopic}
                />
              ) : (
                <EmptyResultState
                  title="No concepts generated yet"
                  description="Run the Key concepts action to save a grounded concept list here."
                  icon={Brain}
                />
              )
            ) : activeView === 'takeaways' ? (
              savedSummary && takeaways.length > 0 ? (
                <TakeawaysResultsView
                  artifact={savedSummary}
                  deepDiveTarget={deepDiveTarget}
                  deepDiveResult={deepDiveResult}
                  isExplainingConcept={isExplainingConcept}
                  onExplain={handleExplainTopic}
                />
              ) : (
                <EmptyResultState
                  title="No takeaways generated yet"
                  description="Run the Key takeaways action to save a grounded takeaway list here."
                  icon={Lightbulb}
                />
              )
            ) : savedSummary ? (
              <SummaryResultsView
                artifact={savedSummary}
                deepDiveTarget={deepDiveTarget}
                deepDiveResult={deepDiveResult}
                isExplainingConcept={isExplainingConcept}
                onExplain={handleExplainTopic}
              />
            ) : (
              <EmptyResultState
                title="No summary generated yet"
                description="Run the Document summary action to save a grounded summary here."
                icon={Sparkles}
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Saved outputs</CardTitle>
              <CardDescription>Jump between the latest saved AI Action results.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SavedArtifactButton
                label="Summary"
                description={savedSummary ? formatSavedDate(savedSummary.createdAt) : 'Not generated yet'}
                isActive={activeView === 'summary'}
                disabled={!savedSummary}
                onClick={() => setActiveView('summary')}
              />
              <SavedArtifactButton
                label="Concepts"
                description={savedConcepts ? formatSavedDate(savedConcepts.createdAt) : 'Not generated yet'}
                isActive={activeView === 'concepts'}
                disabled={!savedConcepts}
                onClick={() => setActiveView('concepts')}
              />
              <SavedArtifactButton
                label="Takeaways"
                description={savedSummary && takeaways.length > 0 ? formatSavedDate(savedSummary.createdAt) : 'Not generated yet'}
                isActive={activeView === 'takeaways'}
                disabled={!savedSummary || takeaways.length === 0}
                onClick={() => setActiveView('takeaways')}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Grounded citations</CardTitle>
              <CardDescription>
                Recent page-level evidence for the visible AI Action result or deep dive.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {displayedCitations.length > 0 ? (
                displayedCitations.map((citation, index) => (
                  <CitationCard
                    key={`${citation.chunkId}-${index}`}
                    citation={citation}
                  />
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                  Run an AI Action and its grounded citations will appear here.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function ActionCard({
  title,
  description,
  icon: Icon,
  buttonLabel,
  isLoading,
  disabled,
  onRun,
}: {
  title: string
  description: string
  icon: typeof Sparkles
  buttonLabel: string
  isLoading: boolean
  disabled: boolean
  onRun: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <div className="mb-3 w-fit rounded-2xl bg-emerald-100 p-3 text-emerald-700">
          <Icon className="h-5 w-5" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={onRun} disabled={disabled} className="w-full">
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running...
            </>
          ) : (
            buttonLabel
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

function EmptyResultState({
  title,
  description,
  icon: Icon,
}: {
  title: string
  description: string
  icon: typeof Sparkles
}) {
  return (
    <div className="flex min-h-[16rem] flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
      <div className="rounded-2xl bg-emerald-100 p-4 text-emerald-700">
        <Icon className="h-6 w-6" />
      </div>
      <div className="space-y-2">
        <p className="text-base font-semibold text-gray-900">{title}</p>
        <p className="max-w-md text-sm text-gray-500">{description}</p>
      </div>
    </div>
  )
}

function SummaryResultsView({
  artifact,
  deepDiveTarget,
  deepDiveResult,
  isExplainingConcept,
  onExplain,
}: {
  artifact: SummaryArtifact
  deepDiveTarget: { topic: string; kind: DeepDiveKind } | null
  deepDiveResult: ExplainConceptResponse | null
  isExplainingConcept: boolean
  onExplain: (topic: string, kind: DeepDiveKind) => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-emerald-50/70 px-5 py-4 text-sm text-emerald-900">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
          Saved {formatSavedDate(artifact.createdAt)}
        </div>
        <MarkdownContent
          content={artifact.summary}
          className="text-emerald-950 [&_*]:text-inherit [&_blockquote]:text-emerald-900/80 [&_code]:text-inherit"
        />
      </div>
      {artifact.takeaways.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Included takeaways</h3>
          <div className="grid gap-3">
            {artifact.takeaways.map((takeaway) => (
              <DeepDiveListItem
                key={takeaway}
                topic={takeaway}
                kind="takeaway"
                label={takeaway}
                deepDiveTarget={deepDiveTarget}
                deepDiveResult={deepDiveResult}
                isExplainingConcept={isExplainingConcept}
                onExplain={onExplain}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TakeawaysResultsView({
  artifact,
  deepDiveTarget,
  deepDiveResult,
  isExplainingConcept,
  onExplain,
}: {
  artifact: SummaryArtifact
  deepDiveTarget: { topic: string; kind: DeepDiveKind } | null
  deepDiveResult: ExplainConceptResponse | null
  isExplainingConcept: boolean
  onExplain: (topic: string, kind: DeepDiveKind) => void
}) {
  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Saved {formatSavedDate(artifact.createdAt)}
      </div>
      <div className="grid gap-3">
        {artifact.takeaways.map((takeaway) => (
          <DeepDiveListItem
            key={takeaway}
            topic={takeaway}
            kind="takeaway"
            label={takeaway}
            tone="amber"
            deepDiveTarget={deepDiveTarget}
            deepDiveResult={deepDiveResult}
            isExplainingConcept={isExplainingConcept}
            onExplain={onExplain}
          />
        ))}
      </div>
    </div>
  )
}

function ConceptResultsView({
  artifact,
  deepDiveTarget,
  deepDiveResult,
  isExplainingConcept,
  onExplain,
}: {
  artifact: ConceptsArtifact
  deepDiveTarget: { topic: string; kind: DeepDiveKind } | null
  deepDiveResult: ExplainConceptResponse | null
  isExplainingConcept: boolean
  onExplain: (topic: string, kind: DeepDiveKind) => void
}) {
  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Saved {formatSavedDate(artifact.createdAt)}
      </div>
      <div className="grid gap-4">
        {artifact.concepts.map((concept) => (
          <Card key={concept.title} className="border-gray-200 shadow-none">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <CardTitle className="text-lg">{concept.title}</CardTitle>
                  <CardDescription className="text-sm leading-6 text-gray-600">
                    <MarkdownContent
                      content={concept.description}
                      className="text-gray-600 [&_*]:text-inherit [&_blockquote]:text-gray-500 [&_code]:text-inherit"
                    />
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onExplain(concept.title, 'concept')}
                  disabled={
                    isExplainingConcept
                    && deepDiveTarget?.topic === concept.title
                    && deepDiveTarget.kind === 'concept'
                  }
                >
                  {isExplainingConcept
                  && deepDiveTarget?.topic === concept.title
                  && deepDiveTarget.kind === 'concept' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Explaining...
                    </>
                  ) : deepDiveResult?.topic === concept.title && deepDiveTarget?.kind === 'concept' ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Hide deep dive
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Deep dive
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            {(deepDiveTarget?.topic === concept.title || deepDiveResult?.topic === concept.title) && (
              <CardContent className="pt-0">
                <DeepDiveExplanation
                  topic={concept.title}
                  kind="concept"
                  deepDiveTarget={deepDiveTarget}
                  deepDiveResult={deepDiveResult}
                  isExplainingConcept={isExplainingConcept}
                />
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}

function DeepDiveListItem({
  topic,
  label,
  kind,
  tone = 'neutral',
  deepDiveTarget,
  deepDiveResult,
  isExplainingConcept,
  onExplain,
}: {
  topic: string
  label: string
  kind: DeepDiveKind
  tone?: 'neutral' | 'amber'
  deepDiveTarget: { topic: string; kind: DeepDiveKind } | null
  deepDiveResult: ExplainConceptResponse | null
  isExplainingConcept: boolean
  onExplain: (topic: string, kind: DeepDiveKind) => void
}) {
  const isCurrentTarget = deepDiveTarget?.topic === topic && deepDiveTarget.kind === kind
  const isExpanded = deepDiveResult?.topic === topic && deepDiveTarget?.kind === kind

  return (
    <div
      className={`rounded-2xl border px-4 py-4 ${
        tone === 'amber'
          ? 'border-amber-200 bg-amber-50/70'
          : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className={`text-sm leading-6 ${tone === 'amber' ? 'text-amber-950' : 'text-gray-700'}`}>
          {label}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onExplain(topic, kind)}
          disabled={isExplainingConcept && isCurrentTarget}
        >
          {isExplainingConcept && isCurrentTarget ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Explaining...
            </>
          ) : isExpanded ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Hide deep dive
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              Deep dive
            </>
          )}
        </Button>
      </div>

      {(isCurrentTarget || isExpanded) && (
        <div className="mt-4">
          <DeepDiveExplanation
            topic={topic}
            kind={kind}
            deepDiveTarget={deepDiveTarget}
            deepDiveResult={deepDiveResult}
            isExplainingConcept={isExplainingConcept}
          />
        </div>
      )}
    </div>
  )
}

function DeepDiveExplanation({
  topic,
  kind,
  deepDiveTarget,
  deepDiveResult,
  isExplainingConcept,
}: {
  topic: string
  kind: DeepDiveKind
  deepDiveTarget: { topic: string; kind: DeepDiveKind } | null
  deepDiveResult: ExplainConceptResponse | null
  isExplainingConcept: boolean
}) {
  const isLoading = isExplainingConcept && deepDiveTarget?.topic === topic && deepDiveTarget.kind === kind
  const isActiveResult = deepDiveResult?.topic === topic && deepDiveTarget?.kind === kind

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-4 text-sm text-emerald-900">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Building a grounded deep dive for this {kind}...
        </div>
      </div>
    )
  }

  if (!isActiveResult || !deepDiveResult) {
    return null
  }

  return (
    <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
        Detailed grounded explanation
      </div>
      <MarkdownContent
        content={deepDiveResult.explanation}
        className="text-emerald-950 [&_*]:text-inherit [&_blockquote]:text-emerald-900/80 [&_code]:text-inherit"
      />
    </div>
  )
}

function SavedArtifactButton({
  label,
  description,
  isActive,
  disabled,
  onClick,
}: {
  label: string
  description: string
  isActive: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
        disabled
          ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
          : isActive
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900 shadow-sm'
            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-1 text-xs text-gray-500">{description}</div>
    </button>
  )
}

function CitationCard({ citation }: { citation: AIActionsCitation }) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
        <FileSearch className="h-3.5 w-3.5" />
        Page {citation.pageNumber || 'Unknown'}
      </div>
      <p className="mt-2 text-sm leading-6 text-emerald-950">{citation.snippet}</p>
    </div>
  )
}

function formatSavedDate(dateString: string) {
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getApiErrorMessage(error: unknown) {
  if (
    error
    && typeof error === 'object'
    && 'data' in error
    && error.data
    && typeof error.data === 'object'
    && 'error' in error.data
  ) {
    const nestedError = error.data.error
    if (
      nestedError
      && typeof nestedError === 'object'
      && 'message' in nestedError
      && typeof nestedError.message === 'string'
    ) {
      return nestedError.message
    }
  }

  if (
    error
    && typeof error === 'object'
    && 'message' in error
    && typeof error.message === 'string'
  ) {
    return error.message
  }

  return 'Please try again.'
}
