def build_database_url(settings_obj) -> str:
    if settings_obj.DATABASE_URL:
        return settings_obj.DATABASE_URL
    if not (
        settings_obj.ACCOUNTING_DB_ENGINE
        and settings_obj.ACCOUNTING_DB_USER
        and settings_obj.ACCOUNTING_DB_PW
        and settings_obj.ACCOUNTING_DB_URL
    ):
        return ""
    schema = settings_obj.ACCOUNTING_SCHEMA_NAME
    return (
        f"{settings_obj.ACCOUNTING_DB_ENGINE}://"
        f"{settings_obj.ACCOUNTING_DB_USER}:{settings_obj.ACCOUNTING_DB_PW}"
        f"@{settings_obj.ACCOUNTING_DB_URL}/{schema}"
    )
