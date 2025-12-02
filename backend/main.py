"""Manual RAG Backend with Gemini 2.5 Flash Lite + Streaming"""
import os
import logging
import json
import asyncio
import time
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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
MAX_SNIPPETS_PER_DOC = 2  # Reduced for faster generation
PAGE_SIZE = 6  # Reduced for faster retrieval

# Token limits per mode
TOKEN_LIMITS = {
    "default": 768,
    "shorter": 256,
    "more": 2048
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
        # Parse domain and create filename
        parsed = urlparse(url)
        domain = parsed.netloc.replace("www.", "")
        timestamp = int(datetime.now().timestamp())
        filename = f"{domain}_{timestamp}.html"
        blob_path = f"{GCS_SCRAPED_FOLDER}/{filename}"

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
{content}
</article>
</body>
</html>
"""

        # Upload to GCS
        bucket = storage_client.bucket(GCS_BUCKET)
        blob = bucket.blob(blob_path)
        blob.upload_from_string(html_content, content_type="text/html")

        logger.info(f"Uploaded content to gs://{GCS_BUCKET}/{blob_path}")
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


def retrieve_snippets(query: str) -> list:
    """Fast retrieval - snippets only, no summary generation."""
    serving_config = (
        f"projects/{PROJECT_ID}/locations/{LOCATION}"
        f"/dataStores/{DATA_STORE_ID}/servingConfigs/default_search"
    )

    request = discoveryengine.SearchRequest(
        serving_config=serving_config,
        query=query,
        page_size=PAGE_SIZE,
        content_search_spec=discoveryengine.SearchRequest.ContentSearchSpec(
            snippet_spec=discoveryengine.SearchRequest.ContentSearchSpec.SnippetSpec(
                return_snippet=True,
                max_snippet_count=MAX_SNIPPETS_PER_DOC
            ),
        ),
    )

    try:
        response = search_client.search(request=request, timeout=30.0)
        
        sources = []
        for result in response.results:
            doc = result.document
            doc_dict = MessageToDict(doc._pb)
            derived = doc_dict.get("derivedStructData", {})
            title = derived.get("title", derived.get("link", "Document"))
            link = derived.get("link", "")
            snippets = derived.get("snippets", [])
            snippet_texts = [s.get("snippet", "") for s in snippets if s.get("snippet")]
            combined_text = "\n".join(snippet_texts) if snippet_texts else ""
            
            sources.append({
                "title": title,
                "link": link,
                "snippet": combined_text
            })
        
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
            temperature=0.2,
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
    """Build prompt for Gemini."""
    
    if modification == "shorter":
        return f"""You are the Guideline Assistant for media auditors.

CONTEXT:
{context_text}

QUESTION: {query}

Give ONLY:
1. **Verdict**: Flag / Don't Flag / Needs Review
2. **Reason**: One sentence why

**Related Questions**:
- [One relevant follow-up question]

Nothing else. Be direct."""

    elif modification == "more":
        return f"""You are the Guideline Assistant for media auditors who rate content according to guidelines.

CONTEXT:
{context_text}

QUESTION: {query}

Provide a COMPREHENSIVE answer:

1. **Verdict**: Flag / Don't Flag / Needs Review

2. **Explanation**: Detailed reasoning with all relevant guidelines

3. **Edge Cases**: Cover variations and exceptions
   - What if the content is partially visible?
   - What if it's in the background vs focal point?
   - Any size/prominence considerations?

4. **Examples**: Specific examples from guidelines if available

5. **References**: Cite the specific guideline sections

**Related Questions**:
- [Suggest a relevant follow-up question]
- [Suggest another related question about edge cases]
- [Suggest a question about a related guideline topic]

Use bullet points for readability. Be thorough — the auditor wants full context."""

    else:
        # Default: concise, verdict-first
        return f"""You are the Guideline Assistant for media auditors. Your job is to give QUICK, CLEAR answers.

CONTEXT:
{context_text}

QUESTION: {query}

RESPOND IN THIS EXACT FORMAT:

**Verdict**: [Flag / Don't Flag / Needs Review]

**Why**:
- [State the specific guideline rule that applies]
- [Explain how the content violates/complies with that rule]

**Guideline Reference**: [Which guideline section]

**Related Questions**:
- [Suggest a relevant follow-up question the auditor might ask]
- [Suggest another related question about edge cases or variations]
- [Suggest a question about a related guideline topic]

RULES:
- Lead with the verdict — auditors need fast answers
- ALWAYS connect your reasoning to the specific guideline text
- Be CONFIDENT. If guidelines cover a category (e.g., "weapons"), apply it clearly
- Make the logical connection explicit: "The guideline prohibits X, and this content shows Y, therefore..."
- Only say "Needs Review" if the guidelines genuinely don't cover this category
- Keep it under 100 words unless complexity requires more
- Use bullet points, not paragraphs
- The Related Questions should be natural follow-ups an auditor would ask"""


@app.post("/query-stream")
async def query_stream(request: QueryRequest):
    """Stream response for blazing fast perceived latency."""
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    start_time = time.time()

    try:
        logger.info(f"Processing streaming query: {request.query}")

        # Retrieve from Discovery Engine (run in thread pool to avoid blocking)
        retrieval_start = time.time()
        sources = await asyncio.to_thread(retrieve_snippets, request.query)
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
            temperature=0.2,
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
def query(request: QueryRequest):
    """Non-streaming endpoint (fallback for compatibility)."""
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    try:
        logger.info(f"Processing query: {request.query}, modification: {request.modification}")

        # Retrieve from Discovery Engine (fast - no summary)
        sources = retrieve_snippets(request.query)

        # Generate with Gemini
        answer = generate_with_gemini(request.query, sources, request.modification)

        return QueryResponse(answer=answer, sources=sources)

    except Exception as e:
        logger.error(f"Error processing query: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
