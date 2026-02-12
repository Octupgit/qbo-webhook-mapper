from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, Boolean, Column, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from accounting.db.base import Base


def generate_uuid() -> str:
    return str(uuid4())


class Integration(Base):
    __tablename__ = "integrations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    partner_id = Column(Integer, nullable=False, index=True)
    accounting_system = Column(
        Enum("Quickbooks", "Xero", "Sage", name="accounting_system_enum"),
        nullable=False,
    )
    is_active = Column(Boolean, nullable=False, default=True)
    connection_details = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    entity_refs = relationship("IntegrationEntityRef", back_populates="integration", cascade="all, delete-orphan")
    entity_mappings = relationship(
        "IntegrationOctupEntityMapping", back_populates="integration", cascade="all, delete-orphan"
    )


class IntegrationEntityRef(Base):
    __tablename__ = "integration_entity_refs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    integration_id = Column(String(36), ForeignKey("accounting_integrations.integrations.id"), nullable=False)
    accounting_entity_type = Column(
        Enum("Customer", "Invoice", "Item", "Account", "Payment", name="accounting_entity_type_enum"),
        nullable=False,
    )
    accounting_entity_id = Column(String(255), nullable=False)
    display_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    integration = relationship("Integration", back_populates="entity_refs")


class IntegrationOctupEntityMapping(Base):
    __tablename__ = "integration_octup_entity_mappings"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    integration_id = Column(String(36), ForeignKey("accounting_integrations.integrations.id"), nullable=False)
    octup_entity_type = Column(
        Enum("Client", "Invoice", "Order", name="octup_entity_type_enum"),
        nullable=False,
    )
    octup_entity_id = Column(String(255), nullable=False)
    accounting_entity_type = Column(
        Enum("Customer", "Invoice", "Item", "Account", "Payment", name="accounting_entity_type_enum"),
        nullable=False,
    )
    accounting_entity_id = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    integration = relationship("Integration", back_populates="entity_mappings")
