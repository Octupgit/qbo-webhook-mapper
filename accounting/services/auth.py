from accounting.strategies import AccountingSystemFactory
from accounting.utils.oauth_state import generate_state, verify_state
from starlette.requests import Request
from accounting.models import BaseAuthResult


class AuthService:

    async def get_authorization_url(self, accounting_system: str, partner_id: str) -> str:
        strategy = AccountingSystemFactory.get_strategy(accounting_system)

        state = generate_state(partner_id=partner_id, accounting_system=accounting_system)

        auth_url = await strategy.get_authorization_url(partner_id=partner_id, state=state)

        return auth_url

    async def handle_callback(self, request: Request) -> BaseAuthResult:
        state = request.query_params.get("state")

        if not state:
            raise ValueError("Missing state parameter")

        verified_state = verify_state(state)

        if verified_state is None:
            raise ValueError("Invalid or expired state")

        accounting_system = verified_state["accounting_system"]

        strategy = AccountingSystemFactory.get_strategy(accounting_system)

        auth_result = await strategy.handle_callback(request=request)

        return auth_result
