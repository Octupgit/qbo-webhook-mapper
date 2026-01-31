import apiClient from './client';
import { ApiResponse, SyncLog } from '../types';

export async function syncPayload(payloadId: string): Promise<{
  invoiceId: string;
  docNumber: string;
  logId: string;
}> {
  const response = await apiClient.post<ApiResponse<{
    invoiceId: string;
    docNumber: string;
    logId: string;
  }>>(`/invoices/sync/${payloadId}`);
  return response.data.data!;
}

export async function syncBatch(payloadIds: string[]): Promise<{
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    payloadId: string;
    success: boolean;
    invoiceId?: string;
    error?: string;
  }>;
}> {
  const response = await apiClient.post<ApiResponse<{
    total: number;
    successful: number;
    failed: number;
    results: Array<{
      payloadId: string;
      success: boolean;
      invoiceId?: string;
      error?: string;
    }>;
  }>>('/invoices/sync-batch', { payloadIds });
  return response.data.data!;
}

export async function getInvoice(invoiceId: string): Promise<Record<string, unknown>> {
  const response = await apiClient.get<ApiResponse<Record<string, unknown>>>(
    `/invoices/${invoiceId}`
  );
  return response.data.data!;
}

export async function getSyncLogs(limit = 100, sourceId?: string): Promise<SyncLog[]> {
  const response = await apiClient.get<ApiResponse<SyncLog[]>>('/logs', {
    params: { limit, sourceId },
  });
  return response.data.data || [];
}

export async function getSyncLog(logId: string): Promise<SyncLog & {
  request_payload?: Record<string, unknown>;
  response_payload?: Record<string, unknown>;
}> {
  const response = await apiClient.get<ApiResponse<SyncLog & {
    request_payload?: Record<string, unknown>;
    response_payload?: Record<string, unknown>;
  }>>(`/logs/${logId}`);
  return response.data.data!;
}

export async function getQBOCustomers(
  search?: string
): Promise<Array<{ id: string; name: string; email?: string }>> {
  const response = await apiClient.get<ApiResponse<Array<{ id: string; name: string; email?: string }>>>(
    '/invoices/qbo/customers',
    { params: { search } }
  );
  return response.data.data || [];
}

export async function getQBOItems(
  search?: string
): Promise<Array<{ id: string; name: string; type: string; unitPrice?: number }>> {
  const response = await apiClient.get<ApiResponse<Array<{ id: string; name: string; type: string; unitPrice?: number }>>>(
    '/invoices/qbo/items',
    { params: { search } }
  );
  return response.data.data || [];
}
