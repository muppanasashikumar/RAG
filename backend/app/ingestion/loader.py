from unstructured.partition.auto import partition


def load_document(file_path: str) -> list[dict]:
    elements = partition(filename=file_path)
    records: list[dict] = []
    for element in elements:
        text = str(element).strip()
        if not text:
            continue

        metadata = getattr(element, "metadata", None)
        page_number = getattr(metadata, "page_number", None) if metadata else None
        records.append(
            {
                "text": text,
                "page_number": page_number if isinstance(page_number, int) else None,
            }
        )
    return records