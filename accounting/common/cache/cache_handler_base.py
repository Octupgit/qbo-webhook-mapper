import json
from typing import Any
from redis import Redis, ConnectionError

from accounting.common.logging.json_logger import setup_logger
from accounting.config import settings

TEN_MINUTES = 600

class CacheHandlerBase:
    _log = setup_logger()

    def __init__(self):
        self._redis = Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD,
            username=settings.REDIS_USERNAME,
            db=settings.REDIS_DB,
            decode_responses=True
        )

    @property
    def _delimiter(self) -> str:
        return ":"

    def _generate_key(self, parts: list[str]) -> str:
        return self._delimiter.join([str(p) for p in parts])

    def get(self, key: str) -> Any | None:
        self._log.debug(f"Getting data from cache for key: {key}")
        try:
            value = self._redis.get(key)
            if value is None:
                return None
            return json.loads(value)
        except ConnectionError as e:
            self._log.error("Connection Error in redis | make sure you are connected Redis")
            self._log.error(e)
            return None
        except Exception as e:
            self._log.error(f"Error in getting data from cache for key: {key} - {e}")
            return None

    def set(self, key: str, value: Any, expire_time: int = TEN_MINUTES) -> bool:
        self._log.debug(f"Setting data in cache for key: {key}")
        try:
            json_value = json.dumps(value)
            return self._redis.set(key, json_value, ex=expire_time)
        except Exception as e:
            self._log.error(f"Error setting data in cache for key: {key} - {e}")
            return False

    def delete(self, key: str) -> int:
        self._log.debug(f"Deleting data from cache for key: {key}")
        try:
            return self._redis.delete(key)
        except Exception as e:
            self._log.error(f"Error deleting data from cache for key: {key} - {e}")
            return 0
