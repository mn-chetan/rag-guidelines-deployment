FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
COPY scraper.py .
COPY admin.py .
COPY feedback.py .

# Custom RAG components
COPY embeddings.py .
COPY vector_search.py .
COPY chunk_store.py .
COPY bm25_search.py .
COPY chunker.py .
COPY hybrid_search.py .
COPY retriever.py .

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
