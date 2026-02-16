import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, Integer, JSON, MetaData, String, func
from sqlalchemy.orm import Mapped, declarative_base, mapped_column

from accounting.common.constants import ColumnSize


Base = declarative_base(metadata=MetaData(schema="accounting_integrations"))
Base.type_annotation_map = {dict[str, any]: JSON, UUID: String(36)}
Base.to_dict = lambda self: {column.name: getattr(self, column.name) for column in self.__table__.columns}


class AccountingIntegrationDBModel(Base):
    __tablename__ = "integrations"

    id: Mapped[UUID] = mapped_column(String(ColumnSize.INTEGRATION_ID), primary_key=True, default=lambda: str(uuid.uuid4()))
    integration_name: Mapped[str] = mapped_column(String(255), nullable=False)
    partner_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    accounting_system: Mapped[str] = mapped_column(String(ColumnSize.ACCOUNTING_SYSTEM), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    connection_details: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
