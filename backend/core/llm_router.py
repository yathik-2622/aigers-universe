"""
Unified LLM client for AIger's Universe.
ALL LLM calls go through this module via the OpenAI-compatible AI Gateway.
"""
import asyncio
import time
import structlog
from openai import AsyncOpenAI, APIError, APITimeoutError, RateLimitError
from config import settings

logger = structlog.get_logger(__name__)

_client = AsyncOpenAI(
    api_key=settings.LLM_API_KEY,
    base_url=settings.LLM_BASE_URL,
)


async def chat_completion(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.2,
    caller: str = "unknown",
    response_format: dict | None = None,
    max_retries: int = 2,
) -> dict:
    """Execute a chat completion request against the AI Gateway."""
    resolved_model = model or settings.LLM_MODEL
    start = time.perf_counter()

    logger.debug("llm.chat.request", caller=caller, model=resolved_model, message_count=len(messages))

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
            response = await _client.chat.completions.create(**kwargs)
            latency_ms = round((time.perf_counter() - start) * 1000, 2)

            result = {
                "content": response.choices[0].message.content,
                "tokens_used": response.usage.total_tokens if response.usage else 0,
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                "latency_ms": latency_ms,
                "model": resolved_model,
                "caller": caller,
            }
            logger.info(
                "llm.chat.complete",
                caller=caller,
                model=resolved_model,
                tokens_used=result["tokens_used"],
                latency_ms=latency_ms,
            )
            return result

        except RateLimitError as exc:
            last_exc = exc
            logger.warning("llm.chat.rate_limited", attempt=attempt, caller=caller)
            if attempt < max_retries:
                await asyncio.sleep(2 ** attempt)

        except APITimeoutError as exc:
            last_exc = exc
            logger.warning("llm.chat.timeout", attempt=attempt, caller=caller)
            if attempt < max_retries:
                await asyncio.sleep(1)

        except APIError as exc:
            logger.error("llm.chat.api_error", caller=caller, error=str(exc))
            raise

    logger.error("llm.chat.max_retries_exceeded", caller=caller, error=str(last_exc))
    raise last_exc  # type: ignore[misc]


async def get_embedding(text: str) -> list[float]:
    """Generate an embedding vector for the given text via the AI Gateway."""
    logger.debug("llm.embedding.request", text_length=len(text))
    try:
        truncated = text[:8000]
        response = await _client.embeddings.create(
            input=truncated,
            model=settings.EMBEDDING_MODEL,
        )
        return response.data[0].embedding
    except APIError as exc:
        logger.error("llm.embedding.failed", error=str(exc), exc_info=True)
        raise
