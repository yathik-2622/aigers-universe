import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ReactFlowProvider } from 'reactflow'
import { ArrowLeft, FileText, MessageSquare, AlertTriangle, RefreshCcw, Radio } from 'lucide-react'
import { toast } from 'sonner'
import MarkdownReport from '../components/common/MarkdownReport.jsx'
import StatusBadge from '../components/common/StatusBadge.jsx'
import WorkflowCanvas from '../components/flow/WorkflowCanvas.jsx'
import { getRun, getRunReport, resumeRun } from '../api/workflows.js'
import { useTitle } from '../context/TitleContext.jsx'

export default function WorkflowRunPage() {
  const { runId } = useParams()
  const { setOverride } = useTitle()
  const [run, setRun] = useState(null)
  const [report, setReport] = useState(null)
  const [showReport, setShowReport] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [resuming, setResuming] = useState(false)

  useEffect(() => {
    if (run?.workflow_name) {
      setOverride({ title: run.workflow_name, subtitle: `Run ${runId.slice(0, 8)} · status: ${run.status}` })
    }
    return () => setOverride(null)
  }, [run?.workflow_name, run?.status, runId, setOverride])

  useEffect(() => {
    let cancelled = false
    let pollTimer = null
    const baseUrl = import.meta.env.VITE_REACT_APP_BACKEND_URL || ''
    const streamUrl = `${baseUrl}/api/workflows/runs/${runId}/stream`
    let es

    const startPolling = () => {
      if (pollTimer) return
      const tick = async () => {
        if (cancelled) return
        try {
          const data = await getRun(runId)
          setRun(data)
          if (['completed', 'failed'].includes(data.status)) {
            try { setReport(await getRunReport(runId)) } catch {}
            return
          }
        } catch {}
        pollTimer = setTimeout(tick, 3000)
      }
      tick()
    }

    try {
      es = new EventSource(streamUrl)
      es.onopen = () => { if (!cancelled) setStreaming(true) }
      es.onmessage = (ev) => {
        if (cancelled) return
        try { setRun(JSON.parse(ev.data)) } catch {}
      }
      es.addEventListener('end', async () => {
        if (cancelled) return
        try { setReport(await getRunReport(runId)) } catch {}
        es.close()
        setStreaming(false)
      })
      es.onerror = () => {
        if (cancelled) return
        setStreaming(false)
        try { es.close() } catch {}
        startPolling()
      }
    } catch {
      startPolling()
    }

    return () => {
      cancelled = true
      if (es) try { es.close() } catch {}
      if (pollTimer) clearTimeout(pollTimer)
    }
  }, [runId])

  const nodes = (run?.agents || []).map((a, idx) => {
    const result = (run?.agent_results || []).find(r => r.agent_id === a.agent_id)
    let status = 'pending'
    if (run?.status === 'paused' && run?.current_step === idx) status = 'paused'
    else if (run?.current_step === idx && ['running', 'resuming'].includes(run?.status)) status = 'running'
    else if (result) status = result.status === 'success' ? 'completed' : 'failed'
    const outPreview = result?.output ? `${JSON.stringify(result.output).slice(0, 60)}...` : ''
    return {
      id: `step_${idx}`,
      type: 'agent',
      position: { x: 60 + idx * 290, y: 120 },
      data: { name: a.agent_name, framework: 'langgraph', runStatus: status, output_preview: outPreview, tools: [] },
    }
  })

  const edges = nodes.slice(0, -1).map((n, i) => ({
    id: `e_${i}`,
    source: n.id,
    target: `step_${i + 1}`,
    animated: ['running', 'resuming'].includes(run?.status) && run?.current_step === i + 1,
  }))

  const manualResume = async () => {
    setResuming(true)
    try {
      await resumeRun(runId)
      toast.success('Workflow resume triggered')
      setRun(await getRun(runId))
    } catch {
      toast.error('Resume failed')
    } finally {
      setResuming(false)
    }
  }

  return (
    <div data-testid="run-page" className="flex h-[calc(100vh-77px)]">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-6 py-3 border-b border-line bg-panel/40 backdrop-blur flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/observability" className="text-muted hover:text-ink"><ArrowLeft size={16} /></Link>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{run?.workflow_name || '...'}</div>
              <div className="text-[11px] font-mono text-muted truncate">{runId}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {streaming && <span data-testid="sse-indicator" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-widest bg-accent/10 border border-accent/30 text-accent"><Radio size={10} className="animate-pulse" /> live</span>}
            {run && <StatusBadge status={run.status} />}
            {run && ['paused', 'failed', 'resuming'].includes(run.status) && (
              <button onClick={manualResume} disabled={resuming} className="px-3 py-1.5 rounded-md border border-line bg-panel/80 text-sm hover:border-accent/40 inline-flex items-center gap-1.5 disabled:opacity-50">
                <RefreshCcw size={13} /> {resuming ? 'Resuming...' : 'Resume'}
              </button>
            )}
            {report && (
              <button data-testid="view-report-btn" onClick={() => setShowReport(true)} className="px-3 py-1.5 rounded-md bg-accent text-white text-sm font-medium hover:opacity-90 inline-flex items-center gap-1.5">
                <FileText size={13} /> View report
              </button>
            )}
          </div>
        </div>

        {run?.status === 'paused' && (
          <div className="mx-6 mt-3 p-3 rounded-lg border border-warn/40 bg-warn/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={16} className="text-warn" />
              <div>
                <div className="text-sm font-medium text-warn">Human review required</div>
                <div className="text-[12px] text-muted">An agent triggered a HITL gate. Approve it, then resume if the previous process stopped.</div>
              </div>
            </div>
            <Link to="/hitl" data-testid="goto-hitl-btn" className="px-3 py-1.5 rounded-md bg-warn text-bg text-sm font-medium hover:opacity-90">Go to HITL panel</Link>
          </div>
        )}

        <div className="flex-1 relative">
          <ReactFlowProvider>
            <WorkflowCanvas initialNodes={nodes} initialEdges={edges} readOnly />
          </ReactFlowProvider>
        </div>
      </div>

      <aside className="w-[360px] shrink-0 border-l border-line bg-panel/50 backdrop-blur flex flex-col">
        <div className="px-4 py-3 border-b border-line flex items-center gap-2">
          <MessageSquare size={14} className="text-accent" />
          <div className="text-sm font-display font-semibold">A2A Message Log</div>
          <span className="text-[10px] font-mono text-muted ml-auto">{(run?.a2a_messages || []).length}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {(run?.a2a_messages || []).length === 0 && <div className="text-center text-muted text-sm py-10">No messages yet.</div>}
          {(run?.a2a_messages || []).map(m => (
            <div key={m.message_id} className="p-2.5 rounded-lg border border-line bg-elev/40">
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wide mb-1.5">
                <span className="text-accent">{m.from_agent}</span>
                <span className="text-muted">to</span>
                <span className="text-accent2">{m.to_agent}</span>
                <span className="ml-auto text-muted">{m.message_type}</span>
              </div>
              <pre className="text-[11px] font-mono text-muted whitespace-pre-wrap break-all line-clamp-4">{JSON.stringify(m.payload, null, 2)}</pre>
              <div className="text-[10px] font-mono text-muted mt-1.5">{(m.timestamp || '').slice(11, 19)}</div>
            </div>
          ))}
        </div>
      </aside>

      {showReport && report && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-6" onClick={() => setShowReport(false)}>
          <div className="w-full max-w-4xl max-h-[84vh] rounded-xl border border-line bg-panel flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-widest text-muted">Workflow report</div>
                <div className="font-display text-lg">{run?.workflow_name}</div>
              </div>
              <button onClick={() => setShowReport(false)} className="text-muted hover:text-ink text-sm">Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {report.failure_reason && <div className="mb-4 p-3 rounded-lg border border-bad/30 bg-bad/10 text-bad text-sm">{report.failure_reason}</div>}
              <MarkdownReport markdown={report.markdown || '# Report unavailable'} />
              {report.pii_findings?.length > 0 && (
                <div className="mt-6">
                  <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Detected PII redlines</div>
                  <div className="space-y-2">
                    {report.pii_findings.map((item, idx) => (
                      <div key={idx} className="rounded-lg border border-line bg-elev/40 p-3 text-sm">
                        <div className="font-medium">Line {item.line_number} · {item.type || item.issue}</div>
                        {item.original_text && <div className="text-muted mt-1">Original: {item.original_text}</div>}
                        {item.redacted_text && <div className="text-accent mt-1">Suggested redline: {item.redacted_text}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
