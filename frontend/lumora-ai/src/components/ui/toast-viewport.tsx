import { useEffect } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { dismissToast, type ToastItem, type ToastTone } from '@/app/uiSlice'

const TONE_CONFIG: Record<ToastTone, { icon: typeof Info; className: string }> = {
  success: {
    icon: CheckCircle2,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  },
  error: {
    icon: AlertCircle,
    className: 'border-red-200 bg-red-50 text-red-900',
  },
  info: {
    icon: Info,
    className: 'border-sky-200 bg-sky-50 text-sky-900',
  },
}

function ToastCard({ toast }: { toast: ToastItem }) {
  const dispatch = useAppDispatch()
  const { icon: Icon, className } = TONE_CONFIG[toast.tone]

  useEffect(() => {
    const timer = window.setTimeout(() => {
      dispatch(dismissToast(toast.id))
    }, 5000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [dispatch, toast.id])

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm ${className}`}
      role="status"
      aria-live="polite"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{toast.title}</p>
        {toast.description && <p className="mt-1 text-sm opacity-90">{toast.description}</p>}
      </div>
      <button
        type="button"
        className="rounded-md p-1 opacity-60 transition hover:bg-black/5 hover:opacity-100"
        onClick={() => dispatch(dismissToast(toast.id))}
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function ToastViewport() {
  const toasts = useAppSelector((state) => state.ui.toasts)

  if (toasts.length === 0) {
    return null
  }

  return (
    <div className="pointer-events-none fixed right-4 top-20 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 sm:right-6">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
