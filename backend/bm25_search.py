"""
BM25 keyword search with GCS persistence.
Index is loaded into memory on startup and persisted to GCS on updates.
"""
import logging
import json
import pickle
import base64
from typing import List, Dict, Optional
from google.cloud import storage
from rank_bm25 import BM25Okapi

logger = logging.getLogger(__name__)


class BM25Search:
    """BM25 keyword search with GCS backing."""
    
    def __init__(
        self, 
        bucket_name: str, 
        index_path: str = "indexes/bm25_index.json"
    ):
        """Initialize BM25 search with GCS backing.
        
        Args:
            bucket_name: GCS bucket name
            index_path: Path within bucket for BM25 index
        """
        self.bucket_name = bucket_name
        self.index_path = index_path
        self.client = storage.Client()
        self.bucket = self.client.bucket(bucket_name)
        
        # BM25 index and metadata
        self.bm25: Optional[BM25Okapi] = None
        self.documents: List[str] = []  # List of chunk texts
        self.chunk_ids: List[str] = []  # Corresponding chunk IDs
        self.metadatas: List[Dict] = []  # Corresponding metadata
        
        self._load_index()
        
        logger.info(f"Initialized BM25Search: gs://{bucket_name}/{index_path}")
    
    def _tokenize(self, text: str) -> List[str]:
        """Simple tokenization: lowercase + split on whitespace.
        
        Args:
            text: Text to tokenize
            
        Returns:
            List of tokens
        """
        # Simple whitespace tokenization with lowercase
        # Could be enhanced with stemming, stopword removal, etc.
        return text.lower().split()
    
    def _load_index(self):
        """Load BM25 index from GCS."""
        try:
            blob = self.bucket.blob(self.index_path)
            
            if not blob.exists():
                logger.warning(f"BM25 index does not exist: {self.index_path}")
                logger.info("Starting with empty BM25 index")
                return
            
            # Download and parse JSON
            content = blob.download_as_text()
            data = json.loads(content)
            
            # Restore index components
            self.documents = data.get("documents", [])
            self.chunk_ids = data.get("chunk_ids", [])
            self.metadatas = data.get("metadatas", [])
            
            # Rebuild BM25 index from documents
            if self.documents:
                tokenized_docs = [self._tokenize(doc) for doc in self.documents]
                self.bm25 = BM25Okapi(tokenized_docs)
                logger.info(f"Loaded BM25 index with {len(self.documents)} documents")
            else:
                logger.info("BM25 index is empty")
            
        except Exception as e:
            logger.error(f"Failed to load BM25 index: {e}")
            logger.info("Starting with empty BM25 index")
    
    def _save_index(self):
        """Save BM25 index to GCS."""
        try:
            # Serialize index data
            data = {
                "documents": self.documents,
                "chunk_ids": self.chunk_ids,
                "metadatas": self.metadatas,
                "document_count": len(self.documents)
            }
            
            content = json.dumps(data, ensure_ascii=False)
            
            # Upload to GCS
            blob = self.bucket.blob(self.index_path)
            blob.upload_from_string(content, content_type="application/json")
            
            logger.info(f"Saved BM25 index with {len(self.documents)} documents")
            
        except Exception as e:
            logger.error(f"Failed to save BM25 index: {e}")
    
    def build_index(self, chunks: List[Dict]):
        """Build BM25 index from chunks.
        
        Args:
            chunks: List of chunk dictionaries with 'id', 'text', etc.
        """
        try:
            self.documents = []
            self.chunk_ids = []
            self.metadatas = []
            
            for chunk in chunks:
                self.documents.append(chunk["text"])
                self.chunk_ids.append(chunk["id"])
                self.metadatas.append({
                    "source_url": chunk.get("source_url", ""),
                    "doc_title": chunk.get("doc_title", ""),
                    "section": chunk.get("section", "")
                })
            
            # Build BM25 index
            if self.documents:
                tokenized_docs = [self._tokenize(doc) for doc in self.documents]
                self.bm25 = BM25Okapi(tokenized_docs)
                logger.info(f"Built BM25 index with {len(self.documents)} documents")
            else:
                self.bm25 = None
                logger.warning("No documents to index")
            
            # Save to GCS
            self._save_index()
            
        except Exception as e:
            logger.error(f"Failed to build BM25 index: {e}")
    
    def search(self, query: str, top_k: int = 10) -> List[Dict]:
        """Search using BM25.
        
        Args:
            query: Search query
            top_k: Number of results to return
            
        Returns:
            List of {chunk_id, score, text, metadata} dicts
        """
        if not self.bm25 or not self.documents:
            logger.warning("BM25 index is empty")
            return []
        
        try:
            # Tokenize query
            tokenized_query = self._tokenize(query)
            
            # Get BM25 scores
            scores = self.bm25.get_scores(tokenized_query)
            
            # Get top k indices
            top_indices = sorted(
                range(len(scores)), 
                key=lambda i: scores[i], 
                reverse=True
            )[:top_k]
            
            # Build results
            results = []
            for idx in top_indices:
                if scores[idx] > 0:  # Only include non-zero scores
                    results.append({
                        "chunk_id": self.chunk_ids[idx],
                        "score": float(scores[idx]),
                        "text": self.documents[idx],
                        "metadata": self.metadatas[idx]
                    })
            
            logger.info(f"BM25 search returned {len(results)} results for query: {query}")
            return results
            
        except Exception as e:
            logger.error(f"BM25 search failed: {e}")
            return []
    
    def add_documents(self, chunks: List[Dict]):
        """Add documents and rebuild index.
        
        Args:
            chunks: List of new chunk dictionaries
        """
        try:
            # Add to existing documents
            for chunk in chunks:
                self.documents.append(chunk["text"])
                self.chunk_ids.append(chunk["id"])
                self.metadatas.append({
                    "source_url": chunk.get("source_url", ""),
                    "doc_title": chunk.get("doc_title", ""),
                    "section": chunk.get("section", "")
                })
            
            # Rebuild index
            if self.documents:
                tokenized_docs = [self._tokenize(doc) for doc in self.documents]
                self.bm25 = BM25Okapi(tokenized_docs)
                logger.info(f"Rebuilt BM25 index with {len(self.documents)} documents")
            
            # Save to GCS
            self._save_index()
            
        except Exception as e:
            logger.error(f"Failed to add documents to BM25 index: {e}")
    
    def remove_documents(self, source_url: str):
        """Remove documents by source URL and rebuild.
        
        Args:
            source_url: URL of source to remove
        """
        try:
            # Filter out documents from this source
            before_count = len(self.documents)
            
            filtered_docs = []
            filtered_ids = []
            filtered_meta = []
            
            for i in range(len(self.documents)):
                if self.metadatas[i].get("source_url") != source_url:
                    filtered_docs.append(self.documents[i])
                    filtered_ids.append(self.chunk_ids[i])
                    filtered_meta.append(self.metadatas[i])
            
            self.documents = filtered_docs
            self.chunk_ids = filtered_ids
            self.metadatas = filtered_meta
            
            after_count = len(self.documents)
            removed_count = before_count - after_count
            
            # Rebuild index
            if self.documents:
                tokenized_docs = [self._tokenize(doc) for doc in self.documents]
                self.bm25 = BM25Okapi(tokenized_docs)
            else:
                self.bm25 = None
            
            # Save to GCS
            self._save_index()
            
            logger.info(f"Removed {removed_count} documents from {source_url}")
            
        except Exception as e:
            logger.error(f"Failed to remove documents: {e}")
    
    def get_stats(self) -> Dict:
        """Get index statistics.
        
        Returns:
            Dictionary with stats
        """
        # Count documents by source
        sources = {}
        for meta in self.metadatas:
            source = meta.get("source_url", "unknown")
            sources[source] = sources.get(source, 0) + 1
        
        return {
            "total_documents": len(self.documents),
            "unique_sources": len(sources),
            "sources": sources,
            "index_loaded": self.bm25 is not None
        }
