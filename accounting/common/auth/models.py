from pydantic import BaseModel


class AuthenticationContext(BaseModel):
    partner_id: int
    user_id: int | None = None
    user_email: str | None = None
    is_authenticated: bool = True

    class Config:
        from_attributes = True
