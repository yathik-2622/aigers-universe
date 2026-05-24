"""End-to-end backend tests for AIger's Universe platform."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://e349b436-dd11-41fa-876a-74ae285ee970.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- Health ---
class TestHealth:
    def test_health(self, session):
        r = session.get(f"{API}/health", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"


# --- Marketplace ---
class TestMarketplace:
    def test_list_templates(self, session):
        r = session.get(f"{API}/marketplace/templates", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 5
        names = {t["name"] for t in data["templates"]}
        assert names == {"Document Classifier", "Data Extractor", "Risk Analyzer",
                         "Compliance Checker", "Recommendation Advisor"}
        # compliance has hitl
        comp = next(t for t in data["templates"] if t["name"] == "Compliance Checker")
        assert comp["hitl_enabled"] is True

    def test_install_templates_creates_agents(self, session, request):
        r = session.get(f"{API}/marketplace/templates", timeout=20)
        templates = r.json()["templates"]
        agent_ids = {}
        for tpl in templates:
            tid = tpl["template_id"]
            res = session.post(f"{API}/marketplace/templates/{tid}/install", json={}, timeout=30)
            assert res.status_code in (200, 201), f"install {tid} failed: {res.status_code} {res.text}"
            body = res.json()
            assert "agent_id" in body
            agent_ids[tpl["name"]] = body["agent_id"]
        request.config.cache.set("agent_ids", agent_ids)


# --- Platform: agents + tools ---
class TestPlatform:
    def test_list_agents(self, session, request):
        r = session.get(f"{API}/platform/agents", timeout=20)
        assert r.status_code == 200
        data = r.json()
        agents = data.get("agents", data) if isinstance(data, dict) else data
        assert len(agents) >= 5

    def test_list_tools(self, session):
        r = session.get(f"{API}/platform/tools", timeout=20)
        assert r.status_code == 200
        data = r.json()
        tools = data.get("tools", data) if isinstance(data, dict) else data
        names = {t.get("name") if isinstance(t, dict) else t for t in tools}
        expected = {"semantic_search", "document_store", "rules_engine_check", "risk_scorer", "trigger_hitl"}
        assert expected.issubset(names), f"missing tools: {expected - names}"

    def test_invoke_agent_direct(self, session, request):
        # Get a Data Extractor agent (cheap, deterministic JSON output)
        r = session.get(f"{API}/platform/agents", timeout=20)
        data = r.json()
        agents = data.get("agents", data) if isinstance(data, dict) else data
        extractor = next((a for a in agents if "Data Extractor" in a.get("name", "")), None)
        assert extractor is not None, "Data Extractor agent missing"
        aid = extractor.get("agent_id") or extractor.get("id")
        payload = {"input_data": {"text": "Invoice #INV-2024-001 dated 2024-03-15 for $1,250.00 to Acme Corp."}}
        res = session.post(f"{API}/platform/agents/{aid}/invoke", json=payload, timeout=90)
        assert res.status_code == 200, res.text
        body = res.json()
        assert "output" in body
        assert "tokens_used" in body
        assert "latency_ms" in body
        assert body["tokens_used"] > 0
        request.config.cache.set("invoke_test_agent_id", aid)


# --- Document upload + Mongo vector search ---
class TestDocument:
    def test_upload_txt(self, session, request):
        content = ("This is a sample compliance document. " * 50).encode()
        files = {"file": ("test_doc.txt", content, "text/plain")}
        # Use a fresh session without JSON content-type
        r = requests.post(f"{API}/documents/upload", files=files, timeout=120)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        body = r.json()
        assert "document_id" in body
        assert body.get("chunk_count", 0) > 0
        assert body.get("vectors_indexed", 0) > 0
        request.config.cache.set("document_id", body["document_id"])


# --- Workflows ---
class TestWorkflow:
    def _get_agents_by_name(self, session):
        r = session.get(f"{API}/platform/agents", timeout=20)
        data = r.json()
        agents = data.get("agents", data) if isinstance(data, dict) else data
        return {a.get("name"): (a.get("agent_id") or a.get("id")) for a in agents}

    def test_create_and_run_workflow(self, session, request):
        agents = self._get_agents_by_name(session)
        # 2-agent simple pipeline: Document Classifier -> Data Extractor
        classifier = agents.get("Document Classifier")
        extractor = agents.get("Data Extractor")
        assert classifier and extractor, f"agents missing: {agents}"
        wf_payload = {
            "name": "TEST_classify_then_extract",
            "description": "Test workflow",
            "agents": [classifier, extractor],
        }
        r = session.post(f"{API}/workflows", json=wf_payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        wf = r.json()
        wf_id = wf.get("workflow_id") or wf.get("id")
        assert wf_id

        run_payload = {"input_data": {"text": "This is a service contract between Acme Corp and Beta LLC dated 2024-01-15 for $50,000."}}
        r2 = session.post(f"{API}/workflows/{wf_id}/run", json=run_payload, timeout=30)
        assert r2.status_code in (200, 201, 202), r2.text
        run = r2.json()
        run_id = run.get("run_id") or run.get("id")
        assert run_id
        request.config.cache.set("run_id", run_id)

        # poll for completion
        final_status = None
        agent_results = None
        a2a_messages = None
        for _ in range(40):
            time.sleep(3)
            rr = session.get(f"{API}/workflows/runs/{run_id}", timeout=20)
            assert rr.status_code == 200
            body = rr.json()
            final_status = body.get("status")
            agent_results = body.get("agent_results")
            a2a_messages = body.get("a2a_messages")
            if final_status in ("completed", "failed", "paused"):
                break
        assert final_status == "completed", f"final status: {final_status}, body: {body}"
        assert agent_results, "agent_results empty"
        assert a2a_messages and len(a2a_messages) > 0, "a2a messages should be persisted"


# --- Observability ---
class TestObservability:
    def test_metrics(self, session):
        r = session.get(f"{API}/observability/metrics", timeout=20)
        assert r.status_code == 200
        data = r.json()
        for key in ("total_runs", "total_tokens"):
            assert key in data, f"missing {key} in metrics"

    def test_traces(self, session):
        r = session.get(f"{API}/observability/traces", timeout=20)
        assert r.status_code == 200
        data = r.json()
        traces = data.get("traces", data) if isinstance(data, dict) else data
        assert isinstance(traces, list)
        # If workflow ran, should have at least one trace
        if traces:
            t = traces[0]
            assert "agent_name" in t or "agent_id" in t
            assert "tokens_used" in t or "tokens" in t


# --- HITL endpoints (functional, regardless of LLM behaviour) ---
class TestHITL:
    def test_hitl_pending_endpoint(self, session):
        r = session.get(f"{API}/hitl/pending", timeout=20)
        assert r.status_code == 200
        data = r.json()
        # should be a list-like structure
        records = data.get("pending", data.get("records", data)) if isinstance(data, dict) else data
        assert isinstance(records, list)

    def test_hitl_approve_reject_nonexistent(self, session):
        # approving non-existent should return 404 or similar error
        r = session.post(f"{API}/hitl/nonexistent_id/approve", json={"comment": "test"}, timeout=20)
        assert r.status_code in (400, 404, 422), f"unexpected: {r.status_code} {r.text}"
