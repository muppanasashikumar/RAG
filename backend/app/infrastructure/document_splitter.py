"""Text splitting adapter (LangChain RecursiveCharacterTextSplitter)."""

from __future__ import annotations

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)


def split_documents(docs: list[Document]) -> list[Document]:
    return _splitter.split_documents(docs)
