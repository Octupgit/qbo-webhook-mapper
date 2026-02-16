from datetime import datetime

from pydantic import BaseModel


class QuickBooksConnectionDetails(BaseModel):
    realm_id: str
    access_token: str
    refresh_token: str
    expiry: datetime
