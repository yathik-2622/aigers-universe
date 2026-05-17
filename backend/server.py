"""
Supervisor entrypoint shim.
Re-exports the FastAPI app from main.py so uvicorn server:app works
under the Emergent supervisor configuration (port 8001).
"""
from main import app  # noqa: F401
