/**
 * Public API Routes
 *
 * Unauthenticated endpoints for public-facing features.
 * These endpoints expose ONLY minimal, non-sensitive information.
 */

import { Router, Request, Response } from 'express';
import { getOrganizationBySlug } from '../services/dataService';

const router = Router();

/**
 * GET /api/public/org/:slug
 *
 * Get minimal public info about an organization.
 * Used by the public connect page to display organization name/logo.
 * Does NOT expose internal IDs or sensitive data.
 */
router.get('/org/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const org = await getOrganizationBySlug(slug);

    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found',
      });
    }

    // Check if org is active and connection link is enabled
    if (!org.is_active || !org.connection_link_enabled) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found',
      });
    }

    // Return ONLY public, non-sensitive information
    return res.json({
      success: true,
      data: {
        name: org.name,
        slug: org.slug,
        // logo_url: org.logo_url, // Add when logo support is implemented
      },
    });
  } catch (error) {
    console.error('Public org lookup error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch organization',
    });
  }
});

export default router;
