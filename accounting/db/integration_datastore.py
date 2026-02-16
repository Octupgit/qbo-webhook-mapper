from datetime import datetime
from typing import cast
from uuid import UUID

from sqlalchemy import select, update

from accounting.common.logging.json_logger import setup_logger
from accounting.db.base_engine import BaseSQLEngine
from accounting.db.tables import AccountingIntegration


class IntegrationDataStore(BaseSQLEngine):
    def __init__(self):
        super().__init__()
        self._log = setup_logger()

    async def create_integration(
        self,
        partner_id: int,
        accounting_system: str,
        integration_name: str,
        connection_details: dict,
    ) -> UUID:
        try:
            async with self.sessionmaker() as session:
                integration = AccountingIntegration(
                    partner_id=partner_id,
                    accounting_system=accounting_system,
                    integration_name=integration_name,
                    connection_details=connection_details,
                )
                session.add(integration)
                await session.flush()
                integration_id = UUID(str(integration.id))
                await session.commit()
                return integration_id
        except Exception as e:
            self._log.error(f"Failed to create integration for partner_id={partner_id}: {e}")
            raise

    async def get_integration_by_id(self, integration_id: UUID) -> AccountingIntegration | None:
        try:
            query = select(AccountingIntegration).where(AccountingIntegration.id == str(integration_id))
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
            return cast(list[AccountingIntegration], results)
        except Exception as e:
            self._log.error(f"Failed to get active integrations for partner_id={partner_id}: {e}")
            raise

    async def update_connection_details(self, integration_id: UUID, connection_details: dict) -> None:
        try:
            integration = await self.get_integration_by_id(integration_id)
            if not integration:
                raise ValueError(f"Integration {integration_id} not found")

            existing_details = integration.connection_details if isinstance(integration.connection_details, dict) else {}
            updated_details = {**existing_details, **connection_details}
            stmt = (
                update(AccountingIntegration)
                .where(AccountingIntegration.id == str(integration_id))
                .values(connection_details=updated_details, updated_at=datetime.utcnow())
            )
            await self.execute_query(stmt)
        except Exception as e:
            self._log.error(f"Failed to update connection details for integration_id={integration_id}: {e}")
            raise
