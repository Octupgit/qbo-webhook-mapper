from abc import ABC, abstractmethod
from typing import Dict, Tuple

class BaseAccountingStrategy(ABC):
    @abstractmethod
    def get_authorization_url(self, state: str) -> str:
        pass

    @abstractmethod
    async def exchange_code_for_tokens(
        self, code: str, realm_id: str | None = None
    ) -> Tuple[str, str]:
        pass

    @abstractmethod
    async def fetch_company_info(
        self, access_token: str, realm_id: str | None = None
    ) -> str:
        pass

    @abstractmethod
    async def fetch_initial_data(
        self, access_token: str, realm_id: str | None = None
    ) -> Dict:
        pass

    @abstractmethod
    async def refresh_access_token(self, refresh_token: str) -> Tuple[str, str]:
        pass
