import base64
import hmac
import json
from datetime import datetime, timedelta, timezone
from typing import Any

from accounting.config import settings


def generate_state(partner_id: str, accounting_system: str) -> str:
    timestamp = int(datetime.now(timezone.utc).timestamp())

    payload = {
        "partner_id": partner_id,
        "accounting_system": accounting_system,
        "timestamp": timestamp,
    }

    payload_json = json.dumps(payload, separators=(",", ":"))
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode()).decode()

    signature = hmac.new(
        settings.OAUTH_STATE_SECRET.encode(),
        payload_b64.encode(),
        "sha256",
    ).hexdigest()

    return f"{payload_b64}.{signature}"


def verify_state(state: str) -> dict[str, Any] | None:
    try:
        payload_b64, signature = state.split(".", 1)
    except ValueError:
        return None

    expected_signature = hmac.new(
        settings.OAUTH_STATE_SECRET.encode(),
        payload_b64.encode(),
        "sha256",
    ).hexdigest()

    if not hmac.compare_digest(signature, expected_signature):
        return None

    try:
        payload_json = base64.urlsafe_b64decode(payload_b64).decode()
        payload = json.loads(payload_json)
    except (ValueError, json.JSONDecodeError):
        return None

    timestamp = payload.get("timestamp")
    if not timestamp:
        return None

    state_age = datetime.now(timezone.utc).timestamp() - timestamp
    if state_age > 600:
        return None

    return payload
