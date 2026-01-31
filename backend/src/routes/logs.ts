import { Router, Request, Response } from 'express';
import {
  legacyGetSyncLogs,
  getSyncLogById,
  getSyncLogs,
  getPayloadById,
  getOrganizationById,
  getOrganizationBySlug,
  getOrganizations,
  DEFAULT_ORGANIZATION_ID,
} from '../services/dataService';

const router = Router();

// GET /api/logs - List all sync logs
// Supports: ?orgId=xxx or ?orgSlug=xxx or no filter (returns all orgs)
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const sourceId = req.query.sourceId as string;
    const orgId = req.query.orgId as string;
    const orgSlug = req.query.orgSlug as string;

    console.log('[Logs API] Fetching logs with params:', { limit, sourceId, orgId, orgSlug });

    // If org specified, fetch for that org only
    if (orgId || orgSlug) {
      let organizationId = orgId;

      // Resolve slug to ID if needed
      if (orgSlug && !orgId) {
        const org = await getOrganizationBySlug(orgSlug);
        if (!org) {
          return res.status(404).json({
            success: false,
            error: `Organization with slug '${orgSlug}' not found`,
          });
        }
        organizationId = org.organization_id;
      }

      const logs = await getSyncLogs(organizationId!, limit, sourceId);
      console.log(`[Logs API] Found ${logs.length} logs for org ${organizationId}`);

      return res.json({
        success: true,
        data: logs,
      });
    }

    // No org specified - fetch logs from ALL organizations
    const allOrgs = await getOrganizations();
    const allLogs: Awaited<ReturnType<typeof getSyncLogs>> = [];

    for (const org of allOrgs) {
      const orgLogs = await getSyncLogs(org.organization_id, limit, sourceId);
      allLogs.push(...orgLogs);
    }

    // Sort by created_at descending and limit
    allLogs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const limitedLogs = allLogs.slice(0, limit);

    console.log(`[Logs API] Found ${limitedLogs.length} logs across ${allOrgs.length} organizations`);

    return res.json({
      success: true,
      data: limitedLogs,
    });
  } catch (error) {
    console.error('Get logs error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get logs',
    });
  }
});

// GET /api/logs/:logId - Get log details
// Searches across all organizations to find the log
router.get('/:logId', async (req: Request, res: Response) => {
  try {
    const { logId } = req.params;

    // Try to find log across all organizations
    const allOrgs = await getOrganizations();
    let log = null;

    for (const org of allOrgs) {
      log = await getSyncLogById(org.organization_id, logId);
      if (log) break;
    }

    console.log(`[Logs API] Get log ${logId}: ${log ? 'found' : 'not found'}`);

    if (!log) {
      return res.status(404).json({
        success: false,
        error: 'Log not found',
      });
    }

    // Parse JSON fields with error handling
    let requestPayload = null;
    let responsePayload = null;

    if (log.request_payload) {
      try {
        requestPayload = JSON.parse(log.request_payload);
      } catch {
        requestPayload = log.request_payload; // Return as-is if not valid JSON
      }
    }

    if (log.response_payload) {
      try {
        responsePayload = JSON.parse(log.response_payload);
      } catch {
        responsePayload = log.response_payload; // Return as-is if not valid JSON
      }
    }

    const parsedLog = {
      ...log,
      request_payload: requestPayload,
      response_payload: responsePayload,
    };

    return res.json({
      success: true,
      data: parsedLog,
    });
  } catch (error) {
    console.error('Get log error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get log',
    });
  }
});

// POST /api/logs/:logId/retry - Retry failed sync
router.post('/:logId/retry', async (req: Request, res: Response) => {
  try {
    const { logId } = req.params;

    // Find log across all organizations
    const allOrgs = await getOrganizations();
    let log = null;
    let foundOrgId: string | null = null;

    for (const org of allOrgs) {
      log = await getSyncLogById(org.organization_id, logId);
      if (log) {
        foundOrgId = org.organization_id;
        break;
      }
    }

    if (!log) {
      return res.status(404).json({
        success: false,
        error: 'Log not found',
      });
    }

    if (log.status === 'success') {
      return res.status(400).json({
        success: false,
        error: 'Cannot retry a successful sync',
      });
    }

    // Reset the payload's processed status
    const payload = await getPayloadById(foundOrgId || DEFAULT_ORGANIZATION_ID, log.payload_id);
    if (payload) {
      // Note: In a real implementation, you'd want a proper "reset" function
      // For now, we'll just redirect to the sync endpoint
      return res.json({
        success: true,
        message: 'Please use POST /api/invoices/sync/:payloadId to retry',
        payloadId: log.payload_id,
      });
    }

    return res.status(404).json({
      success: false,
      error: 'Original payload not found',
    });
  } catch (error) {
    console.error('Retry error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retry sync',
    });
  }
});

export default router;
