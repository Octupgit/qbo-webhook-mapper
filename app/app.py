import os

import uvicorn

from app.common.fastapi_setup import setup_fastapi_app
from app.common.logging.json_logger import setup_logger
from app.routes import routers

LOGGER = setup_logger()

app, _ = setup_fastapi_app("accounting-integration", routers, int(os.getenv("PORT", 8080)))

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))

    LOGGER.info(f"Accounting Integration Service is running on port {port}")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_config=None,
        access_log=False,
    )
