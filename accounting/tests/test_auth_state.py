from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from accounting.utils.oauth_state import generate_state, verify_state


def test_generate_state():
    state = generate_state(partner_id="partner-123", accounting_system="quickbooks")

    assert isinstance(state, str)
    assert "." in state
    payload_b64, signature = state.split(".", 1)
    assert len(payload_b64) > 0
    assert len(signature) == 64


def test_verify_state_valid():
    state = generate_state(partner_id="partner-123", accounting_system="quickbooks")

    result = verify_state(state)

    assert result is not None
    assert result["partner_id"] == "partner-123"
    assert result["accounting_system"] == "quickbooks"
    assert "timestamp" in result


def test_verify_state_invalid_signature():
    state = generate_state(partner_id="partner-123", accounting_system="quickbooks")
    tampered_state = state[:-1] + "x"

    result = verify_state(tampered_state)

    assert result is None


def test_verify_state_invalid_format():
    result = verify_state("invalid-state-no-dot")

    assert result is None


def test_verify_state_expired():
    with patch("accounting.utils.oauth_state.datetime") as mock_datetime:
        past_time = datetime.now(UTC) - timedelta(minutes=15)
        mock_datetime.now.return_value = past_time

        state = generate_state(partner_id="partner-123", accounting_system="quickbooks")

        mock_datetime.now.return_value = datetime.now(UTC)

        result = verify_state(state)

        assert result is None


def test_verify_state_malformed_json():
    result = verify_state("bm90LWpzb24=.0123456789abcdef" + "0" * 48)

    assert result is None
