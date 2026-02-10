import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta

from app.config import settings


def generate_state(organization_id: str, **kwargs) -> str:
    """
    Generate HMAC-signed state parameter for OAuth flow.

    The state includes organization_id and optional metadata, signed with
    OAUTH_STATE_SECRET to prevent tampering.

    Args:
        organization_id: Octup organization ID
        **kwargs: Additional metadata to include in state

    Returns:
        Base64-encoded signed state string
    """
    if not settings.OAUTH_STATE_SECRET:
        raise ValueError("OAUTH_STATE_SECRET not configured")

    expires_at = (datetime.utcnow() + timedelta(minutes=10)).isoformat()

    state_data = {"organization_id": organization_id, "expires_at": expires_at, **kwargs}

    state_json = json.dumps(state_data, separators=(",", ":"))
    state_bytes = state_json.encode()

    signature = hmac.new(
        settings.OAUTH_STATE_SECRET.encode(), state_bytes, hashlib.sha256
    ).digest()

    combined = signature + state_bytes
    return base64.urlsafe_b64encode(combined).decode()


def verify_state(state: str) -> dict | None:
    """
    Verify and decode HMAC-signed state parameter.

    Args:
        state: Base64-encoded signed state string

    Returns:
        Decoded state data dict if valid, None if invalid or expired
    """
    if not settings.OAUTH_STATE_SECRET:
        raise ValueError("OAUTH_STATE_SECRET not configured")

    try:
        combined = base64.urlsafe_b64decode(state.encode())

        signature = combined[:32]
        state_bytes = combined[32:]

        expected_signature = hmac.new(
            settings.OAUTH_STATE_SECRET.encode(), state_bytes, hashlib.sha256
        ).digest()

        if not hmac.compare_digest(signature, expected_signature):
            return None

        state_data = json.loads(state_bytes.decode())

        expires_at = datetime.fromisoformat(state_data["expires_at"])
        if datetime.utcnow() > expires_at:
            return None

        return state_data

    except Exception:
        return None
