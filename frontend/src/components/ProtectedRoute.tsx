/**
 * Protected Route Component
 *
 * Wraps routes that require authentication.
 * Redirects to login if not authenticated.
 * Redirects to change-password if must_change_password is true.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowPasswordChange?: boolean; // Allow access even if must_change_password is true
}

export default function ProtectedRoute({ children, allowPasswordChange = false }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, mustChangePassword } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Save the attempted URL for redirecting after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If user must change password and this route doesn't allow it, redirect
  if (mustChangePassword && !allowPasswordChange) {
    return <Navigate to="/admin/change-password" replace />;
  }

  return <>{children}</>;
}
