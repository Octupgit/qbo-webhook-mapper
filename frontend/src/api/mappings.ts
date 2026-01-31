import apiClient from './client';
import {
  ApiResponse,
  MappingConfiguration,
  FieldMapping,
  QBOField,
  Transformation,
  TransformTestResult,
} from '../types';

export async function getMappings(sourceId: string): Promise<MappingConfiguration[]> {
  const response = await apiClient.get<ApiResponse<MappingConfiguration[]>>(
    `/mappings/sources/${sourceId}/mappings`
  );
  return response.data.data || [];
}

export async function getMapping(mappingId: string): Promise<MappingConfiguration> {
  const response = await apiClient.get<ApiResponse<MappingConfiguration>>(
    `/mappings/${mappingId}`
  );
  return response.data.data!;
}

export async function createMapping(
  sourceId: string,
  data: {
    name: string;
    description?: string;
    field_mappings: FieldMapping[];
    static_values?: Record<string, unknown>;
  }
): Promise<MappingConfiguration> {
  const response = await apiClient.post<ApiResponse<MappingConfiguration>>(
    `/mappings/sources/${sourceId}/mappings`,
    data
  );
  return response.data.data!;
}

export async function updateMapping(
  mappingId: string,
  data: {
    name?: string;
    description?: string;
    field_mappings?: FieldMapping[];
    static_values?: Record<string, unknown>;
    is_active?: boolean;
  }
): Promise<void> {
  await apiClient.put(`/mappings/${mappingId}`, data);
}

export async function deleteMapping(mappingId: string): Promise<void> {
  await apiClient.delete(`/mappings/${mappingId}`);
}

export async function activateMapping(mappingId: string): Promise<void> {
  await apiClient.post(`/mappings/${mappingId}/activate`);
}

export async function testMapping(
  mappingId: string,
  samplePayload: Record<string, unknown>
): Promise<TransformTestResult> {
  const response = await apiClient.post<ApiResponse<TransformTestResult>>(
    `/mappings/${mappingId}/test`,
    { samplePayload }
  );
  return response.data.data!;
}

export async function getQBOFields(): Promise<QBOField[]> {
  const response = await apiClient.get<ApiResponse<QBOField[]>>('/mappings/meta/qbo-fields');
  return response.data.data || [];
}

export async function getTransformations(): Promise<Transformation[]> {
  const response = await apiClient.get<ApiResponse<Transformation[]>>(
    '/mappings/meta/transformations'
  );
  return response.data.data || [];
}

export async function extractJsonPaths(samplePayload: Record<string, unknown>): Promise<string[]> {
  const response = await apiClient.post<ApiResponse<string[]>>(
    '/mappings/meta/extract-paths',
    { samplePayload }
  );
  return response.data.data || [];
}
