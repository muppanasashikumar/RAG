"""LLM client.

Wraps a LangChain chat model used for streaming completions.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from typing import TypeVar

from langchain_core.messages import BaseMessage, HumanMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from app.core.config import settings

StructuredModelT = TypeVar("StructuredModelT", bound=BaseModel)


class LLMClient:
    def __init__(self, api_key: str, base_url: str, model: str) -> None:
        self._client = ChatOpenAI(
            model=model,
            api_key=api_key,
            base_url=base_url,
            temperature=0,
        )

    def stream_completion(self, prompt: str) -> Iterator[str]:
        yield from self.stream_messages([HumanMessage(content=prompt)])

    def stream_messages(self, messages: list[BaseMessage]) -> Iterator[str]:
        for chunk in self._client.stream(messages):
            yield from self._extract_text(chunk.content)

    async def astream_messages(self, messages: list[BaseMessage]) -> AsyncIterator[str]:
        async for chunk in self._client.astream(messages):
            for text in self._extract_text(chunk.content):
                yield text

    def invoke_structured(
        self,
        messages: list[BaseMessage],
        *,
        schema: type[StructuredModelT],
    ) -> StructuredModelT:
        structured_llm = self._client.with_structured_output(schema)
        return structured_llm.invoke(messages)

    async def ainvoke_structured(
        self,
        messages: list[BaseMessage],
        *,
        schema: type[StructuredModelT],
    ) -> StructuredModelT:
        structured_llm = self._client.with_structured_output(schema)
        return await structured_llm.ainvoke(messages)

    @staticmethod
    def _extract_text(content: object) -> Iterator[str]:
        if isinstance(content, str):
            if content:
                yield content
            return

        # Some providers emit structured content blocks; collect text entries.
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    text = item.get("text")
                    if isinstance(text, str) and text:
                        yield text


_instance: LLMClient | None = None


def get_llm_client() -> LLMClient:
    global _instance
    if _instance is None:
        _instance = LLMClient(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
            model=settings.LLM_MODEL,
        )
    return _instance
