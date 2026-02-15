from pydantic import BaseModel, Field, HttpUrl
from typing import Optional
from uuid import UUID
from datetime import datetime

class SystemDTO(BaseModel):
    id: str
    name: str
    logo_url: str
    enabled: bool

class SystemsResponseDTO(BaseModel):
    systems: list[SystemDTO]

class AuthenticateRequestDTO(BaseModel):
    partner_id: int = Field(..., gt=0, description="Octup partner ID")
    accounting_system: str = Field(..., pattern="^(quickbooks|xero)$")
    callback_uri: HttpUrl = Field(..., description="URL to redirect after OAuth")

class AuthenticateResponseDTO(BaseModel):
    authorization_url: HttpUrl

class CallbackQueryDTO(BaseModel):
    code: str
    state: str
    realmId: Optional[str] = None

class CallbackResponseDTO(BaseModel):
    status: str
    integration_id: Optional[UUID] = None
    error_reason: Optional[str] = None

class AccountingIntegrationDTO(BaseModel):
    integration_id: UUID
    partner_id: int
    accounting_system: str
    company_name: str
    realm_id: str
    is_active: bool
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
