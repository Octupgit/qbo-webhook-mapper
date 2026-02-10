from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="allow")

    PORT: int = 8080
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    QBO_CLIENT_ID: str = ""
    QBO_CLIENT_SECRET: str = ""
    QBO_ENVIRONMENT: str = "sandbox"
    QBO_REDIRECT_URI: str = ""

    ENCRYPTION_KEY: str = ""
    OAUTH_STATE_SECRET: str = ""

    DATABASE_URL: str = ""


settings = Settings()
