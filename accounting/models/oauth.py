from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl

from accounting.db.models import AccountingIntegration
from accounting.models.base import DtoModel


class SystemInfo(BaseModel):
    """Individual accounting system information"""

    id: str
    name: str
    text: str
    enabled: bool


class SystemsDTO(DtoModel):
    """DTO for available accounting systems"""

    systems: list[SystemInfo]

    @classmethod
    def from_db_rows(cls, *args, **kwargs):
        raise NotImplementedError("Systems are hardcoded, not from DB")

    @classmethod
    def from_db_row(cls, *args, **kwargs):
        raise NotImplementedError("Systems are hardcoded, not from DB")

    def to_db_rows(self, *args, **kwargs):
        raise NotImplementedError("Systems are not persisted to DB")

    @classmethod
    def from_request(cls, *args, **kwargs):
        raise NotImplementedError("Systems are not created from requests")

    def to_response(self, *args, **kwargs) -> dict:
        return {"systems": [system.model_dump() for system in self.systems]}


class AuthenticateRequestDTO(DtoModel):
    """DTO for OAuth authentication initiation request"""

    accounting_system: str = Field(..., pattern="^(quickbooks|xero)$")
    callback_uri: HttpUrl = Field(..., description="URL to redirect after OAuth")

    @classmethod
    def from_db_rows(cls, *args, **kwargs):
        raise NotImplementedError("Authentication requests are not stored in DB")

    @classmethod
    def from_db_row(cls, *args, **kwargs):
        raise NotImplementedError("Authentication requests are not stored in DB")

    def to_db_rows(self, *args, **kwargs):
        raise NotImplementedError("Authentication requests are not persisted to DB")

    @classmethod
    def from_request(cls, accounting_system: str, callback_uri: str) -> "AuthenticateRequestDTO":
        return cls(accounting_system=accounting_system, callback_uri=callback_uri)

    def to_response(self, *args, **kwargs):
        raise NotImplementedError("Authentication requests do not have response format")


class AuthenticateResponseDTO(DtoModel):
    """DTO for OAuth authentication response with authorization URL"""

    authorization_url: HttpUrl

    @classmethod
    def from_db_rows(cls, *args, **kwargs):
        raise NotImplementedError("Authentication responses are not stored in DB")

    @classmethod
    def from_db_row(cls, *args, **kwargs):
        raise NotImplementedError("Authentication responses are not stored in DB")

    def to_db_rows(self, *args, **kwargs):
        raise NotImplementedError("Authentication responses are not persisted to DB")

    @classmethod
    def from_request(cls, *args, **kwargs):
        raise NotImplementedError("Authentication responses are not created from requests")

    def to_response(self, *args, **kwargs) -> dict:
        return {"authorization_url": str(self.authorization_url)}


class CallbackQueryDTO(DtoModel):
    """DTO for OAuth callback query parameters"""

    code: str
    state: str
    realmId: str | None = None

    @classmethod
    def from_db_rows(cls, *args, **kwargs):
        raise NotImplementedError("Callback queries are not stored in DB")

    @classmethod
    def from_db_row(cls, *args, **kwargs):
        raise NotImplementedError("Callback queries are not stored in DB")

    def to_db_rows(self, *args, **kwargs):
        raise NotImplementedError("Callback queries are not persisted to DB")

    @classmethod
    def from_request(cls, code: str, state: str, realm_id: str | None = None) -> "CallbackQueryDTO":
        return cls(code=code, state=state, realmId=realm_id)

    def to_response(self, *args, **kwargs):
        raise NotImplementedError("Callback queries do not have response format")


class CallbackResponseDTO(DtoModel):
    """DTO for OAuth callback response"""

    status: str
    integration_id: UUID | None = None
    error_reason: str | None = None

    @classmethod
    def from_db_rows(cls, *args, **kwargs):
        raise NotImplementedError("Callback responses are not stored in DB")

    @classmethod
    def from_db_row(cls, *args, **kwargs):
        raise NotImplementedError("Callback responses are not stored in DB")

    def to_db_rows(self, *args, **kwargs):
        raise NotImplementedError("Callback responses are not persisted to DB")

    @classmethod
    def from_request(cls, *args, **kwargs):
        raise NotImplementedError("Callback responses are not created from requests")

    def to_response(self, *args, **kwargs) -> dict:
        response = {"status": self.status}
        if self.integration_id:
            response["integration_id"] = str(self.integration_id)
        if self.error_reason:
            response["error_reason"] = self.error_reason
        return response


class AccountingIntegrationDTO(DtoModel):
    """DTO for accounting integration entity"""

    integration_id: UUID
    partner_id: int
    accounting_system: str
    company_name: str
    realm_id: str
    is_active: bool
    status: str
    created_at: datetime
    updated_at: datetime | None = None

    @classmethod
    def from_db_rows(cls, rows: list[AccountingIntegration]) -> list["AccountingIntegrationDTO"]:
        return [cls.from_db_row(row) for row in rows]

    @classmethod
    def from_db_row(cls, row: AccountingIntegration) -> "AccountingIntegrationDTO":
        return cls.model_validate(row)

    def to_db_rows(self, *args, **kwargs) -> list[dict]:
        return [self.model_dump(exclude={"integration_id", "created_at", "updated_at"})]

    @classmethod
    def from_request(
        cls,
        partner_id: int,
        accounting_system: str,
        company_name: str,
        realm_id: str,
        is_active: bool = True,
        status: str = "active",
    ) -> "AccountingIntegrationDTO":
        return cls(
            integration_id=UUID(int=0),
            partner_id=partner_id,
            accounting_system=accounting_system,
            company_name=company_name,
            realm_id=realm_id,
            is_active=is_active,
            status=status,
            created_at=datetime.utcnow(),
        )

    def to_response(self, *args, **kwargs) -> dict:
        return {
            "integration_id": str(self.integration_id),
            "partner_id": self.partner_id,
            "accounting_system": self.accounting_system,
            "company_name": self.company_name,
            "realm_id": self.realm_id,
            "is_active": self.is_active,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
