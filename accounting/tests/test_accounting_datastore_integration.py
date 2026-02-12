import uuid

import pytest

from accounting.db.base import AsyncSessionLocal
from accounting.db.datastore import AccountingDataStore
from accounting.models import AccountingSystem, IntegrationCreate


@pytest.mark.asyncio
async def test_integration_crud_roundtrip():
    if AsyncSessionLocal is None:
        pytest.skip("Database not configured for integration test.")

    datastore = AccountingDataStore()
    partner_id = uuid.uuid4().int % 1000000
    integration_id = None

    try:
        created = await datastore.create_integration(
            IntegrationCreate(
                partner_id=partner_id,
                accounting_system=AccountingSystem.QUICKBOOKS,
                is_active=True,
                connection_details={"realm_id": "test-realm"},
            )
        )
        integration_id = created.id

        fetched = await datastore.get_integration_by_id(integration_id)

        assert fetched is not None
        assert fetched.id == integration_id
        assert fetched.partner_id == partner_id
        assert fetched.accounting_system == AccountingSystem.QUICKBOOKS
    finally:
        if integration_id:
            await datastore.delete_integration(integration_id)
