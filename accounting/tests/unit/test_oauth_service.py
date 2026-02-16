from datetime import datetime
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import pytest
from accounting.common.constants import AccountingSystem, SyncStatus
from accounting.models.integration_sync import InitialSyncResult
from accounting.models.oauth import AccountingIntegrationDTO, AuthenticateDTO, CallbackDTO
from accounting.services.oauth_service import OAuthService
from fastapi import BackgroundTasks


class TestOAuthService:
    @pytest.fixture
    def service(self):
        return OAuthService()

    @pytest.fixture
    def auth_dto(self):
        return AuthenticateDTO(
            accounting_system=AccountingSystem.QUICKBOOKS,
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

    @pytest.mark.asyncio
    async def test_get_systems_returns_available_systems(self, service):
        systems = await service.get_systems()

        assert len(systems.systems) > 0
        assert any(s.id == AccountingSystem.QUICKBOOKS for s in systems.systems)

    @pytest.mark.asyncio
    async def test_initiate_oauth_returns_authorization_url(self, service, auth_dto):
        with patch.object(
            service.strategies[AccountingSystem.QUICKBOOKS],
            "get_authorization_url",
            return_value="https://appcenter.intuit.com/connect/oauth2?state=test",
        ):
            result = await service.initiate_oauth(auth_dto)

            assert result.authorization_url is not None
            assert "appcenter.intuit.com" in str(result.authorization_url)


    @pytest.mark.asyncio
    async def test_handle_callback_creates_integration_and_schedules_sync(
        self, service, callback_dto
    ):
        state_data = {
            "partner_id": 123,
            "accounting_system": AccountingSystem.QUICKBOOKS,
            "callback_uri": "https://octup.com/callback",
        }
        integration_id = uuid4()

        with patch.object(
            service.state_manager, "validate_state", return_value=state_data
        ):
            with patch.object(
                service.strategies[AccountingSystem.QUICKBOOKS],
                "get_connection_details_from_callback",
                new_callable=AsyncMock,
            ) as mock_get_details:
                mock_integration_dto = AccountingIntegrationDTO(
                    id=uuid4(),
                    integration_name="QuickBooks",
                    partner_id=123,
                    accounting_system=AccountingSystem.QUICKBOOKS,
                    connection_details={"realm_id": "realm_456"},
                )
                mock_get_details.return_value = mock_integration_dto

                with patch.object(
                    service.datastore, "upsert_integrations", new_callable=AsyncMock
                ) as mock_upsert:
                    mock_upsert.return_value = [integration_id]

                    background_tasks = BackgroundTasks()
                    with patch.object(background_tasks, "add_task") as mock_add_task:
                        response = await service.handle_callback(callback_dto, background_tasks)

                        assert response.status_code == 307
                        assert "status=success" in response.headers["location"]
                        assert str(integration_id) in response.headers["location"]
                        mock_add_task.assert_called_once()

    @pytest.mark.asyncio
    async def test_handle_callback_raises_error_for_missing_realm_id(self, service):
        callback_dto = CallbackDTO(
            code="auth_code_123",
            state="encrypted_state",
            realmId=None,
        )
        state_data = {
            "partner_id": 123,
            "accounting_system": AccountingSystem.QUICKBOOKS,
            "callback_uri": "https://octup.com/callback",
        }

        with patch.object(service.state_manager, "validate_state", return_value=state_data):
            with pytest.raises(ValueError, match="Missing realmId"):
                background_tasks = BackgroundTasks()
                await service.handle_callback(callback_dto, background_tasks)

    @pytest.mark.asyncio
    async def test_execute_initial_sync_fetches_and_stores_data(self, service):
        integration_dto = AccountingIntegrationDTO(
            id=uuid4(),
            integration_name="QuickBooks",
            partner_id=123,
            accounting_system=AccountingSystem.QUICKBOOKS,
            connection_details={"realm_id": "realm_456"},
        )

        sync_result = InitialSyncResult(
            integration_id=integration_dto.id,
            partner_id=integration_dto.partner_id,
            accounting_system=AccountingSystem.QUICKBOOKS,
            integration_name="QuickBooks",
            company_name="Acme Corp",
            status=SyncStatus.FULLY_SYNCED,
            sync_completed_at=datetime.now(),
            errors=[],
            accounting_clients=[],
        )

        with patch.object(
            service.strategies[AccountingSystem.QUICKBOOKS],
            "fetch_initial_data",
            new_callable=AsyncMock,
        ) as mock_fetch:
            mock_fetch.return_value = sync_result

            with patch.object(
                service.entity_ref_datastore, "upsert_entity_refs", new_callable=AsyncMock
            ) as mock_upsert:
                mock_upsert.return_value = []

                with patch.object(
                    service, "_post_integration_completed", new_callable=AsyncMock
                ) as mock_post:
                    await service._execute_initial_sync(
                        integration_dto=integration_dto,
                        accounting_system=AccountingSystem.QUICKBOOKS,
                    )

                    mock_fetch.assert_called_once_with(integration_dto)
                    mock_upsert.assert_called_once()
                    mock_post.assert_called_once_with(sync_result)

    @pytest.mark.asyncio
    async def test_execute_initial_sync_handles_strategy_not_found(self, service):
        integration_dto = AccountingIntegrationDTO(
            id=uuid4(),
            integration_name="Unknown",
            partner_id=123,
            accounting_system="unknown_system",
            connection_details={},
        )

        await service._execute_initial_sync(
            integration_dto=integration_dto,
            accounting_system="unknown_system",
        )

    @pytest.mark.asyncio
    async def test_execute_initial_sync_handles_errors_gracefully(self, service):
        integration_dto = AccountingIntegrationDTO(
            id=uuid4(),
            integration_name="QuickBooks",
            partner_id=123,
            accounting_system=AccountingSystem.QUICKBOOKS,
            connection_details={"realm_id": "realm_456"},
        )

        with patch.object(
            service.strategies[AccountingSystem.QUICKBOOKS],
            "fetch_initial_data",
            new_callable=AsyncMock,
        ) as mock_fetch:
            mock_fetch.side_effect = Exception("Sync failed")

            await service._execute_initial_sync(
                integration_dto=integration_dto,
                accounting_system=AccountingSystem.QUICKBOOKS,
            )

    @pytest.mark.asyncio
    async def test_post_integration_completed_sends_notification(self, service):
        sync_result = InitialSyncResult(
            integration_id=uuid4(),
            partner_id=123,
            accounting_system=AccountingSystem.QUICKBOOKS,
            integration_name="QuickBooks",
            company_name="Acme Corp",
            status=SyncStatus.FULLY_SYNCED,
            sync_completed_at=datetime.now(),
            errors=[],
            accounting_clients=[],
        )

        with patch("httpx.AsyncClient") as mock_client:
            mock_response = AsyncMock()
            mock_response.status_code = 200
            mock_response.raise_for_status = Mock()
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )

            with patch("accounting.config.settings.OCTUP_EXTERNAL_BASE_URL", "https://octup.com"):
                await service._post_integration_completed(sync_result)

                mock_client.return_value.__aenter__.return_value.post.assert_called_once()

    @pytest.mark.asyncio
    async def test_post_integration_completed_handles_missing_base_url(self, service):
        sync_result = InitialSyncResult(
            integration_id=uuid4(),
            partner_id=123,
            accounting_system=AccountingSystem.QUICKBOOKS,
            integration_name="QuickBooks",
            company_name="Acme Corp",
            status=SyncStatus.FULLY_SYNCED,
            sync_completed_at=datetime.now(),
            errors=[],
            accounting_clients=[],
        )

        with patch("accounting.config.settings.OCTUP_EXTERNAL_BASE_URL", None):
            await service._post_integration_completed(sync_result)

    @pytest.mark.asyncio
    async def test_post_integration_completed_handles_api_errors(self, service):
        sync_result = InitialSyncResult(
            integration_id=uuid4(),
            partner_id=123,
            accounting_system=AccountingSystem.QUICKBOOKS,
            integration_name="QuickBooks",
            company_name="Acme Corp",
            status=SyncStatus.FULLY_SYNCED,
            sync_completed_at=datetime.now(),
            errors=[],
            accounting_clients=[],
        )

        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                side_effect=Exception("API Error")
            )

            with patch("accounting.config.settings.OCTUP_EXTERNAL_BASE_URL", "https://octup.com"):
                await service._post_integration_completed(sync_result)
