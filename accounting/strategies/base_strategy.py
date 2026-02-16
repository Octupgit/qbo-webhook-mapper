from abc import ABC, abstractmethod

from accounting.models.oauth import AuthenticateDTO, CallbackDTO, SystemInfo


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
        """
        pass

    @abstractmethod
    def get_authorization_url(self, auth_dto: AuthenticateDTO) -> str:
        """
        Generate OAuth authorization URL.
        """
        pass

    @abstractmethod
    async def handle_oauth_callback(
        self,
        callback_dto: CallbackDTO,
    ) -> CallbackDTO:
        """
        Handle complete OAuth callback flow.
        """
        pass

    @abstractmethod
    async def refresh_tokens(self, integration_id: str) -> None:
        """
        Refresh access tokens for integration.
        """
        pass
