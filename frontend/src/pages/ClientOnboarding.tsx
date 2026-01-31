import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  XCircle,
  Link2,
  ArrowRight,
  Shield,
  Zap,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { OrgConnectionStatus } from '../types';
import * as adminApi from '../api/admin';

export default function ClientOnboarding() {
  const { clientSlug } = useParams<{ clientSlug: string }>();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<OrgConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Check for callback params
  const isConnected = searchParams.get('connected') === 'true';
  const companyName = searchParams.get('companyName');
  const callbackError = searchParams.get('error');

  useEffect(() => {
    if (clientSlug) {
      loadStatus();
    }
  }, [clientSlug]);

  const loadStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminApi.getOrgStatus(clientSlug!);
      setStatus(data);
    } catch (err) {
      setError('Organization not found or inactive');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    window.location.href = adminApi.getConnectUrl(clientSlug!);
  };

  const handleDisconnect = async () => {
    try {
      await adminApi.disconnectOrg(clientSlug!);
      loadStatus();
    } catch (err) {
      setError('Failed to disconnect');
    }
  };

  const copyWebhookUrl = () => {
    const webhookUrl = `${window.location.origin}/api/v1/webhook/${clientSlug}`;
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4 text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto" />
          <h1 className="text-2xl font-bold text-gray-900 mt-4">Organization Not Found</h1>
          <p className="text-gray-500 mt-2">{error || 'Please check the URL and try again.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Success/Error Banner */}
      {isConnected && (
        <div className="bg-green-500 text-white px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">
              Successfully connected to {companyName || 'QuickBooks'}!
            </span>
          </div>
        </div>
      )}
      {callbackError && (
        <div className="bg-red-500 text-white px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-2">
            <XCircle className="w-5 h-5" />
            <span className="font-medium">{callbackError}</span>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-gray-200 mb-6">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-sm text-gray-600">{status.organization.name}</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-900">
            Connect to QuickBooks Online
          </h1>
          <p className="text-lg text-gray-500 mt-4 max-w-2xl mx-auto">
            Automatically sync your orders to QuickBooks invoices. No manual data entry required.
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Connection Status */}
          <div className={`px-8 py-6 ${status.qbo.connected ? 'bg-green-50' : 'bg-gray-50'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    status.qbo.connected ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                >
                  {status.qbo.connected ? (
                    <CheckCircle2 className="w-6 h-6 text-white" />
                  ) : (
                    <Link2 className="w-6 h-6 text-gray-500" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {status.qbo.connected
                      ? `Connected to ${status.qbo.companyName || 'QuickBooks'}`
                      : 'Not Connected'}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {status.qbo.connected
                      ? `Realm ID: ${status.qbo.realmId}`
                      : 'Connect your QuickBooks account to start syncing'}
                  </p>
                </div>
              </div>
              {status.qbo.connected ? (
                <button
                  onClick={handleDisconnect}
                  className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                >
                  Connect QuickBooks
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Webhook URL Section */}
          {status.qbo.connected && (
            <div className="px-8 py-6 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Your Webhook URL</h3>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-4 py-2.5 bg-gray-100 rounded-lg text-sm text-gray-700 font-mono overflow-x-auto">
                  {`${window.location.origin}/api/v1/webhook/${clientSlug}`}
                </code>
                <button
                  onClick={copyWebhookUrl}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-green-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Configure this URL in your e-commerce platform to send order data automatically.
              </p>
            </div>
          )}

          {/* Features */}
          <div className="px-8 py-6 border-t border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <FeatureCard
                icon={<Zap className="w-5 h-5 text-yellow-500" />}
                title="Automatic Sync"
                description="Orders are automatically converted to invoices in real-time"
              />
              <FeatureCard
                icon={<Shield className="w-5 h-5 text-blue-500" />}
                title="Secure Connection"
                description="Your data is encrypted and securely transmitted"
              />
              <FeatureCard
                icon={<RefreshCw className="w-5 h-5 text-green-500" />}
                title="Error Recovery"
                description="Failed syncs are automatically retried"
              />
            </div>
          </div>

          {/* Plan Info */}
          <div className="px-8 py-4 bg-gray-50 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Current plan:{' '}
                <span className="font-medium text-gray-900 capitalize">
                  {status.organization.planTier}
                </span>
              </span>
              <a
                href="#"
                className="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
              >
                View usage
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Need help?{' '}
            <a href="#" className="text-gray-900 font-medium hover:underline">
              View documentation
            </a>{' '}
            or{' '}
            <a href="mailto:support@example.com" className="text-gray-900 font-medium hover:underline">
              contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <h4 className="font-medium text-gray-900">{title}</h4>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}
