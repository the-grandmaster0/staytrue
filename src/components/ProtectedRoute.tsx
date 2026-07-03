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
    return null; // AuthProvider already handles global loading screen
  }

  if (!user) {
    // Redirect unauthenticated users to the home page
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
