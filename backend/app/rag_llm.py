from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from app.rag_settings import RAGSettings

SYSTEM_PROMPT = (
    "You are a production-grade multilingual RAG assistant. "
    "Use only the provided context when answering. "
    "Always answer in the same language as the user question. "
    "If the answer is not in context, clearly say you do not "
    "have enough information."
)


class LLMAnswer(BaseModel):
    answer: str
    reasoning: str


class RAGLLMEngine:
    def __init__(self, settings: RAGSettings) -> None:
        self.settings = settings
        self.active_llm_model = settings.llm_model

    async def ask(self, question: str, context: str) -> dict[str, str]:
        llm = self._build_llm_client()
        parser = self._build_output_parser()
        chain = self._build_structured_chain(llm, parser)
        try:
            response = await chain.ainvoke(
                {
                    "question": question,
                    "context": context,
                    "format_instructions": parser.get_format_instructions(),
                }
            )
            return {"answer": response.answer, "reasoning": response.reasoning}
        except Exception as exc:
            fallback_messages = self._build_fallback_messages(question=question, context=context)
            try:
                raw = await llm.ainvoke(fallback_messages)
            except Exception:
                raise RuntimeError("LLM call failed for configured provider.") from exc
            return self._parse_json_answer(str(raw.content).strip())

    def _build_llm_client(self) -> ChatOpenAI | ChatOllama:
        if self.settings.llm_provider == "openai_compatible":
            return ChatOpenAI(
                model=self.active_llm_model,
                base_url=f"{self.settings.llm_base_url.rstrip('/')}/v1",
                api_key=self.settings.llm_api_key or "dummy-key",
                timeout=self.settings.llm_timeout_seconds,
                temperature=0.2,
                model_kwargs={"reasoning": {"effort": self.settings.llm_reasoning_effort}},
            )
        if self.settings.llm_provider == "ollama":
            return ChatOllama(
                model=self.active_llm_model,
                base_url=self.settings.llm_base_url.rstrip("/"),
                temperature=0.2,
                timeout=self.settings.llm_timeout_seconds,
            )
        raise ValueError("Unsupported RAG_LLM_PROVIDER. Use 'openai_compatible' or 'ollama'.")

    def _build_output_parser(self) -> PydanticOutputParser:
        return PydanticOutputParser(pydantic_object=LLMAnswer)

    def _build_structured_chain(
        self, llm: ChatOpenAI | ChatOllama, parser: PydanticOutputParser
    ):
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", f"{SYSTEM_PROMPT}\n{{format_instructions}}"),
                (
                    "human",
                    (
                        "Question:\n{question}\n\n"
                        "Context snippets with citation IDs:\n{context}\n\n"
                        "Use citation markers like [1], [2] in the answer."
                    ),
                ),
            ]
        )
        return prompt | llm | parser

    def _build_fallback_messages(self, question: str, context: str) -> list[object]:
        return [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(
                content=(
                    f"Question:\n{question}\n\n"
                    f"Context snippets with citation IDs:\n{context}\n\n"
                    "Return strict JSON with keys: answer, reasoning.\n"
                    "- answer: concise response with citation markers like [1], [2].\n"
                    "- reasoning: short evidence-grounded explanation (3-6 "
                    "lines) based only on provided citations."
                )
            ),
        ]

    def _parse_json_answer(self, content: str) -> dict[str, str]:
        text = self._normalize_model_output(content)
        try:
            body = json.loads(text)
            answer = str(body.get("answer", "")).strip()
            reasoning = str(body.get("reasoning", "")).strip()
            if answer:
                return {
                    "answer": answer,
                    "reasoning": reasoning or "Reasoning not provided by model.",
                }
        except json.JSONDecodeError:
            pass
        return {
            "answer": content,
            "reasoning": "Model returned non-JSON output; reasoning unavailable.",
        }

    def _normalize_model_output(self, content: str) -> str:
        text = content.strip()
        candidate = self._extract_text_from_structured_payload(text)
        if candidate:
            text = candidate

        fenced_json = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL | re.IGNORECASE)
        if fenced_json:
            return fenced_json.group(1).strip()

        first_brace = text.find("{")
        last_brace = text.rfind("}")
        if first_brace != -1 and last_brace != -1 and first_brace < last_brace:
            return text[first_brace : last_brace + 1].strip()
        return text

    def _extract_text_from_structured_payload(self, text: str) -> str | None:
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            return None

        if not isinstance(payload, list):
            return None

        for item in payload:
            if not isinstance(item, dict):
                continue
            if item.get("type") != "text":
                continue
            text_value = item.get("text")
            if isinstance(text_value, str) and text_value.strip():
                return text_value.strip()
            content_blocks = item.get("content")
            if isinstance(content_blocks, list):
                for block in content_blocks:
                    if not isinstance(block, dict):
                        continue
                    if block.get("type") != "output_text":
                        continue
                    block_text = block.get("text")
                    if isinstance(block_text, str) and block_text.strip():
                        return block_text.strip()
        return None
