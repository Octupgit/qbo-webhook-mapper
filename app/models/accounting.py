from pydantic import BaseModel


class BaseAuthResult(BaseModel):
    """Base class for OAuth authorization results. Each system extends with specific fields."""


class BaseTokenResult(BaseModel):
    """Base class for token operation results. Each system extends with specific fields."""


class BaseInvoiceData(BaseModel):
    """Base class for invoice data. Each system extends with specific fields."""


class BaseInvoiceResult(BaseModel):
    """Base class for invoice operation results. Each system extends with specific fields."""


class BaseWebhookEvent(BaseModel):
    """Base class for webhook events. Each system extends with specific fields."""
