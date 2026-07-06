import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './providers/AuthProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { PageTransition } from './components/PageTransition';
import { InstallPrompt } from './components/InstallPrompt';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Dashboard } from './pages/Dashboard';
import { GoalDetail } from './pages/GoalDetail';
import { FindBuddy } from './pages/FindBuddy';
import { Messages } from './pages/Messages';
import { Notifications } from './pages/Notifications';
import { Challenges } from './pages/Challenges';
import { EditProfile } from './pages/EditProfile';
import { PublicProfile } from './pages/PublicProfile';
import { AuthCallback } from './pages/AuthCallback';
import { useAuthStore } from './store/useAuthStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

// Redirect authenticated users away from auth pages
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuthStore();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

// AnimatePresence needs the location key — must be inside BrowserRouter
const AnimatedRoutes: React.FC = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        {/* Public Landing Page */}
        <Route
          path="/"
          element={
            <PublicRoute>
              <PageTransition>
                <Home />
              </PageTransition>
            </PublicRoute>
          }
        />

        {/* Auth Routes */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <PageTransition>
                <Login />
              </PageTransition>
            </PublicRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicRoute>
              <PageTransition>
                <Signup />
              </PageTransition>
            </PublicRoute>
          }
        />

        {/* Protected App Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Layout>
                <PageTransition>
                  <Dashboard />
                </PageTransition>
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/goals/:goalId"
          element={
            <ProtectedRoute>
              <Layout>
                <PageTransition>
                  <GoalDetail />
                </PageTransition>
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/find-buddy"
          element={
            <ProtectedRoute>
              <Layout>
                <PageTransition>
                  <FindBuddy />
                </PageTransition>
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/messages"
          element={
            <ProtectedRoute>
              <Layout>
                <PageTransition>
                  <Messages />
                </PageTransition>
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/notifications"
          element={
            <ProtectedRoute>
              <Layout>
                <PageTransition>
                  <Notifications />
                </PageTransition>
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/challenges"
          element={
            <ProtectedRoute>
              <Layout>
                <PageTransition>
                  <Challenges />
                </PageTransition>
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/profile"
          element={
            <ProtectedRoute>
              <Layout>
                <PageTransition>
                  <EditProfile />
                </PageTransition>
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Public profile — no auth required */}
        <Route
          path="/u/:username"
          element={
            <PageTransition>
              <PublicProfile />
            </PageTransition>
          }
        />

        {/* Email confirmation callback — Supabase redirects here after email link click */}
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
};

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AnimatedRoutes />
          <InstallPrompt />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
