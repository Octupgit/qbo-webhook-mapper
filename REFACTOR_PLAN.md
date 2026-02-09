# Accounting Integration Service - Python/FastAPI Refactor Plan

## Executive Summary

This document outlines the comprehensive refactoring plan to migrate the `accounting-integration` service from Node.js/Express/TypeScript to Python/FastAPI, aligning with Octup's standard architecture patterns and the Billing - Accounting Integration Service SDD.

**Current State:** Multi-tenant QuickBooks Online webhook mapper built with Node.js/Express
**Target State:** Python/FastAPI service following Octup's DataStore → Service → Route pattern with core submodule integration
**Timeline:** Phased migration with zero downtime

---

## 1. Current Implementation Analysis

### 1.1 Existing Functionality Inventory

#### ✅ **KEEP & MIGRATE (Core Features)**

| Feature | Current Location | Status | Migration Notes |
|---------|-----------------|--------|-----------------|
| **Multi-tenant architecture** | `backend/src/types/multiTenant.ts` | Essential | Migrate to Pydantic models in `core/` |
| **Webhook receiver** | `backend/src/routes/v1/webhook.ts` | Essential | Rewrite as FastAPI router with `AuthenticatedContext` |
| **3-tier mapping hierarchy** | `backend/src/services/mappingMergerService.ts` | Essential | Core business logic - preserve algorithm |
| **Field transformations** | `backend/src/services/transformService.ts` | Essential | Port to Python with same transformation library |
| **QBO OAuth 2.0 flow** | `backend/src/routes/v1/connect.ts` | Essential | Use `authlib` or `intuit-oauth` Python equivalent |
| **Token encryption/refresh** | `backend/src/services/tokenManager.ts` | Essential | Use `cryptography` library (Fernet) |
| **QBO invoice creation** | `backend/src/services/qboInvoiceService.ts` | Essential | Use `intuit-sdk` Python client |
| **QBO data proxy** | `backend/src/routes/v1/proxy.ts` | Essential | FastAPI router with pass-through to QBO API |
| **API key authentication** | `backend/src/services/apiKeyService.ts` | Essential | Migrate to FastAPI dependency injection |
| **Admin authentication** | `backend/src/services/adminAuthService.ts` | Essential | Use JWT with `python-jose` |
| **Audit logging** | `backend/src/services/auditLogService.ts` | Essential | Async queue pattern with `asyncio` |
| **Rate limiting** | `backend/src/middleware/rateLimiter.ts` | Essential | Use `slowapi` (Flask-Limiter for FastAPI) |
| **Connect tokens** | `backend/src/services/connectTokenService.ts` | Essential | Migrate logic to service layer |
| **Sync logs** | `backend/src/types/index.ts` (SyncLog) | Essential | Pydantic model + DataStore |

#### 🔄 **REFACTOR (Needs Adjustments)**

| Feature | Issue | Refactor Plan |
|---------|-------|---------------|
| **BigQuery data layer** | Direct SQL in services | Extract to DataStores inheriting `BaseSQLEngine` |
| **Error handling** | Express-specific middleware | Use FastAPI exception handlers + HTTPException |
| **Mock data service** | `USE_MOCK_DATA` flag with in-memory storage | Replace with pytest fixtures and test database |
| **Frontend integration** | Serves static files from Express | Deploy frontend separately (Vite build to GCS/CDN) |
| **Environment config** | `dotenv` + manual parsing | Use Pydantic `BaseSettings` |
| **Code snippets** | Hardcoded placeholders | Inject real org data from context |
| **CSV export** | Missing implementation | Add pandas-based export endpoints |
| **API usage logging** | Not implemented | Add middleware to log to `api_usage_logs` table |

#### ❌ **DEPRECATE/REMOVE (Redundant)**

| Feature | Reason | Migration Action |
|---------|--------|------------------|
| **Legacy routes** (`/api/webhooks/:sourceId`, `/api/sources`) | Replaced by v1 multi-tenant routes | Remove after confirming no usage |
| **Default organization fallback** | Anti-pattern for multi-tenant system | Require explicit org context |
| **Mock data flag in production** | Not production-ready | Remove, use proper test environment |
| **Concurrently for dev server** | Frontend should be separate deployment | Split into independent services |

---

## 2. Target Architecture

### 2.1 Repository Structure

```
accounting-integration/
├── core/                          # Shared submodule (git submodule)
│   ├── common/
│   │   ├── db/
│   │   │   └── base_sql_engine.py
│   │   ├── models/
│   │   │   └── accounting_models.py    # SQLAlchemy ORM models
│   │   └── pydantic_models/
│   │       └── accounting_schemas.py   # Pydantic DTOs
│   └── accounting_integration/
│       ├── datastores/
│       │   ├── organization_datastore.py
│       │   ├── webhook_datastore.py
│       │   ├── mapping_datastore.py
│       │   ├── oauth_token_datastore.py
│       │   ├── sync_log_datastore.py
│       │   ├── api_key_datastore.py
│       │   └── audit_log_datastore.py
│       └── services/
│           ├── mapping_merger_service.py
│           ├── transform_service.py
│           ├── qbo_invoice_service.py
│           └── token_manager_service.py
├── app/
│   ├── main.py                    # FastAPI app entry point
│   ├── config.py                  # Pydantic Settings
│   ├── dependencies.py            # DI for auth, context
│   ├── routes/
│   │   ├── v1/
│   │   │   ├── webhook.py
│   │   │   ├── connect.py
│   │   │   ├── proxy.py
│   │   │   └── org.py
│   │   ├── admin/
│   │   │   ├── organizations.py
│   │   │   ├── templates.py
│   │   │   ├── auth.py
│   │   │   └── system.py
│   │   └── public.py
│   ├── middleware/
│   │   ├── rate_limiter.py
│   │   ├── audit_logger.py
│   │   └── error_handler.py
│   └── utils/
│       ├── crypto.py              # AES encryption helpers
│       └── oauth_state.py         # HMAC state signing
├── Tests/
│   └── UnitTests/
│       ├── test_datastores/
│       ├── test_services/
│       └── test_routes/
├── alembic/                       # Database migrations
│   ├── versions/
│   └── env.py
├── scripts/
│   ├── generate_api_key.py
│   └── create_admin.py
├── requirements.txt
├── pyproject.toml                 # Ruff, pytest config
├── Dockerfile
├── docker-compose.yml
└── CLAUDE.md
```

### 2.2 Database Layer

**Migration from BigQuery to MySQL (Analytics DB):**

The current implementation uses Google BigQuery. Octup's standard is MySQL with separate RAW and ANALYTICS databases.

**Recommended Approach:**
- Create new schema `accounting_integration` in ANALYTICS DB (`metrics` database)
- Use Alembic for migrations (follow `db-migrator` patterns)
- Preserve all 12 existing tables with SQLAlchemy ORM models

**Schema:** `accounting_integration`

**Tables to Migrate:**

| Table | Partition Strategy | Indexes |
|-------|-------------------|---------|
| `organizations` | None | PRIMARY (org_id), UNIQUE (slug) |
| `admin_users` | None | PRIMARY (user_id), UNIQUE (email) |
| `global_mapping_templates` | None | PRIMARY (template_id), INDEX (source_type, is_active) |
| `client_mapping_overrides` | None | PRIMARY (override_id), INDEX (org_id, source_id) |
| `webhook_sources` | None | PRIMARY (source_id), INDEX (org_id, is_active) |
| `webhook_payloads` | By `received_at` (monthly) | PRIMARY (payload_id), INDEX (org_id, source_id, processed) |
| `mapping_configurations` | None | PRIMARY (mapping_id), INDEX (org_id, source_id, is_active) |
| `oauth_tokens` | None | PRIMARY (token_id), UNIQUE (org_id, realm_id), INDEX (sync_status) |
| `sync_logs` | By `created_at` (monthly) | PRIMARY (log_id), INDEX (org_id, payload_id, status) |
| `api_keys` | None | PRIMARY (key_id), UNIQUE (key_hash), INDEX (org_id, is_active) |
| `api_usage_logs` | By `timestamp` (daily) | PRIMARY (log_id), INDEX (org_id, api_key_id, endpoint) |
| `audit_logs` | By `timestamp` (daily) | PRIMARY (log_id), INDEX (org_id, category, action) |
| `connect_tokens` | None | PRIMARY (token_id), UNIQUE (token_hash), INDEX (org_id, is_active) |

### 2.3 API Architecture

**FastAPI Application Pattern:**

```python
# app/main.py
from fastapi import FastAPI
from app.routes.v1 import webhook, connect, proxy, org
from app.routes.admin import organizations, templates, auth, system
from app.routes import public
from app.middleware.rate_limiter import setup_rate_limiting
from app.middleware.error_handler import add_exception_handlers

app = FastAPI(title="Accounting Integration Service", version="2.0.0")

# Middleware
setup_rate_limiting(app)
add_exception_handlers(app)

# Routes
app.include_router(webhook.router, prefix="/api/v1", tags=["Webhooks"])
app.include_router(connect.router, prefix="/api/v1", tags=["OAuth"])
app.include_router(proxy.router, prefix="/api/v1", tags=["QBO Proxy"])
app.include_router(org.router, prefix="/api/v1", tags=["Organization"])
app.include_router(public.router, prefix="/api/public", tags=["Public"])
app.include_router(auth.router, prefix="/api/admin/auth", tags=["Admin Auth"])
app.include_router(organizations.router, prefix="/api/admin/organizations", tags=["Admin Orgs"])
app.include_router(templates.router, prefix="/api/admin/templates", tags=["Admin Templates"])
app.include_router(system.router, prefix="/api/admin/system", tags=["Admin System"])

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "accounting-integration"}
```

**Authentication Pattern:**

```python
# app/dependencies.py
from fastapi import Depends, HTTPException, Header
from typing import Annotated
from core.accounting_integration.datastores.organization_datastore import OrganizationDataStore
from core.accounting_integration.datastores.api_key_datastore import ApiKeyDataStore

class TenantContext:
    def __init__(self, organization_id: str, organization_slug: str, organization_name: str, plan_tier: str):
        self.organization_id = organization_id
        self.organization_slug = organization_slug
        self.organization_name = organization_name
        self.plan_tier = plan_tier

async def get_tenant_context(client_slug: str) -> TenantContext:
    org_ds = OrganizationDataStore()
    org = await org_ds.get_by_slug(client_slug)
    if not org or not org.is_active:
        raise HTTPException(status_code=404, detail="Organization not found")
    return TenantContext(
        organization_id=org.organization_id,
        organization_slug=org.slug,
        organization_name=org.name,
        plan_tier=org.plan_tier
    )

async def verify_api_key(
    x_api_key: Annotated[str, Header()],
    tenant: Annotated[TenantContext, Depends(get_tenant_context)]
) -> str:
    api_key_ds = ApiKeyDataStore()
    key = await api_key_ds.validate_key(x_api_key)
    if not key or key.organization_id != tenant.organization_id:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return key.key_id
```

**Route Example (Webhook):**

```python
# app/routes/v1/webhook.py
from fastapi import APIRouter, Depends, Header, Request
from typing import Annotated
from app.dependencies import TenantContext, get_tenant_context, verify_api_key
from core.accounting_integration.services.webhook_processor_service import WebhookProcessorService

router = APIRouter()

@router.post("/webhook/{client_slug}")
async def receive_webhook(
    client_slug: str,
    request: Request,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)],
    api_key_id: Annotated[str, Depends(verify_api_key)]
):
    payload = await request.json()
    service = WebhookProcessorService()
    result = await service.process_webhook(
        organization_id=tenant.organization_id,
        api_key_id=api_key_id,
        raw_payload=payload
    )
    return {"success": True, "data": result}
```

---

## 3. Migration Phases

### Phase 1: Foundation (Week 1-2)

**Goal:** Set up Python project structure and core infrastructure

#### 1.1 Project Setup
- [ ] Create Python project structure following Octup patterns
- [ ] Set up `pyproject.toml` with ruff, pytest, mypy
- [ ] Configure `requirements.txt` with FastAPI, SQLAlchemy, Pydantic
- [ ] Set up Alembic for migrations in `alembic/` directory
- [ ] Create `.env.example` with all required environment variables
- [ ] Write Dockerfile (Python 3.12 base, multi-stage build)
- [ ] Update `docker-compose.yml` for local development

**Dependencies:**
```txt
fastapi==0.109.0
uvicorn[standard]==0.27.0
sqlalchemy[asyncio]==2.0.25
aiomysql==0.2.0
pydantic==2.5.3
pydantic-settings==2.1.0
alembic==1.13.1
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.6
slowapi==0.1.9
httpx==0.26.0
authlib==1.3.0
cryptography==42.0.0
pandas==2.2.0
pytest==8.0.0
pytest-asyncio==0.23.3
ruff==0.1.15
```

#### 1.2 Database Migration
- [ ] Create Alembic migration for all 13 tables in `accounting_integration` schema
- [ ] Define SQLAlchemy ORM models in `core/common/models/accounting_models.py`
- [ ] Define Pydantic schemas in `core/common/pydantic_models/accounting_schemas.py`
- [ ] Test migrations in disposable environment
- [ ] Document migration plan for production data (BigQuery → MySQL ETL)

**Files to Create:**
- `alembic/versions/2026-02-10-0001_create_accounting_integration_schema.py`
- `core/common/models/accounting_models.py`
- `core/common/pydantic_models/accounting_schemas.py`

#### 1.3 Configuration & Settings
- [ ] Create `app/config.py` using Pydantic BaseSettings
- [ ] Port all environment variables from Node.js `.env`
- [ ] Add new settings: `DATABASE_URL`, `ANALYTICS_DB_URL`
- [ ] Create settings validation tests

### Phase 2: Core Services (Week 3-4)

**Goal:** Migrate business logic layer

#### 2.1 DataStores
Create DataStores following `BaseSQLEngine` pattern:

- [ ] `OrganizationDataStore` - CRUD for organizations
  - Methods: `get_by_slug()`, `get_by_id()`, `create()`, `update()`, `list_all()`
- [ ] `WebhookDataStore` - Webhook sources and payloads
  - Methods: `get_source_by_api_key()`, `create_payload()`, `mark_processed()`
- [ ] `MappingDataStore` - Mapping configurations, templates, overrides
  - Methods: `get_global_templates()`, `get_client_overrides()`, `get_source_mapping()`
- [ ] `OAuthTokenDataStore` - Token storage and retrieval
  - Methods: `get_valid_token()`, `save_token()`, `mark_revoked()`
- [ ] `SyncLogDataStore` - Sync operation logs
  - Methods: `create_log()`, `update_status()`, `get_by_payload_id()`
- [ ] `ApiKeyDataStore` - API key management
  - Methods: `validate_key()`, `create_key()`, `revoke_key()`
- [ ] `AuditLogDataStore` - Audit logging
  - Methods: `log_event()`, `query_logs()`

**Example DataStore:**
```python
# core/accounting_integration/datastores/organization_datastore.py
from core.common.db.base_sql_engine import BaseSQLEngine, use_server
from core.common.models.accounting_models import Organization
from core.common.pydantic_models.accounting_schemas import OrganizationSchema

class OrganizationDataStore(BaseSQLEngine):
    @use_server(server='analytics')
    async def get_by_slug(self, slug: str) -> OrganizationSchema | None:
        result = await self.execute_query_dict(
            f"SELECT * FROM accounting_integration.organizations WHERE slug = '{slug}' AND is_active = TRUE"
        )
        return OrganizationSchema(**result[0]) if result else None
```

#### 2.2 Core Services
Port business logic services:

- [ ] `MappingMergerService` - 3-tier mapping merge algorithm
  - Methods: `get_effective_mapping()`, `merge_field_mappings()`, `merge_static_values()`
- [ ] `TransformService` - Field transformations
  - Methods: `transform_payload_to_invoice()`, `apply_transformation()`, `validate_qbo_invoice()`
- [ ] `TokenManagerService` - OAuth token lifecycle
  - Methods: `get_valid_token()`, `refresh_token()`, `encrypt_token()`, `decrypt_token()`
- [ ] `QboInvoiceService` - QBO API integration
  - Methods: `create_invoice()`, `get_customer()`, `get_item()`, `execute_with_retry()`
- [ ] `WebhookProcessorService` - End-to-end webhook processing
  - Methods: `process_webhook()`, `sync_to_qbo()`

**Transformation Library Port:**
```python
# core/accounting_integration/services/transform_service.py
from typing import Any

class TransformService:
    TRANSFORMATIONS = {
        'toString': lambda v: str(v) if v is not None else '',
        'toNumber': lambda v: float(v) if v else 0,
        'toUpperCase': lambda v: str(v).upper(),
        'toLowerCase': lambda v: str(v).lower(),
        'trim': lambda v: str(v).strip(),
        'formatDate': lambda v: self._format_date(v),
    }

    @staticmethod
    def apply_transformation(value: Any, transformation: str) -> Any:
        if ':' in transformation:
            parts = transformation.split(':')
            transform_name = parts[0]
            args = parts[1:]

            if transform_name == 'concat':
                prefix = args[0] if len(args) > 0 else ''
                suffix = args[1] if len(args) > 1 else ''
                return f"{prefix}{value}{suffix}"
            elif transform_name == 'multiply':
                factor = float(args[0])
                return float(value) * factor
            elif transform_name == 'substring':
                start = int(args[0])
                end = int(args[1]) if len(args) > 1 else None
                return str(value)[start:end]
            elif transform_name == 'replace':
                old = args[0]
                new = args[1] if len(args) > 1 else ''
                return str(value).replace(old, new)
            elif transform_name == 'default':
                return value if value else args[0]
            elif transform_name == 'split':
                delimiter = args[0]
                index = int(args[1])
                return str(value).split(delimiter)[index]
        else:
            transform_fn = TransformService.TRANSFORMATIONS.get(transformation)
            return transform_fn(value) if transform_fn else value
```

### Phase 3: API Routes (Week 5-6)

**Goal:** Build FastAPI routes

#### 3.1 Public & Health Routes
- [ ] `app/routes/public.py` - Public org info, connect token validation
- [ ] Health check endpoints (`/health`, `/api/health`)

#### 3.2 V1 Routes
- [ ] `app/routes/v1/webhook.py` - Webhook receiver
  - POST `/api/v1/webhook/{client_slug}`
  - POST `/api/v1/webhook/{client_slug}/{source_id}`
  - GET `/api/v1/webhook/{client_slug}/sources`
  - POST `/api/v1/webhook/{client_slug}/sources`
- [ ] `app/routes/v1/connect.py` - OAuth flow
  - GET `/api/v1/connect/{client_slug}`
  - GET `/api/v1/connect/token/{token_hash}`
  - GET `/api/v1/oauth/callback`
- [ ] `app/routes/v1/org.py` - Org management
  - GET `/api/v1/org/{client_slug}/status`
  - GET `/api/v1/org/{client_slug}/health`
  - POST `/api/v1/org/{client_slug}/disconnect`
  - GET `/api/v1/org/{client_slug}/qbo/customers`
  - GET `/api/v1/org/{client_slug}/qbo/items`
- [ ] `app/routes/v1/proxy.py` - QBO data proxy
  - GET `/api/v1/org/{client_slug}/proxy/data`
  - GET `/api/v1/org/{client_slug}/proxy/data/{type}/{id}`
  - GET `/api/v1/org/{client_slug}/proxy/types`

#### 3.3 Admin Routes
- [ ] `app/routes/admin/auth.py` - Admin authentication
  - POST `/api/admin/auth/login`
  - POST `/api/admin/auth/logout`
  - POST `/api/admin/auth/change-password`
- [ ] `app/routes/admin/organizations.py` - Org management
  - GET/POST `/api/admin/organizations`
  - GET/PUT/DELETE `/api/admin/organizations/{id}`
  - GET/POST `/api/admin/organizations/{id}/api-keys`
  - GET/POST `/api/admin/organizations/{id}/connect-tokens`
  - GET/PUT `/api/admin/organizations/{id}/overrides`
- [ ] `app/routes/admin/templates.py` - Global templates
  - GET/POST `/api/admin/templates`
  - GET/PUT/DELETE `/api/admin/templates/{id}`
- [ ] `app/routes/admin/system.py` - System monitoring
  - GET `/api/admin/system/stats`
  - GET `/api/admin/audit-logs`

### Phase 4: Middleware & Cross-Cutting Concerns (Week 7)

**Goal:** Implement middleware and utilities

#### 4.1 Middleware
- [ ] `app/middleware/rate_limiter.py` - Rate limiting with slowapi
- [ ] `app/middleware/audit_logger.py` - Async audit logging queue
- [ ] `app/middleware/error_handler.py` - Global exception handlers

**Rate Limiting Example:**
```python
# app/middleware/rate_limiter.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request

limiter = Limiter(key_func=get_remote_address)

def setup_rate_limiting(app):
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

#### 4.2 Utilities
- [ ] `app/utils/crypto.py` - AES encryption for tokens (use `cryptography.fernet`)
- [ ] `app/utils/oauth_state.py` - HMAC state signing/verification
- [ ] `app/utils/api_key_generator.py` - Secure API key generation

#### 4.3 Dependencies
- [ ] `app/dependencies.py` - FastAPI dependency injection
  - `get_tenant_context()` - Resolve org from slug
  - `verify_api_key()` - Validate API key
  - `get_admin_user()` - Verify JWT token
  - `require_plan_tier()` - Plan tier gating

### Phase 5: Testing (Week 8)

**Goal:** Comprehensive test coverage

#### 5.1 Unit Tests
- [ ] `Tests/UnitTests/test_datastores/` - DataStore tests with test DB
- [ ] `Tests/UnitTests/test_services/` - Service layer tests with mocked DataStores
- [ ] `Tests/UnitTests/test_utils/` - Crypto, transformations, validators

#### 5.2 Integration Tests
- [ ] `Tests/UnitTests/test_routes/` - Route tests with TestClient
- [ ] End-to-end webhook flow test
- [ ] OAuth flow test (mocked Intuit OAuth)
- [ ] Token refresh flow test

**Test Structure:**
```python
# Tests/UnitTests/test_services/test_transform_service.py
import pytest
from core.accounting_integration.services.transform_service import TransformService

@pytest.mark.parametrize("value,transformation,expected", [
    ("hello", "toUpperCase", "HELLO"),
    ("  test  ", "trim", "test"),
    ("abc", "concat:prefix-::-suffix", "prefix-abc-suffix"),
    (10, "multiply:2.5", 25.0),
])
def test_apply_transformation(value, transformation, expected):
    result = TransformService.apply_transformation(value, transformation)
    assert result == expected
```

### Phase 6: Migration & Deployment (Week 9-10)

**Goal:** Production deployment with zero downtime

#### 6.1 Data Migration
- [ ] Write BigQuery → MySQL ETL script
- [ ] Test data migration in staging
- [ ] Plan production migration window
- [ ] Execute migration with validation

#### 6.2 Deployment
- [ ] Build Docker image for Python service
- [ ] Deploy to Cloud Run alongside Node.js version
- [ ] Configure Cloud Load Balancer for blue-green deployment
- [ ] Update DNS/routing to Python service
- [ ] Monitor error rates and performance
- [ ] Deprecate Node.js service after 2-week validation

#### 6.3 Documentation
- [ ] Write `CLAUDE.md` for accounting-integration repo
- [ ] Update API documentation
- [ ] Create migration runbook
- [ ] Document new environment variables

---

## 4. Key Technical Decisions

### 4.1 Database Choice

**Decision:** Migrate from BigQuery to MySQL (Analytics DB)

**Rationale:**
- Aligns with Octup's standard infrastructure
- Lower latency for transactional operations (webhook processing)
- Easier local development with Docker
- Cost-effective for current scale

**Migration Path:**
- Export BigQuery tables to CSV
- Import to MySQL with Alembic-managed schema
- Validate data integrity

### 4.2 OAuth Library

**Decision:** Use `authlib` for QuickBooks OAuth 2.0

**Rationale:**
- Industry-standard Python OAuth library
- Supports OAuth 2.0 with PKCE
- Active maintenance and documentation
- Compatible with Intuit's OAuth implementation

**Alternative:** `intuitlib` (unofficial) - less mature

### 4.3 Token Encryption

**Decision:** Use `cryptography.fernet` (AES-128-CBC with HMAC)

**Rationale:**
- Part of `cryptography` library (widely trusted)
- Symmetric encryption (matches current CryptoJS approach)
- Built-in key derivation and authentication
- Drop-in replacement for current implementation

### 4.4 Rate Limiting

**Decision:** Use `slowapi` (FastAPI port of Flask-Limiter)

**Rationale:**
- Native FastAPI integration
- Supports multiple storage backends (memory, Redis)
- Per-route and per-key limiting
- Drop-in replacement for express-rate-limit

### 4.5 Async DB Driver

**Decision:** Use `aiomysql` with SQLAlchemy 2.0 async

**Rationale:**
- Matches Octup's async DB pattern
- Compatible with BaseSQLEngine
- High performance for concurrent webhook processing

---

## 5. High-Level Code Samples

### 5.1 Webhook Processing Service

```python
# core/accounting_integration/services/webhook_processor_service.py
from core.accounting_integration.datastores.webhook_datastore import WebhookDataStore
from core.accounting_integration.datastores.sync_log_datastore import SyncLogDataStore
from core.accounting_integration.services.mapping_merger_service import MappingMergerService
from core.accounting_integration.services.transform_service import TransformService
from core.accounting_integration.services.qbo_invoice_service import QboInvoiceService
from core.accounting_integration.services.token_manager_service import TokenManagerService

class WebhookProcessorService:
    def __init__(self):
        self.webhook_ds = WebhookDataStore()
        self.sync_log_ds = SyncLogDataStore()
        self.mapping_merger = MappingMergerService()
        self.transform_svc = TransformService()
        self.qbo_svc = QboInvoiceService()
        self.token_mgr = TokenManagerService()

    async def process_webhook(
        self,
        organization_id: str,
        source_id: str,
        raw_payload: dict
    ) -> dict:
        payload_id = await self.webhook_ds.create_payload(
            organization_id=organization_id,
            source_id=source_id,
            raw_payload=raw_payload
        )

        merged_mapping = await self.mapping_merger.get_effective_mapping(
            organization_id=organization_id,
            source_id=source_id
        )

        if not merged_mapping:
            return {"payloadId": payload_id, "processed": False, "reason": "NO_MAPPING"}

        token_result = await self.token_mgr.get_valid_token(organization_id)
        if token_result.get("error"):
            return {"payloadId": payload_id, "processed": False, "reason": "QBO_NOT_CONNECTED"}

        log_id = await self.sync_log_ds.create_log(
            organization_id=organization_id,
            payload_id=payload_id,
            source_id=source_id,
            status="pending"
        )

        try:
            qbo_invoice = await self.transform_svc.transform_payload_to_invoice(
                payload=raw_payload,
                mapping=merged_mapping
            )

            invoice_result = await self.qbo_svc.create_invoice(
                organization_id=organization_id,
                invoice_data=qbo_invoice,
                access_token=token_result["access_token"]
            )

            await self.sync_log_ds.update_status(
                log_id=log_id,
                status="success",
                qbo_invoice_id=invoice_result["Id"],
                response_payload=invoice_result
            )

            await self.webhook_ds.mark_processed(
                payload_id=payload_id,
                invoice_id=invoice_result["Id"]
            )

            return {
                "payloadId": payload_id,
                "processed": True,
                "invoiceId": invoice_result["Id"],
                "logId": log_id
            }

        except Exception as e:
            await self.sync_log_ds.update_status(
                log_id=log_id,
                status="failed",
                error_message=str(e)
            )
            raise
```

### 5.2 Mapping Merger Service

```python
# core/accounting_integration/services/mapping_merger_service.py
from core.accounting_integration.datastores.mapping_datastore import MappingDataStore
from core.common.pydantic_models.accounting_schemas import MergedMapping, FieldMapping

class MappingMergerService:
    def __init__(self):
        self.mapping_ds = MappingDataStore()

    async def get_effective_mapping(
        self,
        organization_id: str,
        source_id: str
    ) -> MergedMapping | None:
        source = await self.mapping_ds.get_source(source_id)
        source_type = source.source_type

        global_templates = await self.mapping_ds.get_global_templates(
            source_type=source_type,
            is_active=True
        )

        client_overrides = await self.mapping_ds.get_client_overrides(
            organization_id=organization_id,
            source_id=source_id,
            is_active=True
        )

        source_mapping = await self.mapping_ds.get_source_mapping(
            source_id=source_id,
            is_active=True
        )

        all_layers = global_templates + client_overrides + ([source_mapping] if source_mapping else [])

        if not all_layers:
            return None

        all_layers.sort(key=lambda x: x.priority)

        merged_fields = self._merge_field_mappings([layer.field_mappings for layer in all_layers])
        merged_static = self._merge_static_values([layer.static_values for layer in all_layers])

        return MergedMapping(
            field_mappings=merged_fields,
            static_values=merged_static,
            source_layers=[layer.template_id or layer.mapping_id for layer in all_layers]
        )

    def _merge_field_mappings(self, layers: list[list[FieldMapping]]) -> list[FieldMapping]:
        field_map = {}
        for layer in layers:
            for mapping in layer:
                field_map[mapping.qbo_field] = mapping
        return list(field_map.values())

    def _merge_static_values(self, layers: list[dict]) -> dict:
        merged = {}
        for layer in layers:
            merged.update(layer or {})
        return merged
```

### 5.3 OAuth Flow Route

```python
# app/routes/v1/connect.py
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from typing import Annotated
from app.dependencies import TenantContext, get_tenant_context
from core.accounting_integration.services.token_manager_service import TokenManagerService
from app.utils.oauth_state import generate_state, verify_state
from authlib.integrations.httpx_client import AsyncOAuth2Client
from app.config import settings

router = APIRouter()

@router.get("/connect/{client_slug}")
async def initiate_oauth(
    client_slug: str,
    tenant: Annotated[TenantContext, Depends(get_tenant_context)]
):
    state = generate_state(
        org_id=tenant.organization_id,
        slug=tenant.organization_slug,
        source="admin"
    )

    client = AsyncOAuth2Client(
        client_id=settings.QBO_CLIENT_ID,
        client_secret=settings.QBO_CLIENT_SECRET,
        redirect_uri=settings.QBO_REDIRECT_URI
    )

    authorization_url, state = client.create_authorization_url(
        "https://appcenter.intuit.com/connect/oauth2",
        scope="com.intuit.quickbooks.accounting",
        state=state
    )

    return RedirectResponse(url=authorization_url)

@router.get("/oauth/callback")
async def oauth_callback(code: str, state: str, realmId: str):
    state_data = verify_state(state)

    if not state_data:
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    client = AsyncOAuth2Client(
        client_id=settings.QBO_CLIENT_ID,
        client_secret=settings.QBO_CLIENT_SECRET,
        redirect_uri=settings.QBO_REDIRECT_URI
    )

    token = await client.fetch_token(
        "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
        code=code
    )

    token_mgr = TokenManagerService()
    await token_mgr.save_token(
        organization_id=state_data["org_id"],
        realm_id=realmId,
        access_token=token["access_token"],
        refresh_token=token["refresh_token"],
        expires_in=token["expires_in"]
    )

    return RedirectResponse(
        url=f"{settings.FRONTEND_URL}/?connected=true&realmId={realmId}"
    )
```

---

## 6. Migration Checklist

### Pre-Migration
- [ ] SDD document fully reviewed and aligned
- [ ] All stakeholders briefed on migration plan
- [ ] Test environment provisioned (MySQL, Cloud Run)
- [ ] Monitoring and alerting configured

### Development Phase
- [ ] Phase 1: Foundation complete ✓
- [ ] Phase 2: Core Services complete ✓
- [ ] Phase 3: API Routes complete ✓
- [ ] Phase 4: Middleware complete ✓
- [ ] Phase 5: Testing complete ✓
- [ ] Code review completed
- [ ] Performance testing passed

### Data Migration
- [ ] BigQuery export completed
- [ ] MySQL import completed
- [ ] Data validation passed (row counts, checksums)
- [ ] Rollback plan tested

### Deployment
- [ ] Docker image built and pushed
- [ ] Staging deployment successful
- [ ] Staging validation complete
- [ ] Production deployment scheduled
- [ ] Blue-green deployment configured
- [ ] DNS cutover planned

### Post-Migration
- [ ] Production validation (API health checks)
- [ ] Error rate monitoring (<1% threshold)
- [ ] Performance benchmarks met (p95 latency <500ms)
- [ ] 2-week observation period complete
- [ ] Node.js service decommissioned
- [ ] Documentation updated

---

## 7. Risk Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Data loss during migration | High | Low | Multi-stage validation, rollback plan, BigQuery retention |
| OAuth flow breakage | High | Medium | Extensive testing with sandbox QBO account, gradual rollout |
| Performance regression | Medium | Medium | Load testing, gradual traffic shift, monitoring |
| API contract changes | Medium | Low | Maintain exact API compatibility, version all endpoints |
| Token encryption incompatibility | High | Low | Test decryption of existing tokens, dual-write period |
| Missing functionality | Medium | Medium | Comprehensive feature parity checklist, user acceptance testing |

---

## 8. Success Criteria

✅ **Functional:**
- All 40+ API endpoints migrated with exact contract compatibility
- Webhook processing latency <2s (p95)
- OAuth flow success rate >99%
- Token refresh success rate >99%
- Zero data loss during migration

✅ **Technical:**
- Test coverage >80%
- Ruff linting passes with zero errors
- Type checking passes with mypy
- All DataStores follow BaseSQLEngine pattern
- All routes use FastAPI dependency injection

✅ **Operational:**
- Zero-downtime deployment
- Error rate <0.5% during migration
- Monitoring dashboards operational
- Runbooks documented
- On-call rotation trained

---

## 9. Next Steps

1. **Get SDD Approval:** Obtain and review the full SDD document from Confluence
2. **Refine Plan:** Adjust this plan based on SDD requirements
3. **Stakeholder Sign-off:** Get approval from team leads and product
4. **Kick-off Phase 1:** Begin foundation work (estimated start: Week of Feb 10, 2026)
5. **Weekly Check-ins:** Review progress and blockers every Friday

---

## Appendix A: Environment Variables

```bash
# Database
DATABASE_URL=mysql+aiomysql://user:pass@host:3306/analytics
ANALYTICS_DB_URL=mysql+aiomysql://user:pass@host:3306/analytics

# QuickBooks OAuth
QBO_CLIENT_ID=your-client-id
QBO_CLIENT_SECRET=your-client-secret
QBO_REDIRECT_URI=https://your-domain.com/api/v1/oauth/callback
QBO_ENVIRONMENT=sandbox  # or production

# Security
ENCRYPTION_KEY=32-character-secret-key-for-aes
JWT_SECRET=your-jwt-secret
OAUTH_STATE_SECRET=your-state-signing-secret

# API
API_BASE_URL=https://api.your-domain.com
FRONTEND_URL=https://app.your-domain.com
ALLOWED_ORIGINS=https://app.your-domain.com,http://localhost:5173

# Service
PORT=8080
ENVIRONMENT=production  # or development
LOG_LEVEL=INFO
```

---

## Appendix B: File Mapping (Node.js → Python)

| Current (Node.js) | Target (Python) |
|-------------------|-----------------|
| `backend/src/index.ts` | `app/main.py` |
| `backend/src/config/bigquery.ts` | `core/common/db/base_sql_engine.py` |
| `backend/src/services/dataService.ts` | `core/accounting_integration/datastores/*.py` |
| `backend/src/services/mappingMergerService.ts` | `core/accounting_integration/services/mapping_merger_service.py` |
| `backend/src/services/transformService.ts` | `core/accounting_integration/services/transform_service.py` |
| `backend/src/services/qboInvoiceService.ts` | `core/accounting_integration/services/qbo_invoice_service.py` |
| `backend/src/services/tokenManager.ts` | `core/accounting_integration/services/token_manager_service.py` |
| `backend/src/routes/v1/webhook.ts` | `app/routes/v1/webhook.py` |
| `backend/src/routes/v1/connect.ts` | `app/routes/v1/connect.py` |
| `backend/src/routes/v1/proxy.ts` | `app/routes/v1/proxy.py` |
| `backend/src/routes/admin/*.ts` | `app/routes/admin/*.py` |
| `backend/src/middleware/errorHandler.ts` | `app/middleware/error_handler.py` |
| `backend/src/middleware/rateLimiter.ts` | `app/middleware/rate_limiter.py` |
| `backend/src/types/index.ts` | `core/common/pydantic_models/accounting_schemas.py` |

---

**Document Version:** 1.0
**Last Updated:** 2026-02-10
**Author:** Claude Opus 4.6
**Status:** Draft - Awaiting SDD Review
