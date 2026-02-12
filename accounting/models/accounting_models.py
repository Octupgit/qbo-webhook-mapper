from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict


class AccountingSystem(str, Enum):
    QUICKBOOKS = "Quickbooks"
    XERO = "Xero"
    SAGE = "Sage"


class AccountingEntityType(str, Enum):
    CUSTOMER = "Customer"
    INVOICE = "Invoice"
    ITEM = "Item"
    ACCOUNT = "Account"
    PAYMENT = "Payment"


class OctupEntityType(str, Enum):
    CLIENT = "Client"
    INVOICE = "Invoice"
    ORDER = "Order"


class IntegrationBase(BaseModel):
    partner_id: int
    accounting_system: AccountingSystem
    is_active: bool = True
    connection_details: dict


class IntegrationCreate(IntegrationBase):
    pass


class IntegrationUpdate(BaseModel):
    accounting_system: AccountingSystem | None = None
    is_active: bool | None = None
    connection_details: dict | None = None


class Integration(IntegrationBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EntityRefBase(BaseModel):
    integration_id: str
    accounting_entity_type: AccountingEntityType
    accounting_entity_id: str
    display_name: str | None = None
    is_active: bool = True


class EntityRefCreate(EntityRefBase):
    pass


class EntityRefUpdate(BaseModel):
    accounting_entity_type: AccountingEntityType | None = None
    accounting_entity_id: str | None = None
    display_name: str | None = None
    is_active: bool | None = None


class EntityRef(EntityRefBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EntityMappingBase(BaseModel):
    integration_id: str
    octup_entity_type: OctupEntityType
    octup_entity_id: str
    accounting_entity_type: AccountingEntityType
    accounting_entity_id: str


class EntityMappingCreate(EntityMappingBase):
    pass


class EntityMappingUpdate(BaseModel):
    octup_entity_type: OctupEntityType | None = None
    octup_entity_id: str | None = None
    accounting_entity_type: AccountingEntityType | None = None
    accounting_entity_id: str | None = None


class EntityMapping(EntityMappingBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
