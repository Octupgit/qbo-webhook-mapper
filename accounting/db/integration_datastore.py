from datetime import datetime
from uuid import UUID

from sqlalchemy import select, update

from accounting.common.logging.json_logger import setup_logger
from accounting.db.base_engine import BaseSQLEngine
from accounting.db.models import AccountingIntegration


class IntegrationDataStore(BaseSQLEngine):
    def __init__(self):
        super().__init__()
        self._log = setup_logger()

    async def create_integration(
        self,
        partner_id: int,
        accounting_system: str,
        realm_id: str,
        company_name: str,
        access_token: str,
        refresh_token: str,
    ) -> UUID:
        try:
            async with self.sessionmaker() as session:
                integration = AccountingIntegration(
                    partner_id=partner_id,
                    accounting_system=accounting_system,
                    realm_id=realm_id,
                    company_name=company_name,
                    access_token=access_token,
                    refresh_token=refresh_token,
                )
                session.add(integration)
                await session.flush()
                integration_id = UUID(integration.integration_id)
                await session.commit()
                return integration_id
        except Exception as e:
            self._log.error(f"Failed to create integration for partner_id={partner_id}: {e}")
            raise

    async def get_integration_by_id(self, integration_id: UUID) -> AccountingIntegration | None:
        try:
            query = select(AccountingIntegration).where(AccountingIntegration.integration_id == str(integration_id))
            return await self.execute_scalar(query)
        except Exception as e:
            self._log.error(f"Failed to get integration by id={integration_id}: {e}")
            raise

    async def get_active_integrations_by_partner(self, partner_id: int) -> list[AccountingIntegration]:
        try:
            query = select(AccountingIntegration).where(
                AccountingIntegration.partner_id == partner_id, AccountingIntegration.is_active
            )
            results = await self.execute_query_fetch_all(query, to_dict=False)
            return results
        except Exception as e:
            self._log.error(f"Failed to get active integrations for partner_id={partner_id}: {e}")
            raise

    async def update_tokens(self, integration_id: UUID, access_token: str, refresh_token: str) -> None:
        try:
            stmt = (
                update(AccountingIntegration)
                .where(AccountingIntegration.integration_id == str(integration_id))
                .values(access_token=access_token, refresh_token=refresh_token, updated_at=datetime.utcnow())
            )
            await self.execute_query(stmt)
        except Exception as e:
            self._log.error(f"Failed to update tokens for integration_id={integration_id}: {e}")
            raise

    async def update_company_name(self, integration_id: UUID, company_name: str) -> None:
        try:
            stmt = (
                update(AccountingIntegration)
                .where(AccountingIntegration.integration_id == str(integration_id))
                .values(company_name=company_name, updated_at=datetime.utcnow())
            )
            await self.execute_query(stmt)
        except Exception as e:
            self._log.error(f"Failed to update company name for integration_id={integration_id}: {e}")
            raise
