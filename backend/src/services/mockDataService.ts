/**
 * Mock Data Service - In-memory storage for development/testing
 * Replaces BigQuery when no GCP credentials are available
 *
 * Multi-tenant aware: All entities are scoped by organization_id
 */

import { v4 as uuidv4 } from 'uuid';
import {
  WebhookSource,
  WebhookPayload,
  MappingConfiguration,
  OAuthToken,
  SyncLog,
  FieldMapping,
  DEFAULT_ORGANIZATION_ID,
  Organization,
  GlobalMappingTemplate,
  ClientMappingOverride,
  AdminUser,
} from '../types';
import { ApiKey, ApiUsageLog } from '../types/apiKey';

// In-memory storage
const organizations: Map<string, Organization> = new Map();
const adminUsers: Map<string, AdminUser> = new Map();
const globalTemplates: Map<string, GlobalMappingTemplate> = new Map();
const clientOverrides: Map<string, ClientMappingOverride> = new Map();
const sources: Map<string, WebhookSource> = new Map();
const payloads: Map<string, WebhookPayload> = new Map();
const mappings: Map<string, MappingConfiguration> = new Map();
const tokens: Map<string, OAuthToken> = new Map();
const logs: Map<string, SyncLog> = new Map();
const apiKeys: Map<string, ApiKey> = new Map();
const apiUsageLogs: Map<string, ApiUsageLog> = new Map();

// ============================================================
// INITIALIZATION
// ============================================================

function initSampleData() {
  // Create default organization (for backward compatibility)
  const defaultOrg: Organization = {
    organization_id: DEFAULT_ORGANIZATION_ID,
    name: 'Default Organization',
    slug: 'default',
    plan_tier: 'enterprise',
    is_active: true,
    connection_link_enabled: true,
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  };
  organizations.set(defaultOrg.organization_id, defaultOrg);

  // Create sample organization
  const sampleOrg: Organization = {
    organization_id: 'sample-org-001',
    name: 'Acme Corporation',
    slug: 'acme-corp',
    plan_tier: 'professional',
    is_active: true,
    connection_link_enabled: true,
    settings: {
      timezone: 'America/New_York',
      notification_email: 'admin@acme-corp.com',
    },
    created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
  };
  organizations.set(sampleOrg.organization_id, sampleOrg);

  // Create admin user (password: Alon@2026)
  // bcrypt hash of 'Alon@2026' with 10 rounds
  const adminUser: AdminUser = {
    user_id: 'admin-001',
    email: 'admin@octup.com',
    name: 'System Admin',
    password_hash: '$2b$10$kNO7NoLOrfRE4L8aORYA.e4xb9YjTBfZIRG6YM5yMN0ycUORFZ.ve', // Alon@2026
    must_change_password: false,
    role: 'super_admin',
    is_active: true,
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  };
  adminUsers.set(adminUser.user_id, adminUser);

  // Create global mapping templates
  const shopifyTemplate: GlobalMappingTemplate = {
    template_id: 'template-shopify-001',
    name: 'Shopify Orders Standard',
    source_type: 'shopify',
    description: 'Default mapping for Shopify order webhooks',
    version: 1,
    is_active: true,
    field_mappings: [
      { qboField: 'CustomerRef.value', sourceField: '$.customer.id', isRequired: true, lookupType: 'customer' },
      { qboField: 'Line[0].Amount', sourceField: '$.total_price', transformation: 'toNumber', isRequired: true },
      { qboField: 'Line[0].DetailType', staticValue: 'SalesItemLineDetail', isRequired: true },
      { qboField: 'Line[0].SalesItemLineDetail.ItemRef.value', staticValue: '1', isRequired: true, lookupType: 'item' },
      { qboField: 'DocNumber', sourceField: '$.order_number', transformation: 'concat:SHOP-:' },
    ],
    priority: 100,
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  };
  globalTemplates.set(shopifyTemplate.template_id, shopifyTemplate);

  const stripeTemplate: GlobalMappingTemplate = {
    template_id: 'template-stripe-001',
    name: 'Stripe Payments Standard',
    source_type: 'stripe',
    description: 'Default mapping for Stripe payment webhooks',
    version: 1,
    is_active: true,
    field_mappings: [
      { qboField: 'CustomerRef.value', sourceField: '$.data.object.customer', isRequired: true, lookupType: 'customer' },
      { qboField: 'Line[0].Amount', sourceField: '$.data.object.amount', transformation: 'multiply:0.01', isRequired: true },
      { qboField: 'Line[0].DetailType', staticValue: 'SalesItemLineDetail', isRequired: true },
      { qboField: 'Line[0].SalesItemLineDetail.ItemRef.value', staticValue: '1', isRequired: true, lookupType: 'item' },
      { qboField: 'DocNumber', sourceField: '$.data.object.id', transformation: 'substring:3:15' },
    ],
    priority: 100,
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  };
  globalTemplates.set(stripeTemplate.template_id, stripeTemplate);

  const wooTemplate: GlobalMappingTemplate = {
    template_id: 'template-woocommerce-001',
    name: 'WooCommerce Orders Standard',
    source_type: 'woocommerce',
    description: 'Default mapping for WooCommerce order webhooks',
    version: 1,
    is_active: true,
    field_mappings: [
      { qboField: 'CustomerRef.value', sourceField: '$.billing.customer_id', isRequired: true, lookupType: 'customer' },
      { qboField: 'Line[0].Amount', sourceField: '$.total', transformation: 'toNumber', isRequired: true },
      { qboField: 'Line[0].DetailType', staticValue: 'SalesItemLineDetail', isRequired: true },
      { qboField: 'Line[0].SalesItemLineDetail.ItemRef.value', staticValue: '1', isRequired: true, lookupType: 'item' },
      { qboField: 'DocNumber', sourceField: '$.id', transformation: 'concat:WOO-:' },
    ],
    priority: 100,
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  };
  globalTemplates.set(wooTemplate.template_id, wooTemplate);

  const customTemplate: GlobalMappingTemplate = {
    template_id: 'template-custom-001',
    name: 'Custom Webhook Default',
    source_type: 'custom',
    description: 'Minimal template for custom webhook sources',
    version: 1,
    is_active: true,
    field_mappings: [
      { qboField: 'CustomerRef.value', sourceField: '$.customer_id', isRequired: true, lookupType: 'customer' },
      { qboField: 'Line[0].Amount', sourceField: '$.amount', transformation: 'toNumber', isRequired: true },
      { qboField: 'Line[0].DetailType', staticValue: 'SalesItemLineDetail', isRequired: true },
      { qboField: 'Line[0].SalesItemLineDetail.ItemRef.value', staticValue: '1', isRequired: true, lookupType: 'item' },
    ],
    priority: 200,
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  };
  globalTemplates.set(customTemplate.template_id, customTemplate);

  // Sample webhook source 1 - Shopify Orders (default org)
  const sampleSource: WebhookSource = {
    source_id: 'sample-source-001',
    organization_id: DEFAULT_ORGANIZATION_ID,
    name: 'Shopify Orders',
    description: 'Webhook for Shopify order notifications',
    source_type: 'shopify',
    api_key: 'sk_live_shopify_abc123def456ghi789jkl',
    webhook_url: '/api/v1/webhook/default/sample-source-001',
    is_active: true,
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  };
  sources.set(sampleSource.source_id, sampleSource);

  // Sample webhook source 2 - Stripe Payments (default org)
  const stripeSource: WebhookSource = {
    source_id: 'sample-source-002',
    organization_id: DEFAULT_ORGANIZATION_ID,
    name: 'Stripe Payments',
    description: 'Webhook for Stripe payment events',
    source_type: 'stripe',
    api_key: 'sk_live_stripe_xyz789abc123def456ghi',
    webhook_url: '/api/v1/webhook/default/sample-source-002',
    is_active: true,
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  };
  sources.set(stripeSource.source_id, stripeSource);

  // Sample webhook source 3 - WooCommerce (default org)
  const wooSource: WebhookSource = {
    source_id: 'sample-source-003',
    organization_id: DEFAULT_ORGANIZATION_ID,
    name: 'WooCommerce Store',
    description: 'Webhook for WooCommerce new orders',
    source_type: 'woocommerce',
    api_key: 'wc_live_key_mno456pqr789stu012vwx',
    webhook_url: '/api/v1/webhook/default/sample-source-003',
    is_active: true,
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  };
  sources.set(wooSource.source_id, wooSource);

  // Sample source for Acme Corp
  const acmeSource: WebhookSource = {
    source_id: 'acme-source-001',
    organization_id: sampleOrg.organization_id,
    name: 'Acme Shopify',
    description: 'Acme Corp Shopify integration',
    source_type: 'shopify',
    api_key: 'acme_live_key_' + uuidv4().replace(/-/g, ''),
    webhook_url: '/api/v1/webhook/acme-corp/acme-source-001',
    is_active: true,
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  };
  sources.set(acmeSource.source_id, acmeSource);

  // Client override for Acme Corp (overrides global Shopify template)
  const acmeOverride: ClientMappingOverride = {
    override_id: 'override-acme-001',
    organization_id: sampleOrg.organization_id,
    source_id: acmeSource.source_id,
    template_id: shopifyTemplate.template_id,
    name: 'Acme Customer Override',
    description: 'Use static customer for all Acme orders',
    field_mappings: [
      { qboField: 'CustomerRef.value', staticValue: 'ACME-CUST-001', isRequired: true },
      { qboField: 'PrivateNote', sourceField: '$.note', transformation: 'concat:From Shopify: :' },
    ],
    priority: 50,
    is_active: true,
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
  };
  clientOverrides.set(acmeOverride.override_id, acmeOverride);

  // Sample webhook payloads (with organization_id)
  const samplePayload: WebhookPayload = {
    payload_id: 'sample-payload-001',
    organization_id: DEFAULT_ORGANIZATION_ID,
    source_id: sampleSource.source_id,
    raw_payload: JSON.stringify({
      order_id: 'ORD-12345',
      customer: {
        id: 'CUST-001',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '555-1234',
      },
      billing_address: {
        line1: '123 Main Street',
        city: 'San Francisco',
        state: 'CA',
        zip: '94102',
        country: 'USA',
      },
      items: [
        { sku: 'WIDGET-001', name: 'Premium Widget', quantity: 2, unit_price: 49.99 },
        { sku: 'GADGET-002', name: 'Super Gadget', quantity: 1, unit_price: 29.99 },
      ],
      subtotal: 129.97,
      tax: 10.40,
      total: 140.37,
      created_at: '2025-01-31T10:30:00Z',
    }),
    received_at: new Date(),
    processed: false,
  };
  payloads.set(samplePayload.payload_id, samplePayload);

  const stripePayload: WebhookPayload = {
    payload_id: 'sample-payload-002',
    organization_id: DEFAULT_ORGANIZATION_ID,
    source_id: stripeSource.source_id,
    raw_payload: JSON.stringify({
      id: 'pi_3NxXXX2eZvKYlo2C0Hs9v4vZ',
      object: 'payment_intent',
      amount: 15000,
      currency: 'usd',
      customer: 'cus_OvXXXXXX',
      description: 'Invoice #INV-2024-001',
      metadata: { order_id: 'ORD-98765', customer_name: 'Jane Smith', customer_email: 'jane@company.com' },
      receipt_email: 'jane@company.com',
      status: 'succeeded',
      created: 1706745600,
    }),
    received_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
    processed: false,
  };
  payloads.set(stripePayload.payload_id, stripePayload);

  const wooPayload: WebhookPayload = {
    payload_id: 'sample-payload-003',
    organization_id: DEFAULT_ORGANIZATION_ID,
    source_id: wooSource.source_id,
    raw_payload: JSON.stringify({
      id: 54321,
      number: 'WC-54321',
      status: 'processing',
      total: '245.50',
      currency: 'USD',
      billing: {
        first_name: 'Robert',
        last_name: 'Johnson',
        company: 'Tech Corp',
        address_1: '456 Oak Avenue',
        city: 'Los Angeles',
        state: 'CA',
        postcode: '90001',
        country: 'US',
        email: 'robert@techcorp.com',
        phone: '555-9876',
      },
      line_items: [
        { id: 1, name: 'Pro Software License', product_id: 101, quantity: 1, subtotal: '199.00', total: '199.00' },
        { id: 2, name: 'Support Package', product_id: 102, quantity: 1, subtotal: '46.50', total: '46.50' },
      ],
      date_created: '2025-01-31T14:22:00',
    }),
    received_at: new Date(Date.now() - 30 * 60 * 1000),
    processed: false,
  };
  payloads.set(wooPayload.payload_id, wooPayload);

  // Sample mapping configurations (with organization_id)
  const sampleMapping: MappingConfiguration = {
    mapping_id: 'sample-mapping-001',
    organization_id: DEFAULT_ORGANIZATION_ID,
    source_id: sampleSource.source_id,
    inherits_from_template_id: shopifyTemplate.template_id,
    name: 'Shopify to QBO Invoice',
    description: 'Maps Shopify order fields to QuickBooks Invoice',
    version: 1,
    is_active: true,
    field_mappings: [
      { qboField: 'CustomerRef.value', sourceField: '$.customer.id', isRequired: true },
      { qboField: 'CustomerMemo.value', sourceField: '$.order_id', transformation: 'concat:Order #:' },
      { qboField: 'BillEmail.Address', sourceField: '$.customer.email' },
      { qboField: 'Line[0].Amount', sourceField: '$.total', transformation: 'toNumber', isRequired: true },
      { qboField: 'Line[0].Description', sourceField: '$.items[0].name' },
      { qboField: 'Line[0].SalesItemLineDetail.ItemRef.value', staticValue: '1', isRequired: true },
    ],
    created_at: new Date(),
  };
  mappings.set(sampleMapping.mapping_id, sampleMapping);

  const stripeMapping: MappingConfiguration = {
    mapping_id: 'sample-mapping-002',
    organization_id: DEFAULT_ORGANIZATION_ID,
    source_id: stripeSource.source_id,
    inherits_from_template_id: stripeTemplate.template_id,
    name: 'Stripe Payment to Invoice',
    description: 'Maps Stripe payment intents to QuickBooks Invoice',
    version: 1,
    is_active: true,
    field_mappings: [
      { qboField: 'CustomerRef.value', sourceField: '$.customer', isRequired: true },
      { qboField: 'DocNumber', sourceField: '$.metadata.order_id', transformation: 'concat:STR-:' },
      { qboField: 'CustomerMemo.value', sourceField: '$.description' },
      { qboField: 'BillEmail.Address', sourceField: '$.receipt_email' },
      { qboField: 'Line[0].Amount', sourceField: '$.amount', transformation: 'multiply:0.01', isRequired: true },
      { qboField: 'Line[0].Description', staticValue: 'Stripe Payment' },
      { qboField: 'Line[0].SalesItemLineDetail.ItemRef.value', staticValue: '1', isRequired: true },
      { qboField: 'CurrencyRef.value', sourceField: '$.currency', transformation: 'toUpperCase' },
    ],
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  };
  mappings.set(stripeMapping.mapping_id, stripeMapping);

  const wooMapping: MappingConfiguration = {
    mapping_id: 'sample-mapping-003',
    organization_id: DEFAULT_ORGANIZATION_ID,
    source_id: wooSource.source_id,
    inherits_from_template_id: wooTemplate.template_id,
    name: 'WooCommerce Order to Invoice',
    description: 'Maps WooCommerce orders to QuickBooks Invoice',
    version: 1,
    is_active: true,
    field_mappings: [
      { qboField: 'CustomerRef.value', sourceField: '$.billing.email', transformation: 'toString', isRequired: true },
      { qboField: 'DocNumber', sourceField: '$.number' },
      { qboField: 'BillEmail.Address', sourceField: '$.billing.email' },
      { qboField: 'BillAddr.Line1', sourceField: '$.billing.address_1' },
      { qboField: 'BillAddr.City', sourceField: '$.billing.city' },
      { qboField: 'BillAddr.CountrySubDivisionCode', sourceField: '$.billing.state' },
      { qboField: 'BillAddr.PostalCode', sourceField: '$.billing.postcode' },
      { qboField: 'Line[0].Amount', sourceField: '$.total', transformation: 'toNumber', isRequired: true },
      { qboField: 'Line[0].Description', sourceField: '$.line_items[0].name' },
      { qboField: 'Line[0].SalesItemLineDetail.ItemRef.value', staticValue: '1', isRequired: true },
      { qboField: 'Line[0].SalesItemLineDetail.Qty', sourceField: '$.line_items[0].quantity', transformation: 'toNumber' },
      { qboField: 'CurrencyRef.value', sourceField: '$.currency' },
      { qboField: 'TxnDate', sourceField: '$.date_created', transformation: 'formatDate' },
    ],
    created_at: new Date(Date.now() - 12 * 60 * 60 * 1000),
  };
  mappings.set(wooMapping.mapping_id, wooMapping);

  // Sample sync logs (with organization_id)
  const successLog: SyncLog = {
    log_id: 'sample-log-001',
    organization_id: DEFAULT_ORGANIZATION_ID,
    payload_id: 'sample-payload-001',
    source_id: sampleSource.source_id,
    mapping_id: sampleMapping.mapping_id,
    status: 'success',
    qbo_invoice_id: '178',
    qbo_doc_number: 'INV-1001',
    retry_count: 0,
    created_at: new Date(Date.now() - 6 * 60 * 60 * 1000),
  };
  logs.set(successLog.log_id, successLog);

  const failedLog: SyncLog = {
    log_id: 'sample-log-002',
    organization_id: DEFAULT_ORGANIZATION_ID,
    payload_id: 'sample-payload-002',
    source_id: stripeSource.source_id,
    mapping_id: stripeMapping.mapping_id,
    status: 'failed',
    error_message: 'QBO Error: Invalid customer reference - customer cus_OvXXXXXX not found in QuickBooks',
    retry_count: 1,
    created_at: new Date(Date.now() - 1 * 60 * 60 * 1000),
  };
  logs.set(failedLog.log_id, failedLog);

  const pendingLog: SyncLog = {
    log_id: 'sample-log-003',
    organization_id: DEFAULT_ORGANIZATION_ID,
    payload_id: 'sample-payload-003',
    source_id: wooSource.source_id,
    mapping_id: wooMapping.mapping_id,
    status: 'pending',
    retry_count: 0,
    created_at: new Date(Date.now() - 15 * 60 * 1000),
  };
  logs.set(pendingLog.log_id, pendingLog);

  console.log('✓ Mock data initialized:');
  console.log('  - 2 organizations (default + acme-corp)');
  console.log('  - 4 global templates (Shopify, Stripe, WooCommerce, Custom)');
  console.log('  - 1 client override (Acme)');
  console.log('  - 4 sources, 3 payloads, 3 mappings, 3 sync logs');
}

// Initialize on module load
initSampleData();

// ============================================================
// ORGANIZATIONS
// ============================================================

export async function createOrganization(
  name: string,
  slug: string,
  planTier: Organization['plan_tier'] = 'free',
  settings?: Organization['settings'],
  createdBy?: string
): Promise<Organization> {
  const org: Organization = {
    organization_id: uuidv4(),
    name,
    slug,
    plan_tier: planTier,
    is_active: true,
    connection_link_enabled: true,
    settings,
    created_at: new Date(),
    created_by: createdBy,
  };
  organizations.set(org.organization_id, org);
  return org;
}

export async function getOrganizations(): Promise<Organization[]> {
  return Array.from(organizations.values())
    .filter(o => o.is_active)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
}

export async function getOrganizationById(orgId: string): Promise<Organization | null> {
  return organizations.get(orgId) || null;
}

export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  return Array.from(organizations.values()).find(o => o.slug === slug) || null;
}

export async function updateOrganization(orgId: string, updates: Partial<Organization>): Promise<Organization | null> {
  const org = organizations.get(orgId);
  if (org) {
    const updated = { ...org, ...updates, updated_at: new Date() };
    organizations.set(orgId, updated);
    return updated;
  }
  return null;
}

// ============================================================
// ADMIN USERS
// ============================================================

export async function getAdminUserByEmail(email: string): Promise<AdminUser | null> {
  return Array.from(adminUsers.values()).find(u => u.email === email && u.is_active) || null;
}

export async function createAdminUser(
  email: string,
  name?: string,
  role: AdminUser['role'] = 'admin',
  passwordHash?: string,
  mustChangePassword: boolean = true
): Promise<AdminUser> {
  const user: AdminUser = {
    user_id: uuidv4(),
    email,
    name,
    password_hash: passwordHash || '',
    must_change_password: mustChangePassword,
    role,
    is_active: true,
    created_at: new Date(),
  };
  adminUsers.set(user.user_id, user);
  return user;
}

export async function updateAdminUser(userId: string, updates: Partial<AdminUser>): Promise<void> {
  const user = adminUsers.get(userId);
  if (user) {
    adminUsers.set(userId, { ...user, ...updates });
  }
}

// ============================================================
// GLOBAL MAPPING TEMPLATES
// ============================================================

export async function createGlobalTemplate(
  name: string,
  sourceType: string,
  fieldMappings: FieldMapping[],
  description?: string,
  priority = 100,
  staticValues?: Record<string, unknown>
): Promise<GlobalMappingTemplate> {
  const template: GlobalMappingTemplate = {
    template_id: uuidv4(),
    name,
    source_type: sourceType,
    description,
    version: 1,
    is_active: true,
    field_mappings: fieldMappings,
    static_values: staticValues,
    priority,
    created_at: new Date(),
  };
  globalTemplates.set(template.template_id, template);
  return template;
}

export async function getGlobalTemplates(sourceType?: string): Promise<GlobalMappingTemplate[]> {
  let result = Array.from(globalTemplates.values()).filter(t => t.is_active);
  if (sourceType) {
    result = result.filter(t => t.source_type === sourceType || t.source_type === 'custom');
  }
  return result.sort((a, b) => a.priority - b.priority);
}

export async function getGlobalTemplateById(templateId: string): Promise<GlobalMappingTemplate | null> {
  return globalTemplates.get(templateId) || null;
}

export async function updateGlobalTemplate(
  templateId: string,
  updates: Partial<GlobalMappingTemplate>
): Promise<void> {
  const template = globalTemplates.get(templateId);
  if (template) {
    globalTemplates.set(templateId, {
      ...template,
      ...updates,
      version: template.version + 1,
      updated_at: new Date(),
    });
  }
}

// ============================================================
// CLIENT MAPPING OVERRIDES
// ============================================================

export async function createClientOverride(
  organizationId: string,
  name: string,
  fieldMappings: FieldMapping[],
  sourceId?: string,
  templateId?: string,
  description?: string,
  priority = 50,
  staticValues?: Record<string, unknown>
): Promise<ClientMappingOverride> {
  const override: ClientMappingOverride = {
    override_id: uuidv4(),
    organization_id: organizationId,
    source_id: sourceId,
    template_id: templateId,
    name,
    description,
    field_mappings: fieldMappings,
    static_values: staticValues,
    priority,
    is_active: true,
    created_at: new Date(),
  };
  clientOverrides.set(override.override_id, override);
  return override;
}

export async function getClientOverrides(
  organizationId: string,
  sourceId?: string
): Promise<ClientMappingOverride[]> {
  let result = Array.from(clientOverrides.values())
    .filter(o => o.organization_id === organizationId && o.is_active);

  if (sourceId) {
    // Get overrides for specific source OR overrides that apply to all sources (null source_id)
    result = result.filter(o => o.source_id === sourceId || o.source_id === null || o.source_id === undefined);
  }

  return result.sort((a, b) => a.priority - b.priority);
}

export async function getClientOverrideById(overrideId: string): Promise<ClientMappingOverride | null> {
  return clientOverrides.get(overrideId) || null;
}

export async function updateClientOverride(
  overrideId: string,
  updates: Partial<ClientMappingOverride>
): Promise<void> {
  const override = clientOverrides.get(overrideId);
  if (override) {
    clientOverrides.set(overrideId, { ...override, ...updates, updated_at: new Date() });
  }
}

export async function deleteClientOverride(overrideId: string): Promise<void> {
  const override = clientOverrides.get(overrideId);
  if (override) {
    clientOverrides.set(overrideId, { ...override, is_active: false, updated_at: new Date() });
  }
}

// ============================================================
// WEBHOOK SOURCES (Multi-tenant)
// ============================================================

export async function createSource(
  organizationId: string,
  name: string,
  description?: string,
  sourceType: string = 'custom'
): Promise<WebhookSource> {
  const source: WebhookSource = {
    source_id: uuidv4(),
    organization_id: organizationId,
    name,
    description,
    source_type: sourceType,
    api_key: uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, ''),
    is_active: true,
    created_at: new Date(),
  };

  // Generate webhook URL based on org slug
  const org = await getOrganizationById(organizationId);
  if (org) {
    source.webhook_url = `/api/v1/webhook/${org.slug}/${source.source_id}`;
  }

  sources.set(source.source_id, source);
  return source;
}

export async function getSources(organizationId: string): Promise<WebhookSource[]> {
  return Array.from(sources.values())
    .filter(s => s.organization_id === organizationId && s.is_active)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
}

export async function getSourceById(organizationId: string, sourceId: string): Promise<WebhookSource | null> {
  const source = sources.get(sourceId);
  if (source && source.organization_id === organizationId) {
    return source;
  }
  return null;
}

export async function getSourceByApiKey(apiKey: string): Promise<WebhookSource | null> {
  return Array.from(sources.values()).find(s => s.api_key === apiKey && s.is_active) || null;
}

export async function updateSource(
  organizationId: string,
  sourceId: string,
  updates: Partial<WebhookSource>
): Promise<void> {
  const source = sources.get(sourceId);
  if (source && source.organization_id === organizationId) {
    sources.set(sourceId, { ...source, ...updates, updated_at: new Date() });
  }
}

export async function regenerateApiKey(organizationId: string, sourceId: string): Promise<string> {
  const newApiKey = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
  const source = sources.get(sourceId);
  if (source && source.organization_id === organizationId) {
    sources.set(sourceId, { ...source, api_key: newApiKey, updated_at: new Date() });
  }
  return newApiKey;
}

// ============================================================
// WEBHOOK PAYLOADS (Multi-tenant)
// ============================================================

export async function savePayload(
  organizationId: string,
  sourceId: string,
  payload: unknown,
  headers?: Record<string, string>
): Promise<WebhookPayload> {
  const webhookPayload: WebhookPayload = {
    payload_id: uuidv4(),
    organization_id: organizationId,
    source_id: sourceId,
    raw_payload: JSON.stringify(payload),
    headers: headers ? JSON.stringify(headers) : undefined,
    received_at: new Date(),
    processed: false,
  };
  payloads.set(webhookPayload.payload_id, webhookPayload);
  return webhookPayload;
}

export async function getPayloads(organizationId: string, sourceId: string, limit = 50): Promise<WebhookPayload[]> {
  return Array.from(payloads.values())
    .filter(p => p.organization_id === organizationId && p.source_id === sourceId)
    .sort((a, b) => b.received_at.getTime() - a.received_at.getTime())
    .slice(0, limit);
}

export async function getPayloadById(organizationId: string, payloadId: string): Promise<WebhookPayload | null> {
  const payload = payloads.get(payloadId);
  if (payload && payload.organization_id === organizationId) {
    return payload;
  }
  return null;
}

export async function getLatestPayload(organizationId: string, sourceId: string): Promise<WebhookPayload | null> {
  const sourcePayloads = Array.from(payloads.values())
    .filter(p => p.organization_id === organizationId && p.source_id === sourceId)
    .sort((a, b) => b.received_at.getTime() - a.received_at.getTime());
  return sourcePayloads[0] || null;
}

export async function markPayloadProcessed(
  organizationId: string,
  payloadId: string,
  invoiceId: string
): Promise<void> {
  const payload = payloads.get(payloadId);
  if (payload && payload.organization_id === organizationId) {
    payloads.set(payloadId, {
      ...payload,
      processed: true,
      processed_at: new Date(),
      invoice_id: invoiceId,
    });
  }
}

// ============================================================
// MAPPING CONFIGURATIONS (Multi-tenant)
// ============================================================

export async function createMapping(
  organizationId: string,
  sourceId: string,
  name: string,
  fieldMappings: FieldMapping[],
  staticValues?: Record<string, unknown>,
  description?: string,
  inheritsFromTemplateId?: string
): Promise<MappingConfiguration> {
  const mapping: MappingConfiguration = {
    mapping_id: uuidv4(),
    organization_id: organizationId,
    source_id: sourceId,
    inherits_from_template_id: inheritsFromTemplateId,
    name,
    description,
    version: 1,
    is_active: true,
    field_mappings: fieldMappings,
    static_values: staticValues,
    created_at: new Date(),
  };
  mappings.set(mapping.mapping_id, mapping);
  return mapping;
}

export async function getMappings(organizationId: string, sourceId: string): Promise<MappingConfiguration[]> {
  return Array.from(mappings.values())
    .filter(m => m.organization_id === organizationId && m.source_id === sourceId)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
}

export async function getMappingById(organizationId: string, mappingId: string): Promise<MappingConfiguration | null> {
  const mapping = mappings.get(mappingId);
  if (mapping && mapping.organization_id === organizationId) {
    return mapping;
  }
  return null;
}

export async function getActiveMapping(organizationId: string, sourceId: string): Promise<MappingConfiguration | null> {
  const sourceMappings = Array.from(mappings.values())
    .filter(m => m.organization_id === organizationId && m.source_id === sourceId && m.is_active)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  return sourceMappings[0] || null;
}

export async function updateMapping(
  organizationId: string,
  mappingId: string,
  updates: Partial<Pick<MappingConfiguration, 'name' | 'description' | 'field_mappings' | 'static_values' | 'is_active'>>
): Promise<void> {
  const mapping = mappings.get(mappingId);
  if (mapping && mapping.organization_id === organizationId) {
    mappings.set(mappingId, {
      ...mapping,
      ...updates,
      version: mapping.version + 1,
      updated_at: new Date(),
    });
  }
}

// ============================================================
// OAUTH TOKENS (Multi-tenant)
// ============================================================

export async function saveToken(
  organizationId: string,
  token: Omit<OAuthToken, 'token_id' | 'organization_id' | 'created_at'>
): Promise<OAuthToken> {
  // Deactivate existing tokens for this org and realm
  for (const [id, t] of tokens) {
    if (t.organization_id === organizationId && t.realm_id === token.realm_id) {
      tokens.set(id, { ...t, is_active: false });
    }
  }

  const oauthToken: OAuthToken = {
    token_id: uuidv4(),
    organization_id: organizationId,
    ...token,
    created_at: new Date(),
  };
  tokens.set(oauthToken.token_id, oauthToken);
  return oauthToken;
}

export async function getActiveToken(organizationId: string): Promise<OAuthToken | null> {
  const activeTokens = Array.from(tokens.values())
    .filter(t => t.organization_id === organizationId && t.is_active)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  return activeTokens[0] || null;
}

export async function getExpiringTokens(withinMinutes: number): Promise<OAuthToken[]> {
  const threshold = new Date(Date.now() + withinMinutes * 60 * 1000);
  return Array.from(tokens.values())
    .filter(t => t.is_active && t.access_token_expires_at < threshold);
}

export async function updateToken(
  organizationId: string,
  tokenId: string,
  updates: Partial<OAuthToken>
): Promise<void> {
  const token = tokens.get(tokenId);
  if (token && token.organization_id === organizationId) {
    tokens.set(tokenId, { ...token, ...updates, updated_at: new Date() });
  }
}

// ============================================================
// SYNC LOGS (Multi-tenant)
// ============================================================

export async function createSyncLog(
  organizationId: string,
  payloadId: string,
  sourceId: string,
  mappingId?: string
): Promise<SyncLog> {
  const log: SyncLog = {
    log_id: uuidv4(),
    organization_id: organizationId,
    payload_id: payloadId,
    source_id: sourceId,
    mapping_id: mappingId,
    status: 'pending',
    retry_count: 0,
    created_at: new Date(),
  };
  logs.set(log.log_id, log);
  return log;
}

export async function updateSyncLog(
  organizationId: string,
  logId: string,
  updates: Partial<SyncLog>
): Promise<void> {
  const log = logs.get(logId);
  if (log && log.organization_id === organizationId) {
    logs.set(logId, { ...log, ...updates });
  }
}

export async function getSyncLogs(
  organizationId: string,
  limit = 100,
  sourceId?: string
): Promise<SyncLog[]> {
  let result = Array.from(logs.values())
    .filter(l => l.organization_id === organizationId);

  if (sourceId) {
    result = result.filter(l => l.source_id === sourceId);
  }

  return result
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(0, limit);
}

export async function getSyncLogById(organizationId: string, logId: string): Promise<SyncLog | null> {
  const log = logs.get(logId);
  if (log && log.organization_id === organizationId) {
    return log;
  }
  return null;
}

// ============================================================
// ADDITIONAL ADMIN USER FUNCTIONS
// ============================================================

export async function getAdminUsers(): Promise<AdminUser[]> {
  return Array.from(adminUsers.values()).filter(u => u.is_active);
}

export async function getAdminUserById(userId: string): Promise<AdminUser | null> {
  return adminUsers.get(userId) || null;
}

export async function updateAdminLastLogin(userId: string): Promise<void> {
  const user = adminUsers.get(userId);
  if (user) {
    user.last_login_at = new Date();
    adminUsers.set(userId, user);
  }
}

// ============================================================
// ADDITIONAL TEMPLATE & OVERRIDE FUNCTIONS
// ============================================================

export async function getGlobalTemplatesBySourceType(sourceType: string): Promise<GlobalMappingTemplate[]> {
  return Array.from(globalTemplates.values()).filter(t => t.source_type === sourceType);
}

export async function getClientOverridesForSource(organizationId: string, sourceId: string): Promise<ClientMappingOverride[]> {
  return Array.from(clientOverrides.values()).filter(
    o => o.organization_id === organizationId &&
         (o.source_id === sourceId || !o.source_id) // Null source_id = applies to all
  );
}

// ============================================================
// ADDITIONAL TOKEN FUNCTIONS
// ============================================================

export async function getAllActiveTokens(): Promise<OAuthToken[]> {
  return Array.from(tokens.values()).filter(t => t.is_active);
}

export async function getTokensExpiringWithin(minutes: number): Promise<OAuthToken[]> {
  const threshold = new Date(Date.now() + minutes * 60 * 1000);
  return Array.from(tokens.values()).filter(
    t => t.is_active && t.access_token_expires_at < threshold
  );
}

// ============================================================
// API KEYS
// ============================================================

/**
 * Create a new API key
 */
export async function createApiKey(apiKey: ApiKey): Promise<ApiKey> {
  apiKeys.set(apiKey.key_id, apiKey);
  return apiKey;
}

/**
 * Get API key by its hash (for validation)
 */
export async function getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
  for (const key of apiKeys.values()) {
    if (key.key_hash === keyHash) {
      return key;
    }
  }
  return null;
}

/**
 * Get API key by ID
 */
export async function getApiKeyById(keyId: string): Promise<ApiKey | null> {
  return apiKeys.get(keyId) || null;
}

/**
 * Get all API keys for an organization
 */
export async function getApiKeysByOrganization(organizationId: string): Promise<ApiKey[]> {
  return Array.from(apiKeys.values())
    .filter(k => k.organization_id === organizationId)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
}

/**
 * Get all global admin API keys (organization_id IS NULL)
 */
export async function getGlobalApiKeys(): Promise<ApiKey[]> {
  return Array.from(apiKeys.values())
    .filter(k => k.organization_id === null)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
}

/**
 * Update API key fields
 */
export async function updateApiKey(
  keyId: string,
  updates: Partial<Pick<ApiKey, 'is_active' | 'revoked_at' | 'revoked_by' | 'grace_period_ends_at' | 'expires_at'>>
): Promise<void> {
  const key = apiKeys.get(keyId);
  if (!key) return;

  if (updates.is_active !== undefined) key.is_active = updates.is_active;
  if (updates.revoked_at !== undefined) key.revoked_at = updates.revoked_at;
  if (updates.revoked_by !== undefined) key.revoked_by = updates.revoked_by;
  if (updates.grace_period_ends_at !== undefined) key.grace_period_ends_at = updates.grace_period_ends_at;
  if (updates.expires_at !== undefined) key.expires_at = updates.expires_at;

  apiKeys.set(keyId, key);
}

/**
 * Update last_used_at timestamp for an API key
 */
export async function updateApiKeyLastUsed(keyId: string): Promise<void> {
  const key = apiKeys.get(keyId);
  if (key) {
    key.last_used_at = new Date();
    apiKeys.set(keyId, key);
  }
}

// ============================================================
// API USAGE LOGS
// ============================================================

/**
 * Log an API request
 */
export async function logApiUsage(log: ApiUsageLog): Promise<void> {
  apiUsageLogs.set(log.log_id, log);
}

/**
 * Get API usage logs for an organization
 */
export async function getApiUsageLogs(
  organizationId: string,
  options: { limit?: number; offset?: number; startDate?: Date; endDate?: Date } = {}
): Promise<ApiUsageLog[]> {
  const { limit = 100, offset = 0, startDate, endDate } = options;

  let logs = Array.from(apiUsageLogs.values())
    .filter(l => l.organization_id === organizationId);

  if (startDate) {
    logs = logs.filter(l => l.timestamp >= startDate);
  }

  if (endDate) {
    logs = logs.filter(l => l.timestamp <= endDate);
  }

  return logs
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(offset, offset + limit);
}

/**
 * Get API usage statistics for an organization
 */
export async function getApiUsageStats(
  organizationId: string,
  hoursBack: number = 24
): Promise<{
  total_requests: number;
  success_count: number;
  error_count: number;
  avg_response_time_ms: number;
}> {
  const threshold = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const logs = Array.from(apiUsageLogs.values())
    .filter(l => l.organization_id === organizationId && l.timestamp >= threshold);

  if (logs.length === 0) {
    return {
      total_requests: 0,
      success_count: 0,
      error_count: 0,
      avg_response_time_ms: 0,
    };
  }

  const successCount = logs.filter(l => l.status_code < 400).length;
  const errorCount = logs.filter(l => l.status_code >= 400).length;
  const avgResponseTime = logs.reduce((sum, l) => sum + l.response_time_ms, 0) / logs.length;

  return {
    total_requests: logs.length,
    success_count: successCount,
    error_count: errorCount,
    avg_response_time_ms: avgResponseTime,
  };
}
