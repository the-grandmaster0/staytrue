import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuthStore();
  const location = useLocation();

  if (loading) {
    return null;
  }

  if (!user) {
    // Send unauthenticated users to the landing page.
    // Preserve the intended destination so the user can be redirected back after signing in.
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
