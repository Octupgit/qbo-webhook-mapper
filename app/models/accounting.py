from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TokenResult(BaseModel):
    """Result from getting or refreshing a token."""

    access_token: str = Field(..., description="Current valid access token")
    refresh_token: str = Field(..., description="Current refresh token (may be rotated)")
    needs_refresh: bool = Field(default=False, description="Whether token was refreshed")
    expires_in: int | None = Field(
        default=None, description="Token expiration time in seconds (only if refreshed)"
    )


class InvoiceLineItem(BaseModel):
    """Generic invoice line item."""

    description: str = Field(..., description="Line item description")
    quantity: float = Field(..., description="Quantity")
    unit_price: float = Field(..., description="Unit price")
    amount: float = Field(..., description="Total amount (quantity * unit_price)")
    item_id: str | None = Field(default=None, description="Item/product ID in accounting system")


class GenericInvoice(BaseModel):
    """Generic invoice format that strategies transform to system-specific format."""

    customer_id: str = Field(..., description="Customer ID in the accounting system")
    issue_date: datetime = Field(..., description="Invoice issue date")
    due_date: datetime | None = Field(default=None, description="Invoice due date")
    line_items: list[InvoiceLineItem] = Field(..., description="Invoice line items")
    currency: str = Field(default="USD", description="Currency code")
    memo: str | None = Field(default=None, description="Invoice memo/notes")
    octup_invoice_number: str | None = Field(
        default=None, description="Original Octup invoice number for reference"
    )


class InvoiceResult(BaseModel):
    """Result from creating an invoice in the accounting system."""

    success: bool = Field(..., description="Whether invoice creation was successful")
    invoice_id: str | None = Field(default=None, description="Invoice ID in accounting system")
    doc_number: str | None = Field(default=None, description="Invoice document number")
    error: str | None = Field(default=None, description="Error message if failed")
    error_code: str | None = Field(default=None, description="Error code if failed")
    error_detail: str | None = Field(default=None, description="Detailed error message")


class WebhookVerificationResult(BaseModel):
    """Result from verifying a webhook signature."""

    valid: bool = Field(..., description="Whether the webhook signature is valid")
    error: str | None = Field(default=None, description="Error message if verification failed")


class WebhookEvent(BaseModel):
    """Normalized webhook event data."""

    event_type: str = Field(..., description="Type of event (e.g., 'customer.created', 'invoice.updated')")
    entity_type: str = Field(..., description="Type of entity (e.g., 'Customer', 'Invoice')")
    entity_id: str = Field(..., description="ID of the entity in the accounting system")
    entity_name: str | None = Field(default=None, description="Name/display name of the entity")
    is_deleted: bool = Field(default=False, description="Whether the entity was deleted")
    raw_event: dict[str, Any] = Field(..., description="Original raw event data")
