"""Chat history service."""

from __future__ import annotations

from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.infrastructure.llm import LLMClient
from app.repositories.chat_history_repository import ChatHistoryRepository


class ChatTitlePayload(BaseModel):
    title: str = Field(description="A concise chat title, 3-7 words, plain text only.")


class ChatHistoryService:
    def __init__(self, *, repository: ChatHistoryRepository, llm: LLMClient) -> None:
        self._repository = repository
        self._llm = llm

    async def generate_title(self, *, chat_id: str, user_content: str) -> str:
        history = await self._repository.get_recent_user_messages(chat_id, limit=5)
        prompt_messages = history + ([user_content.strip()] if user_content.strip() else [])
        if not prompt_messages:
            return "Untitled document chat"
        transcript = "\n".join(
            f"{index}. {content.strip()}"
            for index, content in enumerate(prompt_messages[-6:], start=1)
            if content.strip()
        )
        if not transcript:
            return "Untitled document chat"
        try:
            result = await self._llm.ainvoke_structured(
                [
                    SystemMessage(
                        content=(
                            "You generate chat titles. Return a short, specific title that summarizes "
                            "the user's topic across messages. Rules: 3-7 words, title case, no quotes, "
                            "no punctuation except hyphen, avoid generic wording."
                        )
                    ),
                    HumanMessage(content=f"User messages:\n{transcript}\n\nReturn only the title."),
                ],
                schema=ChatTitlePayload,
            )
            title = " ".join((result.title or "").split()).strip()
            if title:
                return title[:80]
        except Exception:
            pass
        fallback = user_content.strip() or (history[-1] if history else "")
        fallback = fallback.strip()
        if not fallback:
            return "Untitled document chat"
        return fallback[:64].rstrip()

    async def save_turn(
        self,
        *,
        chat_id: str,
        title: str,
        source: str,
        user_content: str,
        assistant_content: str,
        citations: list[dict[str, Any]],
        retrieval_mode: str | None,
    ) -> str | None:
        return await self._repository.append_turn(
            chat_id=chat_id,
            title=title,
            source=source,
            user_content=user_content,
            assistant_content=assistant_content,
            citations=citations,
            retrieval_mode=retrieval_mode,
        )

    async def list_chats(self, *, limit: int, offset: int) -> list[dict[str, Any]]:
        return await self._repository.list_chats(limit=limit, offset=offset)

    async def get_chat_messages(self, *, chat_id: str) -> list[dict[str, Any]]:
        return await self._repository.get_messages(chat_id)

    async def set_message_feedback(
        self,
        *,
        chat_id: str,
        message_id: str,
        feedback: str | None,
    ) -> bool:
        return await self._repository.set_message_feedback(
            chat_id=chat_id,
            message_id=message_id,
            feedback=feedback,
        )

    async def increment_message_action(
        self,
        *,
        chat_id: str,
        message_id: str,
        action: str,
    ) -> bool:
        return await self._repository.increment_message_action(
            chat_id=chat_id,
            message_id=message_id,
            action=action,
        )
