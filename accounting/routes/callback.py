from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from starlette.requests import Request

from accounting.common.logging.json_logger import setup_logger
from accounting.exceptions.strategy_exceptions import UnsupportedAccountingSystemError
from accounting.services.callback_service import CallbackService
from accounting.utils.oauth_state import verify_state

router = APIRouter(prefix="/api/v1/oauth", tags=["OAuth"])
logger = setup_logger()


@router.get("/callback")
async def callback(request: Request) -> RedirectResponse:
    try:
        callback_service = CallbackService()
        await callback_service.handle_callback(request)

        state = request.query_params.get("state")
        verified_state = verify_state(state)
        partner_id = verified_state["partner_id"]
        accounting_system = verified_state["accounting_system"]

        logger.info(f"OAuth callback successful for {accounting_system}, partner: {partner_id}")
        return RedirectResponse(url=f"/success?partner_id={partner_id}&system={accounting_system}")

    except ValueError as e:
        logger.warning(f"OAuth callback failed - invalid state: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except UnsupportedAccountingSystemError as e:
        logger.warning(f"OAuth callback failed - unsupported system: {str(e)}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"OAuth callback failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Callback failed: {str(e)}")
