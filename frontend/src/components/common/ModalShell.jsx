import React from 'react'
import { X } from 'lucide-react'

export default function ModalShell({ open, onClose, title, subtitle, actions, children, width = 'max-w-4xl' }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#04040a]/72 backdrop-blur-md p-4" onClick={onClose}>
      <div className={`w-full ${width} max-h-[90vh] overflow-hidden rounded-[28px] border border-white/10 bg-[#0f1324]/95 shadow-[0_30px_120px_rgba(0,0,0,0.45)]`} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-white/10 bg-[linear-gradient(120deg,rgba(0,240,255,0.12),rgba(138,92,246,0.12),transparent)] flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-display text-xl tracking-tight">{title}</div>
            {subtitle && <div className="text-sm text-muted mt-1">{subtitle}</div>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {actions}
            <button onClick={onClose} className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 p-2 text-muted hover:text-ink hover:border-accent/40">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="max-h-[calc(90vh-88px)] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
