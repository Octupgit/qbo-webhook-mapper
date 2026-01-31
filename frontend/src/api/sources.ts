import apiClient from './client';
import { ApiResponse, WebhookSource, WebhookPayload } from '../types';

export async function getSources(): Promise<WebhookSource[]> {
  const response = await apiClient.get<ApiResponse<WebhookSource[]>>('/sources');
  return response.data.data || [];
}

export async function getSource(sourceId: string): Promise<WebhookSource> {
  const response = await apiClient.get<ApiResponse<WebhookSource>>(`/sources/${sourceId}`);
  return response.data.data!;
}

export async function createSource(name: string, description?: string): Promise<WebhookSource> {
  const response = await apiClient.post<ApiResponse<WebhookSource>>('/sources', {
    name,
    description,
  });
  return response.data.data!;
}

export async function updateSource(
  sourceId: string,
  data: { name?: string; description?: string; is_active?: boolean }
): Promise<void> {
  await apiClient.put(`/sources/${sourceId}`, data);
}

export async function deleteSource(sourceId: string): Promise<void> {
  await apiClient.delete(`/sources/${sourceId}`);
}

export async function regenerateApiKey(sourceId: string): Promise<string> {
  const response = await apiClient.post<ApiResponse<{ api_key: string }>>(
    `/sources/${sourceId}/regenerate-key`
  );
  return response.data.data!.api_key;
}

export async function getPayloads(sourceId: string, limit = 50): Promise<WebhookPayload[]> {
  const response = await apiClient.get<ApiResponse<WebhookPayload[]>>(
    `/sources/${sourceId}/payloads`,
    { params: { limit } }
  );
  return response.data.data || [];
}

export async function getSamplePayload(
  sourceId: string
): Promise<{ payload_id: string; received_at: string; payload: Record<string, unknown> } | null> {
  try {
    const response = await apiClient.get<ApiResponse<{ payload_id: string; received_at: string; payload: Record<string, unknown> }>>(
      `/sources/${sourceId}/payloads/sample`
    );
    return response.data.data || null;
  } catch {
    return null;
  }
}
