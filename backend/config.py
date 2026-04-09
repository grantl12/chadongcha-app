from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_key: str
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

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @property
    def allowed_origins(self) -> list[str]:  # type: ignore[override]
        raw = self.__dict__.get("allowed_origins", "http://localhost:8081")
        if isinstance(raw, list):
            return raw
        return [o.strip() for o in raw.split(",")]


settings = Settings()  # type: ignore[call-arg]
