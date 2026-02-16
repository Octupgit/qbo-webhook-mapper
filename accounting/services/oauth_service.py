from typing import cast

import httpx
from fastapi import BackgroundTasks
from fastapi.responses import RedirectResponse
from pydantic import HttpUrl

from accounting.common.constants import (
    AccountingEntityType,
    AccountingSystem,
    APIPath,
    CallbackStatus,
    ErrorMessage,
    Timeout,
)
from accounting.common.logging.json_logger import setup_logger
from accounting.config import settings
from accounting.db import IntegrationDataStore
from accounting.db.entity_ref_datastore import IntegrationEntityRefDataStore
from accounting.db.tables import AccountingIntegrationDBModel, IntegrationEntityRefDBModel
from accounting.models.integration_sync import InitialSyncResult
from accounting.models.oauth import (
    AccountingIntegrationDTO,
    AuthenticateDTO,
    CallbackDTO,
    SystemsDTO,
)
from accounting.services.oauth_state_manager import OAuthStateManager
from accounting.services.token_encryption import TokenEncryption
from accounting.strategies import QuickBooksAuthStrategy


class OAuthService:
    def __init__(self):
        self.state_manager = OAuthStateManager()
        self.token_encryption = TokenEncryption()
        self.datastore = IntegrationDataStore()
        self.entity_ref_datastore = IntegrationEntityRefDataStore()
        self._log = setup_logger()

        self.strategies = {
            AccountingSystem.QUICKBOOKS: QuickBooksAuthStrategy(),
        }

    async def get_systems(self) -> SystemsDTO:
        systems = [strategy.get_system_info() for strategy in self.strategies.values()]
        return SystemsDTO(systems=systems)


    async def initiate_oauth(self, auth_dto: AuthenticateDTO) -> AuthenticateDTO:
        strategy = self.strategies.get(auth_dto.accounting_system)
        if not strategy:
            raise ValueError(ErrorMessage.UNSUPPORTED_SYSTEM.format(system=auth_dto.accounting_system))

        auth_url = strategy.get_authorization_url(auth_dto)
        auth_dto.authorization_url = cast(HttpUrl, auth_url)

        self._log.info(f"OAuth initiated: partner_id={auth_dto.partner_id}, system={auth_dto.accounting_system}")
        return auth_dto

    async def handle_callback(
        self, callback_dto: CallbackDTO, background_tasks: BackgroundTasks
    ) -> RedirectResponse:
        state_data = self.state_manager.validate_state(callback_dto.state)
        partner_id = state_data["partner_id"]
        accounting_system = state_data["accounting_system"]
        callback_uri = state_data["callback_uri"]

        strategy = self.strategies.get(accounting_system)
        if not strategy:
            raise ValueError(ErrorMessage.UNSUPPORTED_SYSTEM.format(system=accounting_system))

        if not callback_dto.realmId:
            raise ValueError(ErrorMessage.MISSING_REALM_ID)

        integration_dto = AccountingIntegrationDTO.from_request(
            partner_id=partner_id,
            accounting_system=accounting_system,
            integration_name=strategy.system_name,
            connection_details={},
            is_active=True,
        )

        integration_dto = await strategy.get_connection_details_from_callback(
            callback_dto=callback_dto,
            integration_dto=integration_dto,
        )

        integration = integration_dto.to_db_rows()[0]
        integration_ids = await self.datastore.upsert_integrations([integration])
        integration_id = integration_ids[0]

        self._log.info(
            f"Integration created: id={integration_id}, partner={partner_id}, system={accounting_system}"
        )

        integration_dto.id = integration_id

        background_tasks.add_task(
            self._execute_initial_sync,
            integration_dto=integration_dto,
            accounting_system=accounting_system,
        )

        redirect_url = (
            f"{callback_uri}?status=success"
            f"&accounting_system={accounting_system}"
            f"&integration_id={integration_id}"
        )
        return RedirectResponse(url=redirect_url)

    async def _execute_initial_sync(
        self,
        integration_dto: AccountingIntegrationDTO,
        accounting_system: str,
    ) -> None:
        try:
            strategy = self.strategies.get(accounting_system)
            if not strategy:
                self._log.error(f"Strategy not found for {accounting_system}")
                return

            sync_result = await strategy.fetch_initial_data(integration_dto)

            self._log.info(
                f"Initial sync completed: id={integration_dto.id}, "
                f"partner={integration_dto.partner_id}, status={sync_result.status}"
            )

            entity_refs = sync_result.to_db_rows()
            await self.entity_ref_datastore.upsert_entity_refs(entity_refs)
            self._log.info(f"Stored {len(entity_refs)} customer refs for integration {integration_dto.id}")

            await self._post_integration_completed(sync_result)

        except Exception as e:
            self._log.error(
                f"Background sync failed for integration {integration_dto.id}: {str(e)}",
                exc_info=True,
            )

    async def _post_integration_completed(self, sync_result: InitialSyncResult) -> None:
        if not settings.OCTUP_EXTERNAL_BASE_URL:
            self._log.error("OCTUP_EXTERNAL_BASE_URL is not configured")
            return

        base_url = settings.OCTUP_EXTERNAL_BASE_URL.rstrip("/")
        url = f"{base_url}{APIPath.EXTERNAL_INTEGRATION}"
        payload = sync_result.to_response()

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, timeout=Timeout.OCTUP_NOTIFICATION)
                response.raise_for_status()
                self._log.info(f"Successfully notified Octup for integration {sync_result.integration_id}")
        except Exception as e:
            self._log.error(f"Failed to notify Octup for integration {sync_result.integration_id}: {str(e)}")
