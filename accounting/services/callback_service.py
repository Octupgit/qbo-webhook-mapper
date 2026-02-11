from starlette.requests import Request

from accounting.models import BaseAuthResult
from accounting.strategies import AccountingSystemFactory
from accounting.utils.oauth_state import verify_state


class CallbackService:
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
