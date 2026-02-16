from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status
from fastapi.responses import RedirectResponse

from accounting.common.auth.dependencies import AuthenticatedContext
from accounting.common.constants import CallbackStatus
from accounting.common.logging.json_logger import setup_logger
from accounting.models.oauth import AuthenticateDTO, CallbackDTO
from accounting.services.oauth_service import OAuthService

router = APIRouter(prefix="/api/v1/oauth", tags=["oauth"])
LOGGER = setup_logger()

oauth_service = OAuthService()


@router.get("/systems")
async def get_systems(authentication_context: AuthenticatedContext):
    systems_dto = await oauth_service.get_systems()
    return systems_dto.to_response()


@router.get("/authenticate")
async def authenticate(
    authentication_context: AuthenticatedContext,
    accounting_system: str = Query(..., description="Accounting system (e.g., 'quickbooks')"),
    callback_uri: str = Query(..., description="URI to redirect after OAuth completion"),
):
    try:
        auth_dto = AuthenticateDTO.from_request(
            accounting_system=accounting_system,
            callback_uri=callback_uri,
            partner_id=authentication_context.partner_id,
        )
        auth_dto = await oauth_service.initiate_oauth(auth_dto)
        return RedirectResponse(auth_dto.to_response())
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        LOGGER.exception(f"Authentication error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")


@router.get("/callback")
async def callback(
    background_tasks: BackgroundTasks,
    code: str = Query(..., description="Authorization code"),
    state: str = Query(..., description="Encrypted state parameter"),
    realmId: str | None = Query(None, description="Accounting system realm ID"),
):
    try:
        callback_dto = CallbackDTO.from_request(code=code, state=state, realm_id=realmId)

        callback_dto = await oauth_service.handle_callback(callback_dto)

        state_data = oauth_service.state_manager.validate_state(state)
        callback_uri = state_data["callback_uri"]

        if callback_dto.status == CallbackStatus.SUCCESS:
            redirect_url = f"{callback_uri}?status=success&accounting_system={state_data["accounting_system"]}"
        else:
            redirect_url = f"{callback_uri}?status=error&error_reason={callback_dto.error_reason}"

        return RedirectResponse(url=redirect_url)

    except ValueError as e:
        LOGGER.error(f"Callback validation error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        LOGGER.exception(f"Callback error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")
