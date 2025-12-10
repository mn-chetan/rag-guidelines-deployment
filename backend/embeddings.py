"""
Vertex AI Text Embeddings wrapper.
Uses text-embedding-004 model for high-quality embeddings.
"""
import logging
import time
from typing import List, Optional
from functools import lru_cache
import hashlib
from google.cloud import aiplatform
import vertexai
from vertexai.language_models import TextEmbeddingModel, TextEmbeddingInput

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Wrapper for Vertex AI text embeddings with caching and batching."""
    
    def __init__(self, project_id: str, location: str = "us-central1"):
        """Initialize Vertex AI embeddings.
        
        Args:
            project_id: GCP project ID
            location: GCP region for Vertex AI
        """
        self.project_id = project_id
        self.location = location
        self.model_name = "text-embedding-004"
        self.model: Optional[TextEmbeddingModel] = None
        self.embedding_dim = 768  # Dimension for text-embedding-004
        
        # Rate limiting
        self.last_request_time = 0
        self.min_request_interval = 0.1  # 100ms between requests
        
        self._initialize()
    
    def _initialize(self):
        """Initialize the embedding model."""
        try:
            vertexai.init(project=self.project_id, location=self.location)
            self.model = TextEmbeddingModel.from_pretrained(self.model_name)
            logger.info(f"Initialized {self.model_name} in {self.location}")
        except Exception as e:
            logger.error(f"Failed to initialize embedding model: {e}")
            raise
    
    def _rate_limit(self):
        """Simple rate limiting to avoid hitting API quotas."""
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        
        if time_since_last < self.min_request_interval:
            sleep_time = self.min_request_interval - time_since_last
            time.sleep(sleep_time)
        
        self.last_request_time = time.time()
    
    @lru_cache(maxsize=1000)
    def _cached_embed(self, text_hash: str, text: str) -> tuple:
        """Cache embeddings by text hash to avoid redundant API calls.
        
        Args:
            text_hash: Hash of the text (for cache key)
            text: The actual text to embed
            
        Returns:
            Tuple of embedding values
        """
        try:
            self._rate_limit()
            
            # Create embedding input with task type for better quality
            embedding_input = TextEmbeddingInput(
                text=text,
                task_type="RETRIEVAL_DOCUMENT"
            )
            
            embeddings = self.model.get_embeddings([embedding_input])
            
            if not embeddings or len(embeddings) == 0:
                raise ValueError("No embeddings returned from API")
            
            # Return as tuple for caching (lists aren't hashable)
            return tuple(embeddings[0].values)
            
        except Exception as e:
            logger.error(f"Failed to generate embedding: {e}")
            raise
    
    def embed_texts(self, texts: List[str], batch_size: int = 5) -> List[List[float]]:
        """Generate embeddings for a list of texts.
        
        Batches requests for efficiency and uses caching.
        
        Args:
            texts: List of text strings to embed
            batch_size: Number of texts per API call (max 5 for text-embedding-004)
            
        Returns:
            List of 768-dimensional embedding vectors
        """
        if not texts:
            return []
        
        embeddings = []
        
        # Process in batches
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            batch_embeddings = []
            
            for text in batch:
                try:
                    # Truncate text if too long (max 20k tokens ≈ 80k chars)
                    truncated_text = text[:80000] if len(text) > 80000 else text
                    
                    # Use hash for caching
                    text_hash = hashlib.md5(truncated_text.encode()).hexdigest()
                    embedding_tuple = self._cached_embed(text_hash, truncated_text)
                    batch_embeddings.append(list(embedding_tuple))
                    
                except Exception as e:
                    logger.error(f"Failed to embed text (length={len(text)}): {e}")
                    # Return zero vector as fallback
                    batch_embeddings.append([0.0] * self.embedding_dim)
            
            embeddings.extend(batch_embeddings)
            
            # Log progress for large batches
            if len(texts) > 10 and (i + batch_size) % 20 == 0:
                logger.info(f"Embedded {i + batch_size}/{len(texts)} texts")
        
        logger.info(f"Generated {len(embeddings)} embeddings")
        return embeddings
    
    def embed_query(self, query: str) -> List[float]:
        """Generate embedding for a single query.
        
        Args:
            query: Search query text
            
        Returns:
            768-dimensional embedding vector
        """
        try:
            self._rate_limit()
            
            # Use RETRIEVAL_QUERY task type for queries
            embedding_input = TextEmbeddingInput(
                text=query,
                task_type="RETRIEVAL_QUERY"
            )
            
            embeddings = self.model.get_embeddings([embedding_input])
            
            if not embeddings or len(embeddings) == 0:
                raise ValueError("No embeddings returned from API")
            
            return embeddings[0].values
            
        except Exception as e:
            logger.error(f"Failed to embed query '{query}': {e}")
            # Return zero vector as fallback
            return [0.0] * self.embedding_dim
    
    def clear_cache(self):
        """Clear the embedding cache."""
        self._cached_embed.cache_clear()
        logger.info("Embedding cache cleared")
    
    def get_cache_info(self) -> dict:
        """Get cache statistics.
        
        Returns:
            Dict with cache hits, misses, size, and maxsize
        """
        info = self._cached_embed.cache_info()
        return {
            "hits": info.hits,
            "misses": info.misses,
            "size": info.currsize,
            "maxsize": info.maxsize
        }
