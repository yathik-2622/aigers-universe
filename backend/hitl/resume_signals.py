"""
In-process HITL resume signal broker.
Maps hitl_id -> asyncio.Event so the workflow engine can await a human decision
without polling, and approve/reject endpoints can wake it up instantly.
Falls back to MongoDB status polling if the engine is restarted between pause/resume.
"""
import asyncio
import structlog

logger = structlog.get_logger(__name__)

_signals: dict[str, asyncio.Event] = {}
_results: dict[str, dict] = {}


def get_or_create_event(hitl_id: str) -> asyncio.Event:
    """Return the asyncio.Event for a given hitl_id, creating it if needed."""
    if hitl_id not in _signals:
        _signals[hitl_id] = asyncio.Event()
    return _signals[hitl_id]


def signal(hitl_id: str, result: dict) -> None:
    """Set the event and store the result so the waiting coroutine can read it."""
    _results[hitl_id] = result
    event = get_or_create_event(hitl_id)
    event.set()
    logger.info("hitl.signal.set", hitl_id=hitl_id, decision=result.get("decision"))


def get_result(hitl_id: str) -> dict | None:
    """Get the resolution result for a hitl_id (None if not yet signalled)."""
    return _results.get(hitl_id)


def clear(hitl_id: str) -> None:
    """Clear the event and result for a hitl_id."""
    _signals.pop(hitl_id, None)
    _results.pop(hitl_id, None)
