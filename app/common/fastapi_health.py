from http import HTTPStatus

from fastapi import APIRouter


def add_health(router: APIRouter):

    @router.get("/health", status_code=HTTPStatus.OK, tags=["health"])
    async def health():
        return {"status": "healthy"}
