import React, { useState, useEffect } from 'react';
import {
  Card,
  Title,
  Text,
  Button,
  TextInput,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Badge,
  Dialog,
  DialogPanel,
} from '@tremor/react';
import {
  PlusIcon,
  ClipboardDocumentIcon,
  ArrowPathIcon,
  TrashIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import * as sourcesApi from '../api/sources';
import { WebhookSource } from '../types';

export default function SourcesPage() {
  const [sources, setSources] = useState<WebhookSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [newApiKey, setNewApiKey] = useState('');
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceDescription, setNewSourceDescription] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    try {
      const data = await sourcesApi.getSources();
      setSources(data);
    } catch (err) {
      console.error('Failed to load sources:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newSourceName.trim()) {
      alert('Name is required');
      return;
    }

    setCreating(true);
    try {
      const source = await sourcesApi.createSource(newSourceName, newSourceDescription);
      setNewApiKey(source.api_key);
      setShowCreateModal(false);
      setShowApiKeyModal(true);
      setNewSourceName('');
      setNewSourceDescription('');
      loadSources();
    } catch (err) {
      console.error('Failed to create source:', err);
      alert('Failed to create source');
    } finally {
      setCreating(false);
    }
  };

  const handleRegenerateKey = async (sourceId: string) => {
    if (!confirm('Are you sure? The old API key will stop working immediately.')) {
      return;
    }

    try {
      const newKey = await sourcesApi.regenerateApiKey(sourceId);
      setNewApiKey(newKey);
      setShowApiKeyModal(true);
    } catch (err) {
      console.error('Failed to regenerate key:', err);
      alert('Failed to regenerate API key');
    }
  };

  const handleDelete = async (sourceId: string) => {
    if (!confirm('Are you sure you want to deactivate this source?')) {
      return;
    }

    try {
      await sourcesApi.deleteSource(sourceId);
      loadSources();
    } catch (err) {
      console.error('Failed to delete source:', err);
      alert('Failed to delete source');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  const getWebhookUrl = (sourceId: string) => {
    return `${window.location.origin}/api/webhooks/${sourceId}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Title>Webhook Sources</Title>
          <Text className="mt-1">Manage your webhook endpoints</Text>
        </div>
        <Button icon={PlusIcon} onClick={() => setShowCreateModal(true)}>
          Create Source
        </Button>
      </div>

      <Card className="mt-6">
        {sources.length > 0 ? (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Webhook URL</TableHeaderCell>
                <TableHeaderCell>API Key</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Created</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.source_id}>
                  <TableCell>
                    <Text className="font-medium">{source.name}</Text>
                    {source.description && (
                      <Text className="text-xs text-gray-500">
                        {source.description}
                      </Text>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded max-w-xs truncate">
                        {getWebhookUrl(source.source_id)}
                      </code>
                      <button
                        onClick={() => copyToClipboard(getWebhookUrl(source.source_id))}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <ClipboardDocumentIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {source.api_key}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge color={source.is_active ? 'green' : 'gray'}>
                      {source.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Text className="text-sm">
                      {new Date(source.created_at).toLocaleDateString()}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRegenerateKey(source.source_id)}
                        className="text-gray-400 hover:text-gray-600"
                        title="Regenerate API Key"
                      >
                        <ArrowPathIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(source.source_id)}
                        className="text-red-400 hover:text-red-600"
                        title="Deactivate"
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
          <div className="text-center py-12">
            <Text className="text-gray-500">No webhook sources yet.</Text>
            <Button
              className="mt-4"
              icon={PlusIcon}
              onClick={() => setShowCreateModal(true)}
            >
              Create Your First Source
            </Button>
          </div>
        )}
      </Card>

      {/* Create Source Modal */}
      <Dialog open={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <DialogPanel>
          <Title>Create Webhook Source</Title>
          <Text className="mt-2">
            Create a new webhook endpoint for receiving data.
          </Text>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700">
              Name *
            </label>
            <TextInput
              value={newSourceName}
              onChange={(e) => setNewSourceName(e.target.value)}
              placeholder="e.g., Shopify Orders"
              className="mt-1"
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <TextInput
              value={newSourceDescription}
              onChange={(e) => setNewSourceDescription(e.target.value)}
              placeholder="Optional description"
              className="mt-1"
            />
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} loading={creating}>
              Create
            </Button>
          </div>
        </DialogPanel>
      </Dialog>

      {/* API Key Modal */}
      <Dialog open={showApiKeyModal} onClose={() => setShowApiKeyModal(false)}>
        <DialogPanel>
          <Title>API Key</Title>
          <Text className="mt-2 text-amber-600">
            Save this API key now. It will not be shown again.
          </Text>

          <div className="mt-4 p-4 bg-gray-100 rounded-lg">
            <code className="text-sm break-all">{newApiKey}</code>
          </div>

          <div className="mt-4">
            <Button
              icon={ClipboardDocumentIcon}
              onClick={() => copyToClipboard(newApiKey)}
            >
              Copy to Clipboard
            </Button>
          </div>

          <div className="mt-6 flex justify-end">
            <Button onClick={() => setShowApiKeyModal(false)}>Done</Button>
          </div>
        </DialogPanel>
      </Dialog>
    </div>
  );
}
