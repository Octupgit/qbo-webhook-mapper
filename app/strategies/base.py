from abc import ABC, abstractmethod
from typing import Any

from starlette.requests import Request


class AccountingSystemStrategy(ABC):

    @abstractmethod
    async def get_authorization_url(self, **kwargs: Any) -> str:
        """Generate OAuth authorization URL for the accounting system."""

    @abstractmethod
    async def handle_callback(self, request: Request, **kwargs: Any) -> dict[str, Any]:
        """
        Handle OAuth callback and return connection result.

        Each strategy extracts what it needs from the request object
        (query params, headers, body) and returns its own result structure.
        """

    @abstractmethod
    async def refresh_token(self, token_data: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        """Get a valid access token, refreshing if necessary."""

    @abstractmethod
    async def create_invoice(self, invoice_data: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        """Create an invoice in the accounting system."""

    @abstractmethod
    async def verify_webhook_signature(
        self, payload: bytes, headers: dict[str, str], **kwargs: Any
    ) -> bool:
        """Verify webhook signature from the accounting system."""

    @abstractmethod
    async def process_webhook_event(
        self, event_data: dict[str, Any], **kwargs: Any
    ) -> list[dict[str, Any]]:
        """Process webhook event and return normalized event data."""

    @property
    @abstractmethod
    def system_name(self) -> str:
        """Return the accounting system name identifier."""
