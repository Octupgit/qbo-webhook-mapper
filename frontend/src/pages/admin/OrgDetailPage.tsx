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
  Copy,
  Link2,
  Link2Off,
  Power,
  PowerOff,
  Map,
  Key,
  Database,
  Download,
  Search,
  Code2,
  GitBranch,
  Plus,
  X,
} from 'lucide-react';
import { exportToCsv, customerCsvColumns, itemCsvColumns } from '../../utils/csvExport';
import { Organization, OrganizationStats, OrgConnectionStatus, WebhookSource, WebhookPayload, ClientMappingOverride, FieldMapping, QBOCustomer, QBOItem } from '../../types';
import * as adminApi from '../../api/admin';
import ApiKeyManager from '../../components/settings/ApiKeyManager';
import VisualMapper from '../../components/mappings/VisualMapper';
import DeveloperHub from '../DeveloperHub';

type LoadingState = 'idle' | 'loading' | 'success' | 'error';
type TabType = 'overview' | 'settings' | 'sources' | 'mappings' | 'visualMapper' | 'apiKeys' | 'data' | 'developer';

// QBO Entity types for data tab
type EntityType = 'customers' | 'items' | 'invoices' | 'accounts' | 'vendors';

export default function OrgDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [stats, setStats] = useState<OrganizationStats | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<OrgConnectionStatus | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Settings state
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Mappings state
  const [sources, setSources] = useState<WebhookSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [latestPayload, setLatestPayload] = useState<WebhookPayload | null>(null);
  const [mappings, setMappings] = useState<ClientMappingOverride[]>([]);
  const [loadingMappings, setLoadingMappings] = useState(false);

  // Create Source Modal state
  const [showCreateSourceModal, setShowCreateSourceModal] = useState(false);
  const [newSource, setNewSource] = useState<{ name: string; description: string; source_type: string }>({
    name: '',
    description: '',
    source_type: 'custom',
  });
  const [creatingSource, setCreatingSource] = useState(false);
  const [createdSource, setCreatedSource] = useState<(WebhookSource & { webhook_url: string }) | null>(null);

  useEffect(() => {
    if (slug) {
      loadOrganizationData();
    }
  }, [slug]);

  useEffect(() => {
    if (activeTab === 'mappings' && organization) {
      loadMappingsData();
    }
  }, [activeTab, organization]);

  useEffect(() => {
    if (selectedSourceId && organization) {
      loadSourceMappingData();
    }
  }, [selectedSourceId]);

  const loadOrganizationData = async () => {
    if (!slug) {
      setError('No organization slug provided');
      setLoadingState('error');
      return;
    }

    setLoadingState('loading');
    setError(null);

    try {
      const status = await adminApi.getOrgStatus(slug);
      setConnectionStatus(status);

      if (status?.organization?.id) {
        const org = await adminApi.getOrganization(status.organization.id);
        setOrganization(org);

        try {
          const orgStats = await adminApi.getOrganizationStats(status.organization.id);
          setStats(orgStats);
        } catch (statsError) {
          console.warn('Failed to load stats:', statsError);
        }
      }

      setLoadingState('success');
    } catch (err) {
      console.error('Error loading organization:', err);
      setError(err instanceof Error ? err.message : 'Failed to load organization');
      setLoadingState('error');
    }
  };

  const loadMappingsData = async () => {
    if (!organization) return;

    setLoadingMappings(true);
    try {
      const orgSources = await adminApi.getOrgSources(organization.slug);
      setSources(orgSources);

      if (orgSources.length > 0 && !selectedSourceId) {
        setSelectedSourceId(orgSources[0].source_id);
      }

      const overrides = await adminApi.getClientOverrides(organization.organization_id);
      setMappings(overrides);
    } catch (err) {
      console.error('Error loading mappings:', err);
    } finally {
      setLoadingMappings(false);
    }
  };

  const loadSourceMappingData = async () => {
    if (!organization || !selectedSourceId) return;

    try {
      const payload = await adminApi.getLatestPayload(organization.organization_id, selectedSourceId);
      setLatestPayload(payload);
    } catch (err) {
      console.error('Error loading source mapping data:', err);
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
      console.error('Disconnect error:', err);
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  };

  const handleToggleActive = async () => {
    if (!organization) return;

    setSaving(true);
    setSaveMessage(null);

    try {
      await adminApi.updateOrganization(organization.organization_id, {
        is_active: !organization.is_active,
      });
      setOrganization({ ...organization, is_active: !organization.is_active });
      setSaveMessage({ type: 'success', text: `Organization ${!organization.is_active ? 'activated' : 'deactivated'}` });
    } catch (err) {
      setSaveMessage({ type: 'error', text: 'Failed to update organization' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleConnectionLink = async () => {
    if (!organization) return;

    setSaving(true);
    setSaveMessage(null);

    try {
      await adminApi.updateOrganization(organization.organization_id, {
        connection_link_enabled: !organization.connection_link_enabled,
      });
      setOrganization({ ...organization, connection_link_enabled: !organization.connection_link_enabled });
      setSaveMessage({ type: 'success', text: `Connection link ${!organization.connection_link_enabled ? 'enabled' : 'disabled'}` });
    } catch (err) {
      setSaveMessage({ type: 'error', text: 'Failed to update connection link' });
    } finally {
      setSaving(false);
    }
  };

  const copyPublicLink = () => {
    if (!organization) return;
    const url = `${window.location.origin}/connect/${organization.slug}`;
    navigator.clipboard.writeText(url);
    setSaveMessage({ type: 'success', text: 'Link copied to clipboard!' });
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleCreateSource = async () => {
    if (!organization || !newSource.name.trim()) return;

    setCreatingSource(true);
    try {
      const created = await adminApi.createOrgSource(organization.slug, {
        name: newSource.name.trim(),
        description: newSource.description.trim(),
        source_type: newSource.source_type,
      });
      setCreatedSource(created);
      // Refresh sources list
      await loadMappingsData();
      // Select the newly created source
      setSelectedSourceId(created.source_id);
    } catch (err) {
      console.error('Failed to create source:', err);
      alert('Failed to create source');
    } finally {
      setCreatingSource(false);
    }
  };

  const resetCreateSourceModal = () => {
    setShowCreateSourceModal(false);
    setNewSource({ name: '', description: '', source_type: 'custom' });
    setCreatedSource(null);
  };

  // Loading state
  if (loadingState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto" />
          <p className="mt-4 text-gray-500">Loading organization...</p>
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
          <div className="mt-6 flex gap-3 justify-center">
            <Link
              to="/admin/organizations"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
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

  const orgName = organization?.name || 'Unknown Organization';
  const orgSlug = organization?.slug || slug || 'unknown';
  const orgPlan = organization?.plan_tier || 'free';
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
            <div className="flex items-center gap-2">
              {!organization?.is_active && (
                <span className="px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-full">
                  Inactive
                </span>
              )}
              <PlanBadge plan={orgPlan} />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            <TabButton
              active={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
              icon={<Activity className="w-4 h-4" />}
              label="Overview"
            />
            <TabButton
              active={activeTab === 'settings'}
              onClick={() => setActiveTab('settings')}
              icon={<Settings className="w-4 h-4" />}
              label="Settings"
            />
            <TabButton
              active={activeTab === 'sources'}
              onClick={() => setActiveTab('sources')}
              icon={<Zap className="w-4 h-4" />}
              label="Sources"
            />
            <TabButton
              active={activeTab === 'mappings'}
              onClick={() => setActiveTab('mappings')}
              icon={<Map className="w-4 h-4" />}
              label="Mappings"
            />
            <TabButton
              active={activeTab === 'visualMapper'}
              onClick={() => setActiveTab('visualMapper')}
              icon={<GitBranch className="w-4 h-4" />}
              label="Visual Mapper"
            />
            <TabButton
              active={activeTab === 'apiKeys'}
              onClick={() => setActiveTab('apiKeys')}
              icon={<Key className="w-4 h-4" />}
              label="API Keys"
            />
            <TabButton
              active={activeTab === 'data'}
              onClick={() => setActiveTab('data')}
              icon={<Database className="w-4 h-4" />}
              label="Data"
            />
            <TabButton
              active={activeTab === 'developer'}
              onClick={() => setActiveTab('developer')}
              icon={<Code2 className="w-4 h-4" />}
              label="Developer"
            />
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'overview' && (
          <OverviewTab
            organization={organization}
            stats={stats}
            connectionStatus={connectionStatus}
            isConnected={isConnected}
            onConnect={handleConnectQBO}
            onDisconnect={handleDisconnect}
          />
        )}

        {activeTab === 'settings' && organization && (
          <SettingsTab
            organization={organization}
            saving={saving}
            saveMessage={saveMessage}
            onToggleActive={handleToggleActive}
            onToggleConnectionLink={handleToggleConnectionLink}
            onCopyPublicLink={copyPublicLink}
          />
        )}

        {activeTab === 'sources' && organization && (
          <SourcesTab
            organization={organization}
            sources={sources}
            loading={loadingMappings}
            onRefresh={loadMappingsData}
            onCreateSource={() => setShowCreateSourceModal(true)}
          />
        )}

        {activeTab === 'mappings' && organization && (
          <MappingsTab
            organization={organization}
            sources={sources}
            selectedSourceId={selectedSourceId}
            onSelectSource={setSelectedSourceId}
            latestPayload={latestPayload}
            mappings={mappings}
            loading={loadingMappings}
            onRefresh={loadMappingsData}
            onCreateSource={() => setShowCreateSourceModal(true)}
          />
        )}

        {activeTab === 'visualMapper' && organization && (
          <VisualMapperTab
            organization={organization}
            sources={sources}
            selectedSourceId={selectedSourceId}
            onSelectSource={setSelectedSourceId}
            latestPayload={latestPayload}
            onRefresh={loadMappingsData}
            onCreateSource={() => setShowCreateSourceModal(true)}
          />
        )}

        {activeTab === 'developer' && organization && (
          <DeveloperHub
            orgSlug={organization.slug}
            baseUrl={import.meta.env.VITE_API_URL || `${window.location.origin}/api`}
          />
        )}

        {activeTab === 'apiKeys' && organization && (
          <ApiKeyManager
            organizationId={organization.organization_id}
            organizationSlug={organization.slug}
          />
        )}

        {activeTab === 'data' && organization && connectionStatus?.qbo?.connected && (
          <DataTab
            organizationSlug={organization.slug}
          />
        )}

        {activeTab === 'data' && organization && !connectionStatus?.qbo?.connected && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <Database className="w-12 h-12 text-gray-300 mx-auto" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">QuickBooks Not Connected</h3>
            <p className="mt-2 text-gray-500">
              Connect to QuickBooks to browse and export entity data.
            </p>
          </div>
        )}
      </div>

      {/* Create Source Modal */}
      {showCreateSourceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={resetCreateSourceModal} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <button
              onClick={resetCreateSourceModal}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>

            {!createdSource ? (
              <>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Create Webhook Source</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newSource.name}
                      onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                      placeholder="e.g., Shopify Orders"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={newSource.description}
                      onChange={(e) => setNewSource({ ...newSource, description: e.target.value })}
                      placeholder="e.g., Orders from Shopify store"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Source Type
                    </label>
                    <select
                      value={newSource.source_type}
                      onChange={(e) => setNewSource({ ...newSource, source_type: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                    >
                      <option value="custom">Custom</option>
                      <option value="shopify">Shopify</option>
                      <option value="woocommerce">WooCommerce</option>
                      <option value="stripe">Stripe</option>
                      <option value="square">Square</option>
                    </select>
                  </div>
                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={resetCreateSourceModal}
                      className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateSource}
                      disabled={creatingSource || !newSource.name.trim()}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50"
                    >
                      {creatingSource ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          Create Source
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">Source Created!</h2>
                  <p className="text-gray-500 mb-4">
                    Save the API key below - it will only be shown once.
                  </p>
                </div>
                <div className="space-y-4 bg-gray-50 rounded-lg p-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Source ID</label>
                    <code className="block text-sm font-mono text-gray-800 break-all">
                      {createdSource.source_id}
                    </code>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Webhook URL</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-sm font-mono text-gray-800 break-all">
                        {createdSource.webhook_url}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(createdSource.webhook_url)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title="Copy URL"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">API Key</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-sm font-mono text-green-700 bg-green-50 p-2 rounded break-all">
                        {createdSource.api_key}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(createdSource.api_key)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title="Copy API Key"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  onClick={resetCreateSourceModal}
                  className="w-full mt-6 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// TAB COMPONENTS
// =============================================================================

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active
          ? 'bg-gray-900 text-white'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function OverviewTab({
  organization,
  stats,
  connectionStatus,
  isConnected,
  onConnect,
  onDisconnect,
}: {
  organization: Organization | null;
  stats: OrganizationStats | null;
  connectionStatus: OrgConnectionStatus | null;
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                onClick={onDisconnect}
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
                onClick={onConnect}
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
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-2">
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

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Organization Details</h3>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-gray-500">Organization ID</dt>
              <dd className="font-mono text-gray-900 break-all text-xs">
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
  );
}

function SettingsTab({
  organization,
  saving,
  saveMessage,
  onToggleActive,
  onToggleConnectionLink,
  onCopyPublicLink,
}: {
  organization: Organization;
  saving: boolean;
  saveMessage: { type: 'success' | 'error'; text: string } | null;
  onToggleActive: () => void;
  onToggleConnectionLink: () => void;
  onCopyPublicLink: () => void;
}) {
  const publicConnectUrl = `${window.location.origin}/connect/${organization.slug}`;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Save Message */}
      {saveMessage && (
        <div
          className={`p-4 rounded-lg ${
            saveMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {saveMessage.text}
        </div>
      )}

      {/* Organization Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Organization Status</h2>

        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            {organization.is_active ? (
              <Power className="w-5 h-5 text-green-600" />
            ) : (
              <PowerOff className="w-5 h-5 text-red-600" />
            )}
            <div>
              <div className="font-medium text-gray-900">
                {organization.is_active ? 'Active' : 'Inactive'}
              </div>
              <div className="text-sm text-gray-500">
                {organization.is_active
                  ? 'Organization is accepting webhooks and syncing'
                  : 'Webhooks are rejected and syncing is disabled'}
              </div>
            </div>
          </div>
          <button
            onClick={onToggleActive}
            disabled={saving}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
              organization.is_active
                ? 'text-red-600 bg-red-50 hover:bg-red-100'
                : 'text-green-600 bg-green-50 hover:bg-green-100'
            }`}
          >
            {organization.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>

        <p className="mt-3 text-sm text-gray-500">
          When deactivated, all incoming webhooks will be rejected with a 403 error, automated syncing will stop, and the public connection page will be disabled.
        </p>
      </div>

      {/* Public Connection Link */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Public Connection Link</h2>

        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg mb-4">
          <div className="flex items-center gap-3">
            {organization.connection_link_enabled ? (
              <Link2 className="w-5 h-5 text-green-600" />
            ) : (
              <Link2Off className="w-5 h-5 text-gray-400" />
            )}
            <div>
              <div className="font-medium text-gray-900">
                {organization.connection_link_enabled ? 'Enabled' : 'Disabled'}
              </div>
              <div className="text-sm text-gray-500">
                {organization.connection_link_enabled
                  ? 'End clients can access the connection page'
                  : 'Connection page is not accessible'}
              </div>
            </div>
          </div>
          <button
            onClick={onToggleConnectionLink}
            disabled={saving}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
              organization.connection_link_enabled
                ? 'text-red-600 bg-red-50 hover:bg-red-100'
                : 'text-green-600 bg-green-50 hover:bg-green-100'
            }`}
          >
            {organization.connection_link_enabled ? 'Disable Link' : 'Enable Link'}
          </button>
        </div>

        {organization.connection_link_enabled && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Share this link with your client:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={publicConnectUrl}
                className="flex-1 px-3 py-2 text-sm font-mono bg-gray-50 border border-gray-200 rounded-lg"
              />
              <button
                onClick={onCopyPublicLink}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
            </div>
            <p className="text-sm text-gray-500">
              This page allows end clients to connect their QuickBooks account without accessing the admin dashboard.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SourcesTab({
  organization,
  sources,
  loading,
  onRefresh,
  onCreateSource,
}: {
  organization: Organization;
  sources: WebhookSource[];
  loading: boolean;
  onRefresh: () => void;
  onCreateSource: () => void;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const baseUrl = import.meta.env.VITE_API_URL || window.location.origin;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Webhook Sources</h2>
          <p className="text-sm text-gray-500">
            Manage webhook endpoints for receiving data from external systems
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={onCreateSource}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800"
          >
            <Plus className="w-4 h-4" />
            Create Source
          </button>
        </div>
      </div>

      {sources.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Zap className="w-12 h-12 text-gray-300 mx-auto" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No Webhook Sources</h3>
          <p className="mt-2 text-gray-500">
            Create a webhook source to start receiving data from external systems.
          </p>
          <button
            onClick={onCreateSource}
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800"
          >
            <Plus className="w-4 h-4" />
            Create Source
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Webhook URL
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  API Key
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sources.map(source => {
                const webhookUrl = `${baseUrl}/api/v1/webhook/${organization.slug}/${source.source_id}`;
                const apiKeyPreview = source.api_key
                  ? `${source.api_key.substring(0, 8)}...${source.api_key.substring(source.api_key.length - 4)}`
                  : 'N/A';

                return (
                  <tr key={source.source_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
                          <Zap className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{source.name}</div>
                          {source.description && (
                            <div className="text-sm text-gray-500">{source.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                        {source.source_type || 'custom'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-gray-600 bg-gray-50 px-2 py-1 rounded max-w-xs truncate">
                          {webhookUrl}
                        </code>
                        <button
                          onClick={() => copyToClipboard(webhookUrl, `url-${source.source_id}`)}
                          className="p-1 text-gray-400 hover:text-gray-600"
                          title="Copy URL"
                        >
                          {copiedId === `url-${source.source_id}` ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-gray-600 bg-gray-50 px-2 py-1 rounded">
                          {apiKeyPreview}
                        </code>
                        {source.api_key && (
                          <button
                            onClick={() => copyToClipboard(source.api_key, `key-${source.source_id}`)}
                            className="p-1 text-gray-400 hover:text-gray-600"
                            title="Copy API Key"
                          >
                            {copiedId === `key-${source.source_id}` ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {source.created_at
                        ? new Date(source.created_at).toLocaleDateString()
                        : 'N/A'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Usage Instructions */}
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
        <h3 className="text-sm font-medium text-blue-900 mb-2">How to use webhook sources</h3>
        <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
          <li>Copy the <strong>Webhook URL</strong> for your source</li>
          <li>Configure your external system (Shopify, WooCommerce, etc.) to send webhooks to this URL</li>
          <li>Include the <strong>API Key</strong> in the request header as <code className="bg-blue-100 px-1 rounded">X-API-Key</code></li>
          <li>Go to the <strong>Mappings</strong> tab to configure how the webhook data maps to QuickBooks invoices</li>
        </ol>
      </div>
    </div>
  );
}

function MappingsTab({
  organization,
  sources,
  selectedSourceId,
  onSelectSource,
  latestPayload,
  mappings,
  loading,
  onRefresh,
  onCreateSource,
}: {
  organization: Organization;
  sources: WebhookSource[];
  selectedSourceId: string | null;
  onSelectSource: (id: string) => void;
  latestPayload: WebhookPayload | null;
  mappings: ClientMappingOverride[];
  loading: boolean;
  onRefresh: () => void;
  onCreateSource: () => void;
}) {
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // QBO Invoice Fields
  const qboFields: Array<{
    path: string;
    label: string;
    required: boolean;
    staticDefault?: string;
    lookupType?: 'customer' | 'item';
  }> = [
    { path: 'CustomerRef.value', label: 'Customer', required: true, lookupType: 'customer' },
    { path: 'Line[0].Amount', label: 'Amount', required: true },
    { path: 'Line[0].DetailType', label: 'Line Detail Type', required: true, staticDefault: 'SalesItemLineDetail' },
    { path: 'Line[0].SalesItemLineDetail.ItemRef.value', label: 'Product/Service', required: true, lookupType: 'item' },
    { path: 'Line[0].Description', label: 'Description', required: false },
    { path: 'DocNumber', label: 'Invoice Number', required: false },
    { path: 'TxnDate', label: 'Transaction Date', required: false },
    { path: 'DueDate', label: 'Due Date', required: false },
    { path: 'BillEmail.Address', label: 'Bill Email', required: false },
    { path: 'CustomerMemo.value', label: 'Customer Memo', required: false },
    { path: 'PrivateNote', label: 'Private Note', required: false },
  ];


  // Load existing mappings when source changes
  useEffect(() => {
    if (selectedSourceId && mappings.length > 0) {
      const sourceMapping = mappings.find(m => m.source_id === selectedSourceId);
      if (sourceMapping) {
        setFieldMappings(sourceMapping.field_mappings);
      } else {
        setFieldMappings([]);
      }
    } else {
      setFieldMappings([]);
    }
  }, [selectedSourceId, mappings]);

  const handleMappingChange = (qboField: string, sourceField: string) => {
    setFieldMappings(prev => {
      const existing = prev.find(m => m.qboField === qboField);
      if (existing) {
        return prev.map(m => m.qboField === qboField ? { ...m, sourceField } : m);
      }
      return [...prev, { qboField, sourceField }];
    });
  };

  const handleSave = async () => {
    if (!selectedSourceId) return;

    setSaving(true);
    setSaveMessage(null);

    try {
      // Add static defaults for required fields
      const mappingsToSave = [...fieldMappings];

      // Ensure DetailType has its static default
      const detailTypeField = qboFields.find(f => f.path === 'Line[0].DetailType');
      if (detailTypeField && 'staticDefault' in detailTypeField) {
        const hasDetailType = mappingsToSave.some(m => m.qboField === 'Line[0].DetailType');
        if (!hasDetailType) {
          mappingsToSave.push({
            qboField: 'Line[0].DetailType',
            staticValue: detailTypeField.staticDefault as string,
          });
        }
      }

      const existingMapping = mappings.find(m => m.source_id === selectedSourceId);

      if (existingMapping) {
        await adminApi.updateClientOverride(organization.organization_id, existingMapping.override_id, {
          field_mappings: mappingsToSave,
        });
      } else {
        await adminApi.createClientOverride(organization.organization_id, {
          name: `${sources.find(s => s.source_id === selectedSourceId)?.name} Mapping`,
          source_id: selectedSourceId,
          field_mappings: mappingsToSave,
        });
      }

      setSaveMessage('Mapping saved successfully!');
      onRefresh();
    } catch (err) {
      setSaveMessage('Failed to save mapping');
    } finally {
      setSaving(false);
    }
  };

  // Parse payload for display
  let parsedPayload: Record<string, unknown> = {};
  if (latestPayload?.raw_payload) {
    try {
      parsedPayload = typeof latestPayload.raw_payload === 'string'
        ? JSON.parse(latestPayload.raw_payload)
        : latestPayload.raw_payload;
    } catch {
      parsedPayload = {};
    }
  }

  // Extract all paths from payload (including array items)
  const extractPaths = (obj: unknown, prefix = '$'): string[] => {
    const paths: string[] = [];
    if (obj && typeof obj === 'object') {
      if (Array.isArray(obj)) {
        // For arrays, recurse into first element with [0] notation
        if (obj.length > 0) {
          paths.push(...extractPaths(obj[0], `${prefix}[0]`));
        }
      } else {
        for (const [key, value] of Object.entries(obj)) {
          const path = `${prefix}.${key}`;
          paths.push(path);
          if (value && typeof value === 'object') {
            paths.push(...extractPaths(value, path));
          }
        }
      }
    }
    return paths;
  };

  const payloadPaths = extractPaths(parsedPayload);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <Zap className="w-12 h-12 text-gray-300 mx-auto" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">No Webhook Sources</h3>
        <p className="mt-2 text-gray-500">
          Create a webhook source first to configure field mappings.
        </p>
        <button
          onClick={onCreateSource}
          className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800"
        >
          <Plus className="w-4 h-4" />
          Create Source
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Source Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Source:</label>
            <select
              value={selectedSourceId || ''}
              onChange={(e) => onSelectSource(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              style={{ backgroundColor: '#ffffff', zIndex: 50 }}
            >
              {sources.map(source => (
                <option key={source.source_id} value={source.source_id}>
                  {source.name}
                </option>
              ))}
            </select>
            <button
              onClick={onCreateSource}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              <Plus className="w-4 h-4" />
              New
            </button>
          </div>
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {saveMessage && (
        <div className={`p-4 rounded-lg ${saveMessage.includes('success') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {saveMessage}
        </div>
      )}

      {/* Mapping Editor */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left Column: Latest Payload */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Latest Webhook Payload</h3>

          {latestPayload ? (
            <div className="space-y-4">
              <div className="text-xs text-gray-500">
                Received: {new Date(latestPayload.received_at).toLocaleString()}
              </div>
              <div className="bg-gray-50 rounded-lg p-4 max-h-[500px] overflow-auto">
                <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">
                  {JSON.stringify(parsedPayload, null, 2)}
                </pre>
              </div>
              <div className="text-sm text-gray-500">
                Click on QBO fields (right) and select a source path to map
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p>No payloads received yet for this source.</p>
              <p className="text-sm mt-1">
                Send a webhook to see the payload structure.
              </p>
            </div>
          )}
        </div>

        {/* Right Column: QBO Fields */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">QuickBooks Invoice Fields</h3>

          <div className="space-y-4">
            {qboFields.map(field => {
              const currentMapping = fieldMappings.find(m => m.qboField === field.path);
              const hasStaticDefault = 'staticDefault' in field && field.staticDefault;

              return (
                <div key={field.path} className="space-y-1">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    {field.label}
                    {field.required && <span className="text-red-500">*</span>}
                    {hasStaticDefault && (
                      <span className="text-xs text-gray-400">(auto-set to "{field.staticDefault}")</span>
                    )}
                  </label>
                  {hasStaticDefault ? (
                    <input
                      type="text"
                      value={currentMapping?.staticValue || field.staticDefault || ''}
                      onChange={(e) => {
                        setFieldMappings(prev => {
                          const existing = prev.find(m => m.qboField === field.path);
                          if (existing) {
                            return prev.map(m => m.qboField === field.path ? { ...m, staticValue: e.target.value, sourceField: undefined } : m);
                          }
                          return [...prev, { qboField: field.path, staticValue: e.target.value }];
                        });
                      }}
                      className="w-full px-3 py-2 text-sm bg-gray-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder={`Default: ${field.staticDefault}`}
                    />
                  ) : (
                    <select
                      value={currentMapping?.sourceField || ''}
                      onChange={(e) => handleMappingChange(field.path, e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      style={{ backgroundColor: '#ffffff' }}
                    >
                      <option value="">-- Select source field --</option>
                      {payloadPaths.map(path => (
                        <option key={path} value={path}>{path}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Mapping'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VisualMapperTab({
  organization,
  sources,
  selectedSourceId,
  onSelectSource,
  latestPayload,
  onRefresh,
  onCreateSource,
}: {
  organization: Organization;
  sources: WebhookSource[];
  selectedSourceId: string | null;
  onSelectSource: (id: string) => void;
  latestPayload: WebhookPayload | null;
  onRefresh: () => void;
  onCreateSource: () => void;
}) {
  // Parse the latest payload
  let parsedPayload: Record<string, unknown> | null = null;
  if (latestPayload?.raw_payload) {
    try {
      parsedPayload = typeof latestPayload.raw_payload === 'string'
        ? JSON.parse(latestPayload.raw_payload)
        : latestPayload.raw_payload as Record<string, unknown>;
    } catch {
      parsedPayload = null;
    }
  }

  // Fetch customers from QBO proxy
  const fetchCustomers = async (search?: string): Promise<QBOCustomer[]> => {
    try {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const params = new URLSearchParams({ type: 'customers' });
      if (search) params.append('search', search);

      const response = await fetch(
        `${baseUrl}/api/v1/org/${organization.slug}/proxy/data?${params}`,
        { credentials: 'include' }
      );

      if (!response.ok) return [];
      const data = await response.json();
      return (data.data || []).map((c: Record<string, unknown>) => ({
        id: String(c.Id || ''),
        name: String(c.DisplayName || c.FullyQualifiedName || ''),
        email: (c.PrimaryEmailAddr as Record<string, string>)?.Address,
      }));
    } catch {
      return [];
    }
  };

  // Fetch items from QBO proxy
  const fetchItems = async (search?: string): Promise<QBOItem[]> => {
    try {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const params = new URLSearchParams({ type: 'items' });
      if (search) params.append('search', search);

      const response = await fetch(
        `${baseUrl}/api/v1/org/${organization.slug}/proxy/data?${params}`,
        { credentials: 'include' }
      );

      if (!response.ok) return [];
      const data = await response.json();
      return (data.data || []).map((i: Record<string, unknown>) => ({
        id: String(i.Id || ''),
        name: String(i.Name || ''),
        type: String(i.Type || 'Service'),
        unitPrice: i.UnitPrice != null ? Number(i.UnitPrice) : undefined,
      }));
    } catch {
      return [];
    }
  };

  // Save mapping
  const handleSave = async (mappings: FieldMapping[]) => {
    if (!selectedSourceId) return;

    try {
      // Check if override exists
      const overrides = await adminApi.getClientOverrides(organization.organization_id);
      const existingOverride = overrides.find(o => o.source_id === selectedSourceId);

      if (existingOverride) {
        await adminApi.updateClientOverride(organization.organization_id, existingOverride.override_id, {
          field_mappings: mappings,
        });
      } else {
        const source = sources.find(s => s.source_id === selectedSourceId);
        await adminApi.createClientOverride(organization.organization_id, {
          name: `${source?.name || 'Source'} Mapping`,
          source_id: selectedSourceId,
          field_mappings: mappings,
        });
      }
      onRefresh();
    } catch (error) {
      console.error('Failed to save mapping:', error);
      throw error;
    }
  };

  if (sources.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <GitBranch className="w-12 h-12 text-gray-300 mx-auto" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">No Webhook Sources</h3>
        <p className="mt-2 text-gray-500">
          Create a webhook source first to use the Visual Mapper.
        </p>
        <button
          onClick={onCreateSource}
          className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800"
        >
          <Plus className="w-4 h-4" />
          Create Source
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Source Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Source:</label>
            <select
              value={selectedSourceId || ''}
              onChange={(e) => onSelectSource(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {sources.map(source => (
                <option key={source.source_id} value={source.source_id}>
                  {source.name}
                </option>
              ))}
            </select>
            <button
              onClick={onCreateSource}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              <Plus className="w-4 h-4" />
              New
            </button>
          </div>
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Visual Mapper */}
      <div className="h-[600px]">
        <VisualMapper
          sourcePayload={parsedPayload}
          onSave={handleSave}
          fetchCustomers={fetchCustomers}
          fetchItems={fetchItems}
        />
      </div>
    </div>
  );
}

function DataTab({
  organizationSlug,
}: {
  organizationSlug: string;
}) {
  const [entityType, setEntityType] = useState<EntityType>('customers');
  const [searchQuery, setSearchQuery] = useState('');
  const [entities, setEntities] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntities = async () => {
    setLoading(true);
    setError(null);

    try {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const params = new URLSearchParams({ type: entityType });
      if (searchQuery) params.append('search', searchQuery);

      const response = await fetch(
        `${baseUrl}/api/v1/org/${organizationSlug}/proxy/data?${params}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch data');
      }

      const data = await response.json();
      setEntities(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      setEntities([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntities();
  }, [entityType, organizationSlug]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEntities();
  };

  const handleExport = () => {
    if (entities.length === 0) return;

    const columns = entityType === 'customers'
      ? customerCsvColumns
      : entityType === 'items'
      ? itemCsvColumns
      : Object.keys(entities[0]).map(key => ({ key, header: key }));

    const filename = `${organizationSlug}-${entityType}-${new Date().toISOString().split('T')[0]}`;
    exportToCsv(entities, columns, filename);
  };

  const entityTypes: { value: EntityType; label: string }[] = [
    { value: 'customers', label: 'Customers' },
    { value: 'items', label: 'Products/Services' },
    { value: 'invoices', label: 'Invoices' },
    { value: 'accounts', label: 'Accounts' },
    { value: 'vendors', label: 'Vendors' },
  ];

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value as EntityType)}
              className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {entityTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>

            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800"
              >
                Search
              </button>
            </form>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchEntities}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleExport}
              disabled={entities.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 text-red-800 rounded-lg">
          {error}
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : entities.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Database className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p>No {entityType} found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    {entityType === 'customers' ? 'Name' : entityType === 'items' ? 'Name' : 'Name/Number'}
                  </th>
                  {entityType === 'customers' && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Email
                    </th>
                  )}
                  {entityType === 'items' && (
                    <>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Price
                      </th>
                    </>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {entities.slice(0, 50).map((entity, index) => (
                  <tr key={(entity.Id as string) || index} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">
                      {entity.Id as string}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {(entity.DisplayName || entity.Name || entity.DocNumber || '-') as string}
                    </td>
                    {entityType === 'customers' && (
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {((entity.PrimaryEmailAddr as Record<string, string>)?.Address || '-') as string}
                      </td>
                    )}
                    {entityType === 'items' && (
                      <>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {(entity.Type || '-') as string}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {entity.UnitPrice != null ? `$${Number(entity.UnitPrice).toFixed(2)}` : '-'}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded ${
                          entity.Active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {entity.Active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {entities.length > 50 && (
              <div className="px-4 py-3 bg-gray-50 text-sm text-gray-500 text-center">
                Showing 50 of {entities.length} results. Export to CSV to see all.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

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
