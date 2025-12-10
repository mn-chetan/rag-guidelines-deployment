"""
Cloud Storage based chunk metadata store.
Stores chunk text and metadata in GCS for retrieval after vector search.
"""
import logging
import json
from typing import List, Dict, Optional
from google.cloud import storage
from datetime import datetime

logger = logging.getLogger(__name__)


class ChunkStore:
    """GCS-backed storage for document chunks with in-memory caching."""
    
    def __init__(self, bucket_name: str, chunks_path: str = "chunks/chunks.json"):
        """Initialize GCS chunk store.
        
        Args:
            bucket_name: GCS bucket name
            chunks_path: Path within bucket for chunks JSON file
        """
        self.bucket_name = bucket_name
        self.chunks_path = chunks_path
        self.client = storage.Client()
        self.bucket = self.client.bucket(bucket_name)
        
        # In-memory cache: {chunk_id: chunk_dict}
        self._chunks_cache: Optional[Dict[str, Dict]] = None
        self._cache_loaded = False
        
        logger.info(f"Initialized ChunkStore: gs://{bucket_name}/{chunks_path}")
    
    def load_chunks(self, force_reload: bool = False) -> Dict[str, Dict]:
        """Load all chunks from GCS into memory.
        
        Args:
            force_reload: Force reload even if cache exists
            
        Returns:
            Dictionary mapping chunk_id to chunk data
        """
        if self._chunks_cache is not None and not force_reload:
            logger.debug("Using cached chunks")
            return self._chunks_cache
        
        try:
            blob = self.bucket.blob(self.chunks_path)
            
            if not blob.exists():
                logger.warning(f"Chunks file does not exist: {self.chunks_path}")
                self._chunks_cache = {}
                self._cache_loaded = True
                return self._chunks_cache
            
            # Download and parse JSON
            content = blob.download_as_text()
            chunks_list = json.loads(content)
            
            # Convert list to dict for fast lookup
            self._chunks_cache = {
                chunk["id"]: chunk
                for chunk in chunks_list
            }
            
            self._cache_loaded = True
            logger.info(f"Loaded {len(self._chunks_cache)} chunks from GCS")
            return self._chunks_cache
            
        except Exception as e:
            logger.error(f"Failed to load chunks from GCS: {e}")
            self._chunks_cache = {}
            self._cache_loaded = True
            return self._chunks_cache
    
    def get_chunk(self, chunk_id: str) -> Optional[Dict]:
        """Get a specific chunk by ID.
        
        Args:
            chunk_id: Unique chunk identifier
            
        Returns:
            Chunk dictionary or None if not found
        """
        if not self._cache_loaded:
            self.load_chunks()
        
        return self._chunks_cache.get(chunk_id)
    
    def get_chunks_by_ids(self, chunk_ids: List[str]) -> List[Dict]:
        """Get multiple chunks by IDs (for search results).
        
        Args:
            chunk_ids: List of chunk IDs
            
        Returns:
            List of chunk dictionaries (preserves order, skips missing)
        """
        if not self._cache_loaded:
            self.load_chunks()
        
        chunks = []
        for chunk_id in chunk_ids:
            chunk = self._chunks_cache.get(chunk_id)
            if chunk:
                chunks.append(chunk)
            else:
                logger.warning(f"Chunk not found: {chunk_id}")
        
        return chunks
    
    def save_chunks(self, chunks: List[Dict]) -> bool:
        """Save chunks to GCS (full replacement).
        
        Args:
            chunks: List of chunk dictionaries
            
        Returns:
            True if successful
        """
        try:
            # Convert to JSON
            content = json.dumps(chunks, indent=2, ensure_ascii=False)
            
            # Upload to GCS
            blob = self.bucket.blob(self.chunks_path)
            blob.metadata = {
                "updated_at": datetime.utcnow().isoformat(),
                "chunk_count": str(len(chunks))
            }
            blob.upload_from_string(content, content_type="application/json")
            
            # Update cache
            self._chunks_cache = {chunk["id"]: chunk for chunk in chunks}
            self._cache_loaded = True
            
            logger.info(f"Saved {len(chunks)} chunks to GCS")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save chunks to GCS: {e}")
            return False
    
    def add_chunks(self, new_chunks: List[Dict]) -> bool:
        """Add new chunks (merge with existing).
        
        Args:
            new_chunks: List of new chunk dictionaries
            
        Returns:
            True if successful
        """
        try:
            # Load existing chunks
            existing = self.load_chunks()
            
            # Merge (new chunks overwrite existing with same ID)
            for chunk in new_chunks:
                existing[chunk["id"]] = chunk
            
            # Save back
            chunks_list = list(existing.values())
            return self.save_chunks(chunks_list)
            
        except Exception as e:
            logger.error(f"Failed to add chunks: {e}")
            return False
    
    def delete_chunks_by_source(self, source_url: str) -> int:
        """Delete all chunks from a specific source URL.
        
        Args:
            source_url: URL of the source document
            
        Returns:
            Number of chunks deleted
        """
        try:
            # Load existing chunks
            existing = self.load_chunks()
            
            # Filter out chunks from this source
            before_count = len(existing)
            filtered = {
                chunk_id: chunk
                for chunk_id, chunk in existing.items()
                if chunk.get("source_url") != source_url
            }
            after_count = len(filtered)
            deleted_count = before_count - after_count
            
            if deleted_count > 0:
                # Save filtered chunks
                chunks_list = list(filtered.values())
                self.save_chunks(chunks_list)
                logger.info(f"Deleted {deleted_count} chunks from {source_url}")
            else:
                logger.info(f"No chunks found for {source_url}")
            
            return deleted_count
            
        except Exception as e:
            logger.error(f"Failed to delete chunks: {e}")
            return 0
    
    def refresh_cache(self):
        """Reload chunks from GCS into memory."""
        self.load_chunks(force_reload=True)
    
    def get_stats(self) -> Dict:
        """Get statistics about the chunk store.
        
        Returns:
            Dictionary with stats
        """
        if not self._cache_loaded:
            self.load_chunks()
        
        # Count chunks by source
        sources = {}
        for chunk in self._chunks_cache.values():
            source = chunk.get("source_url", "unknown")
            sources[source] = sources.get(source, 0) + 1
        
        return {
            "total_chunks": len(self._chunks_cache),
            "unique_sources": len(sources),
            "sources": sources,
            "cache_loaded": self._cache_loaded
        }
    
    def get_all_chunks(self) -> List[Dict]:
        """Get all chunks as a list.
        
        Returns:
            List of all chunk dictionaries
        """
        if not self._cache_loaded:
            self.load_chunks()
        
        return list(self._chunks_cache.values())
