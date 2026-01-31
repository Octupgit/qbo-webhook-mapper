/**
 * Organization Service
 *
 * Business logic for organization (tenant) management.
 * Handles CRUD operations, statistics, and organization-level configurations.
 */

import {
  createOrganization,
  getOrganizations,
  getOrganizationById,
  getOrganizationBySlug,
  updateOrganization,
  getSources,
  getActiveToken,
  getSyncLogs,
} from './dataService';
import { Organization, OrganizationSettings, PlanTier } from '../types';

// Plan tier limits
const PLAN_LIMITS: Record<PlanTier, { maxSources: number; maxPayloadsPerDay: number }> = {
  free: { maxSources: 1, maxPayloadsPerDay: 100 },
  starter: { maxSources: 3, maxPayloadsPerDay: 1000 },
  professional: { maxSources: 10, maxPayloadsPerDay: 10000 },
  enterprise: { maxSources: -1, maxPayloadsPerDay: -1 }, // Unlimited
};

/**
 * Create a new organization
 */
export async function createOrg(
  name: string,
  slug: string,
  planTier: PlanTier = 'free',
  settings?: OrganizationSettings,
  createdBy?: string
): Promise<Organization> {
  // Validate slug format (lowercase alphanumeric with hyphens)
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) || slug.length < 3) {
    throw new Error('Slug must be at least 3 characters, lowercase alphanumeric with hyphens, and start/end with alphanumeric');
  }

  // Check if slug is unique
  const existing = await getOrganizationBySlug(slug);
  if (existing) {
    throw new Error('Organization with this slug already exists');
  }

  return createOrganization(name, slug, planTier, settings, createdBy);
}

/**
 * Get all organizations (for admin dashboard)
 */
export async function getAllOrgs(): Promise<Organization[]> {
  return getOrganizations();
}

/**
 * Get organization by ID
 */
export async function getOrgById(orgId: string): Promise<Organization | null> {
  return getOrganizationById(orgId);
}

/**
 * Get organization by slug (for routing)
 */
export async function getOrgBySlug(slug: string): Promise<Organization | null> {
  return getOrganizationBySlug(slug);
}

/**
 * Update organization details
 */
export async function updateOrg(
  orgId: string,
  updates: Partial<Omit<Organization, 'organization_id' | 'created_at'>>
): Promise<Organization | null> {
  // If updating slug, validate and check uniqueness
  if (updates.slug) {
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(updates.slug) || updates.slug.length < 3) {
      throw new Error('Slug must be at least 3 characters, lowercase alphanumeric with hyphens');
    }

    const existing = await getOrganizationBySlug(updates.slug);
    if (existing && existing.organization_id !== orgId) {
      throw new Error('Organization with this slug already exists');
    }
  }

  return updateOrganization(orgId, updates);
}

/**
 * Deactivate organization (soft delete)
 */
export async function deactivateOrg(orgId: string): Promise<Organization | null> {
  return updateOrganization(orgId, { is_active: false });
}

/**
 * Reactivate organization
 */
export async function reactivateOrg(orgId: string): Promise<Organization | null> {
  return updateOrganization(orgId, { is_active: true });
}

/**
 * Get organization statistics
 */
export async function getOrgStats(orgId: string): Promise<{
  sourceCount: number;
  qboConnected: boolean;
  syncStats: {
    total: number;
    success: number;
    failed: number;
    pending: number;
  };
  planLimits: {
    maxSources: number;
    maxPayloadsPerDay: number;
    sourcesUsed: number;
  };
}> {
  const org = await getOrganizationById(orgId);
  if (!org) {
    throw new Error('Organization not found');
  }

  // Get sources count
  const sources = await getSources(orgId);
  const sourceCount = sources.filter(s => s.is_active).length;

  // Check QBO connection
  const token = await getActiveToken(orgId);
  const qboConnected = !!token;

  // Get recent sync logs (last 30 days worth, limit 1000)
  const syncLogs = await getSyncLogs(orgId, 1000);
  const syncStats = {
    total: syncLogs.length,
    success: syncLogs.filter(l => l.status === 'success').length,
    failed: syncLogs.filter(l => l.status === 'failed').length,
    pending: syncLogs.filter(l => l.status === 'pending' || l.status === 'retrying').length,
  };

  // Get plan limits
  const planLimits = PLAN_LIMITS[org.plan_tier] || PLAN_LIMITS.free;

  return {
    sourceCount,
    qboConnected,
    syncStats,
    planLimits: {
      maxSources: planLimits.maxSources,
      maxPayloadsPerDay: planLimits.maxPayloadsPerDay,
      sourcesUsed: sourceCount,
    },
  };
}

/**
 * Check if organization can add more sources based on plan
 */
export async function canAddSource(orgId: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const org = await getOrganizationById(orgId);
  if (!org) {
    return { allowed: false, reason: 'Organization not found' };
  }

  if (!org.is_active) {
    return { allowed: false, reason: 'Organization is deactivated' };
  }

  const sources = await getSources(orgId);
  const activeSourceCount = sources.filter(s => s.is_active).length;
  const planLimits = PLAN_LIMITS[org.plan_tier] || PLAN_LIMITS.free;

  if (planLimits.maxSources !== -1 && activeSourceCount >= planLimits.maxSources) {
    return {
      allowed: false,
      reason: `Plan limit reached: ${planLimits.maxSources} sources allowed on ${org.plan_tier} plan`,
    };
  }

  return { allowed: true };
}

/**
 * Upgrade organization plan
 */
export async function upgradePlan(orgId: string, newPlan: PlanTier): Promise<void> {
  const org = await getOrganizationById(orgId);
  if (!org) {
    throw new Error('Organization not found');
  }

  // Validate plan upgrade path (can't downgrade through this function)
  const planOrder: PlanTier[] = ['free', 'starter', 'professional', 'enterprise'];
  const currentIndex = planOrder.indexOf(org.plan_tier);
  const newIndex = planOrder.indexOf(newPlan);

  if (newIndex <= currentIndex) {
    throw new Error('Cannot downgrade plan through this function. Contact support for downgrades.');
  }

  await updateOrganization(orgId, { plan_tier: newPlan });
}

/**
 * Update organization settings
 */
export async function updateOrgSettings(
  orgId: string,
  settings: Partial<OrganizationSettings>
): Promise<void> {
  const org = await getOrganizationById(orgId);
  if (!org) {
    throw new Error('Organization not found');
  }

  const currentSettings = org.settings || {};
  const newSettings = { ...currentSettings, ...settings };

  await updateOrganization(orgId, { settings: newSettings });
}

/**
 * Get webhook URL for an organization
 */
export function getWebhookUrl(slug: string, sourceId?: string): string {
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
  if (sourceId) {
    return `${baseUrl}/api/v1/webhook/${slug}/${sourceId}`;
  }
  return `${baseUrl}/api/v1/webhook/${slug}`;
}

/**
 * Get OAuth connect URL for an organization
 */
export function getConnectUrl(slug: string): string {
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
  return `${baseUrl}/api/v1/connect/${slug}`;
}
