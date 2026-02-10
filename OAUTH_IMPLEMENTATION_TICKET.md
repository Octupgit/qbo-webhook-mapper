# Implement QuickBooks OAuth Flow

## Epic
OD-7739 - QBO - Endpoints

## Story
As a partner, I want to connect my QuickBooks Online account to Octup's Accounting Integration Service so that I can sync invoices to QuickBooks.

## Problem Statement
The accounting strategy pattern (OD-7828) is complete, but there's no way for partners to authenticate with QuickBooks. We need to implement the OAuth 2.0 flow using the official Intuit Python SDK to establish and store the connection.

## Acceptance Criteria

### OAuth Flow
- [ ] Partner can initiate OAuth flow by visiting `/api/v1/oauth/quickbooks/connect/{organization_id}`
- [ ] User is redirected to QuickBooks authorization page with correct scopes
- [ ] OAuth callback at `/api/v1/oauth/quickbooks/callback` exchanges code for tokens
- [ ] Access token (60 min) and refresh token (100 days) are encrypted and stored
- [ ] Connection status can be queried at `/api/v1/oauth/quickbooks/status/{organization_id}`
- [ ] Partner can disconnect at `/api/v1/oauth/quickbooks/disconnect/{organization_id}`

### Token Management
- [ ] Tokens are encrypted using Fernet before storage
- [ ] Token refresh is automatic when expired (with 5-minute buffer)
- [ ] Refresh token rotation is handled correctly

### Database
- [ ] Alembic migration creates `oauth_tokens` table
- [ ] OAuth tokens are stored per organization
- [ ] Only one active token per organization (unique constraint)

### Error Handling
- [ ] Invalid/expired state parameter returns 400 error
- [ ] Missing realmId returns 400 error
- [ ] Token refresh failure marks token as inactive and returns error
- [ ] All errors return structured JSON responses

### Security
- [ ] State parameter is HMAC-signed with 10-minute expiration
- [ ] State verification prevents CSRF attacks
- [ ] Tokens are never returned in API responses (only status)
- [ ] Rate limiting applied to OAuth endpoints

---

## Technical Implementation

### 1. Update QuickBooksStrategy to Use Intuit SDK

**File**: `app/strategies/quickbooks_strategy.py`

**Changes**:
- Replace `authlib` with `intuitlib` (Python SDK)
- Update `get_authorization_url()` to use SDK's OAuth2 client
- Update `handle_callback()` to use SDK's token exchange
- Update `get_valid_token()` to use SDK's refresh mechanism

**Intuit SDK Setup**:
```python
from intuitlib.client import AuthClient
from intuitlib.enums import Scopes

# Initialize client
auth_client = AuthClient(
    client_id=settings.QBO_CLIENT_ID,
    client_secret=settings.QBO_CLIENT_SECRET,
    redirect_uri=settings.QBO_REDIRECT_URI,
    environment=settings.QBO_ENVIRONMENT  # 'sandbox' or 'production'
)

# Get authorization URL
auth_url = auth_client.get_authorization_url([Scopes.ACCOUNTING])

# Exchange code for tokens
auth_client.get_bearer_token(auth_code, realm_id=realm_id)
access_token = auth_client.access_token
refresh_token = auth_client.refresh_token
expires_in = auth_client.expires_in

# Refresh token
auth_client.refresh(refresh_token=refresh_token)
```

---

### 2. Create Database Migration

**File**: `app/alembic/versions/2026-02-10-1400_create_oauth_tokens_table.py`

**Schema**: `accounting` (new schema for accounting integration app)

**Table**: `oauth_tokens`

```sql
CREATE TABLE oauth_tokens (
    token_id VARCHAR(36) PRIMARY KEY,  -- UUID
    organization_id VARCHAR(36) NOT NULL,  -- Octup organization ID
    accounting_system VARCHAR(50) NOT NULL,  -- 'quickbooks', 'xero', etc.
    realm_id VARCHAR(100) NOT NULL,  -- QBO company ID
    access_token TEXT NOT NULL,  -- Encrypted
    refresh_token TEXT NOT NULL,  -- Encrypted
    access_token_expires_at TIMESTAMP NOT NULL,
    refresh_token_expires_at TIMESTAMP NOT NULL,
    is_active TINYINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_org_system_active (organization_id, accounting_system, is_active),
    INDEX idx_organization (organization_id),
    INDEX idx_realm (realm_id),
    INDEX idx_expires (access_token_expires_at)
);
```

**Alembic Setup**:
- Create `app/alembic/` directory structure
- Create `alembic.ini` configuration
- Create `alembic/env.py` with async engine support
- Create `alembic/versions/` directory

---

### 3. Create OAuthToken Model

**File**: `app/models/oauth.py`

```python
from datetime import datetime
from pydantic import BaseModel, Field

class OAuthToken(BaseModel):
    token_id: str
    organization_id: str
    accounting_system: str
    realm_id: str
    access_token: str  # Encrypted
    refresh_token: str  # Encrypted
    access_token_expires_at: datetime
    refresh_token_expires_at: datetime
    is_active: bool
    created_at: datetime
    updated_at: datetime

class OAuthTokenCreate(BaseModel):
    organization_id: str
    accounting_system: str
    realm_id: str
    access_token: str
    refresh_token: str
    access_token_expires_at: datetime
    refresh_token_expires_at: datetime

class OAuthConnectionStatus(BaseModel):
    connected: bool
    accounting_system: str | None = None
    realm_id: str | None = None
    company_name: str | None = None
    expires_at: datetime | None = None
    is_expired: bool = False
```

---

### 4. Create OAuthTokenDataStore

**File**: `app/datastores/oauth_token_datastore.py`

**Note**: Use direct SQLAlchemy with async, not BaseSQLEngine (since core submodule is for octiAPI/OctupAirflow)

```python
from datetime import datetime
from sqlalchemy import select, update, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.oauth import OAuthToken, OAuthTokenCreate
from app.db.session import get_session

class OAuthTokenDataStore:
    async def get_active_token(
        self, organization_id: str, accounting_system: str
    ) -> OAuthToken | None:
        """Get active OAuth token for organization."""
        async with get_session() as session:
            result = await session.execute(
                select(oauth_tokens_table)
                .where(
                    and_(
                        oauth_tokens_table.c.organization_id == organization_id,
                        oauth_tokens_table.c.accounting_system == accounting_system,
                        oauth_tokens_table.c.is_active == True
                    )
                )
            )
            row = result.fetchone()
            return OAuthToken(**dict(row)) if row else None

    async def create_token(self, token: OAuthTokenCreate) -> OAuthToken:
        """Create new OAuth token."""
        # Implementation details

    async def update_token(
        self, token_id: str,
        access_token: str,
        refresh_token: str,
        access_token_expires_at: datetime,
        refresh_token_expires_at: datetime
    ) -> None:
        """Update token after refresh."""
        # Implementation details

    async def deactivate_token(self, token_id: str) -> None:
        """Mark token as inactive (disconnect)."""
        # Implementation details
```

---

### 5. Create Database Session Manager

**File**: `app/db/session.py`

```python
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from app.config import settings

engine: AsyncEngine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.ENVIRONMENT == "development",
    pool_pre_ping=True,
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

@asynccontextmanager
async def get_session():
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```

**File**: `app/db/tables.py`

```python
from sqlalchemy import Table, Column, String, Text, DateTime, Boolean, MetaData

metadata = MetaData()

oauth_tokens_table = Table(
    "oauth_tokens",
    metadata,
    Column("token_id", String(36), primary_key=True),
    Column("organization_id", String(36), nullable=False),
    Column("accounting_system", String(50), nullable=False),
    Column("realm_id", String(100), nullable=False),
    Column("access_token", Text, nullable=False),
    Column("refresh_token", Text, nullable=False),
    Column("access_token_expires_at", DateTime, nullable=False),
    Column("refresh_token_expires_at", DateTime, nullable=False),
    Column("is_active", Boolean, nullable=False, default=True),
    Column("created_at", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
)
```

---

### 6. Create OAuthService

**File**: `app/services/oauth_service.py`

```python
from datetime import datetime, timedelta
from app.strategies import AccountingSystemFactory, AccountingSystem
from app.datastores.oauth_token_datastore import OAuthTokenDataStore
from app.utils.crypto import encrypt_token, decrypt_token
from app.utils.oauth_state import generate_state, verify_state
from app.models.oauth import OAuthConnectionStatus

class OAuthService:
    def __init__(self):
        self.token_ds = OAuthTokenDataStore()

    async def initiate_oauth(
        self, organization_id: str, accounting_system: str
    ) -> str:
        """
        Initiate OAuth flow.

        Returns authorization URL to redirect user to.
        """
        strategy = AccountingSystemFactory.get_strategy(accounting_system)

        # Generate signed state
        state = generate_state(
            organization_id=organization_id,
            accounting_system=accounting_system
        )

        # Get authorization URL from strategy
        result = await strategy.get_authorization_url(
            organization_id=organization_id,
            state=state,
            redirect_uri=settings.QBO_REDIRECT_URI
        )

        return result.url

    async def handle_callback(
        self, code: str, state: str, realm_id: str
    ) -> OAuthConnectionStatus:
        """
        Handle OAuth callback.

        Verifies state, exchanges code for tokens, encrypts and stores them.
        """
        # Verify state
        state_data = verify_state(state)
        if not state_data:
            raise ValueError("Invalid or expired state parameter")

        organization_id = state_data["organization_id"]
        accounting_system = state_data["accounting_system"]

        # Get strategy
        strategy = AccountingSystemFactory.get_strategy(accounting_system)

        # Exchange code for tokens
        result = await strategy.handle_callback(
            code=code,
            state=state,
            realm_id=realm_id,
            redirect_uri=settings.QBO_REDIRECT_URI
        )

        # Encrypt tokens
        encrypted_access = encrypt_token(result.access_token)
        encrypted_refresh = encrypt_token(result.refresh_token)

        # Calculate expiration times
        access_expires = datetime.utcnow() + timedelta(seconds=result.expires_in)
        refresh_expires = datetime.utcnow() + timedelta(days=100)  # QBO: 100 days

        # Deactivate any existing tokens for this org
        existing = await self.token_ds.get_active_token(organization_id, accounting_system)
        if existing:
            await self.token_ds.deactivate_token(existing.token_id)

        # Store new token
        token = await self.token_ds.create_token(
            OAuthTokenCreate(
                organization_id=organization_id,
                accounting_system=accounting_system,
                realm_id=realm_id,
                access_token=encrypted_access,
                refresh_token=encrypted_refresh,
                access_token_expires_at=access_expires,
                refresh_token_expires_at=refresh_expires
            )
        )

        return OAuthConnectionStatus(
            connected=True,
            accounting_system=accounting_system,
            realm_id=realm_id,
            expires_at=access_expires
        )

    async def get_connection_status(
        self, organization_id: str, accounting_system: str
    ) -> OAuthConnectionStatus:
        """Get OAuth connection status."""
        token = await self.token_ds.get_active_token(organization_id, accounting_system)

        if not token:
            return OAuthConnectionStatus(connected=False)

        is_expired = token.access_token_expires_at < datetime.utcnow()

        return OAuthConnectionStatus(
            connected=True,
            accounting_system=accounting_system,
            realm_id=token.realm_id,
            expires_at=token.access_token_expires_at,
            is_expired=is_expired
        )

    async def disconnect(
        self, organization_id: str, accounting_system: str
    ) -> None:
        """Disconnect OAuth connection."""
        token = await self.token_ds.get_active_token(organization_id, accounting_system)
        if token:
            await self.token_ds.deactivate_token(token.token_id)
```

---

### 7. Create OAuth Routes

**File**: `app/routes/oauth.py`

```python
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse
from app.services.oauth_service import OAuthService
from app.models.oauth import OAuthConnectionStatus
from app.common.logging.json_logger import setup_logger

router = APIRouter(prefix="/api/v1/oauth", tags=["OAuth"])
logger = setup_logger()

@router.get("/quickbooks/connect/{organization_id}")
async def initiate_quickbooks_oauth(organization_id: str) -> RedirectResponse:
    """
    Initiate QuickBooks OAuth flow.

    Redirects user to QuickBooks authorization page.
    """
    try:
        oauth_service = OAuthService()
        auth_url = await oauth_service.initiate_oauth(
            organization_id=organization_id,
            accounting_system="quickbooks"
        )
        return RedirectResponse(url=auth_url)
    except Exception as e:
        logger.error(f"Failed to initiate OAuth: {e}")
        raise HTTPException(status_code=500, detail="Failed to initiate OAuth flow")

@router.get("/quickbooks/callback")
async def quickbooks_oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    realmId: str = Query(...)
) -> dict:
    """
    Handle QuickBooks OAuth callback.

    Exchanges authorization code for tokens and stores them.
    """
    try:
        oauth_service = OAuthService()
        status = await oauth_service.handle_callback(
            code=code,
            state=state,
            realm_id=realmId
        )

        # Redirect to frontend with success
        frontend_url = settings.FRONTEND_URL or "http://localhost:5173"
        redirect_url = f"{frontend_url}/settings/integrations?connected=true&system=quickbooks"

        return RedirectResponse(url=redirect_url)

    except ValueError as e:
        logger.error(f"OAuth callback validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        raise HTTPException(status_code=500, detail="Failed to complete OAuth flow")

@router.get("/quickbooks/status/{organization_id}")
async def get_quickbooks_status(organization_id: str) -> OAuthConnectionStatus:
    """Get QuickBooks connection status for organization."""
    try:
        oauth_service = OAuthService()
        return await oauth_service.get_connection_status(
            organization_id=organization_id,
            accounting_system="quickbooks"
        )
    except Exception as e:
        logger.error(f"Failed to get OAuth status: {e}")
        raise HTTPException(status_code=500, detail="Failed to get connection status")

@router.post("/quickbooks/disconnect/{organization_id}")
async def disconnect_quickbooks(organization_id: str) -> dict:
    """Disconnect QuickBooks integration."""
    try:
        oauth_service = OAuthService()
        await oauth_service.disconnect(
            organization_id=organization_id,
            accounting_system="quickbooks"
        )
        return {"success": True, "message": "Disconnected successfully"}
    except Exception as e:
        logger.error(f"Failed to disconnect: {e}")
        raise HTTPException(status_code=500, detail="Failed to disconnect")
```

**File**: `app/routes/__init__.py`

```python
from app.routes.oauth import router as oauth_router

routers = [oauth_router]
```

---

### 8. Update Configuration

**File**: `app/config.py`

Add:
```python
DATABASE_URL: str = "mysql+aiomysql://user:pass@localhost/accounting_integration"
FRONTEND_URL: str = "http://localhost:5173"
```

**File**: `app/.env.example`

```bash
# Server
PORT=8080
ENVIRONMENT=development
LOG_LEVEL=INFO

# QuickBooks OAuth
QBO_CLIENT_ID=your_client_id_here
QBO_CLIENT_SECRET=your_client_secret_here
QBO_ENVIRONMENT=sandbox  # or production
QBO_REDIRECT_URI=http://localhost:8080/api/v1/oauth/quickbooks/callback

# Security
ENCRYPTION_KEY=generate_32_byte_fernet_key_here
OAUTH_STATE_SECRET=random_secret_for_hmac_signing

# Database
DATABASE_URL=mysql+aiomysql://root:password@localhost/accounting_integration

# Frontend
FRONTEND_URL=http://localhost:5173
```

---

### 9. Update Dependencies

**File**: `app/requirements.txt`

Replace `authlib` with `intuitlib`:
```txt
intuitlib==1.3.0
aiomysql==0.2.0
alembic==1.13.1
sqlalchemy[asyncio]==2.0.25
```

Remove:
```txt
authlib==1.3.2
```

---

## Testing Requirements

### Unit Tests

**File**: `app/tests/test_oauth_service.py`
- Test `initiate_oauth()` generates valid state and URL
- Test `handle_callback()` with valid state
- Test `handle_callback()` with invalid state (should raise)
- Test `handle_callback()` with expired state (should raise)
- Test `get_connection_status()` with active token
- Test `get_connection_status()` with no token
- Test `disconnect()` deactivates token

**File**: `app/tests/test_oauth_routes.py`
- Test `/quickbooks/connect/{org_id}` returns redirect
- Test `/quickbooks/callback` with valid params
- Test `/quickbooks/callback` with invalid state returns 400
- Test `/quickbooks/status/{org_id}` returns status
- Test `/quickbooks/disconnect/{org_id}` disconnects

**File**: `app/tests/test_quickbooks_strategy.py`
- Test `get_authorization_url()` with intuitlib
- Test `handle_callback()` exchanges code correctly
- Mock intuitlib responses

### Integration Tests

**File**: `app/tests/integration/test_oauth_flow.py`
- Full OAuth flow with test database
- Token encryption/decryption roundtrip
- Token refresh scenario

### Manual Testing

1. Start app: `uvicorn app.app:app --reload`
2. Visit: `http://localhost:8080/api/v1/oauth/quickbooks/connect/test-org-123`
3. Should redirect to QuickBooks authorization
4. After authorization, callback should store tokens
5. Verify: `http://localhost:8080/api/v1/oauth/quickbooks/status/test-org-123`

---

## Database Setup

### Local MySQL Setup

```bash
# Create database
mysql -u root -p
CREATE DATABASE accounting_integration;

# Run migrations
cd app
alembic upgrade head
```

### Alembic Commands

```bash
# Create new migration
alembic revision -m "create oauth tokens table"

# Apply migrations
alembic upgrade head

# Rollback migration
alembic downgrade -1

# Show current version
alembic current
```

---

## File Structure

```
app/
├── alembic/
│   ├── versions/
│   │   └── 2026-02-10-1400_create_oauth_tokens_table.py
│   ├── env.py
│   └── script.py.mako
├── datastores/
│   ├── __init__.py
│   └── oauth_token_datastore.py
├── db/
│   ├── __init__.py
│   ├── session.py
│   └── tables.py
├── models/
│   ├── __init__.py
│   ├── accounting.py
│   └── oauth.py
├── routes/
│   ├── __init__.py
│   └── oauth.py
├── services/
│   ├── __init__.py
│   └── oauth_service.py
├── strategies/
│   ├── __init__.py
│   ├── base.py
│   ├── factory.py
│   └── quickbooks_strategy.py  # UPDATED
├── tests/
│   ├── integration/
│   │   └── test_oauth_flow.py
│   ├── test_oauth_routes.py
│   ├── test_oauth_service.py
│   └── test_quickbooks_strategy.py
├── .env.example
├── alembic.ini
├── app.py
├── config.py
└── requirements.txt
```

---

## Definition of Done

- [ ] All files created/modified as specified
- [ ] QuickBooksStrategy uses intuitlib instead of authlib
- [ ] Alembic migrations run successfully
- [ ] OAuth routes are registered and accessible
- [ ] Unit tests pass with >80% coverage
- [ ] Manual OAuth flow works end-to-end
- [ ] Tokens are encrypted in database
- [ ] State parameter prevents CSRF
- [ ] Error handling returns appropriate status codes
- [ ] Code passes `ruff check` and `ruff format`
- [ ] PR created with all changes
- [ ] Documentation updated in README

---

## Out of Scope

- Invoice reporting (separate ticket OD-7830)
- Webhook processing (separate ticket OD-7831)
- Client mapping (separate ticket OD-7818)
- Xero/Sage integrations (Phase 2)
- Frontend UI (handled separately)
- Rate limiting implementation (can use existing middleware)
- Audit logging (can be added later)

---

## Notes

- Use `intuitlib` for QuickBooks OAuth (official Intuit Python SDK)
- Tokens must be encrypted with Fernet before storing
- State parameter must be HMAC-signed with 10-minute expiration
- Only one active token per organization (enforce with unique constraint)
- QuickBooks refresh tokens rotate on each refresh (must update both tokens)
- Sandbox vs Production controlled by `QBO_ENVIRONMENT` setting
- Callback URL must be registered in Intuit Developer Portal
