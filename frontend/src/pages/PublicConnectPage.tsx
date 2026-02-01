/**
 * Public Connect Page
 *
 * A minimal, isolated page for end clients to connect their QuickBooks account.
 * No admin interface, no navigation, no internal links.
 */

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

interface PublicOrgInfo {
  name: string;
  slug: string;
}

export default function PublicConnectPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();

  const [orgInfo, setOrgInfo] = useState<PublicOrgInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Check for callback status
  const isConnected = searchParams.get('connected') === 'true';
  const callbackError = searchParams.get('error');
  const companyName = searchParams.get('companyName');

  useEffect(() => {
    if (slug) {
      loadOrgInfo();
    }
  }, [slug]);

  const loadOrgInfo = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/public/org/${slug}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError('This connection link is invalid or has expired.');
        return;
      }

      setOrgInfo(data.data);
    } catch (err) {
      setError('Unable to load connection page. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    setConnecting(true);
    // Redirect to OAuth flow with public=true flag
    window.location.href = `/api/v1/connect/${slug}?source=public`;
  };

  // Loading state
  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </PageWrapper>
    );
  }

  // Error state
  if (error || !orgInfo) {
    return (
      <PageWrapper>
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Connection Unavailable</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </PageWrapper>
    );
  }

  // Success state - after OAuth callback
  if (isConnected) {
    return (
      <PageWrapper noIndex>
        <div className="text-center py-16">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-3">Successfully Connected!</h1>
          <p className="text-gray-600 mb-2">
            Your QuickBooks account {companyName && <span className="font-medium">({companyName})</span>} has been linked to <span className="font-medium">{orgInfo.name}</span>.
          </p>
          <p className="text-gray-500 text-sm mt-6">
            You can safely close this window.
          </p>
        </div>
      </PageWrapper>
    );
  }

  // Error from OAuth callback
  if (callbackError) {
    return (
      <PageWrapper noIndex>
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Connection Failed</h1>
          <p className="text-gray-500 mb-6">{decodeURIComponent(callbackError)}</p>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="inline-flex items-center px-6 py-3 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            Try Again
          </button>
        </div>
      </PageWrapper>
    );
  }

  // Main connect state
  return (
    <PageWrapper noIndex>
      <div className="text-center py-12">
        {/* Organization info */}
        <div className="mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-2xl font-bold">
            {orgInfo.name.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">{orgInfo.name}</h1>
          <p className="text-gray-500 mt-1">QuickBooks Integration</p>
        </div>

        {/* Connect card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 max-w-md mx-auto">
          <div className="mb-6">
            <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-green-50 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-gray-900 mb-2">Connect Your QuickBooks</h2>
            <p className="text-gray-500 text-sm">
              Securely link your QuickBooks Online account to enable automatic invoice syncing.
            </p>
          </div>

          <button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 font-medium"
          >
            {connecting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Connecting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                Connect to QuickBooks
              </>
            )}
          </button>

          <p className="text-xs text-gray-400 mt-4">
            You'll be redirected to Intuit to authorize the connection.
          </p>
        </div>

        {/* Security note */}
        <div className="mt-8 flex items-center justify-center gap-2 text-gray-400 text-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>Secure connection powered by Intuit</span>
        </div>
      </div>
    </PageWrapper>
  );
}

/**
 * Minimal page wrapper with no navigation
 */
function PageWrapper({ children, noIndex = true }: { children: React.ReactNode; noIndex?: boolean }) {
  useEffect(() => {
    // Set page title
    document.title = 'Connect QuickBooks';

    // Add noindex meta tag
    if (noIndex) {
      let metaRobots = document.querySelector('meta[name="robots"]');
      if (!metaRobots) {
        metaRobots = document.createElement('meta');
        metaRobots.setAttribute('name', 'robots');
        document.head.appendChild(metaRobots);
      }
      metaRobots.setAttribute('content', 'noindex, nofollow');
    }

    // Cleanup on unmount
    return () => {
      const metaRobots = document.querySelector('meta[name="robots"]');
      if (metaRobots) {
        metaRobots.remove();
      }
    };
  }, [noIndex]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-lg mx-auto px-4 py-12">
        {children}
      </div>
    </div>
  );
}
