import React from 'react'

function parseInline(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-elev/70 border border-line">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

export default function MarkdownReport({ markdown }) {
  const lines = markdown.split('\n')
  const blocks = []
  let list = []
  let code = []
  let inCode = false

  const flushList = () => {
    if (!list.length) return
    blocks.push({ type: 'list', items: list })
    list = []
  }

  lines.forEach((line) => {
    if (line.startsWith('```')) {
      flushList()
      if (inCode) {
        blocks.push({ type: 'code', text: code.join('\n') })
        code = []
        inCode = false
      } else {
        inCode = true
      }
      return
    }
    if (inCode) {
      code.push(line)
      return
    }
    if (line.startsWith('- ')) {
      list.push(line.slice(2))
      return
    }
    flushList()
    if (!line.trim()) {
      blocks.push({ type: 'space' })
    } else if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4) })
    } else if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3) })
    } else if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', text: line.slice(2) })
    } else {
      blocks.push({ type: 'p', text: line })
    }
  })
  flushList()

  return (
    <div className="space-y-3 text-[14px] leading-7 text-ink">
      {blocks.map((block, idx) => {
        if (block.type === 'space') return <div key={idx} className="h-1" />
        if (block.type === 'h1') return <h1 key={idx} className="font-display text-2xl tracking-tight" dangerouslySetInnerHTML={{ __html: parseInline(block.text) }} />
        if (block.type === 'h2') return <h2 key={idx} className="font-display text-xl tracking-tight pt-2" dangerouslySetInnerHTML={{ __html: parseInline(block.text) }} />
        if (block.type === 'h3') return <h3 key={idx} className="font-semibold text-base pt-1" dangerouslySetInnerHTML={{ __html: parseInline(block.text) }} />
        if (block.type === 'list') {
          return (
            <ul key={idx} className="list-disc pl-5 space-y-1 text-muted">
              {block.items.map((item, itemIdx) => <li key={itemIdx} dangerouslySetInnerHTML={{ __html: parseInline(item) }} />)}
            </ul>
          )
        }
        if (block.type === 'code') return <pre key={idx} className="rounded-xl border border-line bg-elev/60 p-4 overflow-x-auto text-[12px] font-mono text-muted whitespace-pre-wrap">{block.text}</pre>
        return <p key={idx} className="text-muted" dangerouslySetInnerHTML={{ __html: parseInline(block.text) }} />
      })}
    </div>
  )
}
