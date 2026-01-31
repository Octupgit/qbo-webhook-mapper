/**
 * Data Service - Switches between BigQuery and Mock based on config
 */

import config from '../config';

// Check if we should use mock data
const useMock = !process.env.GOOGLE_APPLICATION_CREDENTIALS ||
                process.env.GOOGLE_APPLICATION_CREDENTIALS.includes('/path/to/') ||
                process.env.USE_MOCK_DATA === 'true';

let dataService: typeof import('./bigQueryService') | typeof import('./mockDataService');

if (useMock) {
  console.log('📦 Using MOCK data service (in-memory storage)');
  dataService = require('./mockDataService');
} else {
  console.log('☁️ Using BigQuery data service');
  dataService = require('./bigQueryService');
}

export const {
  // Sources
  createSource,
  getSources,
  getSourceById,
  getSourceByApiKey,
  updateSource,
  regenerateApiKey,
  // Payloads
  savePayload,
  getPayloads,
  getPayloadById,
  getLatestPayload,
  markPayloadProcessed,
  // Mappings
  createMapping,
  getMappings,
  getMappingById,
  getActiveMapping,
  updateMapping,
  // OAuth Tokens
  saveToken,
  getActiveToken,
  updateToken,
  // Sync Logs
  createSyncLog,
  updateSyncLog,
  getSyncLogs,
  getSyncLogById,
} = dataService;
