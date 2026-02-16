import json
import time

from cryptography.fernet import Fernet

from accounting.common.logging.json_logger import setup_logger
from accounting.config import settings


class OAuthStateManager:
    def __init__(self):
        self.fernet = Fernet(settings.ENCRYPTION_KEY.encode())
        self.ttl_seconds = 600
        self._log = setup_logger()

    def generate_state(self, partner_id: int, callback_uri: str, accounting_system: str) -> str:
        data = {
            "partner_id": partner_id,
            "callback_uri": callback_uri,
            "accounting_system": accounting_system,
            "timestamp": int(time.time()),
        }
        json_data = json.dumps(data)
        encrypted = self.fernet.encrypt(json_data.encode())
        return encrypted.decode()

    def validate_state(self, state: str) -> dict:
        try:
            decrypted = self.fernet.decrypt(state.encode())
            data = json.loads(decrypted.decode())

            age = time.time() - data["timestamp"]
            if age > self.ttl_seconds:
                self._log.warning(f"State expired: age={age}s")
                raise ValueError("State expired")

            return data
        except Exception as e:
            self._log.error(f"State validation failed: {str(e)}")
            raise ValueError(f"Invalid state parameter: {str(e)}")
