import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { skipToken } from '@reduxjs/toolkit/query'
import { AlertCircle, Brain, FileText, Loader2, RefreshCcw, Sparkles, Trophy } from 'lucide-react'
import { enqueueToast } from '@/app/uiSlice'
import { useAppDispatch } from '@/app/hooks'
import { useListDocumentsQuery, type DocumentData } from '@/features/documents/documentsApi'
import {
  useGenerateQuizMutation,
  useGetQuizQuery,
  useListQuizzesQuery,
  useSubmitQuizMutation,
  type QuizDifficulty,
  type QuizListItem,
  type QuizSubmissionResult,
} from './quizzesApi'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface QuizzesExperienceProps {
  documentId?: string
  documentTitle?: string
  documentStatus?: DocumentData['status']
  embedded?: boolean
}

export function QuizzesExperience({
  documentId,
  documentTitle,
  documentStatus,
  embedded = false,
}: QuizzesExperienceProps) {
  const dispatch = useAppDispatch()
  const [selectedDocumentId, setSelectedDocumentId] = useState(documentId ?? '')
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [submittedResult, setSubmittedResult] = useState<QuizSubmissionResult | null>(null)
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('MEDIUM')

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

  const quizzesQuery = useListQuizzesQuery({ documentId: effectiveDocumentId })
  const quizDetailQuery = useGetQuizQuery(selectedQuizId ?? skipToken)
  const [submitQuiz, { isLoading: isSubmitting }] = useSubmitQuizMutation()
  const [generateQuiz, { isLoading: isGenerating }] = useGenerateQuizMutation()

  const quizzes = useMemo(() => quizzesQuery.data?.quizzes ?? [], [quizzesQuery.data?.quizzes])
  const selectedQuiz = useMemo(
    () => quizzes.find((quiz) => quiz.id === selectedQuizId) ?? null,
    [quizzes, selectedQuizId],
  )

  useEffect(() => {
    if (quizzes.length === 0) {
      setSelectedQuizId(null)
      setAnswers({})
      setSubmittedResult(null)
      return
    }

    const stillExists = quizzes.some((quiz) => quiz.id === selectedQuizId)
    if (!selectedQuizId || !stillExists) {
      setSelectedQuizId(quizzes[0].id)
      setAnswers({})
      setSubmittedResult(null)
    }
  }, [quizzes, selectedQuizId])

  useEffect(() => {
    setAnswers({})
    setSubmittedResult(null)
  }, [selectedQuizId])

  const answeredCount = Object.keys(answers).length
  const totalQuestions = quizDetailQuery.data?.questions.length ?? 0
  const interactionDisabled = selectedDocument?.status !== 'READY'
  const averageScore = quizzes.length > 0
    ? Math.round(
        quizzes.reduce((total, quiz) => {
          if (quiz.latestScore == null || quiz.latestTotalQuestions == null || quiz.latestTotalQuestions === 0) {
            return total
          }

          return total + (quiz.latestScore / quiz.latestTotalQuestions) * 100
        }, 0) / quizzes.length,
      )
    : 0

  async function handleGenerateQuiz() {
    if (!effectiveDocumentId) {
      dispatch(
        enqueueToast({
          id: `quiz-select-${Date.now()}`,
          tone: 'info',
          title: 'Choose a document first',
          description: 'Select a ready document before queueing quiz generation.',
        }),
      )
      return
    }

    try {
      const result = await generateQuiz({
        documentId: effectiveDocumentId,
        questionCount: 8,
        difficulty,
      }).unwrap()

      dispatch(
        enqueueToast({
          id: result.jobId,
          tone: 'info',
          title: 'Quiz generation queued',
          description: 'Give it a moment, then refresh this view to load the new quiz.',
        }),
      )
    } catch (error) {
      dispatch(
        enqueueToast({
          id: `quiz-generate-error-${Date.now()}`,
          tone: 'error',
          title: 'Could not queue quiz',
          description: error instanceof Error ? error.message : 'Please try again.',
        }),
      )
    }
  }

  async function handleSubmitQuiz() {
    if (!selectedQuizId || !quizDetailQuery.data) return
    if (quizDetailQuery.data.questions.some((question) => answers[question.id] == null)) {
      dispatch(
        enqueueToast({
          id: `quiz-incomplete-${Date.now()}`,
          tone: 'info',
          title: 'Finish every question',
          description: 'Select an option for each question before submitting.',
        }),
      )
      return
    }

    try {
      const orderedAnswers = quizDetailQuery.data.questions.map((question) => answers[question.id])
      const result = await submitQuiz({
        quizId: selectedQuizId,
        answers: orderedAnswers,
      }).unwrap()

      setSubmittedResult(result)
      dispatch(
        enqueueToast({
          id: `quiz-submit-${result.attemptId}`,
          tone: 'success',
          title: 'Quiz submitted',
          description: `You scored ${result.score} out of ${result.totalQuestions}.`,
        }),
      )
    } catch (error) {
      dispatch(
        enqueueToast({
          id: `quiz-submit-error-${Date.now()}`,
          tone: 'error',
          title: 'Quiz submission failed',
          description: error instanceof Error ? error.message : 'Please try again.',
        }),
      )
    }
  }

  return (
    <div className={embedded ? 'space-y-6' : 'space-y-8 p-8'}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          {embedded ? (
            <>
              <h2 className="text-xl font-semibold text-gray-900">Document Quizzes</h2>
              <p className="text-sm text-gray-500">
                Generate and take quizzes for {documentTitle ?? 'this document'}.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-gray-900">Quizzes</h1>
              <p className="text-sm text-gray-500">
                Generate document-grounded quizzes, answer question sets, and review scored results.
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {!embedded && (
            <select
              value={selectedDocumentId}
              onChange={(event) => setSelectedDocumentId(event.target.value)}
              className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-emerald-400"
              aria-label="Filter quizzes by document"
            >
              <option value="">All documents</option>
              {documentsData?.documents.map((document) => (
                <option key={document._id} value={document._id}>
                  {document.title}
                </option>
              ))}
            </select>
          )}

          <select
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value as QuizDifficulty)}
            className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-emerald-400"
            aria-label="Quiz generation difficulty"
          >
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>

          <Button
            variant="outline"
            onClick={() => {
              void quizzesQuery.refetch()
              if (selectedQuizId) {
                void quizDetailQuery.refetch()
              }
            }}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>

          <Button
            onClick={() => void handleGenerateQuiz()}
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
                Generate Quiz
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Quizzes"
          value={quizzes.length}
          description="Quiz sets available in this scope"
        />
        <MetricCard
          title="Questions"
          value={selectedQuiz?.questionCount ?? 0}
          description="Questions in the selected quiz"
        />
        <MetricCard
          title="Average score"
          value={`${averageScore}%`}
          description="Based on the latest saved attempt per quiz"
        />
      </div>

      {selectedDocument && selectedDocument.status !== 'READY' && (
        <Card className="border-amber-200 bg-amber-50/80">
          <CardHeader>
            <CardTitle className="text-amber-900">Quizzes unavailable for this document</CardTitle>
            <CardDescription className="text-amber-800">
              {selectedDocument.status === 'PROCESSING'
                ? 'Wait for processing to finish before generating or taking quizzes.'
                : 'This document needs a successful processing pass before quizzes can be used.'}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quiz list</CardTitle>
              <CardDescription>Pick a quiz and work through the questions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {quizzesQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading quizzes…
                </div>
              ) : quizzes.length > 0 ? (
                quizzes.map((quiz) => (
                  <QuizListButton
                    key={quiz.id}
                    quiz={quiz}
                    isActive={quiz.id === selectedQuizId}
                    onSelect={() => setSelectedQuizId(quiz.id)}
                  />
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                  <div className="mb-2 flex items-center gap-2 text-gray-700">
                    <Brain className="h-4 w-4" />
                    No quizzes available yet
                  </div>
                  Generate one for a ready document to start practicing.
                </div>
              )}
            </CardContent>
          </Card>

          {selectedDocument && (
            <Card>
              <CardHeader>
                <CardTitle>Source document</CardTitle>
                <CardDescription>Jump back to the document workspace when needed.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-2xl bg-gray-50 px-4 py-3">
                  <div className="font-semibold text-gray-900">{selectedDocument.title}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-gray-500">
                    {selectedDocument.status}
                  </div>
                </div>
                <Button asChild variant="outline" className="mt-4 w-full">
                  <Link to={`/workspace/${selectedDocument._id}`}>
                    <FileText className="h-4 w-4" />
                    Open workspace
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>{selectedQuiz?.title ?? 'Quiz session'}</CardTitle>
              <CardDescription>
                {submittedResult
                  ? 'Results and explanations for your latest attempt.'
                  : 'Answer each question, then submit to see scored results.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {quizDetailQuery.isFetching && !quizDetailQuery.data ? (
                <div className="flex min-h-[18rem] items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                </div>
              ) : quizDetailQuery.isError ? (
                <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3 text-center text-red-700">
                  <AlertCircle className="h-10 w-10 text-red-400" />
                  <p className="text-sm">Couldn&apos;t load this quiz. Please refresh and try again.</p>
                </div>
              ) : !quizDetailQuery.data ? (
                <div className="flex min-h-[18rem] flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
                  <div className="rounded-2xl bg-emerald-100 p-4 text-emerald-700">
                    <Brain className="h-6 w-6" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-base font-semibold text-gray-900">Pick a quiz to begin</p>
                    <p className="max-w-md text-sm text-gray-500">
                      Select a quiz from the list to answer questions and review explanations.
                    </p>
                  </div>
                </div>
              ) : submittedResult ? (
                <QuizResultsView
                  quizTitle={quizDetailQuery.data.title}
                  questions={quizDetailQuery.data.questions}
                  result={submittedResult}
                  onRetry={() => {
                    setAnswers({})
                    setSubmittedResult(null)
                  }}
                />
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                    <span>{answeredCount} of {totalQuestions} answered</span>
                    <span>{selectedQuiz?.questionCount ?? totalQuestions} questions</span>
                  </div>

                  {quizDetailQuery.data.questions.map((question, questionIndex) => (
                    <Card key={question.id} className="border-gray-200 shadow-none">
                      <CardHeader className="pb-4">
                        <CardDescription>Question {questionIndex + 1}</CardDescription>
                        <CardTitle className="text-lg leading-7">{question.question}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {question.options.map((option, optionIndex) => {
                          const isSelected = answers[question.id] === optionIndex

                          return (
                            <button
                              key={`${question.id}-${optionIndex}`}
                              type="button"
                              onClick={() => {
                                setAnswers((current) => ({
                                  ...current,
                                  [question.id]: optionIndex,
                                }))
                              }}
                              className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                                isSelected
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 shadow-sm'
                                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
                                  isSelected
                                    ? 'border-emerald-500 bg-emerald-500 text-white'
                                    : 'border-gray-300 text-gray-500'
                                }`}>
                                  {String.fromCharCode(65 + optionIndex)}
                                </div>
                                <span>{option}</span>
                              </div>
                            </button>
                          )
                        })}
                      </CardContent>
                    </Card>
                  ))}

                  <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-gray-600">
                      Submit once every question has an answer.
                    </div>
                    <Button
                      onClick={() => void handleSubmitQuiz()}
                      disabled={isSubmitting || totalQuestions === 0}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Scoring...
                        </>
                      ) : (
                        <>
                          <Trophy className="h-4 w-4" />
                          Submit Quiz
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
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

function QuizListButton({
  quiz,
  isActive,
  onSelect,
}: {
  quiz: QuizListItem
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
      <div className="line-clamp-2 text-sm font-semibold">{quiz.title}</div>
      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
        <span>{quiz.questionCount} questions</span>
        <span>{formatRelativeDate(quiz.createdAt)}</span>
      </div>
      {quiz.latestScore != null && quiz.latestTotalQuestions != null ? (
        <div className="mt-2 text-xs text-emerald-700">
          Latest score: {quiz.latestScore}/{quiz.latestTotalQuestions}
        </div>
      ) : null}
    </button>
  )
}

function QuizResultsView({
  quizTitle,
  questions,
  result,
  onRetry,
}: {
  quizTitle: string
  questions: Array<{ id: number; question: string; options: string[] }>
  result: QuizSubmissionResult
  onRetry: () => void
}) {
  const percentage = result.totalQuestions > 0
    ? Math.round((result.score / result.totalQuestions) * 100)
    : 0

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
              Latest result
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{quizTitle}</h3>
            <p className="text-sm text-gray-600">
              You scored {result.score} out of {result.totalQuestions} questions correctly.
            </p>
          </div>
          <div className="rounded-2xl bg-white px-5 py-4 text-center shadow-sm">
            <div className="text-3xl font-bold text-emerald-700">{percentage}%</div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Score</div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {result.results.map((questionResult) => {
          const question = questions[questionResult.questionIndex]
          const selectedLabel = question.options[questionResult.selected] ?? 'No answer'
          const correctLabel = question.options[questionResult.correct] ?? 'Unknown'
          const isCorrect = questionResult.selected === questionResult.correct

          return (
            <Card key={questionResult.questionIndex} className={isCorrect ? 'border-emerald-200' : 'border-red-200'}>
              <CardHeader className="pb-4">
                <CardDescription>Question {questionResult.questionIndex + 1}</CardDescription>
                <CardTitle className="text-lg leading-7">{question.question}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className={`rounded-2xl px-4 py-3 ${isCorrect ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>
                  <div className="font-semibold">{isCorrect ? 'Correct' : 'Needs review'}</div>
                  <div className="mt-1">Your answer: {selectedLabel}</div>
                  {!isCorrect && <div className="mt-1">Correct answer: {correctLabel}</div>}
                </div>
                {questionResult.explanation && (
                  <div className="rounded-2xl bg-gray-50 px-4 py-3 text-gray-700">
                    <div className="font-semibold text-gray-900">Explanation</div>
                    <div className="mt-1 leading-6">{questionResult.explanation}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={onRetry}>
          <RefreshCcw className="h-4 w-4" />
          Retake quiz
        </Button>
      </div>
    </div>
  )
}

function formatRelativeDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export default QuizzesExperience
