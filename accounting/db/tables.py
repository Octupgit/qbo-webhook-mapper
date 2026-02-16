from datetime import datetime
import uuid

from accounting.common.constants import ColumnSize
from accounting.db.base_engine import Base
from sqlalchemy import Boolean, Column, DateTime, Integer, JSON, String
from accounting.config import settings


class AccountingIntegration(Base):
    __tablename__ = "integrations"
    __table_args__ = {"schema": settings.ACCOUNTING_SCHEMA_NAME}

    id = Column(String(ColumnSize.INTEGRATION_ID), primary_key=True, default=lambda: str(uuid.uuid4()))
    integration_name = Column(String(255), nullable=False)
    partner_id = Column(Integer, nullable=False, index=True)
    accounting_system = Column(String(ColumnSize.ACCOUNTING_SYSTEM), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    connection_details = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
