import { useState } from 'react'
import { Chrome, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getGoogleAuthStartUrl, isGoogleAuthEnabled } from './socialAuth'

type GoogleAuthButtonProps = {
  disabled?: boolean
  mode: 'login' | 'signup'
}

export default function GoogleAuthButton({ disabled = false, mode }: GoogleAuthButtonProps) {
  const [isRedirecting, setIsRedirecting] = useState(false)

  if (!isGoogleAuthEnabled()) {
    return null
  }

  const label = mode === 'login' ? 'Continue with Google' : 'Sign up with Google'

  const handleGoogleAuth = () => {
    setIsRedirecting(true)
    window.location.assign(getGoogleAuthStartUrl())
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
          <span className="bg-white px-3">or continue with</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        disabled={disabled || isRedirecting}
        onClick={handleGoogleAuth}
        className="w-full"
      >
        {isRedirecting ? <Loader2 className="animate-spin" /> : <Chrome className="text-sky-600" />}
        {isRedirecting ? 'Redirecting to Google...' : label}
      </Button>
    </div>
  )
}
