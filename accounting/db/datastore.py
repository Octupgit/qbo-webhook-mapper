from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from accounting.common.logging.json_logger import setup_logger
from accounting.db.base import get_session
from accounting.db.orm_models import Integration, IntegrationEntityRef, IntegrationOctupEntityMapping
from accounting.models.accounting_models import (
    AccountingEntityType,
    EntityMapping,
    EntityMappingCreate,
    EntityMappingUpdate,
    EntityRef,
    EntityRefCreate,
    EntityRefUpdate,
    IntegrationCreate,
    IntegrationUpdate,
    OctupEntityType,
)
from accounting.models.accounting_models import (
    Integration as IntegrationModel,
)
from accounting.exceptions import (
    EntityMappingNotFoundError,
    EntityRefNotFoundError,
    IntegrationNotFoundError,
    DuplicateIntegrationError,
)


class AccountingDataStore:
    _log = setup_logger()

    async def get_integration_by_id(self, integration_id: str) -> IntegrationModel | None:
        async with get_session() as session:
            query = select(Integration).where(Integration.id == integration_id)
            result = await session.execute(query)
            row = result.scalar_one_or_none()
            return IntegrationModel.model_validate(row) if row else None

    async def get_integrations_by_partner(self, partner_id: int) -> list[IntegrationModel]:
        async with get_session() as session:
            query = select(Integration).where(Integration.partner_id == partner_id)
            result = await session.execute(query)
            rows = result.scalars().all()
            return [IntegrationModel.model_validate(row) for row in rows]

    async def get_active_integration_by_partner(self, partner_id: int) -> IntegrationModel | None:
        async with get_session() as session:
            query = select(Integration).where(
                Integration.partner_id == partner_id,
                Integration.is_active.is_(True),
            )
            result = await session.execute(query)
            row = result.scalar_one_or_none()
            return IntegrationModel.model_validate(row) if row else None

    async def create_integration(self, data: IntegrationCreate) -> IntegrationModel:
        async with get_session() as session:
            try:
                existing = await self.get_active_integration_by_partner(data.partner_id)
                if existing:
                    self._log.warning(f"Duplicate integration attempt for partner {data.partner_id}")
                    raise DuplicateIntegrationError(data.partner_id)

                integration = Integration(**data.model_dump())
                session.add(integration)
                await session.flush()
                await session.refresh(integration)
                self._log.info(f"Created integration {integration.id} for partner {data.partner_id}")
                return IntegrationModel.model_validate(integration)
            except IntegrityError as e:
                self._log.error(f"IntegrityError creating integration for partner {data.partner_id}: {e}")
                raise DuplicateIntegrationError(data.partner_id) from e

    async def update_integration(self, integration_id: str, data: IntegrationUpdate) -> IntegrationModel:
        async with get_session() as session:
            query = select(Integration).where(Integration.id == integration_id)
            result = await session.execute(query)
            integration = result.scalar_one_or_none()

            if not integration:
                self._log.warning(f"Integration not found for update: {integration_id}")
                raise IntegrationNotFoundError(integration_id)

            update_data = data.model_dump(exclude_unset=True)
            for key, value in update_data.items():
                setattr(integration, key, value)

            await session.flush()
            await session.refresh(integration)
            self._log.info(f"Updated integration {integration_id}: {list(update_data.keys())}")
            return IntegrationModel.model_validate(integration)

    async def delete_integration(self, integration_id: str) -> bool:
        async with get_session() as session:
            query = delete(Integration).where(Integration.id == integration_id)
            result = await session.execute(query)
            deleted = result.rowcount > 0
            if deleted:
                self._log.info(f"Deleted integration {integration_id}")
            else:
                self._log.warning(f"Integration not found for deletion: {integration_id}")
            return deleted

    async def get_entity_ref_by_id(self, ref_id: str) -> EntityRef | None:
        async with get_session() as session:
            query = select(IntegrationEntityRef).where(IntegrationEntityRef.id == ref_id)
            result = await session.execute(query)
            row = result.scalar_one_or_none()
            return EntityRef.model_validate(row) if row else None

    async def get_entity_refs_by_integration(self, integration_id: str) -> list[EntityRef]:
        async with get_session() as session:
            query = select(IntegrationEntityRef).where(IntegrationEntityRef.integration_id == integration_id)
            result = await session.execute(query)
            rows = result.scalars().all()
            return [EntityRef.model_validate(row) for row in rows]

    async def get_entity_ref_by_accounting_entity(
        self,
        integration_id: str,
        entity_type: AccountingEntityType,
        entity_id: str,
    ) -> EntityRef | None:
        async with get_session() as session:
            query = select(IntegrationEntityRef).where(
                IntegrationEntityRef.integration_id == integration_id,
                IntegrationEntityRef.accounting_entity_type == entity_type,
                IntegrationEntityRef.accounting_entity_id == entity_id,
            )
            result = await session.execute(query)
            row = result.scalar_one_or_none()
            return EntityRef.model_validate(row) if row else None

    async def create_entity_ref(self, data: EntityRefCreate) -> EntityRef:
        async with get_session() as session:
            entity_ref = IntegrationEntityRef(**data.model_dump())
            session.add(entity_ref)
            await session.flush()
            await session.refresh(entity_ref)
            self._log.info(f"Created entity ref {entity_ref.id} for integration {data.integration_id}")
            return EntityRef.model_validate(entity_ref)

    async def update_entity_ref(self, ref_id: str, data: EntityRefUpdate) -> EntityRef:
        async with get_session() as session:
            query = select(IntegrationEntityRef).where(IntegrationEntityRef.id == ref_id)
            result = await session.execute(query)
            entity_ref = result.scalar_one_or_none()

            if not entity_ref:
                self._log.warning(f"Entity ref not found for update: {ref_id}")
                raise EntityRefNotFoundError(ref_id)

            update_data = data.model_dump(exclude_unset=True)
            for key, value in update_data.items():
                setattr(entity_ref, key, value)

            await session.flush()
            await session.refresh(entity_ref)
            self._log.info(f"Updated entity ref {ref_id}")
            return EntityRef.model_validate(entity_ref)

    async def delete_entity_ref(self, ref_id: str) -> bool:
        async with get_session() as session:
            query = delete(IntegrationEntityRef).where(IntegrationEntityRef.id == ref_id)
            result = await session.execute(query)
            deleted = result.rowcount > 0
            if deleted:
                self._log.info(f"Deleted entity ref {ref_id}")
            return deleted

    async def get_entity_mapping_by_id(self, mapping_id: str) -> EntityMapping | None:
        async with get_session() as session:
            query = select(IntegrationOctupEntityMapping).where(IntegrationOctupEntityMapping.id == mapping_id)
            result = await session.execute(query)
            row = result.scalar_one_or_none()
            return EntityMapping.model_validate(row) if row else None

    async def get_entity_mappings_by_integration(self, integration_id: str) -> list[EntityMapping]:
        async with get_session() as session:
            query = select(IntegrationOctupEntityMapping).where(
                IntegrationOctupEntityMapping.integration_id == integration_id
            )
            result = await session.execute(query)
            rows = result.scalars().all()
            return [EntityMapping.model_validate(row) for row in rows]

    async def get_entity_mapping_by_octup_entity(
        self,
        integration_id: str,
        octup_entity_type: OctupEntityType,
        octup_entity_id: str,
    ) -> EntityMapping | None:
        async with get_session() as session:
            query = select(IntegrationOctupEntityMapping).where(
                IntegrationOctupEntityMapping.integration_id == integration_id,
                IntegrationOctupEntityMapping.octup_entity_type == octup_entity_type,
                IntegrationOctupEntityMapping.octup_entity_id == octup_entity_id,
            )
            result = await session.execute(query)
            row = result.scalar_one_or_none()
            return EntityMapping.model_validate(row) if row else None

    async def get_entity_mapping_by_accounting_entity(
        self,
        integration_id: str,
        accounting_entity_type: AccountingEntityType,
        accounting_entity_id: str,
    ) -> EntityMapping | None:
        async with get_session() as session:
            query = select(IntegrationOctupEntityMapping).where(
                IntegrationOctupEntityMapping.integration_id == integration_id,
                IntegrationOctupEntityMapping.accounting_entity_type == accounting_entity_type,
                IntegrationOctupEntityMapping.accounting_entity_id == accounting_entity_id,
            )
            result = await session.execute(query)
            row = result.scalar_one_or_none()
            return EntityMapping.model_validate(row) if row else None

    async def create_entity_mapping(self, data: EntityMappingCreate) -> EntityMapping:
        async with get_session() as session:
            entity_mapping = IntegrationOctupEntityMapping(**data.model_dump())
            session.add(entity_mapping)
            await session.flush()
            await session.refresh(entity_mapping)
            self._log.info(
                f"Created entity mapping {entity_mapping.id}: "
                f"{data.octup_entity_type}:{data.octup_entity_id} -> "
                f"{data.accounting_entity_type}:{data.accounting_entity_id}"
            )
            return EntityMapping.model_validate(entity_mapping)

    async def update_entity_mapping(self, mapping_id: str, data: EntityMappingUpdate) -> EntityMapping:
        async with get_session() as session:
            query = select(IntegrationOctupEntityMapping).where(IntegrationOctupEntityMapping.id == mapping_id)
            result = await session.execute(query)
            entity_mapping = result.scalar_one_or_none()

            if not entity_mapping:
                self._log.warning(f"Entity mapping not found for update: {mapping_id}")
                raise EntityMappingNotFoundError(mapping_id)

            update_data = data.model_dump(exclude_unset=True)
            for key, value in update_data.items():
                setattr(entity_mapping, key, value)

            await session.flush()
            await session.refresh(entity_mapping)
            self._log.info(f"Updated entity mapping {mapping_id}")
            return EntityMapping.model_validate(entity_mapping)

    async def delete_entity_mapping(self, mapping_id: str) -> bool:
        async with get_session() as session:
            query = delete(IntegrationOctupEntityMapping).where(IntegrationOctupEntityMapping.id == mapping_id)
            result = await session.execute(query)
            deleted = result.rowcount > 0
            if deleted:
                self._log.info(f"Deleted entity mapping {mapping_id}")
            return deleted
