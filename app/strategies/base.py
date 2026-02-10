from abc import ABC, abstractmethod
from datetime import datetime

from app.models.accounting import (
    AuthCallbackResult,
    AuthUrlResult,
    GenericInvoice,
    InvoiceResult,
    TokenResult,
    WebhookEvent,
    WebhookVerificationResult,
)


class AccountingSystemStrategy(ABC):
    """
    Abstract base class for accounting system integrations.

    Each accounting system (QuickBooks, Xero, Sage, etc.) implements this interface
    to provide system-specific functionality for OAuth, token management, invoice
    creation, and webhook processing.

    Strategies are stateless and focus on external API interactions. Database
    operations and encryption are handled by service layer.
    """

    @abstractmethod
    async def get_authorization_url(
        self, organization_id: str, state: str, redirect_uri: str
    ) -> AuthUrlResult:
        """
        Generate OAuth authorization URL for the accounting system.

        Args:
            organization_id: Octup organization ID initiating the connection
            state: HMAC-signed state parameter for CSRF protection
            redirect_uri: OAuth callback URI

        Returns:
            AuthUrlResult with the authorization URL to redirect the user to
        """

    @abstractmethod
    async def handle_callback(
        self, code: str, state: str, realm_id: str, redirect_uri: str
    ) -> AuthCallbackResult:
        """
        Exchange authorization code for access and refresh tokens.

        Args:
            code: Authorization code from OAuth callback
            state: State parameter for verification
            realm_id: Company/realm ID from the accounting system
            redirect_uri: OAuth callback URI (must match authorization request)

        Returns:
            AuthCallbackResult with tokens and realm info
        """

    @abstractmethod
    async def get_valid_token(
        self, access_token: str, refresh_token: str, expires_at: datetime, realm_id: str
    ) -> TokenResult:
        """
        Get a valid access token, refreshing if necessary.

        This method checks if the current access token is expired (with buffer)
        and refreshes it if needed. Returns new tokens if refreshed, or original
        if still valid.

        Args:
            access_token: Current access token (decrypted)
            refresh_token: Current refresh token (decrypted)
            expires_at: Token expiration timestamp
            realm_id: Company/realm ID

        Returns:
            TokenResult with valid token (may be refreshed)
        """

    @abstractmethod
    async def create_invoice(
        self, invoice: GenericInvoice, access_token: str, realm_id: str
    ) -> InvoiceResult:
        """
        Create an invoice in the accounting system.

        Transforms the generic invoice format to the system-specific format
        and makes the API call to create the invoice.

        Args:
            invoice: Generic invoice data (Octup format)
            access_token: Valid access token (decrypted)
            realm_id: Company/realm ID

        Returns:
            InvoiceResult with invoice ID or error details
        """

    @abstractmethod
    async def verify_webhook_signature(
        self, payload: bytes, signature: str, timestamp: str | None = None
    ) -> WebhookVerificationResult:
        """
        Verify webhook signature from the accounting system.

        Different systems use different signature methods (HMAC, JWT, custom).
        This method implements the system-specific verification logic.

        Args:
            payload: Raw webhook payload bytes
            signature: Signature from webhook headers
            timestamp: Optional timestamp from webhook headers

        Returns:
            WebhookVerificationResult indicating if signature is valid
        """

    @abstractmethod
    async def process_webhook_event(
        self, event: dict, organization_id: str
    ) -> list[WebhookEvent]:
        """
        Process webhook event from the accounting system.

        Parses the system-specific webhook payload and normalizes it into
        generic WebhookEvent objects for storage and processing.

        Args:
            event: Raw webhook event payload
            organization_id: Octup organization ID

        Returns:
            List of normalized WebhookEvent objects (one webhook may contain multiple events)
        """

    @property
    @abstractmethod
    def system_name(self) -> str:
        """
        Return the accounting system name identifier.

        Returns:
            System name (e.g., 'quickbooks', 'xero', 'sage')
        """
