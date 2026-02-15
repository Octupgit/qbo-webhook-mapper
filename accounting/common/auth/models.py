from pydantic import BaseModel
from typing import Optional

class AuthenticationContext(BaseModel):
    partner_id: int
    user_id: Optional[int] = None
    user_email: Optional[str] = None
    is_authenticated: bool = True

    class Config:
        from_attributes = True
