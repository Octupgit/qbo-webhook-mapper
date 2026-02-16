from abc import ABC, abstractmethod

from accounting.models.oauth import AccountingIntegrationDTO, AuthenticateDTO, CallbackDTO, SystemInfo
from accounting.models.integration_sync import InitialSyncResult

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
    async def get_connection_details_from_callback(
        self,
        callback_dto: CallbackDTO,
        integration_dto: AccountingIntegrationDTO,
    ) -> AccountingIntegrationDTO:
        """
        Handle complete OAuth callback flow.
        """
        pass

    @abstractmethod
    async def fetch_initial_data(
        self,
        integration_dto: AccountingIntegrationDTO,
    ) -> InitialSyncResult:
        """
        Update integration with connection details.
        """
        pass

    @abstractmethod
    async def refresh_tokens(self, integration_id: str) -> None:
        """
        Refresh access tokens for integration.
        """
        pass
