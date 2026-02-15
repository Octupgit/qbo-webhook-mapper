from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl


class SystemDTO(BaseModel):
    id: str
    name: str
    text: str
    enabled: bool


class SystemsResponseDTO(BaseModel):
    systems: list[SystemDTO]


class AuthenticateRequestDTO(BaseModel):
    accounting_system: str = Field(..., pattern="^(quickbooks|xero)$")
    callback_uri: HttpUrl = Field(..., description="URL to redirect after OAuth")


class AuthenticateResponseDTO(BaseModel):
    authorization_url: HttpUrl


class CallbackQueryDTO(BaseModel):
    code: str
    state: str
    realmId: str | None = None


class CallbackResponseDTO(BaseModel):
    status: str
    integration_id: UUID | None = None
    error_reason: str | None = None


class AccountingIntegrationDTO(BaseModel):
    integration_id: UUID
    partner_id: int
    accounting_system: str
    company_name: str
    realm_id: str
    is_active: bool
    status: str
    created_at: datetime
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
