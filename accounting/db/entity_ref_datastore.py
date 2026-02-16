from uuid import UUID

from sqlalchemy import select

from accounting.common.logging.json_logger import setup_logger
from accounting.db.base_engine import BaseSQLEngine
from accounting.db.tables import IntegrationEntityRefDBModel


class IntegrationEntityRefDataStore(BaseSQLEngine):
    def __init__(self):
        super().__init__()
        self._log = setup_logger()

    async def upsert_entity_refs(self, entity_refs: list[IntegrationEntityRefDBModel]) -> list:
        try:
            res = await self.upsert_lines(
                [self._model_to_dict(entity_ref) for entity_ref in entity_refs],
                IntegrationEntityRefDBModel,
                excluded_columns={
                    IntegrationEntityRefDBModel.id.name,
                    IntegrationEntityRefDBModel.created_at.name,
                    IntegrationEntityRefDBModel.updated_at.name,
                },
            )
            return res.inserted_primary_key_rows
        except Exception as e:
            self._log.error(f"Failed to upsert entity refs: {e}")
            raise

    async def get_entity_refs_by_integration_and_type(
        self,
        integration_id: UUID,
        entity_type: str,
        include_inactive: bool = False,
    ) -> list[IntegrationEntityRefDBModel]:
        try:
            query = select(IntegrationEntityRefDBModel).where(
                IntegrationEntityRefDBModel.integration_id == str(integration_id),
                IntegrationEntityRefDBModel.accounting_entity_type == entity_type,
            )

            if not include_inactive:
                query = query.where(IntegrationEntityRefDBModel.is_active == True)

            results = await self.execute_query_fetch_all(query, to_dict=False)
            return results
        except Exception as e:
            self._log.error(
                f"Failed to get entity refs for integration_id={integration_id}, type={entity_type}: {e}"
            )
            raise

    async def get_entity_ref_by_accounting_id(
        self,
        integration_id: UUID,
        entity_type: str,
        accounting_entity_id: str,
    ) -> IntegrationEntityRefDBModel | None:
        try:
            query = select(IntegrationEntityRefDBModel).where(
                IntegrationEntityRefDBModel.integration_id == str(integration_id),
                IntegrationEntityRefDBModel.accounting_entity_type == entity_type,
                IntegrationEntityRefDBModel.accounting_entity_id == accounting_entity_id,
            )
            return await self.execute_scalar(query)
        except Exception as e:
            self._log.error(
                f"Failed to get entity ref for integration_id={integration_id}, "
                f"type={entity_type}, accounting_id={accounting_entity_id}: {e}"
            )
            raise
