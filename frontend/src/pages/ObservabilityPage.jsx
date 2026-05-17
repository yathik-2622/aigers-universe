import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, LineChart, Line, ResponsiveContainer,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { Activity, DollarSign, Zap, Timer } from 'lucide-react'
import { getMetrics, getTraces } from '../api/observability.js'
import StatusBadge from '../components/common/StatusBadge.jsx'

function MetricCard({ label, value, icon: Icon, accent }) {
  return (
    <div className="rounded-xl border border-line bg-panel/60 backdrop-blur p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-widest text-muted">{label}</div>
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${accent}`}><Icon size={14} /></div>
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

  const load = async () => {
    try {
      const [m, t] = await Promise.all([getMetrics(), getTraces()])
      setMetrics(m); setTraces(t.traces || [])
    } catch {}
  }
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [])

  return (
    <div data-testid="observability-page" className="p-8 max-w-[1500px]">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total runs"           value={metrics?.total_runs ?? 0}                                     icon={Activity} accent="bg-accent/15 text-accent" />
        <MetricCard label="Total tokens"         value={(metrics?.total_tokens ?? 0).toLocaleString()}                icon={Zap}      accent="bg-ok/15 text-ok" />
        <MetricCard label="Avg latency (ms)"     value={Math.round(metrics?.avg_latency_ms ?? 0).toLocaleString()}    icon={Timer}    accent="bg-accent2/15 text-accent2" />
        <MetricCard label="Estimated cost ($)"   value={`$${(metrics?.estimated_cost_usd ?? 0).toFixed(4)}`}          icon={DollarSign} accent="bg-warn/15 text-warn" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border border-line bg-panel/60 p-5">
          <div className="text-[11px] uppercase tracking-widest text-muted mb-1">Token usage by agent</div>
          <div className="font-display text-lg mb-4">Cost distribution</div>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={metrics?.per_agent || []} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="#1f1f33" strokeDasharray="3 3" />
                <XAxis dataKey="agent_name" stroke="#7c7c95" fontSize={11} tick={{ fontFamily: 'JetBrains Mono' }} />
                <YAxis stroke="#7c7c95" fontSize={11} tick={{ fontFamily: 'JetBrains Mono' }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="tokens" fill="#7c5cff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-panel/60 p-5">
          <div className="text-[11px] uppercase tracking-widest text-muted mb-1">Avg latency by agent (ms)</div>
          <div className="font-display text-lg mb-4">Performance</div>
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
      </div>

      <div className="rounded-xl border border-line bg-panel/60 p-5 mb-6">
        <div className="text-[11px] uppercase tracking-widest text-muted mb-1">Workflow runs over time</div>
        <div className="font-display text-lg mb-4">Execution timeline</div>
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

      <div className="rounded-xl border border-line bg-panel/60 overflow-hidden">
        <div className="px-5 py-3 border-b border-line flex items-center justify-between">
          <div className="font-display text-lg">Recent traces</div>
          <div className="text-[11px] font-mono text-muted">{traces.length} entries</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted bg-elev/40">
                <th className="px-4 py-2.5 font-medium">Agent</th>
                <th className="px-4 py-2.5 font-medium">Framework</th>
                <th className="px-4 py-2.5 font-medium">Step</th>
                <th className="px-4 py-2.5 font-medium">Tokens</th>
                <th className="px-4 py-2.5 font-medium">Latency</th>
                <th className="px-4 py-2.5 font-medium">Tools</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Run</th>
              </tr>
            </thead>
            <tbody>
              {traces.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-muted">No traces yet — execute a workflow.</td></tr>
              )}
              {traces.map((t, i) => (
                <tr key={i} className="border-t border-line hover:bg-elev/30">
                  <td className="px-4 py-2.5">{t.agent_name}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted">{t.framework}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px]">{t.step_number}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px]">{(t.tokens_used || 0).toLocaleString()}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px]">{Math.round(t.latency_ms)}ms</td>
                  <td className="px-4 py-2.5 text-[11px] text-muted">{(t.tools_called || []).join(', ') || '—'}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted">{(t.timestamp || '').slice(11, 19)}</td>
                  <td className="px-4 py-2.5">
                    <Link to={`/runs/${t.workflow_run_id}`} className="text-accent text-[11px] hover:underline font-mono">{t.workflow_run_id.slice(0, 8)}…</Link>
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
