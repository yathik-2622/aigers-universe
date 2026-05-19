import React from 'react'
import clsx from 'clsx'

const COLORS = {
  active: 'bg-ok/15 text-ok border-ok/30',
  inactive: 'bg-muted/15 text-muted border-muted/30',
  pending: 'bg-warn/15 text-warn border-warn/30',
  paused: 'bg-warn/15 text-warn border-warn/30',
  resuming: 'bg-accent/15 text-accent border-accent/30',
  running: 'bg-accent/15 text-accent border-accent/30',
  completed: 'bg-ok/15 text-ok border-ok/30',
  success: 'bg-ok/15 text-ok border-ok/30',
  failed: 'bg-bad/15 text-bad border-bad/30',
  stopped: 'bg-bad/15 text-bad border-bad/30',
  rejected: 'bg-bad/15 text-bad border-bad/30',
  approved: 'bg-ok/15 text-ok border-ok/30',
  HIGH: 'bg-bad/15 text-bad border-bad/30',
  MEDIUM: 'bg-warn/15 text-warn border-warn/30',
  LOW: 'bg-accent/15 text-accent border-accent/30',
}

export default function StatusBadge({ status, className }) {
  if (!status) return null
  const key = String(status)
  const color = COLORS[key] || 'bg-muted/15 text-muted border-muted/30'
  return (
    <span
      data-testid={`status-${key}`}
      className={clsx(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono uppercase border',
        color,
        className,
      )}
    >
      {(key === 'running' || key === 'pending' || key === 'paused' || key === 'resuming') && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {key}
    </span>
  )
}
