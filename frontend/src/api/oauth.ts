import apiClient from './client';
import { ApiResponse, OAuthStatus } from '../types';

export function getAuthorizationUrl(): string {
  return '/api/oauth/qbo/authorize';
}

export async function getConnectionStatus(): Promise<OAuthStatus> {
  const response = await apiClient.get<ApiResponse<OAuthStatus>>('/oauth/qbo/status');
  return response.data.data || { connected: false };
}

export async function disconnect(): Promise<void> {
  await apiClient.post('/oauth/qbo/disconnect');
}

export async function refreshToken(): Promise<void> {
  await apiClient.post('/oauth/qbo/refresh');
}
