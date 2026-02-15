from http import HTTPStatus
from typing import Annotated, Optional

import httpx
from fastapi import Depends, HTTPException, Request

from accounting.common.auth.models import AuthenticationContext
from accounting.common.logging.json_logger import setup_logger
from accounting.config import settings

LOGGER = setup_logger()

async def authenticate_fastapi(request: Request) -> AuthenticationContext:
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(status_code=440, detail="No active token was passed")

    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=440, detail="Invalid token format")

    token = auth_header.replace("Bearer ", "")

    try:
        octup_api_url = settings.OCTUP_API_URL
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{octup_api_url}/api/auth/validate-token",
                headers={"Authorization": f"Bearer {token}"},
                timeout=5.0
            )

            if response.status_code == 401 or response.status_code == 440:
                raise HTTPException(status_code=440, detail="Invalid Session")

            if response.status_code != 200:
                LOGGER.error(f"Octup API validation failed with status {response.status_code}")
                raise HTTPException(
                    status_code=HTTPStatus.INTERNAL_SERVER_ERROR,
                    detail="Token validation failed"
                )

            data = response.json()
            partner_id = data.get("partner_id") or data.get("client_id")
            if not partner_id:
                LOGGER.error("No partner_id in token validation response")
                raise HTTPException(
                    status_code=HTTPStatus.INTERNAL_SERVER_ERROR,
                    detail="Invalid token data"
                )

            authentication_context = AuthenticationContext(
                partner_id=partner_id,
                user_id=data.get("user_id"),
                user_email=data.get("user_email"),
                is_authenticated=True
            )
            return authentication_context

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error during token validation: {e}", exc_info=True)
        raise HTTPException(
            status_code=HTTPStatus.INTERNAL_SERVER_ERROR,
            detail="Authentication service error"
        )

AuthenticatedContext = Annotated[AuthenticationContext, Depends(authenticate_fastapi)]
