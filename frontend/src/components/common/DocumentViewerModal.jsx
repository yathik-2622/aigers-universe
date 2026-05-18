import React, { useEffect, useState } from 'react'
import { Download, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { getDocument } from '../../api/documents.js'
import MarkdownReport from './MarkdownReport.jsx'
import ModalShell from './ModalShell.jsx'

function toMarkdown(doc) {
  if (!doc) return '# Loading document...'
  const summary = [
    `# ${doc.filename}`,
    '',
    `- Document ID: \`${doc.document_id}\``,
    `- File type: \`${doc.file_type}\``,
    `- Text length: \`${doc.text_length}\` characters`,
    `- Chunks indexed: \`${doc.chunk_count}\``,
    '',
    '## Extracted Content',
    '',
    doc.text || '_No extracted text available._',
  ]
  return summary.join('\n')
}

export default function DocumentViewerModal({ documentId, open, onClose }) {
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !documentId) return
    setLoading(true)
    getDocument(documentId)
      .then(setDoc)
      .catch((err) => toast.error(err?.response?.data?.detail || 'Failed to open document'))
      .finally(() => setLoading(false))
  }, [open, documentId])

  const downloadText = () => {
    if (!doc?.text) return
    const blob = new Blob([doc.text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${(doc.filename || 'document').replace(/\.[^.]+$/, '')}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={doc?.filename || 'Document Preview'}
      subtitle="Readable extracted content for your uploaded workspace file."
      actions={(
        <>
          <div className="hidden sm:inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-2 text-xs text-accent">
            <Eye size={13} /> Workspace preview
          </div>
          <button onClick={downloadText} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-muted hover:text-ink">
            <Download size={14} /> Text
          </button>
        </>
      )}
    >
      <div className="p-6 bg-[radial-gradient(circle_at_top,rgba(0,240,255,0.1),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]">
        {loading ? (
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-8 text-sm text-muted">Loading extracted document content...</div>
        ) : (
          <div className="rounded-[24px] border border-white/10 bg-[#0a1020]/80 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <MarkdownReport markdown={toMarkdown(doc)} />
          </div>
        )}
      </div>
    </ModalShell>
  )
}
