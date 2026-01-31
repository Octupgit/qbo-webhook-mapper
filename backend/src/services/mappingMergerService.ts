/**
 * Mapping Merger Service
 *
 * Handles the hierarchical mapping engine that merges:
 * 1. Global templates (lowest priority)
 * 2. Client overrides (medium priority)
 * 3. Source-specific mappings (highest priority)
 *
 * Priority order (lower number = higher importance):
 * - Source-specific mapping: 0-9
 * - Client Override for Specific Source: 10-49
 * - Client Override for All Sources: 50-99
 * - Global Template for Source Type: 100-199
 * - Global Default Template: 200+
 */

import {
  getGlobalTemplatesBySourceType,
  getClientOverrides,
  getActiveMapping,
  getSourceById,
} from './dataService';
import {
  FieldMapping,
  MergedMapping,
  MergeLogEntry,
  GlobalMappingTemplate,
  ClientMappingOverride,
} from '../types';

/**
 * Get the effective (merged) mapping for a source
 *
 * @param organizationId - The organization ID
 * @param sourceId - The source ID
 * @returns MergedMapping with merged field_mappings and merge log
 */
export async function getEffectiveMapping(
  organizationId: string,
  sourceId: string
): Promise<MergedMapping | null> {
  // Get source to determine source_type
  const source = await getSourceById(organizationId, sourceId);
  if (!source) {
    throw new Error('Source not found');
  }

  const sourceType = source.source_type || 'custom';
  const mergeLog: MergeLogEntry[] = [];
  let mergedFieldMappings: FieldMapping[] = [];
  let staticValues: Record<string, unknown> = {};

  // Step 1: Get global template for this source type (lowest priority)
  const globalTemplates = await getGlobalTemplatesBySourceType(sourceType);
  const activeGlobalTemplate = globalTemplates.find(t => t.is_active);

  let globalTemplate: GlobalMappingTemplate | undefined;
  if (activeGlobalTemplate) {
    globalTemplate = activeGlobalTemplate;
    mergedFieldMappings = [...activeGlobalTemplate.field_mappings];
    staticValues = { ...(activeGlobalTemplate.static_values || {}) };
    mergeLog.push({
      source: 'global_template',
      template_id: activeGlobalTemplate.template_id,
      fields_applied: activeGlobalTemplate.field_mappings.map(f => f.qboField),
      priority: activeGlobalTemplate.priority,
    });
  }

  // Step 2: Get client overrides (higher priority)
  const clientOverrides = await getClientOverrides(organizationId);

  // Filter for applicable overrides (null source_id = applies to all, or matching source_id)
  const applicableOverrides = clientOverrides
    .filter(o => o.is_active && (!o.source_id || o.source_id === sourceId))
    .sort((a, b) => b.priority - a.priority); // Sort descending so lower priority gets applied first

  let clientOverride: ClientMappingOverride | undefined;

  for (const override of applicableOverrides) {
    clientOverride = override;
    mergedFieldMappings = mergeFieldMappings(mergedFieldMappings, override.field_mappings);
    staticValues = { ...staticValues, ...(override.static_values || {}) };
    mergeLog.push({
      source: 'client_override',
      override_id: override.override_id,
      fields_applied: override.field_mappings.map(f => f.qboField),
      priority: override.priority,
    });
  }

  // Step 3: Check for source-specific mapping (legacy mapping_configurations - highest priority)
  const sourceMapping = await getActiveMapping(organizationId, sourceId);
  if (sourceMapping) {
    mergedFieldMappings = mergeFieldMappings(mergedFieldMappings, sourceMapping.field_mappings);
    staticValues = { ...staticValues, ...(sourceMapping.static_values || {}) };
    mergeLog.push({
      source: 'source_mapping',
      mapping_id: sourceMapping.mapping_id,
      fields_applied: sourceMapping.field_mappings.map(f => f.qboField),
      priority: 0, // Highest priority
    });
  }

  // If no mappings found at all, return null
  if (mergedFieldMappings.length === 0) {
    return null;
  }

  // Build the merged mapping result
  const result: MergedMapping = {
    organization_id: organizationId,
    source_id: sourceId,
    effective_field_mappings: mergedFieldMappings,
    static_values: Object.keys(staticValues).length > 0 ? staticValues : undefined,
    merge_log: mergeLog,
    global_template: globalTemplate,
    client_override: clientOverride,
    source_mapping: sourceMapping ? {
      mapping_id: sourceMapping.mapping_id,
      name: sourceMapping.name,
      field_mappings: sourceMapping.field_mappings,
    } : undefined,
  };

  return result;
}

/**
 * Merge field mappings - higher priority fields override lower priority ones
 *
 * @param base - Base field mappings (lower priority)
 * @param override - Override field mappings (higher priority)
 * @returns Merged field mappings
 */
export function mergeFieldMappings(base: FieldMapping[], override: FieldMapping[]): FieldMapping[] {
  const result = new Map<string, FieldMapping>();

  // Start with base mappings
  for (const mapping of base) {
    result.set(mapping.qboField, { ...mapping });
  }

  // Override with higher priority mappings
  for (const mapping of override) {
    result.set(mapping.qboField, { ...mapping });
  }

  return Array.from(result.values());
}

/**
 * Preview what the effective mapping would look like without saving
 *
 * @param organizationId - The organization ID
 * @param sourceId - The source ID
 * @param proposedOverride - Proposed client override to preview
 * @returns Preview of the merged mapping
 */
export async function previewMerge(
  organizationId: string,
  sourceId: string,
  proposedOverride: { field_mappings: FieldMapping[]; static_values?: Record<string, unknown> }
): Promise<MergedMapping | null> {
  // Get current effective mapping
  const current = await getEffectiveMapping(organizationId, sourceId);

  if (!current) {
    // No existing mapping, proposed override becomes the mapping
    return {
      organization_id: organizationId,
      source_id: sourceId,
      effective_field_mappings: proposedOverride.field_mappings,
      static_values: proposedOverride.static_values,
      merge_log: [{
        source: 'client_override',
        override_id: 'preview',
        fields_applied: proposedOverride.field_mappings.map(f => f.qboField),
        priority: 50,
      }],
    };
  }

  // Merge proposed override with current
  const mergedFields = mergeFieldMappings(current.effective_field_mappings, proposedOverride.field_mappings);
  const mergedStatic = { ...(current.static_values || {}), ...(proposedOverride.static_values || {}) };

  return {
    ...current,
    effective_field_mappings: mergedFields,
    static_values: Object.keys(mergedStatic).length > 0 ? mergedStatic : undefined,
    merge_log: [
      ...current.merge_log,
      {
        source: 'client_override',
        override_id: 'preview',
        fields_applied: proposedOverride.field_mappings.map(f => f.qboField),
        priority: 50,
      },
    ],
  };
}

/**
 * Get which fields are coming from which source
 *
 * @param mergedMapping - The merged mapping to analyze
 * @returns Field source breakdown
 */
export function analyzeFieldSources(mergedMapping: MergedMapping): Map<string, {
  value: FieldMapping;
  source: 'global_template' | 'client_override' | 'source_mapping';
  sourceId: string;
}> {
  const fieldSources = new Map<string, {
    value: FieldMapping;
    source: 'global_template' | 'client_override' | 'source_mapping';
    sourceId: string;
  }>();

  // Process in priority order (lowest to highest)
  for (const logEntry of mergedMapping.merge_log) {
    let sourceFields: FieldMapping[] = [];

    if (logEntry.source === 'global_template' && mergedMapping.global_template) {
      sourceFields = mergedMapping.global_template.field_mappings;
    } else if (logEntry.source === 'client_override' && mergedMapping.client_override) {
      sourceFields = mergedMapping.client_override.field_mappings;
    } else if (logEntry.source === 'source_mapping' && mergedMapping.source_mapping) {
      sourceFields = mergedMapping.source_mapping.field_mappings;
    }

    for (const field of sourceFields) {
      fieldSources.set(field.qboField, {
        value: field,
        source: logEntry.source,
        sourceId: logEntry.template_id || logEntry.override_id || logEntry.mapping_id || 'unknown',
      });
    }
  }

  return fieldSources;
}

/**
 * Check if a mapping has all required QBO fields
 */
export function validateRequiredFields(mergedMapping: MergedMapping): {
  valid: boolean;
  missingFields: string[];
} {
  const REQUIRED_FIELDS = [
    'CustomerRef.value',
    'Line[0].Amount',
    'Line[0].DetailType',
    'Line[0].SalesItemLineDetail.ItemRef.value',
  ];

  const mappedFields = new Set(mergedMapping.effective_field_mappings.map(f => f.qboField));
  const missingFields = REQUIRED_FIELDS.filter(f => !mappedFields.has(f));

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}
