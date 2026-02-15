from unittest.mock import AsyncMock, Mock, patch

import pytest
from accounting.strategies.quickbooks_auth_strategy import QuickBooksAuthStrategy


class TestQuickBooksAuthStrategy:
    def test_get_authorization_url_includes_state(self):
        with patch("accounting.strategies.quickbooks_auth_strategy.AuthClient") as mock_auth_client:
            mock_client_instance = Mock()
            mock_client_instance.get_authorization_url.return_value = "https://appcenter.intuit.com/connect/oauth2?state=encrypted_state_parameter&scope=com.intuit.quickbooks.accounting"
            mock_auth_client.return_value = mock_client_instance

            strategy = QuickBooksAuthStrategy()
            state = "encrypted_state_parameter"

            auth_url = strategy.get_authorization_url(state)

            assert "https://appcenter.intuit.com/connect/oauth2" in auth_url
            assert "state=encrypted_state_parameter" in auth_url
            assert "com.intuit.quickbooks.accounting" in auth_url

    @pytest.mark.asyncio
    async def test_exchange_code_for_tokens_returns_tokens(self):
        with patch("accounting.strategies.quickbooks_auth_strategy.AuthClient") as mock_auth_client:
            mock_client_instance = Mock()
            mock_client_instance.access_token = "test_access_token"
            mock_client_instance.refresh_token = "test_refresh_token"
            mock_client_instance.get_bearer_token = Mock()
            mock_auth_client.return_value = mock_client_instance

            strategy = QuickBooksAuthStrategy()

            access_token, refresh_token = await strategy.exchange_code_for_tokens(
                code="auth_code_123", realm_id="realm_456"
            )

            assert access_token == "test_access_token"
            assert refresh_token == "test_refresh_token"
            mock_client_instance.get_bearer_token.assert_called_once_with("auth_code_123", "realm_456")

    @pytest.mark.asyncio
    async def test_fetch_company_info_returns_company_name(self):
        with patch("accounting.strategies.quickbooks_auth_strategy.AuthClient"):
            strategy = QuickBooksAuthStrategy()

            mock_response = AsyncMock()
            mock_response.status_code = 200
            mock_response.json = Mock(return_value={"CompanyInfo": {"CompanyName": "Acme Corp Inc"}})
            mock_response.raise_for_status = Mock()

            with patch("httpx.AsyncClient") as mock_client:
                mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_response)

                company_name = await strategy.fetch_company_info(access_token="test_token", realm_id="realm_789")

                assert company_name == "Acme Corp Inc"

    @pytest.mark.asyncio
    async def test_fetch_company_info_returns_fallback_on_error(self):
        with patch("accounting.strategies.quickbooks_auth_strategy.AuthClient"):
            strategy = QuickBooksAuthStrategy()

            with patch("httpx.AsyncClient") as mock_client:
                mock_client.return_value.__aenter__.return_value.get = AsyncMock(side_effect=Exception("API Error"))

                company_name = await strategy.fetch_company_info(access_token="test_token", realm_id="realm_789")

                assert company_name == "QuickBooks Account"

    @pytest.mark.asyncio
    async def test_fetch_initial_data_returns_customer_list(self):
        with patch("accounting.strategies.quickbooks_auth_strategy.AuthClient"):
            strategy = QuickBooksAuthStrategy()

            mock_response = AsyncMock()
            mock_response.status_code = 200
            mock_response.json = Mock(
                return_value={
                    "QueryResponse": {
                        "Customer": [{"Id": "1", "DisplayName": "Customer 1"}, {"Id": "2", "DisplayName": "Customer 2"}]
                    }
                }
            )
            mock_response.raise_for_status = Mock()

            with patch("httpx.AsyncClient") as mock_client:
                mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_response)

                data = await strategy.fetch_initial_data(access_token="test_token", realm_id="realm_789")

                assert "QueryResponse" in data
                assert "Customer" in data["QueryResponse"]
                assert len(data["QueryResponse"]["Customer"]) == 2

    @pytest.mark.asyncio
    async def test_refresh_access_token_returns_new_tokens(self):
        with patch("accounting.strategies.quickbooks_auth_strategy.AuthClient") as mock_auth_client:
            mock_client_instance = Mock()

            def set_tokens_after_refresh(*args, **kwargs):
                mock_client_instance.access_token = "new_access_token"
                mock_client_instance.refresh_token = "new_refresh_token"

            mock_client_instance.refresh = Mock(side_effect=set_tokens_after_refresh)
            mock_auth_client.return_value = mock_client_instance

            strategy = QuickBooksAuthStrategy()

            access_token, refresh_token = await strategy.refresh_access_token(refresh_token="old_refresh_token")

            assert access_token == "new_access_token"
            assert refresh_token == "new_refresh_token"
            mock_client_instance.refresh.assert_called_once()
