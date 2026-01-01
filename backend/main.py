"Manual RAG Backend with Gemini 2.5 Flash Lite + Streaming"
import logging
import json
import asyncio
import time
import hashlib
import markdown
import base64
import re
from contextlib import asynccontextmanager
from datetime import datetime
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel
from bs4 import BeautifulSoup
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from google.cloud import discoveryengine_v1 as discoveryengine
from google.cloud import storage
from google.protobuf.json_format import MessageToDict
import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig, Part

from scraper import scrape_url
from admin import (
    load_managed_urls, save_managed_urls, add_url, remove_url,
    update_url_status, update_schedule, start_job, start_job_atomic, update_job_progress,
    complete_job, get_job_status, update_import_status, compute_content_hash,
    initialize_config_if_needed,
    load_prompt_config, update_prompt, reset_prompt_to_default,
    rollback_prompt, validate_prompt_template
)
from feedback import get_feedback_logger
from suggestion import router as suggestion_router
from config import settings


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Rate limiting configuration
limiter = Limiter(key_func=get_remote_address)

# Request size limits (from config, with computed base64 overhead)
MAX_QUERY_LENGTH = settings.MAX_QUERY_LENGTH
MAX_IMAGE_SIZE = settings.max_image_size_bytes
MAX_IMAGE_SIZE_BASE64 = int(MAX_IMAGE_SIZE * 1.37)  # base64 overhead


# Security headers middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


def sanitize_query(query: str) -> str:
    """Remove potential prompt injection patterns from user query."""
    if not query:
        return query
    # Remove template syntax that could interfere with prompts
    sanitized = re.sub(r'\{\{.*?\}\}', '', query)
    # Remove common instruction override patterns
    sanitized = re.sub(r'(?i)(ignore|forget|disregard)\s+(previous|above|all|prior)\s+(instructions?|context|prompts?)', '', sanitized)
    sanitized = re.sub(r'(?i)(new\s+instructions?|override|system\s+prompt)', '', sanitized)
    return sanitized.strip()


# Background job tracking
background_tasks = {}

# Cache for GCS metadata lookups (maps GCS path -> original URL)
from cachetools import LRUCache
GCS_CACHE_MAX_SIZE = 1000
gcs_metadata_cache = LRUCache(maxsize=GCS_CACHE_MAX_SIZE)

# Performance tuning
MAX_SNIPPETS_PER_DOC = 5
PAGE_SIZE = 10

# Initialize Vertex AI
vertexai.init(project=settings.PROJECT_ID, location=settings.GENAI_LOCATION)

# Initialize clients
search_client = discoveryengine.SearchServiceClient()
storage_client = storage.Client()
gemini_model = GenerativeModel(settings.MODEL_ID)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    logger.info("Starting up...")
    await asyncio.to_thread(initialize_config_if_needed)
    logger.info("Admin config initialized")
    yield
    # Shutdown logic
    logger.info("Shutting down...")

app = FastAPI(title="Auditor Guidelines API", lifespan=lifespan)

# Register rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Security headers middleware (added first so it runs last)
app.add_middleware(SecurityHeadersMiddleware)

# CORS - hardened configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
    expose_headers=["Content-Length"],
)

# Register suggestion router
app.include_router(suggestion_router)


class QueryRequest(BaseModel):
    query: str
    session_id: str = None
    modification: str = None  # 'shorter', 'more', 'regenerate'
    images: list[dict] = []  # List of {data: base64_str, mime_type: str, filename: str}


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
    Remove HTML tags from Discovery Engine snippets using BeautifulSoup.
    
    Args:
        text: Snippet text that may contain HTML tags

    Returns:
        Clean text with HTML tags removed
    """
    if not text:
        return text

    # Use BeautifulSoup to strip tags
    return BeautifulSoup(text, "html.parser").get_text(separator=" ", strip=True)


def normalize_url(url: str) -> str:
    """Normalize URL to prevent duplicates."""
    from urllib.parse import urlparse, urlunparse

    parsed = urlparse(url)
    path = parsed.path.rstrip('/') if parsed.path != '/' else '/'

    normalized = urlunparse((
        parsed.scheme.lower(),
        parsed.netloc.lower(),
        path,
        parsed.params,
        parsed.query,
        ''
    ))
    return normalized


def gcs_file_exists(url: str) -> bool:
    """Check if a scraped file exists in GCS for the given URL."""
    try:
        normalized_url = normalize_url(url)
        parsed = urlparse(normalized_url)
        domain = parsed.netloc.replace("www.", "")
        url_hash = hashlib.sha256(normalized_url.encode('utf-8')).hexdigest()[:16]
        filename = f"{domain}_{url_hash}.html"
        blob_path = f"{settings.GCS_SCRAPED_FOLDER}/{filename}"
        
        bucket = storage_client.bucket(settings.GCS_BUCKET)
        blob = bucket.blob(blob_path)
        
        exists = blob.exists()
        logger.info(f"Checking GCS file {blob_path}: exists={exists}")
        return exists
    except Exception as e:
        logger.error(f"Failed to check GCS file existence for {url}: {e}")
        return False

def upload_to_gcs(content: str, url: str) -> str:
    """Upload scraped content to GCS bucket."""
    try:
        normalized_url = normalize_url(url)
        parsed = urlparse(normalized_url)
        domain = parsed.netloc.replace("www.", "")
        url_hash = hashlib.sha256(normalized_url.encode('utf-8')).hexdigest()[:16]
        filename = f"{domain}_{url_hash}.html"
        blob_path = f"{settings.GCS_SCRAPED_FOLDER}/{filename}"

        logger.info(f"Uploading {url} (normalized: {normalized_url}) to {blob_path}")

        try:
            html_body = markdown.markdown(
                content,
                extensions=['extra', 'nl2br', 'sane_lists']
            )
        except Exception as e:
            logger.warning(f"Markdown conversion failed, using plain text: {e}")
            html_body = f"<p>{content.replace(chr(10), '</p><p>')}</p>"

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

        bucket = storage_client.bucket(settings.GCS_BUCKET)
        blob = bucket.blob(blob_path)
        
        blob.metadata = {
            "source_url": url,
            "indexed_at": datetime.now().isoformat()
        }

        blob.upload_from_string(html_content, content_type="text/html")
        logger.info(f"Uploaded content to gs://{settings.GCS_BUCKET}/{blob_path}")
        return blob_path

    except Exception as e:
        logger.error(f"Failed to upload to GCS: {e}")
        raise

def trigger_discovery_engine_import() -> dict:
    """Trigger Discovery Engine to re-import documents from GCS."""
    try:
        client = discoveryengine.DocumentServiceClient()
        parent = (
            f"projects/{settings.PROJECT_ID}/locations/{settings.LOCATION}"
            f"/dataStores/{settings.DATA_STORE_ID}/branches/default_branch"
        )

        gcs_source = discoveryengine.GcsSource(
            input_uris=[f"gs://{settings.GCS_BUCKET}/{settings.GCS_SCRAPED_FOLDER}/*"],
            data_schema="content"
        )

        import_request = discoveryengine.ImportDocumentsRequest(
            parent=parent,
            gcs_source=gcs_source,
            reconciliation_mode=discoveryengine.ImportDocumentsRequest.ReconciliationMode.INCREMENTAL,
        )

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
    """Fast retrieval - snippets only."""
    serving_config = (
        f"projects/{settings.PROJECT_ID}/locations/{settings.LOCATION}"
        f"/dataStores/{settings.DATA_STORE_ID}/servingConfigs/default_search"
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
        # Blocking gRPC call in thread pool
        response = await asyncio.to_thread(
            search_client.search, 
            request=request, 
            timeout=30.0
        )
        
        async def fetch_gcs_metadata(link):
            if not link.startswith("gs://"):
                return None
            
            if link in gcs_metadata_cache:
                logger.debug(f"Retrieved original URL from cache: {gcs_metadata_cache[link]}")
                return gcs_metadata_cache[link]
            
            try:
                gcs_path = link.replace(f"gs://{settings.GCS_BUCKET}/", "")
                bucket = storage_client.bucket(settings.GCS_BUCKET)
                blob = bucket.blob(gcs_path)

                exists = await asyncio.to_thread(blob.exists)
                if exists:
                    await asyncio.to_thread(blob.reload)
                    if blob.metadata and "source_url" in blob.metadata:
                        original_url = blob.metadata["source_url"]
                        gcs_metadata_cache[link] = original_url
                        return original_url
            except Exception as e:
                logger.error(f"Failed to fetch GCS metadata for {link}: {e}")
            return None

        processed_results = []
        gcs_tasks = []
        
        for result in response.results:
            doc = result.document
            doc_dict = MessageToDict(doc._pb)
            derived = doc_dict.get("derivedStructData", {})
            struct_data = doc_dict.get("structData", {})

            title = derived.get("title", derived.get("link", "Document"))
            link = derived.get("link", "")

            original_url = (
                derived.get("source") or
                struct_data.get("source") or
                derived.get("extractedMetadata", {}).get("source") or
                struct_data.get("source_url") or
                ""
            )
            
            result_obj = {
                "title": title,
                "link": link,
                "original_url": original_url,
                "snippets": derived.get("snippets", []),
                "gcs_task_index": -1
            }
            
            if not original_url and link.startswith("gs://"):
                result_obj["gcs_task_index"] = len(gcs_tasks)
                gcs_tasks.append(fetch_gcs_metadata(link))
            
            processed_results.append(result_obj)
        
        if gcs_tasks:
            gcs_urls = await asyncio.gather(*gcs_tasks)
            for res in processed_results:
                if res["gcs_task_index"] >= 0:
                    fetched_url = gcs_urls[res["gcs_task_index"]]
                    if fetched_url:
                        res["original_url"] = fetched_url

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

        return sources
    except Exception as e:
        logger.error(f"Search failed: {e}")
        return []





@app.get("/")
def health():
    return {
        "status": "ok",
        "model": settings.MODEL_ID,
        "streaming": True,
        "version": "2.2-modernized"
    }


@app.get("/pdf")
def get_pdf():
    """Serve the guidelines PDF from GCS using streaming."""
    try:
        blob_name = "Image Asset guidelines.pdf"
        bucket = storage_client.bucket(settings.GCS_BUCKET)
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


def validate_images(images: list[dict]) -> tuple[bool, str]:
    """Validate image uploads."""
    MAX_IMAGES = 5
    MAX_TOTAL_SIZE = 20 * 1024 * 1024
    ALLOWED_MIME_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}

    if len(images) > MAX_IMAGES:
        return False, f"Maximum {MAX_IMAGES} images allowed per query"

    total_size = 0
    for img in images:
        if not all(k in img for k in ['data', 'mime_type']):
            return False, "Invalid image format: missing required fields"
        if img['mime_type'] not in ALLOWED_MIME_TYPES:
            return False, f"Unsupported image type: {img['mime_type']}"
        try:
            image_bytes = base64.b64decode(img['data'])
            total_size += len(image_bytes)
        except Exception:
            return False, "Invalid image data"

    if total_size > MAX_TOTAL_SIZE:
        return False, f"Total image size exceeds {MAX_TOTAL_SIZE // (1024*1024)}MB limit"

    return True, ""
def build_prompt(query: str, context_text: str, modification: str = None) -> str:
    """Build prompt for Gemini."""
    try:
        config = load_prompt_config()
        template = config["active_prompt"]["template"]
        base_prompt = template.replace("{{context}}", context_text).replace("{{query}}", query)

        if modification == "shorter":
            return f"""**OVERRIDE INSTRUCTION**: Respond briefly and concisely. IGNORE any word count limits or detailed formatting in the prompt below. Give ONLY:
1. The verdict (Flag/Don't Flag)
2. One sentence explaining why

Keep your response under 50 words total.

{base_prompt}"""

        elif modification == "more":
            return f"""**OVERRIDE INSTRUCTION**: Provide a comprehensive and detailed answer. IGNORE any word limits (like "under 200 words") in the prompt below. Your response should be thorough and include:
- Full explanation with all relevant details
- Edge cases and exceptions
- Specific examples from guidelines if available
- Complete context and thorough reasoning
- All relevant policy nuances

Do NOT output template placeholders like "[State the specific guideline rule]" - fill them in with actual content.

{base_prompt}"""
        
        return base_prompt

    except Exception as e:
        logger.error(f"Failed to load prompt config, using hardcoded fallback: {e}")
        return f"CONTEXT:\n{context_text}\n\nQUESTION: {query}\n\nProvide a clear verdict (Flag / Don't Flag / Needs Review) with reasoning based on the guidelines."

def build_multimodal_prompt(query: str, context_text: str, images: list[dict], modification: str = None) -> list:
    """Build multimodal prompt for Gemini with text + images."""
    parts = []
    for img in images:
        try:
            image_bytes = base64.b64decode(img['data'])
            parts.append(Part.from_data(data=image_bytes, mime_type=img['mime_type']))
        except Exception as e:
            logger.error(f"Failed to decode image: {e}")
            continue

    text_prompt = build_prompt(query, context_text, modification)

    if images:
        image_instruction = f"\n\n**IMPORTANT**: The user has provided {len(images)} image(s) along with their question. Analyze the image(s) carefully and incorporate visual details into your answer. Reference specific elements you see in the image(s) when relevant.\n\n"
        text_prompt = image_instruction + text_prompt

    parts.append(Part.from_text(text_prompt))
    return parts


@app.post("/query-stream")
@limiter.limit("10/minute")
async def query_stream(request: Request, query_request: QueryRequest):
    """Stream response using native async Gemini generation."""
    if not query_request.query.strip() and not query_request.images:
        raise HTTPException(status_code=400, detail="Query or images must be provided")

    # Request size validation
    if len(query_request.query) > MAX_QUERY_LENGTH:
        raise HTTPException(status_code=400, detail=f"Query too long. Maximum {MAX_QUERY_LENGTH} characters allowed.")

    # Image size validation
    for img in query_request.images or []:
        if len(img.get('data', '')) > MAX_IMAGE_SIZE_BASE64:
            raise HTTPException(status_code=400, detail=f"Image too large. Maximum {MAX_IMAGE_SIZE // (1024*1024)}MB allowed.")

    if query_request.images:
        is_valid, error_msg = validate_images(query_request.images)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)

    start_time = time.time()

    try:
        # Sanitize query to prevent prompt injection
        raw_query = query_request.query.strip() if query_request.query.strip() else "Analyze this image in the context of the guidelines"
        query_text = sanitize_query(raw_query)
        
        # Determine retrieval parameters
        current_page_size = PAGE_SIZE
        current_max_snippets = MAX_SNIPPETS_PER_DOC
        if query_request.modification == "shorter":
            current_page_size = 3
            current_max_snippets = 1
        if query_request.images and len(query_text) < 10:
            current_page_size = 3

        sources = await retrieve_snippets(
            query_text,
            page_size=current_page_size,
            max_snippets=current_max_snippets
        )

        context_text = ""
        for i, source in enumerate(sources, 1):
            if source['snippet']:
                context_text += f"Source {i} ({source['title']}):\n{source['snippet']}\n\n"

        if not context_text:
            async def error_stream():
                yield f"data: {json.dumps({'text': 'I could not find any internal guidelines matching your query.'})}\n\n"
                yield f"data: {json.dumps({'done': True, 'sources': []})}\n\n"
            return StreamingResponse(error_stream(), media_type="text/event-stream")

        if query_request.images:
            prompt = build_multimodal_prompt(query_text, context_text, query_request.images, query_request.modification)
        else:
            prompt = build_prompt(query_text, context_text, query_request.modification)

        token_limit = settings.TOKEN_LIMITS.get(query_request.modification, settings.TOKEN_LIMITS["default"])
        
        generation_config = GenerationConfig(
            temperature=0.4,
            max_output_tokens=token_limit
        )
        
        async def generate():
            try:
                # Use native async streaming
                response_stream = await gemini_model.generate_content_async(
                    prompt, 
                    generation_config=generation_config, 
                    stream=True
                )
                
                first_token_time = None
                generation_start = time.time()
                
                async for chunk in response_stream:
                    if chunk.text:
                        if first_token_time is None:
                            first_token_time = time.time() - generation_start
                            logger.info(f"Time to first token: {first_token_time:.2f}s")
                        
                        yield f"data: {json.dumps({'text': chunk.text})}\n\n"
                
                # Send sources
                yield f"data: {json.dumps({'done': True, 'sources': sources})}\n\n"
                
            except Exception as e:
                logger.error(f"Streaming generation failed: {e}")
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
        
        return StreamingResponse(generate(), media_type="text/event-stream")
    
    except Exception as e:
        logger.error(f"Error processing streaming query: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest):
    """Non-streaming endpoint (fallback)."""
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    try:
        sources = await retrieve_snippets(request.query)
        
        context_text = ""
        for i, source in enumerate(sources, 1):
            if source['snippet']:
                context_text += f"Source {i} ({source['title']}):\n{source['snippet']}\n\n"
                
        if not context_text:
            return QueryResponse(answer="I could not find any internal guidelines matching your query.", sources=[])

        prompt = build_prompt(request.query, context_text, request.modification)
        token_limit = settings.TOKEN_LIMITS.get(request.modification, settings.TOKEN_LIMITS["default"])
        
        generation_config = GenerationConfig(
            temperature=0.4,
            max_output_tokens=token_limit
        )
        
        response = await gemini_model.generate_content_async(prompt, generation_config=generation_config)
        return QueryResponse(answer=response.text, sources=sources)

    except Exception as e:
        logger.error(f"Error processing query: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/feedback")
async def submit_feedback(request: FeedbackRequest):
    """Submit user feedback."""
    try:
        logger.info(f"Received feedback: {request.rating} for session {request.session_id}")
        
        try:
            prompt_config = await asyncio.to_thread(load_prompt_config)
            prompt_version = prompt_config.get("active_prompt", {}).get("version", 1)
        except Exception:
            prompt_version = None
        
        feedback_logger = get_feedback_logger()
        asyncio.create_task(
            feedback_logger.log_feedback(
                query=request.query,
                response=request.response,
                rating=request.rating,
                session_id=request.session_id,
                sources=request.sources,
                model_version=settings.MODEL_ID,
                prompt_version=prompt_version
            )
        )
        return {"status": "success", "message": "Feedback received"}
        
    except Exception as e:
        logger.error(f"Error processing feedback: {e}")
        raise HTTPException(status_code=500, detail="Failed to save feedback. Please try again.")


@app.post("/index-url", response_model=IndexURLResponse)
async def index_url(request: IndexURLRequest):
    """Index a URL by scraping its content and adding it to the knowledge base."""
    if not request.url.strip():
        raise HTTPException(status_code=400, detail="URL cannot be empty")

    try:
        logger.info(f"Indexing URL: {request.url}")

        # Step 1: Scrape the URL (now async)
        scrape_result = await scrape_url(request.url)

        if not scrape_result.get("success"):
            return IndexURLResponse(
                status="error",
                message=f"Failed to scrape URL: {scrape_result.get('error', 'Unknown error')}",
                url=request.url
            )

        # Step 2: Upload to GCS (still sync)
        file_path = await asyncio.to_thread(
            upload_to_gcs,
            scrape_result["content"],
            request.url
        )

        # Step 3: Trigger Discovery Engine import (sync)
        await asyncio.to_thread(trigger_discovery_engine_import)

        logger.info(f"Successfully indexed {request.url} -> {file_path}")

        return IndexURLResponse(
            status="success",
            message=f"Content uploaded and indexing started. searchable in ~5-10 minutes. Title: {scrape_result.get('title', 'N/A')}",
            file_path=file_path,
            url=request.url
        )

    except Exception as e:
        logger.error(f"Error indexing URL: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to index URL: {str(e)}")


# ==================== ADMIN PORTAL ENDPOINTS ====================

@app.get("/admin/urls")
@limiter.limit("30/minute")
async def get_managed_urls(request: Request):
    """Get all managed URLs with their status."""
    config = await asyncio.to_thread(load_managed_urls)
    return {
        "urls": config.get("urls", []),
        "total": len(config.get("urls", []))
    }


@app.post("/admin/urls")
@limiter.limit("5/minute")
async def add_managed_url(request: Request, url_request: AddURLRequest):
    """Add a new URL to the managed list."""
    try:
        parsed = urlparse(url_request.url)
        if not parsed.scheme or not parsed.netloc:
            raise HTTPException(status_code=400, detail="Invalid URL format")

        new_url = await asyncio.to_thread(add_url, url_request.name, url_request.url)
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
    
    url_entry = None
    for u in config.get("urls", []):
        if u["id"] == url_id:
            url_entry = u
            break
    
    if not url_entry:
        raise HTTPException(status_code=404, detail="URL not found")
    
    try:
        await asyncio.to_thread(update_url_status, url_id, "indexing")
        
        # Scrape (async)
        scrape_result = await scrape_url(url_entry["url"])
        
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
        
        content = scrape_result["content"]
        new_hash = compute_content_hash(content)
        
        file_exists = await asyncio.to_thread(gcs_file_exists, url_entry["url"])
        if url_entry.get("content_hash") == new_hash and file_exists:
            await asyncio.to_thread(update_url_status, url_id, "unchanged", None, new_hash)
            return {
                "status": "unchanged",
                "message": "Content has not changed since last index",
                "url_id": url_id
            }
        
        # Upload (sync)
        file_path = await asyncio.to_thread(upload_to_gcs, content, url_entry["url"])
        
        await asyncio.to_thread(update_url_status, url_id, "success", None, new_hash)
        
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
@limiter.limit("2/minute")
async def recrawl_all_urls(request: Request, background_tasks_param: bool = True):
    """Start a bulk re-crawl of all managed URLs."""
    config = await asyncio.to_thread(load_managed_urls)
    urls = [u for u in config.get("urls", []) if u.get("enabled", True)]

    if not urls:
        return {"status": "error", "message": "No URLs to re-crawl"}

    url_ids = [u["id"] for u in urls]

    # Use atomic job start to prevent race conditions
    success, job_id, error = await asyncio.to_thread(start_job_atomic, "bulk_recrawl", url_ids)

    if not success:
        return {
            "status": "error",
            "message": error or "Failed to start job"
        }

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
            
            await asyncio.to_thread(
                update_job_progress, url, name, processed, successful, failed, skipped
            )
            
            try:
                # Scrape (async)
                scrape_result = await scrape_url(url)
                
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
                
                content = scrape_result["content"]
                new_hash = compute_content_hash(content)
                
                file_exists = await asyncio.to_thread(gcs_file_exists, url)
                if url_entry.get("content_hash") == new_hash and file_exists:
                    skipped += 1
                    await asyncio.to_thread(update_url_status, url_id, "unchanged", None, new_hash)
                    processed += 1
                    continue
                
                # Upload (sync)
                await asyncio.to_thread(upload_to_gcs, content, url)
                
                await asyncio.to_thread(update_url_status, url_id, "success", None, new_hash)
                successful += 1
                
            except Exception as e:
                failed += 1
                await asyncio.to_thread(update_url_status, url_id, "error", str(e))
                logger.error(f"Failed to process {url}: {e}")
            
            processed += 1
        
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
    
    if not config.get("schedule", {}).get("enabled", True):
        logger.info("Scheduled re-crawl skipped - schedule disabled")
        return {"status": "skipped", "message": "Schedule is disabled"}
    
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
    
    if last_import.get("status") == "started":
        try:
            from google.cloud import discoveryengine_v1 as discoveryengine
            
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
@limiter.limit("5/minute")
async def update_prompt_config(request: Request, prompt_request: UpdatePromptRequest):
    """Update the active prompt template."""
    success, error, config = await asyncio.to_thread(
        update_prompt,
        prompt_request.template
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
    is_valid, error = validate_prompt_template(request.template)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error)
    
    try:
        sources = await retrieve_snippets(request.sample_query)
        
        context_text = ""
        for i, source in enumerate(sources, 1):
            if source['snippet']:
                context_text += f"Source {i} ({source['title']}):\n{source['snippet']}\n\n"
        
        if not context_text:
            context_text = "[No context found for this query]"
        
        rendered_prompt = request.template.replace("{{context}}", context_text).replace("{{query}}", request.sample_query)
        
        try:
            generation_config = GenerationConfig(
                temperature=0.4,
                max_output_tokens=settings.TOKEN_LIMITS["default"]
            )
            # Use native async here too for consistency
            response = await gemini_model.generate_content_async(rendered_prompt, generation_config=generation_config)
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
