"""Feedback logging module with BigQuery integration."""
import os
import logging
import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from google.cloud import bigquery
from google.api_core import retry

logger = logging.getLogger(__name__)

# Configuration
PROJECT_ID = os.getenv("PROJECT_ID", "rag-for-guidelines")
BIGQUERY_DATASET = os.getenv("BIGQUERY_DATASET", "rag_analytics")
BIGQUERY_TABLE = os.getenv("BIGQUERY_TABLE", "feedback")


class FeedbackLogger:
    """Handles feedback logging to BigQuery with auto-initialization."""
    
    def __init__(self):
        self.client = bigquery.Client(project=PROJECT_ID)
        self.dataset_id = f"{PROJECT_ID}.{BIGQUERY_DATASET}"
        self.table_id = f"{self.dataset_id}.{BIGQUERY_TABLE}"
        self.initialized = False
        
    def initialize_bigquery(self):
        """
        Initialize BigQuery dataset and table if they don't exist.
        This is called automatically on first log_feedback() call.
        """
        if self.initialized:
            return
            
        try:
            # Create dataset if it doesn't exist
            dataset = bigquery.Dataset(self.dataset_id)
            dataset.location = "US"
            
            try:
                self.client.get_dataset(self.dataset_id)
                logger.info(f"BigQuery dataset {self.dataset_id} already exists")
            except Exception:
                dataset = self.client.create_dataset(dataset, exists_ok=True)
                logger.info(f"Created BigQuery dataset {self.dataset_id}")
            
            # Define table schema
            schema = [
                bigquery.SchemaField("id", "STRING", mode="REQUIRED"),
                bigquery.SchemaField("timestamp", "TIMESTAMP", mode="REQUIRED"),
                bigquery.SchemaField("session_id", "STRING", mode="REQUIRED"),
                bigquery.SchemaField("query", "STRING", mode="REQUIRED"),
                bigquery.SchemaField("response", "STRING", mode="REQUIRED"),
                bigquery.SchemaField("sources", "STRING", mode="REPEATED"),
                bigquery.SchemaField("rating", "STRING", mode="REQUIRED"),
                bigquery.SchemaField("model_version", "STRING", mode="NULLABLE"),
                bigquery.SchemaField("prompt_version", "INTEGER", mode="NULLABLE"),
            ]
            
            # Create table if it doesn't exist
            table = bigquery.Table(self.table_id, schema=schema)
            
            try:
                self.client.get_table(self.table_id)
                logger.info(f"BigQuery table {self.table_id} already exists")
            except Exception:
                table = self.client.create_table(table, exists_ok=True)
                logger.info(f"Created BigQuery table {self.table_id}")
            
            self.initialized = True
            
        except Exception as e:
            logger.error(f"Failed to initialize BigQuery: {e}")
            # Don't raise - we want the app to continue even if BigQuery setup fails
            
    @retry.Retry(predicate=retry.if_exception_type(Exception), deadline=10.0)
    async def log_feedback(
        self,
        query: str,
        response: str,
        rating: str,
        session_id: str,
        sources: list = None,
        model_version: str = None,
        prompt_version: int = None
    ) -> bool:
        """
        Log feedback to BigQuery asynchronously.
        
        Args:
            query: User's query text
            response: Generated response (truncated to 10KB if needed)
            rating: "positive" or "negative"
            session_id: Session identifier
            sources: List of source URLs
            model_version: Gemini model ID
            prompt_version: Prompt template version number
            
        Returns:
            True if successful, False otherwise
        """
        # Initialize on first call
        if not self.initialized:
            self.initialize_bigquery()
            
        if not self.initialized:
            logger.warning("BigQuery not initialized, skipping feedback logging")
            return False
            
        try:
            # Truncate response to 10KB to avoid BigQuery row size limits
            max_response_size = 10 * 1024  # 10KB
            if len(response) > max_response_size:
                response = response[:max_response_size] + "... [truncated]"
            
            # Prepare row
            row = {
                "id": str(uuid.uuid4()),
                "timestamp": datetime.utcnow().isoformat(),
                "session_id": session_id,
                "query": query,
                "response": response,
                "sources": sources or [],
                "rating": rating,
                "model_version": model_version,
                "prompt_version": prompt_version,
            }
            
            # Insert row
            errors = self.client.insert_rows_json(self.table_id, [row])
            
            if errors:
                logger.error(f"BigQuery insert errors: {errors}")
                return False
            
            logger.info(f"Logged feedback to BigQuery: {rating} for session {session_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to log feedback to BigQuery: {e}")
            return False


# Global instance
_feedback_logger = None

def get_feedback_logger() -> FeedbackLogger:
    """Get or create the global FeedbackLogger instance."""
    global _feedback_logger
    if _feedback_logger is None:
        _feedback_logger = FeedbackLogger()
    return _feedback_logger
