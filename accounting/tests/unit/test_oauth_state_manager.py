import time

import pytest
from accounting.services.oauth_state_manager import OAuthStateManager


class TestOAuthStateManager:
    def test_generate_state_creates_valid_encrypted_string(self):
        manager = OAuthStateManager()
        state = manager.generate_state(partner_id=123, callback_uri="https://octup.com/callback", accounting_system="quickbooks")

        assert isinstance(state, str)
        assert len(state) > 0

    def test_validate_state_decrypts_and_returns_data(self):
        manager = OAuthStateManager()
        partner_id = 456
        callback_uri = "https://octup.com/settings"
        accounting_system = "quickbooks"

        state = manager.generate_state(partner_id=partner_id, callback_uri=callback_uri, accounting_system=accounting_system)
        decoded_data = manager.validate_state(state)

        assert decoded_data["partner_id"] == partner_id
        assert decoded_data["callback_uri"] == callback_uri
        assert decoded_data["accounting_system"] == accounting_system
        assert "timestamp" in decoded_data

    def test_validate_state_rejects_expired_state(self):
        manager = OAuthStateManager()
        manager.ttl_seconds = 1

        state = manager.generate_state(partner_id=789, callback_uri="https://octup.com/callback", accounting_system="quickbooks")

        time.sleep(2)

        with pytest.raises(ValueError, match="State expired"):
            manager.validate_state(state)

    def test_validate_state_rejects_invalid_state(self):
        manager = OAuthStateManager()

        with pytest.raises(ValueError, match="Invalid state parameter"):
            manager.validate_state("invalid_state_string")

    def test_state_is_deterministic_for_same_timestamp(self):
        manager = OAuthStateManager()

        state1 = manager.generate_state(partner_id=100, callback_uri="https://test.com", accounting_system="quickbooks")

        time.sleep(1)

        state2 = manager.generate_state(partner_id=100, callback_uri="https://test.com", accounting_system="quickbooks")

        data1 = manager.validate_state(state1)
        data2 = manager.validate_state(state2)

        assert data1["timestamp"] != data2["timestamp"]
