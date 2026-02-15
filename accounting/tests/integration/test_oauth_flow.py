from unittest.mock import patch

import pytest
from accounting.app import app
from fastapi.testclient import TestClient


class TestOAuthFlowIntegration:
    @pytest.fixture
    def client(self):
        return TestClient(app)

    @pytest.fixture
    def mock_redis_session(self):
        session_data = {
            "token": "test_token",
            "user": {"id": 1, "email": "test@example.com", "clientId": 123, "fullName": "Test User", "isActive": True},
            "session": {
                "session_id": "session_123",
                "user_id": "test@example.com",
                "token": "test_token",
                "created_at": "2026-02-15T10:00:00Z",
            },
        }
        return session_data

    def test_get_systems_requires_authentication(self, client):
        response = client.get("/api/v1/oauth/systems")
        assert response.status_code == 440

    def test_get_systems_returns_available_systems(self, client, mock_redis_session):
        with patch("accounting.common.cache.user_session_cache.UserSessionCache.get_user_data") as mock_get:
            from accounting.models.session import SessionData

            mock_get.return_value = SessionData.model_validate(mock_redis_session)

            response = client.get("/api/v1/oauth/systems", headers={"Authorization": "Bearer test_token"})

            assert response.status_code == 200
            data = response.json()
            assert "systems" in data
            assert len(data["systems"]) > 0
            assert data["systems"][0]["id"] == "quickbooks"

    def test_authenticate_requires_authentication(self, client):
        response = client.get(
            "/api/v1/oauth/authenticate?accounting_system=quickbooks&callback_uri=https://octup.com/callback"
        )
        assert response.status_code == 440

    def test_authenticate_redirects_to_oauth_page(self, client, mock_redis_session):
        with patch("accounting.common.cache.user_session_cache.UserSessionCache.get_user_data") as mock_get:
            from accounting.models.session import SessionData

            mock_get.return_value = SessionData.model_validate(mock_redis_session)

            response = client.get(
                "/api/v1/oauth/authenticate?accounting_system=quickbooks&callback_uri=https://octup.com/callback",
                headers={"Authorization": "Bearer test_token"},
                follow_redirects=False,
            )

            assert response.status_code == 307
            assert "location" in response.headers
            assert "appcenter.intuit.com" in response.headers["location"]
