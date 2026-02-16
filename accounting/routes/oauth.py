from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status
from fastapi.responses import RedirectResponse

from accounting.common.auth.dependencies import AuthenticatedContext
from accounting.common.constants import CallbackStatus
from accounting.common.logging.json_logger import setup_logger
from accounting.models.oauth import AuthenticateDTO, CallbackDTO
from accounting.services.oauth_service import OAuthService

router = APIRouter(prefix="/api/v1/oauth", tags=["oauth"])
LOGGER = setup_logger()


@router.get("/systems")
async def get_systems(authentication_context: AuthenticatedContext):
    service = OAuthService()
    systems_dto = await service.get_systems()
    return systems_dto.to_response()


@router.get("/authenticate")
async def authenticate(
    authentication_context: AuthenticatedContext,
    accounting_system: str = Query(..., description="Accounting system (e.g., 'quickbooks')"),
    callback_uri: str = Query(..., description="URI to redirect after OAuth completion"),
):
    try:
        service = OAuthService()
        auth_dto = AuthenticateDTO.from_request(accounting_system=accounting_system, callback_uri=callback_uri)
        auth_dto = await service.initiate_oauth(authentication_context.partner_id, auth_dto)
        return RedirectResponse(url=str(auth_dto.authorization_url))
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
    realmId: str | None = Query(None, description="QuickBooks realm ID"),
):
    try:
        callback_dto = CallbackDTO.from_request(code=code, state=state, realm_id=realmId)

        # System extracted from state by service

        service = OAuthService()
        callback_dto, context = await service.handle_callback(callback_dto, accounting_system)

        state_data = service.state_manager.validate_state(state)
        callback_uri = state_data["callback_uri"]

        if callback_dto.status == CallbackStatus.SUCCESS:
            if context:
                background_tasks.add_task(service.process_initial_sync, context)
            redirect_url = f"{callback_uri}?status=success&integration_id={callback_dto.integration_id}"
        else:
            redirect_url = f"{callback_uri}?status=error&error_reason={callback_dto.error_reason}"

        return RedirectResponse(url=redirect_url)

    except ValueError as e:
        LOGGER.error(f"Callback validation error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        LOGGER.exception(f"Callback error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")
