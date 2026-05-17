import React, { memo } from 'react'
import { Handle, Position } from 'reactflow'
import { Cpu, ShieldCheck, Wrench, Loader2, CheckCircle2, AlertOctagon, PauseCircle } from 'lucide-react'
import StatusBadge from '../common/StatusBadge.jsx'
import FrameworkBadge from '../common/FrameworkBadge.jsx'

function StatusIcon({ status }) {
  if (status === 'running') return <Loader2 size={14} className="text-accent animate-spin" />
  if (status === 'completed' || status === 'success') return <CheckCircle2 size={14} className="text-ok" />
  if (status === 'paused') return <PauseCircle size={14} className="text-warn" />
  if (status === 'failed') return <AlertOctagon size={14} className="text-bad" />
  return null
}

function AgentNodeComponent({ data, selected }) {
  const status = data?.runStatus
  const stateRing =
    status === 'running' ? 'border-accent shadow-glow glow-pulse'
    : status === 'completed' || status === 'success' ? 'border-ok/60'
    : status === 'paused' ? 'border-warn/60'
    : status === 'failed' ? 'border-bad/60'
    : selected ? 'border-accent/60'
    : 'border-line'

  return (
    <div
      data-testid={`agent-node-${data?.agent_id || data?.name}`}
      className={`relative w-[230px] rounded-xl bg-elev/95 backdrop-blur border ${stateRing} transition-all`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="px-3.5 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-md bg-accent/15 border border-accent/30 flex items-center justify-center">
              <Cpu size={13} className="text-accent" />
            </div>
            <div className="text-[13px] font-semibold tracking-tight truncate">{data?.name || 'Agent'}</div>
          </div>
          {status && <StatusIcon status={status} />}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <FrameworkBadge framework={data?.framework || 'langgraph'} />
          {data?.hitl_enabled && (
            <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded border border-warn/30 text-warn bg-warn/10 inline-flex items-center gap-1">
              <ShieldCheck size={9} /> HITL
            </span>
          )}
          {Array.isArray(data?.tools) && data.tools.length > 0 && (
            <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded border border-line text-muted inline-flex items-center gap-1">
              <Wrench size={9} /> {data.tools.length}
            </span>
          )}
        </div>
        {data?.output_preview && (
          <div className="mt-2 pt-2 border-t border-line text-[10px] text-muted font-mono line-clamp-2">
            {data.output_preview}
          </div>
        )}
        {status && (
          <div className="mt-2">
            <StatusBadge status={status} />
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export default memo(AgentNodeComponent)
