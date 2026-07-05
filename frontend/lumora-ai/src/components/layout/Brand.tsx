import { cn } from '@/lib/utils'

interface BrandMarkProps {
  className?: string
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <img
      src="/favicon.svg"
      alt="Lumora logo"
      className={cn('h-8 w-8 rounded-lg object-cover', className)}
    />
  )
}

interface BrandLockupProps {
  className?: string
  markClassName?: string
  textClassName?: string
}

export function BrandLockup({ className, markClassName, textClassName }: BrandLockupProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <BrandMark className={markClassName} />
      <span className={cn('text-xl font-bold text-gray-900 font-display', textClassName)}>
        Lumora
      </span>
    </div>
  )
}
