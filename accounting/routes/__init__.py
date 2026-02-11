from accounting.routes.callback import router as callback_router
from accounting.routes.oauth import router as oauth_router

routers = [oauth_router, callback_router]
