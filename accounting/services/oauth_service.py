from typing import cast

import httpx
from pydantic import HttpUrl

from accounting.common.constants import (
    AccountingSystem,
    APIPath,
    CallbackStatus,
    ErrorMessage,
    Timeout,
)
from accounting.common.logging.json_logger import setup_logger
from accounting.config import settings
from accounting.db import IntegrationDataStore
from accounting.db.tables import AccountingIntegrationDBModel
from accounting.models.integration_sync import InitialSyncResult
from accounting.models.oauth import (
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

    async def handle_callback(self, callback_dto: CallbackDTO) -> CallbackDTO:
        try:
            state_data = self.state_manager.validate_state(callback_dto.state)
            partner_id = state_data["partner_id"]
            accounting_system = state_data["accounting_system"]

            strategy = self.strategies.get(accounting_system)
            if not strategy:
                raise ValueError(ErrorMessage.UNSUPPORTED_SYSTEM.format(system=accounting_system))

            if not callback_dto.realmId:
                raise ValueError(ErrorMessage.MISSING_REALM_ID)

            connection_details = {
                "realm_id": callback_dto.realmId,
                "company_name": strategy.system_name,
            }
            integration = AccountingIntegrationDBModel(
                partner_id=partner_id,
                accounting_system=accounting_system,
                integration_name=strategy.system_name,
                connection_details=connection_details,
            )
            integration_ids = await self.datastore.upsert_integrations([integration])
            integration_id = integration_ids[0]

            sync_result = await strategy.handle_oauth_callback(
                code=callback_dto.code,
                realm_id=callback_dto.realmId,
                integration_id=integration_id,
                partner_id=partner_id,
            )

            self._log.info(
                f"Integration completed: id={integration_id}, partner={partner_id}, "
                f"system={accounting_system}, status={sync_result.status}"
            )

            callback_dto.status = CallbackStatus.SUCCESS
            callback_dto.integration_id = integration_id

            return callback_dto

        except Exception as e:
            self._log.error(f"Callback processing error: {str(e)}")
            callback_dto.status = CallbackStatus.ERROR
            callback_dto.error_reason = ErrorMessage.INTERNAL_ERROR
            return callback_dto

    async def post_integration_completed(self, sync_result: InitialSyncResult) -> None:
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
