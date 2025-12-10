"""
Vertex AI Vector Search (Matching Engine) client.
Handles vector similarity search in the cloud.
"""
import logging
import os
from typing import List, Dict, Optional
from google.cloud import aiplatform
from google.cloud.aiplatform.matching_engine import (
    MatchingEngineIndex,
    MatchingEngineIndexEndpoint
)

logger = logging.getLogger(__name__)


class VectorSearchClient:
    """Client for Vertex AI Vector Search (Matching Engine)."""
    
    def __init__(
        self,
        project_id: str,
        location: str,
        index_id: str,
        endpoint_id: str,
        deployed_index_id: Optional[str] = None
    ):
        """Initialize Vector Search client.
        
        Args:
            project_id: GCP project ID
            location: GCP region
            index_id: Vector Search index ID
            endpoint_id: Vector Search endpoint ID
            deployed_index_id: Deployed index ID (optional)
        """
        self.project_id = project_id
        self.location = location
        self.index_id = index_id
        self.endpoint_id = endpoint_id
        self.deployed_index_id = deployed_index_id or "guidelines_deployed"
        
        self.index: Optional[MatchingEngineIndex] = None
        self.endpoint: Optional[MatchingEngineIndexEndpoint] = None
        
        self._initialize()
    
    def _initialize(self):
        """Connect to existing index and endpoint."""
        try:
            aiplatform.init(project=self.project_id, location=self.location)
            
            # Get index
            index_name = (
                f"projects/{self.project_id}/locations/{self.location}/"
                f"indexes/{self.index_id}"
            )
            self.index = MatchingEngineIndex(index_name=index_name)
            logger.info(f"Connected to index: {self.index.display_name}")
            
            # Get endpoint
            endpoint_name = (
                f"projects/{self.project_id}/locations/{self.location}/"
                f"indexEndpoints/{self.endpoint_id}"
            )
            self.endpoint = MatchingEngineIndexEndpoint(
                index_endpoint_name=endpoint_name
            )
            logger.info(f"Connected to endpoint: {self.endpoint.display_name}")
            
        except Exception as e:
            logger.error(f"Failed to initialize Vector Search client: {e}")
            raise
    
    def search(
        self,
        query_embedding: List[float],
        top_k: int = 10,
        filter_expression: Optional[str] = None
    ) -> List[Dict]:
        """Search for similar vectors.
        
        Args:
            query_embedding: Query vector (768 dimensions)
            top_k: Number of results to return
            filter_expression: Optional filter (not implemented yet)
            
        Returns:
            List of {id, distance, metadata} dicts
        """
        if not self.endpoint:
            logger.error("Vector Search endpoint not initialized")
            return []
        
        try:
            # Query the endpoint
            response = self.endpoint.find_neighbors(
                deployed_index_id=self.deployed_index_id,
                queries=[query_embedding],
                num_neighbors=top_k
            )
            
            # Parse results
            results = []
            if response and len(response) > 0:
                neighbors = response[0]  # First query's results
                
                for neighbor in neighbors:
                    results.append({
                        "id": neighbor.id,
                        "distance": float(neighbor.distance),
                        "metadata": {}  # Metadata stored separately in chunk_store
                    })
            
            logger.info(f"Vector search returned {len(results)} results")
            return results
            
        except Exception as e:
            logger.error(f"Vector search failed: {e}")
            return []
    
    def upsert_vectors(self, vectors: List[Dict]) -> bool:
        """Add or update vectors in the index.
        
        Args:
            vectors: List of {id, embedding, metadata} dicts
            
        Returns:
            True if successful
        """
        if not self.index:
            logger.error("Vector Search index not initialized")
            return False
        
        try:
            # For stream updates, we need to use the index's upsert_datapoints method
            # This requires formatting the data correctly
            
            # Extract IDs and embeddings
            datapoint_ids = [v["id"] for v in vectors]
            embeddings = [v["embedding"] for v in vectors]
            
            # Upsert to index (streaming update)
            self.index.upsert_datapoints(
                datapoints=list(zip(datapoint_ids, embeddings))
            )
            
            logger.info(f"Upserted {len(vectors)} vectors to index")
            return True
            
        except Exception as e:
            logger.error(f"Failed to upsert vectors: {e}")
            return False
    
    def delete_vectors(self, ids: List[str]) -> bool:
        """Remove vectors from the index.
        
        Args:
            ids: List of vector IDs to delete
            
        Returns:
            True if successful
        """
        if not self.index:
            logger.error("Vector Search index not initialized")
            return False
        
        try:
            # Delete datapoints
            self.index.remove_datapoints(datapoint_ids=ids)
            
            logger.info(f"Deleted {len(ids)} vectors from index")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete vectors: {e}")
            return False
    
    def get_stats(self) -> Dict:
        """Get index statistics.
        
        Returns:
            Dictionary with stats
        """
        stats = {
            "index_id": self.index_id,
            "endpoint_id": self.endpoint_id,
            "deployed_index_id": self.deployed_index_id,
            "index_initialized": self.index is not None,
            "endpoint_initialized": self.endpoint is not None
        }
        
        try:
            if self.index:
                stats["index_name"] = self.index.display_name
                # Note: Getting exact count requires querying the index
                # which can be expensive. Skip for now.
        except Exception as e:
            logger.warning(f"Failed to get index stats: {e}")
        
        return stats
