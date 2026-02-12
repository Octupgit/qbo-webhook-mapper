from unittest.mock import AsyncMock, patch

from accounting.app import app
from accounting.exceptions.strategy_exceptions import UnsupportedAccountingSystemError
from accounting.models import BaseAuthResult
from fastapi.testclient import TestClient

client = TestClient(app)


def test_authenticate_unsupported_system():
    response = client.get(
        "/api/v1/auth/authenticate/unsupported/partner-123",
        follow_redirects=False,
    )

    assert response.status_code == 404
    assert "not supported" in response.json()["detail"].lower()


def test_authenticate_invalid_system():
    response = client.get(
        "/api/v1/auth/authenticate/invalid-system/partner-123",
        follow_redirects=False,
    )

    assert response.status_code == 404


def test_authenticate_missing_partner_id():
    response = client.get(
        "/api/v1/auth/authenticate/quickbooks/",
        follow_redirects=False,
    )

    assert response.status_code == 404


def test_callback_success():
    mock_auth_result = BaseAuthResult()
    mock_verified_state = {
        "partner_id": "partner-123",
        "accounting_system": "quickbooks",
        "timestamp": 1234567890,
    }

    with (
        patch("accounting.routes.auth.AuthService") as mock_service_class,
        patch("accounting.routes.auth.verify_state", return_value=mock_verified_state),
    ):
        mock_service = AsyncMock()
        mock_service.handle_callback.return_value = mock_auth_result
        mock_service_class.return_value = mock_service

        response = client.get(
            "/api/v1/auth/callback?state=valid_state&code=auth_code",
            follow_redirects=False,
        )

        assert response.status_code == 307
        assert "/success?partner_id=partner-123&system=quickbooks" in response.headers["location"]


def test_callback_missing_state():
    response = client.get(
        "/api/v1/auth/callback",
        follow_redirects=False,
    )

    assert response.status_code == 400
    assert "Missing state parameter" in response.json()["detail"]


def test_callback_invalid_state():
    with patch("accounting.routes.auth.AuthService") as mock_service_class:
        mock_service = AsyncMock()
        mock_service.handle_callback.side_effect = ValueError("Invalid or expired state")
        mock_service_class.return_value = mock_service

        response = client.get(
            "/api/v1/auth/callback?state=invalid_state",
            follow_redirects=False,
        )

        assert response.status_code == 400
        assert "Invalid or expired state" in response.json()["detail"]


def test_callback_unsupported_system():
    with patch("accounting.routes.auth.AuthService") as mock_service_class:
        mock_service = AsyncMock()
        mock_service.handle_callback.side_effect = UnsupportedAccountingSystemError("System not supported")
        mock_service_class.return_value = mock_service

        response = client.get(
            "/api/v1/auth/callback?state=valid_state",
            follow_redirects=False,
        )

        assert response.status_code == 404
        assert "not supported" in response.json()["detail"].lower()


def test_callback_strategy_error():
    with patch("accounting.routes.auth.AuthService") as mock_service_class:
        mock_service = AsyncMock()
        mock_service.handle_callback.side_effect = Exception("Strategy error")
        mock_service_class.return_value = mock_service

        response = client.get(
            "/api/v1/auth/callback?state=valid_state",
            follow_redirects=False,
        )

        assert response.status_code == 500
        assert "Callback failed" in response.json()["detail"]
