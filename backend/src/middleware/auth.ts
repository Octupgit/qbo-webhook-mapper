import { Request, Response, NextFunction } from 'express';
import * as dataService from '../services/dataService';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      source?: {
        source_id: string;
        name: string;
      };
    }
  }
}

// Authenticate webhook requests by API key
export async function authenticateWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string || req.query.apiKey as string;

  if (!apiKey) {
    res.status(401).json({
      success: false,
      error: 'API key is required. Provide via X-API-Key header or apiKey query param.',
    });
    return;
  }

  try {
    const source = await dataService.getSourceByApiKey(apiKey);

    if (!source) {
      res.status(401).json({
        success: false,
        error: 'Invalid API key',
      });
      return;
    }

    if (!source.is_active) {
      res.status(403).json({
        success: false,
        error: 'Source is inactive',
      });
      return;
    }

    req.source = {
      source_id: source.source_id,
      name: source.name,
    };

    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
    });
  }
}

// Basic admin authentication (for demo - in production use proper auth)
export function authenticateAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // For now, allow all requests to admin endpoints
  // In production, implement proper JWT or session-based auth
  next();
}
