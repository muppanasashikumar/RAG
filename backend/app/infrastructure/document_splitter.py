"""Text splitting adapter with hierarchical parent-child chunking."""

from __future__ import annotations

import re

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

_PARENT_SPLITTER = RecursiveCharacterTextSplitter(
    chunk_size=1800,
    chunk_overlap=200,
    separators=["\n## ", "\n### ", "\n[TABLE]\n", "\n\n", "\n", ". ", " ", ""],
)
_CHILD_SPLITTER = RecursiveCharacterTextSplitter(chunk_size=450, chunk_overlap=80)


def _split_into_sections(text: str) -> list[tuple[str | None, str]]:
    normalized = (text or "").strip()
    if not normalized:
        return []
    parts = re.split(r"(?m)^##\s+", normalized)
    if len(parts) <= 1:
        return [(None, normalized)]
    sections: list[tuple[str | None, str]] = []
    prefix = parts[0].strip()
    if prefix:
        sections.append((None, prefix))
    for section in parts[1:]:
        lines = section.splitlines()
        if not lines:
            continue
        title = lines[0].strip() or None
        body = "\n".join(lines[1:]).strip()
        merged = f"## {title}\n{body}".strip() if title else body
        if merged:
            sections.append((title, merged))
    return sections or [(None, normalized)]


def split_documents(docs: list[Document]) -> list[Document]:
    hierarchical_chunks: list[Document] = []
    for doc_index, doc in enumerate(docs):
        section_slices = _split_into_sections(doc.page_content)
        parent_index = 0
        for section_title, section_text in section_slices:
            section_metadata = {**(doc.metadata or {})}
            if section_title:
                section_metadata["section_title"] = section_title
            parent_docs = _PARENT_SPLITTER.split_documents(
                [Document(page_content=section_text, metadata=section_metadata)]
            )
            for parent_doc in parent_docs:
                parent_text = (parent_doc.page_content or "").strip()
                if not parent_text:
                    continue
                parent_id = f"d{doc_index}-p{parent_index}"
                parent_index += 1
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
