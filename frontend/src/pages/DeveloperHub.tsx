/**
 * Developer Hub Page
 *
 * Interactive API documentation and code playground for developers.
 * Features:
 * - API reference documentation with endpoint details
 * - Code snippets in multiple languages (Curl, Node.js, Python)
 * - Live "Try It Now" functionality
 * - Response viewer with syntax highlighting
 */

import { useState } from 'react';
import { Code2, Book, Terminal, Zap } from 'lucide-react';
import DocsSidebar from '../components/developer/DocsSidebar';
import EndpointDoc from '../components/developer/EndpointDoc';
import CodePlayground from '../components/developer/CodePlayground';

// Props for organization context (when accessed from org page)
interface DeveloperHubProps {
  orgSlug?: string;
  apiKey?: string;
  baseUrl?: string;
}

// API Endpoint definitions
export interface ApiEndpoint {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  title: string;
  description: string;
  category: string;
  parameters?: {
    name: string;
    type: string;
    location: 'path' | 'query' | 'header' | 'body';
    required: boolean;
    description: string;
    default?: string;
    enum?: string[];
  }[];
  requestBody?: {
    contentType: string;
    schema: Record<string, unknown>;
    example: Record<string, unknown>;
  };
  responses: {
    status: number;
    description: string;
    example: Record<string, unknown>;
  }[];
  errorCodes?: {
    code: string;
    description: string;
  }[];
}

// Define all API endpoints
const API_ENDPOINTS: ApiEndpoint[] = [
  // Proxy API
  {
    id: 'proxy-data',
    method: 'GET',
    path: '/api/v1/org/:clientSlug/proxy/data',
    title: 'Query Entities',
    description: 'Query QuickBooks Online entities with filtering and pagination. Returns customers, items, invoices, accounts, or vendors based on the type parameter.',
    category: 'Proxy API',
    parameters: [
      {
        name: 'clientSlug',
        type: 'string',
        location: 'path',
        required: true,
        description: 'Organization slug (e.g., "acme-corp")',
      },
      {
        name: 'type',
        type: 'string',
        location: 'query',
        required: true,
        description: 'Entity type to query',
        enum: ['customers', 'items', 'invoices', 'accounts', 'vendors'],
      },
      {
        name: 'search',
        type: 'string',
        location: 'query',
        required: false,
        description: 'Search term for name/display name filtering',
      },
      {
        name: 'status',
        type: 'string',
        location: 'query',
        required: false,
        description: 'Filter by status',
        default: 'active',
        enum: ['active', 'inactive', 'all'],
      },
      {
        name: 'limit',
        type: 'number',
        location: 'query',
        required: false,
        description: 'Maximum results to return (1-100)',
        default: '50',
      },
      {
        name: 'offset',
        type: 'number',
        location: 'query',
        required: false,
        description: 'Starting position for pagination',
        default: '0',
      },
      {
        name: 'X-API-Key',
        type: 'string',
        location: 'header',
        required: true,
        description: 'API key for authentication',
      },
    ],
    responses: [
      {
        status: 200,
        description: 'Successful response with entities',
        example: {
          success: true,
          data: [
            {
              Id: '1',
              DisplayName: 'John Doe',
              PrimaryEmailAddr: { Address: 'john@example.com' },
              Active: true,
            },
          ],
          meta: {
            type: 'customers',
            count: 1,
            limit: 50,
            offset: 0,
            hasMore: false,
          },
        },
      },
      {
        status: 400,
        description: 'Invalid request parameters',
        example: {
          success: false,
          error: 'Invalid type: xyz. Supported types: customers, items, invoices, accounts, vendors',
          code: 'ERR_INVALID_TYPE',
        },
      },
      {
        status: 401,
        description: 'Missing or invalid API key',
        example: {
          success: false,
          error: 'API key required',
          code: 'ERR_UNAUTHORIZED',
        },
      },
      {
        status: 503,
        description: 'QuickBooks unavailable or token expired',
        example: {
          success: false,
          error: 'Token has expired',
          code: 'ERR_TOKEN_EXPIRED',
          needsReconnect: true,
          connectUrl: 'https://api.example.com/api/v1/connect/acme-corp?source=admin',
        },
      },
    ],
    errorCodes: [
      { code: 'ERR_INVALID_TYPE', description: 'Invalid entity type specified' },
      { code: 'ERR_QBO_UNAVAILABLE', description: 'QuickBooks API is unreachable' },
      { code: 'ERR_TOKEN_EXPIRED', description: 'OAuth token has expired - needs reconnection' },
      { code: 'ERR_TOKEN_REVOKED', description: 'OAuth token was revoked - needs reconnection' },
      { code: 'ERR_RATE_LIMITED', description: 'Rate limit exceeded - slow down requests' },
    ],
  },
  {
    id: 'proxy-data-by-id',
    method: 'GET',
    path: '/api/v1/org/:clientSlug/proxy/data/:type/:id',
    title: 'Get Entity by ID',
    description: 'Retrieve a single QuickBooks Online entity by its ID.',
    category: 'Proxy API',
    parameters: [
      {
        name: 'clientSlug',
        type: 'string',
        location: 'path',
        required: true,
        description: 'Organization slug (e.g., "acme-corp")',
      },
      {
        name: 'type',
        type: 'string',
        location: 'path',
        required: true,
        description: 'Entity type',
        enum: ['customers', 'items', 'invoices', 'accounts', 'vendors'],
      },
      {
        name: 'id',
        type: 'string',
        location: 'path',
        required: true,
        description: 'Entity ID in QuickBooks',
      },
      {
        name: 'X-API-Key',
        type: 'string',
        location: 'header',
        required: true,
        description: 'API key for authentication',
      },
    ],
    responses: [
      {
        status: 200,
        description: 'Successful response with entity',
        example: {
          success: true,
          data: {
            Id: '1',
            DisplayName: 'John Doe',
            PrimaryEmailAddr: { Address: 'john@example.com' },
            Balance: 150.0,
            Active: true,
          },
        },
      },
      {
        status: 404,
        description: 'Entity not found',
        example: {
          success: false,
          error: 'Customer with ID 999 not found',
          code: 'ERR_NOT_FOUND',
        },
      },
    ],
    errorCodes: [
      { code: 'ERR_NOT_FOUND', description: 'Entity with specified ID does not exist' },
    ],
  },
  {
    id: 'proxy-types',
    method: 'GET',
    path: '/api/v1/org/:clientSlug/proxy/types',
    title: 'List Supported Types',
    description: 'Get a list of all supported entity types for the Proxy API.',
    category: 'Proxy API',
    parameters: [
      {
        name: 'clientSlug',
        type: 'string',
        location: 'path',
        required: true,
        description: 'Organization slug (e.g., "acme-corp")',
      },
      {
        name: 'X-API-Key',
        type: 'string',
        location: 'header',
        required: true,
        description: 'API key for authentication',
      },
    ],
    responses: [
      {
        status: 200,
        description: 'List of supported types',
        example: {
          success: true,
          data: {
            types: ['customers', 'items', 'invoices', 'accounts', 'vendors'],
            description: {
              customers: 'QuickBooks customers',
              items: 'Products and services',
              invoices: 'Sales invoices',
              accounts: 'Chart of accounts',
              vendors: 'Vendors/suppliers',
            },
          },
        },
      },
    ],
  },
  // Webhooks
  {
    id: 'webhook-receive',
    method: 'POST',
    path: '/api/v1/webhook/:clientSlug',
    title: 'Receive Webhook',
    description: 'Receive and process incoming webhook payloads from external systems (e.g., Shopify, WooCommerce, Stripe).',
    category: 'Webhooks',
    parameters: [
      {
        name: 'clientSlug',
        type: 'string',
        location: 'path',
        required: true,
        description: 'Organization slug (e.g., "acme-corp")',
      },
      {
        name: 'X-API-Key',
        type: 'string',
        location: 'header',
        required: true,
        description: 'API key for authentication',
      },
    ],
    requestBody: {
      contentType: 'application/json',
      schema: {
        type: 'object',
        description: 'Any valid JSON payload from your source system',
      },
      example: {
        order_id: '12345',
        customer: {
          id: 'C-001',
          name: 'John Doe',
          email: 'john@example.com',
        },
        line_items: [
          { sku: 'PROD-A', quantity: 2, price: 49.99 },
        ],
        total: 99.98,
      },
    },
    responses: [
      {
        status: 200,
        description: 'Webhook received and processed',
        example: {
          success: true,
          payload_id: 'pay_abc123',
          message: 'Webhook received successfully',
        },
      },
      {
        status: 202,
        description: 'Webhook received but queued for processing',
        example: {
          success: true,
          payload_id: 'pay_abc123',
          message: 'Webhook queued for processing',
        },
      },
    ],
  },
];

// Group endpoints by category
const ENDPOINT_CATEGORIES = API_ENDPOINTS.reduce((acc, endpoint) => {
  if (!acc[endpoint.category]) {
    acc[endpoint.category] = [];
  }
  acc[endpoint.category].push(endpoint);
  return acc;
}, {} as Record<string, ApiEndpoint[]>);

export default function DeveloperHub({ orgSlug, apiKey, baseUrl }: DeveloperHubProps = {}) {
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint>(API_ENDPOINTS[0]);
  const [showPlayground, setShowPlayground] = useState(false);

  // Get base URL from props or environment
  const effectiveBaseUrl = baseUrl || import.meta.env.VITE_API_URL || `${window.location.origin}/api`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Code2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Developer Hub</h1>
              <p className="text-sm text-gray-500">API Reference & Code Playground</p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-6 mt-6">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Book className="w-4 h-4" />
              <span>{API_ENDPOINTS.length} Endpoints</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Terminal className="w-4 h-4" />
              <span>REST API</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Zap className="w-4 h-4" />
              <span>JSON Responses</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0">
            <DocsSidebar
              categories={ENDPOINT_CATEGORIES}
              selectedEndpoint={selectedEndpoint}
              onSelectEndpoint={setSelectedEndpoint}
            />
          </div>

          {/* Content Area */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Getting Started Sections */}
            <div id="authentication" className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Authentication</h2>
              <p className="text-gray-600 mb-4">
                All API requests require authentication using an API key. Include your API key in the request headers:
              </p>
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-gray-100 mb-4">
                <code>X-API-Key: your_api_key_here</code>
              </div>
              <p className="text-gray-600 text-sm">
                You can generate API keys from the Organization Settings page. Keys are scoped to a specific organization.
              </p>
            </div>

            <div id="rate-limits" className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Rate Limits</h2>
              <p className="text-gray-600 mb-4">
                API requests are rate limited to ensure fair usage and system stability:
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 text-gray-600">Endpoint Type</th>
                    <th className="text-left py-2 text-gray-600">Limit</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="py-2">Proxy API</td>
                    <td className="py-2 font-mono">60 requests/minute</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2">Webhook Endpoints</td>
                    <td className="py-2 font-mono">300 requests/minute</td>
                  </tr>
                  <tr>
                    <td className="py-2">Standard API</td>
                    <td className="py-2 font-mono">100 requests/15 minutes</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div id="error-codes" className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Error Codes</h2>
              <p className="text-gray-600 mb-4">
                The API uses standard HTTP status codes and returns error details in JSON format:
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 text-gray-600">Code</th>
                    <th className="text-left py-2 text-gray-600">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 font-mono">INVALID_API_KEY</td>
                    <td className="py-2">API key is missing or invalid</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 font-mono">RATE_LIMITED</td>
                    <td className="py-2">Too many requests, retry after cooldown</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 font-mono">QBO_NOT_CONNECTED</td>
                    <td className="py-2">QuickBooks not connected for this org</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 font-mono">TOKEN_EXPIRED</td>
                    <td className="py-2">QBO token expired, reconnect required</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-mono">TRANSFORM_FAILED</td>
                    <td className="py-2">Webhook payload mapping failed</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Endpoint Documentation */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Toggle between docs and playground */}
              <div className="flex border-b border-gray-200">
                <button
                  onClick={() => setShowPlayground(false)}
                  className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                    !showPlayground
                      ? 'bg-gray-50 text-gray-900 border-b-2 border-gray-900'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <Book className="w-4 h-4 inline-block mr-2" />
                  Documentation
                </button>
                <button
                  onClick={() => setShowPlayground(true)}
                  className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                    showPlayground
                      ? 'bg-gray-50 text-gray-900 border-b-2 border-gray-900'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <Terminal className="w-4 h-4 inline-block mr-2" />
                  Try It Now
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                {showPlayground ? (
                  <CodePlayground
                    endpoint={selectedEndpoint}
                    orgSlug={orgSlug}
                    apiKey={apiKey}
                  />
                ) : (
                  <EndpointDoc
                    endpoint={selectedEndpoint}
                    orgSlug={orgSlug}
                    apiKey={apiKey}
                    baseUrl={effectiveBaseUrl}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Export endpoints for use in other components
export { API_ENDPOINTS, ENDPOINT_CATEGORIES };
