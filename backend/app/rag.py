from __future__ import annotations

from typing import Any

import chromadb
from fastapi import UploadFile
from langgraph.graph import END, START, StateGraph
from sentence_transformers import SentenceTransformer

from app.rag_ingestion import RAGIngestionEngine
from app.rag_llm import RAGLLMEngine
from app.rag_retrieval import RAGRetrievalEngine
from app.rag_settings import RAGSettings, RAGState


class RAGService:
    def __init__(self, settings: RAGSettings) -> None:
        self.settings = settings
        self.settings.uploads_dir.mkdir(parents=True, exist_ok=True)
        self.settings.db_dir.mkdir(parents=True, exist_ok=True)

        self.embedder = SentenceTransformer(self.settings.embedding_model)
        self.chroma_client = chromadb.PersistentClient(path=str(self.settings.db_dir))
        self.collection = self.chroma_client.get_or_create_collection(
            name=self.settings.collection_name,
            metadata={"hnsw:space": "cosine"},
        )
        self.ingestion_engine = RAGIngestionEngine(
            settings=self.settings,
            embedder=self.embedder,
            collection=self.collection,
        )
        self.retrieval_engine = RAGRetrievalEngine(
            settings=self.settings,
            embedder=self.embedder,
            collection=self.collection,
        )
        self.llm_engine = RAGLLMEngine(settings=self.settings)
        self.query_graph = self._build_query_graph()

    async def ingest_document(self, file: UploadFile) -> dict[str, Any]:
        return await self.ingestion_engine.ingest_document(file=file)

    async def query(self, question: str, document_id: str | None = None) -> dict[str, Any]:
        graph_state = await self.query_graph.ainvoke(
            {"question": question, "document_id": document_id}
        )
        reasoning_steps = self._build_reasoning_steps(
            question=question,
            citations=graph_state["citations"],
            llm_reasoning=graph_state["reasoning"],
        )
        return {
            "answer": graph_state["answer"],
            "reasoning": graph_state["reasoning"],
            "citations": graph_state["citations"],
            "reasoning_steps": reasoning_steps,
        }

    def _build_query_graph(self):
        graph = StateGraph(RAGState)
        graph.add_node("retrieve_context", self._retrieve_context_node)
        graph.add_node("generate_answer", self._generate_answer_node)
        graph.add_edge(START, "retrieve_context")
        graph.add_edge("retrieve_context", "generate_answer")
        graph.add_edge("generate_answer", END)
        return graph.compile()

    async def _retrieve_context_node(self, state: RAGState) -> RAGState:
        context, citations = await self.retrieval_engine.retrieve_context(
            question=state["question"],
            document_id=state.get("document_id"),
        )
        return {"context": context, "citations": citations}

    async def _generate_answer_node(self, state: RAGState) -> RAGState:
        result = await self.llm_engine.ask(question=state["question"], context=state["context"])
        return {"answer": result["answer"], "reasoning": result["reasoning"]}

    def _build_reasoning_steps(
        self,
        question: str,
        citations: list[dict[str, Any]],
        llm_reasoning: str,
    ) -> list[dict[str, Any]]:
        unique_pages = sorted({citation["page_number"] for citation in citations})
        page_summary = ", ".join(str(page) for page in unique_pages) if unique_pages else "none"
        return [
            {
                "step": 1,
                "title": "Question received",
                "detail": f"Captured your prompt and prepared retrieval query: '{question}'.",
            },
            {
                "step": 2,
                "title": "Document chunks searched",
                "detail": (
                    "Ran hybrid retrieval (dense + keyword + lexical scoring) over indexed "
                    "chunks in the uploaded document."
                ),
            },
            {
                "step": 3,
                "title": "Evidence ranked",
                "detail": (
                    f"Selected top {len(citations)} citation chunks from pages: {page_summary}."
                ),
            },
            {
                "step": 4,
                "title": "Answer synthesized",
                "detail": llm_reasoning or "Generated final answer grounded only in retrieved citations.",
            },
        ]
