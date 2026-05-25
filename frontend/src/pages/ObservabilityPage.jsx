import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, LineChart, Line, ResponsiveContainer,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { Activity, DollarSign, Timer, Trash2, Zap } from 'lucide-react'
import { getMetrics, getTraces } from '../api/observability.js'
import StatusBadge from '../components/common/StatusBadge.jsx'
import { deleteRun } from '../api/workflows.js'

function MetricCard({ label, value, icon: Icon, accent }) {
  return (
    <div className="rounded-xl border border-line bg-panel/60 p-5 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-widest text-muted">{label}</div>
        <div className={`flex h-7 w-7 items-center justify-center rounded-md ${accent}`}><Icon size={14} /></div>
      </div>
      <div className="text-3xl font-display font-semibold tracking-tight">{value}</div>
    </div>
  )
}

const tooltipStyle = {
  contentStyle: { background: '#161623', border: '1px solid #1f1f33', borderRadius: 8, fontFamily: 'JetBrains Mono', fontSize: 12 },
  cursor: { fill: 'rgba(124,92,255,0.06)' },
}

export default function ObservabilityPage() {
  const [metrics, setMetrics] = useState(null)
  const [traces, setTraces] = useState([])
  const [deletingRunId, setDeletingRunId] = useState('')

  const load = async () => {
    try {
      const [nextMetrics, nextTraces] = await Promise.all([getMetrics(), getTraces()])
      setMetrics(nextMetrics)
      setTraces(nextTraces.traces || [])
    } catch {}
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div data-testid="observability-page" className="max-w-[1600px] p-8">
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Total runs" value={metrics?.total_runs ?? 0} icon={Activity} accent="bg-accent/15 text-accent" />
        <MetricCard label="Total tokens" value={(metrics?.total_tokens ?? 0).toLocaleString()} icon={Zap} accent="bg-ok/15 text-ok" />
        <MetricCard label="Avg latency (ms)" value={Math.round(metrics?.avg_latency_ms ?? 0).toLocaleString()} icon={Timer} accent="bg-accent2/15 text-accent2" />
        <MetricCard label="Estimated cost ($)" value={`$${(metrics?.estimated_cost_usd ?? 0).toFixed(4)}`} icon={DollarSign} accent="bg-warn/15 text-warn" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-line bg-panel/60 p-5">
          <div className="mb-1 text-[11px] uppercase tracking-widest text-muted">Token usage by agent</div>
          <div className="mb-4 font-display text-lg">Cost distribution</div>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={metrics?.per_agent || []} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="#1f1f33" strokeDasharray="3 3" />
                <XAxis dataKey="agent_name" stroke="#7c7c95" fontSize={11} tick={{ fontFamily: 'JetBrains Mono' }} />
                <YAxis stroke="#7c7c95" fontSize={11} tick={{ fontFamily: 'JetBrains Mono' }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="estimated_cost_usd" fill="#7c5cff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-panel/60 p-5">
          <div className="mb-1 text-[11px] uppercase tracking-widest text-muted">Avg latency by agent (ms)</div>
          <div className="mb-4 font-display text-lg">Performance</div>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={metrics?.per_agent || []} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="#1f1f33" strokeDasharray="3 3" />
                <XAxis dataKey="agent_name" stroke="#7c7c95" fontSize={11} tick={{ fontFamily: 'JetBrains Mono' }} />
                <YAxis stroke="#7c7c95" fontSize={11} tick={{ fontFamily: 'JetBrains Mono' }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="avg_latency_ms" fill="#22d3ee" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-panel/60 p-5">
          <div className="mb-1 text-[11px] uppercase tracking-widest text-muted">Estimated cost by provider</div>
          <div className="mb-4 font-display text-lg">Provider spend</div>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={metrics?.per_provider_cost || []} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="#1f1f33" strokeDasharray="3 3" />
                <XAxis dataKey="provider" stroke="#7c7c95" fontSize={11} tick={{ fontFamily: 'JetBrains Mono' }} />
                <YAxis stroke="#7c7c95" fontSize={11} tick={{ fontFamily: 'JetBrains Mono' }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="estimated_cost_usd" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-line bg-panel/60 p-5">
        <div className="mb-1 text-[11px] uppercase tracking-widest text-muted">Workflow runs over time</div>
        <div className="mb-4 font-display text-lg">Execution timeline</div>
        <div className="h-[220px]">
          <ResponsiveContainer>
            <LineChart data={metrics?.timeline || []} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#1f1f33" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#7c7c95" fontSize={11} tick={{ fontFamily: 'JetBrains Mono' }} />
              <YAxis stroke="#7c7c95" fontSize={11} tick={{ fontFamily: 'JetBrains Mono' }} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Line type="monotone" dataKey="runs" stroke="#7c5cff" strokeWidth={2.5} dot={{ fill: '#7c5cff', r: 3 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-panel/60">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="font-display text-lg">Recent traces</div>
          <div className="text-[11px] font-mono text-muted">{traces.length} entries</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-elev/40 text-left text-[11px] uppercase tracking-widest text-muted">
                <th className="px-4 py-2.5 font-medium">Agent</th>
                <th className="px-4 py-2.5 font-medium">Provider</th>
                <th className="px-4 py-2.5 font-medium">Model</th>
                <th className="px-4 py-2.5 font-medium">Framework</th>
                <th className="px-4 py-2.5 font-medium">Step</th>
                <th className="px-4 py-2.5 font-medium">Tokens</th>
                <th className="px-4 py-2.5 font-medium">Cost</th>
                <th className="px-4 py-2.5 font-medium">Latency</th>
                <th className="px-4 py-2.5 font-medium">Tools</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Run</th>
                <th className="px-4 py-2.5 font-medium">Delete</th>
              </tr>
            </thead>
            <tbody>
              {traces.length === 0 && (
                <tr><td colSpan={13} className="px-4 py-12 text-center text-muted">No traces yet - execute a workflow.</td></tr>
              )}
              {traces.map((trace, index) => (
                <tr key={index} className="border-t border-line hover:bg-elev/30">
                  <td className="px-4 py-2.5">{trace.agent_name}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted">{trace.provider || 'unknown'}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted">{trace.model_name || 'n/a'}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted">{trace.framework}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px]">{trace.step_number}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px]">{(trace.tokens_used || 0).toLocaleString()}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-warn">{typeof trace.estimated_cost_usd === 'number' ? `$${trace.estimated_cost_usd.toFixed(6)}` : 'n/a'}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px]">{Math.round(trace.latency_ms)}ms</td>
                  <td className="px-4 py-2.5 text-[11px] text-muted">{(trace.tools_called || []).join(', ') || '-'}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={trace.status} /></td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted">{(trace.timestamp || '').slice(11, 19)}</td>
                  <td className="px-4 py-2.5">
                    <Link to={`/runs/${trace.workflow_run_id}`} className="font-mono text-[11px] text-accent hover:underline">{trace.workflow_run_id.slice(0, 8)}...</Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!trace.workflow_run_id || deletingRunId === trace.workflow_run_id) return
                        setDeletingRunId(trace.workflow_run_id)
                        try {
                          await deleteRun(trace.workflow_run_id)
                          await load()
                        } finally {
                          setDeletingRunId('')
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-rose-300/20 bg-rose-300/10 px-3 py-1 text-[11px] text-rose-100 hover:border-rose-300/35 disabled:opacity-50"
                      disabled={!trace.workflow_run_id || deletingRunId === trace.workflow_run_id}
                    >
                      <Trash2 size={11} />
                      {deletingRunId === trace.workflow_run_id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
