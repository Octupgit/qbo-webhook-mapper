from datetime import datetime
from unittest.mock import AsyncMock, Mock, patch

import httpx
import pytest
from starlette.requests import Request

from accounting.strategies.quickbooks import QuickBooksAuthResult, QuickBooksAuthStrategy, QuickBooksTokenResult


@pytest.fixture
def quickbooks_strategy():
    with patch("accounting.strategies.quickbooks.settings") as mock_settings:
        mock_settings.QBO_CLIENT_ID = "test_client_id"
        mock_settings.QBO_CLIENT_SECRET = "test_client_secret"
        mock_settings.QBO_REDIRECT_URI = "http://localhost:8080/oauth/callback"
        mock_settings.QBO_ENVIRONMENT = "sandbox"

        with patch("accounting.strategies.quickbooks.AuthClient"):
            yield QuickBooksAuthStrategy()


@pytest.mark.asyncio
class TestQuickBooksAuthStrategy:
    async def test_system_name(self, quickbooks_strategy):
        assert quickbooks_strategy.system_name == "quickbooks"

    async def test_get_authorization_url(self, quickbooks_strategy):
        state = "test_state_123"

        quickbooks_strategy.auth_client.get_authorization_url = Mock(
            return_value="https://appcenter.intuit.com/connect/oauth2?client_id=test&state=test_state_123"
        )

        url = await quickbooks_strategy.get_authorization_url(state=state)

        assert "appcenter.intuit.com" in url
        quickbooks_strategy.auth_client.get_authorization_url.assert_called_once()

    async def test_handle_callback_success(self, quickbooks_strategy):
        mock_request = Mock(spec=Request)
        mock_request.query_params = {"code": "test_code", "realmId": "test_realm_id"}

        quickbooks_strategy.auth_client.get_bearer_token = Mock()
        quickbooks_strategy.auth_client.access_token = "test_access_token"
        quickbooks_strategy.auth_client.refresh_token = "test_refresh_token"
        quickbooks_strategy.auth_client.expires_in = datetime.now().timestamp() + 3600
        quickbooks_strategy.auth_client.x_refresh_token_expires_in = datetime.now().timestamp() + 8640000

        with patch.object(quickbooks_strategy, "_fetch_customers", return_value=[
            {"accounting_entity_id": "1", "display_name": "Customer A"},
            {"accounting_entity_id": "2", "display_name": "Customer B"},
        ]):
            result = await quickbooks_strategy.handle_callback(mock_request)

        assert isinstance(result, QuickBooksAuthResult)
        assert result.realm_id == "test_realm_id"
        assert result.access_token == "test_access_token"
        assert result.refresh_token == "test_refresh_token"
        assert len(result.customers) == 2
        assert result.customers[0]["accounting_entity_id"] == "1"
        quickbooks_strategy.auth_client.get_bearer_token.assert_called_once_with("test_code", realm_id="test_realm_id")

    async def test_handle_callback_missing_code(self, quickbooks_strategy):
        mock_request = Mock(spec=Request)
        mock_request.query_params = {"realmId": "test_realm_id"}

        with pytest.raises(ValueError, match="Missing code or realmId"):
            await quickbooks_strategy.handle_callback(mock_request)

    async def test_handle_callback_missing_realm_id(self, quickbooks_strategy):
        mock_request = Mock(spec=Request)
        mock_request.query_params = {"code": "test_code"}

        with pytest.raises(ValueError, match="Missing code or realmId"):
            await quickbooks_strategy.handle_callback(mock_request)

    @patch("httpx.AsyncClient")
    async def test_fetch_customers_success(self, mock_client_class, quickbooks_strategy):
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "QueryResponse": {
                "Customer": [
                    {"Id": 123, "DisplayName": "Acme Corp"},
                    {"Id": 456, "DisplayName": "Test Inc"},
                ]
            }
        }

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.get.return_value = mock_response
        mock_client_class.return_value = mock_client

        result = await quickbooks_strategy._fetch_customers("test_token", "test_realm")

        assert len(result) == 2
        assert result[0]["accounting_entity_id"] == "123"
        assert result[0]["display_name"] == "Acme Corp"
        assert result[1]["accounting_entity_id"] == "456"
        assert result[1]["display_name"] == "Test Inc"

    @patch("httpx.AsyncClient")
    async def test_fetch_customers_empty_response(self, mock_client_class, quickbooks_strategy):
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"QueryResponse": {}}

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.get.return_value = mock_response
        mock_client_class.return_value = mock_client

        result = await quickbooks_strategy._fetch_customers("test_token", "test_realm")

        assert len(result) == 0

    @patch("httpx.AsyncClient")
    async def test_fetch_customers_api_error(self, mock_client_class, quickbooks_strategy):
        mock_response = Mock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.get.return_value = mock_response
        mock_client_class.return_value = mock_client

        with pytest.raises(Exception, match="Customer fetch failed: 401"):
            await quickbooks_strategy._fetch_customers("invalid_token", "test_realm")

    async def test_refresh_token_success(self, quickbooks_strategy):
        quickbooks_strategy.auth_client.refresh = Mock()
        quickbooks_strategy.auth_client.access_token = "refreshed_access_token"
        quickbooks_strategy.auth_client.refresh_token = "new_refresh_token"
        quickbooks_strategy.auth_client.expires_in = datetime.now().timestamp() + 3600
        quickbooks_strategy.auth_client.x_refresh_token_expires_in = datetime.now().timestamp() + 8640000

        token_data = {"refresh_token": "old_refresh_token"}
        result = await quickbooks_strategy.refresh_token(token_data)

        assert isinstance(result, QuickBooksTokenResult)
        assert result.access_token == "refreshed_access_token"
        assert result.refresh_token == "new_refresh_token"
        quickbooks_strategy.auth_client.refresh.assert_called_once_with(refresh_token="old_refresh_token")

    async def test_refresh_token_rotation(self, quickbooks_strategy):
        quickbooks_strategy.auth_client.refresh = Mock()
        quickbooks_strategy.auth_client.access_token = "new_access"
        quickbooks_strategy.auth_client.refresh_token = "rotated_refresh"
        quickbooks_strategy.auth_client.expires_in = datetime.now().timestamp() + 3600
        quickbooks_strategy.auth_client.x_refresh_token_expires_in = datetime.now().timestamp() + 8640000

        token_data = {"refresh_token": "old_refresh"}
        result = await quickbooks_strategy.refresh_token(token_data)

        assert result.refresh_token == "rotated_refresh"
        assert result.refresh_token != "old_refresh"

    async def test_refresh_token_missing_refresh_token(self, quickbooks_strategy):
        token_data = {}

        with pytest.raises(ValueError, match="Missing refresh_token"):
            await quickbooks_strategy.refresh_token(token_data)

    async def test_create_invoice_not_implemented(self, quickbooks_strategy):
        with pytest.raises(NotImplementedError, match="OD-7881"):
            await quickbooks_strategy.create_invoice(Mock())

    async def test_verify_webhook_signature_not_implemented(self, quickbooks_strategy):
        with pytest.raises(NotImplementedError, match="OD-7886"):
            await quickbooks_strategy.verify_webhook_signature(b"payload", {})

    async def test_process_webhook_event_not_implemented(self, quickbooks_strategy):
        with pytest.raises(NotImplementedError, match="OD-7886"):
            await quickbooks_strategy.process_webhook_event({})
