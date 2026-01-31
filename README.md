# QBO Webhook Mapper

A web application that receives arbitrary JSON data via webhooks and provides a UI for mapping fields to QuickBooks Online Invoice format.

## Features

- **Webhook Receiver**: Accept JSON payloads from any external system
- **Visual Mapping Editor**: Map source fields to QBO Invoice fields with transformations
- **QBO Integration**: OAuth 2.0 authentication and invoice creation
- **Sync Logs**: Track all invoice sync operations

## Tech Stack

- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React 18 + Vite + Tailwind + Tremor
- **Database**: Google BigQuery
- **QBO Auth**: intuit-oauth library

## Quick Start

### 1. Prerequisites

- Node.js 18+
- Google Cloud account with BigQuery enabled
- QuickBooks Online developer account

### 2. Setup BigQuery

Run the SQL script to create tables:

```bash
# Using bq command line
bq query --use_legacy_sql=false < scripts/setup-bigquery.sql
```

Or execute the script in the BigQuery Console.

### 3. Configure Environment

Copy the example env file and fill in your credentials:

```bash
cd backend
cp .env.example .env
```

Required variables:
- `GOOGLE_CLOUD_PROJECT`: Your GCP project ID
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to service account JSON
- `QBO_CLIENT_ID`: QuickBooks app client ID
- `QBO_CLIENT_SECRET`: QuickBooks app client secret
- `ENCRYPTION_KEY`: 32-character key for encrypting OAuth tokens

### 4. Install Dependencies

```bash
npm run install:all
```

### 5. Run Development Server

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Usage

### 1. Create a Webhook Source

1. Go to **Sources** page
2. Click **Create Source**
3. Save the API key (shown only once)

### 2. Send Test Webhook

```bash
curl -X POST http://localhost:3001/api/webhooks/{sourceId} \
  -H "Content-Type: application/json" \
  -H "X-API-Key: {yourApiKey}" \
  -d '{"order_id": "123", "customer": {"name": "John"}, "amount": 99.99}'
```

### 3. Create Field Mapping

1. Go to **Mappings** page
2. Select your source
3. Click **New Mapping**
4. Map source fields to QBO Invoice fields
5. Test and save

### 4. Connect QuickBooks

1. Go to **Settings** page
2. Click **Connect to QuickBooks**
3. Authorize the application

### 5. Sync Invoices

Payloads can be synced manually or automatically via the API.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhooks/:sourceId` | Receive webhook |
| GET | `/api/sources` | List sources |
| POST | `/api/sources` | Create source |
| GET | `/api/mappings/:id` | Get mapping |
| POST | `/api/mappings/:id/test` | Test mapping |
| POST | `/api/invoices/sync/:payloadId` | Sync to QBO |
| GET | `/api/oauth/qbo/status` | Connection status |

## Project Structure

```
qbo-webhook-mapper/
├── backend/
│   └── src/
│       ├── config/         # Configuration
│       ├── routes/         # API routes
│       ├── services/       # Business logic
│       ├── middleware/     # Auth, error handling
│       └── types/          # TypeScript types
├── frontend/
│   └── src/
│       ├── api/            # API client
│       ├── components/     # React components
│       ├── pages/          # Page components
│       └── types/          # TypeScript types
└── scripts/
    └── setup-bigquery.sql  # Database setup
```

## License

MIT
