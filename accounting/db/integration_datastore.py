import uuid
from datetime import datetime
from typing import cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.engine import CursorResult

from accounting.common.logging.json_logger import setup_logger
from accounting.db.base_engine import BaseSQLEngine
from accounting.db.tables import AccountingIntegrationDBModel


class IntegrationDataStore(BaseSQLEngine):
    def __init__(self):
        super().__init__()
        self._log = setup_logger()

    async def upsert_integrations(self, integrations: list[AccountingIntegrationDBModel]) -> None:
        try:
            res = await self.upsert_lines(
                [self._model_to_dict(integration) for integration in integrations],
                AccountingIntegrationDBModel,
                excluded_columns={
                    AccountingIntegrationDBModel.created_at.name,
                    AccountingIntegrationDBModel.updated_at.name,
                },
            )
            return res.inserted_primary_key_rows
        except Exception as e:
            self._log.error(f"Failed to upsert integrations: {e}")
            raise

    async def get_integration_by_id(self, integration_id: UUID) -> AccountingIntegrationDBModel | None:
        try:
            query = select(AccountingIntegrationDBModel).where(AccountingIntegrationDBModel.id == str(integration_id))
            return await self.execute_scalar(query)
        except Exception as e:
            self._log.error(f"Failed to get integration by id={integration_id}: {e}")
            raise

    async def get_active_integrations_by_partner(self, partner_id: int) -> list[AccountingIntegrationDBModel]:
        try:
            query = select(AccountingIntegrationDBModel).where(
                AccountingIntegrationDBModel.partner_id == partner_id, AccountingIntegrationDBModel.is_active
            )
            results = await self.execute_query_fetch_all(query, to_dict=False)
            return cast(list[AccountingIntegrationDBModel], results)
        except Exception as e:
            self._log.error(f"Failed to get active integrations for partner_id={partner_id}: {e}")
            raise

    async def update_connection_details(self, integration_id: str, connection_details: dict) -> int | None:
        try:
            res = await self.update_row_by_id(
                integration_id,
                AccountingIntegrationDBModel,
                id_column_name="id",
                update_fields={"connection_details": connection_details},
            )
            if res is not None and res.rowcount:
                self._log.info(f"Updated {res.rowcount} integration row(s) with id {integration_id}")
                return res.rowcount
            return None
        except Exception as e:
            self._log.error(f"Error updating connection details for integration_id={integration_id}: {e}")
            raise
        