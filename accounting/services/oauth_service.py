from accounting.strategies import AccountingSystemFactory
from accounting.utils.oauth_state import generate_state


class OAuthService:

    async def get_authorization_url(self, accounting_system: str, partner_id: str) -> str:
        strategy = AccountingSystemFactory.get_strategy(accounting_system)

        state = generate_state(partner_id=partner_id, accounting_system=accounting_system)

        auth_url = await strategy.get_authorization_url(partner_id=partner_id, state=state)

        return auth_url
