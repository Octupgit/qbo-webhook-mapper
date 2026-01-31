import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Card,
  Title,
  Text,
  Button,
  Badge,
  Divider,
} from '@tremor/react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ArrowRightOnRectangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import * as oauthApi from '../api/oauth';
import { OAuthStatus } from '../types';

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadStatus();

    // Check for OAuth callback result
    const oauthResult = searchParams.get('oauth');
    if (oauthResult === 'success') {
      setMessage({ type: 'success', text: 'Successfully connected to QuickBooks!' });
    } else if (oauthResult === 'error') {
      const errorMessage = searchParams.get('message') || 'Failed to connect';
      setMessage({ type: 'error', text: errorMessage });
    }
  }, [searchParams]);

  const loadStatus = async () => {
    try {
      const status = await oauthApi.getConnectionStatus();
      setOauthStatus(status);
    } catch (err) {
      console.error('Failed to load OAuth status:', err);
    } finally {
      setLoading(false);
    }
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
        <div
          className={`mt-4 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
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
                  color="red"
                  onClick={handleDisconnect}
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
            <Badge color={process.env.NODE_ENV === 'production' ? 'green' : 'yellow'}>
              Sandbox
            </Badge>
          </div>
          <div className="flex justify-between">
            <Text>API Endpoint</Text>
            <Text className="font-mono text-sm">{window.location.origin}/api</Text>
          </div>
        </div>
      </Card>

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
