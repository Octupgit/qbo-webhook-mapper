import json
from typing import Any

from accounting.common.logging.json_logger import setup_logger
from accounting.config import settings
from redis import ConnectionError, Redis

TEN_MINUTES = 600
REDIS_DATABASES = {"LOCAL": "1", "DEV": "2", "STG": "3", "PROD": "4"}


class CacheHandlerBase:
    _log = setup_logger()

    def __init__(self):
        self._redis = Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD,
            username=settings.REDIS_USERNAME,
            db=REDIS_DATABASES[settings.ENV],
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

