from dataclasses import dataclass
from datetime import datetime
from typing import cast
from uuid import UUID

import httpx
from pydantic import HttpUrl

from accounting.common.logging.json_logger import setup_logger
from accounting.config import settings
from accounting.db import IntegrationDataStore
from accounting.models.oauth import (
    AuthenticateRequestDTO,
    AuthenticateResponseDTO,
    CallbackQueryDTO,
    CallbackResponseDTO,
    SystemDTO,
    SystemsResponseDTO,
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

        self.strategies = {"quickbooks": QuickBooksAuthStrategy()}

    async def get_systems(self) -> SystemsResponseDTO:
        systems = [SystemDTO(id="quickbooks", name="QuickBooks Online", text="Connect to QuickBooks", enabled=True)]
        return SystemsResponseDTO(systems=systems)

    async def initiate_oauth(self, partner_id: int, request: AuthenticateRequestDTO) -> AuthenticateResponseDTO:
        state = self.state_manager.generate_state(partner_id=partner_id, callback_uri=str(request.callback_uri))

        strategy = self.strategies.get(request.accounting_system)
        if not strategy:
            raise ValueError(f"Unsupported accounting system: {request.accounting_system}")

        auth_url = strategy.get_authorization_url(state)

        self._log.info(f"OAuth initiated: partner_id={partner_id}, system={request.accounting_system}")

        return AuthenticateResponseDTO(authorization_url=cast(HttpUrl, auth_url))

    async def handle_callback(
        self, callback: CallbackQueryDTO, accounting_system: str
    ) -> tuple[CallbackResponseDTO, CallbackContext | None]:
        try:
            state_data = self.state_manager.validate_state(callback.state)
            partner_id = state_data["partner_id"]

            strategy = self.strategies.get(accounting_system)
            if not strategy:
                raise ValueError(f"Unsupported accounting system: {accounting_system}")

            if not callback.realmId:
                raise ValueError("Missing realmId for OAuth callback")

            access_token, refresh_token = await strategy.exchange_code_for_tokens(callback.code, callback.realmId)

            encrypted_access = self.token_encryption.encrypt(access_token)
            encrypted_refresh = self.token_encryption.encrypt(refresh_token)

            integration_id = await self.datastore.create_integration(
                partner_id=partner_id,
                accounting_system=accounting_system,
                realm_id=callback.realmId,
                company_name=self._default_company_name(accounting_system),
                access_token=encrypted_access,
                refresh_token=encrypted_refresh,
            )

            self._log.info(
                f"Integration created: id={integration_id}, partner={partner_id}, system={accounting_system}"
            )

            response = CallbackResponseDTO(status="success", integration_id=integration_id, error_reason=None)
            context = CallbackContext(
                integration_id=integration_id,
                partner_id=partner_id,
                accounting_system=accounting_system,
                realm_id=callback.realmId,
                access_token=access_token,
            )
            return response, context

        except ValueError as e:
            self._log.error(f"Callback validation error: {str(e)}")
            return CallbackResponseDTO(status="error", integration_id=None, error_reason=str(e)), None
        except Exception as e:
            self._log.exception(f"Callback processing error: {str(e)}")
            return CallbackResponseDTO(status="error", integration_id=None, error_reason="Internal error"), None

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
            errors.append("company_info_fetch_failed")

        try:
            initial_data = await strategy.fetch_initial_data(context.access_token, context.realm_id)
            accounting_clients = self._extract_customers(initial_data)
        except Exception as e:
            self._log.error(f"Initial data fetch failed: {str(e)}")
            accounting_clients = []
            errors.append("initial_data_fetch_failed")

        status = "fully_synced" if not errors else "sync_error"
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
        if accounting_system == "quickbooks":
            return "QuickBooks Account"
        return "Accounting Account"

    def _integration_name(self, accounting_system: str) -> str:
        if accounting_system == "quickbooks":
            return "QuickBooks Online"
        return accounting_system

    def _extract_customers(self, data: dict) -> list[dict]:
        if not isinstance(data, dict):
            return []
        query_response = data.get("QueryResponse", {})
        customers = query_response.get("Customer", [])
        if not isinstance(customers, list):
            return []
        results: list[dict] = []
        for customer in customers:
            customer_id = customer.get("Id")
            if not customer_id:
                continue
            display_name = customer.get("DisplayName") or customer.get("FullyQualifiedName") or str(customer_id)
            parent_ref = None
            parent_data = customer.get("ParentRef")
            if isinstance(parent_data, dict):
                parent_ref = parent_data.get("value")
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
