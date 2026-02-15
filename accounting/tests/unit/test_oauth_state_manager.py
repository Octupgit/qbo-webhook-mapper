import pytest
import time
from accounting.services.oauth_state_manager import OAuthStateManager

class TestOAuthStateManager:
    def test_generate_state_creates_valid_encrypted_string(self):
        manager = OAuthStateManager()
        state = manager.generate_state(
            partner_id=123,
            callback_uri="https://octup.com/callback"
        )

        assert isinstance(state, str)
        assert len(state) > 0

    def test_validate_state_decrypts_and_returns_data(self):
        manager = OAuthStateManager()
        partner_id = 456
        callback_uri = "https://octup.com/settings"

        state = manager.generate_state(partner_id=partner_id, callback_uri=callback_uri)
        decoded_data = manager.validate_state(state)

        assert decoded_data["partner_id"] == partner_id
        assert decoded_data["callback_uri"] == callback_uri
        assert "nonce" in decoded_data
        assert "timestamp" in decoded_data

    def test_validate_state_rejects_expired_state(self):
        manager = OAuthStateManager()
        manager.ttl_seconds = 1

        state = manager.generate_state(
            partner_id=789,
            callback_uri="https://octup.com/callback"
        )

        time.sleep(2)

        with pytest.raises(ValueError, match="State expired"):
            manager.validate_state(state)

    def test_validate_state_rejects_invalid_state(self):
        manager = OAuthStateManager()

        with pytest.raises(ValueError, match="Invalid state parameter"):
            manager.validate_state("invalid_state_string")

    def test_state_contains_nonce(self):
        manager = OAuthStateManager()

        state1 = manager.generate_state(partner_id=100, callback_uri="https://test.com")
        state2 = manager.generate_state(partner_id=100, callback_uri="https://test.com")

        assert state1 != state2

        data1 = manager.validate_state(state1)
        data2 = manager.validate_state(state2)

        assert data1["nonce"] != data2["nonce"]
