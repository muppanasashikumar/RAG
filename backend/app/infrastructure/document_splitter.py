"""Text splitting adapter with hierarchical parent-child chunking."""

from __future__ import annotations

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

_PARENT_SPLITTER = RecursiveCharacterTextSplitter(chunk_size=1800, chunk_overlap=200)
_CHILD_SPLITTER = RecursiveCharacterTextSplitter(chunk_size=450, chunk_overlap=80)


def split_documents(docs: list[Document]) -> list[Document]:
    hierarchical_chunks: list[Document] = []
    for doc_index, doc in enumerate(docs):
        parent_docs = _PARENT_SPLITTER.split_documents([doc])
        for parent_index, parent_doc in enumerate(parent_docs):
            parent_text = (parent_doc.page_content or "").strip()
            if not parent_text:
                continue
            parent_id = f"d{doc_index}-p{parent_index}"
            parent_metadata = {
                **(parent_doc.metadata or {}),
                "chunk_level": "parent",
                "chunk_id": parent_id,
            }
            child_docs = _CHILD_SPLITTER.split_documents(
                [Document(page_content=parent_text, metadata=parent_metadata)]
            )
            if not child_docs:
                hierarchical_chunks.append(
                    Document(page_content=parent_text, metadata=parent_metadata)
                )
                continue
            for child_index, child_doc in enumerate(child_docs):
                child_text = (child_doc.page_content or "").strip()
                if not child_text:
                    continue
                child_id = f"{parent_id}-c{child_index}"
                hierarchical_chunks.append(
                    Document(
                        page_content=child_text,
                        metadata={
                            **(child_doc.metadata or {}),
                            "chunk_level": "child",
                            "chunk_id": child_id,
                            "parent_id": parent_id,
                            "parent_text": parent_text,
                        },
                    )
                )
    return hierarchical_chunks
