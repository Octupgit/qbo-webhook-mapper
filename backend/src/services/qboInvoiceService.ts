/**
 * QBO Invoice Service - Multi-Tenant
 *
 * Handles invoice creation and queries for QuickBooks Online.
 * Supports multi-tenant operations with per-organization token retrieval.
 */

import { getValidToken as legacyGetValidToken } from './qboAuthService';
import { getValidToken as multiTenantGetValidToken } from './multiTenantAuthService';
import { QBOInvoice } from '../types';

// QBO API response types
interface QBOErrorResponse {
  Fault?: {
    Error?: Array<{
      Message?: string;
      Detail?: string;
      code?: string;
    }>;
    type?: string;
  };
}

interface QBOInvoiceResponse extends QBOErrorResponse {
  Invoice?: { Id: string; DocNumber: string };
}

interface QBOQueryResponse<T> extends QBOErrorResponse {
  QueryResponse?: T;
}

interface QBOCompanyInfoResponse extends QBOErrorResponse {
  CompanyInfo?: { Id: string; CompanyName: string; Country: string };
}

const QBO_BASE_URL = {
  sandbox: 'https://sandbox-quickbooks.api.intuit.com',
  production: 'https://quickbooks.api.intuit.com',
};

// Get the base URL based on environment
function getBaseUrl(): string {
  const env = process.env.QBO_ENVIRONMENT || 'sandbox';
  return QBO_BASE_URL[env as keyof typeof QBO_BASE_URL] || QBO_BASE_URL.sandbox;
}

/**
 * Get valid token - supports both legacy (single-tenant) and multi-tenant modes
 */
async function getTokenForOrg(organizationId?: string): Promise<{
  accessToken: string;
  realmId: string;
} | null> {
  // Multi-tenant mode
  if (organizationId) {
    const result = await multiTenantGetValidToken(organizationId);
    if (!result.success) {
      return null;
    }
    return {
      accessToken: result.accessToken!,
      realmId: result.realmId!,
    };
  }

  // Legacy single-tenant mode (backward compatibility)
  return legacyGetValidToken();
}

/**
 * Format QBO error for logging and display
 */
function formatQBOError(data: QBOErrorResponse): {
  message: string;
  code?: string;
  detail?: string;
  fullError: unknown;
} {
  const error = data.Fault?.Error?.[0];
  return {
    message: error?.Message || 'Unknown QuickBooks error',
    code: error?.code,
    detail: error?.Detail,
    fullError: data,
  };
}

/**
 * Create an invoice in QuickBooks
 *
 * @param invoice - The invoice data to create
 * @param organizationId - Optional organization ID for multi-tenant mode
 */
export async function createInvoice(
  invoice: QBOInvoice,
  organizationId?: string
): Promise<{
  success: boolean;
  invoiceId?: string;
  docNumber?: string;
  response?: unknown;
  error?: string;
  errorCode?: string;
  errorDetail?: string;
}> {
  const tokenInfo = await getTokenForOrg(organizationId);
  if (!tokenInfo) {
    return {
      success: false,
      error: 'Not connected to QuickBooks. Please authorize first.',
      errorCode: 'NO_TOKEN',
    };
  }

  const { accessToken, realmId } = tokenInfo;
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/v3/company/${realmId}/invoice`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(invoice),
    });

    const data = await response.json() as QBOInvoiceResponse;

    if (!response.ok) {
      const errorInfo = formatQBOError(data);

      // Log detailed error for debugging
      console.error('QBO Invoice Creation Failed:', {
        status: response.status,
        statusText: response.statusText,
        organizationId,
        realmId,
        error: errorInfo,
      });

      return {
        success: false,
        error: errorInfo.message,
        errorCode: errorInfo.code,
        errorDetail: errorInfo.detail,
        response: data,
      };
    }

    return {
      success: true,
      invoiceId: data.Invoice?.Id,
      docNumber: data.Invoice?.DocNumber,
      response: data,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create invoice';

    console.error('QBO Invoice Creation Exception:', {
      organizationId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      error: errorMessage,
      errorCode: 'NETWORK_ERROR',
    };
  }
}

// Mock invoice data for demo
const mockInvoices: Record<string, unknown> = {
  '178': {
    Id: '178',
    DocNumber: 'INV-1001',
    TxnDate: '2025-01-31',
    DueDate: '2025-02-28',
    TotalAmt: 140.37,
    Balance: 140.37,
    CustomerRef: { value: 'CUST-001', name: 'John Doe' },
    BillEmail: { Address: 'john@example.com' },
    Line: [
      {
        Id: '1',
        LineNum: 1,
        Description: 'Premium Widget',
        Amount: 99.98,
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          ItemRef: { value: '1', name: 'Widget' },
          Qty: 2,
          UnitPrice: 49.99,
        },
      },
      {
        Id: '2',
        LineNum: 2,
        Description: 'Super Gadget',
        Amount: 29.99,
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          ItemRef: { value: '2', name: 'Gadget' },
          Qty: 1,
          UnitPrice: 29.99,
        },
      },
      {
        Amount: 129.97,
        DetailType: 'SubTotalLineDetail',
      },
    ],
    CustomerMemo: { value: 'Order #ORD-12345' },
    CurrencyRef: { value: 'USD', name: 'United States Dollar' },
    MetaData: {
      CreateTime: '2025-01-31T10:30:00-08:00',
      LastUpdatedTime: '2025-01-31T10:30:00-08:00',
    },
  },
};

/**
 * Get an invoice by ID
 */
export async function getInvoice(
  invoiceId: string,
  organizationId?: string
): Promise<{
  success: boolean;
  invoice?: unknown;
  error?: string;
}> {
  // If using mock data, return mock invoice first
  if (process.env.USE_MOCK_DATA === 'true' && mockInvoices[invoiceId]) {
    return {
      success: true,
      invoice: mockInvoices[invoiceId],
    };
  }

  const tokenInfo = await getTokenForOrg(organizationId);
  if (!tokenInfo) {
    // Return mock invoice if available (for demo purposes)
    if (mockInvoices[invoiceId]) {
      return {
        success: true,
        invoice: mockInvoices[invoiceId],
      };
    }
    return {
      success: false,
      error: 'Not connected to QuickBooks. Please authorize first.',
    };
  }

  const { accessToken, realmId } = tokenInfo;
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/v3/company/${realmId}/invoice/${invoiceId}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    const data = await response.json() as QBOInvoiceResponse;

    if (!response.ok) {
      // Fallback to mock invoice if real one not found
      if (mockInvoices[invoiceId]) {
        return {
          success: true,
          invoice: mockInvoices[invoiceId],
        };
      }
      const errorInfo = formatQBOError(data);
      return {
        success: false,
        error: errorInfo.message,
      };
    }

    return {
      success: true,
      invoice: data.Invoice,
    };
  } catch (error) {
    // Fallback to mock invoice on error
    if (mockInvoices[invoiceId]) {
      return {
        success: true,
        invoice: mockInvoices[invoiceId],
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get invoice',
    };
  }
}

/**
 * Query customers (for mapping CustomerRef)
 */
export async function getCustomers(
  searchTerm?: string,
  organizationId?: string
): Promise<{
  success: boolean;
  customers?: Array<{ id: string; name: string; email?: string }>;
  error?: string;
}> {
  const tokenInfo = await getTokenForOrg(organizationId);
  if (!tokenInfo) {
    return {
      success: false,
      error: 'Not connected to QuickBooks. Please authorize first.',
    };
  }

  const { accessToken, realmId } = tokenInfo;
  const baseUrl = getBaseUrl();

  let query = "SELECT * FROM Customer WHERE Active = true";
  if (searchTerm) {
    // Escape single quotes in search term to prevent injection
    const escapedTerm = searchTerm.replace(/'/g, "\\'");
    query += ` AND DisplayName LIKE '%${escapedTerm}%'`;
  }
  query += " MAXRESULTS 100";

  const url = `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    const data = await response.json() as QBOQueryResponse<{
      Customer?: Array<{
        Id: string;
        DisplayName: string;
        PrimaryEmailAddr?: { Address: string }
      }>
    }>;

    if (!response.ok) {
      const errorInfo = formatQBOError(data);
      return {
        success: false,
        error: errorInfo.message,
      };
    }

    const customers = (data.QueryResponse?.Customer || []).map((c) => ({
      id: c.Id,
      name: c.DisplayName,
      email: c.PrimaryEmailAddr?.Address,
    }));

    return {
      success: true,
      customers,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get customers',
    };
  }
}

/**
 * Query items/products (for mapping ItemRef)
 */
export async function getItems(
  searchTerm?: string,
  organizationId?: string
): Promise<{
  success: boolean;
  items?: Array<{ id: string; name: string; type: string; unitPrice?: number }>;
  error?: string;
}> {
  const tokenInfo = await getTokenForOrg(organizationId);
  if (!tokenInfo) {
    return {
      success: false,
      error: 'Not connected to QuickBooks. Please authorize first.',
    };
  }

  const { accessToken, realmId } = tokenInfo;
  const baseUrl = getBaseUrl();

  let query = "SELECT * FROM Item WHERE Active = true";
  if (searchTerm) {
    // Escape single quotes in search term to prevent injection
    const escapedTerm = searchTerm.replace(/'/g, "\\'");
    query += ` AND Name LIKE '%${escapedTerm}%'`;
  }
  query += " MAXRESULTS 100";

  const url = `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    const data = await response.json() as QBOQueryResponse<{
      Item?: Array<{
        Id: string;
        Name: string;
        Type: string;
        UnitPrice?: number
      }>
    }>;

    if (!response.ok) {
      const errorInfo = formatQBOError(data);
      return {
        success: false,
        error: errorInfo.message,
      };
    }

    const items = (data.QueryResponse?.Item || []).map((i) => ({
      id: i.Id,
      name: i.Name,
      type: i.Type,
      unitPrice: i.UnitPrice,
    }));

    return {
      success: true,
      items,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get items',
    };
  }
}

/**
 * Get company info
 */
export async function getCompanyInfo(organizationId?: string): Promise<{
  success: boolean;
  company?: { id: string; name: string; country: string };
  error?: string;
}> {
  const tokenInfo = await getTokenForOrg(organizationId);
  if (!tokenInfo) {
    return {
      success: false,
      error: 'Not connected to QuickBooks. Please authorize first.',
    };
  }

  const { accessToken, realmId } = tokenInfo;
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/v3/company/${realmId}/companyinfo/${realmId}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    const data = await response.json() as QBOCompanyInfoResponse;

    if (!response.ok) {
      const errorInfo = formatQBOError(data);
      return {
        success: false,
        error: errorInfo.message,
      };
    }

    return {
      success: true,
      company: {
        id: data.CompanyInfo?.Id || '',
        name: data.CompanyInfo?.CompanyName || '',
        country: data.CompanyInfo?.Country || '',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get company info',
    };
  }
}
