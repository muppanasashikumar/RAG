from openai import OpenAI
from app.core.config import settings

client = OpenAI(
    api_key=settings.OPENAI_API_KEY,
    base_url=settings.OPENAI_BASE_URL,
)


def _build_prompt(context, query):
    prompt = f"""
    Answer using the context.

    Context:
    {context}

    Question:
    {query}
    """
    return prompt


def stream_answer(context, query):
    prompt = _build_prompt(context, query)
    response = client.chat.completions.create(
        model=settings.LLM_MODEL,
        messages=[{"role": "user", "content": prompt}],
        stream=True,
    )
    for chunk in response:
        choice = chunk.choices[0] if chunk.choices else None
        delta = choice.delta.content if choice and choice.delta else None
        if delta:
            yield delta