from http import HTTPStatus
from typing import Annotated

from accounting.common.auth.models import AuthenticationContext
from accounting.common.cache.user_session_cache import InvalidSessionError, UserSessionCache, UserTokenNotFoundException
from accounting.common.logging.json_logger import setup_logger
from fastapi import Depends, HTTPException, Request

LOGGER = setup_logger()


async def authenticate_fastapi(request: Request) -> AuthenticationContext:
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(status_code=440, detail="No active token was passed")

    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=440, detail="Invalid token format")

    token = auth_header.replace("Bearer ", "")

    try:
        session_cache = UserSessionCache()
        session_data = session_cache.get_user_data(token)

        authentication_context = AuthenticationContext(
            partner_id=session_data.partner_id,
            user_id=session_data.user_id,
            user_email=session_data.user_email,
            is_authenticated=True,
        )
        return authentication_context

    except UserTokenNotFoundException:
        raise HTTPException(status_code=440, detail="No active token was passed")
    except InvalidSessionError:
        raise HTTPException(status_code=440, detail="Invalid Session")
    except ValueError as e:
        LOGGER.error(f"Session data validation error: {e}")
        raise HTTPException(status_code=440, detail="Invalid session data")
    except Exception as e:
        LOGGER.error(f"Error during token validation: {e}", exc_info=True)
        raise HTTPException(status_code=HTTPStatus.INTERNAL_SERVER_ERROR, detail="Authentication service error")


AuthenticatedContext = Annotated[AuthenticationContext, Depends(authenticate_fastapi)]
