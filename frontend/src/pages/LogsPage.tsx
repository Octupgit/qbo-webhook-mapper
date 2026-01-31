import { useState, useEffect } from 'react';
import {
  Card,
  Title,
  Text,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Badge,
  Select,
  SelectItem,
  Dialog,
  DialogPanel,
  Button,
} from '@tremor/react';
import { EyeIcon, ArrowPathIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import JsonViewer from '../components/common/JsonViewer';
import * as sourcesApi from '../api/sources';
import * as invoicesApi from '../api/invoices';
import { WebhookSource, SyncLog } from '../types';

export default function LogsPage() {
  const [sources, setSources] = useState<WebhookSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<
    (SyncLog & { request_payload?: Record<string, unknown>; response_payload?: Record<string, unknown> }) | null
  >(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Record<string, unknown> | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  useEffect(() => {
    loadSources();
    loadLogs();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [selectedSourceId]);

  const loadSources = async () => {
    try {
      const data = await sourcesApi.getSources();
      setSources(data);
    } catch (err) {
      console.error('Failed to load sources:', err);
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await invoicesApi.getSyncLogs(100, selectedSourceId || undefined);
      setLogs(data);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (logId: string) => {
    try {
      const log = await invoicesApi.getSyncLog(logId);
      setSelectedLog(log);
      setShowDetailModal(true);
    } catch (err) {
      console.error('Failed to load log details:', err);
      alert('Failed to load log details');
    }
  };

  const handleViewInvoice = async (invoiceId: string) => {
    setLoadingInvoice(true);
    try {
      const invoice = await invoicesApi.getInvoice(invoiceId);
      setSelectedInvoice(invoice);
      setShowInvoiceModal(true);
    } catch (err) {
      console.error('Failed to load invoice:', err);
      alert('Failed to load invoice details');
    } finally {
      setLoadingInvoice(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'green';
      case 'failed':
        return 'red';
      case 'pending':
        return 'yellow';
      case 'retrying':
        return 'orange';
      default:
        return 'gray';
    }
  };

  const getSourceName = (sourceId: string) => {
    const source = sources.find((s) => s.source_id === sourceId);
    return source?.name || sourceId.slice(0, 8) + '...';
  };

  if (loading && logs.length === 0) {
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
          <Title>Sync Logs</Title>
          <Text className="mt-1">View history of invoice syncs to QuickBooks</Text>
        </div>
        <Button icon={ArrowPathIcon} variant="secondary" onClick={loadLogs}>
          Refresh
        </Button>
      </div>

      {/* Filter */}
      <Card className="mt-6">
        <div className="max-w-xs">
          <Text className="text-sm font-medium mb-2">Filter by Source</Text>
          <Select
            value={selectedSourceId}
            onValueChange={setSelectedSourceId}
            placeholder="All Sources"
          >
            <SelectItem value="">All Sources</SelectItem>
            {sources.map((source) => (
              <SelectItem key={source.source_id} value={source.source_id}>
                {source.name}
              </SelectItem>
            ))}
          </Select>
        </div>
      </Card>

      {/* Logs Table */}
      <Card className="mt-6">
        {logs.length > 0 ? (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Time</TableHeaderCell>
                <TableHeaderCell>Source</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Invoice #</TableHeaderCell>
                <TableHeaderCell>QBO Invoice ID</TableHeaderCell>
                <TableHeaderCell>Error</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.log_id}>
                  <TableCell>
                    <Text className="text-sm">
                      {new Date(log.created_at).toLocaleString()}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text>{getSourceName(log.source_id)}</Text>
                  </TableCell>
                  <TableCell>
                    <Badge color={getStatusColor(log.status)}>{log.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Text>{log.qbo_doc_number || '-'}</Text>
                  </TableCell>
                  <TableCell>
                    <Text className="font-mono text-xs">
                      {log.qbo_invoice_id || '-'}
                    </Text>
                  </TableCell>
                  <TableCell>
                    {log.error_message ? (
                      <Text className="text-red-600 text-sm truncate max-w-xs">
                        {log.error_message}
                      </Text>
                    ) : (
                      <Text className="text-gray-400">-</Text>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewDetails(log.log_id)}
                        className="text-blue-500 hover:text-blue-700"
                        title="View Log Details"
                      >
                        <EyeIcon className="w-4 h-4" />
                      </button>
                      {log.qbo_invoice_id && (
                        <button
                          onClick={() => handleViewInvoice(log.qbo_invoice_id!)}
                          className="text-green-500 hover:text-green-700"
                          title="View Invoice"
                          disabled={loadingInvoice}
                        >
                          <DocumentTextIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-12">
            <Text className="text-gray-500">No sync logs yet.</Text>
            <Text className="text-sm text-gray-400 mt-1">
              Logs will appear here when you sync payloads to QuickBooks.
            </Text>
          </div>
        )}
      </Card>

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onClose={() => setShowDetailModal(false)}>
        <DialogPanel className="max-w-4xl">
          <Title>Sync Log Details</Title>

          {selectedLog && (
            <div className="mt-4 space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Text className="text-sm text-gray-500">Status</Text>
                  <Badge color={getStatusColor(selectedLog.status)} className="mt-1">
                    {selectedLog.status}
                  </Badge>
                </div>
                <div>
                  <Text className="text-sm text-gray-500">Created</Text>
                  <Text className="mt-1">
                    {new Date(selectedLog.created_at).toLocaleString()}
                  </Text>
                </div>
                <div>
                  <Text className="text-sm text-gray-500">QBO Invoice ID</Text>
                  <Text className="mt-1 font-mono">
                    {selectedLog.qbo_invoice_id || '-'}
                  </Text>
                </div>
                <div>
                  <Text className="text-sm text-gray-500">Doc Number</Text>
                  <Text className="mt-1">{selectedLog.qbo_doc_number || '-'}</Text>
                </div>
              </div>

              {/* Error */}
              {selectedLog.error_message && (
                <div>
                  <Text className="text-sm text-gray-500 mb-2">Error Message</Text>
                  <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                    {selectedLog.error_message}
                  </div>
                </div>
              )}

              {/* Request Payload */}
              {selectedLog.request_payload && (
                <div>
                  <Text className="text-sm text-gray-500 mb-2">
                    Request Payload (Transformed Invoice)
                  </Text>
                  <JsonViewer data={selectedLog.request_payload} expandLevel={2} />
                </div>
              )}

              {/* Response Payload */}
              {selectedLog.response_payload && (
                <div>
                  <Text className="text-sm text-gray-500 mb-2">QBO API Response</Text>
                  <JsonViewer data={selectedLog.response_payload} expandLevel={2} />
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Button onClick={() => setShowDetailModal(false)}>Close</Button>
          </div>
        </DialogPanel>
      </Dialog>

      {/* Invoice Modal */}
      <Dialog open={showInvoiceModal} onClose={() => setShowInvoiceModal(false)}>
        <DialogPanel className="max-w-4xl">
          <Title>QuickBooks Invoice</Title>

          {selectedInvoice && (
            <div className="mt-4 space-y-6">
              {/* Invoice Header */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <Text className="text-sm text-gray-500">Invoice Number</Text>
                  <Text className="mt-1 font-medium text-lg">
                    {(selectedInvoice as { DocNumber?: string }).DocNumber || '-'}
                  </Text>
                </div>
                <div>
                  <Text className="text-sm text-gray-500">Invoice ID</Text>
                  <Text className="mt-1 font-mono">
                    {(selectedInvoice as { Id?: string }).Id || '-'}
                  </Text>
                </div>
                <div>
                  <Text className="text-sm text-gray-500">Total Amount</Text>
                  <Text className="mt-1 font-medium text-lg text-green-600">
                    ${(selectedInvoice as { TotalAmt?: number }).TotalAmt?.toFixed(2) || '0.00'}
                  </Text>
                </div>
              </div>

              {/* Customer Info */}
              {(selectedInvoice as { CustomerRef?: { name?: string } }).CustomerRef && (
                <div>
                  <Text className="text-sm text-gray-500 mb-2">Customer</Text>
                  <Text className="font-medium">
                    {(selectedInvoice as { CustomerRef?: { name?: string } }).CustomerRef?.name || 'Unknown'}
                  </Text>
                </div>
              )}

              {/* Line Items */}
              {(selectedInvoice as { Line?: Array<{ Description?: string; Amount?: number }> }).Line && (
                <div>
                  <Text className="text-sm text-gray-500 mb-2">Line Items</Text>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left">Description</th>
                          <th className="px-4 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {((selectedInvoice as { Line?: Array<{ Description?: string; Amount?: number; DetailType?: string }> }).Line || [])
                          .filter(line => line.DetailType !== 'SubTotalLineDetail')
                          .map((line, idx) => (
                            <tr key={idx} className="border-t">
                              <td className="px-4 py-2">{line.Description || '-'}</td>
                              <td className="px-4 py-2 text-right">${line.Amount?.toFixed(2) || '0.00'}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Full Invoice JSON */}
              <div>
                <Text className="text-sm text-gray-500 mb-2">Full Invoice Data</Text>
                <JsonViewer data={selectedInvoice} expandLevel={2} />
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Button onClick={() => setShowInvoiceModal(false)}>Close</Button>
          </div>
        </DialogPanel>
      </Dialog>
    </div>
  );
}
