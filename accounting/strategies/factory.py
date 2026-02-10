from enum import Enum

from accounting.exceptions.strategy_exceptions import UnsupportedAccountingSystemError
from accounting.strategies.base import AccountingSystemStrategy


class AccountingSystem(str, Enum):
    """Supported accounting systems."""

    QUICKBOOKS = "quickbooks"
    XERO = "xero"
    SAGE = "sage"


class AccountingSystemFactory:

    _strategies: dict[AccountingSystem, type[AccountingSystemStrategy]] = {}

    @classmethod
    def get_strategy(cls, accounting_system: AccountingSystem | str) -> AccountingSystemStrategy:
        if isinstance(accounting_system, str):
            try:
                accounting_system = AccountingSystem(accounting_system.lower())
            except ValueError as e:
                raise UnsupportedAccountingSystemError(
                    f"Accounting system '{accounting_system}' is not supported"
                ) from e

        strategy_class = cls._strategies.get(accounting_system)

        if strategy_class is None:
            raise UnsupportedAccountingSystemError(
                f"Accounting system '{accounting_system.value}' is not yet implemented"
            )

        return strategy_class()

    @classmethod
    def register_strategy(
        cls, accounting_system: AccountingSystem, strategy_class: type[AccountingSystemStrategy]
    ) -> None:
        cls._strategies[accounting_system] = strategy_class

    @classmethod
    def supported_systems(cls) -> list[str]:
        return [system.value for system in cls._strategies.keys()]
