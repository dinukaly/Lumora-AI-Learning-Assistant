import { useState, type FormEvent } from 'react'
import { BellRing, Megaphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useBroadcastAdminNotificationMutation } from './adminApi'

const AdminNotificationsPage = () => {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [result, setResult] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const [broadcastAdminNotification, { isLoading }] = useBroadcastAdminNotificationMutation()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setResult(null)

    try {
      const response = await broadcastAdminNotification({ title, body }).unwrap()
      setResult({
        tone: 'success',
        message: `${response.message} (${response.createdCount} recipients).`,
      })
      setTitle('')
      setBody('')
    } catch {
      setResult({
        tone: 'error',
        message: 'Could not send the broadcast notification.',
      })
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Broadcast Notification</CardTitle>
          <CardDescription>Send a system-wide message to every account and deliver it immediately through the existing notification channel.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-gray-700">Title</span>
              <input
                required
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Scheduled Maintenance"
                className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none transition focus:border-gray-400"
              />
            </label>

            <label className="block space-y-2 text-sm">
              <span className="font-medium text-gray-700">Message</span>
              <textarea
                required
                maxLength={1000}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Lumora will be down for maintenance on Sunday 2-4 AM UTC."
                className="min-h-40 w-full rounded-md border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-gray-400"
              />
            </label>

            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{title.length}/120 title characters</span>
              <span>{body.length}/1000 message characters</span>
            </div>

            {result && (
              <div className={`rounded-lg border px-4 py-3 text-sm ${result.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                {result.message}
              </div>
            )}

            <Button type="submit" disabled={isLoading || title.trim().length === 0 || body.trim().length === 0}>
              <Megaphone className="h-4 w-4" />
              {isLoading ? 'Sending…' : 'Send broadcast'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery Scope</CardTitle>
          <CardDescription>What this action does on the backend.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-gray-600">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-start gap-3">
              <BellRing className="mt-0.5 h-4 w-4 text-gray-500" />
              <div>
                <p className="font-medium text-gray-900">Realtime delivery</p>
                <p className="mt-1">Connected users receive the notification immediately through the existing Socket.IO `notification:new` channel.</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="font-medium text-gray-900">Persistence</p>
            <p className="mt-1">A stored `ADMIN_BROADCAST` notification is created for every user so the message also appears in each user&apos;s notification feed.</p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="font-medium text-gray-900">Audience</p>
            <p className="mt-1">The current backend fan-out targets all users in the database, including admin accounts.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default AdminNotificationsPage
