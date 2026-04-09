from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_key: str
    # Accepts a comma-separated string from Railway env vars
    # e.g. ALLOWED_ORIGINS="http://localhost:8081,https://your-app.com"
    allowed_origins: list[str] = ["http://localhost:8081"]
    redis_url: str = "redis://localhost:6379"
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_models: str = "chadongcha-models"
    r2_bucket_assets: str = "chadongcha-assets"
    r2_public_url: str = ""
    app_env: str = "development"
    model_current_version: str = "0.0.1"

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_origins(cls, v: object) -> list[str]:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return list(v)  # type: ignore[arg-type]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()  # type: ignore[call-arg]
