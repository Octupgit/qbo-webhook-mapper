/**
 * Rate Limiting Middleware
 *
 * Two-tier rate limiting system:
 * - Standard: 100 requests per 15 minutes for general routes
 * - API/Proxy: 60 requests per minute per API key for proxy endpoints
 */

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Standard rate limiter for general API routes
 * 100 requests per 15 minutes per IP
 */
export const standardRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: 15 * 60, // 15 minutes in seconds
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: 15 * 60,
    });
  },
  keyGenerator: (req: Request) => {
    // Use IP address as the key for standard rate limiting
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
});

/**
 * API/Proxy rate limiter for proxy endpoints
 * 60 requests per minute per API key
 */
export const proxyRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'API rate limit exceeded. Maximum 60 requests per minute.',
    code: 'API_RATE_LIMIT_EXCEEDED',
    retryAfter: 60, // 1 minute in seconds
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'API rate limit exceeded. Maximum 60 requests per minute.',
      code: 'API_RATE_LIMIT_EXCEEDED',
      retryAfter: 60,
    });
  },
  keyGenerator: (req: Request) => {
    // Use API key as the rate limit key for proxy endpoints
    // Falls back to IP if no API key is present
    const apiKey =
      (req.headers['x-api-key'] as string) ||
      (req.headers['authorization']?.replace('Bearer ', '')) ||
      (req.query.api_key as string);

    if (apiKey) {
      return `apikey:${apiKey}`;
    }

    // Fallback to IP-based limiting
    return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
  },
});

/**
 * Rate limiter for authentication endpoints
 * 20 requests per 15 minutes per IP (prevents brute force)
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again later.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    retryAfter: 15 * 60,
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts. Please try again later.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      retryAfter: 15 * 60,
    });
  },
  keyGenerator: (req: Request) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
});

/**
 * Webhook rate limiter
 * 300 requests per minute per source (generous for high-volume webhooks)
 */
export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Webhook rate limit exceeded. Maximum 300 requests per minute.',
    code: 'WEBHOOK_RATE_LIMIT_EXCEEDED',
    retryAfter: 60,
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Webhook rate limit exceeded. Maximum 300 requests per minute.',
      code: 'WEBHOOK_RATE_LIMIT_EXCEEDED',
      retryAfter: 60,
    });
  },
  keyGenerator: (req: Request) => {
    // Use API key or client slug as the key
    const apiKey =
      (req.headers['x-api-key'] as string) ||
      (req.headers['authorization']?.replace('Bearer ', ''));

    if (apiKey) {
      return `webhook:${apiKey}`;
    }

    // Use client slug from URL params
    const clientSlug = req.params.clientSlug;
    if (clientSlug) {
      return `webhook:${clientSlug}`;
    }

    return `webhook:${req.ip || 'unknown'}`;
  },
});
