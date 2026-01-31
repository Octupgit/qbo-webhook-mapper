/**
 * Tenant Context Middleware
 *
 * Extracts organization context from URL parameters (clientSlug)
 * and attaches tenant information to the request object.
 *
 * Use this middleware for all multi-tenant v1 API routes.
 */

import { Request, Response, NextFunction } from 'express';
import { getOrganizationBySlug, getOrganizationById } from '../services/dataService';
import { TenantContext, PlanTier } from '../types';

// Note: Express Request extension is declared in types/multiTenant.ts

/**
 * Middleware to extract and validate tenant from :clientSlug parameter
 *
 * Usage:
 * router.use('/:clientSlug', tenantContext);
 * router.get('/:clientSlug/status', (req, res) => {
 *   const { organization_id } = req.tenant!;
 *   // ...
 * });
 */
export async function tenantContext(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const clientSlug = req.params.clientSlug;

    if (!clientSlug) {
      res.status(400).json({
        success: false,
        error: 'Client identifier is required',
        code: 'MISSING_CLIENT_SLUG',
      });
      return;
    }

    // Validate slug format (prevent injection)
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(clientSlug) && clientSlug.length >= 3) {
      // Also allow simple slugs like "acme" (no hyphens)
      if (!/^[a-z0-9]+$/.test(clientSlug)) {
        res.status(400).json({
          success: false,
          error: 'Invalid client identifier format',
          code: 'INVALID_CLIENT_SLUG',
        });
        return;
      }
    }

    // Look up organization by slug
    const organization = await getOrganizationBySlug(clientSlug);

    if (!organization) {
      res.status(404).json({
        success: false,
        error: 'Organization not found',
        code: 'ORG_NOT_FOUND',
      });
      return;
    }

    if (!organization.is_active) {
      res.status(403).json({
        success: false,
        error: 'Organization is deactivated',
        code: 'ORG_INACTIVE',
      });
      return;
    }

    // Attach tenant context to request (using snake_case per TenantContext interface)
    req.tenant = {
      organization_id: organization.organization_id,
      organization_slug: organization.slug,
      organization_name: organization.name,
      plan_tier: organization.plan_tier,
    };

    next();
  } catch (error) {
    console.error('Tenant context error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve organization',
      code: 'TENANT_RESOLUTION_ERROR',
    });
  }
}

/**
 * Middleware to extract tenant from organization ID in header or query
 *
 * Usage for internal/admin routes that work with org IDs directly:
 * router.use(tenantContextFromId);
 */
export async function tenantContextFromId(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Try to get org ID from header, query param, or body
    const organizationId =
      (req.headers['x-organization-id'] as string) ||
      (req.query.organizationId as string) ||
      req.body?.organizationId;

    if (!organizationId) {
      res.status(400).json({
        success: false,
        error: 'Organization ID is required',
        code: 'MISSING_ORG_ID',
      });
      return;
    }

    // Look up organization by ID
    const organization = await getOrganizationById(organizationId);

    if (!organization) {
      res.status(404).json({
        success: false,
        error: 'Organization not found',
        code: 'ORG_NOT_FOUND',
      });
      return;
    }

    if (!organization.is_active) {
      res.status(403).json({
        success: false,
        error: 'Organization is deactivated',
        code: 'ORG_INACTIVE',
      });
      return;
    }

    // Attach tenant context to request
    req.tenant = {
      organization_id: organization.organization_id,
      organization_slug: organization.slug,
      organization_name: organization.name,
      plan_tier: organization.plan_tier,
    };

    next();
  } catch (error) {
    console.error('Tenant context error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve organization',
      code: 'TENANT_RESOLUTION_ERROR',
    });
  }
}

/**
 * Optional tenant context - doesn't fail if no tenant found
 * Useful for routes that can work with or without tenant context
 */
export async function optionalTenantContext(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const clientSlug = req.params.clientSlug;

    if (clientSlug) {
      const organization = await getOrganizationBySlug(clientSlug);

      if (organization && organization.is_active) {
        req.tenant = {
          organization_id: organization.organization_id,
          organization_slug: organization.slug,
          organization_name: organization.name,
          plan_tier: organization.plan_tier,
        };
      }
    }

    next();
  } catch (error) {
    console.error('Optional tenant context error:', error);
    // Don't fail, just continue without tenant
    next();
  }
}

/**
 * Require specific plan tier or higher
 */
export function requirePlanTier(minTier: PlanTier) {
  const tierOrder: PlanTier[] = ['free', 'starter', 'professional', 'enterprise'];

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.tenant) {
      res.status(401).json({
        success: false,
        error: 'Tenant context required',
        code: 'NO_TENANT',
      });
      return;
    }

    const currentTierIndex = tierOrder.indexOf(req.tenant.plan_tier);
    const requiredTierIndex = tierOrder.indexOf(minTier);

    if (currentTierIndex < requiredTierIndex) {
      res.status(403).json({
        success: false,
        error: `This feature requires ${minTier} plan or higher`,
        code: 'PLAN_UPGRADE_REQUIRED',
        currentPlan: req.tenant.plan_tier,
        requiredPlan: minTier,
      });
      return;
    }

    next();
  };
}
