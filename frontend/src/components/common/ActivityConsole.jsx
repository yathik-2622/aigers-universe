import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Terminal } from 'lucide-react'
import CodeSnippet from './CodeSnippet.jsx'

function coerceLog(item, index) {
  if (typeof item === 'string') {
    return { id: `log-${index}`, tone: 'info', label: 'Event', detail: item }
  }
  const tone = item?.tone || item?.status || item?.level || (item?.error ? 'error' : 'info')
  return {
    id: item?.id || item?.message_id || `log-${index}`,
    tone,
    label: item?.label || item?.stage || item?.tool || item?.type || `Step ${index + 1}`,
    detail: item?.detail || item?.message || item?.text || item?.summary || '',
    payload: item?.payload || item?.result || item?.args || item?.data || null,
    timestamp: item?.timestamp || item?.created_at || item?.time || '',
  }
}

function toolLabel(item) {
  const label = item.label || 'System'
  if (item.tone === 'tool' && item.payload?.tool) return item.payload.tool
  return String(label).replace(/_/g, ' ')
}

function statusText(items, active) {
  if (!active && items.length > 0) return `Complete - ${items.length} steps`
  if (!items.length) return active ? 'Thinking...' : 'No activity yet'
  const last = items[items.length - 1]
  if (last.tone === 'tool') return `Using tool: ${toolLabel(last)}...`
  if (last.tone === 'warn') return `Waiting: ${last.label || 'input needed'}`
  if (last.tone === 'bad' || last.tone === 'error') return `Issue: ${last.label || 'failed'}`
  return `${last.label || 'Thinking'}...`
}

function toneTextClass(tone) {
  if (['ok', 'success', 'completed'].includes(tone)) return 'text-emerald-300'
  if (['bad', 'error', 'failed'].includes(tone)) return 'text-rose-300'
  if (['warn', 'warning'].includes(tone)) return 'text-amber-300'
  if (['tool', 'data', 'search'].includes(tone)) return 'text-violet-300'
  return 'text-cyan-300'
}

export default function ActivityConsole({ title = 'Activity Console', subtitle = 'Live operational trace', logs = [], active = false, compact = false }) {
  const [open, setOpen] = useState(false)
  const scrollRef = useRef(null)
  const items = useMemo(() => logs.map(coerceLog), [logs])

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [items.length, active])

  return (
    <div className={`overflow-hidden rounded-xl border border-white/10 bg-black/[0.14] backdrop-blur ${active ? 'border-cyan-300/30' : ''}`}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-white/[0.035]">
        <div className="flex min-w-0 items-center gap-2">
          {open ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
          <div className="min-w-0">
            <div className={`truncate text-[12px] font-medium ${active ? 'bg-gradient-to-r from-cyan-200 to-blue-400 bg-clip-text text-transparent' : 'text-muted'}`}>
              {statusText(items, active)}
            </div>
            <div className="mt-0.5 truncate text-[10px] uppercase tracking-[0.18em] text-white/35">{title}{subtitle ? ` - ${subtitle}` : ''}</div>
          </div>
          {active && <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,0.9)] animate-pulse" />}
        </div>
        <span className="shrink-0 rounded-md bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-white/40">{items.length} steps</span>
      </button>
      {open && (
        <div
          ref={scrollRef}
          role="log"
          aria-label={title}
          className={`${compact ? 'max-h-[220px]' : 'max-h-[360px]'} overflow-auto border-t border-white/10 bg-[#05070b]/45 px-3 py-3 font-mono`}
        >
          {items.length === 0 && <div className="text-[12px] text-white/40">Waiting for backend activity...</div>}
          <div className="space-y-2.5">
            {items.map((item, index) => (
              <div key={item.id} className="animate-[fadeIn_0.25s_ease]">
                <div className="flex items-start gap-2.5 text-[12px] leading-5">
                  <Terminal size={12} className="mt-1 shrink-0 text-white/35" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-white/25">{String(index + 1).padStart(2, '0')}</span>
                      <span className={`font-semibold ${toneTextClass(item.tone)}`}>[{toolLabel(item)}]</span>
                      {item.timestamp && <span className="text-white/25">{String(item.timestamp).slice(11, 19)}</span>}
                    </div>
                    {item.detail && <TypewriterLine text={item.detail} active={active} className="mt-0.5 whitespace-pre-wrap text-white/58" />}
                    {item.payload && (
                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-[11px] text-white/35 hover:text-cyan-200">payload</summary>
                        <div className="mt-1.5">
                          <CodeSnippet code={JSON.stringify(item.payload, null, 2)} language="json" />
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {active && (
              <div className="flex items-center gap-2 text-[12px] text-white/45">
                <Loader2 size={12} className="animate-spin text-cyan-300" />
                <span>Processing next step...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TypewriterLine({ text, active = false, className = '' }) {
  const [visible, setVisible] = useState('')
  useEffect(() => {
    const value = String(text || '')
    if (!active) {
      setVisible(value)
      return undefined
    }
    setVisible('')
    if (!value) return undefined
    let index = 0
    const timer = window.setInterval(() => {
      index += Math.max(1, Math.ceil(value.length / 90))
      setVisible(value.slice(0, index))
      if (index >= value.length) window.clearInterval(timer)
    }, 12)
    return () => window.clearInterval(timer)
  }, [text, active])
  return <div className={className}>{visible}{active && visible.length < String(text || '').length && <span className="animate-pulse text-cyan-300">▍</span>}</div>
}


