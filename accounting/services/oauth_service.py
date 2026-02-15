from uuid import UUID

from accounting.models.oauth import (
    SystemsResponseDTO,
    SystemDTO,
    AuthenticateRequestDTO,
    AuthenticateResponseDTO,
    CallbackQueryDTO,
    CallbackResponseDTO
)
from accounting.services.oauth_state_manager import OAuthStateManager
from accounting.services.token_encryption import TokenEncryption
from accounting.strategies import QuickBooksAuthStrategy
from accounting.db import IntegrationDataStore
from accounting.common.logging.json_logger import setup_logger

class OAuthService:
    def __init__(self):
        self.state_manager = OAuthStateManager()
        self.token_encryption = TokenEncryption()
        self.datastore = IntegrationDataStore()
        self._log = setup_logger()

        self.strategies = {
            "quickbooks": QuickBooksAuthStrategy()
        }

    async def get_systems(self) -> SystemsResponseDTO:
        systems = [
            SystemDTO(
                id="quickbooks",
                name="QuickBooks Online",
                logo_url="https://cdn.octup.com/logos/quickbooks.png",
                enabled=True
            )
        ]
        return SystemsResponseDTO(systems=systems)

    async def initiate_oauth(
        self, partner_id: int, request: AuthenticateRequestDTO
    ) -> AuthenticateResponseDTO:
        state = self.state_manager.generate_state(
            partner_id=partner_id,
            callback_uri=str(request.callback_uri)
        )

        strategy = self.strategies.get(request.accounting_system)
        if not strategy:
            raise ValueError(f"Unsupported accounting system: {request.accounting_system}")

        auth_url = strategy.get_authorization_url(state)

        self._log.info(
            f"OAuth initiated: partner_id={partner_id}, "
            f"system={request.accounting_system}"
        )

        return AuthenticateResponseDTO(authorization_url=auth_url)

    async def handle_callback(
        self, callback: CallbackQueryDTO, accounting_system: str
    ) -> CallbackResponseDTO:
        try:
            state_data = self.state_manager.validate_state(callback.state)
            partner_id = state_data["partner_id"]
            callback_uri = state_data["callback_uri"]

            strategy = self.strategies.get(accounting_system)
            if not strategy:
                raise ValueError(f"Unsupported accounting system: {accounting_system}")

            access_token, refresh_token = await strategy.exchange_code_for_tokens(
                callback.code,
                callback.realmId
            )

            company_name = await strategy.fetch_company_info(
                access_token,
                callback.realmId
            )

            await strategy.fetch_initial_data(access_token, callback.realmId)

            encrypted_access = self.token_encryption.encrypt(access_token)
            encrypted_refresh = self.token_encryption.encrypt(refresh_token)

            integration_id = await self.datastore.create_integration(
                partner_id=partner_id,
                accounting_system=accounting_system,
                realm_id=callback.realmId,
                company_name=company_name,
                access_token=encrypted_access,
                refresh_token=encrypted_refresh
            )

            self._log.info(
                f"Integration created: id={integration_id}, "
                f"partner={partner_id}, system={accounting_system}"
            )

            return CallbackResponseDTO(
                status="success",
                integration_id=integration_id,
                error_reason=None
            )

        except ValueError as e:
            self._log.error(f"Callback validation error: {str(e)}")
            return CallbackResponseDTO(
                status="error",
                integration_id=None,
                error_reason=str(e)
            )
        except Exception as e:
            self._log.exception(f"Callback processing error: {str(e)}")
            return CallbackResponseDTO(
                status="error",
                integration_id=None,
                error_reason="Internal error"
            )
