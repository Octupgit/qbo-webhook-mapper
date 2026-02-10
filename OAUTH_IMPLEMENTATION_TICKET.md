# Implement Minimal OAuth Redirect Flow

## Story
As a developer, I want a basic OAuth route that redirects users to the accounting system's authorization page, so I can verify the OAuth flow works before adding token storage.

## Scope
Create a minimal OAuth flow that:
1. Accepts accounting system as a parameter
2. Redirects user to the correct authorization page
3. Handles callback with success message

**No database, no token storage - just redirect flow verification.**

---

## Acceptance Criteria

- [ ] GET `/api/v1/oauth/connect/{accounting_system}/{organization_id}` redirects to OAuth authorization page
- [ ] Accounting system is passed as path parameter (e.g., "quickbooks", "xero")
- [ ] OAuth callback at `/api/v1/oauth/callback` returns "auth success" message
- [ ] Service layer creates strategy based on accounting_system parameter
- [ ] Strategy handles authorization URL generation with correct callback URL
- [ ] State parameter includes organization_id for callback reference

---

## Implementation

### 1. Update QuickBooksStrategy

**File**: `app/strategies/quickbooks_strategy.py`

**Change**: Replace `authlib` with `intuitlib` (Intuit Python SDK)

```python
from intuitlib.client import AuthClient
from intuitlib.enums import Scopes
```

**Method**: `get_authorization_url()`
```python
async def get_authorization_url(
    self, organization_id: str, state: str, redirect_uri: str
) -> AuthUrlResult:
    """Generate QuickBooks OAuth authorization URL using Intuit SDK."""
    auth_client = AuthClient(
        client_id=self.client_id,
        client_secret=self.client_secret,
        redirect_uri=redirect_uri,
        environment=self.environment,
    )

    auth_url = auth_client.get_authorization_url([Scopes.ACCOUNTING], state=state)

    return AuthUrlResult(url=auth_url)
```

---

### 2. Create OAuthService

**File**: `app/services/oauth_service.py`

```python
from app.strategies import AccountingSystemFactory
from app.utils.oauth_state import generate_state
from app.config import settings


class OAuthService:
    """Service for handling OAuth flows across accounting systems."""

    async def get_authorization_url(
        self, accounting_system: str, organization_id: str
    ) -> str:
        """
        Get OAuth authorization URL for the specified accounting system.

        Args:
            accounting_system: System identifier (e.g., 'quickbooks', 'xero')
            organization_id: Octup organization ID

        Returns:
            Authorization URL to redirect user to
        """
        strategy = AccountingSystemFactory.get_strategy(accounting_system)

        state = generate_state(
            organization_id=organization_id, accounting_system=accounting_system
        )

        callback_url = f"{settings.API_BASE_URL}/api/v1/oauth/callback"

        result = await strategy.get_authorization_url(
            organization_id=organization_id, state=state, redirect_uri=callback_url
        )

        return result.url
```

---

### 3. Create OAuth Routes

**File**: `app/routes/oauth.py`

```python
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse, JSONResponse
from app.services.oauth_service import OAuthService
from app.utils.oauth_state import verify_state
from app.common.logging.json_logger import setup_logger

router = APIRouter(prefix="/api/v1/oauth", tags=["OAuth"])
logger = setup_logger()


@router.get("/connect/{accounting_system}/{organization_id}")
async def initiate_oauth(accounting_system: str, organization_id: str):
    """
    Initiate OAuth flow for any accounting system.

    Path params:
        accounting_system: 'quickbooks', 'xero', 'sage', etc.
        organization_id: Octup organization ID

    Returns:
        Redirect to accounting system's authorization page
    """
    try:
        oauth_service = OAuthService()
        auth_url = await oauth_service.get_authorization_url(
            accounting_system=accounting_system, organization_id=organization_id
        )

        logger.info(
            f"Initiating OAuth for {accounting_system}, org: {organization_id}"
        )

        return RedirectResponse(url=auth_url)

    except Exception as e:
        logger.error(f"OAuth initiation failed: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to initiate OAuth: {str(e)}"
        )


@router.get("/callback")
async def oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    realmId: str = Query(None),  # QuickBooks specific
):
    """
    OAuth callback endpoint.

    For now, just verifies state and returns success message.
    Future: will exchange code for tokens and store them.
    """
    try:
        state_data = verify_state(state)

        if not state_data:
            raise HTTPException(status_code=400, detail="Invalid or expired state")

        organization_id = state_data.get("organization_id")
        accounting_system = state_data.get("accounting_system")

        logger.info(
            f"OAuth callback received - System: {accounting_system}, "
            f"Org: {organization_id}, Code: {code[:10]}..., RealmId: {realmId}"
        )

        return JSONResponse(
            content={
                "message": "auth success",
                "organization_id": organization_id,
                "accounting_system": accounting_system,
                "realm_id": realmId,
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OAuth callback failed: {e}")
        raise HTTPException(status_code=500, detail=f"Callback failed: {str(e)}")
```

---

### 4. Register Routes

**File**: `app/routes/__init__.py`

```python
from app.routes.oauth import router as oauth_router

routers = [oauth_router]
```

---

### 5. Update Config

**File**: `app/config.py`

Add:
```python
API_BASE_URL: str = "http://localhost:8080"  # For callback URL generation
```

---

### 6. Update Dependencies

**File**: `app/requirements.txt`

Replace:
```txt
authlib==1.3.2
```

With:
```txt
intuitlib==1.3.0
```

---

### 7. Update .env.example

**File**: `app/.env.example`

```bash
# Server
PORT=8080
ENVIRONMENT=development
LOG_LEVEL=INFO
API_BASE_URL=http://localhost:8080

# QuickBooks OAuth
QBO_CLIENT_ID=your_client_id_here
QBO_CLIENT_SECRET=your_client_secret_here
QBO_ENVIRONMENT=sandbox
# Note: Callback URL is auto-generated as {API_BASE_URL}/api/v1/oauth/callback
# Register this URL in Intuit Developer Portal

# Security
OAUTH_STATE_SECRET=random_secret_for_hmac_signing
```

---

## Testing

### Manual Test

1. Start the app:
```bash
uvicorn app.app:app --reload --port 8080
```

2. Visit in browser:
```
http://localhost:8080/api/v1/oauth/connect/quickbooks/test-org-123
```

3. You should be redirected to QuickBooks authorization page

4. After authorizing, QuickBooks will redirect to:
```
http://localhost:8080/api/v1/oauth/callback?code=...&state=...&realmId=...
```

5. You should see JSON response:
```json
{
  "message": "auth success",
  "organization_id": "test-org-123",
  "accounting_system": "quickbooks",
  "realm_id": "123456789"
}
```

### Unit Tests

**File**: `app/tests/test_oauth_service.py`

```python
import pytest
from app.services.oauth_service import OAuthService


@pytest.mark.asyncio
async def test_get_authorization_url():
    service = OAuthService()
    url = await service.get_authorization_url("quickbooks", "test-org")

    assert "intuit.com" in url
    assert "client_id" in url
    assert "redirect_uri" in url
    assert "state" in url
```

**File**: `app/tests/test_oauth_routes.py`

```python
import pytest
from fastapi.testclient import TestClient
from app.app import app

client = TestClient(app)


def test_connect_route():
    response = client.get(
        "/api/v1/oauth/connect/quickbooks/test-org", follow_redirects=False
    )

    assert response.status_code == 307  # Redirect
    assert "location" in response.headers
    assert "intuit.com" in response.headers["location"]


def test_callback_route_invalid_state():
    response = client.get(
        "/api/v1/oauth/callback?code=test&state=invalid&realmId=123"
    )

    assert response.status_code == 400
```

---

## Files to Create/Modify

```
app/
├── routes/
│   ├── __init__.py         # MODIFY: Add oauth_router
│   └── oauth.py            # CREATE: OAuth routes
├── services/
│   ├── __init__.py         # MODIFY: Export OAuthService
│   └── oauth_service.py    # CREATE: OAuth service
├── strategies/
│   └── quickbooks_strategy.py  # MODIFY: Use intuitlib
├── tests/
│   ├── test_oauth_routes.py    # CREATE: Route tests
│   └── test_oauth_service.py   # CREATE: Service tests
├── config.py               # MODIFY: Add API_BASE_URL
├── requirements.txt        # MODIFY: Replace authlib with intuitlib
└── .env.example           # MODIFY: Add API_BASE_URL
```

---

## Definition of Done

- [ ] Route `/api/v1/oauth/connect/{system}/{org_id}` redirects to auth page
- [ ] Callback route returns "auth success" JSON
- [ ] QuickBooksStrategy uses intuitlib
- [ ] Service creates strategy based on accounting_system param
- [ ] State parameter is verified in callback
- [ ] Manual test completes successfully (redirect → authorize → callback)
- [ ] Unit tests pass
- [ ] Code passes `ruff check`

---

## Out of Scope

- Token storage (next ticket)
- Database/migrations (next ticket)
- Token refresh (next ticket)
- Disconnect functionality (next ticket)
- Other accounting systems beyond QuickBooks (future)
- Frontend integration (separate)
