import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from '@/features/auth/LoginPage'
import RegisterPage from '@/features/auth/RegisterPage'
import DashboardPage from '@/features/dashboard/DashboardPage'
import DocumentsPage from '@/features/documents/DocumentsPage'
import FlashcardsPage from '@/features/learning/FlashcardsPage'
import QuizzesPage from '@/features/learning/QuizzesPage'
import ProfilePage from '@/features/auth/ProfilePage'
import WorkspacePage from '@/features/workspace/WorkspacePage'
import AppShell from '@/components/layout/AppShell'
import AuthGuard from '@/components/layout/AuthGuard'
import AdminGuard from '@/components/layout/AdminGuard'
import VerifiedGuard from '@/components/layout/VerifiedGuard'
import AdminLayout from '@/features/admin/AdminLayout'
import AdminOverviewPage from '@/features/admin/AdminOverviewPage'
import AdminUsersPage from '@/features/admin/AdminUsersPage'
import AdminDocumentsPage from '@/features/admin/AdminDocumentsPage'
import AdminJobsPage from '@/features/admin/AdminJobsPage'
import AdminAnalyticsPage from '@/features/admin/AdminAnalyticsPage'
import AdminNotificationsPage from '@/features/admin/AdminNotificationsPage'
import EmailVerificationPendingPage from '@/features/auth/EmailVerificationPendingPage'
import VerifyEmailPage from '@/features/auth/VerifyEmailPage'
import { ToastViewport } from '@/components/ui/toast-viewport'

const App = () => {
  return (
    <>
      <ToastViewport />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route element={<AuthGuard />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/verify-email/pending" element={<EmailVerificationPendingPage />} />
            <Route element={<VerifiedGuard />}>
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/workspace/:documentId" element={<WorkspacePage />} />
              <Route path="/flashcards" element={<FlashcardsPage />} />
              <Route path="/quizzes" element={<QuizzesPage />} />
            </Route>
            <Route element={<AdminGuard />}>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminOverviewPage />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="documents" element={<AdminDocumentsPage />} />
                <Route path="jobs" element={<AdminJobsPage />} />
                <Route path="analytics" element={<AdminAnalyticsPage />} />
                <Route path="notifications" element={<AdminNotificationsPage />} />
              </Route>
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  )
}

export default App
