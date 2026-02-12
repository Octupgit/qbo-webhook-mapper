from urllib.parse import urlparse

from starlette.requests import Request
from accounting.models import BaseAuthResult
from accounting.strategies import AccountingSystemFactory
from accounting.utils.oauth_state import generate_state


class OAuthService:
    async def get_authorization_url(
        self,
        accounting_system: str,
        partner_id: str,
        callback_url: str | None = None,
    ) -> str:
        strategy = AccountingSystemFactory.get_strategy(accounting_system)

        if callback_url:
            parsed = urlparse(callback_url)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError("Invalid callback_url")

        state = generate_state(partner_id, accounting_system, callback_url)

        auth_url = await strategy.get_authorization_url(partner_id=partner_id, state=state)

        return auth_url


    async def handle_callback(self, accounting_system: str, request: Request) -> BaseAuthResult:

        strategy = AccountingSystemFactory.get_strategy(accounting_system)

        auth_result = await strategy.handle_callback(request=request)

        return auth_result

