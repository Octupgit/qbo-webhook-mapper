from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from starlette.requests import Request

from accounting.common.logging.json_logger import setup_logger
from accounting.exceptions.strategy_exceptions import UnsupportedAccountingSystemError
from accounting.models import BaseAuthResult
from accounting.services import OAuthService
from accounting.utils.oauth_state import verify_state

router = APIRouter(prefix="/api/v1/oauth", tags=["OAuth"])
logger = setup_logger()


@router.get("/authenticate/{accounting_system}/{partner_id}")
async def authenticate(accounting_system: str, partner_id: str) -> RedirectResponse:
    try:
        print(f"Authenticating {accounting_system} for partner {partner_id}")
        oauth_service = OAuthService()
        auth_url = await oauth_service.get_authorization_url(
            accounting_system=accounting_system,
            partner_id=partner_id,
        )
        print(f"Auth URL: {auth_url}")
        logger.info(f"OAuth initiated for {accounting_system}, partner: {partner_id}")
        return RedirectResponse(url=auth_url)

    except UnsupportedAccountingSystemError as e:
        logger.warning(f"Unsupported accounting system: {accounting_system}, partner: {partner_id}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"OAuth initiation failed for {accounting_system}, partner: {partner_id}")
        raise HTTPException(status_code=500, detail=f"Authentication failed: {str(e)}")

@router.get("/callback", response_model=None)
async def callback(request: Request) -> tuple[BaseAuthResult, str, str]:
    try:
        oauth_service = OAuthService()
        auth_result = await oauth_service.handle_callback(request)
        print(f"Auth Result: {auth_result}")

        state = request.query_params.get("state")
        if not state:
            raise ValueError("Missing state in callback")

        verified_state = verify_state(state)
        if not verified_state:
            raise ValueError("Invalid state in callback")
        partner_id = verified_state["partner_id"]
        accounting_system = verified_state["accounting_system"]

        logger.info(f"OAuth callback successful for {accounting_system}, partner: {partner_id}")
        return (auth_result, partner_id, accounting_system)

    except ValueError as e:
        logger.warning(f"OAuth callback failed - invalid state: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except UnsupportedAccountingSystemError as e:
        logger.warning(f"OAuth callback failed - unsupported system: {str(e)}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"OAuth callback failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Callback failed: {str(e)}")
