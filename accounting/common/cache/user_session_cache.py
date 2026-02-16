from accounting.common.cache.cache_handler_base import CacheHandlerBase
from accounting.common.constants import ErrorMessage, RedisKeyPrefix
from accounting.common.logging.json_logger import setup_logger
from accounting.models.session import SessionData


class UserTokenNotFoundException(Exception):
    pass


class InvalidSessionError(Exception):
    pass


class UserSessionCache(CacheHandlerBase):
    _log = setup_logger()
    __pref_session = RedisKeyPrefix.SESSION

    def __key_user_token(self, user_token: str) -> str:
        return self._generate_key([self.__pref_session, user_token])

    def get_user_data(self, token: str) -> SessionData:
        if not token:
            raise UserTokenNotFoundException(ErrorMessage.NO_TOKEN_PROVIDED)

        key = self.__key_user_token(token)
        user_session_data_raw = self.get(key)

        if not user_session_data_raw:
            self._log.warning(f"Session not found in Redis for token key: {key}")
            raise InvalidSessionError(ErrorMessage.SESSION_NOT_FOUND)

        try:
            return SessionData.model_validate(user_session_data_raw)
        except Exception as e:
            self._log.error(f"Failed to parse session data: {e}")
            raise InvalidSessionError(ErrorMessage.INVALID_SESSION_DATA)
