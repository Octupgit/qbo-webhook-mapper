import { getValidToken, getOAuthClient } from './qboAuthService';
import { QBOInvoice } from '../types';

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

    const data = await response.json();

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

// Get an invoice by ID
export async function getInvoice(invoiceId: string): Promise<{
  success: boolean;
  invoice?: unknown;
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
  const url = `${baseUrl}/v3/company/${realmId}/invoice/${invoiceId}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    const data = await response.json();

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

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.Fault?.Error?.[0]?.Message || 'Failed to get customers',
      };
    }

    const customers = (data.QueryResponse?.Customer || []).map((c: { Id: string; DisplayName: string; PrimaryEmailAddr?: { Address: string } }) => ({
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

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.Fault?.Error?.[0]?.Message || 'Failed to get items',
      };
    }

    const items = (data.QueryResponse?.Item || []).map((i: { Id: string; Name: string; Type: string; UnitPrice?: number }) => ({
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

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.Fault?.Error?.[0]?.Message || 'Failed to get company info',
      };
    }

    return {
      success: true,
      company: {
        id: data.CompanyInfo?.Id,
        name: data.CompanyInfo?.CompanyName,
        country: data.CompanyInfo?.Country,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get company info',
    };
  }
}
