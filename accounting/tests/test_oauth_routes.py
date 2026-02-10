from accounting.app import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_authenticate_unsupported_system():
    response = client.get(
        "/api/v1/oauth/authenticate/unsupported/partner-123",
        follow_redirects=False,
    )

    assert response.status_code == 404
    assert "not supported" in response.json()["detail"].lower()


def test_authenticate_invalid_system():
    response = client.get(
        "/api/v1/oauth/authenticate/invalid-system/partner-123",
        follow_redirects=False,
    )

    assert response.status_code == 404


def test_authenticate_missing_partner_id():
    response = client.get(
        "/api/v1/oauth/authenticate/quickbooks/",
        follow_redirects=False,
    )

    assert response.status_code == 404
