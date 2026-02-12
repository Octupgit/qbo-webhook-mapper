import os

import uvicorn

from accounting.common.fastapi_setup import setup_fastapi_app
from accounting.common.logging.json_logger import setup_logger
from accounting.routes import routers
from accounting.config import settings

LOGGER = setup_logger()

if __name__ == "__main__":
    app, port = setup_fastapi_app("accounting-integration", routers, settings.PORT)

    LOGGER.info(f"Accounting Integration Service is running on port {port}")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_config=None,
        access_log=False,
    )
