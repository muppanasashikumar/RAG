"""Document loading adapter (Unstructured)."""

from __future__ import annotations

import zipfile
from pathlib import Path
from xml.etree import ElementTree

from langchain_core.documents import Document
from pypdf import PdfReader
from unstructured.partition.auto import partition

_MIN_EXTRACTED_CHARS = 200


def _from_unstructured(file_path: str) -> list[Document]:
    elements = partition(filename=file_path)
    records: list[Document] = []
    for element in elements:
        text = str(element).strip()
        if not text:
            continue

        metadata = getattr(element, "metadata", None)
        page_number = getattr(metadata, "page_number", None) if metadata else None
        records.append(
            Document(
                page_content=text,
                metadata={
                    "page_number": page_number if isinstance(page_number, int) else None
                },
            )
        )
    return records


def _extract_docx_text(file_path: str) -> list[Document]:
    try:
        with zipfile.ZipFile(file_path) as archive:
            xml_bytes = archive.read("word/document.xml")
    except Exception:
        return []
    root = ElementTree.fromstring(xml_bytes)
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    texts = [node.text for node in root.findall(".//w:t", namespace) if node.text]
    merged = "\n".join(chunk.strip() for chunk in texts if chunk.strip()).strip()
    if not merged:
        return []
    return [Document(page_content=merged, metadata={"page_number": None})]


def _extract_pdf_text(file_path: str) -> list[Document]:
    try:
        reader = PdfReader(file_path)
    except Exception:
        return []
    records: list[Document] = []
    for page_index, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if not text:
            continue
        records.append(Document(page_content=text, metadata={"page_number": page_index}))
    return records


def load_document(file_path: str) -> list[Document]:
    records = _from_unstructured(file_path)
    extracted_chars = sum(len(item.page_content) for item in records)
    if extracted_chars >= _MIN_EXTRACTED_CHARS:
        return records

    suffix = Path(file_path).suffix.lower()
    if suffix == ".docx":
        fallback = _extract_docx_text(file_path)
        if fallback:
            return fallback
    if suffix == ".pdf":
        fallback = _extract_pdf_text(file_path)
        if fallback:
            return fallback
    return records
