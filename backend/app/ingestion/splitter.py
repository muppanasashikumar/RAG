from langchain_text_splitters import RecursiveCharacterTextSplitter


splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200
)


def split_documents(docs: list[dict]) -> list[dict]:
    chunks: list[dict] = []
    for doc in docs:
        text = (doc.get("text") or "").strip()
        if not text:
            continue
        page_number = doc.get("page_number")
        for chunk in splitter.split_text(text):
            normalized = chunk.strip()
            if not normalized:
                continue
            chunks.append(
                {
                    "text": normalized,
                    "page_number": page_number if isinstance(page_number, int) else None,
                }
            )
    return chunks