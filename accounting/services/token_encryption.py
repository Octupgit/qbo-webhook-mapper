import base64
import os

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from accounting.config import settings


class TokenEncryption:
    def __init__(self):
        self.key = base64.urlsafe_b64decode(settings.OAUTH_STATE_SECRET.encode())

    def encrypt(self, token: str) -> str:
        iv = os.urandom(16)
        cipher = Cipher(algorithms.AES(self.key), modes.CBC(iv), backend=default_backend())
        encryptor = cipher.encryptor()

        padded = self._pad(token.encode())
        encrypted = encryptor.update(padded) + encryptor.finalize()

        return base64.b64encode(iv + encrypted).decode()

    def decrypt(self, encrypted_token: str) -> str:
        data = base64.b64decode(encrypted_token)
        iv = data[:16]
        encrypted = data[16:]

        cipher = Cipher(algorithms.AES(self.key), modes.CBC(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        decrypted = decryptor.update(encrypted) + decryptor.finalize()

        return self._unpad(decrypted).decode()

    @staticmethod
    def _pad(data: bytes) -> bytes:
        padding_length = 16 - (len(data) % 16)
        return data + bytes([padding_length] * padding_length)

    @staticmethod
    def _unpad(data: bytes) -> bytes:
        padding_length = data[-1]
        return data[:-padding_length]
