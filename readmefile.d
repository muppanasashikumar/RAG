# RAG Backend - Complete Flow and Functions

This document describes the complete Retrieval-Augmented Generation (RAG) flow implemented in this repository's backend, including all major components and functions.

## 1) High-Level Architecture

The backend uses a layered design:

- API layer: FastAPI routers in `backend/app/api/v1`
- Service layer: business orchestration in `backend/app/services`
- Repository layer: MongoDB/Beanie persistence in `backend/app/repositories`
- Infrastructure layer: model clients, loaders, storage adapters in `backend/app/infrastructure`
- Core wiring: dependency injection and app setup in `backend/app/core` and `backend/app/main.py`

Main runtime capabilities:

1. Document ingestion (upload -> parse -> split -> embed -> index)
2. Retrieval (vector + keyword hybrid + optional rerank)
3. Answer generation (LangChain LLM with structured output + fallback streaming)
4. SSE streaming responses for chat
5. Chat history persistence and replay for conversational context

---

## 2) Startup and Dependency Wiring

### `backend/app/main.py`

- `create_app()`
  - Creates FastAPI app with lifespan
  - Registers CORS for local frontend origins
  - Registers exception handlers
  - Mounts API router at `/api/v1`
- `lifespan()`
  - Configures logging
  - Initializes Mongo collections/indexes via `initialize_collections()`

### `backend/app/core/dependencies.py`

Dependency providers compose the application:

- Infra clients
  - `get_embeddings()`
  - `get_llm()`
  - `get_reranker()`
  - `get_document_storage()` (local or supabase by settings)
- Repositories
  - `get_documents_repository()`
  - `get_vector_repository()`
  - `get_chat_history_repository()`
- Services
  - `get_ingestion_service()`
  - `get_rag_service()`
  - `get_chat_history_service()`

---

## 3) API Endpoints

### Health

- `GET /api/v1/health`
  - File: `backend/app/api/v1/health.py`
  - Returns `{ "status": "ok" }`

### Ingestion

- `POST /api/v1/ingest`
  - File: `backend/app/api/v1/ingest.py`
  - Input: multipart file
  - Output (`IngestResponse`):
    - `file`
    - `chunks_ingested`
    - `document_url`
    - `message`

### Chat / Retrieval

- `POST /api/v1/chat/stream`
  - File: `backend/app/api/v1/chat.py`
  - Input form fields:
    - `query` (required)
    - `file` (optional; used to scope retrieval)
    - `chat_id` (optional; enables memory persistence)
  - Response: Server-Sent Events (`text/event-stream`)
  - Event types emitted:
    - token events: `{ "type": "token", "content": "..." }`
    - citations event: `{ "type": "citations", "citations": [...], "retrieval_mode": "..." }`
    - error events when applicable
    - `[DONE]` terminator

- `GET /api/v1/rag/chats`
  - Lists recent chats
- `GET /api/v1/rag/chats/{chat_id}/messages`
  - Fetches chat messages for a chat session

---

## 4) End-to-End RAG Flow

## A. Ingestion Flow

Orchestrated by `IngestionService.ingest()` in `backend/app/services/ingestion_service.py`.

1. Validate upload
   - Non-empty content
   - Max file size (`_MAX_FILE_SIZE_BYTES`)
   - Sanitized file name (`_sanitize_filename`)

2. Persist raw file
   - Uses `DocumentStorage.save()` through:
     - `LocalDocumentStorage` or
     - `SupabaseDocumentStorage`

3. Parse and split text
   - `load_document(path)` in `infrastructure/document_loader.py`
     - primary parser: `unstructured.partition.auto.partition`
     - fallback for low extracted chars:
       - DOCX XML extraction
       - PDF extraction via `pypdf`
   - `split_documents(docs)` in `infrastructure/document_splitter.py`
     - `RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)`

4. Build embeddings
   - `EmbeddingsClient.embed_documents(texts)` using LangChain HuggingFace embeddings
   - Batched by `_EMBED_BATCH_SIZE`

5. Replace vectors + upsert metadata
   - `VectorRepository.delete_by_file(file)`
   - `VectorRepository.insert_chunks(payload)`
   - `DocumentsRepository.upsert_document(...)`

6. Return result
   - `IngestionResult(file, chunks_ingested, document_url, message)`

---

## B. Query + Retrieval + Generation Flow

Orchestrated by `RagService.stream_answer()` in `backend/app/services/rag_service.py`.

1. Validate query
   - Empty check
   - Max length (`_MAX_QUERY_CHARS`)

2. Retrieve relevant chunks (`_retrieve`)
   - Query embedding: `EmbeddingsClient.embed(query)`
   - Parallel retrieval:
     - `VectorRepository.vector_search(...)`
     - `VectorRepository.keyword_search(...)`
   - Merge rankings via Reciprocal Rank Fusion (`_fuse_rankings`, `_RRF_K`)
   - Optional rerank with cross-encoder (`_rerank_docs`) when enabled
   - Enrich metadata (`_enrich`) with document names/urls from `DocumentsRepository`

3. Build prompt context
   - `_build_context(docs)` creates tagged blocks:
     - `[C1] Source: <name> (page X)`
   - Capped by `_MAX_CONTEXT_CHARS`

4. Include conversational memory
   - `chat_stream()` loads existing messages by `chat_id`
   - `_history_to_messages()` converts them into LangChain `HumanMessage`/`AIMessage`
   - Memory limits:
     - `_MAX_HISTORY_MESSAGES`
     - `_MAX_HISTORY_CHARS`

5. Build final model messages
   - System prompt (`_RAG_SYSTEM_PROMPT`) enforces grounding rules
   - History messages (if any)
   - Current human message with context blocks + question

6. Generate answer
   - Primary path: structured output
     - `LLMClient.invoke_structured(messages, schema=RagStructuredAnswer)`
     - Schema fields:
       - `answer`
       - `grounded_in_context`
       - `confidence`
       - `key_points`
       - `missing_information`
   - Fallback path: token streaming
     - `LLMClient.stream_messages(messages)`

7. Stream response over SSE
   - Emits token event(s)
   - Emits citations event (`_build_citations`)
   - Handles timeout/errors with safe error events

8. Persist chat turn (when `chat_id` exists)
   - `ChatHistoryService.save_turn(...)`
   - Stores:
     - user prompt
     - assistant response text
     - citations
     - retrieval mode

---

## 5) Function Reference by Component

### Infrastructure

#### `infrastructure/llm.py`
- `LLMClient.__init__()` -> initializes LangChain `ChatOpenAI`
- `stream_completion(prompt)` -> stream for single-string prompt
- `stream_messages(messages)` -> chunked token streaming
- `invoke_structured(messages, schema)` -> typed structured invocation using `with_structured_output`

#### `infrastructure/embeddings.py`
- `EmbeddingsClient.embed(text)` -> query embedding
- `EmbeddingsClient.embed_documents(texts)` -> document chunk embeddings

#### `infrastructure/reranker.py`
- `RerankerClient.score(query, texts)` -> cross-encoder rerank scores

#### `infrastructure/document_loader.py`
- `load_document(file_path)` -> unstructured parse + fallback extractors

#### `infrastructure/document_splitter.py`
- `split_documents(docs)` -> recursive chunk splitting

#### `infrastructure/storage.py`
- `DocumentStorage` abstract interface
- `LocalDocumentStorage` local file persistence + URL path
- `SupabaseDocumentStorage` object upload + public URL

---

### Repositories

#### `repositories/vector_repository.py`
- `insert_chunks(payload)` -> bulk insert vectors
- `delete_by_file(file)` -> cleanup prior chunks
- `vector_search(query_embedding, file, limit)` -> Atlas vector search
- `keyword_search(query_text, file, limit)` -> regex/token overlap fallback
- `find_by_file(file)` / `find_all(limit)` -> retrieval helpers

#### `repositories/documents_repository.py`
- `upsert_document(file, document_name, document_url)` -> metadata upsert
- `find_by_file(file)` -> metadata lookup
- `get_stored_document_url(file)` -> URL resolver helper

#### `repositories/chat_history_repository.py`
- `append_turn(...)` -> append user+assistant turn to a chat
- `list_chats(limit, offset)` -> summary list for sidebar/history
- `get_messages(chat_id)` -> full message history for context replay

---

### Services

#### `services/ingestion_service.py`
- `ingest(filename, content)` -> full ingestion orchestration
- `_extract_chunks(...)` -> parse and normalize chunks
- `_build_chunk_payload(...)` -> attach embeddings + metadata
- `_sanitize_filename(...)` -> file-safe naming

#### `services/rag_service.py`
- `stream_answer(query, file, chat_history)` -> complete RAG + SSE event stream payload generation
- `_retrieve(...)` -> hybrid retrieval + rerank + enrich
- `_build_messages(...)` -> system/history/current prompt construction
- `_history_to_messages(...)` -> rolling memory conversion
- `_build_context(...)` -> tagged context blocks with size limits
- `_build_citations(...)` -> citation envelope for frontend
- `_format_structured_answer(...)` -> render structured output for stream display

#### `services/chat_history_service.py`
- `save_turn(...)` -> persist exchange
- `list_chats(...)` -> list summaries
- `get_chat_messages(...)` -> return message history

---

## 6) Data Models (Core)

File: `backend/app/infrastructure/mongo_models.py`

- `StoredDocument` collection: source file metadata
- `VectorChunk` collection: chunk text + vector + metadata
- `ChatHistory` collection: chat session and all messages
- `ChatMessageRecord`: role/content/citations/retrieval mode

File: `backend/app/domain/models.py`

- `IngestionResult`, `RetrievalResult`, `Citation`, etc. for service-level contracts

---

## 7) Streaming Event Contract (Current)

The frontend consumes SSE events as JSON lines:

- Token event:
  - `{ "type": "token", "content": "<text>" }`
- Citations event:
  - `{ "type": "citations", "citations": [...], "retrieval_mode": "hybrid|vector|none" }`
- Error event:
  - `{ "type": "error", "message": "<reason>" }`
- Completion sentinel:
  - `[DONE]`

---

## 8) Production Notes

1. Grounding
   - System prompt is strict: context-only answering with explicit missing info.
2. Structured output
   - Primary generation path is schema-constrained (`RagStructuredAnswer`).
   - Streaming fallback remains available for provider/schema incompatibilities.
3. Retrieval quality
   - Hybrid retrieval + RRF + optional cross-encoder reranking.
4. Memory
   - Rolling chat context is included with bounded size and message count.
5. Safety and resilience
   - Query/context limits, timeout handling, and explicit error events.

