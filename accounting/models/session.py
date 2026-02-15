from datetime import datetime

from pydantic import BaseModel, Field


class User(BaseModel):
    id: str | int
    email: str
    client_id: str | int | None = Field(alias="clientId", default=None)
    full_name: str = Field(alias="fullName", default="")
    is_active: bool = Field(alias="isActive", default=True)
    role: str | None = None

    class Config:
        populate_by_name = True


class Session(BaseModel):
    id: str | int = Field(alias="session_id")
    email: str = Field(alias="user_id")
    token: str
    created_at: datetime

    class Config:
        populate_by_name = True


class SessionData(BaseModel):
    token: str
    user: User
    session: Session

    @property
    def partner_id(self) -> int:
        client_id = self.user.client_id
        if client_id is None:
            raise ValueError("No client_id in session data")
        return int(client_id)

    @property
    def user_id(self) -> int:
        return int(self.user.id)

    @property
    def user_email(self) -> str:
        return self.user.email
