from __future__ import annotations

import json

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate
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

    def _build_llm_client(self) -> ChatOpenAI:
        if self.settings.llm_provider != "openai_compatible":
            raise ValueError(
                "Unsupported RAG_LLM_PROVIDER. Use 'openai_compatible' for GPT-OSS models."
            )
        return ChatOpenAI(
            model=self.active_llm_model,
            base_url=f"{self.settings.llm_base_url.rstrip('/')}/v1",
            api_key=self.settings.llm_api_key or "dummy-key",
            timeout=self.settings.llm_timeout_seconds,
            temperature=0.2,
            model_kwargs={"reasoning": {"effort": self.settings.llm_reasoning_effort}},
        )

    def _build_output_parser(self) -> PydanticOutputParser:
        return PydanticOutputParser(pydantic_object=LLMAnswer)

    def _build_structured_chain(self, llm: ChatOpenAI, parser: PydanticOutputParser):
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
        text = content.strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:].strip()
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
