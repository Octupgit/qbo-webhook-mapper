import uvicorn

from accounting.common.fastapi_setup import setup_fastapi_app
from accounting.common.logging.json_logger import setup_logger
from accounting.config import settings
from accounting.routes import routers

LOGGER = setup_logger()

app, _ = setup_fastapi_app("accounting-integration", routers, settings.PORT)

if __name__ == "__main__":
    port = settings.PORT

    LOGGER.info(f"Accounting Integration Service is running on port {port}")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_config=None,
        access_log=False,
    )
