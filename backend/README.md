# RAG Backend (FastAPI)

This backend is initialized with FastAPI and managed using `uv`.

## Prerequisites

- Python 3.11+
- `uv` installed ([installation guide](https://docs.astral.sh/uv/getting-started/installation/))

## Setup

From the `backend/` directory:

```bash
uv venv
uv sync
```

## Run locally

```bash
uv run uvicorn app.main:app --reload
```

The API will be available at:

- `http://127.0.0.1:8000`
- Health check: `http://127.0.0.1:8000/health`
- Interactive docs: `http://127.0.0.1:8000/docs`

## Run with Docker

From the `backend/` directory:

```bash
docker build -t rag-backend .
docker run --rm -p 8000:8000 rag-backend
```

Then open:

- `http://127.0.0.1:8000/health`
