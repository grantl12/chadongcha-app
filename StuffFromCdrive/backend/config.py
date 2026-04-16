from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        protected_namespaces=(),   # suppresses model_ namespace warning
    )

    supabase_url: str
    supabase_service_key: str
    # Plain string — split on comma where needed (avoids pydantic-settings
    # trying to JSON-decode a list field from an env var string)
    allowed_origins: str = "http://localhost:8081"
    redis_url: str = "redis://localhost:6379"
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_models: str = "chadongcha-models"
    r2_bucket_assets: str = "chadongcha-assets"
    r2_public_url: str = ""
    app_env: str = "development"
    model_current_version: str = "0.0.1"

    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()  # type: ignore[call-arg]  # fields populated from env vars
