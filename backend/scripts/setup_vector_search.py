"""
Script to set up Vertex AI Vector Search infrastructure.
Run once to create index and endpoint.

Usage:
    python setup_vector_search.py --project-id=rag-for-guidelines --location=us-central1
    
    # Create index only
    python setup_vector_search.py --project-id=PROJECT_ID --create-index
    
    # Create endpoint only
    python setup_vector_search.py --project-id=PROJECT_ID --create-endpoint
    
    # Deploy index to endpoint
    python setup_vector_search.py --project-id=PROJECT_ID --deploy \
        --index-id=INDEX_ID --endpoint-id=ENDPOINT_ID
"""
import argparse
import logging
from google.cloud import aiplatform

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_index(project_id: str, location: str):
    """Create Vector Search index.
    
    Args:
        project_id: GCP project ID
        location: GCP region
        
    Returns:
        Created index object
    """
    logger.info(f"Creating Vector Search index in {project_id}/{location}")
    
    aiplatform.init(project=project_id, location=location)
    
    # Create tree-AH index for fast approximate search
    index = aiplatform.MatchingEngineIndex.create_tree_ah_index(
        display_name="guidelines-vectors",
        dimensions=768,  # text-embedding-004 output size
        approximate_neighbors_count=10,
        distance_measure_type="COSINE_DISTANCE",
        shard_size="SHARD_SIZE_SMALL",
        index_update_method="STREAM_UPDATE",  # For real-time updates
        description="Vector index for guideline document chunks"
    )
    
    logger.info(f"✓ Created index: {index.resource_name}")
    logger.info(f"  Display name: {index.display_name}")
    logger.info(f"  Index ID: {index.name.split('/')[-1]}")
    
    return index


def create_endpoint(project_id: str, location: str):
    """Create Vector Search endpoint.
    
    Args:
        project_id: GCP project ID
        location: GCP region
        
    Returns:
        Created endpoint object
    """
    logger.info(f"Creating Vector Search endpoint in {project_id}/{location}")
    
    aiplatform.init(project=project_id, location=location)
    
    endpoint = aiplatform.MatchingEngineIndexEndpoint.create(
        display_name="guidelines-search-endpoint",
        public_endpoint_enabled=True,
        description="Endpoint for guideline vector search"
    )
    
    logger.info(f"✓ Created endpoint: {endpoint.resource_name}")
    logger.info(f"  Display name: {endpoint.display_name}")
    logger.info(f"  Endpoint ID: {endpoint.name.split('/')[-1]}")
    
    return endpoint


def deploy_index(
    project_id: str,
    location: str,
    index_id: str,
    endpoint_id: str,
    deployed_index_id: str = "guidelines_deployed"
):
    """Deploy index to endpoint.
    
    Args:
        project_id: GCP project ID
        location: GCP region
        index_id: Index ID to deploy
        endpoint_id: Endpoint ID to deploy to
        deployed_index_id: ID for the deployed index
        
    Returns:
        Deployed index info
    """
    logger.info(f"Deploying index {index_id} to endpoint {endpoint_id}")
    
    aiplatform.init(project=project_id, location=location)
    
    # Get index and endpoint
    index_name = f"projects/{project_id}/locations/{location}/indexes/{index_id}"
    endpoint_name = f"projects/{project_id}/locations/{location}/indexEndpoints/{endpoint_id}"
    
    index = aiplatform.MatchingEngineIndex(index_name=index_name)
    endpoint = aiplatform.MatchingEngineIndexEndpoint(index_endpoint_name=endpoint_name)
    
    # Deploy
    deployed_index = endpoint.deploy_index(
        index=index,
        deployed_index_id=deployed_index_id,
        display_name="guidelines-deployed-index",
        machine_type="e2-standard-2",  # Smallest machine type
        min_replica_count=1,
        max_replica_count=2,
    )
    
    logger.info(f"✓ Deployed index: {deployed_index.id}")
    logger.info(f"  Deployed index ID: {deployed_index_id}")
    
    return deployed_index


def main():
    parser = argparse.ArgumentParser(
        description="Set up Vertex AI Vector Search infrastructure"
    )
    parser.add_argument("--project-id", required=True, help="GCP project ID")
    parser.add_argument("--location", default="us-central1", help="GCP region")
    parser.add_argument("--create-index", action="store_true", help="Create index")
    parser.add_argument("--create-endpoint", action="store_true", help="Create endpoint")
    parser.add_argument("--deploy", action="store_true", help="Deploy index to endpoint")
    parser.add_argument("--index-id", help="Index ID (for deploy)")
    parser.add_argument("--endpoint-id", help="Endpoint ID (for deploy)")
    parser.add_argument("--deployed-index-id", default="guidelines_deployed", help="Deployed index ID")
    
    args = parser.parse_args()
    
    # If no specific action, do everything
    if not (args.create_index or args.create_endpoint or args.deploy):
        logger.info("No specific action specified - will create index, endpoint, and deploy")
        args.create_index = True
        args.create_endpoint = True
        args.deploy = True
    
    index = None
    endpoint = None
    
    # Create index
    if args.create_index:
        index = create_index(args.project_id, args.location)
        index_id = index.name.split('/')[-1]
        logger.info(f"\n📋 Save this Index ID: {index_id}")
    
    # Create endpoint
    if args.create_endpoint:
        endpoint = create_endpoint(args.project_id, args.location)
        endpoint_id = endpoint.name.split('/')[-1]
        logger.info(f"\n📋 Save this Endpoint ID: {endpoint_id}")
    
    # Deploy
    if args.deploy:
        # Use created resources or provided IDs
        index_id = index.name.split('/')[-1] if index else args.index_id
        endpoint_id = endpoint.name.split('/')[-1] if endpoint else args.endpoint_id
        
        if not index_id or not endpoint_id:
            logger.error("--index-id and --endpoint-id required for deploy")
            return
        
        deployed = deploy_index(
            args.project_id,
            args.location,
            index_id,
            endpoint_id,
            args.deployed_index_id
        )
    
    # Print summary
    logger.info("\n" + "="*60)
    logger.info("✓ Setup complete!")
    logger.info("="*60)
    logger.info("\nAdd these to your Cloud Run environment variables:")
    logger.info(f"  VECTOR_SEARCH_INDEX_ID={index_id if index else args.index_id}")
    logger.info(f"  VECTOR_SEARCH_ENDPOINT_ID={endpoint_id if endpoint else args.endpoint_id}")
    logger.info(f"  VECTOR_SEARCH_DEPLOYED_INDEX_ID={args.deployed_index_id}")
    logger.info(f"  USE_CUSTOM_RAG=true")
    logger.info("\n")


if __name__ == "__main__":
    main()
