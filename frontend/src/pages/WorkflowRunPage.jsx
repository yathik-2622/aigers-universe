import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ReactFlowProvider } from 'reactflow'
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, FileText, LoaderCircle, MessageSquare, PauseCircle, Radio, RefreshCcw, Square } from 'lucide-react'
import { toast } from 'sonner'
import MarkdownReport from '../components/common/MarkdownReport.jsx'
import ModalShell from '../components/common/ModalShell.jsx'
import StatusBadge from '../components/common/StatusBadge.jsx'
import WorkflowCanvas from '../components/flow/WorkflowCanvas.jsx'
import { getRun, getRunReport, pauseRun, resumeRun, stopRun } from '../api/workflows.js'
import { useTitle } from '../context/TitleContext.jsx'

export default function WorkflowRunPage() {
  const { runId } = useParams()
  const { setOverride } = useTitle()
  const [run, setRun] = useState(null)
  const [report, setReport] = useState(null)
  const [showReport, setShowReport] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [pausePending, setPausePending] = useState(false)
  const [stopPending, setStopPending] = useState(false)
  const [activeCitation, setActiveCitation] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [expandedMessageId, setExpandedMessageId] = useState('')
  const [focusedNodeId, setFocusedNodeId] = useState('')
  const [latestA2AMessageId, setLatestA2AMessageId] = useState('')
  const a2aScrollRef = React.useRef(null)
  const prevA2ACountRef = React.useRef(0)

  const applyRunState = (incoming) => {
    setRun((prev) => {
      const prevMessages = prev?.a2a_messages || []
      const nextMessages = incoming?.a2a_messages || prevMessages
      return { ...(prev || {}), ...(incoming || {}), a2a_messages: nextMessages }
    })
    const derived = deriveReportFromRun(incoming)
    if (derived) setReport((prev) => prev || derived)
  }

  const formatDuration = (ms) => {
    if (!Number.isFinite(ms) || ms < 0) return 'n/a'
    const totalSeconds = Math.round(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    if (hours) return `${hours}h ${minutes}m`
    if (minutes) return `${minutes}m ${seconds}s`
    return `${seconds}s`
  }

  const deriveReportFromRun = (runDoc) => {
    if (!runDoc) return null
    if (!runDoc.report_markdown && !runDoc.final_output && !runDoc.report_structured) return null
    return {
      run_id: runDoc.run_id,
      status: runDoc.status,
      report: runDoc.final_output || {},
      outputs_by_agent: runDoc.outputs_by_agent || {},
      markdown: runDoc.report_markdown || '# Workflow report\n\nReport is still being finalized. Structured output is available.',
      structured: runDoc.report_structured || {},
      pii_findings: runDoc.pii_findings || [],
      citations: runDoc.citations || [],
      failure_reason: runDoc.failure_reason,
    }
  }

  useEffect(() => {
    if (run?.workflow_name) {
      setOverride({ title: run.workflow_name, subtitle: `Run ${runId.slice(0, 8)} | status: ${run.status}` })
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
          applyRunState(data)
          if (['completed', 'failed'].includes(data.status)) {
            try {
              setReportLoading(true)
              setReport(await getRunReport(runId))
            } catch {}
            finally {
              setReportLoading(false)
            }
            return
          }
        } catch {}
        pollTimer = setTimeout(tick, 3000)
      }
      tick()
    }

    try {
      es = new EventSource(streamUrl)
      es.onopen = () => {
        if (!cancelled) setStreaming(true)
      }
      es.onmessage = (ev) => {
        if (cancelled) return
        try {
          const data = JSON.parse(ev.data)
          applyRunState(data)
        } catch {}
      }
      es.addEventListener('run_snapshot', (ev) => {
        if (cancelled) return
        try {
          applyRunState(JSON.parse(ev.data))
        } catch {}
      })
      es.addEventListener('run_update', (ev) => {
        if (cancelled) return
        try {
          applyRunState(JSON.parse(ev.data))
        } catch {}
      })
      es.addEventListener('a2a_message', (ev) => {
        if (cancelled) return
        try {
          const message = JSON.parse(ev.data)
          setRun((prev) => {
            if (!prev) return prev
            const current = prev.a2a_messages || []
            if (current.some((item) => item.message_id === message.message_id)) return prev
            return { ...prev, a2a_messages: [...current, message] }
          })
        } catch {}
      })
      es.addEventListener('a2a_reset', (ev) => {
        if (cancelled) return
        try {
          const messages = JSON.parse(ev.data)
          setRun((prev) => (prev ? { ...prev, a2a_messages: messages } : prev))
        } catch {}
      })
      es.addEventListener('end', async () => {
        if (cancelled) return
        try {
          setReportLoading(true)
          setReport(await getRunReport(runId))
        } catch {}
        finally {
          setReportLoading(false)
        }
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

  useEffect(() => {
    if (!run || !['completed', 'failed'].includes(run.status)) return
    let cancelled = false
    let timer = null
    let attempts = 0

    const fetchReport = async () => {
      if (cancelled) return
      attempts += 1
      try {
        setReportLoading(true)
        const data = await getRunReport(runId)
        if (!cancelled) setReport(data)
        return
      } catch {
        const derived = deriveReportFromRun(run)
        if (derived && !cancelled) setReport((prev) => prev || derived)
        if (!cancelled && attempts < 18) timer = setTimeout(fetchReport, 5000)
      } finally {
        if (!cancelled) setReportLoading(false)
      }
    }

    fetchReport()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [run?.status, run?.report_markdown, runId])

  const nodes = (run?.agents || []).map((a, idx) => {
    const result = (run?.agent_results || []).find((r) => r.agent_id === a.agent_id)
    let status = 'pending'
    if (run?.status === 'paused' && run?.current_step === idx) status = 'paused'
    else if (run?.current_step === idx && ['running', 'resuming'].includes(run?.status)) status = 'running'
    else if (result) status = result.status === 'success' ? 'completed' : 'failed'
    const outPreview = result?.output ? `${JSON.stringify(result.output).slice(0, 60)}...` : ''
    return {
      id: `step_${idx}`,
      type: 'agent',
      position: { x: 60 + idx * 300, y: 120 + (idx % 2) * 24 },
      data: { name: a.agent_name, framework: a.framework || 'langgraph', runStatus: status, output_preview: outPreview, tools: [] },
    }
  })

  const edges = nodes.slice(0, -1).map((n, i) => ({
    id: `e_${i}`,
    source: n.id,
    target: `step_${i + 1}`,
    animated: ['running', 'resuming'].includes(run?.status) && run?.current_step === i + 1,
  }))

  useEffect(() => {
    if (!nodes.length) return
    if (run?.status === 'paused' && typeof run?.current_step === 'number' && nodes[run.current_step]) {
      setFocusedNodeId(nodes[run.current_step].id)
      return
    }
    if (['running', 'resuming'].includes(run?.status) && typeof run?.current_step === 'number' && nodes[run.current_step]) {
      setFocusedNodeId(nodes[run.current_step].id)
      return
    }
    if (['completed', 'failed'].includes(run?.status) && nodes.length) {
      setFocusedNodeId(nodes[nodes.length - 1].id)
    }
  }, [run?.status, run?.current_step, nodes.length])

  useEffect(() => {
    const messages = run?.a2a_messages || []
    const count = messages.length
    const previous = prevA2ACountRef.current
    if (count > previous) {
      const latest = messages[messages.length - 1]
      if (latest?.message_id) {
        setLatestA2AMessageId(latest.message_id)
        setExpandedMessageId(latest.message_id)
      }
      if (a2aScrollRef.current) {
        a2aScrollRef.current.scrollTop = a2aScrollRef.current.scrollHeight
      }
    }
    prevA2ACountRef.current = count
  }, [run?.a2a_messages])

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

  const manualPause = async () => {
    setPausePending(true)
    try {
      await pauseRun(runId)
      toast.success('Pause requested. Current agent will finish before pausing.')
      setRun(await getRun(runId))
    } catch {
      toast.error('Pause request failed')
    } finally {
      setPausePending(false)
    }
  }

  const manualStop = async () => {
    setStopPending(true)
    try {
      await stopRun(runId)
      toast.success(run?.status === 'paused' ? 'Workflow stopped' : 'Stop requested. Current agent will finish before stopping.')
      setRun(await getRun(runId))
    } catch {
      toast.error('Stop request failed')
    } finally {
      setStopPending(false)
    }
  }

  const control = run?.control || {}
  const canPause = run && ['running', 'resuming'].includes(run.status) && !control.pause_requested && !control.stop_requested
  const canStop = run && ['running', 'resuming', 'paused'].includes(run.status) && !control.stop_requested
  const canResume = run && ['paused', 'failed', 'stopped'].includes(run.status)
  const resumeLabel = run?.status === 'stopped' ? 'Start' : 'Resume'
  const timing = run?.timing || {}
  const activeEstimate = timing.agent_estimates?.find((item) => item.step_number === run?.current_step)

  return (
    <div data-testid="run-page" className="flex h-full bg-[radial-gradient(circle_at_top,rgba(92,225,230,0.08),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-6 py-4 border-b border-line bg-panel/55 backdrop-blur flex items-center justify-between gap-3 flex-wrap">
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
            {canPause && (
              <button onClick={manualPause} disabled={pausePending} className="px-3 py-1.5 rounded-md border border-line bg-panel/80 text-sm hover:border-warn/40 inline-flex items-center gap-1.5 disabled:opacity-50">
                <PauseCircle size={13} /> {pausePending ? 'Requesting pause...' : 'Pause'}
              </button>
            )}
            {canStop && (
              <button onClick={manualStop} disabled={stopPending} className="px-3 py-1.5 rounded-md border border-bad/30 bg-bad/10 text-bad text-sm hover:opacity-90 inline-flex items-center gap-1.5 disabled:opacity-50">
                <Square size={13} /> {stopPending ? 'Stopping...' : 'Stop'}
              </button>
            )}
            {canResume && (
              <button onClick={manualResume} disabled={resuming} className="px-3 py-1.5 rounded-md border border-line bg-panel/80 text-sm hover:border-accent/40 inline-flex items-center gap-1.5 disabled:opacity-50">
                <RefreshCcw size={13} /> {resuming ? `${resumeLabel === 'Start' ? 'Starting' : 'Resuming'}...` : resumeLabel}
              </button>
            )}
            {report && (
              <button data-testid="view-report-btn" onClick={() => setShowReport(true)} className="px-3 py-1.5 rounded-md bg-accent text-white text-sm font-medium hover:opacity-90 inline-flex items-center gap-1.5">
                <FileText size={13} /> View report
              </button>
            )}
            {!report && run && ['completed', 'failed'].includes(run.status) && (
              <div className="px-3 py-1.5 rounded-md border border-accent/20 bg-accent/10 text-accent text-sm inline-flex items-center gap-1.5">
                <LoaderCircle size={13} className="animate-spin" /> {reportLoading ? 'Preparing report...' : 'Finalizing report...'}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-3 border-b border-line/70 bg-panel/35 flex items-center gap-3 flex-wrap text-xs text-muted">
          <span>Elapsed: <span className="text-ink font-medium">{formatDuration(timing.elapsed_ms)}</span></span>
          <span>Estimated total: <span className="text-ink font-medium">{formatDuration(timing.estimated_total_ms)}</span></span>
          <span>Remaining: <span className="text-ink font-medium">{formatDuration(timing.estimated_remaining_ms)}</span></span>
          {activeEstimate && (
            <span>Current agent ETA: <span className="text-ink font-medium">{formatDuration(activeEstimate.avg_latency_ms)}</span></span>
          )}
          {control.pause_requested && <span className="rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-warn">pause queued</span>}
          {control.stop_requested && <span className="rounded-full border border-bad/30 bg-bad/10 px-2 py-0.5 text-bad">stop queued</span>}
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
            <Link to={`/hitl?returnTo=${encodeURIComponent(`/runs/${runId}`)}`} data-testid="goto-hitl-btn" className="px-3 py-1.5 rounded-md bg-warn text-bg text-sm font-medium hover:opacity-90">Go to HITL panel</Link>
          </div>
        )}

        <div className="flex-1 relative min-w-0">
          <ReactFlowProvider>
            <WorkflowCanvas initialNodes={nodes} initialEdges={edges} activeNodeId={focusedNodeId} readOnly />
          </ReactFlowProvider>
        </div>
      </div>

      <aside className="w-[380px] shrink-0 border-l border-line bg-panel/55 backdrop-blur flex flex-col">
        <div className="px-4 py-3 border-b border-line">
          <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Execution estimates</div>
          <div className="space-y-2">
            {(timing.agent_estimates || []).map((item) => (
              <div key={item.step_number} className={`rounded-lg border px-3 py-2 ${item.step_number === run?.current_step ? 'border-accent/35 bg-accent/10' : 'border-line bg-elev/30'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-medium truncate">{item.agent_name}</div>
                  <div className="text-[10px] font-mono text-muted">avg {formatDuration(item.avg_latency_ms)}</div>
                </div>
                <div className="text-[10px] font-mono text-muted mt-1">
                  {item.actual_latency_ms != null ? `actual ${formatDuration(item.actual_latency_ms)}` : `${item.samples} historical sample${item.samples === 1 ? '' : 's'}`}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-4 py-3 border-b border-line flex items-center gap-2">
          <MessageSquare size={14} className="text-accent" />
          <div className="text-sm font-display font-semibold">A2A Message Log</div>
          <span className="text-[10px] font-mono text-muted ml-auto">{(run?.a2a_messages || []).length}</span>
        </div>
        <div ref={a2aScrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
          {(run?.a2a_messages || []).length === 0 && <div className="text-center text-muted text-sm py-10">No messages yet.</div>}
          {(run?.a2a_messages || []).map((message) => (
            <button
              key={message.message_id}
              type="button"
              onClick={() => setExpandedMessageId((prev) => (prev === message.message_id ? '' : message.message_id))}
              className={`w-full p-3 rounded-xl border text-left transition ${
                latestA2AMessageId === message.message_id
                  ? 'border-accent/35 bg-accent/10'
                  : 'border-line bg-elev/40 hover:border-accent/30'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wide mb-1.5">
                <span className="text-accent truncate">{message.from_agent}</span>
                <span className="text-muted">to</span>
                <span className="text-accent2 truncate">{message.to_agent}</span>
                <span className="ml-auto text-muted">{message.message_type}</span>
                {latestA2AMessageId === message.message_id && <span className="text-accent animate-pulse">live</span>}
                {expandedMessageId === message.message_id ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
              </div>
              <pre className={`text-[11px] font-mono text-muted whitespace-pre-wrap break-all ${expandedMessageId === message.message_id ? '' : 'line-clamp-4'}`}>{JSON.stringify(message.payload, null, 2)}</pre>
              <div className="text-[10px] font-mono text-muted mt-1.5">{(message.timestamp || '').slice(11, 19)}</div>
            </button>
          ))}
        </div>
      </aside>

      <ModalShell open={showReport && !!report} onClose={() => setShowReport(false)} title={run?.workflow_name || 'Workflow report'} subtitle="Final output, citations, and governance findings." width="max-w-4xl">
        <div className="p-6 bg-[radial-gradient(circle_at_top,rgba(92,225,230,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]">
          {report?.failure_reason && <div className="mb-4 p-3 rounded-lg border border-bad/30 bg-bad/10 text-bad text-sm">{report.failure_reason}</div>}
          {report ? <MarkdownReport markdown={report.markdown || '# Report unavailable'} /> : <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-muted">Preparing report...</div>}
          {report?.pii_findings?.length > 0 && (
            <div className="mt-6">
              <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Detected PII redlines</div>
              <div className="space-y-2">
                {report.pii_findings.map((item, idx) => (
                  <div key={idx} className="rounded-lg border border-line bg-elev/40 p-3 text-sm">
                    <div className="font-medium">Line {item.line_number} | {item.type || item.issue}</div>
                    {item.original_text && <div className="text-muted mt-1">Original: {item.original_text}</div>}
                    {item.redacted_text && <div className="text-accent mt-1">Suggested redline: {item.redacted_text}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {report?.citations?.length > 0 && (
            <div className="mt-6">
              <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Citations</div>
              <div className="flex flex-wrap gap-2">
                {report.citations.map((citation, idx) => (
                  <button key={idx} onClick={() => setActiveCitation(citation)} className="px-3 py-1.5 rounded-full border border-accent/30 bg-accent/10 text-accent text-xs hover:opacity-90">
                    {citation.label || `Citation ${idx + 1}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </ModalShell>

      {activeCitation && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-6" onClick={() => setActiveCitation(null)}>
          <div className="w-full max-w-xl rounded-xl border border-line bg-panel p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-display text-lg">{activeCitation.label || 'Citation'}</div>
              <button onClick={() => setActiveCitation(null)} className="text-muted hover:text-ink text-sm">Close</button>
            </div>
            <div className="text-sm text-muted leading-relaxed whitespace-pre-wrap">{activeCitation.excerpt || 'No excerpt provided.'}</div>
            <div className="mt-4 text-[12px] text-muted">Source: {activeCitation.source_type || 'reference'} {activeCitation.source_ref ? `| ${activeCitation.source_ref}` : ''}</div>
          </div>
        </div>
      )}
    </div>
  )
}
