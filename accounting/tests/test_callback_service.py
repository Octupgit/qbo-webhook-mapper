from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from accounting.exceptions.strategy_exceptions import UnsupportedAccountingSystemError
from accounting.models import BaseAuthResult
from accounting.services.callback_service import CallbackService
from starlette.requests import Request


@pytest.mark.asyncio
async def test_handle_callback_success():
    mock_request = MagicMock(spec=Request)
    mock_request.query_params = {"state": "valid_state", "code": "auth_code"}

    mock_verified_state = {
        "partner_id": "partner-123",
        "accounting_system": "quickbooks",
        "timestamp": 1234567890,
    }

    mock_auth_result = BaseAuthResult()

    with (
        patch("accounting.services.callback_service.verify_state", return_value=mock_verified_state),
        patch("accounting.services.callback_service.AccountingSystemFactory") as mock_factory,
    ):
        mock_strategy = AsyncMock()
        mock_strategy.handle_callback.return_value = mock_auth_result
        mock_factory.get_strategy.return_value = mock_strategy

        service = CallbackService()
        result = await service.handle_callback(mock_request)

        assert result == mock_auth_result
        mock_factory.get_strategy.assert_called_once_with("quickbooks")
        mock_strategy.handle_callback.assert_called_once_with(request=mock_request)


@pytest.mark.asyncio
async def test_handle_callback_missing_state():
    mock_request = MagicMock(spec=Request)
    mock_request.query_params = {}

    service = CallbackService()

    with pytest.raises(ValueError, match="Missing state parameter"):
        await service.handle_callback(mock_request)


@pytest.mark.asyncio
async def test_handle_callback_invalid_state():
    mock_request = MagicMock(spec=Request)
    mock_request.query_params = {"state": "invalid_state"}

    with patch("accounting.services.callback_service.verify_state", return_value=None):
        service = CallbackService()

        with pytest.raises(ValueError, match="Invalid or expired state"):
            await service.handle_callback(mock_request)


@pytest.mark.asyncio
async def test_handle_callback_unsupported_system():
    mock_request = MagicMock(spec=Request)
    mock_request.query_params = {"state": "valid_state"}

    mock_verified_state = {
        "partner_id": "partner-123",
        "accounting_system": "unsupported",
        "timestamp": 1234567890,
    }

    with (
        patch("accounting.services.callback_service.verify_state", return_value=mock_verified_state),
        patch(
            "accounting.services.callback_service.AccountingSystemFactory.get_strategy",
            side_effect=UnsupportedAccountingSystemError("System not supported"),
        ),
    ):
        service = CallbackService()

        with pytest.raises(UnsupportedAccountingSystemError):
            await service.handle_callback(mock_request)
