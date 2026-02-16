from __future__ import annotations

import asyncio
import logging
from typing import Any

import tenacity
from sqlalchemy import MetaData, update
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.engine import CursorResult
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from accounting.common.logging.json_logger import setup_logger
from accounting.db.utils import create_accounting_data_store_url

engines: dict[str, AsyncEngine] = {}


class RetrySettings:
    stop: tenacity.stop.stop_base = tenacity.stop_after_attempt(5)
    wait: tenacity.wait.wait_base = tenacity.wait_exponential(min=2, max=10)


def _log_after_attempt(log: logging.Logger = setup_logger()):
    def _after_attempt(retry_state: tenacity.RetryCallState):
        outcome = retry_state.outcome
        error = outcome.exception() if outcome else None
        log.warning(
            "Temporary data store error (attempt %d): %s",
            retry_state.attempt_number,
            error,
        )
        return _after_attempt
    return _after_attempt


class BaseSQLEngine:
    retry_settings = RetrySettings()
    _log = setup_logger()

    def __init__(self):
        resolved_url = create_accounting_data_store_url()
        self._engine = engines.get(resolved_url)
        self._sessionmaker = None
        self.url = resolved_url
        self.metadata = MetaData()

    @property
    def engine(self):
        try:
            if self._engine is None:
                self._engine = create_async_engine(
                    self.url,
                    poolclass=NullPool,
                    echo=False,
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
            self._sessionmaker = async_sessionmaker(self.engine, expire_on_commit=False, class_=AsyncSession)
        return self._sessionmaker

    @staticmethod
    def _model_to_dict(model) -> dict[str, Any]:
        return {column.name: getattr(model, attr) for attr, column in model.__mapper__.c.items()}

    def _retry(self) -> tenacity.AsyncRetrying:
        return tenacity.AsyncRetrying(
            stop=self.retry_settings.stop,
            wait=self.retry_settings.wait,
            retry=tenacity.retry_if_exception_type((InterfaceError, OSError, OperationalError)),
            after=_log_after_attempt(self._log),
            sleep=asyncio.sleep,
            reraise=True,
        )

    async def execute_query(self, query, params=None) -> Any | None:
        async for attempt in self._retry():
            with attempt:
                async with self.sessionmaker() as session:
                    async with session.begin():
                        return await session.execute(query, params)

    async def execute_query_fetch_all(self, query, params=None, to_dict: bool = True) -> list[dict] | list[Any]:
        res = await self.execute_query(query, params)
        if res is None:
            raise Exception(f"Could not fetch result for query: {query}")
        rows = list(res.fetchall())
        if to_dict:
            return [item._asdict() for item in rows]
        return rows

    async def execute_query_fetch_one(self, query, params=None, to_dict: bool = True) -> dict | Any | None:
        res = await self.execute_query(query, params)
        if not res:
            return None
        one = res.fetchone()
        if not one:
            return None
        return one._asdict() if to_dict else one

    async def execute_query_scalar_one(self, query, params=None):
        res = await self.execute_query(query, params)
        if res:
            return res.scalar_one()

    async def execute_query_scalar(self, query, params=None):
        res = await self.execute_query(query, params)
        if res:
            return res.scalar()

    async def execute_scalar(self, query, params=None) -> Any | None:
        res = await self.execute_query(query, params)
        if res:
            return res.scalar_one_or_none()

    @staticmethod
    def generate_upsert_query(table, excluded_columns: set[str] | None = None):
        query = insert(table)
        update_dict = {x.name: x for x in query.inserted if not excluded_columns or x.name not in excluded_columns}
        upsert_query = query.on_duplicate_key_update(update_dict)
        return upsert_query

    @staticmethod
    def generate_insert_query(table):
        query = insert(table)
        return query

    @staticmethod
    def add_missing_fields_to_row(row, query, exclude_columns: set[str] | None = None):
        return {x.name: row.get(x.name) for x in query.inserted if not exclude_columns or x.name not in exclude_columns}

    @staticmethod
    def prepare_upsert_query_and_rows(
        rows: list[dict[str, Any]] | Any,
        table,
        excluded_columns: set[str] | None = None,
        is_upsert: bool = True,
    ):
        if not isinstance(rows, list):
            rows = [rows]
        if is_upsert:
            query = BaseSQLEngine.generate_upsert_query(table, excluded_columns)
        else:
            query = BaseSQLEngine.generate_insert_query(table)
        rows = [BaseSQLEngine.add_missing_fields_to_row(obj, query, excluded_columns) for obj in rows]
        return query, rows

    async def execute_session_query(self, query, params=None) -> Any | None:
        async for attempt in self._retry():
            with attempt:
                async with self.sessionmaker() as session:
                    async with session.begin():
                        return await session.execute(query, params)

    async def upsert_lines(
        self,
        rows: list[dict[str, Any]] | Any,
        table,
        excluded_columns: set[str] | None = None,
    ) -> CursorResult | None:
        query, rows = BaseSQLEngine.prepare_upsert_query_and_rows(rows, table, excluded_columns)
        if not rows:
            self._log.warning(f"No rows to upsert on table: {table}")
            return None
        return await self.execute_session_query(query, rows)

    async def update_row_by_id(self, row_id: str, table, id_column_name: str, update_fields: dict) -> Any | None:
        id_column = getattr(table, id_column_name)
        query = update(table).where(id_column == row_id).values(**update_fields)
        return await self.execute_query(query)

    async def close(self):
        if self._engine:
            await self._engine.dispose()
