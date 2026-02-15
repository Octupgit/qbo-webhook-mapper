import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.mysql import CHAR

from .base_engine import Base


class AccountingIntegration(Base):
    __tablename__ = "accounting_integrations"

    integration_id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    partner_id = Column(Integer, nullable=False, index=True)
    accounting_system = Column(String(50), nullable=False)
    realm_id = Column(String(100), nullable=False)
    company_name = Column(String(255), nullable=False)
    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    status = Column(String(50), default="active", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
