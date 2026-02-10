class StrategyError(Exception):
    """Base exception for strategy-related errors."""


class UnsupportedAccountingSystemError(StrategyError):
    """Raised when an unsupported accounting system is requested."""


class TokenRefreshError(StrategyError):
    """Raised when token refresh fails."""


class InvoiceCreationError(StrategyError):
    """Raised when invoice creation fails."""


class WebhookVerificationError(StrategyError):
    """Raised when webhook signature verification fails."""
