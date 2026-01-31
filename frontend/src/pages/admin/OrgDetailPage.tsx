import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Building2,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Zap,
  Activity,
  Settings,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { Organization, OrganizationStats, OrgConnectionStatus } from '../../types';
import * as adminApi from '../../api/admin';

type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export default function OrgDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  // Debug log
  console.log('[OrgDetailPage] Mounted with slug:', slug);

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [stats, setStats] = useState<OrganizationStats | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<OrgConnectionStatus | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (slug) {
      loadOrganizationData();
    }
  }, [slug]);

  const loadOrganizationData = async () => {
    if (!slug) {
      console.error('[OrgDetailPage] No slug provided');
      setError('No organization slug provided');
      setLoadingState('error');
      return;
    }

    console.log('[OrgDetailPage] Loading data for slug:', slug);
    setLoadingState('loading');
    setError(null);

    try {
      // First, get connection status which includes org info
      const status = await adminApi.getOrgStatus(slug);
      console.log('[OrgDetailPage] Connection status:', status);
      setConnectionStatus(status);

      // Get full organization details by ID
      if (status?.organization?.id) {
        const org = await adminApi.getOrganization(status.organization.id);
        console.log('[OrgDetailPage] Organization:', org);
        setOrganization(org);

        // Get stats
        try {
          const orgStats = await adminApi.getOrganizationStats(status.organization.id);
          console.log('[OrgDetailPage] Stats:', orgStats);
          setStats(orgStats);
        } catch (statsError) {
          console.warn('[OrgDetailPage] Failed to load stats:', statsError);
          // Non-fatal, continue without stats
        }
      }

      setLoadingState('success');
    } catch (err) {
      console.error('[OrgDetailPage] Error loading organization:', err);
      setError(err instanceof Error ? err.message : 'Failed to load organization');
      setLoadingState('error');
    }
  };

  const handleConnectQBO = () => {
    if (connectionStatus?.connectUrl) {
      window.location.href = connectionStatus.connectUrl;
    }
  };

  const handleDisconnect = async () => {
    if (!slug) return;

    if (!confirm('Are you sure you want to disconnect from QuickBooks?')) {
      return;
    }

    try {
      await adminApi.disconnectOrg(slug);
      await loadOrganizationData();
    } catch (err) {
      console.error('[OrgDetailPage] Disconnect error:', err);
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  };

  // Loading state
  if (loadingState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto" />
          <p className="mt-4 text-gray-500">Loading organization...</p>
          <p className="mt-1 text-sm text-gray-400">Slug: {slug}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (loadingState === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="mt-4 text-lg font-medium text-gray-900">Failed to load organization</h2>
          <p className="mt-2 text-gray-500">{error}</p>
          <p className="mt-1 text-sm text-gray-400">Slug: {slug}</p>
          <div className="mt-6 flex gap-3 justify-center">
            <Link
              to="/admin/organizations"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Organizations
            </Link>
            <button
              onClick={loadOrganizationData}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Get display values with null safety
  const orgName = organization?.name || connectionStatus?.organization?.name || 'Unknown Organization';
  const orgSlug = organization?.slug || connectionStatus?.organization?.slug || slug || 'unknown';
  const orgPlan = organization?.plan_tier || connectionStatus?.organization?.planTier || 'free';
  const isConnected = connectionStatus?.qbo?.connected || false;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Link
              to="/admin/organizations"
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-gray-600" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900">{orgName}</h1>
                  <p className="text-sm text-gray-500">/{orgSlug}</p>
                </div>
              </div>
            </div>
            <PlanBadge plan={orgPlan} />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* QBO Connection Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">QuickBooks Connection</h2>

              {isConnected ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <div>
                      <div className="font-medium text-green-900">Connected</div>
                      <div className="text-sm text-green-700">
                        {connectionStatus?.qbo?.companyName || 'QuickBooks Company'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Realm ID:</span>
                      <span className="ml-2 font-mono text-gray-900">
                        {connectionStatus?.qbo?.realmId || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Status:</span>
                      <span className="ml-2 text-gray-900">
                        {connectionStatus?.qbo?.syncStatus || 'Unknown'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleDisconnect}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                    <div>
                      <div className="font-medium text-yellow-900">Not Connected</div>
                      <div className="text-sm text-yellow-700">
                        Connect to QuickBooks to start syncing invoices
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleConnectQBO}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Connect to QuickBooks
                  </button>
                </div>
              )}
            </div>

            {/* Stats Card */}
            {stats && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Sync Statistics (24h)</h2>

                <div className="grid grid-cols-4 gap-4">
                  <StatBox
                    icon={<Zap className="w-5 h-5 text-gray-600" />}
                    label="Sources"
                    value={stats.sourceCount}
                  />
                  <StatBox
                    icon={<Activity className="w-5 h-5 text-blue-600" />}
                    label="Total Syncs"
                    value={stats.syncStats?.total || 0}
                  />
                  <StatBox
                    icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
                    label="Successful"
                    value={stats.syncStats?.success || 0}
                    color="green"
                  />
                  <StatBox
                    icon={<XCircle className="w-5 h-5 text-red-600" />}
                    label="Failed"
                    value={stats.syncStats?.failed || 0}
                    color="red"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-2">
                <Link
                  to={`/org/${orgSlug}/settings`}
                  className="flex items-center gap-3 p-3 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4 text-gray-400" />
                  Organization Settings
                </Link>
                <Link
                  to={`/admin/organizations/${organization?.organization_id || ''}/sources`}
                  className="flex items-center gap-3 p-3 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <Zap className="w-4 h-4 text-gray-400" />
                  Manage Sources
                </Link>
                <Link
                  to={`/admin/organizations/${organization?.organization_id || ''}/logs`}
                  className="flex items-center gap-3 p-3 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <Activity className="w-4 h-4 text-gray-400" />
                  View Sync Logs
                </Link>
              </div>
            </div>

            {/* Organization Info */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">Organization Details</h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-gray-500">Organization ID</dt>
                  <dd className="font-mono text-gray-900 break-all">
                    {organization?.organization_id || 'N/A'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Created</dt>
                  <dd className="text-gray-900">
                    {organization?.created_at
                      ? new Date(organization.created_at).toLocaleDateString()
                      : 'N/A'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Status</dt>
                  <dd className="text-gray-900">
                    {organization?.is_active ? 'Active' : 'Inactive'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    enterprise: 'bg-purple-100 text-purple-700',
    professional: 'bg-blue-100 text-blue-700',
    starter: 'bg-green-100 text-green-700',
    free: 'bg-gray-100 text-gray-700',
  };

  return (
    <span className={`px-3 py-1 text-sm font-medium rounded-full ${colors[plan] || colors.free}`}>
      {plan}
    </span>
  );
}

function StatBox({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color?: 'green' | 'red';
}) {
  const valueColor = color === 'green'
    ? 'text-green-600'
    : color === 'red'
    ? 'text-red-600'
    : 'text-gray-900';

  return (
    <div className="text-center p-3 bg-gray-50 rounded-lg">
      <div className="flex justify-center mb-2">{icon}</div>
      <div className={`text-xl font-semibold ${valueColor}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
