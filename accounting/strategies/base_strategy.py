from abc import ABC, abstractmethod


from accounting.models.oauth import SystemInfo

class BaseAccountingStrategy(ABC):
    @abstractmethod
    def get_authorization_url(self, state: str) -> str:
        pass

    @abstractmethod
    async def exchange_code_for_tokens(self, code: str, realm_id: str | None = None) -> tuple[str, str]:
        pass

    @abstractmethod
    async def fetch_initial_data(self, access_token: str, realm_id: str | None = None) -> dict:
        pass

    @abstractmethod
    async def refresh_access_token(self, refresh_token: str) -> tuple[str, str]:
        pass

    @abstractmethod
    @staticmethod
    def get_system_info() -> SystemInfo:
        pass
