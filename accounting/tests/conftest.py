import os

from cryptography.fernet import Fernet


def pytest_configure(config):
    """
    Pytest hook that runs before any test collection or imports.
    Sets up environment variables needed for tests.
    """
    test_fernet_key = Fernet.generate_key().decode()
    test_aes_key = Fernet.generate_key().decode()

    os.environ["ENCRYPTION_KEY"] = test_fernet_key
    os.environ["OAUTH_STATE_SECRET"] = test_aes_key
    os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
    os.environ["REDIS_HOST"] = "localhost"
    os.environ["REDIS_PORT"] = "6379"
    os.environ["REDIS_PASSWORD"] = ""
    os.environ["REDIS_USERNAME"] = "default"
    os.environ["ENV"] = "LOCAL"
