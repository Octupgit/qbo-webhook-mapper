/**
 * Admin Login Page
 *
 * Microsoft SSO authentication only.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoading } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Check for error in URL params
  useEffect(() => {
    const errorParam = searchParams.get('error');
    const messageParam = searchParams.get('message');
    if (errorParam) {
      setError(messageParam || `Authentication failed: ${errorParam}`);
    }
  }, [searchParams]);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/admin');
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleMicrosoftLogin = () => {
    setIsRedirecting(true);
    setError(null);
    // Redirect to backend Microsoft auth endpoint
    const apiUrl = import.meta.env.VITE_API_URL || '/api';
    window.location.href = `${apiUrl}/admin/auth/microsoft`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1 className="text-center text-3xl font-bold text-gray-900">
            QBO Webhook Mapper
          </h1>
          <h2 className="mt-2 text-center text-xl text-gray-600">
            Admin Dashboard
          </h2>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="bg-white shadow-md rounded-lg p-8 space-y-6">
          {/* Microsoft SSO Button */}
          <button
            onClick={handleMicrosoftLogin}
            disabled={isRedirecting}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg shadow-sm bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {isRedirecting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-600"></div>
                Redirecting to Microsoft...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                </svg>
                Sign in with Microsoft
              </>
            )}
          </button>

          <p className="text-center text-sm text-gray-500">
            Use your organization's Microsoft account to sign in.
          </p>
        </div>

        <p className="text-center text-xs text-gray-500">
          Authorized personnel only. Access is logged.
        </p>
      </div>
    </div>
  );
}
