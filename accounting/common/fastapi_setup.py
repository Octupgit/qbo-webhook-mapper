import time
import uuid

from accounting.common.logging.json_logger import setup_logger

LOGGER = setup_logger()


def setup_fastapi_app(service: str, routers: list = [], port: int = 8080):
    import logging

    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware

    logger = setup_logger()

    logging.getLogger("uvicorn.access").disabled = True

    app = FastAPI(
        title=f"{service.title()} Service",
        logger=logger,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def guid_and_timing_middleware(request: Request, call_next):
        request_guid = str(uuid.uuid4())
        start_time = time.time()

        request.state.guid = request_guid
        request.state.start_time = start_time
        request.state.method_path = f"{request.url.path} [{request.method}]"

        response = await call_next(request)

        if not request.url.path.endswith("/health"):
            duration = time.time() - start_time
            logger.info(f"Request: {request.method} {request.url} {response.status_code} {duration:.2f}s")

        return response

    if routers:
        for router in routers:
            app.include_router(router)

    return app, port
