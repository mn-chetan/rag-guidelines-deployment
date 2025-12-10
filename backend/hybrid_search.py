"""
Hybrid search combining Vertex AI Vector Search and BM25.
Uses Reciprocal Rank Fusion (RRF) to merge results.
"""
import logging
from typing import List, Dict, Optional
from embeddings import EmbeddingService
from vector_search import VectorSearchClient
from bm25_search import BM25Search
from chunk_store import ChunkStore

logger = logging.getLogger(__name__)


class HybridSearchManager:
    """Hybrid search orchestrator using vector search + BM25 with RRF."""
    
    def __init__(
        self,
        embedding_service: EmbeddingService,
        vector_search: VectorSearchClient,
        bm25_search: BM25Search,
        chunk_store: ChunkStore,
        vector_weight: float = 0.6,
        bm25_weight: float = 0.4,
        rrf_k: int = 60
    ):
        """Initialize hybrid search with both backends.
        
        Args:
            embedding_service: Embedding service
            vector_search: Vector search client
            bm25_search: BM25 search
            chunk_store: Chunk metadata store
            vector_weight: Weight for vector search (not used in RRF, kept for future)
            bm25_weight: Weight for BM25 (not used in RRF, kept for future)
            rrf_k: RRF constant (default 60)
        """
        self.embedding_service = embedding_service
        self.vector_search = vector_search
        self.bm25_search = bm25_search
        self.chunk_store = chunk_store
        self.vector_weight = vector_weight
        self.bm25_weight = bm25_weight
        self.rrf_k = rrf_k
        
        logger.info(
            f"Initialized HybridSearchManager with RRF (k={rrf_k})"
        )
    
    def search(self, query: str, top_k: int = 6) -> List[Dict]:
        """Perform hybrid search.
        
        1. Get query embedding
        2. Search vector index
        3. Search BM25 index
        4. Merge with RRF
        5. Return top_k results with full chunk data
        
        Args:
            query: Search query
            top_k: Number of results to return
            
        Returns:
            List of formatted results for API response
        """
        try:
            # Step 1: Get query embedding
            logger.info(f"Generating embedding for query: {query}")
            query_embedding = self.embedding_service.embed_query(query)
            
            # Step 2: Vector search (get more results for better fusion)
            retrieval_k = top_k * 3  # Retrieve 3x for better fusion
            logger.info(f"Searching vector index (top_k={retrieval_k})")
            vector_results = self.vector_search.search(
                query_embedding=query_embedding,
                top_k=retrieval_k
            )
            
            # Step 3: BM25 search
            logger.info(f"Searching BM25 index (top_k={retrieval_k})")
            bm25_results = self.bm25_search.search(
                query=query,
                top_k=retrieval_k
            )
            
            # Step 4: Merge with RRF
            logger.info("Merging results with Reciprocal Rank Fusion")
            merged_results = self._reciprocal_rank_fusion(
                vector_results,
                bm25_results
            )
            
            # Step 5: Get top_k and format
            top_results = merged_results[:top_k]
            formatted_results = self._format_results(top_results)
            
            logger.info(f"Hybrid search returned {len(formatted_results)} results")
            return formatted_results
            
        except Exception as e:
            logger.error(f"Hybrid search failed: {e}")
            return []
    
    def _reciprocal_rank_fusion(
        self,
        vector_results: List[Dict],
        bm25_results: List[Dict]
    ) -> List[Dict]:
        """Merge results using Reciprocal Rank Fusion.
        
        RRF score = sum(1 / (k + rank)) for each list containing the doc.
        
        Args:
            vector_results: Results from vector search
            bm25_results: Results from BM25 search
            
        Returns:
            Merged and sorted results
        """
        # Build rank maps
        vector_ranks = {
            result["id"]: rank + 1
            for rank, result in enumerate(vector_results)
        }
        
        bm25_ranks = {
            result["chunk_id"]: rank + 1
            for rank, result in enumerate(bm25_results)
        }
        
        # Collect all unique chunk IDs
        all_chunk_ids = set(vector_ranks.keys()) | set(bm25_ranks.keys())
        
        # Calculate RRF scores
        rrf_scores = {}
        for chunk_id in all_chunk_ids:
            score = 0.0
            
            # Add vector search contribution
            if chunk_id in vector_ranks:
                score += 1.0 / (self.rrf_k + vector_ranks[chunk_id])
            
            # Add BM25 contribution
            if chunk_id in bm25_ranks:
                score += 1.0 / (self.rrf_k + bm25_ranks[chunk_id])
            
            rrf_scores[chunk_id] = score
        
        # Sort by RRF score
        sorted_ids = sorted(
            rrf_scores.keys(),
            key=lambda x: rrf_scores[x],
            reverse=True
        )
        
        # Build merged results
        merged = []
        for chunk_id in sorted_ids:
            merged.append({
                "chunk_id": chunk_id,
                "rrf_score": rrf_scores[chunk_id],
                "in_vector": chunk_id in vector_ranks,
                "in_bm25": chunk_id in bm25_ranks,
                "vector_rank": vector_ranks.get(chunk_id),
                "bm25_rank": bm25_ranks.get(chunk_id)
            })
        
        logger.info(
            f"RRF merged {len(vector_results)} vector + {len(bm25_results)} BM25 "
            f"results into {len(merged)} unique results"
        )
        
        return merged
    
    def _format_results(self, merged_results: List[Dict]) -> List[Dict]:
        """Format results for API response.
        
        Args:
            merged_results: Merged RRF results
            
        Returns:
            List of {title, snippet, link, score} dicts
        """
        formatted = []
        
        # Get chunk IDs
        chunk_ids = [r["chunk_id"] for r in merged_results]
        
        # Fetch chunk data
        chunks = self.chunk_store.get_chunks_by_ids(chunk_ids)
        
        # Create mapping for quick lookup
        chunk_map = {chunk["id"]: chunk for chunk in chunks}
        
        # Format each result
        for result in merged_results:
            chunk_id = result["chunk_id"]
            chunk = chunk_map.get(chunk_id)
            
            if not chunk:
                logger.warning(f"Chunk not found: {chunk_id}")
                continue
            
            # Format like Discovery Engine results
            formatted.append({
                "title": f"{chunk.get('doc_title', 'Document')} - {chunk.get('section', 'Section')}",
                "snippet": chunk.get("text", ""),
                "link": chunk.get("source_url", ""),
                "score": result["rrf_score"],
                # Include debug info
                "_debug": {
                    "chunk_id": chunk_id,
                    "in_vector": result["in_vector"],
                    "in_bm25": result["in_bm25"],
                    "vector_rank": result.get("vector_rank"),
                    "bm25_rank": result.get("bm25_rank")
                }
            })
        
        return formatted
