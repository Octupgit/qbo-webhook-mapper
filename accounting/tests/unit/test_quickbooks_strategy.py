import pytest
from unittest.mock import AsyncMock, patch
from accounting.strategies.quickbooks_auth_strategy import QuickBooksAuthStrategy

class TestQuickBooksAuthStrategy:
    def test_get_authorization_url_includes_state(self):
        strategy = QuickBooksAuthStrategy()
        state = "encrypted_state_parameter"

        auth_url = strategy.get_authorization_url(state)

        assert "https://appcenter.intuit.com/connect/oauth2" in auth_url
        assert f"state={state}" in auth_url
        assert "response_type=code" in auth_url
        assert "scope=com.intuit.quickbooks.accounting" in auth_url

    @pytest.mark.asyncio
    async def test_exchange_code_for_tokens_returns_tokens(self):
        strategy = QuickBooksAuthStrategy()

        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "access_token": "test_access_token",
            "refresh_token": "test_refresh_token"
        }
        mock_response.raise_for_status = AsyncMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

            access_token, refresh_token = await strategy.exchange_code_for_tokens(
                code="auth_code_123",
                realm_id="realm_456"
            )

            assert access_token == "test_access_token"
            assert refresh_token == "test_refresh_token"

    @pytest.mark.asyncio
    async def test_fetch_company_info_returns_company_name(self):
        strategy = QuickBooksAuthStrategy()

        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "CompanyInfo": {
                "CompanyName": "Acme Corp Inc"
            }
        }
        mock_response.raise_for_status = AsyncMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_response)

            company_name = await strategy.fetch_company_info(
                access_token="test_token",
                realm_id="realm_789"
            )

            assert company_name == "Acme Corp Inc"

    @pytest.mark.asyncio
    async def test_fetch_company_info_returns_fallback_on_error(self):
        strategy = QuickBooksAuthStrategy()

        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(side_effect=Exception("API Error"))

            company_name = await strategy.fetch_company_info(
                access_token="test_token",
                realm_id="realm_789"
            )

            assert company_name == "QuickBooks Account"

    @pytest.mark.asyncio
    async def test_fetch_initial_data_returns_customer_list(self):
        strategy = QuickBooksAuthStrategy()

        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "QueryResponse": {
                "Customer": [
                    {"Id": "1", "DisplayName": "Customer 1"},
                    {"Id": "2", "DisplayName": "Customer 2"}
                ]
            }
        }
        mock_response.raise_for_status = AsyncMock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_response)

            data = await strategy.fetch_initial_data(
                access_token="test_token",
                realm_id="realm_789"
            )

            assert "QueryResponse" in data
            assert "Customer" in data["QueryResponse"]
            assert len(data["QueryResponse"]["Customer"]) == 2
