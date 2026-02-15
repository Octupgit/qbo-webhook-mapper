from __future__ import annotations

from typing import Any

import tenacity
from sqlalchemy import MetaData
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from accounting.common.logging.json_logger import setup_logger
from accounting.config import settings

engines: dict[str, AsyncEngine] = {}


class Base(DeclarativeBase):
    pass


class RetrySettings:
    stop: tenacity.stop.stop_base = tenacity.stop_after_attempt(5)
    wait: tenacity.wait.wait_base = tenacity.wait_exponential(min=2, max=10)


def _log_after_attempt(retry_state: tenacity.RetryCallState):
    _log = setup_logger()
    _log.warning(
        "Temporary data store error (attempt %d): %s",
        retry_state.attempt_number,
        retry_state.outcome.exception(),
    )


class BaseSQLEngine:
    retry_settings = RetrySettings()
    _log = setup_logger()

    def __init__(self, url: str | None = None):
        self._engine = engines.get(url or settings.DATABASE_URL)
        self._sessionmaker = None
        self.url = url or settings.DATABASE_URL
        self.metadata = MetaData()

    @property
    def engine(self):
        try:
            if self._engine is None:
                self._engine = create_async_engine(
                    self.url, echo=settings.ENVIRONMENT == "development", pool_pre_ping=True, pool_recycle=3600
                )
                self._log.debug("SQL engine initialized")
                engines[self.url] = self._engine
            return self._engine
        except Exception as e:
            self._log.error(f"Error while creating engine: {e}")
            raise e

    @property
    def sessionmaker(self):
        if self._sessionmaker is None:
            self._sessionmaker = sessionmaker(self.engine, expire_on_commit=False, class_=AsyncSession)
        return self._sessionmaker

    @tenacity.retry(
        retry=tenacity.retry_if_exception_type((InterfaceError, OperationalError)),
        stop=tenacity.stop_after_attempt(5),
        wait=tenacity.wait_exponential(min=2, max=10),
        after=_log_after_attempt,
    )
    async def execute_query_fetch_all(self, query, to_dict: bool = True) -> list[dict] | list[Any]:
        async with self.sessionmaker() as session:
            result = await session.execute(query)
            rows = result.all()
            if to_dict:
                return [dict(row._mapping) for row in rows]
            return rows

    @tenacity.retry(
        retry=tenacity.retry_if_exception_type((InterfaceError, OperationalError)),
        stop=tenacity.stop_after_attempt(5),
        wait=tenacity.wait_exponential(min=2, max=10),
        after=_log_after_attempt,
    )
    async def execute_query_fetch_one(self, query, to_dict: bool = True) -> dict | Any | None:
        async with self.sessionmaker() as session:
            result = await session.execute(query)
            row = result.first()
            if row is None:
                return None
            if to_dict:
                return dict(row._mapping)
            return row

    @tenacity.retry(
        retry=tenacity.retry_if_exception_type((InterfaceError, OperationalError)),
        stop=tenacity.stop_after_attempt(5),
        wait=tenacity.wait_exponential(min=2, max=10),
        after=_log_after_attempt,
    )
    async def execute_scalar(self, query) -> Any | None:
        async with self.sessionmaker() as session:
            result = await session.execute(query)
            return result.scalar_one_or_none()

    @tenacity.retry(
        retry=tenacity.retry_if_exception_type((InterfaceError, OperationalError)),
        stop=tenacity.stop_after_attempt(5),
        wait=tenacity.wait_exponential(min=2, max=10),
        after=_log_after_attempt,
    )
    async def execute_query(self, query) -> None:
        async with self.sessionmaker() as session:
            await session.execute(query)
            await session.commit()

    async def close(self):
        if self._engine:
            await self._engine.dispose()
