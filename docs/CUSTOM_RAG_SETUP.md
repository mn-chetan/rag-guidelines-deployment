# Custom RAG Setup Guide

This guide walks you through setting up the custom hybrid RAG system to replace Discovery Engine.

## Overview

The custom RAG system uses:
- **Vertex AI Vector Search** for semantic similarity search
- **BM25** for keyword-based search
- **Reciprocal Rank Fusion (RRF)** to merge results
- **Cloud Storage** for chunk metadata and BM25 index persistence

## Prerequisites

- GCP Project with billing enabled
- `gcloud` CLI authenticated
- Existing Cloud Run deployment
- Cloud Storage bucket: `rag-guidelines-v2`

## Step 1: Enable Required APIs

```bash
gcloud services enable aiplatform.googleapis.com
```

## Step 2: Create Vector Search Infrastructure

Run the setup script to create the index and endpoint:

```bash
cd backend/scripts

python setup_vector_search.py \
  --project-id=rag-for-guidelines \
  --location=us-central1
```

This will:
1. Create a Vector Search index (768 dimensions for text-embedding-004)
2. Create a Vector Search endpoint
3. Deploy the index to the endpoint

**Important:** Save the output IDs! You'll need them for environment variables.

Expected output:
```
✓ Created index: projects/.../indexes/1234567890
  Index ID: 1234567890

✓ Created endpoint: projects/.../indexEndpoints/9876543210
  Endpoint ID: 9876543210

✓ Deployed index: guidelines_deployed
```

## Step 3: Set Environment Variables

Update your Cloud Run service with the new environment variables:

```bash
gcloud run services update auditor-rag-api \
  --region=us-central1 \
  --set-env-vars="USE_CUSTOM_RAG=false,VECTOR_SEARCH_INDEX_ID=YOUR_INDEX_ID,VECTOR_SEARCH_ENDPOINT_ID=YOUR_ENDPOINT_ID,VECTOR_SEARCH_DEPLOYED_INDEX_ID=guidelines_deployed"
```

**Note:** We set `USE_CUSTOM_RAG=false` initially. We'll enable it after indexing.

## Step 4: Deploy Updated Backend

Deploy the new code with custom RAG components:

```bash
cd backend

gcloud run deploy auditor-rag-api \
  --source . \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated
```

## Step 5: Initial Indexing

Run the initial indexing script to populate the custom RAG with your existing documents:

```bash
# Set environment variables
export PROJECT_ID=rag-for-guidelines
export GCS_BUCKET=rag-guidelines-v2
export VECTOR_SEARCH_INDEX_ID=YOUR_INDEX_ID
export VECTOR_SEARCH_ENDPOINT_ID=YOUR_ENDPOINT_ID
export LOCATION=us-central1

# Run indexing
cd backend
python scripts/initial_index.py
```

This will:
1. Load all managed URLs from your configuration
2. Scrape each URL (or load from GCS if already scraped)
3. Chunk the content semantically
4. Generate embeddings
5. Upload to Vector Search
6. Build BM25 index
7. Store chunk metadata in GCS

Expected output:
```
[1/10] Processing: Image Asset Guidelines
  URL: https://example.com/guidelines
  Scraping...
  Indexing...
  ✓ Created 45 chunks

...

✓ Indexing complete!
Total chunks created: 450
```

## Step 6: Enable Custom RAG

Once indexing is complete, enable custom RAG in production:

```bash
gcloud run services update auditor-rag-api \
  --region=us-central1 \
  --set-env-vars="USE_CUSTOM_RAG=true"
```

## Step 7: Verify

Test the system:

```bash
# Check RAG stats
curl https://your-backend-url/admin/rag/stats

# Test a query
curl -X POST https://your-backend-url/query-stream \
  -H "Content-Type: application/json" \
  -d '{"query": "Can I show alcohol in images?"}'
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cloud Run (Backend)                       │
├─────────────────────────────────────────────────────────────────┤
│  Query                                                           │
│    │                                                             │
│    ▼                                                             │
│  [Hybrid Search Manager]                                         │
│    │                                                             │
│    ├──────────────────────┬─────────────────────────┐           │
│    ▼                      ▼                         ▼           │
│  ┌────────────┐    ┌─────────────┐    ┌──────────────────┐     │
│  │ Vertex AI  │    │ BM25 Index  │    │ Vertex AI        │     │
│  │ Embeddings │    │ (from GCS)  │    │ Vector Search    │     │
│  │ API        │    │             │    │ (Matching Engine)│     │
│  └────────────┘    └─────────────┘    └──────────────────┘     │
│         │                 │                    │                 │
│         └─────────────────┴────────────────────┘                │
│                           │                                      │
│                           ▼                                      │
│                    [RRF Merge + Rerank]                         │
│                           │                                      │
│                           ▼                                      │
│                    Top K Chunks                                  │
│                           │                                      │
│                           ▼                                      │
│                    [Gemini Generation]                           │
└─────────────────────────────────────────────────────────────────┘
```

## GCS Bucket Structure

```
gs://rag-guidelines-v2/
├── scraped/              # Existing - raw HTML files
├── chunks/               # NEW - chunked documents as JSON
│   └── chunks.json       # All chunks with embeddings
├── indexes/              # NEW - search indexes
│   └── bm25_index.json   # BM25 index data
└── config/               # Existing - configuration files
```

## Cost Estimates

### Vertex AI Vector Search
- **Endpoint**: ~$0.50/hour with 1 replica (e2-standard-2)
- **Monthly**: ~$360/month for always-on endpoint
- **Optimization**: Set min_replica_count=0 for dev (cold starts)

### Embeddings API
- **Cost**: ~$0.0001 per 1000 tokens
- **Initial indexing**: ~$0.50 for 500 documents
- **Ongoing**: ~$0.01 per new document

### Cloud Storage
- **Chunks + Index**: ~$0.01/month (minimal)

### Total Estimated Cost
- **Development**: ~$1/month (scale-to-zero endpoint)
- **Production**: ~$360/month (always-on endpoint)

## Maintenance

### Adding New Documents

Documents are automatically indexed when added via the admin portal or `/index-url` endpoint.

### Reindexing All Documents

Trigger a full reindex via the admin API:

```bash
curl -X POST https://your-backend-url/admin/rag/reindex
```

Or programmatically from the admin portal.

### Monitoring

Check index statistics:

```bash
curl https://your-backend-url/admin/rag/stats
```

Returns:
```json
{
  "enabled": true,
  "initialized": true,
  "stats": {
    "chunk_store": {
      "total_chunks": 450,
      "unique_sources": 10
    },
    "bm25": {
      "total_documents": 450
    },
    "vector_search": {
      "index_id": "1234567890"
    }
  }
}
```

## Rollback

To instantly revert to Discovery Engine:

```bash
gcloud run services update auditor-rag-api \
  --region=us-central1 \
  --set-env-vars="USE_CUSTOM_RAG=false"
```

The system will automatically fall back to Discovery Engine for all queries.

## Troubleshooting

### "Custom RAG not initialized" error

**Cause:** Vector Search credentials or IDs are incorrect.

**Solution:** 
1. Check environment variables are set correctly
2. Verify index and endpoint IDs
3. Check Cloud Run logs for initialization errors

### Slow first query (cold start)

**Cause:** Vector Search endpoint scaled to zero.

**Solution:** Set `min_replica_count=1` in the endpoint configuration for production.

### Embeddings API quota exceeded

**Cause:** Too many embedding requests.

**Solution:**
1. Reduce batch size in `embeddings.py`
2. Request quota increase in GCP Console
3. Use caching (already implemented)

### BM25 index not updating

**Cause:** GCS write permissions issue.

**Solution:** Verify Cloud Run service account has Storage Object Admin role.

## Advanced Configuration

### Tuning Chunk Size

Edit `backend/retriever.py`:

```python
self.chunker = GuidelineChunker(
    target_chunk_size=1000,  # Adjust this
    max_chunk_size=1500,     # And this
    overlap=100              # And this
)
```

### Tuning Hybrid Search Weights

Edit `backend/retriever.py`:

```python
self.hybrid_search = HybridSearchManager(
    # ...
    vector_weight=0.6,  # Increase for more semantic search
    bm25_weight=0.4,    # Increase for more keyword search
    rrf_k=60            # RRF constant (lower = more aggressive fusion)
)
```

### Changing Embedding Model

Edit `backend/embeddings.py`:

```python
self.model_name = "text-embedding-004"  # Change to newer model
self.embedding_dim = 768                # Update dimension
```

## Support

For issues or questions:
1. Check Cloud Run logs: `gcloud run logs read auditor-rag-api`
2. Check Vector Search console: GCP Console > Vertex AI > Vector Search
3. Review this documentation

## Next Steps

After successful setup:
1. Monitor query latency and quality
2. Compare results with Discovery Engine
3. Tune chunk sizes and search weights
4. Consider cost optimizations for your usage pattern
