from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from typing import Optional

from accounting.models.oauth import (
    SystemsResponseDTO,
    AuthenticateRequestDTO,
    AuthenticateResponseDTO,
    CallbackQueryDTO
)
from accounting.services.oauth_service import OAuthService
from accounting.common.logging.json_logger import setup_logger

router = APIRouter(prefix="/api/v1/oauth", tags=["oauth"])
LOGGER = setup_logger()

@router.get("/systems", response_model=SystemsResponseDTO)
async def get_systems():
    service = OAuthService()
    return await service.get_systems()

@router.post("/authenticate", response_model=AuthenticateResponseDTO)
async def authenticate(request: AuthenticateRequestDTO):
    try:
        service = OAuthService()
        return await service.initiate_oauth(request)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        LOGGER.exception(f"Authentication error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@router.get("/callback")
async def callback(
    code: str = Query(..., description="Authorization code"),
    state: str = Query(..., description="Encrypted state parameter"),
    realmId: Optional[str] = Query(None, description="QuickBooks realm ID")
):
    try:
        callback_data = CallbackQueryDTO(
            code=code,
            state=state,
            realmId=realmId
        )

        accounting_system = "quickbooks"

        service = OAuthService()
        result = await service.handle_callback(callback_data, accounting_system)

        state_data = service.state_manager.validate_state(state)
        callback_uri = state_data["callback_uri"]

        if result.status == "success":
            redirect_url = f"{callback_uri}?status=success&integration_id={result.integration_id}"
        else:
            redirect_url = f"{callback_uri}?status=error&error_reason={result.error_reason}"

        return RedirectResponse(url=redirect_url)

    except ValueError as e:
        LOGGER.error(f"Callback validation error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        LOGGER.exception(f"Callback error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )
