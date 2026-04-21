# FastAPI Backend

## Run locally

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Backend is available at [http://localhost:8000](http://localhost:8000) and docs at
[http://localhost:8000/docs](http://localhost:8000/docs).

## RAG endpoint

`POST /api/v1/rag/query` accepts a multipart form with:

- `question` (text)
- `file` (optional document; if omitted, retrieval runs against already indexed docs)
- `chat_id` (optional text, used to append the turn to an existing conversation)

It ingests the PDF, chunks by page text, builds embeddings, stores vectors in MongoDB, retrieves
top matches, and executes a LangGraph flow (`retrieve_context -> generate_answer`) using an
open-source LLM (default via Ollama) for multilingual answers and grounded reasoning.

Example:

```bash
curl -X POST "http://localhost:8000/api/v1/rag/query" \
  -F "question=Summarize key terms from this document." \
  -F "file=@/absolute/path/to/document.pdf"
```

Query only from pre-indexed docs (no new upload):

```bash
curl -X POST "http://localhost:8000/api/v1/rag/query" \
  -F "question=What are the main takeaways across uploaded files?"
```

Batch upload endpoint (Celery background ingestion):

`POST /api/v1/rag/upload-batch` accepts multiple `files` form parts, enqueues one Celery task per
file, and returns task IDs.

```bash
curl -X POST "http://localhost:8000/api/v1/rag/upload-batch" \
  -F "files=@/absolute/path/to/doc1.pdf" \
  -F "files=@/absolute/path/to/doc2.pdf" \
  -F "files=@/absolute/path/to/doc3.pdf"
```

Task status endpoint:

`GET /api/v1/rag/upload-batch/tasks/{task_id}` returns queued/running/success/failure and ingestion
result when ready.

Indexed document manifest endpoint:

`GET /api/v1/rag/documents?limit=100&offset=0` returns indexed docs with chunk counts and
readiness status so UIs can enable retrieval only when uploads are ready.

Environment variables:

- `RAG_CHUNK_SIZE` (default: `900`)
- `RAG_CHUNK_OVERLAP` (default: `150`)
- `RAG_TOP_K` (default: `5`)
- `RAG_EMBEDDING_MODEL` (default: `sentence-transformers/all-MiniLM-L6-v2`)
- `RAG_LLM_BASE_URL` (default: `http://localhost:11434`)
- `RAG_LLM_MODEL` (default: `gpt-oss:120b`)
- `RAG_LLM_PROVIDER` (`ollama` or `openai_compatible`, default: `ollama`)
- `RAG_LLM_API_KEY` (only used for `openai_compatible`)
- `RAG_LLM_REASONING_EFFORT` (default: `medium`, for OpenAI-compatible reasoning APIs)
- `RAG_MONGODB_URI` (example: `mongodb+srv://<user>:<password>@<cluster>/`)
- `RAG_MONGODB_DATABASE` (default: `rag_app`)
- `RAG_MONGODB_USE_VECTOR_SEARCH` (`true`/`false`, default: `false`)
- `RAG_MONGODB_VECTOR_INDEX_NAME` (default: `rag_chunks_vector_index`)
- `RAG_MONGODB_VECTOR_NUM_CANDIDATES` (default: `100`)
- `RAG_CELERY_BROKER_URL` (default: `redis://localhost:6379/0`)
- `RAG_CELERY_RESULT_BACKEND` (default: `redis://localhost:6379/1`)

Run a Celery worker in a separate terminal:

```bash
cd backend
celery -A app.celery_app.celery_app worker --loglevel=info
```

For Grok-style deployments, use `RAG_LLM_PROVIDER=openai_compatible` and point
`RAG_LLM_BASE_URL`/`RAG_LLM_MODEL` to your OpenAI-compatible endpoint.
You can copy `backend/.env.example` to `.env` and set `RAG_LLM_API_KEY`.

For Ollama, if `RAG_LLM_MODEL` is not installed, the backend automatically falls
back to the first locally available model tag from `/api/tags`.

Response now includes:

- `answer`: multilingual answer with citation markers (`[1]`, `[2]`, ...)
- `reasoning`: concise evidence-grounded rationale
- `citations`: page number, pdf link with page anchor, and supporting chunk content

## Recent chats endpoint

`GET /api/v1/rag/chats?limit=20&offset=0` returns paginated recent conversations from
MongoDB (using Beanie ORM models) for infinite-scroll UIs.

Chat history and document chunks are both stored in MongoDB via Beanie models.

If you enable `RAG_MONGODB_USE_VECTOR_SEARCH=true`, create an Atlas Vector Search
index on `rag_chunks.embedding` (dimensions must match your embedding model output).
If the index is unavailable, retrieval automatically falls back to Python-side scoring.

## Lint and format

```bash
cd backend
ruff check .
ruff format .
```

## Docker

Build backend image:

```bash
docker build -t rag-backend ./backend
```

Run backend container:

```bash
docker run --rm -p 8000:8000 rag-backend
```
