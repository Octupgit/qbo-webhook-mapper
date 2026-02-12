
class AccountingDataStoreError(Exception):
    pass


class IntegrationNotFoundError(AccountingDataStoreError):
    def __init__(self, integration_id: str):
        super().__init__(f"Integration {integration_id} not found")


class EntityRefNotFoundError(AccountingDataStoreError):
    def __init__(self, ref_id: str):
        super().__init__(f"Entity reference {ref_id} not found")


class EntityMappingNotFoundError(AccountingDataStoreError):
    def __init__(self, mapping_id: str):
        super().__init__(f"Entity mapping {mapping_id} not found")


class DuplicateIntegrationError(AccountingDataStoreError):
    def __init__(self, partner_id: int):
        super().__init__(f"Active integration already exists for partner {partner_id}")