import asyncio
from datetime import datetime
from uuid import UUID

import httpx
from intuitlib.client import AuthClient
from intuitlib.enums import Scopes

from accounting.common.constants import (
    AccountingSystem,
    AccountingSystemName,
    AccountingSystemText,
    DefaultCompanyName,
    HTTPHeaders,
    QuickBooksAPI,
    QuickBooksFields,
    QuickBooksQuery,
    SyncStatus,
    Timeout,
)
from accounting.common.logging.json_logger import setup_logger
from accounting.config import settings
from accounting.db import IntegrationDataStore
from accounting.models.integration_sync import AccountingClientData, InitialSyncResult
from accounting.models.oauth import AuthenticateDTO, SystemInfo
from accounting.services.token_encryption import TokenEncryption
from accounting.strategies.base_strategy import BaseAccountingStrategy
from accounting.services.oauth_state_manager import OAuthStateManager


class QuickBooksAuthStrategy(BaseAccountingStrategy):
    def __init__(self):
        self.client_id = settings.QBO_CLIENT_ID
        self.client_secret = settings.QBO_CLIENT_SECRET
        self.redirect_uri = settings.QBO_REDIRECT_URI
        self.environment = settings.QBO_ENVIRONMENT
        self.api_base_url = QuickBooksAPI.SANDBOX_BASE_URL if self.environment == "sandbox" else QuickBooksAPI.PRODUCTION_BASE_URL
        self._log = setup_logger()
        self.datastore = IntegrationDataStore()
        self.token_encryption = TokenEncryption()
        self.state_manager = OAuthStateManager()

        self.auth_client = AuthClient(
            client_id=self.client_id,
            client_secret=self.client_secret,
            redirect_uri=self.redirect_uri,
            environment=self.environment,
        )


    @property
    def system_id(self) -> str:
        return AccountingSystem.QUICKBOOKS

    @property
    def system_name(self) -> str:
        return AccountingSystemName.QUICKBOOKS

    def get_system_info(self) -> SystemInfo:
        return SystemInfo(
            id=self.system_id,
            name=self.system_name,
            text=AccountingSystemText.QUICKBOOKS,
            enabled=True
        )

    def get_authorization_url(self, auth_dto: AuthenticateDTO) -> str:
        partner_id = auth_dto.partner_id
        state = self.state_manager.generate_state(
            partner_id=partner_id,
            accounting_system=auth_dto.accounting_system,
            callback_uri=str(auth_dto.callback_uri)
        )
        return self.auth_client.get_authorization_url([Scopes.ACCOUNTING], state_token=state)

    async def handle_oauth_callback(
        self,
        code: str,
        realm_id: str | None,
        integration_id: UUID,
        partner_id: int,
    ) -> InitialSyncResult:
        errors: list[str] = []
        company_name = DefaultCompanyName.QUICKBOOKS
        accounting_clients: list[AccountingClientData] = []

        try:
            access_token, refresh_token = await self._exchange_code_for_tokens(code, realm_id)
            await self._store_encrypted_tokens(integration_id, access_token, refresh_token)
        except Exception as e:
            self._log.error(f"Token exchange failed: {str(e)}")
            errors.append(f"Token exchange failed: {str(e)}")
            return InitialSyncResult(
                integration_id=integration_id,
                partner_id=partner_id,
                accounting_system=self.system_id,
                integration_name=self.system_name,
                company_name=company_name,
                status=SyncStatus.SYNC_ERROR,
                sync_completed_at=datetime.utcnow(),
                errors=errors,
                accounting_clients=[],
            )

        try:
            company_name = await self._fetch_company_info(access_token, realm_id)
            if company_name and company_name != DefaultCompanyName.QUICKBOOKS:
                await self.datastore.update_connection_details(
                    integration_id,
                    {"company_name": company_name},
                )
        except Exception as e:
            self._log.warning(f"Company info fetch failed: {str(e)}, using fallback")
            errors.append(f"Company info fetch failed: {str(e)}")

        try:
            raw_data = await self._fetch_initial_data(access_token, realm_id)
            accounting_clients = self._parse_qbo_customers(raw_data)
        except Exception as e:
            self._log.error(f"Customer fetch failed: {str(e)}")
            errors.append(f"Customer fetch failed: {str(e)}")

        status = SyncStatus.FULLY_SYNCED if not errors else SyncStatus.SYNC_ERROR

        return InitialSyncResult(
            integration_id=integration_id,
            partner_id=partner_id,
            accounting_system=self.system_id,
            integration_name=self.system_name,
            company_name=company_name,
            status=status,
            sync_completed_at=datetime.utcnow(),
            errors=errors,
            accounting_clients=accounting_clients,
        )

    async def refresh_tokens(self, integration_id: UUID) -> None:
        integration = await self.datastore.get_integration_by_id(integration_id)
        if not integration:
            raise ValueError(f"Integration {integration_id} not found")

        connection_details = integration.connection_details if isinstance(integration.connection_details, dict) else {}
        encrypted_refresh = connection_details.get("refresh_token")
        if not encrypted_refresh:
            raise ValueError(f"No refresh token found for integration {integration_id}")

        refresh_token = self.token_encryption.decrypt(encrypted_refresh)

        try:
            self.auth_client.refresh_token = refresh_token
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self.auth_client.refresh)

            new_access_token = self.auth_client.access_token
            new_refresh_token = self.auth_client.refresh_token

            if not new_access_token or not new_refresh_token:
                raise ValueError("Failed to refresh tokens from Intuit OAuth")

            await self._store_encrypted_tokens(integration_id, new_access_token, new_refresh_token)
            self._log.info(f"Tokens refreshed for integration {integration_id}")

        except Exception as e:
            self._log.error(f"Token refresh failed for {integration_id}: {str(e)}")
            raise

    async def _exchange_code_for_tokens(self, code: str, realm_id: str | None = None) -> tuple[str, str]:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.auth_client.get_bearer_token, code, realm_id)

        access_token = self.auth_client.access_token
        refresh_token = self.auth_client.refresh_token

        if not access_token or not refresh_token:
            raise ValueError("Failed to obtain tokens from Intuit OAuth")

        return access_token, refresh_token

    async def _store_encrypted_tokens(self, integration_id: UUID, access_token: str, refresh_token: str) -> None:
        encrypted_access = self.token_encryption.encrypt(access_token)
        encrypted_refresh = self.token_encryption.encrypt(refresh_token)
        await self.datastore.update_connection_details(
            integration_id,
            {"access_token": encrypted_access, "refresh_token": encrypted_refresh},
        )

    async def _fetch_company_info(self, access_token: str, realm_id: str | None = None) -> str:
        url = f"{self.api_base_url}/v3/company/{realm_id}/companyinfo/{realm_id}"
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers={
                    HTTPHeaders.AUTHORIZATION: f"Bearer {access_token}",
                    HTTPHeaders.ACCEPT: HTTPHeaders.APPLICATION_JSON
                },
                params={QuickBooksFields.MINOR_VERSION_PARAM: QuickBooksQuery.MINOR_VERSION},
                timeout=Timeout.QUICKBOOKS_COMPANY_INFO,
            )
            response.raise_for_status()
            data = response.json()
            return data[QuickBooksFields.COMPANY_INFO][QuickBooksFields.COMPANY_NAME]

    async def _fetch_initial_data(self, access_token: str, realm_id: str | None = None) -> dict:
        url = f"{self.api_base_url}/v3/company/{realm_id}/query"
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers={
                    HTTPHeaders.AUTHORIZATION: f"Bearer {access_token}",
                    HTTPHeaders.ACCEPT: HTTPHeaders.APPLICATION_JSON
                },
                params={
                    QuickBooksFields.QUERY_PARAM: QuickBooksQuery.SELECT_CUSTOMERS,
                    QuickBooksFields.MINOR_VERSION_PARAM: QuickBooksQuery.MINOR_VERSION
                },
                timeout=Timeout.QUICKBOOKS_CUSTOMER_FETCH,
            )
            response.raise_for_status()
            return response.json()

    def _parse_qbo_customers(self, data: dict) -> list[AccountingClientData]:
        if not isinstance(data, dict):
            return []

        query_response = data.get(QuickBooksFields.QUERY_RESPONSE, {})
        customers = query_response.get(QuickBooksFields.CUSTOMER, [])

        if not isinstance(customers, list):
            return []

        results: list[AccountingClientData] = []
        for customer in customers:
            customer_id = customer.get(QuickBooksFields.ID)
            if not customer_id:
                continue

            display_name = (
                customer.get(QuickBooksFields.DISPLAY_NAME)
                or customer.get(QuickBooksFields.FULLY_QUALIFIED_NAME)
                or str(customer_id)
            )

            parent_ref = None
            parent_data = customer.get(QuickBooksFields.PARENT_REF)
            if isinstance(parent_data, dict):
                parent_ref = parent_data.get(QuickBooksFields.VALUE)

            results.append(
                AccountingClientData(
                    accounting_client_id=str(customer_id),
                    display_name=display_name,
                    parent_ref=parent_ref,
                    is_active=True,
                )
            )

        return results
