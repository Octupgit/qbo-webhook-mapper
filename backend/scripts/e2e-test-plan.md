# End-to-End Test Plan: Multi-Tenant QBO Webhook Mapper

## Overview
This document provides a comprehensive test plan for validating the multi-tenant SaaS transformation of the QBO Webhook Mapper.

---

## Prerequisites

### Environment Setup
```bash
# 1. Start the backend server
cd backend && npm run dev

# 2. Start the frontend (optional for API-only tests)
cd frontend && npm run dev

# 3. Ensure QBO Sandbox credentials are configured in .env
QBO_CLIENT_ID=your_sandbox_client_id
QBO_CLIENT_SECRET=your_sandbox_client_secret
QBO_ENVIRONMENT=sandbox
QBO_REDIRECT_URI=http://localhost:3001/api/v1/oauth/callback
```

### Test Data
- QBO Sandbox account with at least 1 Customer and 1 Item
- Admin user email for magic link auth

---

## Test Scenario 1: Organization Creation

### 1.1 Create Test Organization via Admin API

```bash
# Request magic link (for admin auth)
curl -X POST http://localhost:3001/api/admin/auth/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@yourcompany.com"}'

# After clicking the magic link, get the JWT token from the response
# Use that token for subsequent requests

# Create organization
curl -X POST http://localhost:3001/api/admin/organizations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "name": "Test Organization",
    "slug": "test-org",
    "plan_tier": "professional"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "organization_id": "org_xxxx",
    "name": "Test Organization",
    "slug": "test-org",
    "plan_tier": "professional",
    "is_active": true
  }
}
```

### 1.2 Verify Organization Created
```bash
curl http://localhost:3001/api/admin/organizations \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Test Scenario 2: OAuth Flow (Sandbox Mode)

### 2.1 Initiate OAuth Connection

```bash
# Get authorization URL (returns URL, no redirect)
curl "http://localhost:3001/api/v1/connect/test-org?redirect=false"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "authUrl": "https://appcenter.intuit.com/connect/oauth2?client_id=..."
  }
}
```

### 2.2 Complete OAuth in Browser
1. Open the `authUrl` in a browser
2. Log into QBO Sandbox
3. Authorize the application
4. Verify redirect to frontend with `?connected=true&realmId=xxx`

### 2.3 Verify Connection Status

```bash
curl http://localhost:3001/api/v1/org/test-org/status
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "organization": {
      "id": "org_xxxx",
      "slug": "test-org",
      "name": "Test Organization",
      "planTier": "professional"
    },
    "qbo": {
      "connected": true,
      "realmId": "4620816365xxxxx",
      "companyName": "Sandbox Company_US_1",
      "syncStatus": "active"
    }
  }
}
```

---

## Test Scenario 3: Webhook Source Creation

### 3.1 Create a Webhook Source

```bash
curl -X POST http://localhost:3001/api/v1/org/test-org/sources \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "name": "Shopify Test Store",
    "source_type": "shopify"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "source_id": "src_xxxx",
    "name": "Shopify Test Store",
    "source_type": "shopify",
    "api_key": "sk_live_xxxxxxxxxxxxx",
    "webhook_url": "http://localhost:3001/api/v1/webhook/test-org/src_xxxx"
  }
}
```

**Save the `api_key` for webhook testing!**

---

## Test Scenario 4: Send "Dirty" JSON Webhook Payload

### 4.1 Send Webhook with Messy/Nested Payload

```bash
# Replace API_KEY with the key from step 3.1
curl -X POST http://localhost:3001/api/v1/webhook/test-org \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "id": "ORD-2024-001",
    "created_at": "2024-01-31T15:30:00Z",
    "financial_status": "paid",
    "customer": {
      "id": "CUST-789",
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@example.com",
      "phone": "+1-555-0123",
      "addresses": {
        "billing": {
          "line1": "123 Main St",
          "city": "San Francisco",
          "state": "CA",
          "zip": "94102"
        }
      }
    },
    "line_items": [
      {
        "id": "LI-001",
        "sku": "WIDGET-PRO",
        "name": "Professional Widget",
        "quantity": 2,
        "price": "49.99",
        "tax_rate": 0.0875
      },
      {
        "id": "LI-002",
        "sku": "GADGET-STD",
        "name": "Standard Gadget",
        "quantity": 1,
        "price": "29.99",
        "discount": {
          "type": "percentage",
          "value": 10
        }
      }
    ],
    "shipping": {
      "method": "express",
      "cost": "12.99"
    },
    "totals": {
      "subtotal": "129.97",
      "tax": "11.37",
      "shipping": "12.99",
      "grand_total": "154.33"
    },
    "notes": {
      "customer": "Please gift wrap",
      "internal": "VIP customer - priority shipping"
    },
    "metadata": {
      "source": "web",
      "utm_campaign": "winter_sale",
      "affiliate_id": null
    }
  }'
```

**Expected Response (No Mapping Configured):**
```json
{
  "success": true,
  "data": {
    "payloadId": "pay_xxxx",
    "processed": false,
    "code": "NO_MAPPING"
  }
}
```

The payload is stored but not processed because no mapping exists yet.

---

## Test Scenario 5: Visual Mapper - Configure Field Mappings

### 5.1 Open Visual Mapper in Browser
1. Navigate to `http://localhost:5173/admin/org/test-org/mappings`
2. Select the Shopify Test Store source
3. The left panel should show the JSON from the webhook we just sent

### 5.2 Map Fields Using Visual Mapper

| QBO Field | Mode | Value |
|-----------|------|-------|
| CustomerRef.value | Dynamic Lookup | Search and select a QBO customer |
| Line[0].Amount | From Payload | `$.line_items[0].price` |
| Line[0].DetailType | Static | `SalesItemLineDetail` |
| Line[0].SalesItemLineDetail.ItemRef.value | Dynamic Lookup | Search and select a QBO item |
| DocNumber | From Payload | `$.id` |
| CustomerMemo.value | From Payload | `$.notes.customer` |
| PrivateNote | From Payload | `$.notes.internal` |

### 5.3 Test the Mapping
1. Click "Test Mapping" button
2. Verify the preview shows correctly transformed invoice
3. Click "Save Mapping"

### 5.4 Verify Mapping Saved

```bash
curl http://localhost:3001/api/v1/org/test-org/effective-mapping/$SOURCE_ID
```

---

## Test Scenario 6: Re-send Webhook and Verify Invoice Creation

### 6.1 Send Another Webhook

```bash
curl -X POST http://localhost:3001/api/v1/webhook/test-org \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "id": "ORD-2024-002",
    "created_at": "2024-01-31T16:00:00Z",
    "customer": {
      "id": "CUST-789",
      "email": "john.doe@example.com"
    },
    "line_items": [
      {
        "sku": "WIDGET-PRO",
        "name": "Professional Widget",
        "quantity": 3,
        "price": "49.99"
      }
    ],
    "notes": {
      "customer": "Second order test",
      "internal": "E2E test order"
    }
  }'
```

**Expected Response (Processed):**
```json
{
  "success": true,
  "data": {
    "payloadId": "pay_yyyy",
    "processed": true,
    "invoiceId": "178",
    "logId": "log_zzzz"
  }
}
```

### 6.2 Verify in QBO Sandbox
1. Log into QBO Sandbox
2. Navigate to Sales > Invoices
3. Find invoice with DocNumber `ORD-2024-002`
4. Verify:
   - Customer matches the one selected in Visual Mapper
   - Line item matches the one selected
   - Amount is `49.99` (or calculated based on mapping)
   - Notes are populated

### 6.3 Check Sync Log

```bash
curl http://localhost:3001/api/v1/org/test-org/logs?limit=5
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "log_id": "log_zzzz",
      "status": "success",
      "qbo_invoice_id": "178",
      "qbo_doc_number": "ORD-2024-002",
      "request_payload": "...",
      "response_payload": "...",
      "completed_at": "2024-01-31T16:00:01Z"
    }
  ]
}
```

---

## Test Scenario 7: Error Boundary - Token Expiration

### 7.1 Simulate Token Expiration

**Method A: Manual Database Update (Mock/Dev)**
```sql
-- In BigQuery or mock data
UPDATE oauth_tokens
SET access_token_expires_at = TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
WHERE organization_id = 'org_xxxx';
```

**Method B: Wait for Token to Naturally Expire** (1 hour in sandbox)

**Method C: Force Invalid Token**
```javascript
// In mockDataService.ts, temporarily corrupt the token
```

### 7.2 Send Webhook During Token Expiration

```bash
curl -X POST http://localhost:3001/api/v1/webhook/test-org \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "id": "ORD-EXPIRED-001",
    "customer": { "id": "CUST-789" },
    "line_items": [{ "sku": "WIDGET", "price": "10.00" }]
  }'
```

### 7.3 Expected Behavior

**If Refresh Succeeds:**
- Token is automatically refreshed
- Invoice is created
- Response: `{ "success": true, "processed": true, ... }`

**If Refresh Fails (token completely expired):**
```json
{
  "success": true,
  "data": {
    "payloadId": "pay_xxxx",
    "processed": false,
    "code": "QBO_NOT_CONNECTED"
  }
}
```
- Payload is stored for later retry
- Admin can reconnect QBO and reprocess

### 7.4 Verify SyncLog Captures Error Details

When QBO API returns an error (e.g., 401 Unauthorized), check the sync log:

```bash
curl http://localhost:3001/api/v1/org/test-org/logs?status=failed
```

**Expected SyncLog Entry:**
```json
{
  "log_id": "log_failed",
  "status": "failed",
  "error_message": "Token refresh failed. Please reconnect to QuickBooks.",
  "request_payload": "{\"CustomerRef\":{\"value\":\"123\"},...}",
  "response_payload": null,
  "completed_at": "2024-01-31T17:00:00Z"
}
```

---

## Test Scenario 8: QBO API Error Handling

### 8.1 Trigger QBO Validation Error

Send a webhook that will fail QBO validation:

```bash
curl -X POST http://localhost:3001/api/v1/webhook/test-org \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "id": "ORD-BAD-001",
    "customer": { "id": "INVALID-CUSTOMER-99999" },
    "line_items": [{ "sku": "INVALID-ITEM", "price": "-50.00" }]
  }'
```

### 8.2 Verify Error Captured in SyncLog

```bash
curl http://localhost:3001/api/v1/org/test-org/logs?payloadId=$PAYLOAD_ID
```

**Expected:**
```json
{
  "log_id": "log_xxx",
  "status": "failed",
  "error_message": "Object Not Found : Something you're trying to use has been made inactive.",
  "request_payload": "{...}",
  "response_payload": "{\"Fault\":{\"Error\":[{\"Message\":\"Object Not Found\",...}]}}",
  "completed_at": "..."
}
```

The admin can see:
1. Exact QBO error message
2. The request payload that was sent
3. Full QBO response for debugging

---

## Test Scenario 9: Multi-Tenant Isolation

### 9.1 Create Second Organization

```bash
curl -X POST http://localhost:3001/api/admin/organizations \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Other Company", "slug": "other-co", "plan_tier": "starter"}'
```

### 9.2 Verify Data Isolation

```bash
# Try to access test-org data with other-co slug
curl http://localhost:3001/api/v1/org/other-co/logs
# Should return empty or only other-co's logs

# Try using test-org's API key with other-co
curl -X POST http://localhost:3001/api/v1/webhook/other-co \
  -H "X-API-Key: $TEST_ORG_API_KEY" \
  -d '{"test": "data"}'
```

**Expected:** `403 Forbidden - API key does not belong to this organization`

---

## Automated Test Script

```bash
#!/bin/bash
# e2e-test.sh

set -e

BASE_URL="http://localhost:3001"
ORG_SLUG="e2e-test-$(date +%s)"

echo "=== E2E Test: Multi-Tenant QBO Webhook Mapper ==="

# 1. Create organization
echo "1. Creating test organization..."
ORG_RESPONSE=$(curl -s -X POST "$BASE_URL/api/admin/organizations" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"E2E Test Org\", \"slug\": \"$ORG_SLUG\", \"plan_tier\": \"professional\"}")
echo "$ORG_RESPONSE"
ORG_ID=$(echo "$ORG_RESPONSE" | jq -r '.data.organization_id')

# 2. Create webhook source
echo "2. Creating webhook source..."
SOURCE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/org/$ORG_SLUG/sources" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Source", "source_type": "custom"}')
echo "$SOURCE_RESPONSE"
API_KEY=$(echo "$SOURCE_RESPONSE" | jq -r '.data.api_key')
SOURCE_ID=$(echo "$SOURCE_RESPONSE" | jq -r '.data.source_id')

# 3. Send webhook (no mapping)
echo "3. Sending webhook (no mapping)..."
WEBHOOK_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/webhook/$ORG_SLUG" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"order_id": "TEST-001", "amount": 99.99}')
echo "$WEBHOOK_RESPONSE"

# 4. Check status
echo "4. Checking connection status..."
STATUS_RESPONSE=$(curl -s "$BASE_URL/api/v1/org/$ORG_SLUG/status")
echo "$STATUS_RESPONSE"

echo ""
echo "=== E2E Test Complete ==="
echo "Organization: $ORG_SLUG"
echo "Source ID: $SOURCE_ID"
echo "API Key: $API_KEY"
```

---

## Summary Checklist

| Test | Status | Notes |
|------|--------|-------|
| Create Organization | ⬜ | |
| OAuth Connect (Sandbox) | ⬜ | Requires manual browser auth |
| Create Webhook Source | ⬜ | |
| Send "Dirty" Payload | ⬜ | |
| Visual Mapper - Map Fields | ⬜ | |
| Visual Mapper - Dynamic Lookup | ⬜ | |
| Re-send Webhook | ⬜ | |
| Verify Invoice in QBO | ⬜ | |
| Check Sync Log | ⬜ | |
| Token Expiration Handling | ⬜ | |
| QBO API Error Capture | ⬜ | |
| Multi-Tenant Isolation | ⬜ | |

---

## Troubleshooting

### Common Issues

1. **OAuth Error: "redirect_uri mismatch"**
   - Ensure `QBO_REDIRECT_URI` matches exactly what's configured in Intuit Developer Portal

2. **"No active token found"**
   - Complete OAuth flow first via `/api/v1/connect/:slug`

3. **"API key does not belong to this organization"**
   - Using wrong API key for the organization
   - Check that source was created for the correct org

4. **SyncLog shows empty error_message**
   - Check backend logs for full error stack
   - Verify QBO API response parsing
