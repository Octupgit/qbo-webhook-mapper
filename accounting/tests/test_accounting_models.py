from datetime import datetime

import pytest
from accounting.models import (
    AccountingEntityType,
    AccountingSystem,
    EntityMappingCreate,
    EntityRefCreate,
    Integration,
    IntegrationCreate,
    IntegrationUpdate,
    OctupEntityType,
)
from pydantic import ValidationError


class TestIntegrationModels:
    def test_integration_create_valid(self):
        data = IntegrationCreate(
            partner_id=123,
            accounting_system=AccountingSystem.QUICKBOOKS,
            is_active=True,
            connection_details={"realm_id": "123", "access_token": "encrypted"},
        )
        assert data.partner_id == 123
        assert data.accounting_system == AccountingSystem.QUICKBOOKS
        assert data.is_active is True
        assert data.connection_details == {"realm_id": "123", "access_token": "encrypted"}

    def test_integration_create_missing_required_field(self):
        with pytest.raises(ValidationError):
            IntegrationCreate(
                partner_id=123,
                accounting_system=AccountingSystem.QUICKBOOKS,
            )

    def test_integration_create_invalid_accounting_system(self):
        with pytest.raises(ValidationError):
            IntegrationCreate(
                partner_id=123,
                accounting_system="InvalidSystem",
                connection_details={},
            )

    def test_integration_update_partial(self):
        data = IntegrationUpdate(is_active=False)
        assert data.is_active is False
        assert data.accounting_system is None
        assert data.connection_details is None

    def test_integration_model_from_orm(self):
        from accounting.db.orm_models import Integration as IntegrationORM

        orm_obj = IntegrationORM(
            id="test-uuid",
            partner_id=123,
            accounting_system=AccountingSystem.QUICKBOOKS,
            is_active=True,
            connection_details={"realm_id": "123"},
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        model = Integration.model_validate(orm_obj)
        assert model.id == "test-uuid"
        assert model.partner_id == 123
        assert model.accounting_system == AccountingSystem.QUICKBOOKS


class TestEntityRefModels:
    def test_entity_ref_create_valid(self):
        data = EntityRefCreate(
            integration_id="integration-uuid",
            accounting_entity_type=AccountingEntityType.CUSTOMER,
            accounting_entity_id="QB-123",
            display_name="Test Customer",
            is_active=True,
        )
        assert data.integration_id == "integration-uuid"
        assert data.accounting_entity_type == AccountingEntityType.CUSTOMER
        assert data.accounting_entity_id == "QB-123"
        assert data.display_name == "Test Customer"

    def test_entity_ref_create_without_display_name(self):
        data = EntityRefCreate(
            integration_id="integration-uuid",
            accounting_entity_type=AccountingEntityType.INVOICE,
            accounting_entity_id="INV-456",
        )
        assert data.display_name is None

    def test_entity_ref_invalid_entity_type(self):
        with pytest.raises(ValidationError):
            EntityRefCreate(
                integration_id="integration-uuid",
                accounting_entity_type="InvalidType",
                accounting_entity_id="123",
            )


class TestEntityMappingModels:
    def test_entity_mapping_create_valid(self):
        data = EntityMappingCreate(
            integration_id="integration-uuid",
            octup_entity_type=OctupEntityType.CLIENT,
            octup_entity_id="client-123",
            accounting_entity_type=AccountingEntityType.CUSTOMER,
            accounting_entity_id="QB-Customer-456",
        )
        assert data.integration_id == "integration-uuid"
        assert data.octup_entity_type == OctupEntityType.CLIENT
        assert data.octup_entity_id == "client-123"
        assert data.accounting_entity_type == AccountingEntityType.CUSTOMER
        assert data.accounting_entity_id == "QB-Customer-456"

    def test_entity_mapping_bidirectional_lookup_structure(self):
        data = EntityMappingCreate(
            integration_id="integration-uuid",
            octup_entity_type=OctupEntityType.INVOICE,
            octup_entity_id="octup-inv-789",
            accounting_entity_type=AccountingEntityType.INVOICE,
            accounting_entity_id="qb-inv-999",
        )
        assert data.octup_entity_type == OctupEntityType.INVOICE
        assert data.octup_entity_id == "octup-inv-789"
        assert data.accounting_entity_type == AccountingEntityType.INVOICE
        assert data.accounting_entity_id == "qb-inv-999"

    def test_entity_mapping_invalid_octup_entity_type(self):
        with pytest.raises(ValidationError):
            EntityMappingCreate(
                integration_id="integration-uuid",
                octup_entity_type="InvalidType",
                octup_entity_id="123",
                accounting_entity_type=AccountingEntityType.CUSTOMER,
                accounting_entity_id="456",
            )


class TestEnums:
    def test_accounting_system_enum_values(self):
        assert AccountingSystem.QUICKBOOKS == "Quickbooks"
        assert AccountingSystem.XERO == "Xero"
        assert AccountingSystem.SAGE == "Sage"

    def test_accounting_entity_type_enum_values(self):
        assert AccountingEntityType.CUSTOMER == "Customer"
        assert AccountingEntityType.INVOICE == "Invoice"
        assert AccountingEntityType.ITEM == "Item"
        assert AccountingEntityType.ACCOUNT == "Account"
        assert AccountingEntityType.PAYMENT == "Payment"

    def test_octup_entity_type_enum_values(self):
        assert OctupEntityType.CLIENT == "Client"
        assert OctupEntityType.INVOICE == "Invoice"
        assert OctupEntityType.ORDER == "Order"
