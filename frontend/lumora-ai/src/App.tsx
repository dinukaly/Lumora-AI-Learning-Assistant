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
import AdminLayout from '@/features/admin/AdminLayout'
import AdminOverviewPage from '@/features/admin/AdminOverviewPage'
import AdminUsersPage from '@/features/admin/AdminUsersPage'
import AdminDocumentsPage from '@/features/admin/AdminDocumentsPage'
import AdminJobsPage from '@/features/admin/AdminJobsPage'
import AdminAnalyticsPage from '@/features/admin/AdminAnalyticsPage'
import AdminNotificationsPage from '@/features/admin/AdminNotificationsPage'
import { ToastViewport } from '@/components/ui/toast-viewport'

const App = () => {
  return (
    <>
      <ToastViewport />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<AuthGuard />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/workspace/:documentId" element={<WorkspacePage />} />
            <Route path="/flashcards" element={<FlashcardsPage />} />
            <Route path="/quizzes" element={<QuizzesPage />} />
            <Route path="/profile" element={<ProfilePage />} />
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
