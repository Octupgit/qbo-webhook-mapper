import asyncio

import httpx
from intuitlib.client import AuthClient
from intuitlib.enums import Scopes

from accounting.common.constants import (
    DefaultCompanyName,
    HTTPHeaders,
    QuickBooksFields,
    QuickBooksQuery,
    Timeout,
)
from accounting.common.logging.json_logger import setup_logger
from accounting.config import settings
from accounting.strategies.base_strategy import BaseAccountingStrategy


class QuickBooksAuthStrategy(BaseAccountingStrategy):
    def __init__(self):
        self.client_id = settings.QBO_CLIENT_ID
        self.client_secret = settings.QBO_CLIENT_SECRET
        self.redirect_uri = settings.QBO_REDIRECT_URI
        self.environment = settings.QBO_ENVIRONMENT
        self._log = setup_logger()

        self.auth_client = AuthClient(
            client_id=self.client_id,
            client_secret=self.client_secret,
            redirect_uri=self.redirect_uri,
            environment=self.environment,
        )

    def get_authorization_url(self, state: str) -> str:
        return self.auth_client.get_authorization_url([Scopes.ACCOUNTING], state_token=state)

    async def exchange_code_for_tokens(self, code: str, realm_id: str | None = None) -> tuple[str, str]:
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self.auth_client.get_bearer_token, code, realm_id)

            access_token = self.auth_client.access_token
            refresh_token = self.auth_client.refresh_token

            if not access_token or not refresh_token:
                raise ValueError("Failed to obtain tokens from Intuit OAuth")

            return access_token, refresh_token
        except Exception as e:
            self._log.error(f"Token exchange failed: {str(e)}")
            raise

    async def fetch_company_info(self, access_token: str, realm_id: str | None = None) -> str:
        try:
            url = f"{self.api_base_url}/v3/company/{realm_id}/companyinfo/{realm_id}"
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url,
                    headers={HTTPHeaders.AUTHORIZATION: f"Bearer {access_token}", HTTPHeaders.ACCEPT: "application/json"},
                    params={"minorversion": QuickBooksQuery.MINOR_VERSION},
                    timeout=Timeout.QUICKBOOKS_COMPANY_INFO,
                )
                response.raise_for_status()
                data = response.json()
                return data[QuickBooksFields.COMPANY_INFO][QuickBooksFields.COMPANY_NAME]
        except Exception as e:
            self._log.warning(f"CompanyInfo fetch failed: {str(e)}, using fallback")
            return DefaultCompanyName.QUICKBOOKS

    async def fetch_initial_data(self, access_token: str, realm_id: str | None = None) -> dict:
        try:
            url = f"{self.api_base_url}/v3/company/{realm_id}/query"
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url,
                    headers={HTTPHeaders.AUTHORIZATION: f"Bearer {access_token}", HTTPHeaders.ACCEPT: "application/json"},
                    params={"query": QuickBooksQuery.SELECT_CUSTOMERS, "minorversion": QuickBooksQuery.MINOR_VERSION},
                    timeout=Timeout.QUICKBOOKS_CUSTOMER_FETCH,
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            self._log.error(f"Customer fetch failed: {str(e)}")
            return {QuickBooksFields.QUERY_RESPONSE: {}}

    async def refresh_access_token(self, refresh_token: str) -> tuple[str, str]:
        try:
            self.auth_client.refresh_token = refresh_token

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self.auth_client.refresh)

            access_token = self.auth_client.access_token
            new_refresh_token = self.auth_client.refresh_token

            if not access_token or not new_refresh_token:
                raise ValueError("Failed to refresh tokens from Intuit OAuth")

            return access_token, new_refresh_token
        except Exception as e:
            self._log.error(f"Token refresh failed: {str(e)}")
            raise
