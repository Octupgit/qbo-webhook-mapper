from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from accounting.db.datastore import (
    AccountingDataStore,
    DuplicateIntegrationError,
    IntegrationNotFoundError,
)
from accounting.models import (
    AccountingEntityType,
    AccountingSystem,
    EntityMappingCreate,
    EntityRefCreate,
    IntegrationCreate,
    IntegrationUpdate,
    OctupEntityType,
)


@pytest.fixture
def datastore():
    return AccountingDataStore()


@pytest.fixture
def mock_integration():
    from datetime import datetime

    from accounting.db.orm_models import Integration

    return Integration(
        id="test-uuid-123",
        partner_id=123,
        accounting_system=AccountingSystem.QUICKBOOKS,
        is_active=True,
        connection_details={"realm_id": "123", "access_token": "encrypted"},
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )


@pytest.fixture
def mock_entity_ref():
    from datetime import datetime

    from accounting.db.orm_models import IntegrationEntityRef

    return IntegrationEntityRef(
        id="ref-uuid-456",
        integration_id="test-uuid-123",
        accounting_entity_type=AccountingEntityType.CUSTOMER,
        accounting_entity_id="QB-Customer-789",
        display_name="Test Customer",
        is_active=True,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )


@pytest.fixture
def mock_entity_mapping():
    from datetime import datetime

    from accounting.db.orm_models import IntegrationOctupEntityMapping

    return IntegrationOctupEntityMapping(
        id="mapping-uuid-789",
        integration_id="test-uuid-123",
        octup_entity_type=OctupEntityType.CLIENT,
        octup_entity_id="client-100",
        accounting_entity_type=AccountingEntityType.CUSTOMER,
        accounting_entity_id="QB-Customer-789",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )


class TestIntegrationDataStore:
    @pytest.mark.asyncio
    async def test_get_integration_by_id_found(self, datastore, mock_integration):
        with patch("accounting.db.datastore.get_session") as mock_session:
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_integration

            mock_execute = AsyncMock(return_value=mock_result)
            mock_session.return_value.__aenter__.return_value.execute = mock_execute

            result = await datastore.get_integration_by_id("test-uuid-123")

            assert result is not None
            assert result.id == "test-uuid-123"
            assert result.partner_id == 123
            assert result.accounting_system == AccountingSystem.QUICKBOOKS

    @pytest.mark.asyncio
    async def test_get_integration_by_id_not_found(self, datastore):
        with patch("accounting.db.datastore.get_session") as mock_session:
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = None

            mock_execute = AsyncMock(return_value=mock_result)
            mock_session.return_value.__aenter__.return_value.execute = mock_execute

            result = await datastore.get_integration_by_id("nonexistent")

            assert result is None

    @pytest.mark.asyncio
    async def test_get_integrations_by_partner(self, datastore, mock_integration):
        with patch("accounting.db.datastore.get_session") as mock_session:
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [mock_integration]

            mock_execute = AsyncMock(return_value=mock_result)
            mock_session.return_value.__aenter__.return_value.execute = mock_execute

            result = await datastore.get_integrations_by_partner(123)

            assert len(result) == 1
            assert result[0].partner_id == 123

    @pytest.mark.asyncio
    async def test_create_integration_success(self, datastore, mock_integration):
        from datetime import datetime

        create_data = IntegrationCreate(
            partner_id=123,
            accounting_system=AccountingSystem.QUICKBOOKS,
            is_active=True,
            connection_details={"realm_id": "123"},
        )

        with patch("accounting.db.datastore.get_session") as mock_session:
            mock_sess = mock_session.return_value.__aenter__.return_value
            mock_sess.add = MagicMock()
            mock_sess.flush = AsyncMock()
            mock_sess.refresh = AsyncMock()

            with patch.object(datastore, "get_active_integration_by_partner", return_value=None):

                def set_integration_fields(obj):
                    obj.id = mock_integration.id
                    obj.created_at = datetime.utcnow()
                    obj.updated_at = datetime.utcnow()

                mock_sess.add.side_effect = set_integration_fields

                result = await datastore.create_integration(create_data)

                assert result is not None
                mock_sess.add.assert_called_once()
                mock_sess.flush.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_integration_duplicate_error(self, datastore, mock_integration):
        create_data = IntegrationCreate(
            partner_id=123,
            accounting_system=AccountingSystem.QUICKBOOKS,
            is_active=True,
            connection_details={"realm_id": "123"},
        )

        with patch("accounting.db.datastore.get_session"):
            with patch.object(datastore, "get_active_integration_by_partner", return_value=mock_integration):
                with pytest.raises(DuplicateIntegrationError):
                    await datastore.create_integration(create_data)

    @pytest.mark.asyncio
    async def test_update_integration_success(self, datastore, mock_integration):
        update_data = IntegrationUpdate(is_active=False)

        with patch("accounting.db.datastore.get_session") as mock_session:
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_integration

            mock_sess = mock_session.return_value.__aenter__.return_value
            mock_sess.execute = AsyncMock(return_value=mock_result)
            mock_sess.flush = AsyncMock()
            mock_sess.refresh = AsyncMock()

            result = await datastore.update_integration("test-uuid-123", update_data)

            assert result is not None
            mock_sess.flush.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_integration_not_found(self, datastore):
        update_data = IntegrationUpdate(is_active=False)

        with patch("accounting.db.datastore.get_session") as mock_session:
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = None

            mock_sess = mock_session.return_value.__aenter__.return_value
            mock_sess.execute = AsyncMock(return_value=mock_result)

            with pytest.raises(IntegrationNotFoundError):
                await datastore.update_integration("nonexistent", update_data)

    @pytest.mark.asyncio
    async def test_delete_integration_success(self, datastore):
        with patch("accounting.db.datastore.get_session") as mock_session:
            mock_result = MagicMock()
            mock_result.rowcount = 1

            mock_sess = mock_session.return_value.__aenter__.return_value
            mock_sess.execute = AsyncMock(return_value=mock_result)

            result = await datastore.delete_integration("test-uuid-123")

            assert result is True


class TestEntityRefDataStore:
    @pytest.mark.asyncio
    async def test_get_entity_ref_by_id_found(self, datastore, mock_entity_ref):
        with patch("accounting.db.datastore.get_session") as mock_session:
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_entity_ref

            mock_execute = AsyncMock(return_value=mock_result)
            mock_session.return_value.__aenter__.return_value.execute = mock_execute

            result = await datastore.get_entity_ref_by_id("ref-uuid-456")

            assert result is not None
            assert result.id == "ref-uuid-456"
            assert result.accounting_entity_type == AccountingEntityType.CUSTOMER

    @pytest.mark.asyncio
    async def test_get_entity_refs_by_integration(self, datastore, mock_entity_ref):
        with patch("accounting.db.datastore.get_session") as mock_session:
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [mock_entity_ref]

            mock_execute = AsyncMock(return_value=mock_result)
            mock_session.return_value.__aenter__.return_value.execute = mock_execute

            result = await datastore.get_entity_refs_by_integration("test-uuid-123")

            assert len(result) == 1
            assert result[0].integration_id == "test-uuid-123"

    @pytest.mark.asyncio
    async def test_create_entity_ref_success(self, datastore, mock_entity_ref):
        from datetime import datetime

        create_data = EntityRefCreate(
            integration_id="test-uuid-123",
            accounting_entity_type=AccountingEntityType.CUSTOMER,
            accounting_entity_id="QB-Customer-789",
            display_name="Test Customer",
        )

        with patch("accounting.db.datastore.get_session") as mock_session:
            mock_sess = mock_session.return_value.__aenter__.return_value
            mock_sess.add = MagicMock()
            mock_sess.flush = AsyncMock()
            mock_sess.refresh = AsyncMock()

            def set_entity_ref_fields(obj):
                obj.id = mock_entity_ref.id
                obj.created_at = datetime.utcnow()
                obj.updated_at = datetime.utcnow()

            mock_sess.add.side_effect = set_entity_ref_fields

            result = await datastore.create_entity_ref(create_data)

            assert result is not None
            mock_sess.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_entity_ref_success(self, datastore):
        with patch("accounting.db.datastore.get_session") as mock_session:
            mock_result = MagicMock()
            mock_result.rowcount = 1

            mock_sess = mock_session.return_value.__aenter__.return_value
            mock_sess.execute = AsyncMock(return_value=mock_result)

            result = await datastore.delete_entity_ref("ref-uuid-456")

            assert result is True


class TestEntityMappingDataStore:
    @pytest.mark.asyncio
    async def test_get_entity_mapping_by_octup_entity(self, datastore, mock_entity_mapping):
        with patch("accounting.db.datastore.get_session") as mock_session:
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_entity_mapping

            mock_execute = AsyncMock(return_value=mock_result)
            mock_session.return_value.__aenter__.return_value.execute = mock_execute

            result = await datastore.get_entity_mapping_by_octup_entity(
                "test-uuid-123", OctupEntityType.CLIENT, "client-100"
            )

            assert result is not None
            assert result.octup_entity_id == "client-100"
            assert result.accounting_entity_id == "QB-Customer-789"

    @pytest.mark.asyncio
    async def test_get_entity_mapping_by_accounting_entity(self, datastore, mock_entity_mapping):
        with patch("accounting.db.datastore.get_session") as mock_session:
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_entity_mapping

            mock_execute = AsyncMock(return_value=mock_result)
            mock_session.return_value.__aenter__.return_value.execute = mock_execute

            result = await datastore.get_entity_mapping_by_accounting_entity(
                "test-uuid-123", AccountingEntityType.CUSTOMER, "QB-Customer-789"
            )

            assert result is not None
            assert result.accounting_entity_id == "QB-Customer-789"
            assert result.octup_entity_id == "client-100"

    @pytest.mark.asyncio
    async def test_create_entity_mapping_success(self, datastore, mock_entity_mapping):
        from datetime import datetime

        create_data = EntityMappingCreate(
            integration_id="test-uuid-123",
            octup_entity_type=OctupEntityType.CLIENT,
            octup_entity_id="client-100",
            accounting_entity_type=AccountingEntityType.CUSTOMER,
            accounting_entity_id="QB-Customer-789",
        )

        with patch("accounting.db.datastore.get_session") as mock_session:
            mock_sess = mock_session.return_value.__aenter__.return_value
            mock_sess.add = MagicMock()
            mock_sess.flush = AsyncMock()
            mock_sess.refresh = AsyncMock()

            def set_entity_mapping_fields(obj):
                obj.id = mock_entity_mapping.id
                obj.created_at = datetime.utcnow()
                obj.updated_at = datetime.utcnow()

            mock_sess.add.side_effect = set_entity_mapping_fields

            result = await datastore.create_entity_mapping(create_data)

            assert result is not None
            mock_sess.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_bidirectional_mapping_lookup(self, datastore, mock_entity_mapping):
        with patch("accounting.db.datastore.get_session") as mock_session:
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_entity_mapping

            mock_execute = AsyncMock(return_value=mock_result)
            mock_session.return_value.__aenter__.return_value.execute = mock_execute

            octup_result = await datastore.get_entity_mapping_by_octup_entity(
                "test-uuid-123", OctupEntityType.CLIENT, "client-100"
            )

            accounting_result = await datastore.get_entity_mapping_by_accounting_entity(
                "test-uuid-123", AccountingEntityType.CUSTOMER, "QB-Customer-789"
            )

            assert octup_result is not None
            assert accounting_result is not None
            assert octup_result.octup_entity_id == "client-100"
            assert accounting_result.accounting_entity_id == "QB-Customer-789"

    @pytest.mark.asyncio
    async def test_delete_entity_mapping_success(self, datastore):
        with patch("accounting.db.datastore.get_session") as mock_session:
            mock_result = MagicMock()
            mock_result.rowcount = 1

            mock_sess = mock_session.return_value.__aenter__.return_value
            mock_sess.execute = AsyncMock(return_value=mock_result)

            result = await datastore.delete_entity_mapping("mapping-uuid-789")

            assert result is True
