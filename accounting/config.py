from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    PORT: int = 8080
    ENV: str = "DEV"
    LOG_LEVEL: str = "INFO"
    ENCRYPTION_KEY: str = ""
    OAUTH_STATE_SECRET: str = ""
    DATABASE_URL: str = ""
    QBO_CLIENT_ID: str = ""
    QBO_CLIENT_SECRET: str = ""
    QBO_ENVIRONMENT: str = "sandbox"
    QBO_REDIRECT_URI: str = ""
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str = ""
    REDIS_USERNAME: str = "default"
    REDIS_DB: int = 1
    OCTUP_EXTERNAL_BASE_URL: str = ""
    ACCOUNTING_SCHEMA_NAME: str = "accounting_integrations"


settings = Settings()
