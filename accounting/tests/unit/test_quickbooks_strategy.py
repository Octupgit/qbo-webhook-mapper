from datetime import datetime
from unittest.mock import AsyncMock, Mock, patch
from uuid import UUID, uuid4

import pytest
from accounting.models.connection_details import QuickBooksConnectionDetails
from accounting.models.integration_sync import InitialSyncResult
from accounting.models.oauth import AccountingIntegrationDTO, AuthenticateDTO, CallbackDTO
from accounting.strategies.quickbooks_strategy import QuickBooksStrategy


class TestQuickBooksStrategy:
    @pytest.fixture
    def strategy(self):
        with patch("accounting.strategies.quickbooks_strategy.AuthClient"):
            return QuickBooksStrategy()

    @pytest.fixture
    def auth_dto(self):
        return AuthenticateDTO(
            accounting_system="quickbooks",
            callback_uri="https://octup.com/callback",
            partner_id=123,
        )

    @pytest.fixture
    def callback_dto(self):
        return CallbackDTO(
            code="auth_code_123",
            state="encrypted_state",
            realmId="realm_456",
        )

    @pytest.fixture
    def integration_dto(self):
        return AccountingIntegrationDTO(
            id=uuid4(),
            integration_name="QuickBooks",
            partner_id=123,
            accounting_system="quickbooks",
            connection_details=None,
        )

    @pytest.fixture
    def integration_dto_with_connection(self):
        return AccountingIntegrationDTO(
            id=uuid4(),
            integration_name="QuickBooks",
            partner_id=123,
            accounting_system="quickbooks",
            connection_details={
                "realm_id": "realm_456",
                "access_token": "encrypted_access_token",
                "refresh_token": "encrypted_refresh_token",
                "expiry": "2026-02-16T12:00:00",
            },
        )

    def test_system_id_returns_quickbooks(self, strategy):
        assert strategy.system_id == "quickbooks"

    def test_system_name_returns_quickbooks(self, strategy):
        assert strategy.system_name == "QuickBooks Online"

    def test_get_system_info_returns_correct_structure(self, strategy):
        info = strategy.get_system_info()
        assert info.id == "quickbooks"
        assert info.name == "QuickBooks Online"
        assert info.text == "Connect to QuickBooks"

    def test_get_authorization_url_includes_state(self, strategy, auth_dto):
        with patch.object(strategy.state_manager, "generate_state", return_value="encrypted_state"):
            with patch.object(
                strategy.auth_client,
                "get_authorization_url",
                return_value="https://appcenter.intuit.com/connect/oauth2?state=encrypted_state&scope=com.intuit.quickbooks.accounting",
            ):
                auth_url = strategy.get_authorization_url(auth_dto)

                assert "https://appcenter.intuit.com/connect/oauth2" in auth_url
                assert "state=encrypted_state" in auth_url
                assert "com.intuit.quickbooks.accounting" in auth_url

    @pytest.mark.asyncio
    async def test_get_connection_details_from_callback_returns_enriched_dto(
        self, strategy, callback_dto, integration_dto
    ):
        with patch.object(
            strategy,
            "_exchange_code_for_tokens",
            return_value=("test_access_token", "test_refresh_token", datetime(2026, 2, 16, 12, 0, 0)),
        ):
            with patch.object(
                strategy.token_encryption, "encrypt", side_effect=lambda x: f"encrypted_{x}"
            ):
                result = await strategy.get_connection_details_from_callback(callback_dto, integration_dto)

                assert result.connection_details is not None
                assert result.connection_details["realm_id"] == "realm_456"
                assert "encrypted_test_access_token" in result.connection_details["access_token"]
                assert "encrypted_test_refresh_token" in result.connection_details["refresh_token"]

    @pytest.mark.asyncio
    async def test_fetch_initial_data_returns_sync_result_with_customers(
        self, strategy, integration_dto_with_connection
    ):
        with patch.object(strategy.token_encryption, "decrypt", return_value="decrypted_token"):
            with patch.object(strategy, "_fetch_company_info", return_value="Acme Corp"):
                with patch.object(
                    strategy,
                    "_fetch_customers",
                    return_value={
                        "QueryResponse": {
                            "Customer": [
                                {"Id": "1", "DisplayName": "Customer 1"},
                                {"Id": "2", "DisplayName": "Customer 2"},
                            ]
                        }
                    },
                ):
                    with patch.object(strategy.datastore, "update_connection_details", return_value=None):
                        result = await strategy.fetch_initial_data(integration_dto_with_connection)

                        assert isinstance(result, InitialSyncResult)
                        assert result.company_name == "Acme Corp"
                        assert len(result.accounting_clients) == 2
                        assert result.accounting_clients[0].accounting_client_id == "1"
                        assert result.accounting_clients[0].display_name == "Customer 1"
                        assert result.status == "fully_synced"

    @pytest.mark.asyncio
    async def test_fetch_initial_data_handles_company_info_error(self, strategy, integration_dto_with_connection):
        with patch.object(strategy.token_encryption, "decrypt", return_value="decrypted_token"):
            with patch.object(strategy, "_fetch_company_info", side_effect=Exception("API Error")):
                with patch.object(strategy, "_fetch_customers", return_value={"QueryResponse": {"Customer": []}}):
                    result = await strategy.fetch_initial_data(integration_dto_with_connection)

                    assert result.company_name == "QuickBooks Account"
                    assert result.status == "sync_error"
                    assert len(result.errors) > 0

    @pytest.mark.asyncio
    async def test_fetch_initial_data_handles_customer_fetch_error(self, strategy, integration_dto_with_connection):
        with patch.object(strategy.token_encryption, "decrypt", return_value="decrypted_token"):
            with patch.object(strategy, "_fetch_company_info", return_value="Acme Corp"):
                with patch.object(strategy, "_fetch_customers", side_effect=Exception("Customer API Error")):
                    with patch.object(strategy.datastore, "update_connection_details", return_value=None):
                        result = await strategy.fetch_initial_data(integration_dto_with_connection)

                        assert result.status == "sync_error"
                        assert len(result.errors) > 0
                        assert "Customer fetch failed" in result.errors[0]

    @pytest.mark.asyncio
    async def test_refresh_tokens_updates_connection_details(self, strategy):
        integration_id = str(uuid4())
        mock_integration = Mock()
        mock_integration.connection_details = {
            "realm_id": "realm_456",
            "access_token": "encrypted_old_access",
            "refresh_token": "encrypted_old_refresh",
            "expiry": "2026-02-15T12:00:00",
        }

        with patch.object(strategy.datastore, "get_integration_by_id", return_value=mock_integration):
            with patch.object(
                strategy.token_encryption, "decrypt", return_value="decrypted_refresh_token"
            ):
                with patch.object(strategy.auth_client, "refresh", return_value=None):
                    strategy.auth_client.access_token = "new_access_token"
                    strategy.auth_client.refresh_token = "new_refresh_token"

                    with patch.object(
                        strategy.token_encryption, "encrypt", side_effect=lambda x: f"encrypted_{x}"
                    ):
                        with patch.object(strategy.datastore, "update_connection_details", return_value=None):
                            await strategy.refresh_tokens(integration_id)

                            strategy.datastore.update_connection_details.assert_called_once()
                            call_args = strategy.datastore.update_connection_details.call_args
                            assert call_args[0][0] == integration_id
                            updated_details = call_args[0][1]
                            assert "encrypted_new_access_token" in updated_details["access_token"]

    @pytest.mark.asyncio
    async def test_exchange_code_for_tokens_returns_tokens_and_expiry(self, strategy):
        with patch.object(strategy.auth_client, "get_bearer_token", return_value=None):
            strategy.auth_client.access_token = "test_access_token"
            strategy.auth_client.refresh_token = "test_refresh_token"

            access_token, refresh_token, expiry = await strategy._exchange_code_for_tokens(
                code="auth_code_123", realm_id="realm_456"
            )

            assert access_token == "test_access_token"
            assert refresh_token == "test_refresh_token"
            assert isinstance(expiry, datetime)

    @pytest.mark.asyncio
    async def test_fetch_company_info_returns_company_name(self, strategy):
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.json = Mock(return_value={"CompanyInfo": {"CompanyName": "Acme Corp Inc"}})
        mock_response.raise_for_status = Mock()

        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_response)

            company_name = await strategy._fetch_company_info(access_token="test_token", realm_id="realm_789")

            assert company_name == "Acme Corp Inc"

    @pytest.mark.asyncio
    async def test_fetch_customers_returns_customer_data(self, strategy):
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

            data = await strategy._fetch_customers(access_token="test_token", realm_id="realm_789")

            assert "QueryResponse" in data
            assert "Customer" in data["QueryResponse"]
            assert len(data["QueryResponse"]["Customer"]) == 2

    def test_parse_qbo_customers_returns_accounting_client_data(self, strategy):
        raw_data = {
            "QueryResponse": {
                "Customer": [
                    {"Id": "1", "DisplayName": "Customer 1"},
                    {"Id": "2", "DisplayName": "Customer 2", "FullyQualifiedName": "Parent:Customer 2"},
                    {"Id": "3", "FullyQualifiedName": "Customer 3"},
                ]
            }
        }

        result = strategy._parse_qbo_customers(raw_data)

        assert len(result) == 3
        assert result[0].accounting_client_id == "1"
        assert result[0].display_name == "Customer 1"
        assert result[1].display_name == "Customer 2"
        assert result[2].display_name == "Customer 3"

    def test_parse_qbo_customers_handles_empty_data(self, strategy):
        assert strategy._parse_qbo_customers({}) == []
        assert strategy._parse_qbo_customers({"QueryResponse": {}}) == []
        assert strategy._parse_qbo_customers({"QueryResponse": {"Customer": []}}) == []

    def test_parse_qbo_customers_skips_customers_without_id(self, strategy):
        raw_data = {"QueryResponse": {"Customer": [{"DisplayName": "No ID Customer"}]}}

        result = strategy._parse_qbo_customers(raw_data)

        assert len(result) == 0
