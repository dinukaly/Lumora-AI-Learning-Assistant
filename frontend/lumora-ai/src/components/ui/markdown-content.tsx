import type { HTMLAttributes, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownContentProps {
  content: string
  className?: string
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={cn('space-y-4 text-sm leading-7', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-xl font-semibold leading-8">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-semibold leading-8">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-semibold leading-7">{children}</h3>,
          p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-2 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-2 pl-5">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-emerald-300 pl-4 text-gray-600">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-gray-200" />,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-emerald-700 underline underline-offset-4"
            >
              {children}
            </a>
          ),
          code: ({ children, className: codeClassName }) => {
            const text = String(children).replace(/\n$/, '')
            const isBlock = Boolean(codeClassName)

            if (isBlock) {
              return (
                <code className={cn('block overflow-x-auto rounded-xl bg-gray-950 px-4 py-3 font-mono text-[13px] leading-6 text-gray-100', codeClassName)}>
                  {text}
                </code>
              )
            }

            return (
              <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[13px] text-gray-900">
                {text}
              </code>
            )
          },
          pre: ({ children }) => <pre className="my-0">{children}</pre>,
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-900">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border-b border-gray-200 px-3 py-2 align-top">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

type DivProps = HTMLAttributes<HTMLDivElement> & { children?: ReactNode }

export function MarkdownSection({ className, children, ...props }: DivProps) {
  return (
    <div className={cn('space-y-4', className)} {...props}>
      {children}
    </div>
  )
}
