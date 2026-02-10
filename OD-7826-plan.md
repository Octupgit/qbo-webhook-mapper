# [Accounting BE] Authenticate Route + Service

## Story
As a partner, I want to initiate OAuth authentication with an accounting system, so I can connect my accounting platform to Octup.

## Scope
Create a minimal OAuth initiation flow:
1. Generic authenticate route that accepts accounting system and partner ID
2. Generic service that creates strategy and gets authorization URL
3. Redirect user to accounting system's OAuth page

**No callback handling, no token storage - just OAuth initiation.**

---

## Acceptance Criteria

- [ ] GET `/api/v1/oauth/authenticate/{accounting_system}/{partner_id}` redirects to OAuth authorization page
- [ ] Service uses `AccountingSystemFactory` to create strategy
- [ ] Service calls `strategy.get_authorization_url()` with partner_id and state
- [ ] State parameter is generated with HMAC signature (using existing `oauth_state.py`)
- [ ] Route returns `RedirectResponse` to authorization URL
- [ ] Error handling for unsupported accounting systems (404)
- [ ] Error handling for strategy errors (500)

---

## Implementation

### 1. Create OAuthService

**File**: `app/services/oauth_service.py`

```python
from app.strategies import AccountingSystemFactory
from app.utils.oauth_state import generate_state


class OAuthService:
    async def get_authorization_url(
        self, accounting_system: str, partner_id: str
    ) -> str:
        strategy = AccountingSystemFactory.get_strategy(accounting_system)

        state = generate_state(
            partner_id=partner_id,
            accounting_system=accounting_system,
        )

        auth_url = await strategy.get_authorization_url(
            partner_id=partner_id,
            state=state,
        )

        return auth_url
```

---

### 2. Create OAuth Routes

**File**: `app/routes/oauth.py`

```python
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from app.exceptions.strategy_exceptions import UnsupportedAccountingSystemError
from app.services.oauth_service import OAuthService

router = APIRouter(prefix="/api/v1/oauth", tags=["OAuth"])


@router.get("/authenticate/{accounting_system}/{partner_id}")
async def authenticate(accounting_system: str, partner_id: str) -> RedirectResponse:
    try:
        oauth_service = OAuthService()
        auth_url = await oauth_service.get_authorization_url(
            accounting_system=accounting_system,
            partner_id=partner_id,
        )
        return RedirectResponse(url=auth_url)

    except UnsupportedAccountingSystemError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Authentication failed: {str(e)}")
```

---

### 3. Register Routes in App

**File**: `app/app.py` (or main app file)

```python
from app.routes.oauth import router as oauth_router

app = FastAPI()
app.include_router(oauth_router)
```

---

### 4. Create Services Directory

**File**: `app/services/__init__.py`

```python
from app.services.oauth_service import OAuthService

__all__ = ["OAuthService"]
```

---

## Files to Create/Modify

```
app/
├── routes/
│   ├── __init__.py         # CREATE: Empty init
│   └── oauth.py            # CREATE: OAuth routes
├── services/
│   ├── __init__.py         # CREATE: Export OAuthService
│   └── oauth_service.py    # CREATE: OAuth service
└── app.py                  # MODIFY: Register oauth router
```

---

## Testing

### Manual Test (after QuickBooks strategy is implemented)

1. Visit in browser:
```
http://localhost:8080/api/v1/oauth/authenticate/quickbooks/partner-123
```

2. Should redirect to QuickBooks authorization page

3. Verify state parameter is present in redirect URL

### Unit Tests

**File**: `app/tests/test_oauth_service.py`

```python
import pytest
from app.services.oauth_service import OAuthService


@pytest.mark.asyncio
async def test_get_authorization_url_unsupported_system():
    service = OAuthService()

    with pytest.raises(Exception):
        await service.get_authorization_url("unsupported", "partner-123")
```

**File**: `app/tests/test_oauth_routes.py`

```python
from fastapi.testclient import TestClient
from app.app import app

client = TestClient(app)


def test_authenticate_unsupported_system():
    response = client.get(
        "/api/v1/oauth/authenticate/unsupported/partner-123",
        follow_redirects=False
    )
    assert response.status_code == 404


def test_authenticate_missing_partner_id():
    response = client.get(
        "/api/v1/oauth/authenticate/quickbooks/",
        follow_redirects=False
    )
    assert response.status_code == 404
```

---

## Definition of Done

- [ ] Route `/api/v1/oauth/authenticate/{system}/{partner_id}` exists
- [ ] Service creates strategy and gets authorization URL
- [ ] Route redirects to authorization URL
- [ ] Error handling returns appropriate status codes
- [ ] Unit tests pass
- [ ] Code passes `ruff check`

---

## Out of Scope

- OAuth callback handling (separate ticket)
- Token storage (separate ticket)
- Concrete accounting system strategies (separate tickets)
- Database models (separate ticket)

---

## Dependencies

- **Requires**: OD-7828 (Abstract strategy pattern) - COMPLETED
- **Blocks**: OAuth callback ticket (to be created)

---

## Notes

- This ticket creates the infrastructure for OAuth initiation
- Concrete strategies (QuickBooks, Xero, etc.) will be implemented separately
- The route is generic and will work with any strategy once registered in the factory
