from cryptography.fernet import Fernet

from app.config import settings


def get_fernet() -> Fernet:
    """Get Fernet cipher instance using encryption key from settings."""
    if not settings.ENCRYPTION_KEY:
        raise ValueError("ENCRYPTION_KEY not configured")
    return Fernet(settings.ENCRYPTION_KEY.encode())


def encrypt_token(token: str) -> str:
    """
    Encrypt a token using Fernet (AES-128-CBC with HMAC).

    Args:
        token: Plain text token to encrypt

    Returns:
        Base64-encoded encrypted token
    """
    fernet = get_fernet()
    return fernet.encrypt(token.encode()).decode()


def decrypt_token(encrypted_token: str) -> str:
    """
    Decrypt a token using Fernet.

    Args:
        encrypted_token: Base64-encoded encrypted token

    Returns:
        Plain text token
    """
    fernet = get_fernet()
    return fernet.decrypt(encrypted_token.encode()).decode()
