from abc import ABC, abstractmethod

from pydantic import BaseModel, ConfigDict


class DtoModel(BaseModel, ABC):
    @abstractmethod
    def from_db_rows(cls, *args, **kwargs):
        pass

    @abstractmethod
    def from_db_row(cls, *args, **kwargs):
        pass

    @abstractmethod
    def to_db_rows(self, *args, **kwargs):
        pass

    @classmethod
    @abstractmethod
    def from_request(cls, *args, **kwargs):
        pass

    @abstractmethod
    def to_response(self, *args, **kwargs):
        pass
