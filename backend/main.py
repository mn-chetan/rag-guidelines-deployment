"""Manual RAG Backend with Gemini 2.5 Flash Lite + Streaming"""
import os
import logging
import json
import asyncio
import time
import re
import hashlib
import markdown
from datetime import datetime
from urllib.parse import urlparse
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from google.cloud import discoveryengine_v1 as discoveryengine
from google.cloud import storage
from google.protobuf.json_format import MessageToDict
import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig
from scraper import scrape_url
from admin import (
    load_managed_urls, save_managed_urls, add_url, remove_url,
    update_url_status, update_schedule, start_job, update_job_progress,
    complete_job, get_job_status, update_import_status, compute_content_hash,
    initialize_config_if_needed,
    load_prompt_config, update_prompt, reset_prompt_to_default,
    rollback_prompt, validate_prompt_template
)
from feedback import get_feedback_logger


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Background job tracking
background_tasks = {}

# Cache for GCS metadata lookups (maps GCS path -> original URL)
# Using LRU cache with max 1000 entries to prevent unbounded memory growth
from cachetools import LRUCache
GCS_CACHE_MAX_SIZE = 1000
gcs_metadata_cache = LRUCache(maxsize=GCS_CACHE_MAX_SIZE)

app = FastAPI(title="Auditor Guidelines API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Configuration ---
PROJECT_ID = os.getenv("PROJECT_ID", "rag-for-guidelines")
LOCATION = os.getenv("LOCATION", "global")
GENAI_LOCATION = os.getenv("GENAI_LOCATION", "us-central1")
DATA_STORE_ID = os.getenv("DATA_STORE_ID", "guidelines-data-store_1763919919982")
MODEL_ID = "gemini-2.5-flash-lite"
GCS_BUCKET = os.getenv("GCS_BUCKET", "rag-guidelines-v2")
GCS_SCRAPED_FOLDER = os.getenv("GCS_SCRAPED_FOLDER", "scraped")

# Performance tuning
MAX_SNIPPETS_PER_DOC = 5  # Maximum allowed by Discovery Engine API (0-5)
PAGE_SIZE = 10  # Balanced for quality and speed

# Token limits per mode
TOKEN_LIMITS = {
    "default": 1536,
    "shorter": 512,
    "more": 4096
}

# Initialize Vertex AI
vertexai.init(project=PROJECT_ID, location=GENAI_LOCATION)

# Initialize clients once at startup (reuse connections)
search_client = discoveryengine.SearchServiceClient()
storage_client = storage.Client()
gemini_model = GenerativeModel(MODEL_ID)


class QueryRequest(BaseModel):
    query: str
    session_id: str = None
    modification: str = None  # 'shorter', 'more', 'regenerate'


class QueryResponse(BaseModel):
    answer: str
    sources: list = []


class IndexURLRequest(BaseModel):
    url: str


class IndexURLResponse(BaseModel):
    status: str
    message: str
    file_path: str = None
    url: str = None


# Admin Portal Models
class AddURLRequest(BaseModel):
    name: str
    url: str


class ScheduleUpdateRequest(BaseModel):
    enabled: bool = None
    interval_hours: int = None


class UpdatePromptRequest(BaseModel):
    template: str


class PreviewPromptRequest(BaseModel):
    template: str
    sample_query: str = "Should I flag a wine bottle in the background?"


class FeedbackRequest(BaseModel):
    query: str
    response: str
    rating: str  # "positive" or "negative"
    session_id: str
    sources: list = []
    timestamp: int = None




def clean_snippet_html(text: str) -> str:
    """
    Remove HTML tags from Discovery Engine snippets.
    Discovery Engine returns snippets with <b> tags for highlighting.

    Args:
        text: Snippet text that may contain HTML tags

    Returns:
        Clean text with HTML tags removed
    """
    if not text:
        return text

    # Remove all HTML tags using regex
    # This handles <b>, </b>, and any other tags
    cleaned = re.sub(r'<[^>]+>', '', text)

    # Normalize whitespace (collapse multiple spaces)
    cleaned = re.sub(r'\s+', ' ', cleaned)

    return cleaned.strip()


def normalize_url(url: str) -> str:
    """
    Normalize URL to prevent duplicates from trailing slashes, case differences, etc.

    Args:
        url: The URL to normalize

    Returns:
        Normalized URL
    """
    from urllib.parse import urlparse, urlunparse

    parsed = urlparse(url)

    # Remove trailing slash from path (unless it's just "/")
    path = parsed.path.rstrip('/') if parsed.path != '/' else '/'

    # Reconstruct without fragment
    normalized = urlunparse((
        parsed.scheme.lower(),      # Normalize scheme to lowercase
        parsed.netloc.lower(),       # Normalize domain to lowercase
        path,                        # Path (keep case-sensitive for compatibility)
        parsed.params,
        parsed.query,
        ''                          # Remove fragment
    ))

    return normalized


def gcs_file_exists(url: str) -> bool:
    """
    Check if a scraped file exists in GCS for the given URL.
    
    Args:
        url: The original URL
        
    Returns:
        True if the file exists, False otherwise
    """
    try:
        normalized_url = normalize_url(url)
        parsed = urlparse(normalized_url)
        domain = parsed.netloc.replace("www.", "")
        url_hash = hashlib.sha256(normalized_url.encode('utf-8')).hexdigest()[:16]
        filename = f"{domain}_{url_hash}.html"
        blob_path = f"{GCS_SCRAPED_FOLDER}/{filename}"
        
        bucket = storage_client.bucket(GCS_BUCKET)
        blob = bucket.blob(blob_path)
        
        exists = blob.exists()
        logger.info(f"Checking GCS file {blob_path}: exists={exists}")
        return exists
    except Exception as e:
        logger.error(f"Failed to check GCS file existence for {url}: {e}")
        return False



def upload_to_gcs(content: str, url: str) -> str:
    """
    Upload scraped content to GCS bucket.

    Args:
        content: The scraped content (HTML or text)
        url: The original URL

    Returns:
        The GCS file path (e.g., "scraped/example.com_1234567890.html")
    """
    try:
        # Normalize URL before hashing to prevent duplicates from trailing slashes, case, etc.
        normalized_url = normalize_url(url)

        # Parse domain and create stable filename from URL hash
        parsed = urlparse(normalized_url)
        domain = parsed.netloc.replace("www.", "")

        # Use URL hash for stable, unique filenames (prevents duplicates)
        url_hash = hashlib.sha256(normalized_url.encode('utf-8')).hexdigest()[:16]
        filename = f"{domain}_{url_hash}.html"
        blob_path = f"{GCS_SCRAPED_FOLDER}/{filename}"

        logger.info(f"Uploading {url} (normalized: {normalized_url}) to {blob_path}")

        # Convert markdown to HTML for better semantic structure
        # This helps Discovery Engine extract better snippets with proper headers/lists
        try:
            # Convert markdown to HTML with extensions for better formatting
            html_body = markdown.markdown(
                content,
                extensions=['extra', 'nl2br', 'sane_lists']
            )
        except Exception as e:
            logger.warning(f"Markdown conversion failed, using plain text: {e}")
            # Fallback: wrap plain content in paragraph tags
            html_body = f"<p>{content.replace(chr(10), '</p><p>')}</p>"

        # Create HTML document with metadata
        html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{domain}</title>
    <meta name="source" content="{url}">
    <meta name="indexed_at" content="{datetime.now().isoformat()}">
</head>
<body>
<article>
{html_body}
</article>
</body>
</html>
"""

        # Upload to GCS with custom metadata
        bucket = storage_client.bucket(GCS_BUCKET)
        blob = bucket.blob(blob_path)

        # Set custom metadata that Discovery Engine can access
        blob.metadata = {
            "source_url": url,
            "indexed_at": datetime.now().isoformat()
        }

        blob.upload_from_string(html_content, content_type="text/html")

        logger.info(f"Uploaded content to gs://{GCS_BUCKET}/{blob_path} with metadata source_url={url}")
        return blob_path

    except Exception as e:
        logger.error(f"Failed to upload to GCS: {e}")
        raise


def trigger_discovery_engine_import() -> dict:
    """
    Trigger Discovery Engine to re-import documents from GCS.

    This tells Discovery Engine to scan the GCS bucket and index any new content.

    Returns:
        dict with operation details
    """
    try:
        # Create Document Service client
        client = discoveryengine.DocumentServiceClient()

        # Build the parent path (branch)
        parent = (
            f"projects/{PROJECT_ID}/locations/{LOCATION}"
            f"/dataStores/{DATA_STORE_ID}/branches/default_branch"
        )

        # Create import request
        gcs_source = discoveryengine.GcsSource(
            input_uris=[f"gs://{GCS_BUCKET}/{GCS_SCRAPED_FOLDER}/*"],
            data_schema="content"
        )

        import_request = discoveryengine.ImportDocumentsRequest(
            parent=parent,
            gcs_source=gcs_source,
            reconciliation_mode=discoveryengine.ImportDocumentsRequest.ReconciliationMode.INCREMENTAL,
        )

        # Trigger the import (this is async in GCP)
        operation = client.import_documents(request=import_request)

        logger.info(f"Triggered Discovery Engine import. Operation: {operation.operation.name}")

        return {
            "operation_name": operation.operation.name,
            "status": "import_started"
        }

    except Exception as e:
        logger.error(f"Failed to trigger Discovery Engine import: {e}")
        raise


async def retrieve_snippets(query: str, page_size: int = PAGE_SIZE, max_snippets: int = MAX_SNIPPETS_PER_DOC) -> list:
    """Fast retrieval - snippets only, no summary generation.
    
    Args:
        query: The search query
        page_size: Number of documents to retrieve (default: global PAGE_SIZE)
        max_snippets: Max snippets per document (default: global MAX_SNIPPETS_PER_DOC)
    """
    serving_config = (
        f"projects/{PROJECT_ID}/locations/{LOCATION}"
        f"/dataStores/{DATA_STORE_ID}/servingConfigs/default_search"
    )

    request = discoveryengine.SearchRequest(
        serving_config=serving_config,
        query=query,
        page_size=page_size,
        query_expansion_spec=discoveryengine.SearchRequest.QueryExpansionSpec(
            condition=discoveryengine.SearchRequest.QueryExpansionSpec.Condition.AUTO
        ),
        spell_correction_spec=discoveryengine.SearchRequest.SpellCorrectionSpec(
            mode=discoveryengine.SearchRequest.SpellCorrectionSpec.Mode.AUTO
        ),
        content_search_spec=discoveryengine.SearchRequest.ContentSearchSpec(
            snippet_spec=discoveryengine.SearchRequest.ContentSearchSpec.SnippetSpec(
                return_snippet=True,
                max_snippet_count=max_snippets
            ),
        ),
    )

    try:
        # Run search in thread pool since it's a blocking gRPC call
        response = await asyncio.to_thread(
            search_client.search, 
            request=request, 
            timeout=30.0
        )
        
        # Helper function for async GCS metadata lookup
        async def fetch_gcs_metadata(link):
            if not link.startswith("gs://"):
                return None
                
            # Check cache first
            if link in gcs_metadata_cache:
                logger.debug(f"Retrieved original URL from cache: {gcs_metadata_cache[link]}")
                return gcs_metadata_cache[link]
            
            try:
                # Parse GCS path: gs://bucket-name/path/to/file.html
                gcs_path = link.replace(f"gs://{GCS_BUCKET}/", "")
                bucket = storage_client.bucket(GCS_BUCKET)
                blob = bucket.blob(gcs_path)

                # Run blocking GCS call in thread pool
                exists = await asyncio.to_thread(blob.exists)
                if exists:
                    await asyncio.to_thread(blob.reload)  # Load metadata
                    if blob.metadata and "source_url" in blob.metadata:
                        original_url = blob.metadata["source_url"]
                        gcs_metadata_cache[link] = original_url  # Cache it
                        logger.info(f"Retrieved original URL from GCS metadata: {original_url}")
                        return original_url
                    else:
                        logger.warning(f"GCS blob {gcs_path} has no source_url metadata")
                else:
                    logger.warning(f"GCS blob {gcs_path} does not exist")
            except Exception as e:
                logger.error(f"Failed to fetch GCS metadata for {link}: {e}")
            return None

        # Process results and collect GCS lookup tasks
        processed_results = []
        gcs_tasks = []
        
        for result in response.results:
            doc = result.document
            doc_dict = MessageToDict(doc._pb)
            derived = doc_dict.get("derivedStructData", {})
            struct_data = doc_dict.get("structData", {})

            title = derived.get("title", derived.get("link", "Document"))
            link = derived.get("link", "")

            # Try to get original URL from multiple possible locations
            original_url = (
                derived.get("source") or
                struct_data.get("source") or
                derived.get("extractedMetadata", {}).get("source") or
                struct_data.get("source_url") or  # GCS custom metadata
                ""
            )
            
            # Prepare result object
            result_obj = {
                "title": title,
                "link": link,
                "original_url": original_url,
                "snippets": derived.get("snippets", []),
                "gcs_task_index": -1
            }
            
            # If we need GCS lookup, add to tasks
            if not original_url and link.startswith("gs://"):
                result_obj["gcs_task_index"] = len(gcs_tasks)
                gcs_tasks.append(fetch_gcs_metadata(link))
            
            processed_results.append(result_obj)
        
        # Execute all GCS lookups in parallel
        if gcs_tasks:
            gcs_urls = await asyncio.gather(*gcs_tasks)
            
            # Assign results back
            for res in processed_results:
                if res["gcs_task_index"] >= 0:
                    fetched_url = gcs_urls[res["gcs_task_index"]]
                    if fetched_url:
                        res["original_url"] = fetched_url
                    else:
                        logger.warning(f"No original URL found for GCS document: {res['link']}. Using GCS path as fallback.")

        # Finalize sources list
        sources = []
        for res in processed_results:
            final_link = res["original_url"] if res["original_url"] else res["link"]
            
            snippet_texts = [
                clean_snippet_html(s.get("snippet", ""))
                for s in res["snippets"]
                if s.get("snippet")
            ]
            combined_text = "\n".join(snippet_texts) if snippet_texts else ""
            
            sources.append({
                "title": res["title"],
                "link": final_link,
                "snippet": combined_text
            })

        # Check if any GCS URLs are being returned to users (potential metadata extraction failure)
        gcs_url_count = sum(1 for s in sources if s['link'].startswith('gs://'))
        if gcs_url_count > 0:
            logger.error(
                f"⚠️  URL EXTRACTION FAILURE: Returning {gcs_url_count} GCS URL(s) to user! "
                f"This indicates metadata extraction failed. Users should only see original URLs."
            )
            for s in sources:
                if s['link'].startswith('gs://'):
                    logger.error(f"   - GCS URL being returned: {s['link']}")

        logger.info(f"Search returned {len(sources)} sources")
        return sources
    except Exception as e:
        logger.error(f"Search failed: {e}")
        return []





def generate_with_gemini(query: str, sources: list, modification: str = None) -> str:
    """Step 2: Generate answer using Gemini 2.5 Flash with retrieved context."""
    context_text = ""
    for i, source in enumerate(sources, 1):
        if source['snippet']:  # Only include sources with content
            context_text += f"Source {i} ({source['title']}):\n{source['snippet']}\n\n"

    if not context_text:
        return "I could not find any internal guidelines matching your query."

    prompt = build_prompt(query, context_text, modification)
    token_limit = TOKEN_LIMITS.get(modification, TOKEN_LIMITS["default"])

    try:
        generation_config = GenerationConfig(
            temperature=0.4,
            max_output_tokens=token_limit
        )
        response = gemini_model.generate_content(prompt, generation_config=generation_config)
        return response.text
    except Exception as e:
        logger.error(f"Gemini generation failed: {e}")
        return "Error generating response from AI model."


@app.get("/")
def health():
    return {
        "status": "ok",
        "model": MODEL_ID,
        "streaming": True,
        "version": "2.1-optimized"
    }


@app.get("/pdf")
def get_pdf():
    """Serve the guidelines PDF from GCS using streaming."""
    try:
        bucket_name = "rag-guidelines-v2"
        blob_name = "Image Asset guidelines.pdf"
        
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        
        def stream_pdf():
            with blob.open("rb") as f:
                while chunk := f.read(8192):
                    yield chunk
        
        return StreamingResponse(
            stream_pdf(),
            media_type="application/pdf",
            headers={"Content-Disposition": f"inline; filename={blob_name}"}
        )
    except Exception as e:
        logger.error(f"Error fetching PDF: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch PDF")


def build_prompt(query: str, context_text: str, modification: str = None) -> str:
    """Build prompt for Gemini, always using admin-configurable template."""
    
    try:
        # ALWAYS load from config (for all modification types)
        config = load_prompt_config()
        template = config["active_prompt"]["template"]
        
        # Replace template variables with actual values
        base_prompt = (template
            .replace("{{context}}", context_text)
            .replace("{{query}}", query))
        
        # Wrap with meta-instructions based on modification type
        if modification == "shorter":
            final_prompt = f"""**OVERRIDE INSTRUCTION**: Respond briefly and concisely. IGNORE any word count limits or detailed formatting in the prompt below. Give ONLY:
1. The verdict (Flag/Don't Flag)
2. One sentence explaining why

Keep your response under 50 words total.

{base_prompt}"""
        
        elif modification == "more":
            final_prompt = f"""**OVERRIDE INSTRUCTION**: Provide a comprehensive and detailed answer. IGNORE any word limits (like "under 200 words") in the prompt below. Your response should be thorough and include:
- Full explanation with all relevant details
- Edge cases and exceptions  
- Specific examples from guidelines if available
- Complete context and thorough reasoning
- All relevant policy nuances

Do NOT output template placeholders like "[State the specific guideline rule]" - fill them in with actual content.

{base_prompt}"""
        
        else:
            # Default: use prompt as-is without any wrapper
            final_prompt = base_prompt
        
        return final_prompt
        
    except Exception as e:
        logger.error(f"Failed to load prompt config, using hardcoded fallback: {e}")
        # Fallback to basic prompt if config loading fails
        return f"""You are the Guideline Assistant for media auditors.

CONTEXT:
{context_text}

QUESTION: {query}

Provide a clear verdict (Flag / Don't Flag / Needs Review) with reasoning based on the guidelines."""



@app.post("/query-stream")
async def query_stream(request: QueryRequest):
    """Stream response for blazing fast perceived latency."""
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    start_time = time.time()

    try:
        logger.info(f"Processing streaming query: {request.query}")

        # Determine retrieval parameters based on mode
        current_page_size = PAGE_SIZE
        current_max_snippets = MAX_SNIPPETS_PER_DOC
        
        if request.modification == "shorter":
            current_page_size = 3
            current_max_snippets = 1
            logger.info("Quick Answer Mode activated: Reduced retrieval scope")

        # Retrieve from Discovery Engine
        retrieval_start = time.time()
        sources = await retrieve_snippets(
            request.query, 
            page_size=current_page_size, 
            max_snippets=current_max_snippets
        )
        retrieval_time = time.time() - retrieval_start
        logger.info(f"Retrieval took {retrieval_time:.2f}s")
        
        # Build context
        context_text = ""
        for i, source in enumerate(sources, 1):
            if source['snippet']:
                context_text += f"Source {i} ({source['title']}):\n{source['snippet']}\n\n"
        
        if not context_text:
            async def error_stream():
                yield f"data: {json.dumps({'text': 'I could not find any internal guidelines matching your query.'})}\n\n"
                yield f"data: {json.dumps({'done': True, 'sources': []})}\n\n"
            return StreamingResponse(error_stream(), media_type="text/event-stream")
        
        # Stream Gemini response
        prompt = build_prompt(request.query, context_text, request.modification)
        
        # Select token limit based on modification type
        token_limit = TOKEN_LIMITS.get(request.modification, TOKEN_LIMITS["default"])
        
        generation_config = GenerationConfig(
            temperature=0.4,
            max_output_tokens=token_limit
        )
        
        async def generate():
            try:
                generation_start = time.time()
                first_token_time = None
                
                # Use a queue to stream chunks from sync thread to async generator
                chunk_queue = asyncio.Queue()
                loop = asyncio.get_running_loop()
                
                def sync_generate():
                    """Run in thread pool, push chunks to queue as they arrive."""
                    try:
                        for chunk in gemini_model.generate_content(prompt, generation_config=generation_config, stream=True):
                            if chunk.text:
                                # Put chunk in queue (thread-safe with asyncio.Queue via call_soon_threadsafe)
                                loop.call_soon_threadsafe(
                                    chunk_queue.put_nowait, {"text": chunk.text}
                                )
                        # Signal completion
                        loop.call_soon_threadsafe(
                            chunk_queue.put_nowait, {"done": True}
                        )
                    except Exception as e:
                        loop.call_soon_threadsafe(
                            chunk_queue.put_nowait, {"error": str(e)}
                        )
                
                # Start generation in background thread
                loop.run_in_executor(None, sync_generate)
                
                # Yield chunks as they arrive
                while True:
                    chunk_data = await chunk_queue.get()
                    
                    if "error" in chunk_data:
                        logger.error(f"Streaming generation failed: {chunk_data['error']}")
                        yield f"data: {json.dumps({'error': chunk_data['error']})}\n\n"
                        return
                    
                    if chunk_data.get("done"):
                        break
                    
                    if "text" in chunk_data:
                        if first_token_time is None:
                            first_token_time = time.time() - generation_start
                            logger.info(f"Time to first token: {first_token_time:.2f}s")
                        try:
                            yield f"data: {json.dumps({'text': chunk_data['text']})}\n\n"
                        except (TypeError, ValueError) as json_err:
                            logger.error(f"JSON encoding failed for chunk: {json_err}")
                            yield f"data: {json.dumps({'text': '[encoding error]'})}\n\n"
                
                total_time = time.time() - start_time
                logger.info(f"Total request time: {total_time:.2f}s")
                
                # Send sources at the end
                try:
                    yield f"data: {json.dumps({'done': True, 'sources': sources})}\n\n"
                except (TypeError, ValueError) as json_err:
                    logger.error(f"JSON encoding failed for sources: {json_err}")
                    yield f"data: {json.dumps({'done': True, 'sources': [], 'warning': 'Failed to encode sources'})}\n\n"
            except Exception as e:
                logger.error(f"Streaming generation failed: {e}")
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
        
        return StreamingResponse(generate(), media_type="text/event-stream")
    
    except Exception as e:
        logger.error(f"Error processing streaming query: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest):
    """Non-streaming endpoint (fallback for compatibility)."""
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    try:
        logger.info(f"Processing query: {request.query}, modification: {request.modification}")

        # Retrieve from Discovery Engine (fast - no summary)
        sources = await retrieve_snippets(request.query)

        # Generate with Gemini
        answer = await asyncio.to_thread(generate_with_gemini, request.query, sources, request.modification)

        return QueryResponse(answer=answer, sources=sources)

    except Exception as e:
        logger.error(f"Error processing query: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/feedback")
async def submit_feedback(request: FeedbackRequest):
    """
    Submit user feedback (thumbs up/down) and log to BigQuery.
    
    This endpoint is fire-and-forget - it returns immediately even if
    BigQuery logging fails, to avoid blocking the user experience.
    """
    try:
        logger.info(f"Received feedback: {request.rating} for session {request.session_id}")
        
        # Get current prompt version
        try:
            prompt_config = await asyncio.to_thread(load_prompt_config)
            prompt_version = prompt_config.get("active_prompt", {}).get("version", 1)
        except Exception:
            prompt_version = None
        
        # Log to BigQuery asynchronously (fire-and-forget)
        feedback_logger = get_feedback_logger()
        asyncio.create_task(
            feedback_logger.log_feedback(
                query=request.query,
                response=request.response,
                rating=request.rating,
                session_id=request.session_id,
                sources=request.sources,
                model_version=MODEL_ID,
                prompt_version=prompt_version
            )
        )
        
        return {
            "status": "success",
            "message": "Feedback received"
        }
        
    except Exception as e:
        # Log error but don't fail the request
        logger.error(f"Error processing feedback: {e}")
        return {
            "status": "success",
            "message": "Feedback received"
        }



@app.post("/index-url", response_model=IndexURLResponse)
async def index_url(request: IndexURLRequest):
    """
    Index a URL by scraping its content and adding it to the knowledge base.

    Flow:
    1. Scrape the URL
    2. Upload content to GCS
    3. Trigger Discovery Engine import
    4. Return status
    """
    if not request.url.strip():
        raise HTTPException(status_code=400, detail="URL cannot be empty")

    try:
        logger.info(f"Indexing URL: {request.url}")

        # Step 1: Scrape the URL (run in thread pool to avoid blocking)
        scrape_result = await asyncio.to_thread(scrape_url, request.url)

        if not scrape_result.get("success"):
            return IndexURLResponse(
                status="error",
                message=f"Failed to scrape URL: {scrape_result.get('error', 'Unknown error')}",
                url=request.url
            )

        # Step 2: Upload to GCS
        file_path = await asyncio.to_thread(
            upload_to_gcs,
            scrape_result["content"],
            request.url
        )

        # Step 3: Trigger Discovery Engine import
        import_result = await asyncio.to_thread(trigger_discovery_engine_import)

        logger.info(f"Successfully indexed {request.url} -> {file_path}")

        return IndexURLResponse(
            status="success",
            message=(
                f"Content uploaded to GCS and indexing started. "
                f"The content will be searchable in ~5-10 minutes. "
                f"Title: {scrape_result.get('title', 'N/A')}"
            ),
            file_path=file_path,
            url=request.url
        )

    except Exception as e:
        logger.error(f"Error indexing URL: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to index URL: {str(e)}")


# ==================== ADMIN PORTAL ENDPOINTS ====================

@app.on_event("startup")
async def startup_event():
    """Initialize config on startup if needed."""
    await asyncio.to_thread(initialize_config_if_needed)
    logger.info("Admin config initialized")


@app.get("/admin/urls")
async def get_managed_urls():
    """Get all managed URLs with their status."""
    config = await asyncio.to_thread(load_managed_urls)
    return {
        "urls": config.get("urls", []),
        "total": len(config.get("urls", []))
    }


@app.post("/admin/urls")
async def add_managed_url(request: AddURLRequest):
    """Add a new URL to the managed list."""
    try:
        # Validate URL format
        parsed = urlparse(request.url)
        if not parsed.scheme or not parsed.netloc:
            raise HTTPException(status_code=400, detail="Invalid URL format")
        
        new_url = await asyncio.to_thread(add_url, request.name, request.url)
        return {"status": "success", "url": new_url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to add URL: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/admin/urls/{url_id}")
async def delete_managed_url(url_id: str):
    """Remove a URL from the managed list."""
    success = await asyncio.to_thread(remove_url, url_id)
    if not success:
        raise HTTPException(status_code=404, detail="URL not found")
    return {"status": "success", "message": "URL removed"}


@app.post("/admin/urls/{url_id}/recrawl")
async def recrawl_single_url(url_id: str):
    """Re-crawl a single URL."""
    config = await asyncio.to_thread(load_managed_urls)
    
    # Find the URL
    url_entry = None
    for u in config.get("urls", []):
        if u["id"] == url_id:
            url_entry = u
            break
    
    if not url_entry:
        raise HTTPException(status_code=404, detail="URL not found")
    
    try:
        # Update status to indexing
        await asyncio.to_thread(update_url_status, url_id, "indexing")
        
        # Scrape the URL
        scrape_result = await asyncio.to_thread(scrape_url, url_entry["url"])
        
        if not scrape_result.get("success"):
            await asyncio.to_thread(
                update_url_status, url_id, "error", 
                scrape_result.get("error", "Unknown error")
            )
            return {
                "status": "error",
                "message": scrape_result.get("error", "Failed to scrape"),
                "url_id": url_id
            }
        
        # Check if content has changed
        content = scrape_result["content"]
        new_hash = compute_content_hash(content)
        
        # Only skip if hash matches AND file exists in GCS
        file_exists = await asyncio.to_thread(gcs_file_exists, url_entry["url"])
        if url_entry.get("content_hash") == new_hash and file_exists:
            await asyncio.to_thread(update_url_status, url_id, "unchanged", None, new_hash)
            return {
                "status": "unchanged",
                "message": "Content has not changed since last index",
                "url_id": url_id
            }
        
        # Upload to GCS
        file_path = await asyncio.to_thread(upload_to_gcs, content, url_entry["url"])
        
        # Update status
        await asyncio.to_thread(update_url_status, url_id, "success", None, new_hash)
        
        # Trigger Discovery Engine import
        import_result = await asyncio.to_thread(trigger_discovery_engine_import)
        await asyncio.to_thread(
            update_import_status, 
            import_result["operation_name"], 
            "started"
        )
        
        return {
            "status": "success",
            "message": f"URL re-crawled and uploaded. Import started.",
            "url_id": url_id,
            "file_path": file_path
        }
        
    except Exception as e:
        await asyncio.to_thread(update_url_status, url_id, "error", str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/recrawl-all")
async def recrawl_all_urls(background_tasks_param: bool = True):
    """Start a bulk re-crawl of all managed URLs."""
    config = await asyncio.to_thread(load_managed_urls)
    urls = [u for u in config.get("urls", []) if u.get("enabled", True)]
    
    if not urls:
        return {"status": "error", "message": "No URLs to re-crawl"}
    
    # Check if a job is already running
    current_job = await asyncio.to_thread(get_job_status)
    if current_job and current_job.get("status") == "running":
        return {
            "status": "error",
            "message": "A re-crawl job is already running",
            "job_id": current_job.get("job_id")
        }
    
    # Start a new job
    url_ids = [u["id"] for u in urls]
    job_id = await asyncio.to_thread(start_job, "bulk_recrawl", url_ids)
    
    # Run the job in background
    asyncio.create_task(run_bulk_recrawl_job(job_id, urls))
    
    return {
        "status": "started",
        "message": f"Started re-crawling {len(urls)} URLs",
        "job_id": job_id,
        "total_urls": len(urls)
    }


async def run_bulk_recrawl_job(job_id: str, urls: list):
    """Background task to run bulk re-crawl."""
    processed = 0
    successful = 0
    failed = 0
    skipped = 0
    
    try:
        for url_entry in urls:
            url_id = url_entry["id"]
            url = url_entry["url"]
            name = url_entry["name"]
            
            # Update progress
            await asyncio.to_thread(
                update_job_progress, url, name, processed, successful, failed, skipped
            )
            
            try:
                # Scrape the URL
                scrape_result = await asyncio.to_thread(scrape_url, url)
                
                if not scrape_result.get("success"):
                    failed += 1
                    await asyncio.to_thread(
                        update_url_status, url_id, "error",
                        scrape_result.get("error", "Unknown error")
                    )
                    await asyncio.to_thread(
                        update_job_progress, url, name, processed + 1, 
                        successful, failed, skipped, 
                        scrape_result.get("error")
                    )
                    processed += 1
                    continue
                
                # Check if content has changed
                content = scrape_result["content"]
                new_hash = compute_content_hash(content)
                
                # Only skip if hash matches AND file exists in GCS
                file_exists = await asyncio.to_thread(gcs_file_exists, url)
                if url_entry.get("content_hash") == new_hash and file_exists:
                    skipped += 1
                    await asyncio.to_thread(update_url_status, url_id, "unchanged", None, new_hash)
                    processed += 1
                    continue
                
                # Upload to GCS
                await asyncio.to_thread(upload_to_gcs, content, url)
                
                # Update status
                await asyncio.to_thread(update_url_status, url_id, "success", None, new_hash)
                successful += 1
                
            except Exception as e:
                failed += 1
                await asyncio.to_thread(update_url_status, url_id, "error", str(e))
                logger.error(f"Failed to process {url}: {e}")
            
            processed += 1
        
        # Trigger Discovery Engine import once at the end (if any successful)
        if successful > 0:
            try:
                import_result = await asyncio.to_thread(trigger_discovery_engine_import)
                await asyncio.to_thread(
                    update_import_status,
                    import_result["operation_name"],
                    "started"
                )
            except Exception as e:
                logger.error(f"Failed to trigger import: {e}")
        
        # Complete the job
        await asyncio.to_thread(complete_job, "completed")
        logger.info(f"Bulk re-crawl completed: {successful} success, {failed} failed, {skipped} skipped")
        
    except Exception as e:
        logger.error(f"Bulk re-crawl job failed: {e}")
        await asyncio.to_thread(complete_job, "failed")


@app.get("/admin/job-status")
async def get_current_job_status():
    """Get the status of the current or last job."""
    job = await asyncio.to_thread(get_job_status)
    if not job:
        return {"status": "no_job", "message": "No job running or completed"}
    return job


@app.post("/admin/scheduled-recrawl")
async def scheduled_recrawl():
    """Endpoint for Cloud Scheduler to trigger automatic re-crawl."""
    config = await asyncio.to_thread(load_managed_urls)
    
    # Check if schedule is enabled
    if not config.get("schedule", {}).get("enabled", True):
        logger.info("Scheduled re-crawl skipped - schedule disabled")
        return {"status": "skipped", "message": "Schedule is disabled"}
    
    # Trigger the recrawl
    return await recrawl_all_urls()


@app.get("/admin/schedule")
async def get_schedule():
    """Get schedule configuration."""
    config = await asyncio.to_thread(load_managed_urls)
    return config.get("schedule", {})


@app.put("/admin/schedule")
async def update_schedule_config(request: ScheduleUpdateRequest):
    """Update schedule configuration."""
    schedule = await asyncio.to_thread(
        update_schedule, 
        request.enabled, 
        request.interval_hours
    )
    return {"status": "success", "schedule": schedule}


@app.get("/admin/import-status")
async def get_import_status():
    """Get the status of the last Discovery Engine import."""
    config = await asyncio.to_thread(load_managed_urls)
    last_import = config.get("last_import")
    
    if not last_import:
        return {"status": "no_import", "message": "No import has been triggered yet"}
    
    # If import is in progress, try to check the operation status
    if last_import.get("status") == "started":
        try:
            from google.longrunning import operations_pb2
            from google.cloud import discoveryengine_v1 as discoveryengine
            
            # Check operation status
            client = discoveryengine.DocumentServiceClient()
            operation = client._transport.operations_client.get_operation(
                last_import["operation_name"]
            )
            
            if operation.done:
                await asyncio.to_thread(
                    update_import_status,
                    last_import["operation_name"],
                    "completed",
                    datetime.utcnow().isoformat() + "Z"
                )
                last_import["status"] = "completed"
                last_import["completed_at"] = datetime.utcnow().isoformat() + "Z"
        except Exception as e:
            logger.warning(f"Could not check operation status: {e}")
    
    return last_import


# ==================== PROMPT CONFIGURATION ENDPOINTS ====================

@app.get("/admin/prompt")
async def get_prompt_config():
    """Get current prompt configuration."""
    config = await asyncio.to_thread(load_prompt_config)
    return {
        "active_prompt": config.get("active_prompt"),
        "defaults": config.get("defaults"),
        "history_count": len(config.get("history", []))
    }


@app.put("/admin/prompt")
async def update_prompt_config(request: UpdatePromptRequest):
    """Update the active prompt template."""
    success, error, config = await asyncio.to_thread(
        update_prompt, 
        request.template
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=error)
    
    return {
        "status": "success",
        "message": "Prompt updated successfully",
        "active_prompt": config.get("active_prompt")
    }


@app.post("/admin/prompt/preview")
async def preview_prompt_config(request: PreviewPromptRequest):
    """Preview a prompt with a sample query before saving."""
    # Validate the template first
    is_valid, error = validate_prompt_template(request.template)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error)
    
    try:
        # Retrieve context for the sample query
        sources = await retrieve_snippets(request.sample_query)
        
        # Build context
        context_text = ""
        for i, source in enumerate(sources, 1):
            if source['snippet']:
                context_text += f"Source {i} ({source['title']}):\n{source['snippet']}\n\n"
        
        if not context_text:
            context_text = "[No context found for this query]"
        
        # Replace template variables to show full rendered prompt
        rendered_prompt = request.template.replace("{{context}}", context_text).replace("{{query}}", request.sample_query)
        
        # Generate response using Gemini
        try:
            generation_config = GenerationConfig(
                temperature=0.4,
                max_output_tokens=TOKEN_LIMITS["default"]
            )
            response = gemini_model.generate_content(rendered_prompt, generation_config=generation_config)
            generated_response = response.text
        except Exception as e:
            logger.error(f"Preview generation failed: {e}")
            generated_response = f"[Error generating preview: {str(e)}]"
        
        return {
            "status": "success",
            "rendered_prompt": rendered_prompt,
            "sample_query": request.sample_query,
            "generated_response": generated_response,
            "sources": sources
        }
    except Exception as e:
        logger.error(f"Preview failed: {e}")
        raise HTTPException(status_code=500, detail=f"Preview failed: {str(e)}")


@app.post("/admin/prompt/reset")
async def reset_prompt_config():
    """Reset prompt to default configuration."""
    success, error, config = await asyncio.to_thread(reset_prompt_to_default)
    
    if not success:
        raise HTTPException(status_code=500, detail=error)
    
    return {
        "status": "success",
        "message": "Prompt reset to default",
        "active_prompt": config.get("active_prompt")
    }


@app.get("/admin/prompt/history")
async def get_prompt_history():
    """Get version history of prompts."""
    config = await asyncio.to_thread(load_prompt_config)
    history = config.get("history", [])
    
    # Return simplified history (without full template text for list view)
    simplified_history = [
        {
            "version": h.get("version"),
            "updated_at": h.get("updated_at"),
            "updated_by": h.get("updated_by"),
            "template_preview": h.get("template", "")[:100] + "..." if len(h.get("template", "")) > 100 else h.get("template", "")
        }
        for h in history
    ]
    
    return {
        "history": simplified_history,
        "total": len(history)
    }


@app.post("/admin/prompt/rollback/{version}")
async def rollback_prompt_version(version: int):
    """Rollback to a specific version from history."""
    success, error, config = await asyncio.to_thread(rollback_prompt, version)
    
    if not success:
        raise HTTPException(status_code=404, detail=error)
    
    return {
        "status": "success",
        "message": f"Rolled back to version {version}",
        "active_prompt": config.get("active_prompt")
    }



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
