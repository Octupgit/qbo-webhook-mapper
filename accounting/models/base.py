from abc import ABC, abstractmethod

from pydantic import BaseModel, ConfigDict


class DtoModel(BaseModel, ABC):
    """
    Base DTO model following Octup core pattern.
    DTOs handle conversion between database layer, business logic, and API layer.
    """

    @classmethod
    @abstractmethod
    def from_db_rows(cls, *args, **kwargs):
        """Create DTO from multiple database rows"""
        pass

    @classmethod
    @abstractmethod
    def from_db_row(cls, *args, **kwargs):
        """Create DTO from single database row"""
        pass

    @abstractmethod
    def to_db_rows(self, *args, **kwargs):
        """Convert DTO to database rows for insert/update"""
        pass

    @classmethod
    @abstractmethod
    def from_request(cls, *args, **kwargs):
        """Create DTO from request data (API/user input)"""
        pass

    @abstractmethod
    def to_response(self, *args, **kwargs):
        """Convert DTO to response format (for API output)"""
        pass

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
