/**
 * Code Playground Component
 *
 * Interactive API testing interface allowing users to:
 * - Fill in parameters dynamically
 * - Execute API requests
 * - View real responses
 */

import { useState } from 'react';
import {
  Play,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
} from 'lucide-react';
import type { ApiEndpoint } from '../../pages/DeveloperHub';

interface CodePlaygroundProps {
  endpoint: ApiEndpoint;
  orgSlug?: string;
  apiKey?: string;
}

interface ParamValues {
  [key: string]: string;
}

export default function CodePlayground({ endpoint, orgSlug, apiKey }: CodePlaygroundProps) {
  const [paramValues, setParamValues] = useState<ParamValues>(() => {
    const initial: ParamValues = {};
    endpoint.parameters?.forEach((param) => {
      // Pre-fill with context values if available
      if (param.name === 'clientSlug' && orgSlug) {
        initial[param.name] = orgSlug;
      } else if (param.name === 'X-API-Key' && apiKey) {
        initial[param.name] = apiKey;
      } else {
        initial[param.name] = param.default || '';
      }
    });
    return initial;
  });

  const [requestBody, setRequestBody] = useState<string>(
    endpoint.requestBody ? JSON.stringify(endpoint.requestBody.example, null, 2) : ''
  );

  const [response, setResponse] = useState<{
    status?: number;
    data?: unknown;
    error?: string;
    time?: number;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleParamChange = (name: string, value: string) => {
    setParamValues((prev) => ({ ...prev, [name]: value }));
  };

  const buildUrl = () => {
    // Use VITE_API_URL, or derive from current origin in production
    const baseUrl = import.meta.env.VITE_API_URL || `${window.location.origin}/api`;
    let path = endpoint.path;

    // Replace path parameters
    endpoint.parameters
      ?.filter((p) => p.location === 'path')
      .forEach((param) => {
        path = path.replace(`:${param.name}`, paramValues[param.name] || `{${param.name}}`);
      });

    // Build query string
    const queryParams = endpoint.parameters
      ?.filter((p) => p.location === 'query' && paramValues[p.name])
      .map((p) => `${p.name}=${encodeURIComponent(paramValues[p.name])}`)
      .join('&');

    return `${baseUrl}${path}${queryParams ? `?${queryParams}` : ''}`;
  };

  const executeRequest = async () => {
    setLoading(true);
    setResponse(null);

    const startTime = Date.now();

    try {
      const url = buildUrl();
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };

      // Add header parameters
      endpoint.parameters
        ?.filter((p) => p.location === 'header' && paramValues[p.name])
        .forEach((param) => {
          headers[param.name] = paramValues[param.name];
        });

      const options: RequestInit = {
        method: endpoint.method,
        headers,
      };

      // Add body for POST/PUT
      if (endpoint.requestBody && requestBody) {
        headers['Content-Type'] = endpoint.requestBody.contentType;
        options.body = requestBody;
      }

      const res = await fetch(url, options);
      const data = await res.json();
      const time = Date.now() - startTime;

      setResponse({
        status: res.status,
        data,
        time,
      });
    } catch (err) {
      setResponse({
        error: err instanceof Error ? err.message : 'Request failed',
        time: Date.now() - startTime,
      });
    } finally {
      setLoading(false);
    }
  };

  const copyResponse = async () => {
    if (response?.data) {
      await navigator.clipboard.writeText(JSON.stringify(response.data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-600';
    if (status >= 400 && status < 500) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Separate parameters by location
  const pathParams = endpoint.parameters?.filter((p) => p.location === 'path') || [];
  const queryParams = endpoint.parameters?.filter((p) => p.location === 'query') || [];
  const headerParams = endpoint.parameters?.filter((p) => p.location === 'header') || [];

  return (
    <div className="space-y-6">
      {/* Request URL Preview */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Request URL
        </label>
        <div className="flex items-center gap-2 p-3 bg-gray-900 rounded-lg">
          <span
            className={`px-2 py-1 text-xs font-bold text-white rounded ${
              endpoint.method === 'GET'
                ? 'bg-green-500'
                : endpoint.method === 'POST'
                ? 'bg-blue-500'
                : endpoint.method === 'PUT'
                ? 'bg-yellow-500'
                : 'bg-red-500'
            }`}
          >
            {endpoint.method}
          </span>
          <code className="text-sm text-gray-300 font-mono break-all">
            {buildUrl()}
          </code>
        </div>
      </div>

      {/* Path Parameters */}
      {pathParams.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Path Parameters
          </label>
          <div className="grid grid-cols-2 gap-4">
            {pathParams.map((param) => (
              <div key={param.name}>
                <label className="block text-xs text-gray-500 mb-1">
                  {param.name}
                  {param.required && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  value={paramValues[param.name] || ''}
                  onChange={(e) => handleParamChange(param.name, e.target.value)}
                  placeholder={param.description}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Query Parameters */}
      {queryParams.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Query Parameters
          </label>
          <div className="grid grid-cols-2 gap-4">
            {queryParams.map((param) => (
              <div key={param.name}>
                <label className="block text-xs text-gray-500 mb-1">
                  {param.name}
                  {param.required && <span className="text-red-500">*</span>}
                </label>
                {param.enum ? (
                  <select
                    value={paramValues[param.name] || ''}
                    onChange={(e) => handleParamChange(param.name, e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  >
                    <option value="">Select...</option>
                    {param.enum.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={param.type === 'number' ? 'number' : 'text'}
                    value={paramValues[param.name] || ''}
                    onChange={(e) => handleParamChange(param.name, e.target.value)}
                    placeholder={param.default || param.description}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header Parameters */}
      {headerParams.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Headers
          </label>
          <div className="space-y-3">
            {headerParams.map((param) => (
              <div key={param.name}>
                <label className="block text-xs text-gray-500 mb-1">
                  {param.name}
                  {param.required && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  value={paramValues[param.name] || ''}
                  onChange={(e) => handleParamChange(param.name, e.target.value)}
                  placeholder={param.description}
                  className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Request Body */}
      {endpoint.requestBody && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Request Body
          </label>
          <textarea
            value={requestBody}
            onChange={(e) => setRequestBody(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="JSON request body..."
          />
        </div>
      )}

      {/* Execute Button */}
      <button
        onClick={executeRequest}
        disabled={loading}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Executing...
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            Send Request
          </>
        )}
      </button>

      {/* Response */}
      {response && (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          {/* Response Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-3">
              {response.error ? (
                <AlertTriangle className="w-4 h-4 text-red-500" />
              ) : response.status && response.status >= 200 && response.status < 300 ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
              )}
              <span className="text-sm font-medium text-gray-900">Response</span>
              {response.status && (
                <span
                  className={`text-sm font-mono font-medium ${getStatusColor(
                    response.status
                  )}`}
                >
                  {response.status}
                </span>
              )}
              {response.time && (
                <span className="text-xs text-gray-500">{response.time}ms</span>
              )}
            </div>
            {response.data !== undefined && (
              <button
                onClick={copyResponse}
                className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy
                  </>
                )}
              </button>
            )}
          </div>

          {/* Response Body */}
          <div className="bg-gray-900 p-4 max-h-96 overflow-auto">
            {response.error ? (
              <div className="text-red-400 text-sm">{response.error}</div>
            ) : (
              <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap">
                {JSON.stringify(response.data, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
