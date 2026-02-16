"""
Constants for accounting integration service.
All hardcoded values should be defined here for maintainability and extensibility.
"""

# ============================================================================
# ACCOUNTING SYSTEMS
# ============================================================================

class AccountingSystem:
    QUICKBOOKS = "quickbooks"
    XERO = "xero"  # Future support
    NETSUITE = "netsuite"  # Future support


class AccountingSystemName:
    QUICKBOOKS = "QuickBooks Online"
    QUICKBOOKS_SHORT = "QuickBooks"
    XERO = "Xero"  # Future support
    NETSUITE = "NetSuite"  # Future support


class AccountingSystemText:
    QUICKBOOKS = "Connect to QuickBooks"
    XERO = "Connect to Xero"  # Future support


class DefaultCompanyName:
    QUICKBOOKS = "QuickBooks Account"
    XERO = "Xero Account"  # Future support
    GENERIC = "Accounting Account"


# ============================================================================
# STATUS VALUES
# ============================================================================

class IntegrationStatus:
    ACTIVE = "active"
    INACTIVE = "inactive"
    PENDING = "pending"
    SUSPENDED = "suspended"


class SyncStatus:
    FULLY_SYNCED = "fully_synced"
    SYNC_ERROR = "sync_error"
    SYNC_PENDING = "sync_pending"
    MISSING_CLIENTS_MAPPING = "missing_clients_mapping"


class CallbackStatus:
    SUCCESS = "success"
    ERROR = "error"


class InvoiceSyncStatus:
    PENDING = "pending"
    SYNCING = "syncing"
    SYNCED = "synced"
    FAILED = "failed"


# ============================================================================
# HTTP & API
# ============================================================================

class HTTPHeaders:
    AUTHORIZATION = "Authorization"
    CONTENT_TYPE = "Content-Type"
    ACCEPT = "Accept"
    BEARER_PREFIX = "Bearer "


class ContentType:
    JSON = "application/json"
    FORM_URLENCODED = "application/x-www-form-urlencoded"


class APIPath:
    OAUTH_PREFIX = "/api/v1/oauth"
    OAUTH_SYSTEMS = "/api/v1/oauth/systems"
    OAUTH_AUTHENTICATE = "/api/v1/oauth/authenticate"
    OAUTH_CALLBACK = "/api/v1/oauth/callback"
    EXTERNAL_INTEGRATION = "/api/v1/external/accounting/integration"


# ============================================================================
# REDIS KEYS
# ============================================================================

class RedisKeyPrefix:
    SESSION = "accounting"
    TOKEN = "acct_token"
    INTEGRATION = "integration"


# ============================================================================
# QUICKBOOKS SPECIFIC
# ============================================================================

class QuickBooksFields:
    """QuickBooks API response field names"""
    QUERY_RESPONSE = "QueryResponse"
    CUSTOMER = "Customer"
    COMPANY_INFO = "CompanyInfo"
    COMPANY_NAME = "CompanyName"
    ID = "Id"
    DISPLAY_NAME = "DisplayName"
    FULLY_QUALIFIED_NAME = "FullyQualifiedName"
    PARENT_REF = "ParentRef"
    VALUE = "value"


class QuickBooksQuery:
    """QuickBooks API query strings"""
    SELECT_CUSTOMERS = "SELECT * FROM Customer MAXRESULTS 100"
    MINOR_VERSION = "65"


class QuickBooksAPI:
    """QuickBooks API paths"""
    COMPANY_INFO = "/v3/company/{realm_id}/companyinfo/{realm_id}"
    QUERY = "/v3/company/{realm_id}/query"


# ============================================================================
# ERROR MESSAGES
# ============================================================================

class ErrorMessage:
    NO_TOKEN_PROVIDED = "No token provided"
    SESSION_NOT_FOUND = "Session not found or expired"
    INVALID_SESSION_DATA = "Invalid session data format"
    UNSUPPORTED_SYSTEM = "Unsupported accounting system: {system}"
    MISSING_REALM_ID = "Missing realmId for OAuth callback"
    INTERNAL_ERROR = "Internal error"
    INVALID_OR_EXPIRED_TOKEN = "Invalid or expired token"


# ============================================================================
# LOG MESSAGES
# ============================================================================

class LogMessage:
    OAUTH_INITIATED = "OAuth initiated: partner_id={partner_id}, system={system}"
    INTEGRATION_CREATED = "Integration created: id={integration_id}, partner={partner_id}, system={system}"
    COMPANY_INFO_FETCH_FAILED = "CompanyInfo fetch failed: {error}, using fallback"
    CUSTOMER_FETCH_FAILED = "Customer fetch failed: {error}"
    TOKEN_EXCHANGE_FAILED = "Token exchange failed: {error}"
    TOKEN_REFRESH_FAILED = "Token refresh failed: {error}"
    SESSION_NOT_FOUND_IN_REDIS = "Session not found in Redis for token key: {key}"
    FAILED_TO_PARSE_SESSION = "Failed to parse session data: {error}"
    CALLBACK_VALIDATION_ERROR = "Callback validation error: {error}"
    CALLBACK_PROCESSING_ERROR = "Callback processing error: {error}"
    INITIAL_DATA_FETCH_FAILED = "Initial data fetch failed: {error}"
    COMPANY_INFO_FETCH_ERROR = "Company info fetch failed: {error}"
    OCTUP_NOTIFICATION_FAILED = "Failed to notify Octup: {error}"
    OCTUP_BASE_URL_NOT_CONFIGURED = "OCTUP_EXTERNAL_BASE_URL is not configured"
    OCTUP_NOTIFICATION_ATTEMPT = "Octup notification failed (attempt {attempt})"


# ============================================================================
# SYNC ERROR CODES
# ============================================================================

class SyncErrorCode:
    COMPANY_INFO_FETCH_FAILED = "company_info_fetch_failed"
    INITIAL_DATA_FETCH_FAILED = "initial_data_fetch_failed"
    TOKEN_REFRESH_FAILED = "token_refresh_failed"
    API_RATE_LIMIT = "api_rate_limit"
    INVALID_CREDENTIALS = "invalid_credentials"


# ============================================================================
# TIMEOUTS & RETRY
# ============================================================================

class Timeout:
    """Timeout values in seconds"""
    QUICKBOOKS_COMPANY_INFO = 10.0
    QUICKBOOKS_CUSTOMER_FETCH = 15.0
    OCTUP_NOTIFICATION = 15.0
    DEFAULT_HTTP = 30.0


class Retry:
    MAX_ATTEMPTS = 3
    BACKOFF_BASE = 5  # seconds
    BACKOFF_MULTIPLIER = 2


# ============================================================================
# VALIDATION PATTERNS
# ============================================================================

class ValidationPattern:
    ACCOUNTING_SYSTEM = "^(quickbooks|xero)$"
    UUID = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"


# ============================================================================
# DATABASE COLUMN SIZES
# ============================================================================

class ColumnSize:
    INTEGRATION_ID = 36
    ACCOUNTING_SYSTEM = 50
    REALM_ID = 100
    COMPANY_NAME = 255
    STATUS = 50
    ACCOUNTING_CLIENT_ID = 255
    DISPLAY_NAME = 255
