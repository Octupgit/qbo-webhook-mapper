import { useState, useEffect } from 'react';
import { Card, Title, Text, Button, TextInput, Select, SelectItem, Badge } from '@tremor/react';
import { PlusIcon, TrashIcon, PlayIcon } from '@heroicons/react/24/outline';
import JsonViewer from '../common/JsonViewer';
import { FieldMapping, QBOField, Transformation, TransformTestResult } from '../../types';
import * as mappingsApi from '../../api/mappings';
import * as invoicesApi from '../../api/invoices';

interface QBOCustomer {
  id: string;
  name: string;
  email?: string;
}

interface QBOItem {
  id: string;
  name: string;
  type: string;
  unitPrice?: number;
}

interface MappingEditorProps {
  sourceId: string;
  mappingId?: string;
  samplePayload?: Record<string, unknown>;
  onSave: (data: { name: string; field_mappings: FieldMapping[] }) => Promise<void>;
  onCancel: () => void;
}

export default function MappingEditor({
  sourceId: _sourceId,
  mappingId,
  samplePayload,
  onSave,
  onCancel,
}: MappingEditorProps) {
  // Note: _sourceId is used by the parent component for context, but not directly in this component
  const [name, setName] = useState('');
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [qboFields, setQboFields] = useState<QBOField[]>([]);
  const [transformations, setTransformations] = useState<Transformation[]>([]);
  const [jsonPaths, setJsonPaths] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<TransformTestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [qboCustomers, setQboCustomers] = useState<QBOCustomer[]>([]);
  const [qboItems, setQboItems] = useState<QBOItem[]>([]);

  useEffect(() => {
    loadMetadata();
    loadQboData();
  }, []);

  useEffect(() => {
    if (mappingId) {
      loadMapping();
    }
  }, [mappingId]);

  useEffect(() => {
    if (samplePayload) {
      extractPaths();
    }
  }, [samplePayload]);

  const loadMetadata = async () => {
    try {
      const [fields, transforms] = await Promise.all([
        mappingsApi.getQBOFields(),
        mappingsApi.getTransformations(),
      ]);
      setQboFields(fields);
      setTransformations(transforms);
    } catch (err) {
      console.error('Failed to load metadata:', err);
    }
  };

  const loadQboData = async () => {
    try {
      const [customers, items] = await Promise.all([
        invoicesApi.getQBOCustomers(),
        invoicesApi.getQBOItems(),
      ]);
      setQboCustomers(customers);
      setQboItems(items);
    } catch (err) {
      console.error('Failed to load QBO data:', err);
    }
  };

  // Check if the field is CustomerRef.value or ItemRef.value
  const isCustomerRefField = (qboField: string) => qboField === 'CustomerRef.value';
  const isItemRefField = (qboField: string) => qboField.includes('ItemRef.value');

  const loadMapping = async () => {
    if (!mappingId) return;
    try {
      const mapping = await mappingsApi.getMapping(mappingId);
      setName(mapping.name);
      setFieldMappings(mapping.field_mappings);
    } catch (err) {
      console.error('Failed to load mapping:', err);
    }
  };

  const extractPaths = async () => {
    if (!samplePayload) return;
    try {
      const paths = await mappingsApi.extractJsonPaths(samplePayload);
      setJsonPaths(paths);
    } catch (err) {
      console.error('Failed to extract paths:', err);
    }
  };

  const addMapping = () => {
    setFieldMappings([
      ...fieldMappings,
      {
        qboField: '',
        sourceField: '',
        transformation: 'none',
        isRequired: false,
      },
    ]);
  };

  const updateMapping = (index: number, updates: Partial<FieldMapping>) => {
    setFieldMappings(
      fieldMappings.map((m, i) => (i === index ? { ...m, ...updates } : m))
    );
  };

  const removeMapping = (index: number) => {
    setFieldMappings(fieldMappings.filter((_, i) => i !== index));
  };

  const handlePathClick = (path: string) => {
    // Find first empty source field and set it
    const emptyIndex = fieldMappings.findIndex((m) => !m.sourceField && !m.staticValue);
    if (emptyIndex >= 0) {
      updateMapping(emptyIndex, { sourceField: path });
    }
  };

  const handleTest = async () => {
    if (!samplePayload || !mappingId) return;
    setTesting(true);
    try {
      const result = await mappingsApi.testMapping(mappingId, samplePayload);
      setTestResult(result);
    } catch (err) {
      console.error('Test failed:', err);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Name is required');
      return;
    }
    if (fieldMappings.length === 0) {
      alert('At least one field mapping is required');
      return;
    }

    setLoading(true);
    try {
      await onSave({ name, field_mappings: fieldMappings });
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save mapping');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Left Panel: Source JSON */}
      <div className="col-span-4">
        <Card>
          <Title>Source Payload</Title>
          <Text className="mt-1 text-gray-500">
            Click on a field to use its path
          </Text>
          <div className="mt-4">
            {samplePayload ? (
              <JsonViewer
                data={samplePayload}
                onPathClick={handlePathClick}
                highlightedPaths={fieldMappings
                  .map((m) => m.sourceField)
                  .filter(Boolean) as string[]}
              />
            ) : (
              <div className="text-center py-8 text-gray-500">
                No sample payload available.
                <br />
                Send a webhook first.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Center Panel: Mapping Configuration */}
      <div className="col-span-4">
        <Card>
          <Title>Mapping Configuration</Title>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700">
              Mapping Name
            </label>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Shopify Order to Invoice"
              className="mt-1"
            />
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <Text className="font-medium">Field Mappings</Text>
              <Button
                size="xs"
                variant="secondary"
                icon={PlusIcon}
                onClick={addMapping}
              >
                Add
              </Button>
            </div>

            <div className="space-y-3">
              {fieldMappings.map((mapping, index) => (
                <div
                  key={index}
                  className="p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Text className="text-xs text-gray-500">Mapping {index + 1}</Text>
                    <button
                      onClick={() => removeMapping(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>

                  {/* QBO Field */}
                  <Select
                    value={mapping.qboField}
                    onValueChange={(v) => updateMapping(index, { qboField: v })}
                    placeholder="Select QBO Field"
                  >
                    {qboFields.map((f) => (
                      <SelectItem key={f.path} value={f.path}>
                        {f.label} {f.required && '*'}
                      </SelectItem>
                    ))}
                  </Select>

                  {/* Source Field */}
                  <Select
                    value={mapping.sourceField || ''}
                    onValueChange={(v) => updateMapping(index, { sourceField: v, staticValue: undefined })}
                    placeholder="Select Source Field"
                    className="mt-2"
                  >
                    {jsonPaths.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </Select>

                  {/* QBO Customer/Item Picker or Static Value */}
                  {isCustomerRefField(mapping.qboField) && qboCustomers.length > 0 ? (
                    <div className="mt-2">
                      <Text className="text-xs text-gray-500 mb-1">Select QBO Customer:</Text>
                      <Select
                        value={mapping.staticValue || ''}
                        onValueChange={(v) =>
                          updateMapping(index, {
                            staticValue: v || undefined,
                            sourceField: v ? undefined : mapping.sourceField,
                          })
                        }
                        placeholder="Select a QBO Customer"
                      >
                        {qboCustomers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <span className="flex items-center gap-2">
                              <Badge size="xs" color="blue">{c.id}</Badge>
                              {c.name}
                            </span>
                          </SelectItem>
                        ))}
                      </Select>
                    </div>
                  ) : isItemRefField(mapping.qboField) && qboItems.length > 0 ? (
                    <div className="mt-2">
                      <Text className="text-xs text-gray-500 mb-1">Select QBO Item:</Text>
                      <Select
                        value={mapping.staticValue || ''}
                        onValueChange={(v) =>
                          updateMapping(index, {
                            staticValue: v || undefined,
                            sourceField: v ? undefined : mapping.sourceField,
                          })
                        }
                        placeholder="Select a QBO Item"
                      >
                        {qboItems.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            <span className="flex items-center gap-2">
                              <Badge size="xs" color="green">{i.id}</Badge>
                              {i.name}
                              {i.unitPrice ? ` ($${i.unitPrice})` : ''}
                            </span>
                          </SelectItem>
                        ))}
                      </Select>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <Text className="text-xs text-gray-500">or static:</Text>
                      <TextInput
                        value={mapping.staticValue || ''}
                        onChange={(e) =>
                          updateMapping(index, {
                            staticValue: e.target.value || undefined,
                            sourceField: e.target.value ? undefined : mapping.sourceField,
                          })
                        }
                        placeholder="Static value"
                        className="flex-1"
                      />
                    </div>
                  )}

                  {/* Transformation */}
                  <Select
                    value={mapping.transformation || 'none'}
                    onValueChange={(v) => updateMapping(index, { transformation: v })}
                    className="mt-2"
                  >
                    {transformations.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
              ))}

              {fieldMappings.length === 0 && (
                <div className="text-center py-6 text-gray-500 border border-dashed border-gray-300 rounded-lg">
                  No mappings yet. Click "Add" to create one.
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <Button onClick={handleSave} loading={loading}>
              Save Mapping
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </Card>
      </div>

      {/* Right Panel: Preview */}
      <div className="col-span-4">
        <Card>
          <div className="flex items-center justify-between">
            <Title>Preview</Title>
            {mappingId && samplePayload && (
              <Button
                size="xs"
                variant="secondary"
                icon={PlayIcon}
                onClick={handleTest}
                loading={testing}
              >
                Test
              </Button>
            )}
          </div>

          {testResult ? (
            <div className="mt-4">
              {testResult.success ? (
                <div className="p-2 bg-green-50 text-green-700 rounded mb-3 text-sm">
                  Transformation successful
                </div>
              ) : (
                <div className="p-2 bg-red-50 text-red-700 rounded mb-3 text-sm">
                  {testResult.validationErrors.join(', ')}
                </div>
              )}

              {testResult.warnings.length > 0 && (
                <div className="p-2 bg-yellow-50 text-yellow-700 rounded mb-3 text-sm">
                  {testResult.warnings.join(', ')}
                </div>
              )}

              <Text className="text-sm font-medium mb-2">Transformed Invoice:</Text>
              <JsonViewer data={testResult.transformedInvoice || {}} expandLevel={3} />
            </div>
          ) : (
            <div className="mt-4 text-center py-8 text-gray-500">
              Save the mapping and click "Test" to preview the transformed invoice.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
