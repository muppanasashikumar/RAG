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
- `file` (PDF)
- `chat_id` (optional text, used to append the turn to an existing conversation)

It ingests the PDF, chunks by page text, builds embeddings, stores vectors in ChromaDB, retrieves
top matches, and executes a LangGraph flow (`retrieve_context -> generate_answer`) using an
open-source LLM (default via Ollama) for multilingual answers and grounded reasoning.

Example:

```bash
curl -X POST "http://localhost:8000/api/v1/rag/query" \
  -F "question=Summarize key terms from this document." \
  -F "file=@/absolute/path/to/document.pdf"
```

Environment variables:

- `RAG_UPLOADS_DIR` (default: `uploads`)
- `RAG_VECTOR_DB_DIR` (default: `vector_db`)
- `RAG_COLLECTION_NAME` (default: `documents`)
- `RAG_CHUNK_SIZE` (default: `900`)
- `RAG_CHUNK_OVERLAP` (default: `150`)
- `RAG_TOP_K` (default: `5`)
- `RAG_EMBEDDING_MODEL` (default: `sentence-transformers/all-MiniLM-L6-v2`)
- `RAG_LLM_BASE_URL` (default: `http://localhost:11434`)
- `RAG_LLM_MODEL` (default: `gpt-oss:120b`)
- `RAG_LLM_PROVIDER` (`ollama` or `openai_compatible`, default: `ollama`)
- `RAG_LLM_API_KEY` (only used for `openai_compatible`)
- `RAG_LLM_REASONING_EFFORT` (default: `medium`, for OpenAI-compatible reasoning APIs)

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
SQLite (`vector_db/chat_history.sqlite3`) for infinite-scroll UIs.

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
