"""
Script to perform initial indexing of all managed URLs.
Run after setting up Vector Search infrastructure.

Usage:
    # From backend directory
    python scripts/initial_index.py
    
    # Or with custom environment
    PROJECT_ID=your-project python scripts/initial_index.py
"""
import asyncio
import sys
import os
import logging

# Add parent directory to path to import backend modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from retriever import retriever
from scraper import scrape_url
from admin import load_managed_urls

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main():
    """Load all managed URLs and index them."""
    logger.info("="*60)
    logger.info("Initial Custom RAG Indexing")
    logger.info("="*60)
    
    # Check environment variables
    required_vars = [
        "PROJECT_ID",
        "GCS_BUCKET",
        "VECTOR_SEARCH_INDEX_ID",
        "VECTOR_SEARCH_ENDPOINT_ID"
    ]
    
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    if missing_vars:
        logger.error(f"Missing required environment variables: {', '.join(missing_vars)}")
        logger.error("Please set these variables before running this script")
        return
    
    logger.info("\nInitializing retriever...")
    try:
        retriever.initialize()
        logger.info("✓ Retriever initialized\n")
    except Exception as e:
        logger.error(f"Failed to initialize retriever: {e}")
        return
    
    logger.info("Loading managed URLs...")
    try:
        config = load_managed_urls()
        urls = config.get("urls", [])
        logger.info(f"Found {len(urls)} URLs to index\n")
    except Exception as e:
        logger.error(f"Failed to load managed URLs: {e}")
        return
    
    if not urls:
        logger.warning("No URLs found in configuration")
        return
    
    total_chunks = 0
    errors = []
    
    for i, url_entry in enumerate(urls, 1):
        url = url_entry["url"]
        name = url_entry["name"]
        
        logger.info(f"[{i}/{len(urls)}] Processing: {name}")
        logger.info(f"  URL: {url}")
        
        try:
            # Scrape
            logger.info("  Scraping...")
            result = scrape_url(url)
            
            if not result.get("success"):
                error_msg = result.get("error", "Unknown error")
                logger.error(f"  ✗ Scraping failed: {error_msg}")
                errors.append({"url": url, "error": error_msg})
                continue
            
            # Index
            logger.info("  Indexing...")
            chunks = retriever.index_document(
                content=result["content"],
                url=url,
                title=result.get("title", name),
                content_type="html"
            )
            
            total_chunks += chunks
            logger.info(f"  ✓ Created {chunks} chunks\n")
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"  ✗ Error: {error_msg}\n")
            errors.append({"url": url, "error": error_msg})
    
    # Print summary
    logger.info("="*60)
    logger.info("Indexing Complete!")
    logger.info("="*60)
    logger.info(f"Total URLs processed: {len(urls)}")
    logger.info(f"Successful: {len(urls) - len(errors)}")
    logger.info(f"Failed: {len(errors)}")
    logger.info(f"Total chunks created: {total_chunks}")
    
    if errors:
        logger.info("\nFailed URLs:")
        for err in errors:
            logger.info(f"  - {err['url']}")
            logger.info(f"    Error: {err['error']}")
    
    logger.info("\n✓ Initial indexing complete!")
    logger.info("You can now enable custom RAG in Cloud Run with USE_CUSTOM_RAG=true")


if __name__ == "__main__":
    asyncio.run(main())
