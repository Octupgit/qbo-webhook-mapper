from enum import Enum

from pydantic import BaseModel, ConfigDict


class AccountingSystem(str, Enum):
    """Supported accounting systems."""

    QUICKBOOKS = "quickbooks"
    XERO = "xero"
    SAGE = "sage"


class BaseAuthResult(BaseModel):
    """Base class for OAuth authorization results. Each system extends with specific fields."""

    model_config = ConfigDict(extra="allow")


class BaseTokenResult(BaseModel):
    """Base class for token operation results. Each system extends with specific fields."""

    model_config = ConfigDict(extra="allow")


class BaseInvoiceData(BaseModel):
    """Base class for invoice data. Each system extends with specific fields."""

    model_config = ConfigDict(extra="allow")


class BaseInvoiceResult(BaseModel):
    """Base class for invoice operation results. Each system extends with specific fields."""

    model_config = ConfigDict(extra="allow")


class BaseWebhookEvent(BaseModel):
    """Base class for webhook events. Each system extends with specific fields."""

    model_config = ConfigDict(extra="allow")
