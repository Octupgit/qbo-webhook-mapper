from enum import Enum

from app.exceptions.strategy_exceptions import UnsupportedAccountingSystemError
from app.strategies.base import AccountingSystemStrategy


class AccountingSystem(str, Enum):
    """Supported accounting systems."""

    QUICKBOOKS = "quickbooks"
    XERO = "xero"
    SAGE = "sage"


class AccountingSystemFactory:
    """
    Factory for creating accounting system strategy instances.

    Usage:
        strategy = AccountingSystemFactory.get_strategy(AccountingSystem.QUICKBOOKS)
        result = await strategy.create_invoice(invoice, token, realm_id)
    """

    _strategies: dict[AccountingSystem, type[AccountingSystemStrategy]] = {}

    @classmethod
    def get_strategy(cls, accounting_system: AccountingSystem | str) -> AccountingSystemStrategy:
        """
        Get strategy instance for the specified accounting system.

        Args:
            accounting_system: Accounting system enum or string identifier

        Returns:
            AccountingSystemStrategy implementation instance

        Raises:
            UnsupportedAccountingSystemError: If system is not supported
        """
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
    ):
        """
        Register a new accounting system strategy.

        This allows extending the factory with new strategies at runtime.

        Args:
            accounting_system: Accounting system enum
            strategy_class: Strategy class to register
        """
        cls._strategies[accounting_system] = strategy_class

    @classmethod
    def supported_systems(cls) -> list[str]:
        """
        Get list of supported accounting system identifiers.

        Returns:
            List of system names (e.g., ['quickbooks', 'xero'])
        """
        return [system.value for system in cls._strategies.keys()]
