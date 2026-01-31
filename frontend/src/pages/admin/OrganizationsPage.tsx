import { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  MoreHorizontal,
  Activity,
  Zap,
} from 'lucide-react';
import { Organization, OrganizationStats } from '../../types';
import * as adminApi from '../../api/admin';

interface OrgWithStats extends Organization {
  stats?: OrganizationStats;
  loading?: boolean;
}

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<OrgWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    try {
      setLoading(true);
      const orgs = await adminApi.getOrganizations();
      setOrganizations(orgs.map(org => ({ ...org, loading: true })));

      // Load stats for each org
      for (const org of orgs) {
        try {
          const stats = await adminApi.getOrganizationStats(org.organization_id);
          setOrganizations(prev =>
            prev.map(o =>
              o.organization_id === org.organization_id
                ? { ...o, stats, loading: false }
                : o
            )
          );
        } catch {
          setOrganizations(prev =>
            prev.map(o =>
              o.organization_id === org.organization_id
                ? { ...o, loading: false }
                : o
            )
          );
        }
      }
    } catch (error) {
      console.error('Failed to load organizations:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrgs = organizations.filter(
    org =>
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getPlanBadgeColor = (tier: Organization['plan_tier']) => {
    switch (tier) {
      case 'enterprise':
        return 'bg-purple-100 text-purple-700';
      case 'professional':
        return 'bg-blue-100 text-blue-700';
      case 'starter':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusIcon = (org: OrgWithStats) => {
    if (!org.stats) return <AlertCircle className="w-4 h-4 text-gray-400" />;
    if (!org.stats.qboConnected) return <XCircle className="w-4 h-4 text-red-500" />;
    return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Organizations</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage client organizations and their QuickBooks connections
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Organization
            </button>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={<Building2 className="w-5 h-5 text-gray-600" />}
            label="Total Organizations"
            value={organizations.length}
          />
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
            label="Connected to QBO"
            value={organizations.filter(o => o.stats?.qboConnected).length}
          />
          <StatCard
            icon={<Activity className="w-5 h-5 text-blue-600" />}
            label="Total Syncs (24h)"
            value={organizations.reduce((sum, o) => sum + (o.stats?.syncStats.total || 0), 0)}
          />
          <StatCard
            icon={<AlertCircle className="w-5 h-5 text-red-600" />}
            label="Failed Syncs"
            value={organizations.reduce((sum, o) => sum + (o.stats?.syncStats.failed || 0), 0)}
          />
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search organizations..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
        </div>

        {/* Organizations Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="mt-4 text-sm text-gray-500">Loading organizations...</p>
            </div>
          ) : filteredOrgs.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-4 text-gray-500">No organizations found</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Organization
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    QBO Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sources
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Syncs (24h)
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredOrgs.map(org => (
                  <tr key={org.organization_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-gray-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{org.name}</div>
                          <div className="text-sm text-gray-500">{org.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${getPlanBadgeColor(
                          org.plan_tier
                        )}`}
                      >
                        {org.plan_tier}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(org)}
                        <span className="text-sm text-gray-700">
                          {org.loading
                            ? 'Loading...'
                            : org.stats?.qboConnected
                            ? 'Connected'
                            : 'Not connected'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-700">
                          {org.stats?.sourceCount ?? '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {org.loading ? (
                        <span className="text-sm text-gray-400">-</span>
                      ) : (
                        <div className="flex items-center gap-4">
                          <SyncBadge
                            label="Success"
                            value={org.stats?.syncStats.success || 0}
                            color="green"
                          />
                          <SyncBadge
                            label="Failed"
                            value={org.stats?.syncStats.failed || 0}
                            color="red"
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={`/admin/org/${org.slug}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          View
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateOrgModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadOrganizations();
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <div className="text-2xl font-semibold text-gray-900">{value}</div>
          <div className="text-sm text-gray-500">{label}</div>
        </div>
      </div>
    </div>
  );
}

function SyncBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'green' | 'red' | 'yellow';
}) {
  const colors = {
    green: 'text-green-600',
    red: 'text-red-600',
    yellow: 'text-yellow-600',
  };

  return (
    <div className="text-center">
      <div className={`text-sm font-medium ${colors[color]}`}>{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}

function CreateOrgModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [planTier, setPlanTier] = useState<Organization['plan_tier']>('free');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await adminApi.createOrganization({ name, slug, plan_tier: planTier });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Create Organization</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Organization Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => {
                setName(e.target.value);
                if (!slug || slug === generateSlug(name.slice(0, -1))) {
                  setSlug(generateSlug(e.target.value));
                }
              }}
              placeholder="Acme Corporation"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL Slug
            </label>
            <div className="flex items-center">
              <span className="text-sm text-gray-400 mr-1">/org/</span>
              <input
                type="text"
                value={slug}
                onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="acme-corp"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
            <select
              value={planTier}
              onChange={e => setPlanTier(e.target.value as Organization['plan_tier'])}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            >
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="professional">Professional</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
