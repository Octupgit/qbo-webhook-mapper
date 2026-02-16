from datetime import datetime
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import pytest
from accounting.common.constants import AccountingEntityType
from accounting.db.entity_ref_datastore import IntegrationEntityRefDataStore
from accounting.db.tables import IntegrationEntityRefDBModel


class TestIntegrationEntityRefDataStore:
    @pytest.fixture
    def datastore(self):
        return IntegrationEntityRefDataStore()

    @pytest.fixture
    def integration_id(self):
        return uuid4()

    @pytest.fixture
    def entity_refs(self, integration_id):
        return [
            IntegrationEntityRefDBModel(
                integration_id=integration_id,
                accounting_entity_type=AccountingEntityType.CUSTOMER,
                accounting_entity_id="customer_1",
                display_name="Customer One",
                is_active=True,
            ),
            IntegrationEntityRefDBModel(
                integration_id=integration_id,
                accounting_entity_type=AccountingEntityType.CUSTOMER,
                accounting_entity_id="customer_2",
                display_name="Customer Two",
                is_active=True,
            ),
        ]

    @pytest.mark.asyncio
    async def test_upsert_entity_refs_inserts_new_records(self, datastore, entity_refs):
        mock_result = Mock()
        mock_result.inserted_primary_key_rows = [{"id": str(uuid4())}, {"id": str(uuid4())}]

        with patch.object(datastore, "upsert_lines", new_callable=AsyncMock) as mock_upsert:
            mock_upsert.return_value = mock_result

            result = await datastore.upsert_entity_refs(entity_refs)

            assert len(result) == 2
            mock_upsert.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_entity_refs_by_integration_and_type_returns_active_only(
        self, datastore, integration_id
    ):
        mock_refs = [
            IntegrationEntityRefDBModel(
                id=uuid4(),
                integration_id=integration_id,
                accounting_entity_type=AccountingEntityType.CUSTOMER,
                accounting_entity_id="customer_1",
                display_name="Active Customer",
                is_active=True,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            ),
        ]

        with patch.object(datastore, "execute_query_fetch_all", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = mock_refs

            result = await datastore.get_entity_refs_by_integration_and_type(
                integration_id=integration_id,
                entity_type=AccountingEntityType.CUSTOMER,
                include_inactive=False,
            )

            assert len(result) == 1
            assert result[0].display_name == "Active Customer"
            mock_fetch.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_entity_refs_by_integration_and_type_includes_inactive(
        self, datastore, integration_id
    ):
        mock_refs = [
            IntegrationEntityRefDBModel(
                id=uuid4(),
                integration_id=integration_id,
                accounting_entity_type=AccountingEntityType.CUSTOMER,
                accounting_entity_id="customer_1",
                display_name="Active Customer",
                is_active=True,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            ),
            IntegrationEntityRefDBModel(
                id=uuid4(),
                integration_id=integration_id,
                accounting_entity_type=AccountingEntityType.CUSTOMER,
                accounting_entity_id="customer_2",
                display_name="Inactive Customer",
                is_active=False,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            ),
        ]

        with patch.object(datastore, "execute_query_fetch_all", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = mock_refs

            result = await datastore.get_entity_refs_by_integration_and_type(
                integration_id=integration_id,
                entity_type=AccountingEntityType.CUSTOMER,
                include_inactive=True,
            )

            assert len(result) == 2
            mock_fetch.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_entity_ref_by_accounting_id_returns_single_record(
        self, datastore, integration_id
    ):
        mock_ref = IntegrationEntityRefDBModel(
            id=uuid4(),
            integration_id=integration_id,
            accounting_entity_type=AccountingEntityType.CUSTOMER,
            accounting_entity_id="customer_1",
            display_name="Specific Customer",
            is_active=True,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )

        with patch.object(datastore, "execute_scalar", new_callable=AsyncMock) as mock_scalar:
            mock_scalar.return_value = mock_ref

            result = await datastore.get_entity_ref_by_accounting_id(
                integration_id=integration_id,
                entity_type=AccountingEntityType.CUSTOMER,
                accounting_entity_id="customer_1",
            )

            assert result is not None
            assert result.accounting_entity_id == "customer_1"
            assert result.display_name == "Specific Customer"
            mock_scalar.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_entity_ref_by_accounting_id_returns_none_when_not_found(
        self, datastore, integration_id
    ):
        with patch.object(datastore, "execute_scalar", new_callable=AsyncMock) as mock_scalar:
            mock_scalar.return_value = None

            result = await datastore.get_entity_ref_by_accounting_id(
                integration_id=integration_id,
                entity_type=AccountingEntityType.CUSTOMER,
                accounting_entity_id="nonexistent",
            )

            assert result is None
            mock_scalar.assert_called_once()
