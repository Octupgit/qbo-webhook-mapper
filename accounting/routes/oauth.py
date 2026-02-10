from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from accounting.common.logging.json_logger import setup_logger
from accounting.exceptions.strategy_exceptions import UnsupportedAccountingSystemError
from accounting.services.oauth_service import OAuthService

router = APIRouter(prefix="/api/v1/oauth", tags=["OAuth"])
logger = setup_logger()


@router.get("/authenticate/{accounting_system}/{partner_id}")
async def authenticate(accounting_system: str, partner_id: str) -> RedirectResponse:
    try:
        oauth_service = OAuthService()
        auth_url = await oauth_service.get_authorization_url(
            accounting_system=accounting_system,
            partner_id=partner_id,
        )
        logger.info(f"OAuth initiated for {accounting_system}, partner: {partner_id}")
        return RedirectResponse(url=auth_url)

    except UnsupportedAccountingSystemError as e:
        logger.warning(f"Unsupported accounting system: {accounting_system}, partner: {partner_id}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"OAuth initiation failed for {accounting_system}, partner: {partner_id}")
        raise HTTPException(status_code=500, detail=f"Authentication failed: {str(e)}")
