import os

import uvicorn

from app.common.fastapi_setup import setup_fastapi_app
from app.common.logging.json_logger import setup_logger

LOGGER = setup_logger()

if __name__ == "__main__":
    from app.routes import routers

    port = int(os.getenv("PORT", 8080))
    app, port = setup_fastapi_app("accounting-integration", routers, port)

    LOGGER.info(f"Accounting Integration Service is running on port {port}")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_config=None,
        access_log=False,
    )
