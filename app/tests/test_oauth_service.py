import pytest

from app.exceptions.strategy_exceptions import UnsupportedAccountingSystemError
from app.services.oauth_service import OAuthService


@pytest.mark.asyncio
async def test_get_authorization_url_unsupported_system():
    service = OAuthService()

    with pytest.raises(UnsupportedAccountingSystemError):
        await service.get_authorization_url(
            accounting_system="unsupported",
            partner_id="partner-123",
        )


@pytest.mark.asyncio
async def test_get_authorization_url_invalid_system():
    service = OAuthService()

    with pytest.raises(UnsupportedAccountingSystemError):
        await service.get_authorization_url(
            accounting_system="invalid-system",
            partner_id="partner-123",
        )
