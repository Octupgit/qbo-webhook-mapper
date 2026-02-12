from accounting.exceptions.strategy_exceptions import UnsupportedAccountingSystemError
from accounting.models import AccountingSystem
from accounting.strategies.base import AccountingSystemStrategy
from accounting.strategies.quickbooks import QuickBooksAuthStrategy


class AccountingSystemFactory:
    _strategies: dict[AccountingSystem, type[AccountingSystemStrategy]] = {
        AccountingSystem.QUICKBOOKS: QuickBooksAuthStrategy,
    }

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
    def supported_systems(cls) -> list[str]:
        return [system.value for system in cls._strategies.keys()]
