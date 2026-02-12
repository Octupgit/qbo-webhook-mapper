from datetime import datetime
from typing import Any

import httpx
from intuitlib.client import AuthClient
from intuitlib.enums import Scopes
from starlette.requests import Request

from accounting.config import settings
from accounting.models.accounting import (
    BaseAuthResult,
    BaseInvoiceData,
    BaseInvoiceResult,
    BaseTokenResult,
    BaseWebhookEvent,
    AccountingSystem,
)
from accounting.strategies.base import AccountingSystemStrategy


class QuickBooksAuthResult(BaseAuthResult):
    realm_id: str
    access_token: str
    refresh_token: str
    expires_at: datetime
    refresh_expires_at: datetime
    customers: list[dict[str, Any]]


class QuickBooksTokenResult(BaseTokenResult):
    access_token: str
    refresh_token: str
    expires_at: datetime
    refresh_expires_at: datetime


class QuickBooksAuthStrategy(AccountingSystemStrategy):
    def __init__(self) -> None:
        self.client_id = settings.QBO_CLIENT_ID
        self.client_secret = settings.QBO_CLIENT_SECRET
        self.redirect_uri = settings.QBO_REDIRECT_URI
        self.environment = settings.QBO_ENVIRONMENT

        self.auth_client = AuthClient(
            client_id=self.client_id,
            client_secret=self.client_secret,
            redirect_uri=self.redirect_uri,
            environment=self.environment,
        )

    @property
    def system_name(self) -> str:
        return AccountingSystem.QUICKBOOKS.value

    @property
    def _api_base_url(self) -> str:
        if self.environment == "production":
            return "https://quickbooks.api.intuit.com"
        return "https://sandbox-quickbooks.api.intuit.com"

    async def get_authorization_url(self, **kwargs: Any) -> str:
        state = kwargs.get("state", "")

        return self.auth_client.get_authorization_url([Scopes.ACCOUNTING], state_token=state)

    async def handle_callback(self, request: Request, **kwargs: Any) -> QuickBooksAuthResult:
        code = request.query_params.get("code")
        realm_id = request.query_params.get("realmId")

        if not code or not realm_id:
            raise ValueError("Missing code or realmId in callback")

        self.auth_client.get_bearer_token(code, realm_id=realm_id)

        access_token = self.auth_client.access_token
        refresh_token = self.auth_client.refresh_token
        expires_at = datetime.fromtimestamp(self.auth_client.x_refresh_token_expires_in)
        refresh_expires_at = datetime.fromtimestamp(self.auth_client.expires_in)

        customers = await self._fetch_customers(access_token, realm_id)

        return QuickBooksAuthResult(
            realm_id=realm_id,
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=expires_at,
            refresh_expires_at=refresh_expires_at,
            customers=customers,
        )

    async def refresh_token(self, token_data: dict[str, Any], **kwargs: Any) -> QuickBooksTokenResult:
        refresh_token = token_data.get("refresh_token")

        if not refresh_token:
            raise ValueError("Missing refresh_token in token_data")

        self.auth_client.refresh(refresh_token=refresh_token)

        return QuickBooksTokenResult(
            access_token=self.auth_client.access_token,
            refresh_token=self.auth_client.refresh_token,
            expires_at=datetime.fromtimestamp(self.auth_client.expires_in),
            refresh_expires_at=datetime.fromtimestamp(self.auth_client.x_refresh_token_expires_in),
        )

    async def _fetch_customers(self, access_token: str, realm_id: str) -> list[dict[str, Any]]:
        query = "select * from Customer maxresults 1000"
        url = f"{self._api_base_url}/v3/company/{realm_id}/query"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                params={"query": query},
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json"
                }
            )

            if response.status_code != 200:
                error_detail = response.text
                raise Exception(f"Customer fetch failed: {response.status_code} - {error_detail}")

            result = response.json()

        customers = []
        for customer in result.get("QueryResponse", {}).get("Customer", []):
            customers.append({
                "accounting_entity_id": str(customer["Id"]),
                "display_name": customer.get("DisplayName", "")
            })

        return customers

    async def create_invoice(self, invoice_data: BaseInvoiceData, **kwargs: Any) -> BaseInvoiceResult:
        raise NotImplementedError("Invoice creation will be implemented in OD-7881")

    async def verify_webhook_signature(self, payload: bytes, headers: dict[str, str], **kwargs: Any) -> bool:
        raise NotImplementedError("Webhook verification will be implemented in OD-7886")

    async def process_webhook_event(self, event_data: dict[str, Any], **kwargs: Any) -> list[BaseWebhookEvent]:
        raise NotImplementedError("Webhook processing will be implemented in OD-7886")
