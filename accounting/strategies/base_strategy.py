from abc import ABC, abstractmethod
from uuid import UUID

from accounting.models.integration_sync import InitialSyncResult
from accounting.models.oauth import SystemInfo


class BaseAccountingStrategy(ABC):
    """
    Abstract base class for accounting system integrations.

    Only methods called DIRECTLY by the service layer should be defined here.
    Implementation details (token exchange, data fetching, parsing) are private.
    """

    @property
    @abstractmethod
    def system_id(self) -> str:
        """Unique system identifier (e.g., 'quickbooks')"""
        pass

    @property
    @abstractmethod
    def system_name(self) -> str:
        """Display name (e.g., 'QuickBooks Online')"""
        pass

    @abstractmethod
    def get_system_info(self) -> SystemInfo:
        """
        Get system information for UI display.
        Called by: OAuthService.get_systems()
        """
        pass

    @abstractmethod
    def get_authorization_url(self, state: str) -> str:
        """
        Generate OAuth authorization URL.
        Called by: OAuthService.initiate_oauth()
        """
        pass

    @abstractmethod
    async def handle_oauth_callback(
        self,
        code: str,
        realm_id: str | None,
        integration_id: UUID,
        partner_id: int,
    ) -> InitialSyncResult:
        """
        Handle complete OAuth callback flow.

        This is the SINGLE entry point for OAuth callback processing.
        Encapsulates ALL system-specific logic:
        - Exchange code for tokens (if applicable)
        - Fetch company info
        - Fetch and parse customer data
        - Store tokens internally or return them
        - Return standardized InitialSyncResult

        Called by: OAuthService.handle_callback()

        Returns:
            InitialSyncResult with all sync data, errors, and status
        """
        pass

    @abstractmethod
    async def refresh_tokens(self, integration_id: UUID) -> None:
        """
        Refresh access tokens for integration.

        Implementation handles:
        - Retrieving current refresh token from DB
        - Calling system's token refresh API
        - Updating tokens in DB

        Called by: Token refresh service/cron

        Args:
            integration_id: Integration to refresh tokens for
        """
        pass
