import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // BigQuery
  bigquery: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT || 'octup-testing',
    dataset: process.env.BIGQUERY_DATASET || 'qbo_webhook_mapper',
  },

  // QuickBooks OAuth
  qbo: {
    clientId: process.env.QBO_CLIENT_ID || '',
    clientSecret: process.env.QBO_CLIENT_SECRET || '',
    redirectUri: process.env.QBO_REDIRECT_URI || 'http://localhost:3001/api/oauth/qbo/callback',
    environment: process.env.QBO_ENVIRONMENT || 'sandbox',
  },

  // Security
  encryptionKey: process.env.ENCRYPTION_KEY || 'default_32_char_encryption_key!!',

  // CORS
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
};

export default config;
