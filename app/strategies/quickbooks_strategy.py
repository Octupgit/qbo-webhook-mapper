from datetime import datetime, timedelta

import httpx
from authlib.integrations.httpx_client import AsyncOAuth2Client

from app.config import settings
from app.exceptions.strategy_exceptions import InvoiceCreationError, TokenRefreshError
from app.models.accounting import (
    AuthCallbackResult,
    AuthUrlResult,
    GenericInvoice,
    InvoiceResult,
    TokenResult,
    WebhookEvent,
    WebhookVerificationResult,
)
from app.strategies.base import AccountingSystemStrategy


class QuickBooksStrategy(AccountingSystemStrategy):
    """QuickBooks Online integration strategy."""

    QBO_BASE_URL = {
        "sandbox": "https://sandbox-quickbooks.api.intuit.com",
        "production": "https://quickbooks.api.intuit.com",
    }

    QBO_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2"
    QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"

    def __init__(self):
        self.client_id = settings.QBO_CLIENT_ID
        self.client_secret = settings.QBO_CLIENT_SECRET
        self.environment = settings.QBO_ENVIRONMENT
        self.base_url = self.QBO_BASE_URL.get(self.environment, self.QBO_BASE_URL["sandbox"])

    async def get_authorization_url(
        self, organization_id: str, state: str, redirect_uri: str
    ) -> AuthUrlResult:
        """Generate QuickBooks OAuth authorization URL."""
        client = AsyncOAuth2Client(
            client_id=self.client_id,
            client_secret=self.client_secret,
            redirect_uri=redirect_uri,
        )

        authorization_url, _ = client.create_authorization_url(
            self.QBO_AUTH_URL, scope="com.intuit.quickbooks.accounting", state=state
        )

        return AuthUrlResult(url=authorization_url)

    async def handle_callback(
        self, code: str, state: str, realm_id: str, redirect_uri: str
    ) -> AuthCallbackResult:
        """Exchange authorization code for QuickBooks tokens."""
        client = AsyncOAuth2Client(
            client_id=self.client_id,
            client_secret=self.client_secret,
            redirect_uri=redirect_uri,
        )

        token = await client.fetch_token(self.QBO_TOKEN_URL, code=code)

        return AuthCallbackResult(
            access_token=token["access_token"],
            refresh_token=token["refresh_token"],
            expires_in=token.get("expires_in", 3600),
            realm_id=realm_id,
        )

    async def get_valid_token(
        self, access_token: str, refresh_token: str, expires_at: datetime, realm_id: str
    ) -> TokenResult:
        """
        Get valid QuickBooks token, refreshing if necessary.

        QBO tokens:
        - Access token: Valid for 60 minutes
        - Refresh token: Valid for 100 days, rotates on each use
        """
        is_expired = expires_at - datetime.utcnow() < timedelta(minutes=5)

        if not is_expired:
            return TokenResult(
                access_token=access_token, refresh_token=refresh_token, needs_refresh=False
            )

        try:
            client = AsyncOAuth2Client(
                client_id=self.client_id, client_secret=self.client_secret
            )

            client.token = {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "token_type": "Bearer",
            }

            new_token = await client.refresh_token(self.QBO_TOKEN_URL)

            return TokenResult(
                access_token=new_token["access_token"],
                refresh_token=new_token["refresh_token"],
                expires_in=new_token.get("expires_in", 3600),
                needs_refresh=True,
            )

        except Exception as e:
            raise TokenRefreshError(f"Failed to refresh QuickBooks token: {e!s}") from e

    async def create_invoice(
        self, invoice: GenericInvoice, access_token: str, realm_id: str
    ) -> InvoiceResult:
        """
        Create invoice in QuickBooks Online.

        Transforms generic invoice format to QBO-specific format.
        """
        qbo_invoice = self._transform_to_qbo_format(invoice)

        url = f"{self.base_url}/v3/company/{realm_id}/invoice"

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    json=qbo_invoice,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    },
                    timeout=30.0,
                )

                data = response.json()

                if not response.is_success:
                    error = data.get("Fault", {}).get("Error", [{}])[0]
                    return InvoiceResult(
                        success=False,
                        error=error.get("Message", "Unknown QuickBooks error"),
                        error_code=error.get("code"),
                        error_detail=error.get("Detail"),
                    )

                invoice_data = data.get("Invoice", {})
                return InvoiceResult(
                    success=True,
                    invoice_id=invoice_data.get("Id"),
                    doc_number=invoice_data.get("DocNumber"),
                )

        except httpx.HTTPError as e:
            raise InvoiceCreationError(f"HTTP error creating QuickBooks invoice: {e!s}") from e
        except Exception as e:
            raise InvoiceCreationError(
                f"Unexpected error creating QuickBooks invoice: {e!s}"
            ) from e

    async def verify_webhook_signature(
        self, payload: bytes, signature: str, timestamp: str | None = None
    ) -> WebhookVerificationResult:
        """
        Verify QuickBooks webhook signature.

        QuickBooks uses the Intuit-Signature header for webhook verification.
        The signature is base64-encoded HMAC-SHA256 of the payload.
        """
        try:
            import base64
            import hashlib
            import hmac

            webhook_token = settings.QBO_CLIENT_SECRET

            expected_signature = base64.b64encode(
                hmac.new(webhook_token.encode(), payload, hashlib.sha256).digest()
            ).decode()

            is_valid = hmac.compare_digest(signature, expected_signature)

            return WebhookVerificationResult(
                valid=is_valid,
                error=None if is_valid else "Invalid webhook signature",
            )

        except Exception as e:
            return WebhookVerificationResult(valid=False, error=f"Signature verification failed: {e!s}")

    async def process_webhook_event(
        self, event: dict, organization_id: str
    ) -> list[WebhookEvent]:
        """
        Process QuickBooks webhook event.

        QBO webhooks contain an eventNotifications array, each with multiple entities.
        Normalizes the QBO-specific format to generic WebhookEvent objects.
        """
        events = []

        event_notifications = event.get("eventNotifications", [])

        for notification in event_notifications:
            realm_id = notification.get("realmId")
            data_change_event = notification.get("dataChangeEvent", {})
            entities = data_change_event.get("entities", [])

            for entity in entities:
                entity_name = entity.get("name")
                entity_id = entity.get("id")
                operation = entity.get("operation")

                is_deleted = operation == "Delete"

                events.append(
                    WebhookEvent(
                        event_type=f"{entity_name.lower()}.{operation.lower()}",
                        entity_type=entity_name,
                        entity_id=entity_id,
                        entity_name=None,
                        is_deleted=is_deleted,
                        raw_event={"realm_id": realm_id, "entity": entity},
                    )
                )

        return events

    @property
    def system_name(self) -> str:
        """Return 'quickbooks' as the system identifier."""
        return "quickbooks"

    def _transform_to_qbo_format(self, invoice: GenericInvoice) -> dict:
        """
        Transform generic invoice format to QuickBooks format.

        Maps Octup's generic invoice structure to QBO's Invoice API format.
        """
        qbo_invoice = {
            "CustomerRef": {"value": invoice.customer_id},
            "TxnDate": invoice.issue_date.strftime("%Y-%m-%d"),
            "CurrencyRef": {"value": invoice.currency},
            "Line": [],
        }

        if invoice.due_date:
            qbo_invoice["DueDate"] = invoice.due_date.strftime("%Y-%m-%d")

        if invoice.memo:
            qbo_invoice["CustomerMemo"] = {"value": invoice.memo}

        if invoice.octup_invoice_number:
            qbo_invoice["DocNumber"] = invoice.octup_invoice_number

        for line_item in invoice.line_items:
            qbo_line = {
                "Amount": line_item.amount,
                "DetailType": "SalesItemLineDetail",
                "SalesItemLineDetail": {
                    "Qty": line_item.quantity,
                    "UnitPrice": line_item.unit_price,
                },
                "Description": line_item.description,
            }

            if line_item.item_id:
                qbo_line["SalesItemLineDetail"]["ItemRef"] = {"value": line_item.item_id}

            qbo_invoice["Line"].append(qbo_line)

        return qbo_invoice
