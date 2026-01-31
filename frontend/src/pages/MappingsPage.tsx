import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Card,
  Title,
  Text,
  Button,
  Select,
  SelectItem,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Badge,
} from '@tremor/react';
import { PlusIcon, PencilIcon, TrashIcon, CheckIcon } from '@heroicons/react/24/outline';
import MappingEditor from '../components/mappings/MappingEditor';
import * as sourcesApi from '../api/sources';
import * as mappingsApi from '../api/mappings';
import { WebhookSource, MappingConfiguration, FieldMapping } from '../types';

export default function MappingsPage() {
  const [searchParams] = useSearchParams();
  const [sources, setSources] = useState<WebhookSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [mappings, setMappings] = useState<MappingConfiguration[]>([]);
  const [samplePayload, setSamplePayload] = useState<Record<string, unknown> | undefined>();
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingMappingId, setEditingMappingId] = useState<string | undefined>();

  useEffect(() => {
    loadSources();
  }, []);

  useEffect(() => {
    const sourceIdParam = searchParams.get('sourceId');
    if (sourceIdParam && sources.length > 0) {
      setSelectedSourceId(sourceIdParam);
    }
  }, [searchParams, sources]);

  useEffect(() => {
    if (selectedSourceId) {
      loadMappings();
      loadSamplePayload();
    }
  }, [selectedSourceId]);

  const loadSources = async () => {
    try {
      const data = await sourcesApi.getSources();
      setSources(data);
      if (data.length > 0 && !selectedSourceId) {
        setSelectedSourceId(data[0].source_id);
      }
    } catch (err) {
      console.error('Failed to load sources:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMappings = async () => {
    try {
      const data = await mappingsApi.getMappings(selectedSourceId);
      setMappings(data);
    } catch (err) {
      console.error('Failed to load mappings:', err);
    }
  };

  const loadSamplePayload = async () => {
    try {
      const sample = await sourcesApi.getSamplePayload(selectedSourceId);
      setSamplePayload(sample?.payload);
    } catch (err) {
      console.error('Failed to load sample:', err);
      setSamplePayload(undefined);
    }
  };

  const handleCreateNew = () => {
    setEditingMappingId(undefined);
    setShowEditor(true);
  };

  const handleEdit = (mappingId: string) => {
    setEditingMappingId(mappingId);
    setShowEditor(true);
  };

  const handleSave = async (data: { name: string; field_mappings: FieldMapping[] }) => {
    if (editingMappingId) {
      await mappingsApi.updateMapping(editingMappingId, data);
    } else {
      await mappingsApi.createMapping(selectedSourceId, data);
    }
    setShowEditor(false);
    loadMappings();
  };

  const handleActivate = async (mappingId: string) => {
    try {
      await mappingsApi.activateMapping(mappingId);
      loadMappings();
    } catch (err) {
      console.error('Failed to activate mapping:', err);
      alert('Failed to activate mapping');
    }
  };

  const handleDelete = async (mappingId: string) => {
    if (!confirm('Are you sure you want to delete this mapping?')) {
      return;
    }

    try {
      await mappingsApi.deleteMapping(mappingId);
      loadMappings();
    } catch (err) {
      console.error('Failed to delete mapping:', err);
      alert('Failed to delete mapping');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (showEditor) {
    return (
      <div>
        <div className="mb-6">
          <Title>{editingMappingId ? 'Edit Mapping' : 'Create Mapping'}</Title>
          <Text className="mt-1">
            Configure how webhook fields map to QuickBooks Invoice fields
          </Text>
        </div>

        <MappingEditor
          sourceId={selectedSourceId}
          mappingId={editingMappingId}
          samplePayload={samplePayload}
          onSave={handleSave}
          onCancel={() => setShowEditor(false)}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Title>Field Mappings</Title>
          <Text className="mt-1">Configure how webhook data maps to QBO invoices</Text>
        </div>
      </div>

      {/* Source Selector */}
      <Card className="mt-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <Text className="text-sm font-medium mb-2">Select Source</Text>
            <Select
              value={selectedSourceId}
              onValueChange={setSelectedSourceId}
              placeholder="Select a webhook source"
            >
              {sources.map((source) => (
                <SelectItem key={source.source_id} value={source.source_id}>
                  {source.name}
                </SelectItem>
              ))}
            </Select>
          </div>
          <Button icon={PlusIcon} onClick={handleCreateNew} disabled={!selectedSourceId}>
            New Mapping
          </Button>
        </div>
      </Card>

      {/* Mappings List */}
      {selectedSourceId && (
        <Card className="mt-6">
          <Title>Mappings for Selected Source</Title>

          {!samplePayload && (
            <div className="mt-4 p-4 bg-yellow-50 text-yellow-800 rounded-lg text-sm">
              No webhook payloads received yet. Send a test webhook to this source first.
            </div>
          )}

          {mappings.length > 0 ? (
            <Table className="mt-4">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Fields</TableHeaderCell>
                  <TableHeaderCell>Version</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Created</TableHeaderCell>
                  <TableHeaderCell>Actions</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mappings.map((mapping) => (
                  <TableRow key={mapping.mapping_id}>
                    <TableCell>
                      <Text className="font-medium">{mapping.name}</Text>
                      {mapping.description && (
                        <Text className="text-xs text-gray-500">
                          {mapping.description}
                        </Text>
                      )}
                    </TableCell>
                    <TableCell>
                      <Text>{mapping.field_mappings.length} fields</Text>
                    </TableCell>
                    <TableCell>
                      <Text>v{mapping.version}</Text>
                    </TableCell>
                    <TableCell>
                      <Badge color={mapping.is_active ? 'green' : 'gray'}>
                        {mapping.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Text className="text-sm">
                        {new Date(mapping.created_at).toLocaleDateString()}
                      </Text>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(mapping.mapping_id)}
                          className="text-gray-400 hover:text-gray-600"
                          title="Edit"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        {!mapping.is_active && (
                          <button
                            onClick={() => handleActivate(mapping.mapping_id)}
                            className="text-green-400 hover:text-green-600"
                            title="Activate"
                          >
                            <CheckIcon className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(mapping.mapping_id)}
                          className="text-red-400 hover:text-red-600"
                          title="Delete"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="mt-4 text-center py-12">
              <Text className="text-gray-500">No mappings for this source yet.</Text>
              <Button className="mt-4" icon={PlusIcon} onClick={handleCreateNew}>
                Create Your First Mapping
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
