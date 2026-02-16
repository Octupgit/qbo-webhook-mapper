from __future__ import annotations

from accounting.config import settings


def create_accounting_data_store_url(schema: str | None = None) -> str:
    engine = settings.ACCOUNTING_DB_ENGINE
    host_url = settings.ACCOUNTING_DB_URL
    user = settings.ACCOUNTING_DB_USER
    pw = settings.ACCOUNTING_DB_PW
    schema_name = schema or settings.ACCOUNTING_SCHEMA_NAME

    if engine.startswith("sqlite"):
        return f"{engine}:///{host_url}"

    return f"{engine}://{user}:{pw}@{host_url}/{schema_name}"
