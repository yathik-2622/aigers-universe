import React from 'react'
import ModalShell from './ModalShell.jsx'

export default function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', tone = 'danger' }) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      width="max-w-lg"
      title={title}
      subtitle={description}
      actions={(
        <>
          <button onClick={onClose} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-muted hover:text-ink">
            Cancel
          </button>
          <button onClick={onConfirm} className={`rounded-full px-4 py-2 text-sm font-medium text-white ${tone === 'danger' ? 'bg-[#ef476f]' : 'bg-accent'}`}>
            {confirmLabel}
          </button>
        </>
      )}
    >
      <div className="p-5 text-sm text-muted leading-7">
        This action updates platform state immediately. The related records remain auditable in Mongo-backed history where applicable.
      </div>
    </ModalShell>
  )
}
