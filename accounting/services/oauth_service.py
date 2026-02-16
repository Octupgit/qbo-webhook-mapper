from dataclasses import dataclass
from datetime import datetime
from typing import cast
from uuid import UUID

import httpx
from pydantic import HttpUrl

from accounting.common.constants import (
    AccountingSystem,
    CallbackStatus,
    DefaultCompanyName,
    ErrorMessage,
    QuickBooksFields,
    SyncErrorCode,
    SyncStatus,
)
from accounting.common.logging.json_logger import setup_logger
from accounting.config import settings
from accounting.db import IntegrationDataStore
from accounting.models.oauth import (
    AuthenticateDTO,
    CallbackDTO,
    SystemInfo,
    SystemsDTO,
)
from accounting.services.oauth_state_manager import OAuthStateManager
from accounting.services.token_encryption import TokenEncryption
from accounting.strategies import QuickBooksAuthStrategy


@dataclass
class CallbackContext:
    integration_id: UUID
    partner_id: int
    accounting_system: str
    realm_id: str | None
    access_token: str


class OAuthService:
    def __init__(self):
        self.state_manager = OAuthStateManager()
        self.token_encryption = TokenEncryption()
        self.datastore = IntegrationDataStore()
        self._log = setup_logger()

        self.strategies = {AccountingSystem.QUICKBOOKS: QuickBooksAuthStrategy()}

    async def get_systems(self) -> SystemsDTO:
        systems = [SystemInfo(id=AccountingSystem.QUICKBOOKS, name=AccountingSystemName.QUICKBOOKS, text="Connect to QuickBooks", enabled=True)]
        return SystemsDTO(systems=systems)

    async def initiate_oauth(self, partner_id: int, auth_dto: AuthenticateDTO) -> AuthenticateDTO:
        state = self.state_manager.generate_state(partner_id=partner_id, callback_uri=str(auth_dto.callback_uri))

        strategy = self.strategies.get(auth_dto.accounting_system)
        if not strategy:
            raise ValueError(f"Unsupported accounting system: {auth_dto.accounting_system}")

        auth_url = strategy.get_authorization_url(state)

        self._log.info(f"OAuth initiated: partner_id={partner_id}, system={auth_dto.accounting_system}")

        auth_dto.authorization_url = cast(HttpUrl, auth_url)
        return auth_dto

    async def handle_callback(
        self, callback_dto: CallbackDTO, accounting_system: str
    ) -> tuple[CallbackDTO, CallbackContext | None]:
        try:
            state_data = self.state_manager.validate_state(callback_dto.state)
            partner_id = state_data["partner_id"]

            strategy = self.strategies.get(accounting_system)
            if not strategy:
                raise ValueError(f"Unsupported accounting system: {accounting_system}")

            if not callback_dto.realmId:
                raise ValueError("Missing realmId for OAuth callback")

            access_token, refresh_token = await strategy.exchange_code_for_tokens(
                callback_dto.code, callback_dto.realmId
            )

            encrypted_access = self.token_encryption.encrypt(access_token)
            encrypted_refresh = self.token_encryption.encrypt(refresh_token)

            integration_id = await self.datastore.create_integration(
                partner_id=partner_id,
                accounting_system=accounting_system,
                realm_id=callback_dto.realmId,
                company_name=self._default_company_name(accounting_system),
                access_token=encrypted_access,
                refresh_token=encrypted_refresh,
            )

            self._log.info(
                f"Integration created: id={integration_id}, partner={partner_id}, system={accounting_system}"
            )

            callback_dto.status = CallbackStatus.SUCCESS
            callback_dto.integration_id = integration_id
            context = CallbackContext(
                integration_id=integration_id,
                partner_id=partner_id,
                accounting_system=accounting_system,
                realm_id=callback_dto.realmId,
                access_token=access_token,
            )
            return callback_dto, context

        except ValueError as e:
            self._log.error(f"Callback validation error: {str(e)}")
            callback_dto.status = CallbackStatus.ERROR
            callback_dto.error_reason = str(e)
            return callback_dto, None
        except Exception as e:
            self._log.exception(f"Callback processing error: {str(e)}")
            callback_dto.status = CallbackStatus.ERROR
            callback_dto.error_reason = ErrorMessage.INTERNAL_ERROR
            return callback_dto, None

    async def process_initial_sync(self, context: CallbackContext) -> None:
        strategy = self.strategies.get(context.accounting_system)
        if not strategy:
            self._log.error(f"Unsupported accounting system: {context.accounting_system}")
            return

        errors: list[str] = []
        company_name = self._default_company_name(context.accounting_system)

        try:
            company_name = await strategy.fetch_company_info(context.access_token, context.realm_id)
            if company_name:
                await self.datastore.update_company_name(context.integration_id, company_name)
        except Exception as e:
            self._log.error(f"Company info fetch failed: {str(e)}")
            errors.append(SyncErrorCode.COMPANY_INFO_FETCH_FAILED)

        try:
            initial_data = await strategy.fetch_initial_data(context.access_token, context.realm_id)
            accounting_clients = self._extract_customers(initial_data)
        except Exception as e:
            self._log.error(f"Initial data fetch failed: {str(e)}")
            accounting_clients = []
            errors.append(SyncErrorCode.INITIAL_DATA_FETCH_FAILED)

        status = SyncStatus.FULLY_SYNCED if not errors else SyncStatus.SYNC_ERROR
        payload = {
            "metadata": {
                "integration_id": str(context.integration_id),
                "integration_name": self._integration_name(context.accounting_system),
                "accounting_system": context.accounting_system,
                "company_name": company_name,
                "partner_id": context.partner_id,
                "status": status,
                "sync_completed_at": datetime.utcnow().isoformat(),
                "errors": errors,
            },
            "accounting_clients": accounting_clients,
        }

        await self._post_integration_completed(payload)

    def _default_company_name(self, accounting_system: str) -> str:
        if accounting_system == AccountingSystem.QUICKBOOKS:
            return DefaultCompanyName.QUICKBOOKS
        return DefaultCompanyName.GENERIC

    def _integration_name(self, accounting_system: str) -> str:
        if accounting_system == AccountingSystem.QUICKBOOKS:
            return AccountingSystemName.QUICKBOOKS
        return accounting_system

    def _extract_customers(self, data: dict) -> list[dict]:
        if not isinstance(data, dict):
            return []
        query_response = data.get(QuickBooksFields.QUERY_RESPONSE, {})
        customers = query_response.get(QuickBooksFields.CUSTOMER, [])
        if not isinstance(customers, list):
            return []
        results: list[dict] = []
        for customer in customers:
            customer_id = customer.get(QuickBooksFields.ID)
            if not customer_id:
                continue
            display_name = customer.get(QuickBooksFields.DISPLAY_NAME) or customer.get(QuickBooksFields.FULLY_QUALIFIED_NAME) or str(customer_id)
            parent_ref = None
            parent_data = customer.get(QuickBooksFields.PARENT_REF)
            if isinstance(parent_data, dict):
                parent_ref = parent_data.get(QuickBooksFields.VALUE)
            results.append(
                {"accounting_client_id": str(customer_id), "display_name": display_name, "parent_ref": parent_ref}
            )
        return results

    async def _post_integration_completed(self, payload: dict) -> None:
        if not settings.OCTUP_EXTERNAL_BASE_URL:
            self._log.error("OCTUP_EXTERNAL_BASE_URL is not configured")
            return

        base_url = settings.OCTUP_EXTERNAL_BASE_URL.rstrip("/")
        url = f"{base_url}/api/v1/external/accounting/integration"

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, timeout=15.0)
                response.raise_for_status()
        except Exception as e:
            self._log.error(f"Failed to notify Octup: {str(e)}")
