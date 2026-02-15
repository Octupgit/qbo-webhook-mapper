import pytest
from accounting.services.token_encryption import TokenEncryption

class TestTokenEncryption:
    def test_encrypt_returns_different_ciphertext_for_same_token(self):
        encryption = TokenEncryption()
        token = "test_access_token_12345"

        encrypted1 = encryption.encrypt(token)
        encrypted2 = encryption.encrypt(token)

        assert encrypted1 != encrypted2

    def test_decrypt_returns_original_token(self):
        encryption = TokenEncryption()
        original_token = "my_secure_access_token"

        encrypted = encryption.encrypt(original_token)
        decrypted = encryption.decrypt(encrypted)

        assert decrypted == original_token

    def test_encrypt_decrypt_with_special_characters(self):
        encryption = TokenEncryption()
        token = "token!@#$%^&*()_+-=[]{}|;:',.<>?/~`"

        encrypted = encryption.encrypt(token)
        decrypted = encryption.decrypt(encrypted)

        assert decrypted == token

    def test_encrypt_decrypt_with_long_token(self):
        encryption = TokenEncryption()
        token = "a" * 500

        encrypted = encryption.encrypt(token)
        decrypted = encryption.decrypt(encrypted)

        assert decrypted == token

    def test_decrypt_invalid_ciphertext_raises_error(self):
        encryption = TokenEncryption()

        with pytest.raises(Exception):
            encryption.decrypt("invalid_base64_string")
