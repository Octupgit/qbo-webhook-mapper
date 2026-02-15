import httpx
from typing import Dict, Tuple

from accounting.strategies.base_strategy import BaseAccountingStrategy
from accounting.config import settings
from accounting.common.logging.json_logger import setup_logger

class QuickBooksAuthStrategy(BaseAccountingStrategy):
    def __init__(self):
        self.client_id = settings.QBO_CLIENT_ID
        self.client_secret = settings.QBO_CLIENT_SECRET
        self.redirect_uri = settings.QBO_REDIRECT_URI
        self.environment = settings.QBO_ENVIRONMENT
        self._log = setup_logger()

        if self.environment == "production":
            self.api_base_url = "https://quickbooks.api.intuit.com"
        else:
            self.api_base_url = "https://sandbox-quickbooks.api.intuit.com"

    def get_authorization_url(self, state: str) -> str:
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": "com.intuit.quickbooks.accounting",
            "state": state
        }
        query_string = "&".join([f"{k}={v}" for k, v in params.items()])
        return f"https://appcenter.intuit.com/connect/oauth2?{query_string}"

    async def exchange_code_for_tokens(
        self, code: str, realm_id: str | None = None
    ) -> Tuple[str, str]:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
                    headers={"Accept": "application/json"},
                    data={
                        "grant_type": "authorization_code",
                        "code": code,
                        "redirect_uri": self.redirect_uri
                    },
                    auth=(self.client_id, self.client_secret),
                    timeout=10.0
                )
                response.raise_for_status()
                data = response.json()
                return data["access_token"], data["refresh_token"]
        except Exception as e:
            self._log.error(f"Token exchange failed: {str(e)}")
            raise

    async def fetch_company_info(
        self, access_token: str, realm_id: str | None = None
    ) -> str:
        try:
            url = f"{self.api_base_url}/v3/company/{realm_id}/companyinfo/{realm_id}"
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "application/json"
                    },
                    params={"minorversion": "65"},
                    timeout=10.0
                )
                response.raise_for_status()
                data = response.json()
                return data["CompanyInfo"]["CompanyName"]
        except Exception as e:
            self._log.warning(f"CompanyInfo fetch failed: {str(e)}, using fallback")
            return "QuickBooks Account"

    async def fetch_initial_data(
        self, access_token: str, realm_id: str | None = None
    ) -> Dict:
        try:
            url = f"{self.api_base_url}/v3/company/{realm_id}/query"
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "application/json"
                    },
                    params={
                        "query": "SELECT * FROM Customer MAXRESULTS 100",
                        "minorversion": "65"
                    },
                    timeout=15.0
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            self._log.error(f"Customer fetch failed: {str(e)}")
            return {"QueryResponse": {}}

    async def refresh_access_token(self, refresh_token: str) -> Tuple[str, str]:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
                    headers={"Accept": "application/json"},
                    data={
                        "grant_type": "refresh_token",
                        "refresh_token": refresh_token
                    },
                    auth=(self.client_id, self.client_secret),
                    timeout=10.0
                )
                response.raise_for_status()
                data = response.json()
                return data["access_token"], data["refresh_token"]
        except Exception as e:
            self._log.error(f"Token refresh failed: {str(e)}")
            raise
