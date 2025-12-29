"""Configuration settings for the application."""
from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
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
    
    # CORS Settings
    CORS_ORIGINS: List[str] = [
        "http://localhost:5500",
        "https://storage.googleapis.com",
    ]
    
    # Token limits per mode
    TOKEN_LIMITS: dict = {
        "default": 1536,
        "shorter": 512,
        "more": 4096
    }

    class Config:
        env_file = ".env"

settings = Settings()
