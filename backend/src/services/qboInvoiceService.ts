import { getValidToken } from './qboAuthService';
import { QBOInvoice } from '../types';

// QBO API response types
interface QBOErrorResponse {
  Fault?: {
    Error?: Array<{ Message?: string; Detail?: string }>;
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

// Create an invoice in QuickBooks
export async function createInvoice(invoice: QBOInvoice): Promise<{
  success: boolean;
  invoiceId?: string;
  docNumber?: string;
  response?: unknown;
  error?: string;
}> {
  const tokenInfo = await getValidToken();
  if (!tokenInfo) {
    return {
      success: false,
      error: 'Not connected to QuickBooks. Please authorize first.',
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
      const errorMessage = data.Fault?.Error?.[0]?.Message ||
                          data.Fault?.Error?.[0]?.Detail ||
                          'Unknown error from QuickBooks';
      return {
        success: false,
        error: errorMessage,
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
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create invoice',
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

// Get an invoice by ID
export async function getInvoice(invoiceId: string): Promise<{
  success: boolean;
  invoice?: unknown;
  error?: string;
}> {
  const tokenInfo = await getValidToken();
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
      return {
        success: false,
        error: data.Fault?.Error?.[0]?.Message || 'Failed to get invoice',
      };
    }

    return {
      success: true,
      invoice: data.Invoice,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get invoice',
    };
  }
}

// Query customers (for mapping CustomerRef)
export async function getCustomers(searchTerm?: string): Promise<{
  success: boolean;
  customers?: Array<{ id: string; name: string; email?: string }>;
  error?: string;
}> {
  const tokenInfo = await getValidToken();
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
    query += ` AND DisplayName LIKE '%${searchTerm}%'`;
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

    const data = await response.json() as QBOQueryResponse<{ Customer?: Array<{ Id: string; DisplayName: string; PrimaryEmailAddr?: { Address: string } }> }>;

    if (!response.ok) {
      return {
        success: false,
        error: data.Fault?.Error?.[0]?.Message || 'Failed to get customers',
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

// Query items/products (for mapping ItemRef)
export async function getItems(searchTerm?: string): Promise<{
  success: boolean;
  items?: Array<{ id: string; name: string; type: string; unitPrice?: number }>;
  error?: string;
}> {
  const tokenInfo = await getValidToken();
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
    query += ` AND Name LIKE '%${searchTerm}%'`;
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

    const data = await response.json() as QBOQueryResponse<{ Item?: Array<{ Id: string; Name: string; Type: string; UnitPrice?: number }> }>;

    if (!response.ok) {
      return {
        success: false,
        error: data.Fault?.Error?.[0]?.Message || 'Failed to get items',
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

// Get company info
export async function getCompanyInfo(): Promise<{
  success: boolean;
  company?: { id: string; name: string; country: string };
  error?: string;
}> {
  const tokenInfo = await getValidToken();
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
      return {
        success: false,
        error: data.Fault?.Error?.[0]?.Message || 'Failed to get company info',
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
