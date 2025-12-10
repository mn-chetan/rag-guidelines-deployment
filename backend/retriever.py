"""
Main retriever interface.
Replaces Discovery Engine with custom hybrid RAG.
"""
import logging
import os
from typing import List, Dict, Optional

from embeddings import EmbeddingService
from vector_search import VectorSearchClient
from bm25_search import BM25Search
from chunk_store import ChunkStore
from chunker import GuidelineChunker
from hybrid_search import HybridSearchManager

logger = logging.getLogger(__name__)


class GuidelineRetriever:
    """Main retrieval interface for custom hybrid RAG."""
    
    def __init__(self):
        """Initialize all RAG components."""
        self.project_id = os.getenv("PROJECT_ID", "rag-for-guidelines")
        self.location = os.getenv("LOCATION", "us-central1")
        self.bucket_name = os.getenv("GCS_BUCKET", "rag-guidelines-v2")
        
        # Component instances
        self.embedding_service: Optional[EmbeddingService] = None
        self.vector_search: Optional[VectorSearchClient] = None
        self.bm25_search: Optional[BM25Search] = None
        self.chunk_store: Optional[ChunkStore] = None
        self.chunker: Optional[GuidelineChunker] = None
        self.hybrid_search: Optional[HybridSearchManager] = None
        
        self._initialized = False
        
        logger.info("GuidelineRetriever created (not yet initialized)")
    
    def initialize(self):
        """Initialize all components.
        
        Called once on startup. This can take a few seconds.
        """
        if self._initialized:
            logger.info("Retriever already initialized")
            return
        
        try:
            logger.info("Initializing GuidelineRetriever components...")
            
            # Initialize embedding service
            logger.info("Initializing embedding service...")
            self.embedding_service = EmbeddingService(
                project_id=self.project_id,
                location=self.location
            )
            
            # Initialize vector search
            logger.info("Initializing vector search...")
            vector_index_id = os.getenv("VECTOR_SEARCH_INDEX_ID")
            vector_endpoint_id = os.getenv("VECTOR_SEARCH_ENDPOINT_ID")
            vector_deployed_index_id = os.getenv(
                "VECTOR_SEARCH_DEPLOYED_INDEX_ID",
                "guidelines_deployed"
            )
            
            if not vector_index_id or not vector_endpoint_id:
                raise ValueError(
                    "VECTOR_SEARCH_INDEX_ID and VECTOR_SEARCH_ENDPOINT_ID "
                    "environment variables must be set"
                )
            
            self.vector_search = VectorSearchClient(
                project_id=self.project_id,
                location=self.location,
                index_id=vector_index_id,
                endpoint_id=vector_endpoint_id,
                deployed_index_id=vector_deployed_index_id
            )
            
            # Initialize chunk store
            logger.info("Initializing chunk store...")
            self.chunk_store = ChunkStore(bucket_name=self.bucket_name)
            self.chunk_store.load_chunks()  # Pre-load into memory
            
            # Initialize BM25
            logger.info("Initializing BM25 search...")
            self.bm25_search = BM25Search(bucket_name=self.bucket_name)
            
            # Initialize chunker
            logger.info("Initializing chunker...")
            self.chunker = GuidelineChunker(
                target_chunk_size=1000,
                max_chunk_size=1500,
                overlap=100
            )
            
            # Initialize hybrid search
            logger.info("Initializing hybrid search manager...")
            self.hybrid_search = HybridSearchManager(
                embedding_service=self.embedding_service,
                vector_search=self.vector_search,
                bm25_search=self.bm25_search,
                chunk_store=self.chunk_store,
                vector_weight=0.6,
                bm25_weight=0.4,
                rrf_k=60
            )
            
            self._initialized = True
            logger.info("✓ GuidelineRetriever initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize retriever: {e}", exc_info=True)
            raise
    
    def retrieve(self, query: str, top_k: int = 6) -> List[Dict]:
        """Retrieve relevant chunks for a query.
        
        Args:
            query: Search query
            top_k: Number of results to return
            
        Returns:
            List of {title, snippet, link, score} dicts
        """
        if not self._initialized:
            raise RuntimeError("Retriever not initialized. Call initialize() first.")
        
        try:
            return self.hybrid_search.search(query, top_k=top_k)
        except Exception as e:
            logger.error(f"Retrieval failed: {e}")
            return []
    
    def index_document(
        self, 
        content: str, 
        url: str, 
        title: str,
        content_type: str = "html"
    ) -> int:
        """Index a document.
        
        1. Chunk the document
        2. Generate embeddings
        3. Store in vector search
        4. Update BM25 index
        5. Store chunk metadata
        
        Args:
            content: Document content
            url: Source URL
            title: Document title
            content_type: Content type ('html', 'markdown', or 'text')
            
        Returns:
            Number of chunks created
        """
        if not self._initialized:
            raise RuntimeError("Retriever not initialized. Call initialize() first.")
        
        try:
            logger.info(f"Indexing document: {url}")
            
            # Step 1: Chunk the document
            if content_type == "html":
                chunks = self.chunker.chunk_html(content, url, title)
            elif content_type == "markdown":
                chunks = self.chunker.chunk_markdown(content, url, title)
            else:
                chunks = self.chunker.chunk_text(content, url, title)
            
            if not chunks:
                logger.warning(f"No chunks created for {url}")
                return 0
            
            logger.info(f"Created {len(chunks)} chunks")
            
            # Step 2: Generate embeddings
            logger.info("Generating embeddings...")
            texts = [chunk["text"] for chunk in chunks]
            embeddings = self.embedding_service.embed_texts(texts)
            
            # Add embeddings to chunks
            for chunk, embedding in zip(chunks, embeddings):
                chunk["embedding"] = embedding
            
            # Step 3: Store in vector search
            logger.info("Uploading to vector search...")
            vector_data = [
                {
                    "id": chunk["id"],
                    "embedding": chunk["embedding"],
                    "metadata": {}
                }
                for chunk in chunks
            ]
            self.vector_search.upsert_vectors(vector_data)
            
            # Step 4: Update BM25 index
            logger.info("Updating BM25 index...")
            self.bm25_search.add_documents(chunks)
            
            # Step 5: Store chunk metadata
            logger.info("Storing chunk metadata...")
            self.chunk_store.add_chunks(chunks)
            
            logger.info(f"✓ Indexed {len(chunks)} chunks for {url}")
            return len(chunks)
            
        except Exception as e:
            logger.error(f"Failed to index document {url}: {e}", exc_info=True)
            raise
    
    def delete_document(self, url: str) -> int:
        """Remove a document from all indexes.
        
        Args:
            url: Source URL to remove
            
        Returns:
            Number of chunks deleted
        """
        if not self._initialized:
            raise RuntimeError("Retriever not initialized. Call initialize() first.")
        
        try:
            logger.info(f"Deleting document: {url}")
            
            # Get chunks to delete
            all_chunks = self.chunk_store.get_all_chunks()
            chunks_to_delete = [
                chunk for chunk in all_chunks
                if chunk.get("source_url") == url
            ]
            
            if not chunks_to_delete:
                logger.info(f"No chunks found for {url}")
                return 0
            
            chunk_ids = [chunk["id"] for chunk in chunks_to_delete]
            
            # Delete from vector search
            logger.info(f"Deleting {len(chunk_ids)} vectors...")
            self.vector_search.delete_vectors(chunk_ids)
            
            # Delete from BM25
            logger.info("Updating BM25 index...")
            self.bm25_search.remove_documents(url)
            
            # Delete from chunk store
            logger.info("Deleting chunk metadata...")
            deleted_count = self.chunk_store.delete_chunks_by_source(url)
            
            logger.info(f"✓ Deleted {deleted_count} chunks for {url}")
            return deleted_count
            
        except Exception as e:
            logger.error(f"Failed to delete document {url}: {e}", exc_info=True)
            return 0
    
    def reindex_all(self, documents: List[Dict]) -> Dict:
        """Full reindex of all documents.
        
        Args:
            documents: List of {url, title, content, content_type} dicts
            
        Returns:
            Stats: {total_docs, total_chunks, errors}
        """
        if not self._initialized:
            raise RuntimeError("Retriever not initialized. Call initialize() first.")
        
        logger.info(f"Starting full reindex of {len(documents)} documents")
        
        total_chunks = 0
        errors = []
        
        for doc in documents:
            try:
                chunks = self.index_document(
                    content=doc["content"],
                    url=doc["url"],
                    title=doc.get("title", doc["url"]),
                    content_type=doc.get("content_type", "html")
                )
                total_chunks += chunks
                
            except Exception as e:
                logger.error(f"Failed to index {doc['url']}: {e}")
                errors.append({
                    "url": doc["url"],
                    "error": str(e)
                })
        
        stats = {
            "total_docs": len(documents),
            "total_chunks": total_chunks,
            "errors": errors,
            "success_count": len(documents) - len(errors)
        }
        
        logger.info(
            f"✓ Reindex complete: {stats['success_count']}/{len(documents)} "
            f"documents, {total_chunks} chunks"
        )
        
        return stats
    
    def get_stats(self) -> Dict:
        """Return index statistics.
        
        Returns:
            Dictionary with stats from all components
        """
        if not self._initialized:
            return {
                "initialized": False,
                "message": "Retriever not initialized"
            }
        
        try:
            return {
                "initialized": True,
                "chunk_store": self.chunk_store.get_stats(),
                "bm25": self.bm25_search.get_stats(),
                "vector_search": self.vector_search.get_stats(),
                "embedding_cache": self.embedding_service.get_cache_info()
            }
        except Exception as e:
            logger.error(f"Failed to get stats: {e}")
            return {
                "initialized": True,
                "error": str(e)
            }


# Global singleton instance
retriever = GuidelineRetriever()
