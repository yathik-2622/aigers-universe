"""
Unified LLM client for AIger's Universe.
"""
import asyncio
import time

import structlog
from openai import APIError, APITimeoutError, AsyncOpenAI, RateLimitError

from config import settings
from core.runtime_settings import resolve_llm_runtime

logger = structlog.get_logger(__name__)


async def _build_client(user_id: str | None = None) -> tuple[AsyncOpenAI, dict]:
    runtime = await resolve_llm_runtime(user_id)
    client = AsyncOpenAI(
        api_key=runtime["api_key"],
        base_url=runtime["base_url"],
    )
    return client, runtime


async def chat_completion(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.2,
    caller: str = "unknown",
    response_format: dict | None = None,
    max_retries: int = 2,
    user_id: str | None = None,
) -> dict:
    """Execute a chat completion request against the active OpenAI-compatible provider."""
    client, runtime = await _build_client(user_id)
    resolved_model = model or runtime["default_model"] or settings.LLM_MODEL
    start = time.perf_counter()

    logger.debug("llm.chat.request", caller=caller, model=resolved_model, message_count=len(messages), provider=runtime["provider"])

    kwargs: dict = {
        "model": resolved_model,
        "messages": messages,
        "temperature": temperature,
    }
    if response_format:
        kwargs["response_format"] = response_format

    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            response = await client.chat.completions.create(**kwargs)
            latency_ms = round((time.perf_counter() - start) * 1000, 2)
            result = {
                "content": response.choices[0].message.content,
                "tokens_used": response.usage.total_tokens if response.usage else 0,
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                "latency_ms": latency_ms,
                "model": resolved_model,
                "caller": caller,
                "provider": runtime["provider"],
            }
            logger.info(
                "llm.chat.complete",
                caller=caller,
                model=resolved_model,
                provider=runtime["provider"],
                tokens_used=result["tokens_used"],
                latency_ms=latency_ms,
            )
            return result
        except RateLimitError as exc:
            last_exc = exc
            logger.warning("llm.chat.rate_limited", attempt=attempt, caller=caller, provider=runtime["provider"])
            if attempt < max_retries:
                await asyncio.sleep(2 ** attempt)
        except APITimeoutError as exc:
            last_exc = exc
            logger.warning("llm.chat.timeout", attempt=attempt, caller=caller, provider=runtime["provider"])
            if attempt < max_retries:
                await asyncio.sleep(1)
        except APIError as exc:
            logger.error("llm.chat.api_error", caller=caller, provider=runtime["provider"], error=str(exc))
            raise

    logger.error("llm.chat.max_retries_exceeded", caller=caller, provider=runtime["provider"], error=str(last_exc))
    raise last_exc  # type: ignore[misc]


async def get_embedding(text: str, user_id: str | None = None) -> list[float]:
    """Generate an embedding vector, falling back to the configured embedding model."""
    logger.debug("llm.embedding.request", text_length=len(text))
    client, runtime = await _build_client(user_id)
    try:
        truncated = text[:8000]
        response = await client.embeddings.create(
            input=truncated,
            model=runtime["embedding_model"],
        )
        return response.data[0].embedding
    except APIError as exc:
        logger.error("llm.embedding.failed", provider=runtime["provider"], error=str(exc), exc_info=True)
        raise
