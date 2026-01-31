import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Title,
  Text,
  Button,
  Badge,
  Divider,
  Callout,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  TextInput,
} from '@tremor/react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ArrowRightOnRectangleIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  ClipboardDocumentIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import * as oauthApi from '../api/oauth';
import * as invoicesApi from '../api/invoices';
import { OAuthStatus } from '../types';

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

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // QBO Data
  const [customers, setCustomers] = useState<QBOCustomer[]>([]);
  const [items, setItems] = useState<QBOItem[]>([]);
  const [loadingQboData, setLoadingQboData] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');

  useEffect(() => {
    loadStatus();

    // Check for OAuth callback result
    const oauthResult = searchParams.get('oauth');
    if (oauthResult === 'success') {
      setMessage({ type: 'success', text: 'Successfully connected to QuickBooks! Your account is now linked and ready to sync invoices.' });
      // Clear URL params after 5 seconds
      setTimeout(() => {
        navigate('/settings', { replace: true });
      }, 5000);
    } else if (oauthResult === 'error') {
      const errorMessage = searchParams.get('message') || 'Failed to connect';
      setMessage({ type: 'error', text: errorMessage });
      // Clear URL params after 10 seconds
      setTimeout(() => {
        navigate('/settings', { replace: true });
      }, 10000);
    }
  }, [searchParams, navigate]);

  const loadStatus = async () => {
    try {
      const status = await oauthApi.getConnectionStatus();
      setOauthStatus(status);
      // Load QBO data if connected
      if (status.connected) {
        loadQboData();
      }
    } catch (err) {
      console.error('Failed to load OAuth status:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadQboData = async () => {
    setLoadingQboData(true);
    try {
      const [customersData, itemsData] = await Promise.all([
        invoicesApi.getQBOCustomers(),
        invoicesApi.getQBOItems(),
      ]);
      setCustomers(customersData);
      setItems(itemsData);
    } catch (err) {
      console.error('Failed to load QBO data:', err);
    } finally {
      setLoadingQboData(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const exportCustomersToCSV = () => {
    const headers = ['Customer ID', 'Name', 'Email'];
    const rows = customers.map(c => [c.id, c.name, c.email || '']);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    downloadCSV(csvContent, 'qbo_customers.csv');
  };

  const exportItemsToCSV = () => {
    const headers = ['Item ID', 'Name', 'Type', 'Unit Price'];
    const rows = items.map(i => [i.id, i.name, i.type, i.unitPrice?.toString() || '']);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    downloadCSV(csvContent, 'qbo_items.csv');
  };

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleConnect = () => {
    window.location.href = oauthApi.getAuthorizationUrl();
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect from QuickBooks?')) {
      return;
    }

    try {
      await oauthApi.disconnect();
      setOauthStatus({ connected: false });
      setMessage({ type: 'success', text: 'Disconnected from QuickBooks' });
    } catch (err) {
      console.error('Failed to disconnect:', err);
      setMessage({ type: 'error', text: 'Failed to disconnect' });
    }
  };

  const handleRefresh = async () => {
    try {
      await oauthApi.refreshToken();
      loadStatus();
      setMessage({ type: 'success', text: 'Token refreshed' });
    } catch (err) {
      console.error('Failed to refresh token:', err);
      setMessage({ type: 'error', text: 'Failed to refresh token' });
    }
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
      <Title>Settings</Title>
      <Text className="mt-1">Manage your QuickBooks connection and preferences</Text>

      {/* Status Message */}
      {message && (
        <div className="relative">
          <Callout
            className="mt-4"
            title={message.type === 'success' ? 'Connection Successful!' : 'Connection Error'}
            icon={message.type === 'success' ? CheckCircleIcon : ExclamationTriangleIcon}
            color={message.type === 'success' ? 'green' : 'red'}
          >
            {message.text}
            {message.type === 'success' && (
              <div className="mt-2 text-sm">
                You can now sync webhook payloads to QuickBooks invoices.
              </div>
            )}
          </Callout>
          <button
            onClick={() => {
              setMessage(null);
              navigate('/settings', { replace: true });
            }}
            className="absolute top-6 right-4 text-gray-400 hover:text-gray-600"
            aria-label="Dismiss"
          >
            <XCircleIcon className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* QuickBooks Connection */}
      <Card className="mt-6">
        <Title>QuickBooks Online Connection</Title>
        <Text className="mt-1">
          Connect your QuickBooks Online account to sync invoices
        </Text>

        <Divider className="my-4" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {oauthStatus.connected ? (
              <>
                <CheckCircleIcon className="w-10 h-10 text-green-500" />
                <div>
                  <Text className="font-medium">Connected</Text>
                  {oauthStatus.company && (
                    <Text className="text-sm text-gray-500">
                      {oauthStatus.company.name}
                    </Text>
                  )}
                  {oauthStatus.realmId && (
                    <Text className="text-xs text-gray-400">
                      Company ID: {oauthStatus.realmId}
                    </Text>
                  )}
                </div>
              </>
            ) : (
              <>
                <XCircleIcon className="w-10 h-10 text-gray-400" />
                <div>
                  <Text className="font-medium text-gray-600">Not Connected</Text>
                  <Text className="text-sm text-gray-500">
                    Connect your QuickBooks account to start syncing
                  </Text>
                </div>
              </>
            )}
          </div>

          <div className="flex gap-3">
            {oauthStatus.connected ? (
              <>
                <Button
                  icon={ArrowPathIcon}
                  variant="secondary"
                  onClick={handleRefresh}
                >
                  Refresh Token
                </Button>
                <Button
                  icon={ArrowRightOnRectangleIcon}
                  variant="secondary"
                  onClick={handleDisconnect}
                  className="text-red-600 border-red-300 hover:bg-red-50"
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <Button onClick={handleConnect}>
                Connect to QuickBooks
              </Button>
            )}
          </div>
        </div>

        {oauthStatus.connected && oauthStatus.expiresAt && (
          <div className="mt-4 text-sm text-gray-500">
            Token expires: {new Date(oauthStatus.expiresAt).toLocaleString()}
          </div>
        )}
      </Card>

      {/* Environment Info */}
      <Card className="mt-6">
        <Title>Environment</Title>
        <div className="mt-4 space-y-2">
          <div className="flex justify-between">
            <Text>QBO Environment</Text>
            <Badge color={import.meta.env.MODE === 'production' ? 'green' : 'yellow'}>
              Sandbox
            </Badge>
          </div>
          <div className="flex justify-between">
            <Text>API Endpoint</Text>
            <Text className="font-mono text-sm">{window.location.origin}/api</Text>
          </div>
        </div>
      </Card>

      {/* QBO Customers */}
      {oauthStatus.connected && (
        <Card className="mt-6">
          <div className="flex items-center justify-between">
            <div>
              <Title>QBO Customers ({customers.length})</Title>
              <Text className="mt-1">
                Use these Customer IDs in your webhook payloads for the CustomerRef.value field
              </Text>
            </div>
            <div className="flex gap-2">
              <Button
                icon={ArrowDownTrayIcon}
                variant="secondary"
                size="sm"
                onClick={exportCustomersToCSV}
                disabled={customers.length === 0}
              >
                Export CSV
              </Button>
              <Button
                icon={ArrowPathIcon}
                variant="secondary"
                size="sm"
                onClick={loadQboData}
                loading={loadingQboData}
              >
                Refresh
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <TextInput
              icon={MagnifyingGlassIcon}
              placeholder="Search customers..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
            />
          </div>

          {loadingQboData ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="mt-4 max-h-64 overflow-y-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell className="w-24">Customer ID</TableHeaderCell>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Email</TableHeaderCell>
                    <TableHeaderCell className="w-16">Copy</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {customers
                    .filter(c =>
                      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                      c.id.includes(customerSearch)
                    )
                    .map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <code className="bg-blue-600 text-white px-3 py-1.5 rounded font-mono text-base font-bold">
                            {customer.id}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Text className="font-medium">{customer.name}</Text>
                        </TableCell>
                        <TableCell>
                          <Text className="text-sm text-gray-500">{customer.email || '-'}</Text>
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => copyToClipboard(customer.id)}
                            className="text-gray-400 hover:text-blue-600"
                            title="Copy Customer ID"
                          >
                            <ClipboardDocumentIcon className="w-4 h-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
              {customers.length === 0 && (
                <Text className="text-center py-4 text-gray-500">No customers found</Text>
              )}
            </div>
          )}
        </Card>
      )}

      {/* QBO Items */}
      {oauthStatus.connected && (
        <Card className="mt-6">
          <div className="flex items-center justify-between">
            <div>
              <Title>QBO Items / Products ({items.length})</Title>
              <Text className="mt-1">
                Use these Item IDs in your webhook payloads for the Line[].SalesItemLineDetail.ItemRef.value field
              </Text>
            </div>
            <Button
              icon={ArrowDownTrayIcon}
              variant="secondary"
              size="sm"
              onClick={exportItemsToCSV}
              disabled={items.length === 0}
            >
              Export CSV
            </Button>
          </div>

          <div className="mt-4">
            <TextInput
              icon={MagnifyingGlassIcon}
              placeholder="Search items..."
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
            />
          </div>

          {loadingQboData ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="mt-4 max-h-64 overflow-y-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell className="w-24">Item ID</TableHeaderCell>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Type</TableHeaderCell>
                    <TableHeaderCell>Unit Price</TableHeaderCell>
                    <TableHeaderCell className="w-16">Copy</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items
                    .filter(i =>
                      i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
                      i.id.includes(itemSearch)
                    )
                    .map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <code className="bg-green-600 text-white px-3 py-1.5 rounded font-mono text-base font-bold">
                            {item.id}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Text className="font-medium">{item.name}</Text>
                        </TableCell>
                        <TableCell>
                          <Badge color={item.type === 'Inventory' ? 'yellow' : 'gray'}>
                            {item.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Text className="text-sm">
                            {item.unitPrice ? `$${item.unitPrice.toFixed(2)}` : '-'}
                          </Text>
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => copyToClipboard(item.id)}
                            className="text-gray-400 hover:text-blue-600"
                            title="Copy Item ID"
                          >
                            <ClipboardDocumentIcon className="w-4 h-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
              {items.length === 0 && (
                <Text className="text-center py-4 text-gray-500">No items found</Text>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Help */}
      <Card className="mt-6">
        <Title>Need Help?</Title>
        <Text className="mt-2">
          To use this integration, you'll need:
        </Text>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 list-disc list-inside">
          <li>A QuickBooks Online account (sandbox or production)</li>
          <li>QuickBooks API credentials (Client ID and Secret)</li>
          <li>Webhook sources configured to send data</li>
          <li>Field mappings to transform data to QBO invoice format</li>
        </ul>

        <div className="mt-4">
          <a
            href="https://developer.intuit.com/app/developer/qbo/docs/develop"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline text-sm"
          >
            QuickBooks Online API Documentation
          </a>
        </div>
      </Card>
    </div>
  );
}
