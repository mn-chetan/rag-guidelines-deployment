"""Configuration settings for the application.

All settings can be overridden via environment variables.
Example: PROJECT_ID can be set via PROJECT_ID=my-project environment variable.

For local development, create a .env file in the backend directory.
"""
from pydantic_settings import BaseSettings
from typing import List, Optional

class Settings(BaseSettings):
    # Environment
    ENVIRONMENT: str = "development"  # "development", "staging", "production"

    # GCP Project Settings
    PROJECT_ID: str = "rag-for-guidelines"
    LOCATION: str = "global"
    GENAI_LOCATION: str = "us-central1"
    DATA_STORE_ID: str = "guidelines-data-store_1763919919982"
    MODEL_ID: str = "gemini-2.5-flash-lite"
    GCS_BUCKET: str = "rag-guidelines-v2"
    GCS_SCRAPED_FOLDER: str = "scraped"

    # BigQuery Settings
    BIGQUERY_DATASET: str = "rag_analytics"
    BIGQUERY_TABLE: str = "feedback"

    # CORS Settings - Override with comma-separated list: CORS_ORIGINS="http://localhost:5500,https://example.com"
    CORS_ORIGINS: List[str] = [
        "http://localhost:5500",
        "https://storage.googleapis.com",
    ]

    # Rate Limiting - Override for production as needed
    RATE_LIMIT_QUERY: str = "10/minute"
    RATE_LIMIT_ADMIN: str = "5/minute"
    RATE_LIMIT_STATIC: str = "100/minute"

    # Request Limits
    MAX_QUERY_LENGTH: int = 10000
    MAX_IMAGE_SIZE_MB: int = 10

    # Token limits per mode
    TOKEN_LIMITS: dict = {
        "default": 1536,
        "shorter": 512,
        "more": 4096
    }

    # Admin API Key (MUST be set in production via ADMIN_API_KEY env var)
    ADMIN_API_KEY: Optional[str] = None

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    @property
    def max_image_size_bytes(self) -> int:
        return self.MAX_IMAGE_SIZE_MB * 1024 * 1024

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        # Allow environment variables to override .env file
        extra = "ignore"

settings = Settings()
