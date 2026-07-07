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
    // Preserve the intended destination so Login can redirect back after auth
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
