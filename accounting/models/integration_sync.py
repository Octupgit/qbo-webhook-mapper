"""DTOs for integration synchronization"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from accounting.common.constants import AccountingEntityType, SyncStatus
from accounting.db.tables import IntegrationEntityRefDBModel
from accounting.models.base import DtoModel


class AccountingClientData(BaseModel):
    """Standardized accounting client data from external system"""

    accounting_client_id: str
    display_name: str
    parent_ref: str | None = None
    is_active: bool = True
    metadata: dict | None = None


class InitialSyncResult(DtoModel):
    """Result of initial data sync from accounting system"""

    integration_id: UUID
    partner_id: int
    accounting_system: str
    integration_name: str
    company_name: str
    status: str
    sync_completed_at: datetime
    errors: list[str]
    accounting_clients: list[AccountingClientData]

    @classmethod
    def from_db_rows(cls, *args, **kwargs):
        raise NotImplementedError("InitialSyncResult is not stored in DB")

    @classmethod
    def from_db_row(cls, *args, **kwargs):
        raise NotImplementedError("InitialSyncResult is not stored in DB")

    def to_db_rows(self, *args, **kwargs) -> list[IntegrationEntityRefDBModel]:

        entity_refs = []
        for client in self.accounting_clients:
            entity_refs.append(
                IntegrationEntityRefDBModel(
                    integration_id=self.integration_id,
                    accounting_entity_type=AccountingEntityType.CUSTOMER,
                    accounting_entity_id=client.accounting_client_id,
                    display_name=client.display_name,
                    is_active=client.is_active,
                )
            )
        return entity_refs


    @classmethod
    def from_request(cls, *args, **kwargs):
        raise NotImplementedError("InitialSyncResult is not created from requests")

    def to_response(self, *args, **kwargs) -> dict:
        """Convert to payload for Octup notification"""
        return {
            "metadata": {
                "integration_id": str(self.integration_id),
                "integration_name": self.integration_name,
                "accounting_system": self.accounting_system,
                "company_name": self.company_name,
                "partner_id": self.partner_id,
                "status": self.status,
                "sync_completed_at": self.sync_completed_at.isoformat(),
                "errors": self.errors,
            },
            "accounting_clients": [client.model_dump(exclude_none=True) for client in self.accounting_clients],
        }

    def has_errors(self) -> bool:
        """Check if sync completed with errors"""
        return len(self.errors) > 0

    def get_status(self) -> str:
        """Get sync status based on errors"""
        return SyncStatus.SYNC_ERROR if self.has_errors() else SyncStatus.FULLY_SYNCED
